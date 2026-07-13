/**
 * Kar-zarar / ürün brüt kâr maliyet kaynağı:
 * 1) Son alış faturası birim tutarı × satış miktarı (ürün id, yoksa kod)
 * 2) sale_items.total_cost / unit_cost
 * 3) products.cost × miktar
 *
 * Logo alış trcode — invoices / expiryReports ile aynı.
 */
export const PURCHASE_TRCODES_SQL = '1, 4, 5, 6, 13, 26, 41, 42';

/** firmNrParam: örn. `$1` — alış CTE ve satış filtresinde aynı indeks kullanılmalı */
export function buildLastPurchaseCte(firmNrParam = '$1'): string {
  return `
  last_purchase_by_id AS (
    SELECT DISTINCT ON (si.product_id)
      si.product_id,
      COALESCE(
        NULLIF(
          CASE
            WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
              THEN COALESCE(si.net_amount, 0) / NULLIF(ABS(si.quantity), 0)
            ELSE NULL
          END,
          0
        ),
        NULLIF(si.unit_price, 0),
        NULLIF(si.unit_cost, 0),
        0
      ) AS unit_cost
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.invoice_id
    WHERE s.firm_nr = ${firmNrParam}
      AND COALESCE(s.is_cancelled, false) = false
      AND (
        LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
        OR COALESCE(s.trcode, 0) IN (${PURCHASE_TRCODES_SQL})
      )
      AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
      AND si.product_id IS NOT NULL
    ORDER BY si.product_id, s.date DESC NULLS LAST, s.created_at DESC NULLS LAST
  ),
  last_purchase_by_code AS (
    SELECT DISTINCT ON (NULLIF(TRIM(si.item_code), ''))
      NULLIF(TRIM(si.item_code), '') AS item_code,
      COALESCE(
        NULLIF(
          CASE
            WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
              THEN COALESCE(si.net_amount, 0) / NULLIF(ABS(si.quantity), 0)
            ELSE NULL
          END,
          0
        ),
        NULLIF(si.unit_price, 0),
        NULLIF(si.unit_cost, 0),
        0
      ) AS unit_cost
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.invoice_id
    WHERE s.firm_nr = ${firmNrParam}
      AND COALESCE(s.is_cancelled, false) = false
      AND (
        LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
        OR COALESCE(s.trcode, 0) IN (${PURCHASE_TRCODES_SQL})
      )
      AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
      AND NULLIF(TRIM(si.item_code), '') IS NOT NULL
    ORDER BY NULLIF(TRIM(si.item_code), ''), s.date DESC NULLS LAST, s.created_at DESC NULLS LAST
  )
`.trim();
}

/** product_id eşleşmesi öncelikli; yoksa ürün kodu ile son alış */
export const LINE_COST_EXPR = `
  COALESCE(
    NULLIF(lpc_id.unit_cost, 0) * si.quantity,
    NULLIF(lpc_code.unit_cost, 0) * si.quantity,
    NULLIF(si.total_cost, 0),
    NULLIF(si.unit_cost, 0) * si.quantity,
    NULLIF(p.cost, 0) * si.quantity,
    0
  )
`.trim();

export const LAST_PURCHASE_JOIN = `
  LEFT JOIN last_purchase_by_id lpc_id ON lpc_id.product_id = si.product_id
  LEFT JOIN last_purchase_by_code lpc_code
    ON lpc_code.item_code = NULLIF(TRIM(si.item_code), '')
`.trim();

/** REST/client yolu: alış satırından birim maliyet */
export function unitCostFromPurchaseLine(it: {
  quantity?: unknown;
  net_amount?: unknown;
  unit_price?: unknown;
  unit_cost?: unknown;
}): number {
  const qty = Math.abs(Number(it.quantity ?? 0));
  const net = Number(it.net_amount ?? 0);
  if (qty > 0.0000001) {
    const fromNet = net / qty;
    if (fromNet) return fromNet;
  }
  const up = Number(it.unit_price ?? 0);
  if (up) return up;
  return Number(it.unit_cost ?? 0) || 0;
}

export function isPurchaseFiche(row: {
  fiche_type?: unknown;
  trcode?: unknown;
}): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  if (ft === 'purchase_invoice' || ft === 'a') return true;
  const tc = Number(row.trcode ?? 0);
  return [1, 4, 5, 6, 13, 26, 41, 42].includes(tc);
}
