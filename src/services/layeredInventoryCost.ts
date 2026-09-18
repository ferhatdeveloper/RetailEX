/**
 * Dönem içi stok/fatura hareketlerini toplu çeker (N+1 yok) ve FIFO katman maliyeti üretir.
 * Kaynak: malzeme ekstresi ile aynı — ambar fişi satır birim fiyatı + alış faturası birim tutarı.
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from './postgres';
import {
  isPurchaseFiche,
  isPlSalesOrReturnFiche,
  isSalesReturnFiche,
  PURCHASE_RETURN_TRCODE,
  unitCostFromPurchaseLine,
  isServiceLineType,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
  SIGNED_LINE_QTY_EXPR,
  SIGNED_LINE_REVENUE_EXPR,
  SQL_SALES_SIGN,
  buildProfitCostCtes,
  PRODUCTS_JOIN,
  SERVICES_JOIN,
  INVOICE_LINE_SCALE_JOIN,
  resolveLineProductId,
  scaleLineRevenueToInvoiceNet,
} from '../utils/lastPurchaseCostSql';
import { localCalendarDateKey, localTodayDateKey, toSqlDateInputString } from '../utils/localCalendarDate';
import {
  applyFifoLayers,
  dedupeLayerMovements,
  lookupLayeredOnHand,
  consumeFifoForQuantity,
  buildCostProfitRows,
  type LayerMovement,
  type LayeredOnHand,
  type FifoApplyResult,
  type CostProfitRow,
} from '../utils/layeredInventoryCost';

export type OnHandProduct = {
  id?: string | null;
  code?: string | null;
  barcode?: string | null;
  stock?: number | null;
};

export type LayeredInventoryValuation = FifoApplyResult & {
  aliases: Map<string, string>;
};

function padFirm(raw?: string | number | null): string {
  return String(raw || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
}

function padPeriod(raw?: string | number | null): string {
  return String(raw || ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0');
}

function asIsoDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asCalendarDate(value: unknown): string {
  const fromSql = toSqlDateInputString(value);
  if (fromSql) return fromSql;
  const key = localCalendarDateKey(value as string | Date | number | null | undefined);
  if (key) return key;
  return asIsoDate(value).slice(0, 10);
}

/** Perakende / POS / güzellik ürün satış veya satış iadesi (alış/teklif hariç). */
const RETAIL_SALE_TRCODES = new Set([7, 8, 9, 14, 29, 32]);
const RETAIL_SALE_FICHES = new Set([
  'sales_invoice',
  's',
  'service',
  'hizmet',
  'pos',
  'retail',
  'beauty',
  'beauty_sale',
  'market_pos',
]);

function isRetailOrBeautyProductSale(row: { fiche_type?: unknown; trcode?: unknown }): boolean {
  if (isPurchaseFiche(row)) return false;
  const ft = String(row.fiche_type || '').trim().toLowerCase();
  if (ft === 'purchase_invoice' || ft === 'a' || ft === 'opening_balance' || ft === 'quote' || ft === 'order') {
    return false;
  }
  if (isPlSalesOrReturnFiche(row) || isSalesReturnFiche(row)) return true;
  if (RETAIL_SALE_FICHES.has(ft)) return true;
  const tc = Number(row.trcode ?? 0);
  return RETAIL_SALE_TRCODES.has(tc);
}

const SQL_NOT_REMOVED_SALE = `
COALESCE(s.is_cancelled, false) = false
AND LOWER(TRIM(COALESCE(NULLIF(TRIM(COALESCE(s.status, '')), ''), 'approved')))
  NOT IN ('cancelled', 'canceled', 'void', 'iptal', 'silindi', 'deleted', 'refunded', 'draft')
`.trim();

const SQL_RETAIL_PRODUCT_SALE = `
(
  ${SQL_PL_SALES_OR_RETURN}
  OR COALESCE(s.trcode, 0) IN (7, 8, 9, 14, 29, 32)
  OR LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN (
    'sales_invoice', 's', 'service', 'hizmet', 'pos', 'retail', 'beauty', 'beauty_sale', 'market_pos'
  )
)
AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) NOT IN (
  'purchase_invoice', 'a', 'opening_balance', 'quote', 'order', 'waybill'
)
`.trim();

function skipSlipStatus(status: unknown): boolean {
  const st = String(status || '').trim().toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'void' || st === 'iptal';
}

function skipInvoiceStatus(status: unknown, isCancelled: unknown): boolean {
  if (isCancelled === true || isCancelled === 'true' || isCancelled === 1) return true;
  const st = String(status || '').trim().toLowerCase();
  return (
    st === 'cancelled' ||
    st === 'canceled' ||
    st === 'void' ||
    st === 'iptal' ||
    st === 'silindi' ||
    st === 'deleted' ||
    st === 'refunded' ||
    st === 'draft'
  );
}

function slipDirection(movementType: unknown): 'in' | 'out' | null {
  const mt = String(movementType || '').trim().toLowerCase();
  if (mt === 'in' || mt === 'giris' || mt === 'giriş') return 'in';
  if (mt === 'out' || mt === 'cikis' || mt === 'çıkış') return 'out';
  if (mt === 'transfer' || mt === 'price_change') return null;
  return null;
}

async function loadProductAliases(
  firmNr: string,
  periodNr: string,
): Promise<Map<string, string>> {
  const aliases = new Map<string, string>();
  try {
    const { rows } = await postgres.query<{ id: string; code?: string; barcode?: string }>(
      `SELECT id::text AS id, code, barcode FROM products`,
      [],
      { firmNr, periodNr },
    );
    for (const r of rows || []) {
      const id = String(r.id || '').trim();
      if (!id) continue;
      const code = String(r.code || '').trim();
      const barcode = String(r.barcode || '').trim();
      if (code) aliases.set(code, id);
      if (barcode) aliases.set(barcode, id);
    }
  } catch (err) {
    console.warn('[layeredInventoryCost] products alias query failed', err);
  }
  return aliases;
}

function resolveProductId(
  rawId: unknown,
  itemCode: unknown,
  aliases: Map<string, string>,
): string {
  const pid = String(rawId || '').trim();
  if (pid) return pid;
  const code = String(itemCode || '').trim();
  if (!code) return '';
  return aliases.get(code) || code;
}

async function loadSlipMovements(
  firmNr: string,
  periodNr: string,
  aliases: Map<string, string>,
): Promise<LayerMovement[]> {
  try {
    const { rows } = await postgres.query<Record<string, unknown>>(
      `SELECT
          i.id::text AS id,
          i.product_id::text AS product_id,
          i.quantity,
          i.unit_price,
          i.cost_price,
          m.movement_date,
          COALESCE(m.created_at, i.created_at) AS created_at,
          m.movement_type,
          m.trcode,
          m.document_no,
          m.status
        FROM stock_movement_items i
        JOIN stock_movements m ON m.id = i.movement_id
        WHERE ABS(COALESCE(i.quantity, 0)) > 0.0000001`,
      [],
      { firmNr, periodNr },
    );
    const out: LayerMovement[] = [];
    for (const r of rows || []) {
      if (skipSlipStatus(r.status)) continue;
      const direction = slipDirection(r.movement_type);
      if (!direction) continue;
      const productId = resolveProductId(r.product_id, null, aliases);
      if (!productId) continue;
      const qty = Math.abs(Number(r.quantity) || 0);
      const unitCost =
        direction === 'in'
          ? Number(r.unit_price) || Number(r.cost_price) || 0
          : 0;
      out.push({
        id: `slip:${String(r.id)}`,
        productId,
        date: asCalendarDate(r.movement_date || r.created_at),
        createdAt: asIsoDate(r.created_at),
        direction,
        quantity: qty,
        unitCost: Math.max(0, unitCost),
        source: 'slip',
        documentNo: String(r.document_no || '').trim(),
      });
    }
    return out;
  } catch (err) {
    console.warn('[layeredInventoryCost] slip movements query failed', err);
    return [];
  }
}

async function loadInvoiceMovements(
  firmNr: string,
  periodNr: string,
  aliases: Map<string, string>,
): Promise<LayerMovement[]> {
  try {
    const { rows } = await postgres.query<Record<string, unknown>>(
      `SELECT
          si.id::text AS id,
          si.product_id::text AS product_id,
          TRIM(COALESCE(si.item_code, '')) AS item_code,
          si.quantity,
          si.unit_price,
          si.unit_cost,
          si.net_amount,
          si.total_amount,
          COALESCE(si.item_type, 'Malzeme') AS item_type,
          s.date,
          s.created_at,
          s.fiche_no,
          s.fiche_type,
          s.trcode
        FROM sale_items si
        JOIN sales s ON s.id = si.invoice_id
        WHERE ${SQL_NOT_REMOVED_SALE}
          AND ABS(COALESCE(si.quantity, 0)) > 0.0000001`,
      [],
      { firmNr, periodNr },
    );
    const out: LayerMovement[] = [];
    for (const r of rows || []) {
      if (isServiceLineType(r.item_type)) continue;
      const fiche = { fiche_type: r.fiche_type, trcode: r.trcode };
      const productId = resolveProductId(r.product_id, r.item_code, aliases);
      if (!productId) continue;
      const qty = Math.abs(Number(r.quantity) || 0);
      const doc = String(r.fiche_no || '').trim();
      const date = asCalendarDate(r.date || r.created_at);
      const createdAt = asIsoDate(r.created_at);

      if (isPurchaseFiche(fiche)) {
        out.push({
          id: `inv:${String(r.id)}`,
          productId,
          date,
          createdAt,
          direction: 'in',
          quantity: qty,
          unitCost: Math.max(0, unitCostFromPurchaseLine(r)),
          source: 'invoice',
          documentNo: doc,
        });
        continue;
      }

      const tr = Number(r.trcode ?? 0);
      if (tr === PURCHASE_RETURN_TRCODE || (String(r.fiche_type || '').toLowerCase() === 'return_invoice' && !isSalesReturnFiche(fiche) && !isPlSalesOrReturnFiche(fiche))) {
        out.push({
          id: `inv:${String(r.id)}`,
          productId,
          date,
          createdAt,
          direction: 'out',
          quantity: qty,
          unitCost: 0,
          source: 'invoice',
          documentNo: doc,
        });
        continue;
      }

      if (isSalesReturnFiche(fiche)) {
        const restored =
          Number(r.unit_cost) || unitCostFromPurchaseLine({ ...r, unit_price: 0 }) || 0;
        out.push({
          id: `inv:${String(r.id)}`,
          productId,
          date,
          createdAt,
          direction: 'in',
          quantity: qty,
          unitCost: Math.max(0, restored),
          source: 'invoice',
          documentNo: doc,
          cogsKind: 'return',
        });
        continue;
      }

      if (isRetailOrBeautyProductSale(fiche)) {
        out.push({
          id: `inv:${String(r.id)}`,
          productId,
          date,
          createdAt,
          direction: 'out',
          quantity: qty,
          unitCost: 0,
          source: 'invoice',
          documentNo: doc,
          cogsKind: 'sale',
        });
      }
    }
    return out;
  } catch (err) {
    console.warn('[layeredInventoryCost] invoice movements query failed', err);
    return [];
  }
}

function onHandMap(
  products: OnHandProduct[] | undefined,
  aliases: Map<string, string>,
): Map<string, number> | undefined {
  if (!products?.length) return undefined;
  const map = new Map<string, number>();
  for (const p of products) {
    const id = resolveProductId(p.id, p.code || p.barcode, aliases);
    if (!id) continue;
    map.set(id, Number(p.stock) || 0);
  }
  return map;
}

export async function fetchLayeredInventoryValuation(opts?: {
  firmNr?: string | number;
  periodNr?: string | number;
  todayKey?: string;
  cogsFromKey?: string;
  cogsToKey?: string;
  onHandProducts?: OnHandProduct[];
}): Promise<LayeredInventoryValuation> {
  const firmNr = padFirm(opts?.firmNr);
  const periodNr = padPeriod(opts?.periodNr);
  const aliases = await loadProductAliases(firmNr, periodNr);
  const [slips, invoices] = await Promise.all([
    loadSlipMovements(firmNr, periodNr, aliases),
    loadInvoiceMovements(firmNr, periodNr, aliases),
  ]);
  const movements = dedupeLayerMovements([...invoices, ...slips]);
  const applied = applyFifoLayers(movements, {
    todayKey: opts?.todayKey || localTodayDateKey(),
    cogsFromKey: opts?.cogsFromKey,
    cogsToKey: opts?.cogsToKey,
    onHandByProductId: onHandMap(opts?.onHandProducts, aliases),
  });
  return { ...applied, aliases };
}

export function layeredCostForProduct(
  valuation: LayeredInventoryValuation | null | undefined,
  product: OnHandProduct,
): number {
  if (!valuation) return 0;
  return lookupLayeredOnHand(valuation.byProductId, product, valuation.aliases)?.layeredCost || 0;
}

export function layeredAvgForProduct(
  valuation: LayeredInventoryValuation | null | undefined,
  product: OnHandProduct,
): number {
  if (!valuation) return 0;
  return lookupLayeredOnHand(valuation.byProductId, product, valuation.aliases)?.avgUnitCost || 0;
}

type SaleLineRaw = {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  fallbackCogs: number;
};

async function loadCostProfitSaleLinesSql(opts: {
  firmNr: string;
  periodNr: string;
  start: string;
  end: string;
}): Promise<SaleLineRaw[]> {
  const profitCtes = buildProfitCostCtes('$1');
  const { rows } = await postgres.query<Record<string, unknown>>(
    `
    WITH ${profitCtes}
    SELECT
      COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '') AS product_id,
      COALESCE(
        NULLIF(TRIM(p.code), ''),
        NULLIF(TRIM(svc.code), ''),
        NULLIF(TRIM(si.item_code), ''),
        '—'
      ) AS product_code,
      COALESCE(
        NULLIF(TRIM(si.item_name), ''),
        p.name,
        svc.name,
        '—'
      ) AS product_name,
      COALESCE(SUM(${SIGNED_LINE_QTY_EXPR}), 0) AS quantity,
      COALESCE(SUM(${SIGNED_LINE_REVENUE_EXPR}), 0) AS revenue,
      COALESCE(SUM(
        (${SQL_SALES_SIGN}) * ABS(COALESCE(si.quantity, 0)) * COALESCE(NULLIF(si.unit_cost, 0), 0)
      ), 0) AS fallback_cogs
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.invoice_id
    ${PRODUCTS_JOIN}
    ${SERVICES_JOIN}
    ${INVOICE_LINE_SCALE_JOIN}
    WHERE ${SQL_NOT_REMOVED_SALE}
      AND ${SQL_RETAIL_PRODUCT_SALE}
      AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
      AND LEFT(COALESCE(s.date, s.created_at)::text, 10) >= $2
      AND LEFT(COALESCE(s.date, s.created_at)::text, 10) <= $3
    GROUP BY 1, 2, 3
    HAVING ABS(COALESCE(SUM(${SIGNED_LINE_QTY_EXPR}), 0)) > 0.0001
        OR ABS(COALESCE(SUM(${SIGNED_LINE_REVENUE_EXPR}), 0)) > 0.009
    `,
    [opts.firmNr, opts.start, opts.end],
    { firmNr: opts.firmNr, periodNr: opts.periodNr },
  );
  return (rows || []).map((r) => ({
    productId: String(r.product_id ?? ''),
    productCode: String(r.product_code ?? ''),
    productName: String(r.product_name ?? ''),
    quantity: Number(r.quantity ?? 0) || 0,
    revenue: Number(r.revenue ?? 0) || 0,
    fallbackCogs: Number(r.fallback_cogs ?? 0) || 0,
  }));
}

async function loadCostProfitSaleLinesRest(opts: {
  firmNr: string;
  periodNr: string;
  start: string;
  end: string;
}): Promise<SaleLineRaw[]> {
  const { postgrest } = await import('./api/postgrestClient');
  const fn = opts.firmNr;
  const pn = opts.periodNr;
  const [sales, items, products] = await Promise.all([
    postgrest
      .get<Record<string, unknown>[]>(
        `/rex_${fn}_${pn}_sales`,
        {
          select: 'id,date,fiche_type,is_cancelled,status,trcode,created_at,net_amount',
          order: 'date.desc',
          limit: '12000',
        },
        { schema: 'public' },
      )
      .catch(() => [] as Record<string, unknown>[]),
    postgrest
      .get<Record<string, unknown>[]>(
        `/rex_${fn}_${pn}_sale_items`,
        {
          select:
            'invoice_id,product_id,item_code,item_name,item_type,quantity,net_amount,unit_price,unit_cost,total_cost',
          limit: '20000',
        },
        { schema: 'public' },
      )
      .catch(() => [] as Record<string, unknown>[]),
    postgrest
      .get<Record<string, unknown>[]>(
        `/rex_${fn}_products`,
        { select: 'id,code,barcode,name', limit: '8000' },
        { schema: 'public' },
      )
      .catch(() => [] as Record<string, unknown>[]),
  ]);

  const salesById = new Map((sales || []).map((s) => [String(s.id), s]));
  const productById = new Map((products || []).map((p) => [String(p.id), p]));
  const productIdByCode = new Map<string, string>();
  for (const p of products || []) {
    const id = String(p.id);
    const code = String(p.code || '').trim();
    const barcode = String(p.barcode || '').trim();
    if (code) productIdByCode.set(code, id);
    if (barcode) productIdByCode.set(barcode, id);
  }

  const saleOk = new Set(
    (sales || [])
      .filter((s) => {
        if (skipInvoiceStatus(s.status, s.is_cancelled)) return false;
        if (!isRetailOrBeautyProductSale(s)) return false;
        const d = asCalendarDate(s.date || s.created_at);
        return d >= opts.start && d <= opts.end;
      })
      .map((s) => String(s.id)),
  );

  const linesNetByInvoice = new Map<string, number>();
  for (const it of items || []) {
    const iid = String(it.invoice_id || '');
    if (!iid) continue;
    linesNetByInvoice.set(iid, (linesNetByInvoice.get(iid) || 0) + (Number(it.net_amount ?? 0) || 0));
  }

  const map = new Map<string, SaleLineRaw>();
  for (const it of items || []) {
    if (!saleOk.has(String(it.invoice_id))) continue;
    const itemType = String(it.item_type || 'Malzeme');
    if (itemType === 'Promosyon' || itemType === 'İndirim') continue;
    const inv = salesById.get(String(it.invoice_id));
    if (!inv) continue;
    const sgn = isSalesReturnFiche(inv) ? -1 : 1;
    const pid =
      resolveLineProductId(it) ||
      productIdByCode.get(String(it.item_code || '').trim()) ||
      '';
    const prod = pid ? productById.get(pid) : undefined;
    const code =
      String(prod?.code || '').trim() ||
      String(it.item_code || it.product_id || '—');
    const qty = sgn * (Number(it.quantity ?? 0) || 0);
    const rawLineNet = Number(it.net_amount ?? 0) || 0;
    const revenue =
      sgn *
      scaleLineRevenueToInvoiceNet(
        rawLineNet,
        linesNetByInvoice.get(String(it.invoice_id)) || 0,
        Number(inv.net_amount ?? 0) || 0,
      );
    const absQty = Math.abs(Number(it.quantity ?? 0) || 0);
    const fallbackCogs = sgn * absQty * (Number(it.unit_cost ?? 0) || 0);
    const key = `${pid || code}`;
    const cur = map.get(key) || {
      productId: pid,
      productCode: code,
      productName: String(it.item_name ?? prod?.name ?? ''),
      quantity: 0,
      revenue: 0,
      fallbackCogs: 0,
    };
    cur.quantity += qty;
    cur.revenue += revenue;
    cur.fallbackCogs += fallbackCogs;
    if (!cur.productName && it.item_name) cur.productName = String(it.item_name);
    map.set(key, cur);
  }
  return Array.from(map.values());
}

/**
 * Maliyet ve Karlılık Analizi: satış satırları (perakende/POS/güzellik ürün) + katmanlı SMM.
 * getPaginated items:[] kullanılmaz; ürün kartı cost kullanılmaz.
 */
export async function getCostProfitAnalysis(opts: {
  startDate: string;
  endDate: string;
  firmNr?: string | number;
  periodNr?: string | number;
}): Promise<CostProfitRow[]> {
  const start = toSqlDateInputString(opts.startDate) || String(opts.startDate || '').slice(0, 10);
  const end = toSqlDateInputString(opts.endDate) || String(opts.endDate || '').slice(0, 10);
  if (!start || !end) return [];
  const firmNr = padFirm(opts.firmNr);
  const periodNr = padPeriod(opts.periodNr);

  let lines: SaleLineRaw[] = [];
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      lines = await loadCostProfitSaleLinesRest({ firmNr, periodNr, start, end });
    } else {
      lines = await loadCostProfitSaleLinesSql({ firmNr, periodNr, start, end });
    }
  } catch (err) {
    console.warn('[layeredInventoryCost] sale lines query failed, REST yedek', err);
    try {
      lines = await loadCostProfitSaleLinesRest({ firmNr, periodNr, start, end });
    } catch (err2) {
      console.error('[layeredInventoryCost] cost-profit sale lines failed', err2);
      lines = [];
    }
  }

  let valuation: LayeredInventoryValuation | null = null;
  try {
    valuation = await fetchLayeredInventoryValuation({
      firmNr,
      periodNr,
      cogsFromKey: start,
      cogsToKey: end,
    });
  } catch (err) {
    console.warn('[layeredInventoryCost] FIFO layers unavailable; SMM yedek/0', err);
  }

  return buildCostProfitRows(
    lines,
    valuation?.periodCogsByProductId || new Map(),
    valuation?.aliases,
  );
}

export { lookupLayeredOnHand, consumeFifoForQuantity };
export type { LayeredOnHand, CostProfitRow };
