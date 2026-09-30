-- ============================================================================
-- Migration 182: Peşinat → Ayrı Satış Faturası (Sales Link)
-- ----------------------------------------------------------------------------
-- Plan referansı:
--   beauty-pesinat-sales-fatura-plani.md §2.1
--
-- Amaç:
--   `sales` tablosuna peşinat / ana satış bağlantı kolonları ekle. Peşinat
--   kendi başına bir `sales` (veya beauty-specific sales) kaydı olacak; ana
--   satışa `parent_sale_id` üzerinden bağlanacak. "Bu müşteri/fiş için daha
--   önce ne ödendi?" sorusu `fiche_no` ile yanıtlanacak.
--
-- Yeni kolonlar (her rex_<firmNr>_<periodNr>_sales tablosuna):
--   linked_appointment_id UUID  — bağlı beauty randevusu (nullable)
--   deposit_sale_id      UUID  — peşinat fişi (ana satıştan bakış)
--   parent_sale_id       UUID  — ana satış (peşinattan bakış)
--   sale_group_id        UUID  — peşinat + ana satışı gruplar
--   is_deposit           BOOLEAN NOT NULL DEFAULT false
--
-- İndeksler:
--   <tbl>_appointment_idx (linked_appointment_id)
--   <tbl>_group_idx      (sale_group_id)
--   <tbl>_parent_idx     (parent_sale_id)
--   <tbl>_isdeposit_idx  (is_deposit)
--
-- Önemli:
--   * Bu dosya TEK bir DB üzerinde manuel `psql -f` ile çalıştırılabilir
--     (örnek olarak rex_001_01_sales).
--   * Gerçek multi-DB uygulama için:
--       node database/scripts/apply-pesinat-sale-link.mjs --apply
--     script'i kullanılmalı; her firm/period tablosuna ayrı ALTER uygular,
--     idempotent'tır, dry-run destekler ve config.db üzerinden
--     RetailEX dışı veritabanlarını (ilsasupport, pagetin_kurye, siti_pdks,
--     aram, naw, arzen, sitigroup) filtreler.
--   * DO $$ ... $$ BLOKLARI KULLANILMAMIŞTIR (Tauri Rust parser uyumu).
--   * Tüm ifadeler IF NOT EXISTS korumalıdır (idempotent).
--   * Eski satırlar etkilenmez: yeni kolonlar nullable ya da DEFAULT false.
-- ============================================================================

SET search_path TO public;

-- ----------------------------------------------------------------------------
-- Örnek ALTER — tek bir DB üzerinde psql -f ile çalıştırmak için.
-- Çoklu firm/period uygulaması için apply-pesinat-sale-link.mjs scriptine
-- bakın.
-- ----------------------------------------------------------------------------
ALTER TABLE rex_001_01_sales
  ADD COLUMN IF NOT EXISTS linked_appointment_id UUID,
  ADD COLUMN IF NOT EXISTS deposit_sale_id      UUID,
  ADD COLUMN IF NOT EXISTS parent_sale_id       UUID,
  ADD COLUMN IF NOT EXISTS sale_group_id        UUID,
  ADD COLUMN IF NOT EXISTS is_deposit           BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS rex_001_01_sales_appointment_idx
  ON rex_001_01_sales (linked_appointment_id);
CREATE INDEX IF NOT EXISTS rex_001_01_sales_group_idx
  ON rex_001_01_sales (sale_group_id);
CREATE INDEX IF NOT EXISTS rex_001_01_sales_parent_idx
  ON rex_001_01_sales (parent_sale_id);
CREATE INDEX IF NOT EXISTS rex_001_01_sales_isdeposit_idx
  ON rex_001_01_sales (is_deposit);

NOTIFY pgrest, 'reload schema';
