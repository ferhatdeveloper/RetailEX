-- wms.transfers: eski kurulumlarda firm_nr veya source/target_store_id eksik olabilir.

ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS fiche_no VARCHAR(50);
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS source_store_id UUID;
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS target_store_id UUID;
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE wms.transfers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'from_store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'source_store_id'
  ) THEN
    ALTER TABLE wms.transfers RENAME COLUMN from_store_id TO source_store_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'to_store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'target_store_id'
  ) THEN
    ALTER TABLE wms.transfers RENAME COLUMN to_store_id TO target_store_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'transfer_no'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wms' AND table_name = 'transfers' AND column_name = 'fiche_no'
  ) THEN
    ALTER TABLE wms.transfers RENAME COLUMN transfer_no TO fiche_no;
  END IF;
END $$;

UPDATE wms.transfers t
SET firm_nr = COALESCE(
  NULLIF(TRIM(t.firm_nr), ''),
  (SELECT s.firm_nr FROM public.stores s WHERE s.id = t.source_store_id LIMIT 1),
  '001'
)
WHERE t.firm_nr IS NULL OR TRIM(t.firm_nr) = '';

UPDATE wms.transfers
SET fiche_no = COALESCE(NULLIF(TRIM(fiche_no), ''), 'TRF-' || LEFT(id::text, 8))
WHERE fiche_no IS NULL OR TRIM(fiche_no) = '';

ALTER TABLE wms.transfers ALTER COLUMN firm_nr SET DEFAULT '001';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wms_transfers_firm_fiche
  ON wms.transfers (firm_nr, fiche_no)
  WHERE firm_nr IS NOT NULL AND fiche_no IS NOT NULL;
