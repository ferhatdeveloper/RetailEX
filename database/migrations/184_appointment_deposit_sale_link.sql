-- ============================================================================
-- Migration 184: Beauty Appointment + Deposit/Sale bağlantı kolonları
-- ----------------------------------------------------------------------------
-- Plan referansı:
--   beauty-pesinat-sales-fatura-plani.md §2.2 (appointment tarafı)
--
-- Amaç:
--   `beauty.rex_<firmNr>_<periodNr>_beauty_appointments` tablosuna peşinat
--   sales fişine referans veren kolonları ekle. Bu sayede:
--     - Randevuya tekrar girildiğinde daha önce alınmış peşinat tutarı,
--       fiş no ve grup bağlantısı görünür kalır.
--     - POS Ödeme Al modalı kalan tutarı doğru hesaplar.
--     - Ana sales fişi ile peşinat sales fişi aynı grupta toplanır.
--
-- Yeni kolonlar (her beauty.rex_<firmNr>_<periodNr>_beauty_appointments tablosuna):
--   deposit_sale_id        UUID         — peşinat sales fişi (BEAUTY-PESINAT-*)
--   deposit_sale_fiche_no  TEXT         — peşinat sales fiche_no (kolay görüntüleme)
--   sale_group_id          TEXT/UUID    — peşinat + ana satışı gruplar
--   remainder_paid_amount  NUMERIC(15,2) — kalan ödendiğinde güncellenir
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- Tauri uyumu: DO $$ YOK, her ifade ayrı.
-- ============================================================================

-- Örnek tek-DB ALTER — çoklu uygulama için
--   node database/scripts/apply-appointment-deposit-link-184.mjs --apply
-- scripti kullanılmalıdır.
ALTER TABLE beauty.rex_001_01_beauty_appointments
  ADD COLUMN IF NOT EXISTS deposit_sale_id        UUID,
  ADD COLUMN IF NOT EXISTS deposit_sale_fiche_no  TEXT,
  ADD COLUMN IF NOT EXISTS sale_group_id          TEXT,
  ADD COLUMN IF NOT EXISTS remainder_paid_amount  NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS rex_001_01_beauty_appointments_deposit_idx
  ON beauty.rex_001_01_beauty_appointments (deposit_sale_id);

CREATE INDEX IF NOT EXISTS rex_001_01_beauty_appointments_group_idx
  ON beauty.rex_001_01_beauty_appointments (sale_group_id);