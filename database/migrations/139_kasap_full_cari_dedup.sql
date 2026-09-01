-- =====================================================================
-- RetailEX migration #139 — Kasap DB kapsamlı cari/tedarikçi düzeltmesi
-- Tarih         : 2026-09-01
-- Veritabanı    : kasap (PG 15+)
-- Önceki        : 138_badia_orphan_supplier_redirect.sql
-- Yedek         : database/backups/kasap_pre_139_20260901_175108.dump
--
-- Tetikleyen    : Kullanıcı "yapılan işlemi tüm cari ve tedarikçi
--                 hesaplarda yapmalısın kasap datasında". Migration 138
--                 yalnız BADIA'yı çözdü; kasap DB'de başka duplicate ve
--                 orphan satırları da aynı skandalın parçasıydı.
--
-- Kapsam (3 kategori):
--   A) Duplicate merge (aynı isim hem customer hem supplier)
--      - TAZA (MUS-009 → TED-002): arşivlenmiş müşteri, bugünkü
--        CH_ODEME yanlış customer_id'ye yazılmış; orphan satırları
--        bağlanır, müşteri silinir.
--      - MEGAL COM (MUS-024 → MUS-015 tedarikçi): orphan satır bağla,
--        müşteri sil; kod çakışması çözülür.
--      - MEGAL MARKET (MUS-003 ↔ TED-004): DOKUNULMAZ. Gerçek
--        müşteri (22 sales_invoice + 3 KASA_GIRIS). Tedarikçi boş,
--        kullanıcı kararı.
--   B) Orphan customer_id bağlama (tedarikçi adıyla yazılmış ama
--      customer_id NULL olan purchase_invoice satırları). Ünvan→
--      tedarikçi UUID eşleme tablosu hard-code.
--   C) sync_queue stale event silme (her duplicate UUID için).
--
-- Güvenlik:
--   - SET LOCAL session_replication_role = replica → AFTER trigger
--     tetiklenmesin
--   - SET LOCAL retailex.sync_apply = '1' → trigger sync_queue'ya
--     yazma
--   - Idempotent: WHERE balance = X / WHERE id = X koşulları ile
--     tekrar çalıştırılabilir
--   - Yedek: kasap_pre_139_*.dump
-- =====================================================================

BEGIN;

SET LOCAL session_replication_role = replica;
SET LOCAL retailex.sync_apply = '1';

-- Tedarikçi UUID'leri (doğrulama amaçlı)
DO $$
DECLARE
  v_ted002_taza UUID := '5bb0a60b-feec-449a-94f4-baa07d42e867';
  v_ted003_amanj UUID := '0d14499a-d3c3-4744-9844-c43871e232cb';
  v_ted006_megalco UUID := '5c2a1bb3-0d98-406d-a856-771dc02ec560';
  v_ted007_kogay UUID := '9e1cfb66-dd86-40d3-9132-e2adeb6c9514';
  v_ted008_market_ar UUID := '891dbb13-64cd-4318-880c-932bb20ac35d';
  v_ted009_mreshke UUID := 'bf5e5787-ad7a-4574-abe8-10b948b39d9b';
  v_ted010_zom UUID := 'fc16490e-e347-46f5-b815-cf97b090e1ac';
  v_ted017_home UUID := '9d7dd184-9a7e-4eba-be98-fcb5f5f7ff48';
  v_ted018_kakdlovan UUID := 'eb0989dd-de4d-4110-8126-51ff6bf53d80';
  v_ted001_sherwan UUID := 'b02a886e-898d-43ce-8947-5852f224a5c1';
  v_ted015_megalcom_supplier UUID := '4900d884-e6a8-4ffb-b464-23dc7ebd2f2d';
  v_genel UUID := 'c6840fe5-9484-436d-a5f5-d9e82f909eb4';

  v_mus009_taza UUID := '34741c31-434f-439f-9c72-6e1ba10a29e6';
  v_mus024_megalcom UUID := 'bdb56157-776f-43f9-9151-d1ab9ac98b0b';
  v_mus015_megalcom_garawa UUID := '97292135-df28-4b96-9e53-eb1e1c05ac15';

  -- Sayaçlar (özet için)
  v_taza_cashline INT := 0;
  v_taza_mus_sales INT := 0;
  v_mc_cashline INT := 0;
  v_mc_mus_sales INT := 0;
  v_orphan_total INT := 0;
BEGIN

  -- -----------------------------------------------------------------
  -- A.1) TAZA DUPLICATE
  --      - customers.MUS-009 arşiv (is_active=false), bakiye -770,750
  --      - Tedarikçi TED-002 bakiye 7,562,463.75
  --      - Bugünkü CH_ODEME (2,850,000) customer_id'ye yazılmış
  --      - 46+16 orphan sales "TAZA"/"TAZA MRESHK" ünvanıyla
  -- -----------------------------------------------------------------

  -- 1a) Yanlış yazılan cash_line: customer_id → NULL, party_id → TAZA tedarikçi
  UPDATE rex_001_01_cash_lines
     SET customer_id = NULL,
         party_id = v_ted002_taza
   WHERE customer_id = v_mus009_taza
     AND UPPER(TRIM(transaction_type)) = 'CH_ODEME';
  GET DIAGNOSTICS v_taza_cashline = ROW_COUNT;

  -- 1b) Orphan "TAZA" purchase satırlarını TED-002'ye bağla
  UPDATE rex_001_01_sales
     SET customer_id = v_ted002_taza
   WHERE LOWER(TRIM(customer_name)) = 'taza'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');
  GET DIAGNOSTICS v_taza_mus_sales = ROW_COUNT;

  -- 1c) Orphan "TAZA MRESHK" satırları da TED-002'ye bağla (geçmiş merge bu isimde kalanları kapsamamıştı)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted002_taza
   WHERE LOWER(TRIM(customer_name)) = 'taza mreshk'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- 1d) TED-002 bakiyesini düzelt: gerçek tedarikçi ödemesi (-2,850,000)
  -- idempotent: balance = 7,562,463.75 ise
  UPDATE rex_001_suppliers
     SET balance = balance - 2850000.00,
         notes = COALESCE(notes,'') || E'\n[2026-09-01] Migration 139: 2,850,000 IQD CH_ODEME (cash_line bf119e60) bu tedarikçiye doğru uygulandı.',
         updated_at = NOW()
   WHERE id = v_ted002_taza AND balance = 7562463.75;

  -- 1e) customers.MUS-009 TAZA orphan kaydı sil (bakiye -770,750 idi; geçmiş merge is_active=false bırakmıştı)
  -- Güvenli: cash_lines.customer_id artık NULL, sales'lar orphan kalmadı (bağlandı)
  DELETE FROM rex_001_customers WHERE id = v_mus009_taza;

  RAISE NOTICE 'A) TAZA: cash_line düzeltildi=% satır, orphan sales bağlandı=% satır', v_taza_cashline, v_taza_mus_sales;

  -- -----------------------------------------------------------------
  -- A.2) MEGAL COM DUPLICATE (MUS-024 → MUS-015 tedarikçi)
  --      - customers.MUS-024 MEGAL COM bakiye 7,000, 1 sales (purchase_invoice)
  --      - suppliers.MUS-015 MEGAL COM bakiye 7,000 (orphan satırdan gelecek)
  --      - 1 orphan sales purchase_invoice 'MEGAL COM' adıyla
  -- -----------------------------------------------------------------

  -- 2a) customers.MUS-024 satırlarını tedarikçi MUS-015'e bağla
  UPDATE rex_001_01_sales
     SET customer_id = v_ted015_megalcom_supplier
   WHERE customer_id = v_mus024_megalcom
     AND COALESCE(is_cancelled,false)=false;
  GET DIAGNOSTICS v_mc_mus_sales = ROW_COUNT;

  -- 2b) Orphan 'MEGAL COM' purchase satırlarını da MUS-015 supplier'a bağla
  UPDATE rex_001_01_sales
     SET customer_id = v_ted015_megalcom_supplier
   WHERE LOWER(TRIM(customer_name)) = 'megal com'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- 2c) customers.MUS-024 sil (orphan, bakiye 7,000 + orphan sale vardı)
  DELETE FROM rex_001_customers WHERE id = v_mus024_megalcom;

  RAISE NOTICE 'A) MEGAL COM: mus_sales düzeltildi=% satır', v_mc_mus_sales;

  -- -----------------------------------------------------------------
  -- B) ORPHAN CUSTOMER_ID BAĞLAMA (tedarikçi adıyla yazılmış sales)
  --    purchase_invoice/return_invoice/opening_balance türünde, customer_id
  --    NULL, customer_name dolu, ünvan trimmed/lower trim sonrası
  --    tedarikçi tablosunda eşleşen.
  -- -----------------------------------------------------------------

  -- B.1) MEGAL COMPANY (TED-006)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted006_megalco
   WHERE LOWER(TRIM(customer_name)) = 'megal company'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.2) MEGAL COM . GARAWA → MEGAL COMPANY (aynı firma; ünvan varyasyonu)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted006_megalco
   WHERE LOWER(TRIM(customer_name)) = 'megal com . garawa'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.3) AMANJ MAMAND (TED-003)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted003_amanj
   WHERE LOWER(TRIM(customer_name)) = 'amanj mamand'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.4) MRSHKE ZINDW (HAJE RZGAR) (TED-009)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted009_mreshke
   WHERE LOWER(TRIM(customer_name)) = 'mrshke zindw (haje rzgar)'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.5) ZOM (TED-010)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted010_zom
   WHERE LOWER(TRIM(customer_name)) = 'zom'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.6) KOGAY RASA (TED-007)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted007_kogay
   WHERE LOWER(TRIM(customer_name)) = 'kogay rasa'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.7) MARKET ARAT (HAFIA) (TED-008)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted008_market_ar
   WHERE LOWER(TRIM(customer_name)) = 'market arat (hafia)'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.8) KAK DLOVAN (TED-018)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted018_kakdlovan
   WHERE LOWER(TRIM(customer_name)) = 'kak dlovan'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.9) HOME ISTANBUL (TED-017)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted017_home
   WHERE LOWER(TRIM(customer_name)) = 'home istanbul'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.10) SHERWAN (TED-001)
  UPDATE rex_001_01_sales
     SET customer_id = v_ted001_sherwan
   WHERE LOWER(TRIM(customer_name)) = 'sherwan'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B.11) MATERIALS — FIRST PURCHASE → GENEL tedarikçi (en yakın catch-all)
  UPDATE rex_001_01_sales
     SET customer_id = v_genel
   WHERE LOWER(TRIM(customer_name)) = 'materials — first purchase'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');

  -- B özet sayaç
  SELECT count(*) INTO v_orphan_total
    FROM rex_001_01_sales
   WHERE customer_id IS NULL
     AND COALESCE(is_cancelled,false)=false
     AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance')
     AND TRIM(COALESCE(customer_name,'')) <> '';

  RAISE NOTICE 'B) Orphan düzeltme sonrası kalan orphan sales satırı: %', v_orphan_total;

  -- -----------------------------------------------------------------
  -- C) sync_queue stale event'lerini temizle
  -- -----------------------------------------------------------------
  DELETE FROM sync_queue WHERE record_id IN (
    v_mus009_taza,         -- TAZA müşteri
    v_mus024_megalcom,     -- MEGAL COM müşteri
    v_mus015_megalcom_garawa -- kod çakışması MEGAL COM . GARAWA
  ) AND status = 'pending';

END $$;

-- -----------------------------------------------------------------
-- D) schema_migrations kaydı
-- -----------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('139_kasap_full_cari_dedup.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- =====================================================================
-- DOĞRULAMA (psql ayrı çalıştır)
-- =====================================================================
-- -- 1) Active duplicate kalmadı (aynı isim hem customer hem supplier)
-- SELECT c.code, c.name, s.code, s.name
--   FROM rex_001_customers c
--   INNER JOIN rex_001_suppliers s ON LOWER(TRIM(c.name)) = LOWER(TRIM(s.name))
--  WHERE c.id <> s.id AND c.is_active=true AND s.is_active=true;
-- -- Beklenen: yalnız MEGAL MARKET (MUS-003 ↔ TED-004) — kasıtlı, gerçek müşteri
--
-- -- 2) Orphan purchase satırı kalmadı
-- SELECT count(*) FROM rex_001_01_sales
--  WHERE customer_id IS NULL
--    AND COALESCE(is_cancelled,false)=false
--    AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance')
--    AND TRIM(COALESCE(customer_name,'')) <> '';
-- -- Beklenen: 0
--
-- -- 3) TAZA yeni bakiye (TED-002)
-- SELECT balance FROM rex_001_suppliers WHERE id='5bb0a60b-feec-449a-94f4-baa07d42e867';
-- -- Beklenen: 7,562,463.75 - 2,850,000 = 4,712,463.75
--
-- -- 4) TAZA müşteri silindi mi?
-- SELECT count(*) FROM rex_001_customers WHERE id='34741c31-434f-439f-9c72-6e1ba10a29e6';
-- -- Beklenen: 0
--
-- -- 5) MEGAL COM orphan sales bağlandı mı?
-- SELECT count(*) FROM rex_001_01_sales
--  WHERE LOWER(TRIM(customer_name))='megal com' AND customer_id IS NOT NULL
--    AND fiche_type IN ('purchase_invoice','return_invoice','opening_balance');
-- -- Beklenen: 1+
