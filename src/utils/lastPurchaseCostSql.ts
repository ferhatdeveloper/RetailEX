/**
 * Kar-zarar / ürün brüt kâr maliyet kaynağı:
 * - Malzeme: son alış faturası birim tutarı × satış miktarı (ürün id / kod / barkod).
 *   Alış yoksa maliyet = 0 — products.cost / sale_items.total_cost kart kopyası kullanılmaz.
 * - Hizmet: satır unit_cost → services.purchase_price → beauty cost_price → reçete (sarf × son alış) × miktar.
 *
 * Satır kimliği (kasap vb.):
 * - Satış satırlarında product_id çoğu zaman boş; item_code = ürün UUID
 * - Alış satırlarında product_id çoğu zaman boş; item_code = ürün kodu (veya barkod)
 * Bu yüzden son alış CTE ürünü id/kod/barkod ile çözer; birim tipine (kg/adet) göre ayrılmaz.
 *
 * Muhasebe (brüt kâr):
 * - Net satış = satış satırları − satış iadeleri (iadeler DB’de pozitif; işaret SQL/JS’te)
 * - Dip indirim: satır net toplamı ≠ fatura net_amount ise satırlara oransal ölçek
 * - COGS = son alış birim × miktar (işaretli); alış iadesi (trcode 6) son alışa girmez
 *
 * Logo alış trcode — invoices / expiryReports ile uyumlu; 6 = alış iade (hariç).
 */

/** Alış (iade hariç) — son maliyet ve alış raporları */
export const PURCHASE_ONLY_TRCODES = [1, 4, 5, 13, 26, 41, 42] as const;
export const PURCHASE_TRCODES_SQL = PURCHASE_ONLY_TRCODES.join(', ');
export const PURCHASE_RETURN_TRCODE = 6;
export const SALES_RETURN_TRCODES = [2, 3] as const;
export const SALES_RETURN_TRCODES_SQL = SALES_RETURN_TRCODES.join(', ');
export const SALES_TRCODES_SQL = '7, 8';

/** Ürün hareket geçmişi satır türü (alış / satış ayrımı). */
export type ProductHistoryMovementType =
  | 'purchase'
  | 'purchase_return'
  | 'sales'
  | 'sales_return';

/**
 * Fatura satırını alış/satış olarak sınıflandır.
 * Alış ortalaması / son alış yalnızca `purchase` için kullanılır; satış satırı alışa katılmaz.
 */
export function classifyProductHistoryType(
  ficheType: string | null | undefined,
  trcode: number | null | undefined
): ProductHistoryMovementType {
  const ft = String(ficheType || '').toLowerCase().trim();
  const tc = Number(trcode) || 0;

  if (tc === PURCHASE_RETURN_TRCODE) return 'purchase_return';
  if ((SALES_RETURN_TRCODES as readonly number[]).includes(tc)) return 'sales_return';

  // return_invoice + belirsiz trcode: isSalesReturnFiche ile aynı — satış iadesi
  // (alış iadesi yalnızca trcode 6 veya alış trcode’ları)
  if (ft === 'return_invoice') {
    if ((PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc)) return 'purchase_return';
    return 'sales_return';
  }

  if (
    ft === 'purchase_invoice' ||
    ft === 'a' ||
    (PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc)
  ) {
    return 'purchase';
  }

  return 'sales';
}

export function isPurchaseHistoryType(type: string | null | undefined): boolean {
  return String(type || '') === 'purchase';
}

export function isSalesHistoryType(type: string | null | undefined): boolean {
  const t = String(type || '');
  return t === 'sales' || t === 'sales_return';
}

/** item_code alanı UUID ise ürün id sayılır */
export const SQL_UUID_TEXT_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/** Ekranda UUID gösterme — kart kodu yoksa item_code yalnızca UUID değilse */
export const SQL_NON_UUID_ITEM_CODE = `
CASE
  WHEN NULLIF(TRIM(si.item_code), '') IS NULL THEN NULL
  WHEN TRIM(si.item_code) ~* '${SQL_UUID_TEXT_RE}' THEN NULL
  ELSE NULLIF(TRIM(si.item_code), '')
END
`.trim();

export const SQL_DISPLAY_ITEM_CODE = `
COALESCE(
  NULLIF(TRIM(p.code), ''),
  NULLIF(TRIM(svc.code), ''),
  ${SQL_NON_UUID_ITEM_CODE},
  '—'
)
`.trim();

/** Satış/alış satırından ürün UUID (product_id veya UUID item_code) */
export const SQL_LINE_RESOLVED_PRODUCT_ID = `
COALESCE(
  si.product_id,
  CASE
    WHEN TRIM(COALESCE(si.item_code, '')) ~* '${SQL_UUID_TEXT_RE}'
    THEN TRIM(si.item_code)::uuid
    ELSE NULL
  END
)
`.trim();

/** firmNrParam: örn. `$1` — alış CTE ve satış filtresinde aynı indeks kullanılmalı */
export function buildLastPurchaseCte(firmNrParam = '$1'): string {
  return `
  last_purchase_by_id AS (
    SELECT DISTINCT ON (resolved_pid)
      resolved_pid AS product_id,
      unit_cost
    FROM (
      SELECT
        COALESCE(
          si.product_id,
          CASE
            WHEN TRIM(COALESCE(si.item_code, '')) ~* '${SQL_UUID_TEXT_RE}'
            THEN TRIM(si.item_code)::uuid
            ELSE NULL
          END,
          p_by_code.id,
          p_by_barcode.id
        ) AS resolved_pid,
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
        ) AS unit_cost,
        s.date,
        s.created_at
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      LEFT JOIN products p_by_code
        ON p_by_code.firm_nr = ${firmNrParam}
        AND NULLIF(TRIM(p_by_code.code), '') = NULLIF(TRIM(si.item_code), '')
      LEFT JOIN products p_by_barcode
        ON p_by_barcode.firm_nr = ${firmNrParam}
        AND NULLIF(TRIM(p_by_barcode.barcode), '') = NULLIF(TRIM(si.item_code), '')
      WHERE s.firm_nr = ${firmNrParam}
        AND COALESCE(s.is_cancelled, false) = false
        AND COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
        AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
        AND (
          LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
          OR COALESCE(s.trcode, 0) IN (${PURCHASE_TRCODES_SQL})
        )
        AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
    ) lp
    WHERE resolved_pid IS NOT NULL
    ORDER BY resolved_pid, date DESC NULLS LAST, created_at DESC NULLS LAST
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
      AND COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
      AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
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

/** Fatura dip indirimi için satır net toplamı (kar-zarar CTE zinciri) */
export function buildInvoiceLineScaleCte(): string {
  return `
  inv_line_scale AS (
    SELECT
      si.invoice_id,
      SUM(COALESCE(si.net_amount, 0)) AS lines_net
    FROM sale_items si
    GROUP BY si.invoice_id
  )
`.trim();
}

/** Son alış + dip indirim ölçeği — ProfitLoss / brüt kâr sorguları */
export function buildServiceRecipeCostCte(firmNrParam = '$1'): string {
  return `
  service_recipe_unit_cost AS (
    SELECT
      c.service_id,
      SUM(
        COALESCE(c.qty_per_service, 0) * COALESCE(
          NULLIF(lpc_id.unit_cost, 0),
          NULLIF(lpc_code.unit_cost, 0),
          NULLIF(lpc_pcode.unit_cost, 0),
          0
        )
      ) AS unit_recipe_cost
    FROM beauty_service_consumables c
    LEFT JOIN products p
      ON p.firm_nr = ${firmNrParam}
      AND p.id = c.product_id
    LEFT JOIN last_purchase_by_id lpc_id ON lpc_id.product_id = c.product_id
    LEFT JOIN last_purchase_by_code lpc_code
      ON lpc_code.item_code = NULLIF(TRIM(p.code), '')
    LEFT JOIN last_purchase_by_code lpc_pcode
      ON lpc_pcode.item_code = NULLIF(TRIM(p.barcode), '')
    GROUP BY c.service_id
  )
`.trim();
}

export function buildProfitCostCtes(firmNrParam = '$1'): string {
  return `${buildLastPurchaseCte(firmNrParam)},
  ${buildInvoiceLineScaleCte()},
  ${buildServiceRecipeCostCte(firmNrParam)}`;
}

export const INVOICE_LINE_SCALE_JOIN = `
  LEFT JOIN inv_line_scale ils ON ils.invoice_id = si.invoice_id
`.trim();

/**
 * Satış veya satış iadesi (alış / alış iade / açılış hariç).
 * İade satırları miktar ve tutarda pozitif saklanır; işaret SQL_SALES_SIGN ile uygulanır.
 */
export const SQL_PL_SALES_OR_RETURN = `
(
  (
    LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('sales_invoice', 'service', 'hizmet', 's')
    OR (
      COALESCE(s.trcode, 0) IN (${SALES_TRCODES_SQL})
      AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) NOT IN (
        'purchase_invoice', 'a', 'return_invoice', 'opening_balance'
      )
    )
  )
  OR COALESCE(s.trcode, 0) IN (${SALES_RETURN_TRCODES_SQL})
  OR (
    LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
    AND COALESCE(s.trcode, 0) NOT IN (${PURCHASE_TRCODES_SQL}, ${PURCHASE_RETURN_TRCODE})
  )
)
AND COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) NOT IN ('purchase_invoice', 'a', 'opening_balance')
`.trim();

/** Alış faturası (alış iade hariç) — InvoiceList Alis / son alış CTE ile aynı. */
export const SQL_PL_PURCHASE = `
(
  COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
  AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
  AND (
    LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
    OR COALESCE(s.trcode, 0) IN (${PURCHASE_TRCODES_SQL})
  )
)
`.trim();

/** Alış iade (trcode 6 veya return_invoice; satış iade 2/3 hariç). */
export const SQL_PL_PURCHASE_RETURN = `
(
  COALESCE(s.trcode, 0) = ${PURCHASE_RETURN_TRCODE}
  OR (
    LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
    AND COALESCE(s.trcode, 0) NOT IN (${SALES_RETURN_TRCODES_SQL})
  )
)
`.trim();

export const SQL_IS_SALES_RETURN = `
(
  COALESCE(s.trcode, 0) IN (${SALES_RETURN_TRCODES_SQL})
  OR (
    LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
    AND COALESCE(s.trcode, 0) NOT IN (${PURCHASE_TRCODES_SQL}, ${PURCHASE_RETURN_TRCODE})
  )
)
`.trim();

export const SQL_SALES_SIGN = `
CASE WHEN ${SQL_IS_SALES_RETURN} THEN -1 ELSE 1 END
`.trim();

/**
 * Dip indirim: satır net toplamı fatura net_amount’tan büyükse oransal ölçek.
 * Satır indirimi zaten si.net_amount içinde varsayılır.
 */
export const LINE_REVENUE_EXPR = `
(
  COALESCE(si.net_amount, 0) * (
    CASE
      WHEN COALESCE(ils.lines_net, 0) <> 0
        AND ABS(ils.lines_net - COALESCE(s.net_amount, 0)) > 0.009
      THEN COALESCE(s.net_amount, 0) / NULLIF(ils.lines_net, 0)
      ELSE 1
    END
  )
)
`.trim();

/**
 * product_id (veya UUID item_code) ile son alış; yoksa satır kodu / ürün kartı kodu.
 * Hizmet satırlarında: satır unit_cost → hizmet kartı purchase_price → beauty cost_price → reçete.
 * Malzemede alış bulunamazsa 0 (kart cost / satış satırı total_cost yok).
 */
export const SQL_IS_SERVICE_LINE = `
(
  LOWER(TRIM(COALESCE(si.item_type, 'Malzeme'))) IN ('hizmet', 'service', 'package', 'paket')
  OR svc.id IS NOT NULL
  OR bsvc.id IS NOT NULL
)
`.trim();

export const SQL_LINE_KIND_EXPR = `
CASE WHEN ${SQL_IS_SERVICE_LINE} THEN 'service' ELSE 'product' END
`.trim();

export const SQL_SERVICE_CATEGORY_EXPR = `
COALESCE(
  NULLIF(TRIM(svc.category), ''),
  NULLIF(TRIM(bsvc.parent_category), ''),
  NULLIF(TRIM(bsvc.category), ''),
  'Hizmet'
)
`.trim();

export const LINE_COST_EXPR = `
(
  CASE
    WHEN ${SQL_IS_SERVICE_LINE} THEN
      COALESCE(
        NULLIF(si.unit_cost, 0),
        NULLIF(svc.purchase_price, 0),
        NULLIF(bsvc.cost_price, 0),
        NULLIF(src.unit_recipe_cost, 0),
        0
      ) * COALESCE(si.quantity, 0)
    ELSE
      COALESCE(
        NULLIF(lpc_id.unit_cost, 0) * si.quantity,
        NULLIF(lpc_code.unit_cost, 0) * si.quantity,
        NULLIF(lpc_pcode.unit_cost, 0) * si.quantity,
        0
      )
  END
)
`.trim();

export const SIGNED_LINE_QTY_EXPR = `(${SQL_SALES_SIGN}) * COALESCE(si.quantity, 0)`;
export const SIGNED_LINE_REVENUE_EXPR = `(${SQL_SALES_SIGN}) * ${LINE_REVENUE_EXPR}`;
export const SIGNED_LINE_COST_EXPR = `(${SQL_SALES_SIGN}) * (${LINE_COST_EXPR})`;
export const SIGNED_LINE_PROFIT_EXPR = `(${SIGNED_LINE_REVENUE_EXPR}) - (${SIGNED_LINE_COST_EXPR})`;

/** Ürün kartı: product_id veya UUID item_code ile */
export function buildProductsJoin(firmNrParam = '$1'): string {
  return `
  LEFT JOIN products p
    ON p.firm_nr = ${firmNrParam}
    AND p.id = (${SQL_LINE_RESOLVED_PRODUCT_ID})
`.trim();
}

export const PRODUCTS_JOIN = buildProductsJoin('$1');

/** Hizmet kartı — satış satırı product_id / item_code ile */
export function buildServicesJoin(firmNrParam = '$1'): string {
  return `
  LEFT JOIN services svc
    ON svc.firm_nr = ${firmNrParam}
    AND (
      svc.id = (${SQL_LINE_RESOLVED_PRODUCT_ID})
      OR (
        NULLIF(TRIM(svc.code), '') IS NOT NULL
        AND NULLIF(TRIM(svc.code), '') = NULLIF(TRIM(si.item_code), '')
      )
    )
`.trim();
}

export const SERVICES_JOIN = buildServicesJoin('$1');

/** Güzellik hizmet kartı — cost_price (ERP services ile aynı id) */
export function buildBeautyServicesJoin(): string {
  return `
  LEFT JOIN beauty_services bsvc
    ON bsvc.id = (${SQL_LINE_RESOLVED_PRODUCT_ID})
`.trim();
}

export const BEAUTY_SERVICES_JOIN = buildBeautyServicesJoin();

/** Hizmet reçetesi (sarf × son alış) birim maliyeti */
export const SERVICE_RECIPE_COST_JOIN = `
  LEFT JOIN service_recipe_unit_cost src
    ON src.service_id = COALESCE(svc.id, bsvc.id, (${SQL_LINE_RESOLVED_PRODUCT_ID}))
`.trim();

/** Hizmet maliyeti için gereken join'ler (svc + beauty + reçete) */
export const SERVICE_COST_JOINS = `
  ${SERVICES_JOIN}
  ${BEAUTY_SERVICES_JOIN}
  ${SERVICE_RECIPE_COST_JOIN}
`.trim();

export const LAST_PURCHASE_JOIN = `
  LEFT JOIN last_purchase_by_id lpc_id
    ON lpc_id.product_id = (${SQL_LINE_RESOLVED_PRODUCT_ID})
  LEFT JOIN last_purchase_by_code lpc_code
    ON lpc_code.item_code = NULLIF(TRIM(si.item_code), '')
  LEFT JOIN last_purchase_by_code lpc_pcode
    ON lpc_pcode.item_code = NULLIF(TRIM(p.code), '')
`.trim();

const UUID_RE = new RegExp(SQL_UUID_TEXT_RE, 'i');

/** Satırdan ürün UUID (REST/JS) */
export function resolveLineProductId(it: {
  product_id?: unknown;
  item_code?: unknown;
}): string {
  const pid = it.product_id != null ? String(it.product_id).trim() : '';
  if (pid && UUID_RE.test(pid)) return pid;
  const code = String(it.item_code ?? '').trim();
  if (code && UUID_RE.test(code)) return code;
  return '';
}

export function isUuidText(value: unknown): boolean {
  return UUID_RE.test(String(value ?? '').trim());
}

/** Rapor alt satırı: kart kodu; UUID item_code gösterilmez. */
export function displayItemCode(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (!s || s === '—' || isUuidText(s)) continue;
    return s;
  }
  return '—';
}

export function isServiceLineType(itemType?: unknown): boolean {
  const t = String(itemType || '').trim().toLocaleLowerCase('tr-TR');
  return t === 'hizmet' || t === 'service' || t === 'package' || t === 'paket';
}

export function sqlLineKindFilter(kind: 'all' | 'product' | 'service'): string {
  if (kind === 'service') return `AND (${SQL_IS_SERVICE_LINE})`;
  if (kind === 'product') return `AND NOT (${SQL_IS_SERVICE_LINE})`;
  return '';
}

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

/** REST: satır unit_cost → hizmet alış → güzellik cost_price → reçete (0 atlanır). */
export function restServiceUnitCost(opts: {
  lineUnitCost?: unknown;
  purchasePrice?: unknown;
  beautyCostPrice?: unknown;
  recipeUnitCost?: unknown;
}): number {
  for (const v of [
    opts.lineUnitCost,
    opts.purchasePrice,
    opts.beautyCostPrice,
    opts.recipeUnitCost,
  ]) {
    const n = Number(v ?? 0);
    if (n) return n;
  }
  return 0;
}

/**
 * Satır COGS: malzeme → son alış birim × miktar; hizmet → hizmet birim maliyeti × miktar.
 * İşaret (iade) çağıran tarafta uygulanır.
 */
export function lineCostAmount(opts: {
  quantity: number;
  lastPurchaseUnit?: number;
  itemType?: unknown;
  serviceUnitCost?: number;
  /** item_type Malzeme olsa bile güzellik/hizmet kartı eşleştiyse true */
  isService?: boolean;
}): number {
  const qty = Number(opts.quantity) || 0;
  const asService = opts.isService === true || isServiceLineType(opts.itemType);
  if (asService) {
    const u = Number(opts.serviceUnitCost) || 0;
    if (u) return u * qty;
    return 0;
  }
  const lpc = Number(opts.lastPurchaseUnit) || 0;
  if (lpc) return lpc * qty;
  return 0;
}

export function isPurchaseFiche(row: {
  fiche_type?: unknown;
  trcode?: unknown;
}): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  const tc = Number(row.trcode ?? 0);
  if (tc === PURCHASE_RETURN_TRCODE) return false;
  if (ft === 'return_invoice') return false;
  if (ft === 'purchase_invoice' || ft === 'a') return true;
  return (PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc);
}

export function isSalesReturnFiche(row: {
  fiche_type?: unknown;
  trcode?: unknown;
}): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  const tc = Number(row.trcode ?? 0);
  if ((SALES_RETURN_TRCODES as readonly number[]).includes(tc)) return true;
  if (ft !== 'return_invoice') return false;
  if (tc === PURCHASE_RETURN_TRCODE) return false;
  if ((PURCHASE_ONLY_TRCODES as readonly number[]).includes(tc)) return false;
  return true;
}

export function isPlSalesOrReturnFiche(row: {
  fiche_type?: unknown;
  trcode?: unknown;
}): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  const tc = Number(row.trcode ?? 0);
  if (tc === PURCHASE_RETURN_TRCODE) return false;
  if (ft === 'purchase_invoice' || ft === 'a' || ft === 'opening_balance') return false;
  if (isPurchaseFiche(row)) return false;
  if (isSalesReturnFiche(row)) return true;
  if (ft === 'sales_invoice' || ft === 'service' || ft === 'hizmet' || ft === 's') return true;
  if (tc === 7 || tc === 8) return true;
  return false;
}

/** Dip indirim: satır netini fatura net_amount’a oranla */
export function scaleLineRevenueToInvoiceNet(
  lineNet: number,
  linesNetSum: number,
  invoiceNet: number,
): number {
  const line = Number(lineNet) || 0;
  const sum = Number(linesNetSum) || 0;
  const inv = Number(invoiceNet) || 0;
  if (!sum || Math.abs(sum - inv) <= 0.009) return line;
  return line * (inv / sum);
}
