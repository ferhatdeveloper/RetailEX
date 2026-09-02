-- ============================================================================
-- Migration 125: Default print design bindings + print_design_translations
-- ============================================================================
-- Yeni başlayan kiracılar için public.print_design_bindings tablosuna
-- her aktif firma × scope kombinasyonu için varsayılan design binding seed'le.
-- Bu sayede kiracı hemen FastReport veya design_center şablonlarıyla
-- yazdırma yapabilsin; tasarımcıdan özelleştirene kadar hazır şablon
-- kullanılsın.
--
-- Strateji:
--   1. public.report_templates içinde template_type='fastreport_frx' olan
--      sistem şablonları (firm_nr IS NULL) aranır. Varsa onların id'si
--      design_id olarak kullanılır.
--   2. Yoksa design_kind='builtin' olarak seed'lenir (design_id NULL).
--   3. public.firms tablosundaki tüm aktif firmalar için
--      ON CONFLICT (firm_nr, scope) DO NOTHING ile eklenir.
--
-- Ayrıca 4-dilli (tr/en/ar/ku) etiket sözlüğü public.print_design_translations
-- tablosuna seed'lenir. Web/Mobil payload.translations alanı bu tablodan
-- beslenir; C# PrintServer ve Node worker bu sözlüğü kullanır.
--
-- Idempotent: ON CONFLICT ile tekrar çalıştırılabilir.
-- Şema: 000_master_schema.sql (firms + print_design_bindings) + 110 + 124
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) print_design_bindings tablosu yoksa oluştur (124 yok sayılmış ortamlar)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.print_design_bindings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr     VARCHAR(10) NOT NULL,
    scope       VARCHAR(64) NOT NULL,
    design_kind VARCHAR(32) NOT NULL DEFAULT 'fastreport_frx',
    design_id   UUID,
    design_ref  TEXT,
    design_name TEXT,
    is_active   BOOLEAN DEFAULT true,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, scope),
    CONSTRAINT print_design_bindings_design_kind_chk
      CHECK (design_kind IN ('fastreport_frx', 'design_center', 'builtin'))
);

CREATE INDEX IF NOT EXISTS idx_print_design_bindings_firm_active
  ON public.print_design_bindings (firm_nr, is_active, scope);

-- ----------------------------------------------------------------------------
-- 1) Çeviri payload tablosu (payload.translations kaynağı)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.print_design_translations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr     VARCHAR(10) NOT NULL,
    locale      VARCHAR(8) NOT NULL,                  -- tr / en / ar / ku
    key         VARCHAR(64) NOT NULL,                 -- kitchenHeader, total, table, vb.
    value       TEXT NOT NULL,
    source      VARCHAR(16) DEFAULT 'system',         -- system | operator | import
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, locale, key)
);

CREATE INDEX IF NOT EXISTS idx_print_design_translations_firm_locale
  ON public.print_design_translations (firm_nr, locale);

COMMENT ON TABLE public.print_design_translations IS
  'Print tasarımları için 4-dilli (tr/en/ar/ku) etiket sözlüğü. payload.translations alanı bu tablodan beslenir; C# PrintServer ve Node worker tarafından okunur.';

COMMENT ON COLUMN public.print_design_translations.source IS
  'system = RetailEX varsayılanı | operator = kullanıcı özelleştirmesi | import = dış kaynak import';

-- ----------------------------------------------------------------------------
-- 2) firms tablosu yoksa (sıfır kurulum) oluştur
-- 000_master_schema.sql'de firms zaten var; bu blok yalnızca fallback'tir.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'firms'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.firms (
      code      VARCHAR(10) PRIMARY KEY,
      name      TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true
    );
    INSERT INTO public.firms (code, name, is_active) VALUES
      ('001', 'Demo Firma 1', true),
      ('002', 'Demo Firma 2', true)
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) print_design_bindings seed (her aktif firma × scope, idempotent)
--    Önce report_templates içinde sistem şablonu var mı bak; yoksa builtin.
-- ----------------------------------------------------------------------------
WITH
  -- Her scope için sistem şablonu ara (firm_nr IS NULL + template_type='fastreport_frx'
  -- ve adı scope ile eşleşen bir önek içeren şablon). Bulunamazsa NULL döner.
  scope_template AS (
    SELECT
      s.scope,
      (
        SELECT rt.id
        FROM public.report_templates rt
        WHERE rt.template_type = 'fastreport_frx'
          AND rt.firm_nr IS NULL
          AND (
            rt.name ILIKE '%' || s.scope || '%'
            OR rt.name ILIKE '%' || REPLACE(s.scope, '_', '') || '%'
          )
        ORDER BY rt.is_default DESC, rt.created_at ASC
        LIMIT 1
      ) AS design_id,
      (
        SELECT rt.name
        FROM public.report_templates rt
        WHERE rt.template_type = 'fastreport_frx'
          AND rt.firm_nr IS NULL
          AND (
            rt.name ILIKE '%' || s.scope || '%'
            OR rt.name ILIKE '%' || REPLACE(s.scope, '_', '') || '%'
          )
        ORDER BY rt.is_default DESC, rt.created_at ASC
        LIMIT 1
      ) AS design_name
    FROM (VALUES
      ('kitchen_ticket'),
      ('account_receipt'),
      ('pos_receipt'),
      ('invoice_sales'),
      ('cash_voucher')
    ) AS s(scope)
  ),
  active_firms AS (
    SELECT firm_nr
    FROM public.firms
    WHERE is_active = true
  )
INSERT INTO public.print_design_bindings
  (firm_nr, scope, design_kind, design_id, design_ref, design_name, is_active, updated_at)
SELECT
  f.firm_nr,
  st.scope,
  CASE WHEN st.design_id IS NOT NULL THEN 'fastreport_frx' ELSE 'builtin' END
    AS design_kind,
  st.design_id,
  NULL::TEXT AS design_ref,
  COALESCE(st.design_name, 'RetailEX Default — ' || st.scope) AS design_name,
  true AS is_active,
  NOW() AS updated_at
FROM active_firms f
CROSS JOIN scope_template st
ON CONFLICT (firm_nr, scope) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4) print_design_translations seed (49 anahtar × 4 dil = 196 satır / firma)
--    Kaynak: src/locales/printKeys.ts (tek doğruluk kaynağı)
-- ----------------------------------------------------------------------------
INSERT INTO public.print_design_translations (firm_nr, locale, key, value, source)
SELECT
  f.firm_nr,
  d.locale,
  d.key,
  d.value,
  'system'
FROM public.firms f
CROSS JOIN (
  VALUES
    -- tr
    ('tr', 'kitchenHeader',       'MUTFAK'),
    ('tr', 'kitchenFooter',       'İyi çalışmalar'),
    ('tr', 'accountHeader',       'CARİ HESAP'),
    ('tr', 'posHeader',           'POS FİŞİ'),
    ('tr', 'invoiceHeader',       'FATURA'),
    ('tr', 'cashVoucherHeader',   'TAHSİLAT FİŞİ'),
    ('tr', 'table',               'Masa'),
    ('tr', 'floor',               'Salon'),
    ('tr', 'waiter',              'Garson'),
    ('tr', 'orderNo',             'Sipariş No'),
    ('tr', 'orderNote',           'Not'),
    ('tr', 'date',                'Tarih'),
    ('tr', 'time',                'Saat'),
    ('tr', 'itemCount',           'Adet'),
    ('tr', 'itemName',            'Ürün'),
    ('tr', 'unitPrice',           'Birim Fiyat'),
    ('tr', 'lineTotal',           'Tutar'),
    ('tr', 'subtotal',            'Ara Toplam'),
    ('tr', 'total',               'Toplam'),
    ('tr', 'discount',            'İskonto'),
    ('tr', 'tax',                 'KDV'),
    ('tr', 'grandTotal',          'Genel Toplam'),
    ('tr', 'paid',                'Ödenen'),
    ('tr', 'change',              'Para Üstü'),
    ('tr', 'thankYou',            'Teşekkür ederiz'),
    ('tr', 'openDrawer',          'Para Çekmecesi Aç'),
    ('tr', 'customer',            'Müşteri'),
    ('tr', 'supplier',            'Tedarikçi'),
    ('tr', 'balance',             'Bakiye'),
    ('tr', 'openingBalance',      'Devir'),
    ('tr', 'debit',               'Borç'),
    ('tr', 'credit',              'Alacak'),
    ('tr', 'invoiceNo',           'Fatura No'),
    ('tr', 'dateRange',           'Tarih Aralığı'),
    ('tr', 'documentType',        'Belge Tipi'),
    ('tr', 'quantity',            'Miktar'),
    ('tr', 'printerTest',         'Yazıcı Test Sayfası'),
    ('tr', 'emptyOrder',          '(Boş sipariş)'),
    ('tr', 'course',              'Sıra'),
    ('tr', 'orderType',           'Sipariş Tipi'),
    ('tr', 'takeaway',            'Paket'),
    ('tr', 'dineIn',              'Masa'),
    ('tr', 'delivery',            'Gel-Al'),
    ('tr', 'cut',                 'FİŞ KESİLDİ'),
    ('tr', 'copy',                'Kopya'),
    ('tr', 'kitchenFooter',       'İyi çalışmalar'),
    ('tr', 'accountFooter',       'Hesap özetiniz'),
    ('tr', 'posFooter',           'Yine bekleriz'),
    ('tr', 'invoiceFooter',       'İlginize teşekkür ederiz'),
    ('tr', 'cashVoucherFooter',   'Makbuz'),
    ('tr', 'currency',            'TL'),
    -- en
    ('en', 'kitchenHeader',       'KITCHEN'),
    ('en', 'kitchenFooter',       'Have a nice service'),
    ('en', 'accountHeader',       'ACCOUNT STATEMENT'),
    ('en', 'posHeader',           'POS RECEIPT'),
    ('en', 'invoiceHeader',       'INVOICE'),
    ('en', 'cashVoucherHeader',   'CASH VOUCHER'),
    ('en', 'table',               'Table'),
    ('en', 'floor',               'Floor'),
    ('en', 'waiter',              'Waiter'),
    ('en', 'orderNo',             'Order #'),
    ('en', 'orderNote',           'Note'),
    ('en', 'date',                'Date'),
    ('en', 'time',                'Time'),
    ('en', 'itemCount',           'Qty'),
    ('en', 'itemName',            'Item'),
    ('en', 'unitPrice',           'Unit Price'),
    ('en', 'lineTotal',           'Amount'),
    ('en', 'subtotal',            'Subtotal'),
    ('en', 'total',               'Total'),
    ('en', 'discount',            'Discount'),
    ('en', 'tax',                 'VAT'),
    ('en', 'grandTotal',          'Grand Total'),
    ('en', 'paid',                'Paid'),
    ('en', 'change',              'Change'),
    ('en', 'thankYou',            'Thank you'),
    ('en', 'openDrawer',          'Open Cash Drawer'),
    ('en', 'customer',            'Customer'),
    ('en', 'supplier',            'Supplier'),
    ('en', 'balance',             'Balance'),
    ('en', 'openingBalance',      'Opening'),
    ('en', 'debit',               'Debit'),
    ('en', 'credit',              'Credit'),
    ('en', 'invoiceNo',           'Invoice #'),
    ('en', 'dateRange',           'Date Range'),
    ('en', 'documentType',        'Document Type'),
    ('en', 'quantity',            'Quantity'),
    ('en', 'printerTest',         'Printer Test Page'),
    ('en', 'emptyOrder',          '(Empty order)'),
    ('en', 'course',              'Course'),
    ('en', 'orderType',           'Order Type'),
    ('en', 'takeaway',            'Takeaway'),
    ('en', 'dineIn',              'Dine-In'),
    ('en', 'delivery',            'Delivery'),
    ('en', 'cut',                 'RECEIPT CUT'),
    ('en', 'copy',                'Copy'),
    ('en', 'kitchenFooter',       'Have a nice service'),
    ('en', 'accountFooter',       'Account summary'),
    ('en', 'posFooter',           'See you again'),
    ('en', 'invoiceFooter',       'Thank you for your business'),
    ('en', 'cashVoucherFooter',   'Voucher'),
    ('en', 'currency',            'USD'),
    -- ar
    ('ar', 'kitchenHeader',       'المطبخ'),
    ('ar', 'kitchenFooter',       'بالتوفيق'),
    ('ar', 'accountHeader',       'كشف الحساب'),
    ('ar', 'posHeader',           'إيصال البيع'),
    ('ar', 'invoiceHeader',       'فاتورة'),
    ('ar', 'cashVoucherHeader',   'سند قبض'),
    ('ar', 'table',               'الطاولة'),
    ('ar', 'floor',               'الصالة'),
    ('ar', 'waiter',              'النادل'),
    ('ar', 'orderNo',             'رقم الطلب'),
    ('ar', 'orderNote',           'ملاحظة'),
    ('ar', 'date',                'التاريخ'),
    ('ar', 'time',                'الوقت'),
    ('ar', 'itemCount',           'الكمية'),
    ('ar', 'itemName',            'الصنف'),
    ('ar', 'unitPrice',           'سعر الوحدة'),
    ('ar', 'lineTotal',           'المبلغ'),
    ('ar', 'subtotal',            'المجموع الفرعي'),
    ('ar', 'total',               'الإجمالي'),
    ('ar', 'discount',            'خصم'),
    ('ar', 'tax',                 'ضريبة'),
    ('ar', 'grandTotal',          'المجموع الكلي'),
    ('ar', 'paid',                'المدفوع'),
    ('ar', 'change',              'الباقي'),
    ('ar', 'thankYou',            'شكراً لزيارتكم'),
    ('ar', 'openDrawer',          'فتح درج النقود'),
    ('ar', 'customer',            'العميل'),
    ('ar', 'supplier',            'المورد'),
    ('ar', 'balance',             'الرصيد'),
    ('ar', 'openingBalance',      'رصيد افتتاحي'),
    ('ar', 'debit',               'مدين'),
    ('ar', 'credit',              'دائن'),
    ('ar', 'invoiceNo',           'رقم الفاتورة'),
    ('ar', 'dateRange',           'الفترة الزمنية'),
    ('ar', 'documentType',        'نوع المستند'),
    ('ar', 'quantity',            'الكمية'),
    ('ar', 'printerTest',         'صفحة اختبار الطابعة'),
    ('ar', 'emptyOrder',          '(طلب فارغ)'),
    ('ar', 'course',              'الدورة'),
    ('ar', 'orderType',           'نوع الطلب'),
    ('ar', 'takeaway',            'سفري'),
    ('ar', 'dineIn',              'محلي'),
    ('ar', 'delivery',            'توصيل'),
    ('ar', 'cut',                 'تم قص الإيصال'),
    ('ar', 'copy',                'نسخة'),
    ('ar', 'kitchenFooter',       'بالتوفيق'),
    ('ar', 'accountFooter',       'ملخص الحساب'),
    ('ar', 'posFooter',           'نراك مجدداً'),
    ('ar', 'invoiceFooter',       'شكراً لتعاملكم معنا'),
    ('ar', 'cashVoucherFooter',   'سند'),
    ('ar', 'currency',            'د.ع'),
    -- ku (Kurmanji)
    ('ku', 'kitchenHeader',       'Metbex'),
    ('ku', 'kitchenFooter',       'Karê we bi xêr be'),
    ('ku', 'accountHeader',       'Hesabê Carî'),
    ('ku', 'posHeader',           'Fîşa POS'),
    ('ku', 'invoiceHeader',       'Faturê'),
    ('ku', 'cashVoucherHeader',   'Fîşa Wergirtinê'),
    ('ku', 'table',               'Masa'),
    ('ku', 'floor',               'Salon'),
    ('ku', 'waiter',              'Xulam'),
    ('ku', 'orderNo',             'Hejmarê Siparîşê'),
    ('ku', 'orderNote',           'Nîşe'),
    ('ku', 'date',                'Dîrok'),
    ('ku', 'time',                'Dem'),
    ('ku', 'itemCount',           'Hejmar'),
    ('ku', 'itemName',            'Berhem'),
    ('ku', 'unitPrice',           'Bahayê Yekeyî'),
    ('ku', 'lineTotal',           'Bi giştî'),
    ('ku', 'subtotal',            'Bêkêş'),
    ('ku', 'total',               'Bi giştî'),
    ('ku', 'discount',            'Kêmkirin'),
    ('ku', 'tax',                 'Bac'),
    ('ku', 'grandTotal',          'Bi giştî'),
    ('ku', 'paid',                'Dayîn'),
    ('ku', 'change',              'Veger'),
    ('ku', 'thankYou',            'Sipas ji bo serdanê'),
    ('ku', 'openDrawer',          'Deriyê Pere Ve Bike'),
    ('ku', 'customer',            'Mûşterî'),
    ('ku', 'supplier',            'Pêşkêşker'),
    ('ku', 'balance',             'Balans'),
    ('ku', 'openingBalance',      'Destpêk'),
    ('ku', 'debit',               'Borç'),
    ('ku', 'credit',              'Wergir'),
    ('ku', 'invoiceNo',           'Hejmara Faturê'),
    ('ku', 'dateRange',           'Dema Dîrokê'),
    ('ku', 'documentType',        'Cûreyê Belgeyê'),
    ('ku', 'quantity',            'Hejmar'),
    ('ku', 'printerTest',         'Rûpela Ceribandinê'),
    ('ku', 'emptyOrder',          '(Siparîşê vala)'),
    ('ku', 'course',              'Xwarin'),
    ('ku', 'orderType',           'Cûreyê Siparîşê'),
    ('ku', 'takeaway',            'Birln'),
    ('ku', 'dineIn',              'Li der'),
    ('ku', 'delivery',            'Gîhandin'),
    ('ku', 'cut',                 'Fîş hat birîn'),
    ('ku', 'copy',                'Kopî'),
    ('ku', 'kitchenFooter',       'Karê we bi xêr be'),
    ('ku', 'accountFooter',       'Kurteya hesabê'),
    ('ku', 'posFooter',           'Em hêvî dikin dîsa bibînin'),
    ('ku', 'invoiceFooter',       'Sipas ji bo karsaziya we'),
    ('ku', 'cashVoucherFooter',   'Belge'),
    ('ku', 'currency',            'IQD')
) AS d(locale, key, value)
WHERE f.is_active = true
ON CONFLICT (firm_nr, locale, key) DO NOTHING;

-- ============================================================================
-- Migration 125 tamamlandı.
-- Beklenen etki:
--   * Her aktif firma için 5 print_design_bindings satırı (varsayılan).
--   * Her aktif firma için 196 print_design_translations satırı (49 × 4 dil).
--   * Tekrar çalıştırılırsa ON CONFLICT ile no-op (idempotent).
-- ============================================================================
