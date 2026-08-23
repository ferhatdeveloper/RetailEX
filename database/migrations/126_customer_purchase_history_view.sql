-- ============================================================================
-- 126: Müşteri satın alma geçmişi — view + helper function
-- ============================================================================
-- Müşteri bazlı ürün tüketim tahmini / "bir daha ne zaman sipariş verir?"
-- sorusu için iki PL/pgSQL helper:
--   * get_customer_product_purchase_summary(customer, firm, period, lookback)
--   * get_customer_recent_invoices(customer, firm, period, limit)
--
-- Tablolar (CREATE_PERIOD_TABLES — 060):
--   rex_{firm}_{period}_sales      : id, fiche_no, fiche_type, date, customer_id,
--                                    total_gross, total_net, total_vat ...
--   rex_{firm}_{period}_sale_items : id, invoice_id, product_id, item_code,
--                                    item_name, quantity, unit_price, total_amount
--
-- fiche_type değerleri (gerçek veri):
--   'S' = sale (müşteri satış)
--   'A' = alış / purchase (tedarikçi — bu fonksiyonda yok sayılır)
--   'I' = iade / return (müşteri iade — quantity eksi, total eksi)
-- NULL  = veri kaynağı belirsiz — "sale" kabul edilir.
--
-- Idempotent: CREATE OR REPLACE FUNCTION — birden çok kez çalıştırılabilir.
-- psql / db:migrate ile çalışır; DO $$ serbest (Tauri kuralı bu dosya için yok).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_product_purchase_summary(
  p_customer_id    UUID,
  p_firm_nr        VARCHAR DEFAULT NULL,
  p_period_nr      VARCHAR DEFAULT NULL,
  p_lookback_days  INT     DEFAULT 90
)
RETURNS TABLE (
  product_id                  UUID,
  product_code                VARCHAR,
  product_name                TEXT,
  unit                        VARCHAR,
  total_quantity              DECIMAL,
  total_spent                 DECIMAL,
  last_purchase_date          TIMESTAMPTZ,
  last_purchase_invoice_no    VARCHAR,
  purchase_count              INT,
  avg_interval_days           NUMERIC,
  avg_daily_consumption       NUMERIC,
  days_since_last_purchase    INT,
  predicted_next_need_days    INT,
  recommended_qty             DECIMAL
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_sales_tbl  TEXT;
  v_items_tbl  TEXT;
BEGIN
  -- Firma/dönem zorunlu (dinamik çoklu tablo tarama çok yavaş).
  IF p_firm_nr IS NULL OR p_period_nr IS NULL THEN
    RETURN;
  END IF;

  v_sales_tbl := format('rex_%s_%s_sales',      trim(p_firm_nr),  trim(p_period_nr));
  v_items_tbl := format('rex_%s_%s_sale_items', trim(p_firm_nr),  trim(p_period_nr));

  -- Tablolar yoksa sessizce boş dön (müşteri ekranı hata vermesin).
  IF to_regclass(format('public.%I', v_sales_tbl)) IS NULL
     OR to_regclass(format('public.%I', v_items_tbl)) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($sql$
    WITH sales_in_range AS (
      SELECT s.id, s.fiche_no, s.date, s.fiche_type
      FROM %I s
      WHERE s.customer_id = $1
    ),
    items AS (
      SELECT
        si.product_id,
        si.item_code                                                        AS product_code,
        si.item_name                                                        AS product_name,
        COALESCE(si.unit, 'Adet')                                           AS unit,
        SUM(si.quantity) FILTER (
          WHERE s.fiche_type = 'S' OR s.fiche_type IS NULL
        )                                                                   AS total_qty_pos,
        SUM(si.quantity) FILTER (
          WHERE s.fiche_type = 'I'
        )                                                                   AS total_qty_neg,
        SUM(si.total_amount) FILTER (
          WHERE s.fiche_type = 'S' OR s.fiche_type IS NULL
        )                                                                   AS total_spent_pos,
        SUM(si.total_amount) FILTER (
          WHERE s.fiche_type = 'I'
        )                                                                   AS total_refund,
        MAX(s.date)                                                         AS last_purchase_date,
        COUNT(DISTINCT s.id)                                                AS purchase_count,
        -- ardışık satın alma tarihleri arası ortalama gün (müşteri×ürün)
        (
          SELECT AVG(days_diff)::numeric
          FROM (
            SELECT EXTRACT(EPOCH FROM (
              s2.date - LAG(s2.date) OVER (PARTITION BY si2.product_id ORDER BY s2.date)
            )) / 86400 AS days_diff
            FROM %I s2
            JOIN %I si2 ON si2.invoice_id = s2.id
            WHERE s2.customer_id = $1
          ) t
          WHERE days_diff IS NOT NULL
        )                                                                   AS avg_interval,
        -- son lookback günde ortalama günlük tüketim
        COALESCE(
          SUM(si.quantity) FILTER (
            WHERE s.date >= NOW() - make_interval(days => $2)
              AND (s.fiche_type = 'S' OR s.fiche_type IS NULL)
          ), 0
        )::numeric / NULLIF($2, 0)                                          AS avg_daily
      FROM %I si
      JOIN sales_in_range s ON s.id = si.invoice_id
      WHERE si.product_id IS NOT NULL
      GROUP BY si.product_id, si.item_code, si.item_name, si.unit
    ),
    last_invoice_per_product AS (
      SELECT DISTINCT ON (si2.product_id)
        si2.product_id,
        s2.fiche_no AS last_fiche_no,
        s2.date     AS last_date
      FROM %I si2
      JOIN %I s2 ON s2.id = si2.invoice_id
      WHERE s2.customer_id = $1 AND si2.product_id IS NOT NULL
      ORDER BY si2.product_id, s2.date DESC
    )
    SELECT
      i.product_id,
      i.product_code,
      i.product_name::text,
      i.unit,
      GREATEST(COALESCE(i.total_qty_pos, 0) - COALESCE(i.total_qty_neg, 0), 0)::decimal(15,4) AS total_quantity,
      GREATEST(COALESCE(i.total_spent_pos, 0) - COALESCE(i.total_refund, 0), 0)::decimal(15,2) AS total_spent,
      i.last_purchase_date,
      lip.last_fiche_no AS last_purchase_invoice_no,
      i.purchase_count::int,
      i.avg_interval                                                          AS avg_interval_days,
      i.avg_daily                                                             AS avg_daily_consumption,
      CASE WHEN i.last_purchase_date IS NOT NULL
           THEN EXTRACT(DAY FROM (NOW() - i.last_purchase_date))::int
           ELSE NULL
      END                                                                     AS days_since_last_purchase,
      CASE
        WHEN i.avg_interval IS NOT NULL AND i.last_purchase_date IS NOT NULL THEN
          GREATEST(0, (i.avg_interval - EXTRACT(DAY FROM (NOW() - i.last_purchase_date))))::int
        ELSE NULL
      END                                                                     AS predicted_next_need_days,
      CASE
        WHEN i.avg_daily > 0 AND i.avg_interval IS NOT NULL THEN
          CEIL(i.avg_daily * GREATEST(1, i.avg_interval - EXTRACT(DAY FROM (NOW() - i.last_purchase_date))))::decimal(15,4)
        WHEN i.avg_daily > 0 THEN
          CEIL(i.avg_daily * 30)::decimal(15,4)
        ELSE 0
      END                                                                     AS recommended_qty
    FROM items i
    LEFT JOIN last_invoice_per_product lip ON lip.product_id = i.product_id
    ORDER BY total_spent DESC
  $sql$,
    v_sales_tbl,                              -- sales_in_range FROM
    v_sales_tbl, v_items_tbl,                 -- avg_interval alt-sorgu (s2, si2)
    v_items_tbl,                              -- items FROM (si)
    v_items_tbl, v_sales_tbl                  -- last_invoice_per_product (si2, s2)
  )
  USING p_customer_id, p_lookback_days;
END;
$$;

-- ---------------------------------------------------------------------------
-- Son faturalar (müşteri detay paneli)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_recent_invoices(
  p_customer_id UUID,
  p_firm_nr     VARCHAR,
  p_period_nr   VARCHAR,
  p_limit       INT DEFAULT 50
)
RETURNS TABLE (
  invoice_id     UUID,
  invoice_no     VARCHAR,
  invoice_date   TIMESTAMPTZ,
  fiche_type     VARCHAR,
  total_gross    DECIMAL,
  total_net      DECIMAL,
  item_count     INT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_sales_tbl TEXT;
  v_items_tbl TEXT;
BEGIN
  IF p_firm_nr IS NULL OR p_period_nr IS NULL THEN
    RETURN;
  END IF;

  v_sales_tbl := format('rex_%s_%s_sales',      trim(p_firm_nr), trim(p_period_nr));
  v_items_tbl := format('rex_%s_%s_sale_items', trim(p_firm_nr), trim(p_period_nr));

  IF to_regclass(format('public.%I', v_sales_tbl)) IS NULL
     OR to_regclass(format('public.%I', v_items_tbl)) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($sql$
    SELECT
      s.id,
      s.fiche_no,
      s.date,
      s.fiche_type,
      s.total_gross,
      s.total_net,
      (SELECT COUNT(*)::int FROM %I si WHERE si.invoice_id = s.id) AS item_count
    FROM %I s
    WHERE s.customer_id = $1
    ORDER BY s.date DESC
    LIMIT $2
  $sql$, v_items_tbl, v_sales_tbl)
  USING p_customer_id, p_limit;
END;
$$;

-- PostgREST şema reload (anon erişimli kurulumlar)
NOTIFY pgrst, 'reload schema';
