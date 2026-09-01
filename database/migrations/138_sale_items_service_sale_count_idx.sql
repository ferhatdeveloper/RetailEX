-- 138 — Hizmet kartları satış fişi sayacı performans indeksi
-- serviceAPI.getAllWithSaleStats() sorgusu:
--   LEFT JOIN (
--     SELECT product_id, COUNT(DISTINCT invoice_id) ...
--       FROM sale_items
--      WHERE item_type = 'Hizmet'
--      GROUP BY product_id
--   ) sc ON sc.product_id = s.id
-- Production'da satırlar büyüdüğünde full scan olmaması için partial index.
-- Yeni kurulum için master şema (000_master_schema.sql) içindeki
-- rex_{firm}_{period}_sale_items CREATE TABLE bloğunda da aynı index var.

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND c.relname ~ '^rex_[0-9]{3}_[0-9]{2}_sale_items$'
           AND EXISTS (
               SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid
                  AND a.attname  = 'item_type'
                  AND NOT a.attisdropped
           )
    LOOP
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I.%I (product_id, invoice_id) WHERE item_type = %L',
            rec.table_name || '_service_sale_count_idx',
            rec.schema_name,
            rec.table_name,
            'Hizmet'
        );
    END LOOP;
END
$$;
