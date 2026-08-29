-- RetailEX kasap DB — müşteri/tedarikçi birleştirme
-- Tarih: 2026-08-29
-- Yedek: /Users/ferhatnas/Desktop/retailex_kasap_backup_*.dump
--
-- Duplicate gruplar:
--   Müşteri TAZA:        MUS-009 (primary, 34741c31…) ← MUS-013 (7a9a2e3c…)
--   Müşteri TAZA MRESHK: MUS-019 (primary, b81fe06f…) ← MUS-014 (502d68e4…)
--   Tedarikçi BADIA:     TED-005 (primary, 0807abd4…)  ← TED-012 + MUS-002
--   Tedarikçi TAZA:      TED-002 (primary, 5bb0a60b…)  ← TED-015 + MUS-009 + MUS-013 + TED-014 + TED-011
--
-- Tercih kriteri: en çok hareket + en eski created_at + en yüksek balance + is_active=true.
-- Tüm secondary kayıtlarda 0 hareket var; sadece master veri silinecek.
--
-- !!! ÇALIŞTIRMADAN ÖNCE TAZE YEDEK ALINIZ !!!

BEGIN;

-- ============================================================
-- BÖLÜM 1: MÜŞTERİ DUPLİKASYONLARI
-- ============================================================

-- Grup 1: TAZA → MUS-009 (34741c31-434f-439f-9c72-6e1ba10a29e6) primary
-- Silinen MUS-013 (7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0) → 0 hareket
UPDATE rex_001_01_sales
   SET customer_id = '34741c31-434f-439f-9c72-6e1ba10a29e6'::uuid
 WHERE customer_id = '7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0'::uuid;

UPDATE rex_001_01_account_movements
   SET customer_id = '34741c31-434f-439f-9c72-6e1ba10a29e6'::uuid
 WHERE customer_id = '7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0'::uuid;

UPDATE rex_001_01_bank_lines
   SET customer_id = '34741c31-434f-439f-9c72-6e1ba10a29e6'::uuid
 WHERE customer_id = '7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0'::uuid;

UPDATE rex_001_01_cash_lines
   SET customer_id = '34741c31-434f-439f-9c72-6e1ba10a29e6'::uuid
 WHERE customer_id = '7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0'::uuid;

DELETE FROM rex_001_customers
 WHERE id = '7a9a2e3c-ad3b-4218-8a1b-28b2ed4ed1a0'::uuid;

-- Grup 2: TAZA MRESHK → MUS-019 (b81fe06f-682d-44d8-98a2-d9ee3c49be8b) primary
-- Silinen MUS-014 (502d68e4-a92d-437c-8275-c679056a4c6c) → 0 hareket
UPDATE rex_001_01_sales
   SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
 WHERE customer_id = '502d68e4-a92d-437c-8275-c679056a4c6c'::uuid;

UPDATE rex_001_01_account_movements
   SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
 WHERE customer_id = '502d68e4-a92d-437c-8275-c679056a4c6c'::uuid;

UPDATE rex_001_01_bank_lines
   SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
 WHERE customer_id = '502d68e4-a92d-437c-8275-c679056a4c6c'::uuid;

UPDATE rex_001_01_cash_lines
   SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
 WHERE customer_id = '502d68e4-a92d-437c-8275-c679056a4c6c'::uuid;

DELETE FROM rex_001_customers
 WHERE id = '502d68e4-a92d-437c-8275-c679056a4c6c'::uuid;

-- ============================================================
-- BÖLÜM 2: TEDARİKÇİ DUPLİKASYONLARI
-- ============================================================

-- Grup 3: BADIA → TED-005 (0807abd4-3132-42b4-877a-baa8ef497380) primary
-- Silinen: TED-012 (a171ff09-a4f7-48f1-8ed1-2fea8e31f130) + MUS-002 (a86fa54b-20bb-421e-a26e-4381d7a8538a) → 0 hareket
UPDATE rex_001_01_account_movements
   SET supplier_id = '0807abd4-3132-42b4-877a-baa8ef497380'::uuid
 WHERE supplier_id IN (
       'a171ff09-a4f7-48b1-8ed1-2fea8e31f130'::uuid,
       'a86fa54b-20bb-421e-a26e-4381d7a8538a'::uuid
 );

UPDATE rex_001_butcher_orders
   SET supplier_id = '0807abd4-3132-42b4-877a-baa8ef497380'::uuid
 WHERE supplier_id IN (
       'a171ff09-a4f7-48b1-8ed1-2fea8e31f130'::uuid,
       'a86fa54b-20bb-421e-a26e-4381d7a8538a'::uuid
 );

DELETE FROM rex_001_suppliers
 WHERE id IN (
       'a171ff09-a4f7-48b1-8ed1-2fea8e31f130'::uuid,
       'a86fa54b-20bb-421e-a26e-4381d7a8538a'::uuid
 );

-- Grup 4: TAZA → TED-002 (5bb0a60b-feec-449a-94f4-baa07d42e867) primary
-- Silinen: TED-015, MUS-009, MUS-013, TED-014, TED-011 → 0 hareket
UPDATE rex_001_01_account_movements
   SET supplier_id = '5bb0a60b-feec-449a-94f4-baa07d42e867'::uuid
 WHERE supplier_id IN (
       'f5454e3a-054a-4493-8905-4c1d8dd72833'::uuid,
       '41390aca-bbd7-4cb1-a301-b831c71a4372'::uuid,
       '8c52b9ac-96ff-4a5b-8b8b-0e8d34b1df92'::uuid,
       'd2f279ec-cbe5-44ec-919e-5fafccea3f99'::uuid,
       'f0af2a91-8bd0-47f8-9592-32bd75e1ed8b'::uuid
 );

UPDATE rex_001_butcher_orders
   SET supplier_id = '5bb0a60b-feec-449a-94f4-baa07d42e867'::uuid
 WHERE supplier_id IN (
       'f5454e3a-054a-4493-8905-4c1d8dd72833'::uuid,
       '41390aca-bbd7-4cb1-a301-b831c71a4372'::uuid,
       '8c52b9ac-96ff-4a5b-8b8b-0e8d34b1df92'::uuid,
       'd2f279ec-cbe5-44ec-919e-5fafccea3f99'::uuid,
       'f0af2a91-8bd0-47f8-9592-32bd75e1ed8b'::uuid
 );

DELETE FROM rex_001_suppliers
 WHERE id IN (
       'f5454e3a-054a-4493-8905-4c1d8dd72833'::uuid,
       '41390aca-bbd7-4cb1-a301-b831c71a4372'::uuid,
       '8c52b9ac-96ff-4a5b-8b8b-0e8d34b1df92'::uuid,
       'd2f279ec-cbe5-44ec-919e-5fafccea3f99'::uuid,
       'f0af2a91-8bd0-47f8-9592-32bd75e1ed8b'::uuid
 );

COMMIT;

-- Doğrulama (psql'den ayrı çalıştırılabilir):
-- SELECT COUNT(*) FROM rex_001_customers;
-- SELECT COUNT(*) FROM rex_001_suppliers;
-- SELECT name, COUNT(*) FROM rex_001_customers GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;
-- SELECT name, COUNT(*) FROM rex_001_suppliers GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;