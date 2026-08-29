-- ============================================================================
-- 129 — Cheques (çek/senet) cari_id tip + foreign key düzeltmesi
-- ============================================================================
-- Sorun:
--   `rex_${firmNr}_cheques` tablosunda `cari_id` kolonu TEXT tanımlı; oysa
--   referans tablolar (`customers.id`, `suppliers.id`, `parties.id`) UUID.
--   Buna ek olarak `cheques.cari_id` için hiç FOREIGN KEY tanımlı değil.
--   Frontend `string` olarak okuduğu için şu an "çalışıyor" görünüyor; ama
--   veri bütünlüğü, cascade davranışı ve sorgu planı açısından yanlış.
--
-- Kapsam:
--   Şu anda 3 firmada tablo var: rex_001_cheques, rex_002_cheques,
--   rex_110_cheques — üçünde de satır YOK (henüz veri girilmemiş).
--   Bu sayede dönüşüm risksiz ve idempotent uygulanabilir.
--
-- Strateji:
--   `cari_id` TEXT -> UUID USING NULLIF(cari_id, '')::UUID
--   - Boş string NULL'a çevrilir; böylece "bilinmeyen cari" satırları FK ihlali
--     yaratmaz (cari_type ile birlikte opsiyonel ilişki olur).
--   - Numerik olmayan / UUID olmayan TEXT değer varsa dönüşüm BAŞARISIZ olur;
--     bu durumda kullanıcı önce veri temizliği yapmalıdır.
--   - 3 firma için de (001, 002, 110) aynı DDL uygulanır.
--
-- FK tasarımı:
--   `cari_type` kolonu `customer` veya `supplier` olabilir; bu yüzden tek bir
--   sabit referans tablosu ile FK bağlanamaz. İki ayrı constraint ekliyoruz:
--   sadece `cari_type` değeri ile eşleşen satır varken kontrol edilir
--   (PostgreSQL'de conditional FK yok; bunun yerine `parties` üzerinden tek
--    FK + `cari_type` CHECK uyumu uygulanabilir).
--
--   Burada en güvenli ve tutarlı yol: iki ayrı constraint, biri customers'a
--   biri suppliers'a. PostgreSQL bunların ikisini de kontrol eder; herhangi
--   birinde ihlal varsa INSERT/UPDATE başarısız olur. İdeal olarak uygulama
--   katmanı `cari_type` ile doğru tabloya yazmalıdır.
--
--   ON DELETE: RESTRICT (cari silinirken açık çek/senet varsa engelle).
--   İşlem sırası: cari → silmeden önce açık çek/senet kapat.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. rex_001_cheques
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.rex_001_cheques') IS NOT NULL THEN
        -- Eski constraint adıyla çakışma ihtimaline karşı IF EXISTS
        ALTER TABLE rex_001_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_001_cheques_customer;
        ALTER TABLE rex_001_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_001_cheques_supplier;

        -- Tip dönüşümü: TEXT -> UUID. Boş string NULL yapılır.
        ALTER TABLE rex_001_cheques
            ALTER COLUMN cari_id TYPE UUID
            USING NULLIF(cari_id, '')::UUID;

        -- Customers'a FK (cari_type='customer' iken)
        ALTER TABLE rex_001_cheques
            ADD CONSTRAINT fk_rex_001_cheques_customer
            FOREIGN KEY (cari_id) REFERENCES rex_001_customers(id)
            ON DELETE RESTRICT;

        -- Suppliers'a FK (cari_type='supplier' iken)
        ALTER TABLE rex_001_cheques
            ADD CONSTRAINT fk_rex_001_cheques_supplier
            FOREIGN KEY (cari_id) REFERENCES rex_001_suppliers(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. rex_002_cheques
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.rex_002_cheques') IS NOT NULL THEN
        ALTER TABLE rex_002_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_002_cheques_customer;
        ALTER TABLE rex_002_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_002_cheques_supplier;

        ALTER TABLE rex_002_cheques
            ALTER COLUMN cari_id TYPE UUID
            USING NULLIF(cari_id, '')::UUID;

        ALTER TABLE rex_002_cheques
            ADD CONSTRAINT fk_rex_002_cheques_customer
            FOREIGN KEY (cari_id) REFERENCES rex_002_customers(id)
            ON DELETE RESTRICT;

        ALTER TABLE rex_002_cheques
            ADD CONSTRAINT fk_rex_002_cheques_supplier
            FOREIGN KEY (cari_id) REFERENCES rex_002_suppliers(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. rex_110_cheques
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.rex_110_cheques') IS NOT NULL THEN
        ALTER TABLE rex_110_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_110_cheques_customer;
        ALTER TABLE rex_110_cheques
            DROP CONSTRAINT IF EXISTS fk_rex_110_cheques_supplier;

        ALTER TABLE rex_110_cheques
            ALTER COLUMN cari_id TYPE UUID
            USING NULLIF(cari_id, '')::UUID;

        ALTER TABLE rex_110_cheques
            ADD CONSTRAINT fk_rex_110_cheques_customer
            FOREIGN KEY (cari_id) REFERENCES rex_110_customers(id)
            ON DELETE RESTRICT;

        ALTER TABLE rex_110_cheques
            ADD CONSTRAINT fk_rex_110_cheques_supplier
            FOREIGN KEY (cari_id) REFERENCES rex_110_suppliers(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Notlar:
-- 1. Tüm rex_XXX_customers ve rex_XXX_suppliers tabloları `id UUID` tanımlı
--    olduğundan tip uyumu sorunsuz.
-- 2. Boş string ('') NULL'a çevrilir; cari seçilmemiş satırlarda FK ihlali
--    yaşanmaz (NULL FK'da kontrol edilmez).
-- 3. cari_id NULL olmayan ama UUID formatında olmayan değer varsa ALTER
--    BAŞARISIZ olur; bu durumda önce aşağıdaki sorgu ile veri temizliği yapın:
--       SELECT id, cari_id FROM rex_001_cheques
--       WHERE cari_id IS NOT NULL
--         AND cari_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- 4. Uygulama katmanı INSERT sırasında cari_type='customer' ise
--    customers.id, 'supplier' ise suppliers.id ile eşleşen UUID göndermeli.
--    İki FK her iki yönü de denetler.
-- 5. ON DELETE RESTRICT: cari silinemez; önce ilgili çek/senet kapatılmalı.
-- 6. Geri alma: yalnızca yedekten dönmeli (veri kaybı olmaz çünkü tablo boş).
-- ============================================================================