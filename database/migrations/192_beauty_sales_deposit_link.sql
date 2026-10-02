-- ============================================================================
-- Migration 192: beauty.rex_<firmNr>_<periodNr>_beauty_sales bağlantı kolonları
-- ----------------------------------------------------------------------------
-- Plan referansı:
--   beauty-pesinat-sales-fatura-plani.md §2.1 (sales tarafı) — beauty_sales
--   eşdeğeri. Migration 182 `sales` tablosu için aynı kolonları eklemişti;
--   burada güzellik modülünün kendi `beauty_sales` tablosuna aynı bağlantı
--   kolonları eklenir.
--
-- Neden gerekli:
--   * Beauty randevudan alınan peşinat (`beautyService.createSale` ile
--     `skipErpAndLoyalty:true` ayrı bir sales fişi oluşturuluyor) →
--     randevuya bu fişin ID'si `linked_appointment_id` ile yazılmalı.
--   * Sonradan hizmet verildiğinde oluşan ana satış fişinde
--     `is_deposit = false`, `parent_sale_id = <peşinat id>` ile bağ kurulur.
--   * Raporlar / cari raporları: "bu fiş bir peşinat mı?" sorusu `is_deposit`
--     kolonundan yanıtlanır.
--
-- Yeni kolonlar (her beauty.rex_<firmNr>_<periodNr>_beauty_sales tablosuna):
--   linked_appointment_id UUID
--   deposit_sale_id      UUID
--   parent_sale_id       UUID
--   sale_group_id        UUID
--   is_deposit           BOOLEAN NOT NULL DEFAULT false
--
-- Tauri uyumu: DO $$ YOK, ayrı ALTER + CREATE INDEX ifadeleri.
-- İdempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Çoklu DB uygulaması için `npm run db:migrate` → schema_migrations üzerinden
-- otomatik çalıştırılır (RetailEX dışı DB'ler dışlanır).
-- ============================================================================

ALTER TABLE beauty.rex_001_01_beauty_sales
  ADD COLUMN IF NOT EXISTS linked_appointment_id UUID,
  ADD COLUMN IF NOT EXISTS deposit_sale_id      UUID,
  ADD COLUMN IF NOT EXISTS parent_sale_id       UUID,
  ADD COLUMN IF NOT EXISTS sale_group_id        UUID,
  ADD COLUMN IF NOT EXISTS is_deposit           BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS rex_001_01_beauty_sales_appointment_idx
  ON beauty.rex_001_01_beauty_sales (linked_appointment_id);
CREATE INDEX IF NOT EXISTS rex_001_01_beauty_sales_group_idx
  ON beauty.rex_001_01_beauty_sales (sale_group_id);
CREATE INDEX IF NOT EXISTS rex_001_01_beauty_sales_parent_idx
  ON beauty.rex_001_01_beauty_sales (parent_sale_id);
CREATE INDEX IF NOT EXISTS rex_001_01_beauty_sales_isdeposit_idx
  ON beauty.rex_001_01_beauty_sales (is_deposit);

NOTIFY pgrest, 'reload schema';