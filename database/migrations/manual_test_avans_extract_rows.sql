-- Manual SQL test: Cari Hesap Ekstresi — avans çift satır formatı
-- Kullanıcı şikâyeti (09.10.2026):
--   "cari avans ödemişse orada borç alacak kolonu ikiside 15 yazıp bakiye
--    0 olacak, sonra randevu tamamlanınca randevu tutarı orada yazacak"
--
-- Bu test ile:
--   1) cash_lines üzerindeki REZERVASYON avansları tespit edilir
--      (special_code='REZERVASYON' + transaction_type='CH_TAHSILAT')
--   2) Yeni ekstre kuralı uygulanır:
--      - Avans satırı: borç=amt + alacak=amt, bakiye=0 (nötr)
--      - Hizmet satırı: yalnızca alacak=amt, bakiye=amt
--   3) toplam bakiye avans hariç tutulur (sadece hizmet tutarı)
--   4) senaryo: arz müşterisi (15k avans + 75k hizmet tamamlanmış)
--
-- Çalıştırma:
--   PGPASSWORD=... psql -h 127.0.0.1 -U postgres -d retailex_local \
--     -f database/migrations/manual_test_avans_extract_rows.sql
--
-- firm_nr/period_nr değişkenleri ortamınıza göre düzenlenir.
-- Varsayılan: firm 001, dönem 01.

-- ══════════════════════════════════════════════════════════════
-- 1) Ham avans satırları (cash_lines + REZERVASYON)
-- ══════════════════════════════════════════════════════════════
SELECT
    cl.id AS cash_line_id,
    cl.fiche_no,
    cl.date::date AS avans_tarih,
    ABS(COALESCE(cl.amount, 0))::numeric AS avans_tutar,
    COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key
FROM rex_001_01_cash_lines cl
WHERE cl.transaction_type = 'CH_TAHSILAT'
  AND UPPER(TRIM(COALESCE(cl.special_code, ''))) = 'REZERVASYON'
ORDER BY cl.date ASC;

-- ══════════════════════════════════════════════════════════════
-- 2) Hizmet tamamlanmış satışlar (trcode=9 service / sales_invoice)
--    Avans için cariye eşleştirme müşteri id üzerinden yapılır.
-- ══════════════════════════════════════════════════════════════
SELECT
    s.id AS sale_id,
    s.fiche_no,
    s.date::date AS hizmet_tarih,
    COALESCE(s.net_amount, 0)::numeric AS hizmet_tutar,
    s.fiche_type,
    s.customer_id::text AS cari_key
FROM rex_001_01_sales s
WHERE (s.fiche_type IN ('service', 'hizmet') OR s.trcode = 9)
  AND COALESCE(s.is_cancelled, false) = false
ORDER BY s.date ASC;

-- ══════════════════════════════════════════════════════════════
-- 3) Sanal ekstre — avans çift satır (borç+alacak=amt, bakiye=0)
-- ══════════════════════════════════════════════════════════════
WITH avans_rows AS (
    SELECT
        cl.date::date AS tarih,
        'avans'::text AS kaynak,
        cl.fiche_no,
        ABS(COALESCE(cl.amount, 0))::numeric AS tutar,
        COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(cl.customer_id::text, cl.party_id::text)
          ORDER BY cl.date ASC, cl.id ASC
        ) * 2 - 1 AS sira  -- avans_borc, avans_alacak
    FROM rex_001_01_cash_lines cl
    WHERE cl.transaction_type = 'CH_TAHSILAT'
      AND UPPER(TRIM(COALESCE(cl.special_code, ''))) = 'REZERVASYON'
),
hizmet_rows AS (
    SELECT
        s.date::date AS tarih,
        'hizmet'::text AS kaynak,
        s.fiche_no,
        COALESCE(s.net_amount, 0)::numeric AS tutar,
        s.customer_id::text AS cari_key,
        ROW_NUMBER() OVER (
          PARTITION BY s.customer_id
          ORDER BY s.date ASC, s.created_at ASC
        ) * 100 AS sira  -- hizmetleri avanstan sonra sırala
    FROM rex_001_01_sales s
    WHERE (s.fiche_type IN ('service', 'hizmet') OR s.trcode = 9)
      AND COALESCE(s.is_cancelled, false) = false
),
birlesik AS (
    SELECT tarih, kaynak, fiche_no, tutar, cari_key, sira FROM avans_rows
    UNION ALL
    SELECT tarih, kaynak, fiche_no, tutar, cari_key, sira FROM hizmet_rows
),
sirali AS (
    SELECT
        cari_key,
        tarih,
        kaynak,
        fiche_no,
        tutar,
        sira,
        SUM(
          CASE
            WHEN kaynak = 'avans' THEN 0       -- avans bakiyeyi kirletmez
            ELSE tutar                          -- hizmet tam tutar
          END
        ) OVER (
          PARTITION BY cari_key
          ORDER BY sira, tarih, fiche_no
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS kumulatif_bakiye
    FROM birlesik
)
SELECT
    cari_key,
    ROW_NUMBER() OVER (PARTITION BY cari_key ORDER BY sira, tarih, fiche_no) AS satir_no,
    tarih,
    kaynak,
    fiche_no,
    CASE WHEN kaynak = 'avans' THEN tutar ELSE 0 END AS borc,
    CASE WHEN kaynak = 'avans' THEN tutar ELSE tutar END AS alacak,
    kumulatif_bakiye
FROM sirali
ORDER BY cari_key, satir_no;

-- ══════════════════════════════════════════════════════════════
-- 4) Sonuç doğrulama — beklenen:
--    arz  müşteri: Satır 1 avans borç=15/alacak=15/bakiye=0,
--                  Satır 2 avans borç=0/alacak=15/bakiye=0  (çift satır),
--                  Satır 3+ hizmet satırları alacak=75/toplam=75.
--    ROZA müşteri: aynı format.
-- ══════════════════════════════════════════════════════════════
-- Bakiye invariantı: Σ(hizmet.alacak) − Σ(avans.alacak) = Σ(hizmet.bakiye)
-- (avans tutarları çift sayıldığı için Σ(avans.alacak) = 2 * avans tutarı;
--  ama cari tarafı için avans "nötr" kabul → nihai bakiye = Σ hizmet tutarı.)
