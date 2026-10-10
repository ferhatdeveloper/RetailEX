-- ============================================================================
-- Migration 207: message_templates (firma kart) 4-dil birleşik yapı
-- ----------------------------------------------------------------------------
-- Amaç:
--   * WP mesaj şablonları tek tek dil başına ayrı satır olarak tutuluyordu
--     (örn. 171: Valentine KU / Valentine AR ayrı iki şablon).
--   * "Birleştirilmiş halde" = tek bir şablon satırında 4 dilde çeviri
--     kolonları: body_text_tr / body_text_en / body_text_ar / body_text_ku.
--   * Mevcut `body_text` korunur (geriye uyumluluk) ve `body_text_tr` ile
--     eşlenir. Yeni eklenen birleşik şablonlarda 4 dil doldurulur.
--   * Recipient gönderimi sırasında müşteri/carinin diline göre uygun
--     kolon seçilir (fallback: ku → ar → en → tr).
--
-- Değişiklikler:
--   * `public.rex_<firmNr>_message_templates` tablosuna dil kolonları eklenir:
--       body_text_tr TEXT, body_text_en TEXT, body_text_ar TEXT, body_text_ku TEXT
--     + aynısı başlık (headline) için: headline_tr/en/ar/ku.
--   * Geriye uyumluluk backfill:
--       - Mevcut `body_text` ⇒ body_text_tr'e kopyalanır (TR fallback).
--   * Yeni birleşik seed şablonları (KU+AR+TR+EN birlikte) oluşturulur:
--       category='general' (müşteri/carinin diline göre seçim).
-- ============================================================================

DO $do$
DECLARE
  v_prefix TEXT;
BEGIN
  FOR v_prefix IN
    SELECT lower('rex_' || firm_nr) FROM public.firms WHERE COALESCE(is_active, true)
  LOOP
    -- Dil kolonları
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS body_text_tr TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS body_text_en TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS body_text_ar TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS body_text_ku TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS headline_tr TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS headline_en TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS headline_ar TEXT', v_prefix || '_message_templates');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS headline_ku TEXT', v_prefix || '_message_templates');

    -- Geriye uyumlu backfill: eski body_text varsa TR olarak işaretle
    EXECUTE format(
      'UPDATE public.%I SET body_text_tr = body_text WHERE body_text_tr IS NULL AND body_text IS NOT NULL',
      v_prefix || '_message_templates'
    );

    -- Müşteri/carinin tercih ettiği dil (WP mesajlarında kullanılır)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS lang VARCHAR(5)',
      v_prefix || '_customers'
    );
  END LOOP;
END $do$;

-- ============================================================================
-- 2) Birleşik şablon seed (4 dil bir arada tek satır)
-- ============================================================================
-- Sabit UUID'ler: WP_template namespace `c1xxxxxx-...`
-- Şablonlar:
--   c1000001 → Genel Müşteri Karşılama
--   c1000002 → Randevu Hatırlatma
--   c1000003 → Ödeme Hatırlatma
-- ============================================================================

DO $do2$
DECLARE
  v_prefix TEXT;
  v_fn TEXT;
  v_tpl TEXT;
  v_sql TEXT;
BEGIN
  FOR v_prefix IN
    SELECT lower('rex_' || firm_nr) FROM public.firms WHERE COALESCE(is_active, true)
  LOOP
    v_fn := lpad(split_part(v_prefix, '_', 2), 3, '0');
    v_tpl := v_prefix || '_message_templates';

    -- Genel müşteri karşılama (4 dil)
    v_sql := format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, body_text_tr, body_text_en, body_text_ar, body_text_ku, category, is_active)
       VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET
         body_text_tr = EXCLUDED.body_text_tr,
         body_text_en = EXCLUDED.body_text_en,
         body_text_ar = EXCLUDED.body_text_ar,
         body_text_ku = EXCLUDED.body_text_ku,
         body_text = EXCLUDED.body_text_tr,
         name = EXCLUDED.name,
         updated_at = CURRENT_TIMESTAMP',
      v_tpl,
      'c1000001-bbbb-4bbb-8bbb-000000000001', v_fn,
      'Genel Müşteri Karşılama',
      'Merhaba {customer_name}, sizinle iletişime geçmek istedik. RetailEX',
      'Merhaba {customer_name}, sizinle iletişime geçmek istedik. RetailEX',
      'Hello {customer_name}, we would like to get in touch with you. RetailEX',
      'مرحباً {customer_name}، نود التواصل معك. RetailEX',
      'سڵاو {customer_name}، دەمانەوێت پەیوەندیت پێوە بکەین. RetailEX',
      'general'
    );
    BEGIN EXECUTE v_sql; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Randevu hatırlatma (4 dil)
    v_sql := format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, body_text_tr, body_text_en, body_text_ar, body_text_ku, category, is_active)
       VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET
         body_text_tr = EXCLUDED.body_text_tr,
         body_text_en = EXCLUDED.body_text_en,
         body_text_ar = EXCLUDED.body_text_ar,
         body_text_ku = EXCLUDED.body_text_ku,
         body_text = EXCLUDED.body_text_tr,
         name = EXCLUDED.name,
         updated_at = CURRENT_TIMESTAMP',
      v_tpl,
      'c1000001-bbbb-4bbb-8bbb-000000000002', v_fn,
      'Randevu Hatırlatma',
      'Merhaba {customer_name}, {date} tarihinde saat {time} için randevunuz bulunmaktadır. RetailEX',
      'Merhaba {customer_name}, {date} tarihinde saat {time} için randevunuz bulunmaktadır. RetailEX',
      'Hello {customer_name}, you have an appointment on {date} at {time}. RetailEX',
      'مرحباً {customer_name}، لديك موعد بتاريخ {date} الساعة {time}. RetailEX',
      'سڵاو {customer_name}، لە {date} کاتژمێر {time} خزمەتگوزارییەکەت هەیە. RetailEX',
      'general'
    );
    BEGIN EXECUTE v_sql; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Ödeme hatırlatma (4 dil)
    v_sql := format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, body_text_tr, body_text_en, body_text_ar, body_text_ku, category, is_active)
       VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET
         body_text_tr = EXCLUDED.body_text_tr,
         body_text_en = EXCLUDED.body_text_en,
         body_text_ar = EXCLUDED.body_text_ar,
         body_text_ku = EXCLUDED.body_text_ku,
         body_text = EXCLUDED.body_text_tr,
         name = EXCLUDED.name,
         updated_at = CURRENT_TIMESTAMP',
      v_tpl,
      'c1000001-bbbb-4bbb-8bbb-000000000003', v_fn,
      'Ödeme Hatırlatma',
      'Sayın {customer_name}, {date} vadesine kadar ödemeniz beklenmektedir. RetailEX',
      'Sayın {customer_name}, {date} vadesine kadar ödemeniz beklenmektedir. RetailEX',
      'Dear {customer_name}, your payment is expected by {date}. RetailEX',
      'عزيزي {customer_name}، يُتوقع سدادك قبل {date}. RetailEX',
      'ڕێزدار {customer_name}، پارەدان پێش {date} چاوەڕوان دەکرێت. RetailEX',
      'general'
    );
    BEGIN EXECUTE v_sql; EXCEPTION WHEN OTHERS THEN NULL; END;

  END LOOP;
END $do2$;

NOTIFY pgrst, 'reload schema';
