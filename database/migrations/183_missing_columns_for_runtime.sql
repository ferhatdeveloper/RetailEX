-- ============================================================================
-- Migration 183: Eksik şema kolonları (canlı sistem hata düzeltmeleri)
-- ----------------------------------------------------------------------------
-- Kök neden:
--   Canlı sistemde (uzak PG `retailex_demo`) 4 farklı SQL hatası:
--     1) `listInProgressAppointments` → `column rs.color does not exist`
--        (rex_*_services.color kolonu yok)
--     2) `getCustomerOutstandingInvoices` → `column "currency" does not exist`
--        (beauty.rex_*_*_beauty_sales.currency kolonu yok)
--     3) `getCustomerOutstandingInvoices` → `column "paid_amount" does not exist`
--        (rex_*_*_sales.paid_amount kolonu yok; `credit_amount` mevcut)
--     4) `service_staff_commissions` PostgREST 400 — tenant'ta tablo yok
--
-- Bu migration ŞEMA katmanını düzeltir; kod tarafındaki sorgular da ayrıca
-- güncellendi (rs.color kaldırıldı vb.).
--
-- Politikalar:
--   * Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
--   * Geriye dönük uyumluluk: yeni kolonlar nullable ya da DEFAULT değerli
--   * DO $$ ... $$ BLOKLARI KULLANILMAMIŞTIR (Tauri Rust parser uyumu)
--   * Çoklu firm/period için apply script'i ile uygulanır
--     (apply-missing-columns-183.mjs)
-- ============================================================================

SET search_path TO public;

-- ============================================================================
-- 1) sales.paid_amount ekle
-- ----------------------------------------------------------------------------
-- `rex_<firmNr>_<periodNr>_sales` tabloları CREATE_PERIOD_TABLES tarafından
-- `credit_amount` ile yaratılıyor; POS ödeme / cari tahsilat tarafı
-- `paid_amount` bekliyor (faturaya yazılan ödeme toplamı).
--
-- İlişki:
--   - paid_amount   : tahsil edilen tutar (kümülatif)
--   - credit_amount : kalan veresiye bakiyesi (negatif yönde hareket)
--   - total_gross   : toplam fatura tutarı
-- Geriye dönük uyum: paid_amount = total_gross − credit_amount ile
-- doldurulur (eski satırlar).
-- ============================================================================

-- Örnek ALTER (tek bir tablo için):
ALTER TABLE rex_001_01_sales
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Geriye dönük uyumlu doldurma (paid_amount yoksa total_gross − credit_amount
-- yaz; ama zaten default 0 olduğu için sadece eski satırlarda pay > 0 ve
-- credit > 0 ise düzeltme gerekli).
UPDATE rex_001_01_sales
   SET paid_amount = GREATEST(0, COALESCE(total_gross, 0) - COALESCE(credit_amount, 0))
 WHERE paid_amount = 0
   AND (COALESCE(total_gross, 0) - COALESCE(credit_amount, 0)) > 0.005;

-- ============================================================================
-- 2) beauty.rex_*_*_beauty_sales.currency ekle
-- ----------------------------------------------------------------------------
-- beauty_sales tablosu master şemada `paid_amount`/`remaining_amount` içeriyor
-- ama `currency` yok. POS ödeme kırılımı payments[].currency kullanıyor;
-- `getCustomerOutstandingInvoices` ise `COALESCE(currency, 'IQD')` ile
-- çekiyor → kolon yoksa hata.
-- ============================================================================

-- Örnek ALTER (tek bir beauty_sales tablosu için):
ALTER TABLE beauty.rex_001_01_beauty_sales
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'IQD';

-- ============================================================================
-- 3) beauty.rex_*_service_staff_commissions tablosu (eksik tenant'lar için)
-- ----------------------------------------------------------------------------
-- Bazı tenant'larda INIT_BEAUTY_FIRM_TABLES hiç çağrılmamış veya yarıda
-- kalmış; sonuç olarak service_staff_commissions tablosu yok. Bu tablo hem
-- PostgREST 400 veriyor hem de specialist × service komisyon oranı
-- sorgularını kırıyor.
--
-- INIT_BEAUTY_FIRM_TABLES ile aynı yapı:
--   - service_id UUID → beauty.rex_*_beauty_services(id) ON DELETE CASCADE
--   - staff_id   UUID → beauty.rex_*_beauty_specialists(id) ON DELETE CASCADE
--   - percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK 0..100
--   - is_active, notes, created_at, updated_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS beauty.rex_001_service_staff_commissions (
  service_id UUID NOT NULL REFERENCES beauty.rex_001_beauty_services(id) ON DELETE CASCADE,
  staff_id   UUID NOT NULL REFERENCES beauty.rex_001_beauty_specialists(id) ON DELETE CASCADE,
  percent    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, staff_id)
);

CREATE INDEX IF NOT EXISTS rex_001_service_staff_commissions_srv_active_idx
  ON beauty.rex_001_service_staff_commissions (service_id) WHERE is_active = true;

-- ============================================================================
-- 4) rex_*_services.color (Hata 1 — KOD İLE çözüldü)
-- ----------------------------------------------------------------------------
-- Bu kolon master şemada YOK ve güzellik dışı modüller için anlamlı
-- değil (services tablosu ürün/malzeme kartı). JOIN'deki `rs.color`
-- referansı kaldırıldı → bs.color zaten beauty_services'tan geliyor.
-- Bu yüzden bu migration kolon EKLEMİYOR (geriye dönük uyumlu, sıfır etki).
-- ============================================================================

-- ============================================================================
-- Uygulama notu
-- ----------------------------------------------------------------------------
-- Çoklu tenant/firm/period uygulaması için:
--   node database/scripts/apply-missing-columns-183.mjs --apply
-- script'i kullanılmalı; her firm/period tablosuna ayrı ALTER uygular,
-- idempotent'tır, dry-run destekler ve config.db üzerinden
-- RetailEX dışı veritabanlarını (ilsasupport, pagetin_kurye, siti_pdks,
-- aram, naw, arzen, sitigroup) filtreler.
-- ============================================================================