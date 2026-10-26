/**
 * ERP çekirdek raporları — mevcut server tablolarından (sales, cash_lines, bank_lines, customers, suppliers).
 * Yeni view/tablo yok; LIMIT ile ağır sorgular sınırlanır.
 */
import type { InvoiceItemsDetailRow } from '../../components/reports/InvoiceItemsDetailReport';
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  normalizeFirmTableNr,
  normalizeTrText,
  cardFirmNrMatches,
  sqlFirmScopedCardMatch,
} from './accountBalance';
import { supplierAPI } from './suppliers';
import {
  buildEkstreRows,
  isCariCreditorsReportRow,
  isCariDebtorsReportRow,
  resolveEkstreDescription,
} from '../../utils/cariAccountStatement';
import { sortCariBalanceForReport } from './cariBalanceSort';
import { SQL_COUNTABLE_SALE_STATUS } from '../../utils/saleInvoiceStatus';
import { localTodayDateKey } from '../../utils/localCalendarDate';
import { SQL_PRODUCT_SALES_MATERIAL_ONLY } from '../../utils/productSalesReportFilters';
import { settleProductPeriodSalesNet } from '../../utils/productPeriodSalesNet';
import { mapPartySalesPeriodAmounts } from '../../utils/partySalesPeriodNet';
import {
  buildPartySalesByPeriodSql,
  normalizePartySalesPartyIds,
} from '../../utils/partySalesPeriodQuery';
import {
  buildProfitCostCtes,
  INVOICE_LINE_SCALE_JOIN,
  isPlSalesOrReturnFiche,
  isPurchaseFiche,
  isSalesReturnFiche,
  displayItemCode,
  isExplicitProductItemType,
  isServiceLineType,
  LAST_PURCHASE_JOIN,
  lineCostAmount,
  restServiceUnitCost,
  PRODUCTS_JOIN,
  SERVICE_COST_JOINS,
  resolveLineProductId,
  resolveBeautyLineNet,
  SIGNED_FOLD_LINE_REVENUE_EXPR,
  SIGNED_LINE_COST_EXPR,
  SIGNED_LINE_QTY_EXPR,
  SQL_DISPLAY_ITEM_CODE,
  SQL_FICHE_DEPOSIT_LIST,
  SQL_FICHE_REMAINDER_LIST,
  SQL_SERVICE_DEPOSIT_AMOUNT,
  SQL_IS_SERVICE_LINE,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
  SQL_SALES_SIGN,
  unitCostFromPurchaseLine,
  BEAUTY_APPOINTMENT_BRIDGE_JOIN,
  SQL_BEAUTY_APPT_INCLUDED,
} from '../../utils/lastPurchaseCostSql';
import {
  mergeCashLedgerRefunds,
  type SalesCashRefundSource,
} from '../../utils/reportReturnCashSign';
import {
  invoiceItemsDetailTypeLabel,
  mapInvoiceItemsDetailAmounts,
} from '../../utils/invoiceItemsDetailAmounts';
import {
  productCardUnitCost,
  SQL_PRODUCT_CARD_UNIT_COST,
} from '../../utils/productCardUnitCost';
import { lookupWeightedAvgUnitCost } from '../weightedAverageUnitCost';
import { classifyCriticalStockLevel } from '../../utils/productStockLevels';
import { productGrossProfitMarginPct } from '../../utils/productGrossProfitMargin';
import { mapReturnReportRows, type ReturnReportKind } from '../../utils/returnReportRows';
import { inferQtyFromRevenue } from '../../utils/lineGrossProfit';
import { parseFicheDepositList } from '../../utils/beautyDepositAllocation';
import { foldProductProfitSaleLines, foldRestProfitInvoice } from '../../utils/productProfitClosedSale';
import { looksLikeUuid } from '../../utils/pgUuid';
import {
  applyCashFlowAccountName,
  cashFlowAccountSql,
  cashFlowSalesFicheKeys,
  type CashFlowLineRef,
  type CashFlowNameIndexes,
} from '../../utils/cashFlowAccountName';
import { foldCashFlowByFiche } from '../../utils/cashFlowByFiche';
import { cashVirmanDirection, withCashVirmanLines } from '../../utils/cashVirman';

const ROW_LIMIT = 3000;

/**
 * Takvim günü (UTC) — `AT TIME ZONE` yalnızca timestamp/timestamptz kabul eder.
 * Text kolonlarda `col AT TIME ZONE 'UTC'` → `timezone(unknown, text)` hatası verir;
 * önce `::timestamptz` cast zorunlu.
 */
const sqlUtcDate = (col: string) => `(${col}::timestamptz AT TIME ZONE 'UTC')::date`;

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export interface CariAgingRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  cardType: 'customer' | 'supplier';
  ficheNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysOverdue: number;
  bucket: AgingBucket;
  termsDays: number;
}

export interface CariBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  cardType: 'customer' | 'supplier' | 'employee' | 'partner';
  /**
   * `customers.balance` / `suppliers.balance` kolonundan okunan ham bakiye.
   * Rezervasyon avansı (`cash_lines.special_code='REZERVASYON'`) dahil
   * — kullanıcıya bu alanı göstermek için değil, ekstre mutabakatı
   * veya Excel export gibi "ledger ham" gerektiren yerlerde kullanılır.
   * Cari Hesap Özeti raporu ise `pendingDeposit`'i ayırıp bakiyeden
   * düşerek raporlar (`effectiveBalance`).
   */
  balance: number;
  /**
   * Henüz hizmet verilmemiş rezervasyon avansı toplamı.
   * Kaynak: `cash_lines` (transaction_type='CH_TAHSILAT' AND
   * special_code IN ('REZERVASYON','AVANS')). Bakiyeden ayrı
   * gösterilir; geri ödenmeyeceği varsayımıyla cari alacak bakiyesine
   * dahil edilmez.
   */
  pendingDeposit: number;
  creditLimit: number;
  paymentTerms: string;
  /** Cari kart telefonu (varsa) */
  phone?: string;
}

export interface CashBankMovementRow {
  id: string;
  source: 'cash' | 'bank';
  registerId: string;
  registerName: string;
  registerCode: string;
  ficheNo: string;
  date: string;
  transactionType: string;
  definition: string;
  amount: number;
  sign: number;
  netAmount: number;
  accountName: string;
  /** Virman hedef kasası. Kaynak satırda dolu, hedef satırda kaynak kasa. */
  targetRegisterId?: string;
  /** Satırın para birimi. USD virmanı IQD toplama yazılmaz. */
  currency?: string;
  /** Karşı kasanın adı. Eksik hedef satırı bu adla gösterilir. */
  targetRegisterName?: string;
}

export interface PurchaseSummaryRow {
  periodKey: string;
  periodLabel: string;
  supplierName: string;
  invoiceCount: number;
  totalAmount: number;
  returnAmount: number;
  netAmount: number;
}

/** Tedarikçi bazlı alış + alış iadesi özeti */
export interface SupplierPurchaseReturnRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  purchaseCount: number;
  returnCount: number;
  purchaseAmount: number;
  returnAmount: number;
  netAmount: number;
}

/** Alış faturaları (trcode 6 = alış iade hariç) — InvoiceList Alis ile uyumlu */
const PURCHASE_ONLY_TRCODES = [1, 4, 5, 13, 26, 41, 42] as const;
const PURCHASE_RETURN_TRCODE = 6;
const SALES_RETURN_TRCODES = [2, 3] as const;

function isPurchaseInvoiceRow(row: { fiche_type?: unknown; trcode?: unknown }): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  const tr = Number(row.trcode ?? 0);
  if (tr === PURCHASE_RETURN_TRCODE || (SALES_RETURN_TRCODES as readonly number[]).includes(tr)) return false;
  if (ft === 'return_invoice') return false;
  return ft === 'purchase_invoice' || ft === 'a' || (PURCHASE_ONLY_TRCODES as readonly number[]).includes(tr);
}

function isPurchaseReturnInvoiceRow(
  row: { fiche_type?: unknown; trcode?: unknown; customer_id?: unknown },
  supplierIds?: Set<string>,
): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  const tr = Number(row.trcode ?? 0);
  if (tr === PURCHASE_RETURN_TRCODE) return true;
  if ((SALES_RETURN_TRCODES as readonly number[]).includes(tr)) return false;
  if (ft !== 'return_invoice') return false;
  if (!supplierIds) return true;
  const id = String(row.customer_id || '');
  return Boolean(id && supplierIds.has(id));
}

export interface CollectionDueRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  ficheNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysUntilDue: number;
  status: 'overdue' | 'due_soon' | 'upcoming';
}

export interface SalesReturnRow {
  id: string;
  ficheNo: string;
  date: string;
  accountName: string;
  paymentMethod: string;
  /** Belge net tutarı. İşaret ve büyüklük kaynak fişteki gibi kalır. */
  netAmount: number;
  cashier: string;
  notes: string;
  /** trcode ve fiche_type. Cari adından türetilmez. */
  returnKind: ReturnReportKind;
  trcode: number;
  ficheType: string;
}

export interface ProductGrossProfitRow {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
  /** Malzeme | Hizmet — brüt kâr ayrımı */
  lineKind?: 'product' | 'service';
}

/**
 * Malzeme satırlarında maliyet = ağırlıklı ortalama birim alış × işaretli miktar.
 * Birim, envanter listesiyle aynıdır (ağırlıklı ortalama → katman → kart alış).
 * Satış iadesinde miktar eksi olduğu için maliyet de eksi yazılır.
 * Satış gelirinin yüzdesi maliyet sayılmaz. Hizmet satırı olduğu gibi kalır.
 * Birim bulunamazsa satırın önceki maliyeti korunur; 0 uydurulmaz.
 */
async function applyWeightedAvgCostToGrossProfit(
  rows: ProductGrossProfitRow[],
  firmNr?: string | number | null,
  _asOfDate?: string | null,
): Promise<ProductGrossProfitRow[]> {
  if (!rows.length) return rows;
  if (!rows.some((r) => r.lineKind !== 'service')) return rows;
  try {
    const { makeInventoryPurchaseUnitLookup } = await import('../layeredInventoryCost');
    const { applyProductGrossProfitWeightedCosts } = await import('../../utils/productGrossProfitCost');
    const unitOf = await makeInventoryPurchaseUnitLookup({
      firmNr: firmNr ?? ERP_SETTINGS.firmNr,
      periodNr: ERP_SETTINGS.periodNr,
    });
    return applyProductGrossProfitWeightedCosts(rows, (ref) =>
      unitOf({
        id: ref.productId,
        code: ref.productCode,
        name: ref.productName,
      }),
    );
  } catch (e) {
    console.warn('[erpReports] inventory purchase cost overlay failed:', e);
    return rows;
  }
}

/**
 * Stok değerleme birim maliyeti — Malzeme Değer / Stok Durumu ile aynı öncelik:
 * 1) ağırlıklı ort. alış (Σ tutar / Σ miktar)
 * 2) kart cost → purchase_price
 * Satış fiyatına düşülmez.
 */
async function loadStockValuationUnitCostMaps(firmNr?: string | number | null) {
  try {
    const { fetchWeightedAverageUnitCosts } = await import('../weightedAverageUnitCost');
    return await fetchWeightedAverageUnitCosts({
      firmNr: firmNr ?? ERP_SETTINGS.firmNr,
      periodNr: ERP_SETTINGS.periodNr,
    });
  } catch (e) {
    console.warn('[erpReports] weighted avg maps for stock value failed:', e);
    return { byProductId: new Map<string, number>(), byCode: new Map<string, number>() };
  }
}

function resolveStockValuationUnitCost(
  maps: { byProductId: Map<string, number>; byCode: Map<string, number> } | null | undefined,
  product: {
    id?: string | null;
    code?: string | null;
    cost?: number | null;
    purchase_price?: number | null;
    purchasePrice?: number | null;
  },
  cardFallback = 0,
): number {
  const fromAvg = lookupWeightedAvgUnitCost(maps, product);
  if (fromAvg > 0) return fromAvg;
  const card = productCardUnitCost(product);
  if (card > 0) return card;
  return Number(cardFallback) > 0 ? Number(cardFallback) : 0;
}

/** Aynı ürünü (id/kod) birleştir — item_name / kod-id sapmasıyla bölünen SABUN satırlarını topla. */
function mergeProductGrossProfitRows(rows: ProductGrossProfitRow[]): ProductGrossProfitRow[] {
  const map = new Map<string, ProductGrossProfitRow>();
  for (const r of rows) {
    const kind = r.lineKind === 'service' ? 'S' : 'P';
    const id = String(r.productId || '').trim();
    const code = String(r.productCode || '').trim();
    const name = String(r.productName || '').trim().toLocaleLowerCase('tr-TR');
    const key =
      id
        ? `${kind}|id:${id}`
        : code && code !== '—'
          ? `${kind}|code:${code}`
          : `${kind}|name:${name}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...r });
      continue;
    }
    cur.quantity += r.quantity;
    cur.revenue += r.revenue;
    cur.cost += r.cost;
    cur.grossProfit += r.grossProfit;
    if (!cur.productId && r.productId) cur.productId = r.productId;
    if ((!cur.productCode || cur.productCode === '—') && r.productCode) cur.productCode = r.productCode;
    if (!cur.productName && r.productName) cur.productName = r.productName;
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    marginPct: productGrossProfitMarginPct(r.revenue, r.grossProfit),
  }));
}

/**
 * Ürün Brüt Kârı satırlarını dashboard KPI özetine topla — WAC formülü:
 *   Ciro    = Σ revenue (işaretli; satış +, iade −)
 *   Maliyet = Σ cost     (işaretli; WAC × qty)
 *   Brüt Kâr = Ciro − Maliyet
 *   Marj %   = Ciro ≠ 0 ise (Brüt Kâr / Ciro) × 100, iki ondalık; yoksa 0
 *
 * Dashboard ve Ürün Brüt Kârı raporu **aynı** satırları topladığı için
 * toplam Ciro/Maliyet/Brüt Kâr/Marj % birebir eşleşir.
 */
export function aggregateProductGrossProfitTotals(rows: ProductGrossProfitRow[]): {
  ciro: number;
  maliyet: number;
  brutKar: number;
  marjPct: number;
  productCount: number;
  profitableProducts: number;
  lossProducts: number;
  topProduct: string | null;
} {
  let ciro = 0;
  let maliyet = 0;
  let brutKar = 0;
  let profitableProducts = 0;
  let lossProducts = 0;
  let topProduct: string | null = null;
  let topProfit = -Infinity;
  for (const r of rows) {
    ciro += Number(r.revenue) || 0;
    maliyet += Number(r.cost) || 0;
    brutKar += Number(r.grossProfit) || 0;
    if (Number(r.grossProfit) > 0) profitableProducts += 1;
    else if (Number(r.grossProfit) < 0) lossProducts += 1;
    const p = Number(r.grossProfit) || 0;
    if (p > topProfit) {
      topProfit = p;
      const code = String(r.productCode ?? '').trim();
      const name = String(r.productName ?? '').trim();
      topProduct = code && code !== '—' ? `${code} - ${name}` : name || null;
    }
  }
  const marjPct = productGrossProfitMarginPct(ciro, brutKar);
  return {
    ciro,
    maliyet,
    brutKar,
    marjPct,
    productCount: rows.length,
    profitableProducts,
    lossProducts,
    topProduct,
  };
}

export interface CariExtractRow {
  id: string;
  date: string;
  ficheNo: string;
  definition: string;
  debit: number;
  credit: number;
  balance: number;
  source: 'movement' | 'sale' | 'cash' | 'bank';
  ficheType?: string;
  trcode?: number;
  notes?: string;
  isCancelled?: boolean;
}

export interface CriticalStockRow {
  productId: string;
  productCode: string;
  productName: string;
  warehouseCode: string;
  stock: number;
  minStock: number;
  maxStock: number;
  safeStock: number;
  criticalStock: number;
  unitCost: number;
  stockValue: number;
  status: 'below_min' | 'below_safe' | 'above_max' | 'ok';
}

export interface WarehouseStockRow {
  /** Depo kodu (string). Boşsa tek aktif deponun kodu ile doldurulur. */
  warehouseCode: string;
  /** Görünen depo etiketi: "Kod — Ad" veya sadece kod/ad (UI için). */
  warehouseLabel: string;
  /** Bu depoda stokta olan ürün adları (özet). SKU adedi 1 ise "SABUN" görünür. */
  productNames: string[];
  /** Bu depoda stokta olan ürün kodları (özet). SKU adedi 1 ise "0000001". */
  productCodes: string[];
  skuCount: number;
  totalQty: number;
  totalValue: number;
  criticalCount: number;
}

function padFirm(): string {
  return normalizeFirmTableNr(ERP_SETTINGS.firmNr);
}
function padPeriod(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
}

function mapCariCardType(raw: unknown): CariBalanceRow['cardType'] {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'supplier') return 'supplier';
  if (v === 'employee') return 'employee';
  if (v === 'partner') return 'partner';
  return 'customer';
}

function parseTermsDays(raw: unknown, fallback = 30): number {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 3650);
}

function bucketFromDaysOverdue(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function ymdDiff(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

const OPEN_ACCOUNT_SQL = `(
  LOWER(TRIM(COALESCE(s.payment_method, ''))) IN (
    'veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap',
    'açık cari', 'acik cari', 'acik_cari', 'açık_cari'
  )
  OR LOWER(TRIM(COALESCE(s.payment_method, ''))) LIKE '%veresiye%'
)`;

const PURCHASE_NOT_CASH_SQL = `NOT (
  LOWER(TRIM(COALESCE(s.payment_method, ''))) IN (
    'cash', 'nakit', 'card', 'kart', 'gateway', 'havale', 'eft', 'haval', 'kredikarti', 'transfer'
  )
  OR LOWER(TRIM(COALESCE(s.payment_method, ''))) LIKE '%kredi%kart%'
)`;

function mapAgingRow(r: Record<string, unknown>, cardType: 'customer' | 'supplier', today: string): CariAgingRow {
  const invoiceDate = String(r.invoice_date ?? '').slice(0, 10);
  const termsDays = parseTermsDays(r.payment_terms, 30);
  const dueDate = String(r.due_date ?? '').slice(0, 10) || addDaysYmd(invoiceDate, termsDays);
  const daysOverdue = Math.max(0, ymdDiff(today, dueDate));
  return {
    accountId: String(r.account_id ?? ''),
    accountCode: String(r.account_code ?? ''),
    accountName: String(r.account_name ?? ''),
    cardType,
    ficheNo: String(r.fiche_no ?? ''),
    invoiceDate,
    dueDate,
    amount: Number(r.amount ?? 0),
    daysOverdue,
    bucket: bucketFromDaysOverdue(daysOverdue),
    termsDays,
  };
}

async function fetchAgingViaRest(
  cardType: 'customer' | 'supplier',
  today: string,
  cariFilter?: string,
): Promise<CariAgingRow[]> {
  const { postgrest } = await import('./postgrestClient');
  const fn = padFirm();
  const pn = padPeriod();
  const salesPath = `/rex_${fn}_${pn}_sales`;
  const cardPath = cardType === 'customer' ? `/rex_${fn}_customers` : `/rex_${fn}_suppliers`;

  const ficheFilter =
    cardType === 'customer'
      ? 'in.(sales_invoice,service,hizmet,return_invoice)'
      : 'in.(purchase_invoice,return_invoice)';

const rawFilter = String(cariFilter ?? '').trim();
    const hasFilter = rawFilter.length > 0;

  const sales = await postgrest.get<Record<string, unknown>[]>(
    salesPath,
    {
      select: 'id,fiche_no,date,customer_id,customer_name,net_amount,payment_method,fiche_type,is_cancelled,status,trcode',
      fiche_type: ficheFilter,
      is_cancelled: 'eq.false',
      order: 'date.desc',
      limit: ROW_LIMIT,
    },
    { schema: 'public' },
  ).catch(() => [] as Record<string, unknown>[]);

  const openSales = (sales || []).filter((s) => {
    if (String(s.status || 'approved').toLowerCase() === 'cancelled') return false;
    const ft = String(s.fiche_type || '').toLowerCase();
    if (ft === 'return_invoice' || ft === 'opening_balance') return true;
    const pm = String(s.payment_method || '').toLocaleLowerCase('tr-TR');
    if (cardType === 'customer') {
      return (
        ['veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap', 'açık cari', 'acik cari', 'acik_cari', 'açık_cari'].includes(pm) ||
        pm.includes('veresiye')
      );
    }
    const cashLike =
      ['cash', 'nakit', 'card', 'kart', 'gateway', 'havale', 'eft', 'haval', 'kredikarti', 'transfer'].includes(pm) ||
      (pm.includes('kredi') && pm.includes('kart'));
    return !cashLike;
  });

  const ids = Array.from(new Set(openSales.map((s) => String(s.customer_id || '')).filter(Boolean)));
  const cards = ids.length
    ? await postgrest
        .get<Record<string, unknown>[]>(
          cardPath,
          {
            select: 'id,code,name,payment_terms,balance',
            id: `in.(${ids.join(',')})`,
            limit: 2000,
            ...(hasFilter
              ? { or: `(code.ilike.*${rawFilter}*,name.ilike.*${rawFilter}*)` }
              : {}),
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[])
    : [];
  const byId = new Map(cards.map((c) => [String(c.id), c]));

  return openSales
    .map((s) => {
      const card = byId.get(String(s.customer_id || ''));
      // Sadece borç bakiyeli carileri yaşlandır (alacak bakiyeli cariler hariç)
      if (card && Number(card.balance ?? 0) <= 0.009) return null;
      const amount = Number(s.net_amount ?? 0);
      const signed =
        String(s.fiche_type || '').toLowerCase() === 'return_invoice' ? -Math.abs(amount) : Math.abs(amount);
      return mapAgingRow(
        {
          account_id: s.customer_id,
          account_code: card?.code ?? '',
          account_name: card?.name ?? s.customer_name,
          payment_terms: card?.payment_terms,
          fiche_no: s.fiche_no,
          invoice_date: s.date,
          amount: signed,
        },
        cardType,
        today,
      );
    })
    .filter((r): r is CariAgingRow => r !== null && Math.abs(r.amount) > 0.009);
}

function mapCashBankMovementRow(r: {
  id?: unknown;
  source?: unknown;
  register_id?: unknown;
  registerId?: unknown;
  register_name?: unknown;
  registerName?: unknown;
  register_code?: unknown;
  registerCode?: unknown;
  fiche_no?: unknown;
  ficheNo?: unknown;
  date?: unknown;
  transaction_type?: unknown;
  transactionType?: unknown;
  definition?: unknown;
  amount?: unknown;
  sign?: unknown;
  account_name?: unknown;
  accountName?: unknown;
  target_register_id?: unknown;
  targetRegisterId?: unknown;
  target_register_name?: unknown;
  targetRegisterName?: unknown;
  currency_code?: unknown;
  currency?: unknown;
}): CashBankMovementRow {
  const amount = Number(r.amount ?? 0);
  const sign = Number(r.sign ?? 1) || 1;
  return {
    id: String(r.id ?? ''),
    source: r.source === 'bank' ? 'bank' : 'cash',
    registerId: String(r.register_id ?? r.registerId ?? ''),
    registerName: String(r.register_name ?? r.registerName ?? ''),
    registerCode: String(r.register_code ?? r.registerCode ?? ''),
    ficheNo: String(r.fiche_no ?? r.ficheNo ?? ''),
    date: String(r.date ?? '').slice(0, 10),
    transactionType: String(r.transaction_type ?? r.transactionType ?? ''),
    definition: String(r.definition ?? ''),
    amount,
    sign,
    netAmount: amount * sign,
    accountName: String(r.account_name ?? r.accountName ?? ''),
    targetRegisterId: String(r.target_register_id ?? r.targetRegisterId ?? ''),
    targetRegisterName: String(r.target_register_name ?? r.targetRegisterName ?? ''),
    currency: String(r.currency_code ?? r.currency ?? '').trim().toUpperCase(),
  };
}

/** Virman: kaynak çıkış, hedef giriş. Eksik hedef satırı şirket görünümünde eklenir. */
function applyCashVirmanFlow<T extends CashBankMovementRow>(
  rows: readonly T[],
  imputeMissing: boolean,
): T[] {
  return withCashVirmanLines(rows, { imputeMissing }).map((row) => {
    const direction = cashVirmanDirection(row);
    const sign = direction || (Number(row.sign) < 0 ? -1 : 1);
    const amount = Math.abs(Number(row.amount) || 0);
    return {
      ...row,
      sign,
      amount,
      netAmount: amount * sign,
    };
  });
}

/**
 * Kasaya satır yazılmamış nakit satış iadeleri.
 * Peşinat fişi (is_deposit) ve alış iadesi (trcode 6) bu listeye girmez.
 * Sorgu başarısızsa kasa defteri mevcut cash_lines ile devam eder.
 */
async function fetchSalesCashRefundSources(params: {
  from: string;
  to: string;
  cariId?: string;
}): Promise<SalesCashRefundSource[]> {
  const firmNr = padFirm();
  const values: unknown[] = [firmNr, params.from, params.to];
  let cariSql = '';
  if (params.cariId) {
    values.push(String(params.cariId));
    cariSql = ` AND s.customer_id = $${values.length}::uuid`;
  }
  try {
    const { rows } = await postgres.query(
      `
      SELECT
        s.id::text AS id,
        ${sqlUtcDate('s.date')}::text AS date,
        COALESCE(s.fiche_no, '') AS fiche_no,
        COALESCE(s.trcode, 0) AS trcode,
        LOWER(TRIM(COALESCE(s.fiche_type, ''))) AS fiche_type,
        COALESCE(s.payment_method, '') AS payment_method,
        COALESCE(s.net_amount, s.total_net, 0) AS net_amount,
        COALESCE(s.total_net, 0) AS total_net,
        COALESCE(s.is_deposit, false) AS is_deposit,
        s.header_fields AS header_fields,
        COALESCE(s.customer_id::text, '') AS customer_id,
        COALESCE(c.name, s.customer_name, '') AS customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.firm_nr = $1::text
        AND ${sqlUtcDate('s.date')} BETWEEN $2::date AND $3::date
        AND COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND COALESCE(s.is_deposit, false) = false
        AND (
          COALESCE(s.trcode, 0) IN (2, 3)
          OR (
            LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('return_invoice', 'i')
            AND COALESCE(s.trcode, 0) NOT IN (1, 4, 5, 6, 13, 26, 41, 42)
          )
        )
        ${cariSql}
      ORDER BY ${sqlUtcDate('s.date')} ASC, s.fiche_no ASC
      LIMIT ${ROW_LIMIT}
      `,
      values,
    );
    return (rows || []).map((r: any) => ({
      id: String(r.id ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      ficheNo: String(r.fiche_no ?? ''),
      ficheType: String(r.fiche_type ?? ''),
      trcode: Number(r.trcode ?? 0),
      paymentMethod: String(r.payment_method ?? ''),
      netAmount: Number(r.net_amount ?? 0),
      totalNet: Number(r.total_net ?? 0),
      isDeposit: r.is_deposit === true,
      headerFields: r.header_fields,
      customerId: String(r.customer_id ?? ''),
      customerName: String(r.customer_name ?? ''),
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[erpReportsAPI] nakit iade kasa satırı okunamadı:', msg);
    return [];
  }
}

interface CashFlowDraft {
  row: CashBankMovementRow;
  ref: CashFlowLineRef;
}

function cashFlowAvansTable(): string {
  const firm = padFirm().replace(/\W/g, '') || '001';
  const periodDigits = String(padPeriod()).replace(/\D/g, '') || '01';
  const period = periodDigits.padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_cari_avans`;
}

function cashFlowDraft(
  r: Parameters<typeof mapCashBankMovementRow>[0] & {
    customer_id?: unknown;
    party_id?: unknown;
    expense_card_id?: unknown;
  },
  source?: 'cash' | 'bank',
): CashFlowDraft {
  const row = mapCashBankMovementRow({ ...r, source: source ?? r.source });
  return {
    row,
    ref: {
      id: row.id,
      ficheNo: row.ficheNo,
      customerId: String(r.customer_id ?? '').trim(),
      partyId: String(r.party_id ?? '').trim(),
      expenseCardId: String(r.expense_card_id ?? '').trim(),
      accountName: row.accountName,
    },
  };
}

function uniqCashFlowUuids(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => looksLikeUuid(v)))];
}

function chunkCashFlow<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function putCashFlowNames(
  target: Map<string, string>,
  rows: Array<{ id?: unknown; name?: unknown }>,
) {
  for (const row of rows) {
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (id && name) target.set(id, name);
  }
}

function safeCashFlowToken(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

async function sqlCashFlowIdNames(table: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  try {
    const { rows } = await postgres.query<{ id: string; name: string }>(
      `SELECT id::text AS id, COALESCE(name, '') AS name FROM ${table} WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    putCashFlowNames(out, rows || []);
  } catch (err) {
    console.warn(
      `[erpReports] nakit akış ${table} adı okunamadı:`,
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

async function sqlCashFlowSales(fiches: string[]): Promise<Array<Record<string, unknown>>> {
  if (!fiches.length) return [];
  try {
    const { rows } = await postgres.query<Record<string, unknown>>(
      `SELECT fiche_no, customer_id::text AS customer_id, COALESCE(customer_name, '') AS customer_name
         FROM sales
        WHERE fiche_no = ANY($1::text[])`,
      [fiches],
    );
    return rows || [];
  } catch (err) {
    console.warn(
      '[erpReports] nakit akış satış cari adı okunamadı:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function sqlCashFlowAvans(lineIds: string[]): Promise<Array<Record<string, unknown>>> {
  if (!lineIds.length) return [];
  try {
    const { rows } = await postgres.query<Record<string, unknown>>(
      `SELECT cash_line_id::text AS cash_line_id, customer_id::text AS customer_id
         FROM ${cashFlowAvansTable()}
        WHERE cash_line_id = ANY($1::uuid[])`,
      [lineIds],
    );
    return rows || [];
  } catch (err) {
    console.warn(
      '[erpReports] nakit akış rezervasyon cari adı okunamadı:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function sqlCashFlowExpenses(lineIds: string[]): Promise<Array<Record<string, unknown>>> {
  if (!lineIds.length) return [];
  try {
    const { rows } = await postgres.query<Record<string, unknown>>(
      `SELECT cash_line_id::text AS cash_line_id, cost_center_id::text AS cost_center_id
         FROM expenses
        WHERE cash_line_id = ANY($1::uuid[])`,
      [lineIds],
    );
    return rows || [];
  } catch (err) {
    console.warn(
      '[erpReports] nakit akış gider carisi okunamadı:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function restCashFlowIdNames(tablePath: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { postgrest } = await import('./postgrestClient');
  for (const chunk of chunkCashFlow(ids, 40)) {
    try {
      const rows = await postgrest.get<Array<{ id?: string; name?: string }>>(
        tablePath,
        { select: 'id,name', id: `in.(${chunk.join(',')})`, limit: chunk.length },
        { schema: 'public' },
      );
      putCashFlowNames(out, Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.warn(
        `[erpReports] nakit akış ${tablePath} adı okunamadı:`,
        err instanceof Error ? err.message : err,
      );
      break;
    }
  }
  return out;
}

async function restCashFlowRows(
  tablePath: string,
  column: string,
  tokens: string[],
  select: string,
): Promise<Array<Record<string, unknown>>> {
  const safe = tokens.filter(safeCashFlowToken);
  if (!safe.length) return [];
  const { postgrest } = await import('./postgrestClient');
  const out: Array<Record<string, unknown>> = [];
  for (const chunk of chunkCashFlow(safe, 40)) {
    try {
      const rows = await postgrest.get<Array<Record<string, unknown>>>(
        tablePath,
        { select, [column]: `in.(${chunk.join(',')})`, limit: chunk.length },
        { schema: 'public' },
      );
      if (Array.isArray(rows)) out.push(...rows);
    } catch (err) {
      console.warn(
        `[erpReports] nakit akış ${tablePath} okunamadı:`,
        err instanceof Error ? err.message : err,
      );
      break;
    }
  }
  return out;
}

function cashFlowNameIndexesFromParts(opts: {
  customers: Map<string, string>;
  suppliers: Map<string, string>;
  parties: Map<string, string>;
  expenseCards: Map<string, string>;
  salesRows: Array<Record<string, unknown>>;
  avansRows: Array<Record<string, unknown>>;
  expenseRows: Array<Record<string, unknown>>;
  centers: Map<string, string>;
}): CashFlowNameIndexes {
  const salesCustomerByFiche = new Map<string, string>();
  for (const row of opts.salesRows) {
    const fiche = String(row.fiche_no ?? '').trim();
    if (!fiche) continue;
    const customerId = String(row.customer_id ?? '').trim();
    const card = customerId ? opts.customers.get(customerId) : '';
    const written = String(row.customer_name ?? '').trim();
    const name = (card && card.trim()) || written;
    if (name) salesCustomerByFiche.set(fiche, name);
  }
  const reservationCustomerByLineId = new Map<string, string>();
  for (const row of opts.avansRows) {
    const lineId = String(row.cash_line_id ?? '').trim();
    const customerId = String(row.customer_id ?? '').trim();
    const name = customerId ? opts.customers.get(customerId) : '';
    if (lineId && name) reservationCustomerByLineId.set(lineId, name);
  }
  const expenseAccountByLineId = new Map<string, string>();
  for (const row of opts.expenseRows) {
    const lineId = String(row.cash_line_id ?? '').trim();
    const centerId = String(row.cost_center_id ?? '').trim();
    const name = centerId ? opts.centers.get(centerId) : '';
    if (lineId && name) expenseAccountByLineId.set(lineId, name);
  }
  return {
    customers: opts.customers,
    suppliers: opts.suppliers,
    parties: opts.parties,
    expenseCards: opts.expenseCards,
    salesCustomerByFiche,
    reservationCustomerByLineId,
    expenseAccountByLineId,
  };
}

async function absorbExtraCustomers(
  customers: Map<string, string>,
  ids: string[],
  load: (missing: string[]) => Promise<Map<string, string>>,
) {
  const missing = uniqCashFlowUuids(ids).filter((id) => !customers.has(id));
  if (!missing.length) return;
  const extra = await load(missing);
  for (const [id, name] of extra) customers.set(id, name);
}

async function loadCashFlowNameIndexesSql(refs: CashFlowLineRef[]): Promise<CashFlowNameIndexes> {
  const customerIds = uniqCashFlowUuids(refs.map((r) => r.customerId));
  const partyIds = uniqCashFlowUuids(refs.map((r) => r.partyId));
  const looseCustomerIds = refs.filter((r) => !r.partyId.trim()).map((r) => r.customerId);
  const supplierIds = uniqCashFlowUuids([...partyIds, ...looseCustomerIds]);
  const partyProbe = uniqCashFlowUuids([...partyIds, ...looseCustomerIds]);
  const cardIds = uniqCashFlowUuids(refs.map((r) => r.expenseCardId));
  const lineIds = uniqCashFlowUuids(refs.map((r) => r.id));
  const fiches = [...new Set(refs.flatMap((r) => cashFlowSalesFicheKeys(r.ficheNo)))].filter(
    (fiche) => fiche.length > 0 && fiche.length <= 120,
  );

  const [customers, suppliers, parties, expenseCards, salesRows, avansRows, expenseRows] =
    await Promise.all([
      sqlCashFlowIdNames('customers', customerIds),
      sqlCashFlowIdNames('suppliers', supplierIds),
      sqlCashFlowIdNames('parties', partyProbe),
      sqlCashFlowIdNames('expense_cards', cardIds),
      sqlCashFlowSales(fiches),
      sqlCashFlowAvans(lineIds),
      sqlCashFlowExpenses(lineIds),
    ]);

  await absorbExtraCustomers(
    customers,
    [
      ...salesRows.map((row) => String(row.customer_id ?? '')),
      ...avansRows.map((row) => String(row.customer_id ?? '')),
    ],
    (ids) => sqlCashFlowIdNames('customers', ids),
  );
  const centers = await sqlCashFlowIdNames(
    'cost_centers',
    uniqCashFlowUuids(expenseRows.map((row) => String(row.cost_center_id ?? ''))),
  );
  return cashFlowNameIndexesFromParts({
    customers,
    suppliers,
    parties,
    expenseCards,
    salesRows,
    avansRows,
    expenseRows,
    centers,
  });
}

async function loadCashFlowNameIndexesRest(refs: CashFlowLineRef[]): Promise<CashFlowNameIndexes> {
  const fn = padFirm();
  const pn = padPeriod();
  const customerIds = uniqCashFlowUuids(refs.map((r) => r.customerId));
  const partyIds = uniqCashFlowUuids(refs.map((r) => r.partyId));
  const looseCustomerIds = refs.filter((r) => !r.partyId.trim()).map((r) => r.customerId);
  const supplierIds = uniqCashFlowUuids([...partyIds, ...looseCustomerIds]);
  const partyProbe = uniqCashFlowUuids([...partyIds, ...looseCustomerIds]);
  const cardIds = uniqCashFlowUuids(refs.map((r) => r.expenseCardId));
  const lineIds = uniqCashFlowUuids(refs.map((r) => r.id));
  const fiches = [...new Set(refs.flatMap((r) => cashFlowSalesFicheKeys(r.ficheNo)))];

  const [customers, suppliers, parties, expenseCards, salesRows, avansRows, expenseRows] =
    await Promise.all([
      restCashFlowIdNames(`/rex_${fn}_customers`, customerIds),
      restCashFlowIdNames(`/rex_${fn}_suppliers`, supplierIds),
      restCashFlowIdNames(`/rex_${fn}_parties`, partyProbe),
      restCashFlowIdNames(`/rex_${fn}_expense_cards`, cardIds),
      restCashFlowRows(
        `/rex_${fn}_${pn}_sales`,
        'fiche_no',
        fiches,
        'fiche_no,customer_id,customer_name',
      ),
      restCashFlowRows(
        `/rex_${fn}_${pn}_cari_avans`,
        'cash_line_id',
        lineIds,
        'cash_line_id,customer_id',
      ),
      restCashFlowRows(
        `/rex_${fn}_expenses`,
        'cash_line_id',
        lineIds,
        'cash_line_id,cost_center_id',
      ),
    ]);

  await absorbExtraCustomers(
    customers,
    [
      ...salesRows.map((row) => String(row.customer_id ?? '')),
      ...avansRows.map((row) => String(row.customer_id ?? '')),
    ],
    (ids) => restCashFlowIdNames(`/rex_${fn}_customers`, ids),
  );
  const centers = await restCashFlowIdNames(
    `/rex_${fn}_cost_centers`,
    uniqCashFlowUuids(expenseRows.map((row) => String(row.cost_center_id ?? ''))),
  );
  return cashFlowNameIndexesFromParts({
    customers,
    suppliers,
    parties,
    expenseCards,
    salesRows,
    avansRows,
    expenseRows,
    centers,
  });
}

async function hydrateCashLineAccountRefs(refs: CashFlowLineRef[]): Promise<CashFlowLineRef[]> {
  const ids = uniqCashFlowUuids(refs.map((r) => r.id));
  if (!ids.length) return refs;
  let rows: Array<Record<string, unknown>> = [];
  try {
    const result = await postgres.query<Record<string, unknown>>(
      `SELECT id::text AS id,
              COALESCE(customer_id::text, '') AS customer_id,
              COALESCE(party_id::text, '') AS party_id,
              COALESCE(expense_card_id::text, '') AS expense_card_id
         FROM cash_lines
        WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    rows = result.rows || [];
  } catch {
    try {
      const result = await postgres.query<Record<string, unknown>>(
        `SELECT id::text AS id, COALESCE(customer_id::text, '') AS customer_id
           FROM cash_lines
          WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      rows = result.rows || [];
    } catch (err) {
      console.warn(
        '[erpReports] nakit akış cari kimliği okunamadı:',
        err instanceof Error ? err.message : err,
      );
      return refs;
    }
  }
  const byId = new Map(rows.map((row) => [String(row.id ?? ''), row]));
  return refs.map((ref) => {
    const hit = byId.get(ref.id);
    if (!hit) return ref;
    return {
      ...ref,
      customerId: String(hit.customer_id ?? ref.customerId).trim(),
      partyId: String(hit.party_id ?? ref.partyId).trim(),
      expenseCardId: String(hit.expense_card_id ?? ref.expenseCardId).trim(),
    };
  });
}

async function withCashFlowNames(drafts: CashFlowDraft[]): Promise<CashBankMovementRow[]> {
  const pendingAt = drafts
    .map((draft, index) => (!String(draft.row.accountName || '').trim() ? index : -1))
    .filter((index) => index >= 0);
  if (!pendingAt.length) return drafts.map((draft) => draft.row);

  let refs = pendingAt.map((index) => drafts[index].ref);
  if (DB_SETTINGS.connectionProvider !== 'rest_api') {
    refs = await hydrateCashLineAccountRefs(refs);
  }
  let indexes: CashFlowNameIndexes;
  try {
    indexes =
      DB_SETTINGS.connectionProvider === 'rest_api'
        ? await loadCashFlowNameIndexesRest(refs)
        : await loadCashFlowNameIndexesSql(refs);
  } catch (err) {
    console.warn(
      '[erpReports] nakit akış cari adı okunamadı:',
      err instanceof Error ? err.message : err,
    );
    return drafts.map((draft) => draft.row);
  }
  const refByIndex = new Map(pendingAt.map((index, nth) => [index, refs[nth]]));
  return drafts.map((draft, index) => {
    const ref = refByIndex.get(index);
    if (!ref) return draft.row;
    return applyCashFlowAccountName(draft.row, ref, indexes);
  });
}

/** Sorgu satır satırdır. Müşteri + gün ile GROUP BY yok; birleştirme fiş anahtarıyla yapılır. */
function buildCashBankMovementParts(opts: {
  mode: 'rich' | 'plain';
  wantCash: boolean;
  wantBank: boolean;
  cashRegisterClause: string;
}): string[] {
  const avansTable = cashFlowAvansTable();
  const parts: string[] = [];
  if (opts.wantCash) {
    const rich = opts.mode === 'rich' ? cashFlowAccountSql('cl', avansTable) : null;
    const partyExpr =
      opts.mode === 'rich' ? 'COALESCE(cl.party_id::text, \'\')' : '\'\'::text';
    const cardExpr =
      opts.mode === 'rich' ? 'COALESCE(cl.expense_card_id::text, \'\')' : '\'\'::text';
    parts.push(`
        SELECT
          cl.id::text AS id,
          'cash'::text AS source,
          cl.register_id::text AS register_id,
          COALESCE(cr.name, cr.code, '') AS register_name,
          COALESCE(cr.code, '') AS register_code,
          COALESCE(cl.fiche_no, '') AS fiche_no,
          ${sqlUtcDate('cl.date')}::text AS date,
          COALESCE(cl.transaction_type, '') AS transaction_type,
          COALESCE(cl.definition, '') AS definition,
          COALESCE(cl.amount, 0) AS amount,
          COALESCE(cl.sign, 1) AS sign,
          COALESCE(cl.target_register_id::text, '') AS target_register_id,
          COALESCE(tgt.name, tgt.code, '') AS target_register_name,
          COALESCE(cl.currency_code, '') AS currency_code,
          COALESCE(cl.customer_id::text, '') AS customer_id,
          ${partyExpr} AS party_id,
          ${cardExpr} AS expense_card_id,
          ${rich ? rich.selectExpr : 'COALESCE(c.name, s.name, \'\')'} AS account_name
        FROM cash_lines cl
        LEFT JOIN cash_registers cr ON cr.id = cl.register_id
        LEFT JOIN cash_registers tgt ON tgt.id = cl.target_register_id
        ${
          rich
            ? rich.joins
            : `
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = cl.customer_id LIMIT 1
        ) c ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM suppliers WHERE id = cl.customer_id LIMIT 1
        ) s ON TRUE`
        }
        WHERE ${sqlUtcDate('cl.date')} >= $1::date
          AND ${sqlUtcDate('cl.date')} <= $2::date
          ${opts.cashRegisterClause}
      `);
  }
  if (opts.wantBank) {
    const rich = opts.mode === 'rich' ? cashFlowAccountSql('bl', avansTable) : null;
    parts.push(`
        SELECT
          bl.id::text AS id,
          'bank'::text AS source,
          bl.register_id::text AS register_id,
          COALESCE(br.name, br.code, '') AS register_name,
          COALESCE(br.code, '') AS register_code,
          COALESCE(bl.fiche_no, '') AS fiche_no,
          ${sqlUtcDate('bl.date')}::text AS date,
          COALESCE(bl.transaction_type, '') AS transaction_type,
          COALESCE(bl.definition, '') AS definition,
          COALESCE(bl.amount, 0) AS amount,
          COALESCE(bl.sign, 1) AS sign,
          ''::text AS target_register_id,
          ''::text AS target_register_name,
          ''::text AS currency_code,
          COALESCE(bl.customer_id::text, '') AS customer_id,
          ''::text AS party_id,
          ''::text AS expense_card_id,
          ${rich ? rich.selectExpr : 'COALESCE(c.name, s.name, \'\')'} AS account_name
        FROM bank_lines bl
        LEFT JOIN bank_registers br ON br.id = bl.register_id
        ${
          rich
            ? rich.joins
            : `
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = bl.customer_id LIMIT 1
        ) c ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM suppliers WHERE id = bl.customer_id LIMIT 1
        ) s ON TRUE`
        }
        WHERE ${sqlUtcDate('bl.date')} >= $1::date
          AND ${sqlUtcDate('bl.date')} <= $2::date
      `);
  }
  return parts;
}

export const erpReportsAPI = {
  async getCariAging(opts?: {
    cardType?: 'customer' | 'supplier' | 'all';
    cariFilter?: string;
  }): Promise<CariAgingRow[]> {
    const today = localTodayDateKey();
    const want = opts?.cardType ?? 'all';
    const rawFilter = String(opts?.cariFilter ?? '').trim();
    const filterKey = normalizeTrText(rawFilter); // JS tarafı normalize (unaccent yoksa)
    const filterExactCode = rawFilter; // cari_kodu tam eşleşme için ham hali
    const filterLike = `%${filterKey}%`; // ad/kod contains

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const parts: CariAgingRow[] = [];
      if (want === 'all' || want === 'customer') {
        parts.push(...(await fetchAgingViaRest('customer', today, rawFilter)));
      }
      if (want === 'all' || want === 'supplier') {
        parts.push(...(await fetchAgingViaRest('supplier', today, rawFilter)));
      }
      return parts.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount).slice(0, ROW_LIMIT);
    }

    const rows: CariAgingRow[] = [];
    const hasFilter = filterKey.length > 0;
    const filterParams = hasFilter ? [filterExactCode, filterLike] : [];

    // Filtre koşulu: önce cari_kodu tam eşleşme (normalize edilmiş), yoksa ad/kod LIKE
    const buildFilterClause = (alias: string): string => {
      if (!hasFilter) return '';
      // Hem alias.code hem alias.name normalize edilmiş değerlerle karşılaştırılır
      return ` AND (
          LOWER(TRIM(COALESCE(${alias}.code, ''))) = LOWER(TRIM($1))
          OR LOWER(TRIM(COALESCE(${alias}.code, ''))) LIKE LOWER(TRIM($2))
          OR LOWER(TRIM(COALESCE(${alias}.name, ''))) LIKE LOWER(TRIM($2))
        )`;
    };

    // Sadece borç bakiyesi > 0 carileri yaşlandır (alacak bakiyeli cariler hariç)
    const buildBalanceClause = (alias: string): string =>
      ` AND COALESCE(${alias}.balance, 0) > 0`;

    if (want === 'all' || want === 'customer') {
      const { rows: custRows } = await postgres.query(
        `
        SELECT
          c.id AS account_id,
          COALESCE(c.code, '') AS account_code,
          COALESCE(c.name, s.customer_name, '') AS account_name,
          c.payment_terms,
          s.fiche_no,
          ${sqlUtcDate('s.date')}::text AS invoice_date,
          CASE
            WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
              THEN -ABS(COALESCE(s.net_amount, 0))
            ELSE ABS(COALESCE(s.net_amount, 0))
          END AS amount
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')
          AND (
            s.fiche_type = 'return_invoice'
            OR ${OPEN_ACCOUNT_SQL}
          )${buildBalanceClause('c')}${buildFilterClause('c')}
        ORDER BY s.date DESC
        LIMIT ${ROW_LIMIT}
        `,
        filterParams,
      );
      for (const r of custRows || []) {
        rows.push(mapAgingRow(r as Record<string, unknown>, 'customer', today));
      }
    }

    if (want === 'all' || want === 'supplier') {
      const { rows: supRows } = await postgres.query(
        `
        SELECT
          COALESCE(sup.id, c.id) AS account_id,
          COALESCE(sup.code, c.code, '') AS account_code,
          COALESCE(sup.name, c.name, s.customer_name, '') AS account_name,
          COALESCE(sup.payment_terms, c.payment_terms) AS payment_terms,
          s.fiche_no,
          ${sqlUtcDate('s.date')}::text AS invoice_date,
          CASE
            WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
              THEN -ABS(COALESCE(s.net_amount, 0))
            ELSE ABS(COALESCE(s.net_amount, 0))
          END AS amount
        FROM sales s
        LEFT JOIN suppliers sup ON sup.id = s.customer_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND (
            s.fiche_type = 'purchase_invoice'
            OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42)
            OR s.fiche_type = 'return_invoice'
          )
          AND (
            s.fiche_type = 'return_invoice'
            OR ${PURCHASE_NOT_CASH_SQL}
          )${buildBalanceClause('sup')}${buildFilterClause('sup')}
        ORDER BY s.date DESC
        LIMIT ${ROW_LIMIT}
        `,
        filterParams,
      );
      for (const r of supRows || []) {
        rows.push(mapAgingRow(r as Record<string, unknown>, 'supplier', today));
      }
    }

    return rows
      .filter((r) => Math.abs(r.amount) > 0.009)
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
      .slice(0, ROW_LIMIT);
  },

  async getCariBalances(opts?: {
    cardType?: 'customer' | 'supplier' | 'employee' | 'all';
    onlyNonZero?: boolean;
    /**
     * @deprecated ABS/yalın balance>0 kullanır; tedarikçi simetrisini bozar.
     * Yerine `balanceSide: 'debtor' | 'creditor'` kullanın.
     */
    onlyDebit?: boolean;
    /**
     * Borçlu / alacaklı rapor filtresi (iş kuralı):
     * - debtor → yalnızca borçlu müşteri (buyer; bizim alacağımız)
     * - creditor → yalnızca alacaklı tedarikçi (seller; bizim borcumuz)
     * Partner / personel ve ters yöndeki bakiyeler hariç. `cardType` override edilir.
     */
    balanceSide?: 'debtor' | 'creditor';
    cariFilter?: string;
  }): Promise<CariBalanceRow[]> {
    const onlyNonZero = opts?.onlyNonZero !== false;
    const onlyDebit = opts?.onlyDebit === true;
    const balanceSide = opts?.balanceSide;
    // Rapor iş kuralı: borçlu=müşteri, alacaklı=tedarikçi (partner/personel yok)
    const want: 'customer' | 'supplier' | 'employee' | 'all' =
      balanceSide === 'debtor'
        ? 'customer'
        : balanceSide === 'creditor'
          ? 'supplier'
          : (opts?.cardType ?? 'all');
    const rawFilter = String(opts?.cariFilter ?? '').trim();
    const filterKey = normalizeTrText(rawFilter);
    const filterExactCode = rawFilter;
    const hasFilter = filterKey.length > 0;
    const firmNr = padFirm();

    const passBalance = (
      balance: number,
      cardType: CariBalanceRow['cardType'],
    ) => {
      if (balanceSide === 'debtor') return isCariDebtorsReportRow(cardType, balance);
      if (balanceSide === 'creditor') return isCariCreditorsReportRow(cardType, balance);
      if (onlyDebit) return balance > 0.009;
      if (onlyNonZero) return Math.abs(balance) > 0.009;
      return true;
    };
    const matchFilter = (code: string, name: string) => {
      if (!hasFilter) return true;
      const c = String(code || '');
      const n = String(name || '');
      return (
        c.toLowerCase() === filterExactCode.toLowerCase() ||
        normalizeTrText(c).includes(filterKey) ||
        normalizeTrText(n).includes(filterKey)
      );
    };
    // Rezervasyon avansı (henüz hizmet verilmemiş peşinat). Cari bakiyesine
    // dahil edilmeyen, kasa tarafında pasif tutulan `cash_lines.special_code`
    // değerleri. Cari Hesap Özeti raporu için ayrı KPI kartı olarak
    // gösterilecek; geri ödenmeyeceği varsayımıyla cari alacak bakiyesinden
    // düşülür. Kasa Durumu raporundaki REZERVASYON_AVANS bucket'ı ile aynı
    // veri kaynağı (cash_lines), farklı rapor katmanı.
    const RESERVATION_SPECIAL_CODES = ['REZERVASYON', 'AVANS'] as const;

    /**
     * `cash_lines` üzerinden her cari için bekleyen rezervasyon avansı
     * toplamını hesapla. İki ayrı kolon eşleşir: `customer_id` (müşteri)
     * ve `party_id` (tedarikçi/personel polymorphic). Dönem tablo
     * (`rex_{firm}_{period}_cash_lines`); ledger'da avans tahsil edilen
     * dönemden rapor ediliyor — periyot değişimi rapor ekranındaki
     * "selectedDonem" ile yapılır.
     */
    const fetchPendingDeposits = async (): Promise<Map<string, number>> => {
      const map = new Map<string, number>();
      if (want === 'employee') {
        // Personel için rezervasyon avansı mantığı yok; boş döner.
        return map;
      }
      const pn = padPeriod();
      const cashTable = `rex_${firmNr}_${pn}_cash_lines`;
      // SQL: hem customer_id hem party_id üzerinden bağla, çift
      // sayımı önlemek için COALESCE ile tek anahtar üret.
      const codeList = RESERVATION_SPECIAL_CODES.map((c) => `'${c}'`).join(', ');
      try {
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
          const { postgrest } = await import('./postgrestClient');
          const rows = await postgrest
            .get<Record<string, unknown>[]>(
              `/${cashTable}`,
              {
                select: 'customer_id,party_id,amount,transaction_type,special_code',
                transaction_type: 'eq.CH_TAHSILAT',
                special_code: `in.(${RESERVATION_SPECIAL_CODES.join(',')})`,
                limit: 50000,
              },
              { schema: 'public' },
            )
            .catch(() => [] as Record<string, unknown>[]);
          for (const r of rows || []) {
            const key = String(r.customer_id || r.party_id || '').trim();
            if (!key) continue;
            const amt = Math.abs(Number(r.amount) || 0);
            if (!(amt > 0)) continue;
            map.set(key, (map.get(key) || 0) + amt);
          }
        } else {
          const { rows: cashRows } = await postgres.query<{
            customer_id: string | null;
            party_id: string | null;
            amount: string | number | null;
          }>(
            `SELECT customer_id, party_id, amount
               FROM ${cashTable}
              WHERE transaction_type = 'CH_TAHSILAT'
                AND UPPER(TRIM(COALESCE(special_code, ''))) IN (${codeList})
                AND firm_nr = $1::text
                AND (customer_id IS NOT NULL OR party_id IS NOT NULL)
            `,
            [firmNr],
            { firmNr, periodNr: ERP_SETTINGS.periodNr },
          );
          for (const r of cashRows || []) {
            const key = String(r.customer_id || r.party_id || '').trim();
            if (!key) continue;
            const amt = Math.abs(Number(r.amount) || 0);
            if (!(amt > 0)) continue;
            map.set(key, (map.get(key) || 0) + amt);
          }
        }
      } catch (err) {
        console.warn('[erpReports] getCariBalances pendingDeposit query failed:', err);
      }
      return map;
    };

    const pendingDeposits = await fetchPendingDeposits();

    const out: CariBalanceRow[] = [];

    // Cari Hesaplar ile aynı kaynak (supplierAPI) — firm_nr 1↔001 + ledger bakiye.
    if (want === 'all' || want === 'customer' || want === 'supplier') {
      const listFilter =
        want === 'customer' ? 'customer' : want === 'supplier' ? 'supplier' : 'all';
      try {
        const accounts = await supplierAPI.getAll({ cardType: listFilter });
        for (const a of accounts) {
          const code = String(a.code ?? '');
          const name = String(a.name ?? '');
          if (!matchFilter(code, name)) continue;
          const cardType: CariBalanceRow['cardType'] =
            a.cardType === 'supplier' ? 'supplier' : 'customer';
          const balance = Number(a.balance ?? 0) || 0;
          if (!passBalance(balance, cardType)) continue;
          out.push({
            accountId: String(a.id ?? ''),
            accountCode: code,
            accountName: name,
            cardType,
            balance,
            pendingDeposit: pendingDeposits.get(String(a.id ?? '')) || 0,
            creditLimit: Number(a.credit_limit ?? 0) || 0,
            paymentTerms: String(a.payment_terms ?? ''),
            phone: String(a.phone ?? '').trim() || undefined,
          });
        }
      } catch (err) {
        console.warn('[erpReports] getCariBalances supplierAPI:', err);
      }
    }

    if (want === 'all' || want === 'employee') {
      const partyTypes =
        want === 'employee' ? (['employee'] as const) : (['employee', 'partner'] as const);
      try {
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
          const { postgrest } = await import('./postgrestClient');
          const partyRows = await postgrest
            .get<Record<string, unknown>[]>(
              `/rex_${firmNr}_parties`,
              {
                select: 'id,code,name,balance,card_type,is_active,firm_nr,phone',
                is_active: 'eq.true',
                order: 'name.asc',
                limit: 2000,
              },
              { schema: 'public' },
            )
            .catch(() => [] as Record<string, unknown>[]);
          for (const r of partyRows || []) {
            const ct = mapCariCardType(r.card_type);
            if (!(partyTypes as readonly string[]).includes(ct)) continue;
            if (!cardFirmNrMatches(r.firm_nr, firmNr)) continue;
            const code = String(r.code ?? '');
            const name = String(r.name ?? '');
            if (!matchFilter(code, name)) continue;
            const balance = Number(r.balance ?? 0) || 0;
            if (!passBalance(balance, ct)) continue;
            out.push({
              accountId: String(r.id ?? ''),
              accountCode: code,
              accountName: name,
              cardType: ct,
              balance,
              pendingDeposit: pendingDeposits.get(String(r.id ?? '')) || 0,
              creditLimit: 0,
              paymentTerms: '',
              phone: String(r.phone ?? '').trim() || undefined,
            });
          }
        } else {
          const typeList = partyTypes.map((t) => `'${t}'`).join(', ');
          const filterParams: unknown[] = [firmNr];
          let partyFilter = '';
          if (hasFilter) {
            filterParams.push(filterExactCode, `%${filterKey}%`);
            partyFilter = ` AND (
              LOWER(TRIM(COALESCE(p.code, ''))) = LOWER(TRIM($2))
              OR LOWER(TRIM(COALESCE(p.code, ''))) LIKE LOWER(TRIM($3))
              OR LOWER(TRIM(COALESCE(p.name, ''))) LIKE LOWER(TRIM($3))
            )`;
          }
          const { rows: partySqlRows } = await postgres.query(
            `
            SELECT
              p.id::text AS account_id,
              COALESCE(p.code,'') AS account_code,
              COALESCE(p.name,'') AS account_name,
              LOWER(TRIM(COALESCE(p.card_type, ''))) AS card_type,
              COALESCE(p.balance, 0) AS balance,
              COALESCE(p.phone, '') AS phone
            FROM rex_${firmNr}_parties p
            WHERE COALESCE(p.is_active, true) = true
              AND LOWER(TRIM(COALESCE(p.card_type, ''))) IN (${typeList})
              AND ${sqlFirmScopedCardMatch('p', '$1')}
              ${partyFilter}
            `,
            filterParams,
            { firmNr, periodNr: ERP_SETTINGS.periodNr },
          );
          for (const r of partySqlRows || []) {
            const ct = mapCariCardType(r.card_type);
            const balance = Number(r.balance ?? 0);
            if (!passBalance(balance, ct)) continue;
            out.push({
              accountId: String(r.account_id ?? ''),
              accountCode: String(r.account_code ?? ''),
              accountName: String(r.account_name ?? ''),
              cardType: ct,
              balance,
              pendingDeposit: pendingDeposits.get(String(r.account_id ?? '')) || 0,
              creditLimit: 0,
              paymentTerms: '',
              phone: String(r.phone ?? '').trim() || undefined,
            });
          }
        }
      } catch {
        /* parties yoksa müşteri/tedarikçi ile devam */
      }
    }

    // 10.10.2026 — Cari Hesap Özeti "Hizmet satırları gözükmüyor" düzeltmesi.
    // Sıralama helper'ı (`cariBalanceSort.ts`) ile:
    //   1) bekleyen avans desc
    //   2) bakiye desc (alt raporlarda ABS)
    //   3) unvan asc (tr locale)
    // Zero-balance + zero-pending cariler de listede KALIR — `passBalance`
    // `onlyNonZero=false` iken true döner.
    return sortCariBalanceForReport(out, { balanceSide: !!balanceSide }).slice(
      0,
      ROW_LIMIT,
    );
  },

  async getCashBankMovements(opts: {
    startDate: string;
    endDate: string;
    source?: 'all' | 'cash' | 'bank';
    registerId?: string;
  }): Promise<CashBankMovementRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    const source = opts.source ?? 'all';
    const registerId = String(opts.registerId || '').trim();
    if (!start || !end) return [];
    // Tek kasa seçilince yalnızca o kasanın nakit satırları (banka karışmaz).
    const wantCash = source === 'all' || source === 'cash';
    const wantBank = (source === 'all' || source === 'bank') && !registerId;

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();
      const drafts: CashFlowDraft[] = [];

      if (wantCash) {
        const [lines, regs] = await Promise.all([
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_cash_lines`,
            { select: '*', order: 'date.desc', limit: ROW_LIMIT },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_cash_registers`,
            { select: 'id,code,name', limit: 500 },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
        ]);
        const regMap = new Map(
          regs.map((r) => [
            String(r.id),
            { name: String(r.name || r.code || ''), code: String(r.code || '') },
          ]),
        );
        for (const r of lines || []) {
          const rid = String(r.register_id || '');
          if (registerId && rid !== registerId) continue;
          const d = String(r.date || '').slice(0, 10);
          if (d < start || d > end) continue;
          const reg = regMap.get(rid);
          const targetId = String(r.target_register_id || '');
          const targetReg = targetId ? regMap.get(targetId) : undefined;
          drafts.push(
            cashFlowDraft(
              {
                id: r.id ?? `c-${d}-${r.fiche_no}`,
                source: 'cash',
                register_id: rid,
                register_name: reg?.name || '',
                register_code: reg?.code || '',
                fiche_no: r.fiche_no,
                date: d,
                transaction_type: r.transaction_type,
                definition: r.definition,
                amount: r.amount,
                sign: r.sign,
                target_register_id: r.target_register_id,
                target_register_name: targetReg?.name || '',
                currency_code: r.currency_code,
                customer_id: r.customer_id,
                party_id: r.party_id,
                expense_card_id: r.expense_card_id,
              },
              'cash',
            ),
          );
        }
      }

      if (wantBank) {
        const [lines, regs] = await Promise.all([
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_bank_lines`,
            { select: '*', order: 'date.desc', limit: ROW_LIMIT },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_bank_registers`,
            { select: 'id,code,name', limit: 500 },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
        ]);
        const regMap = new Map(
          regs.map((r) => [
            String(r.id),
            { name: String(r.name || r.code || ''), code: String(r.code || '') },
          ]),
        );
        for (const r of lines || []) {
          const d = String(r.date || '').slice(0, 10);
          if (d < start || d > end) continue;
          const rid = String(r.register_id || '');
          const reg = regMap.get(rid);
          drafts.push(
            cashFlowDraft(
              {
                id: r.id ?? `b-${d}-${r.fiche_no}`,
                source: 'bank',
                register_id: rid,
                register_name: reg?.name || '',
                register_code: reg?.code || '',
                fiche_no: r.fiche_no,
                date: d,
                transaction_type: r.transaction_type,
                definition: r.definition,
                amount: r.amount,
                sign: r.sign,
                customer_id: r.customer_id,
              },
              'bank',
            ),
          );
        }
      }

      const named = applyCashVirmanFlow(await withCashFlowNames(drafts), !registerId);
      return foldCashFlowByFiche(named).sort((a, b) => b.date.localeCompare(a.date)).slice(0, ROW_LIMIT);
    }

    const values: unknown[] = [start, end];
    const cashRegisterClause = registerId
      ? ` AND cl.register_id::text = $${values.push(registerId)}`
      : '';
    const queryParts = (mode: 'rich' | 'plain') =>
      buildCashBankMovementParts({
        mode,
        wantCash,
        wantBank,
        cashRegisterClause,
      });
    const richParts = queryParts('rich');
    if (!richParts.length) return [];
    let rawRows: Array<Record<string, unknown>> = [];
    try {
      const { rows } = await postgres.query<Record<string, unknown>>(
        `${richParts.join(' UNION ALL ')} ORDER BY date DESC LIMIT ${ROW_LIMIT}`,
        values,
      );
      rawRows = rows || [];
    } catch (err) {
      console.warn(
        '[erpReports] nakit akış cari bağları kurulamadı, yalın liste:',
        err instanceof Error ? err.message : err,
      );
      const plainParts = queryParts('plain');
      const { rows } = await postgres.query<Record<string, unknown>>(
        `${plainParts.join(' UNION ALL ')} ORDER BY date DESC LIMIT ${ROW_LIMIT}`,
        values,
      );
      rawRows = rows || [];
    }
    const named = applyCashVirmanFlow(
      await withCashFlowNames(rawRows.map((row) => cashFlowDraft(row))),
      !registerId,
    );
    return foldCashFlowByFiche(named);
  },

  async getPurchaseSummary(opts: {
    startDate: string;
    endDate: string;
    groupBy?: 'day' | 'month' | 'supplier';
  }): Promise<PurchaseSummaryRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    const groupBy = opts.groupBy ?? 'day';
    if (!start || !end) return [];

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();
      const sales = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_sales`,
          {
            select: 'date,customer_name,net_amount,fiche_type,trcode,is_cancelled,status',
            order: 'date.asc',
            limit: 5000,
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);

      const map = new Map<string, PurchaseSummaryRow>();
      for (const s of sales || []) {
        if (s.is_cancelled === true || s.is_cancelled === 'true') continue;
        const d = String(s.date || '').slice(0, 10);
        if (d < start || d > end) continue;
        const ft = String(s.fiche_type || '').toLowerCase();
        const tr = Number(s.trcode ?? 0);
        const isPurchase = ft === 'purchase_invoice' || [1, 4, 5, 6, 13, 26, 41, 42].includes(tr);
        const isReturn = ft === 'return_invoice';
        if (!isPurchase && !isReturn) continue;
        const amt = Number(s.net_amount ?? 0);
        let periodKey = d;
        let periodLabel = d;
        let supplierName = String(s.customer_name || '') || '—';
        if (groupBy === 'month') {
          periodKey = d.slice(0, 7);
          periodLabel = periodKey;
          supplierName = '—';
        } else if (groupBy === 'day') {
          supplierName = '—';
        } else {
          periodKey = supplierName;
          periodLabel = supplierName;
        }
        const cur = map.get(periodKey) || {
          periodKey,
          periodLabel,
          supplierName: groupBy === 'supplier' ? supplierName : '—',
          invoiceCount: 0,
          totalAmount: 0,
          returnAmount: 0,
          netAmount: 0,
        };
        if (isReturn) {
          cur.returnAmount += Math.abs(amt);
          cur.netAmount -= Math.abs(amt);
        } else {
          cur.invoiceCount += 1;
          cur.totalAmount += Math.abs(amt);
          cur.netAmount += Math.abs(amt);
        }
        map.set(periodKey, cur);
      }
      return Array.from(map.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
    }

    let groupExpr: string;
    let labelExpr: string;
    let supplierExpr: string;
    if (groupBy === 'month') {
      groupExpr = `to_char(${sqlUtcDate('s.date')}, 'YYYY-MM')`;
      labelExpr = groupExpr;
      supplierExpr = `''`;
    } else if (groupBy === 'supplier') {
      groupExpr = `COALESCE(NULLIF(TRIM(s.customer_name), ''), '—')`;
      labelExpr = groupExpr;
      supplierExpr = groupExpr;
    } else {
      groupExpr = `to_char(${sqlUtcDate('s.date')}, 'YYYY-MM-DD')`;
      labelExpr = groupExpr;
      supplierExpr = `''`;
    }

    const { rows } = await postgres.query(
      `
      SELECT
        ${groupExpr} AS period_key,
        ${labelExpr} AS period_label,
        ${supplierExpr} AS supplier_name,
        COUNT(*) FILTER (
          WHERE s.fiche_type = 'purchase_invoice' OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42)
        ) AS invoice_count,
        COALESCE(SUM(
          CASE
            WHEN s.fiche_type = 'purchase_invoice' OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42)
              THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) AS total_amount,
        COALESCE(SUM(
          CASE
            WHEN s.fiche_type = 'return_invoice' THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) AS return_amount
      FROM sales s
      WHERE COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND ${sqlUtcDate('s.date')} >= $1::date
        AND ${sqlUtcDate('s.date')} <= $2::date
        AND (
          s.fiche_type = 'purchase_invoice'
          OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42)
          OR (
            s.fiche_type = 'return_invoice'
            AND EXISTS (SELECT 1 FROM suppliers sp WHERE sp.id = s.customer_id)
          )
        )
      GROUP BY 1, 2, 3
      HAVING COUNT(*) > 0
      ORDER BY 1
      LIMIT ${ROW_LIMIT}
      `,
      [start, end],
    );

    return (rows || []).map((r: any) => {
      const totalAmount = Number(r.total_amount ?? 0);
      const returnAmount = Number(r.return_amount ?? 0);
      return {
        periodKey: String(r.period_key ?? ''),
        periodLabel: String(r.period_label ?? ''),
        supplierName: String(r.supplier_name || '—'),
        invoiceCount: Number(r.invoice_count ?? 0),
        totalAmount,
        returnAmount,
        netAmount: totalAmount - returnAmount,
      };
    });
  },

  /**
   * Tedarikçi bazında toplam alış ve alış iadeleri (net = alış − iade).
   * Alış: purchase_invoice / Alis trcode (6 hariç).
   * İade: trcode 6 (Alış İade) veya return_invoice + tedarikçi kartı.
   */
  async getSupplierPurchaseReturns(opts: {
    startDate: string;
    endDate: string;
  }): Promise<SupplierPurchaseReturnRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!start || !end) return [];

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();
      const [sales, suppliers] = await Promise.all([
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_sales`,
            {
              select:
                'date,customer_id,customer_name,net_amount,fiche_type,trcode,is_cancelled,status',
              order: 'date.asc',
              limit: 8000,
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_suppliers`,
            { select: 'id,code,name', limit: 4000 },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);

      const supplierById = new Map(
        (suppliers || []).map((s) => [String(s.id), s] as const),
      );
      const supplierIds = new Set(supplierById.keys());

      const map = new Map<string, SupplierPurchaseReturnRow>();
      for (const s of sales || []) {
        if (s.is_cancelled === true || s.is_cancelled === 'true') continue;
        const st = String(s.status || 'approved').toLowerCase();
        if (st === 'cancelled' || st === 'canceled') continue;
        const d = String(s.date || '').slice(0, 10);
        if (d < start || d > end) continue;

        const purchase = isPurchaseInvoiceRow(s);
        const ret = isPurchaseReturnInvoiceRow(s, supplierIds);
        if (!purchase && !ret) continue;

        const sid = String(s.customer_id || '');
        const card = sid ? supplierById.get(sid) : undefined;
        const supplierName =
          String(card?.name || s.customer_name || '').trim() || '—';
        const supplierCode = String(card?.code || '').trim();
        const key = sid || `name:${supplierName}`;
        const amt = Math.abs(Number(s.net_amount ?? 0));
        const cur = map.get(key) || {
          supplierId: sid,
          supplierCode,
          supplierName,
          purchaseCount: 0,
          returnCount: 0,
          purchaseAmount: 0,
          returnAmount: 0,
          netAmount: 0,
        };
        if (!cur.supplierCode && supplierCode) cur.supplierCode = supplierCode;
        if (cur.supplierName === '—' && supplierName !== '—') cur.supplierName = supplierName;

        if (ret) {
          cur.returnCount += 1;
          cur.returnAmount += amt;
          cur.netAmount -= amt;
        } else {
          cur.purchaseCount += 1;
          cur.purchaseAmount += amt;
          cur.netAmount += amt;
        }
        map.set(key, cur);
      }

      return Array.from(map.values())
        .filter((r) => r.purchaseAmount > 0.009 || r.returnAmount > 0.009)
        .sort(
          (a, b) =>
            b.purchaseAmount - a.purchaseAmount ||
            a.supplierName.localeCompare(b.supplierName, 'tr'),
        )
        .slice(0, ROW_LIMIT);
    }

    const purchaseTrSql = PURCHASE_ONLY_TRCODES.join(', ');
    const { rows } = await postgres.query(
      `
      SELECT
        COALESCE(sup.id::text, c.id::text, '') AS supplier_id,
        COALESCE(sup.code, c.code, '') AS supplier_code,
        COALESCE(
          NULLIF(TRIM(sup.name), ''),
          NULLIF(TRIM(c.name), ''),
          NULLIF(TRIM(s.customer_name), ''),
          '—'
        ) AS supplier_name,
        COUNT(*) FILTER (
          WHERE COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
            AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
            AND (
              LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
              OR s.trcode IN (${purchaseTrSql})
            )
        ) AS purchase_count,
        COUNT(*) FILTER (
          WHERE s.trcode = ${PURCHASE_RETURN_TRCODE}
            OR (
              LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
              AND COALESCE(s.trcode, 0) NOT IN (${SALES_RETURN_TRCODES.join(', ')})
              AND EXISTS (SELECT 1 FROM suppliers sp WHERE sp.id = s.customer_id)
            )
        ) AS return_count,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
              AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
              AND (
                LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
                OR s.trcode IN (${purchaseTrSql})
              )
              THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) AS purchase_amount,
        COALESCE(SUM(
          CASE
            WHEN s.trcode = ${PURCHASE_RETURN_TRCODE}
              OR (
                LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
                AND COALESCE(s.trcode, 0) NOT IN (${SALES_RETURN_TRCODES.join(', ')})
                AND EXISTS (SELECT 1 FROM suppliers sp WHERE sp.id = s.customer_id)
              )
              THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) AS return_amount
      FROM sales s
      LEFT JOIN suppliers sup ON sup.id = s.customer_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND ${sqlUtcDate('s.date')} >= $1::date
        AND ${sqlUtcDate('s.date')} <= $2::date
        AND (
          s.trcode = ${PURCHASE_RETURN_TRCODE}
          OR (
            LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
            AND COALESCE(s.trcode, 0) NOT IN (${SALES_RETURN_TRCODES.join(', ')})
            AND EXISTS (SELECT 1 FROM suppliers sp WHERE sp.id = s.customer_id)
          )
          OR (
            COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
            AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
            AND (
              LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
              OR s.trcode IN (${purchaseTrSql})
            )
          )
        )
      GROUP BY 1, 2, 3
      HAVING
        COALESCE(SUM(
          CASE
            WHEN COALESCE(s.trcode, 0) <> ${PURCHASE_RETURN_TRCODE}
              AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) <> 'return_invoice'
              AND (
                LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'a')
                OR s.trcode IN (${purchaseTrSql})
              )
              THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) > 0.009
        OR COALESCE(SUM(
          CASE
            WHEN s.trcode = ${PURCHASE_RETURN_TRCODE}
              OR (
                LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
                AND COALESCE(s.trcode, 0) NOT IN (${SALES_RETURN_TRCODES.join(', ')})
                AND EXISTS (SELECT 1 FROM suppliers sp WHERE sp.id = s.customer_id)
              )
              THEN ABS(COALESCE(s.net_amount, 0))
            ELSE 0
          END
        ), 0) > 0.009
      ORDER BY purchase_amount DESC, supplier_name ASC
      LIMIT ${ROW_LIMIT}
      `,
      [start, end],
    );

    return (rows || []).map((r: any) => {
      const purchaseAmount = Number(r.purchase_amount ?? 0);
      const returnAmount = Number(r.return_amount ?? 0);
      return {
        supplierId: String(r.supplier_id ?? ''),
        supplierCode: String(r.supplier_code ?? ''),
        supplierName: String(r.supplier_name || '—'),
        purchaseCount: Number(r.purchase_count ?? 0),
        returnCount: Number(r.return_count ?? 0),
        purchaseAmount,
        returnAmount,
        netAmount: purchaseAmount - returnAmount,
      };
    });
  },

  async getCollectionDue(opts?: { horizonDays?: number }): Promise<CollectionDueRow[]> {
    const horizon = Math.max(1, Math.min(365, opts?.horizonDays ?? 30));
    const today = localTodayDateKey();
    const aging = await this.getCariAging({ cardType: 'customer' });
    const horizonEnd = addDaysYmd(today, horizon);

    return aging
      .filter((r) => r.cardType === 'customer' && r.amount > 0)
      .map((r) => {
        const daysUntilDue = ymdDiff(r.dueDate, today);
        let status: CollectionDueRow['status'] = 'upcoming';
        if (daysUntilDue < 0) status = 'overdue';
        else if (daysUntilDue <= 7) status = 'due_soon';
        return {
          accountId: r.accountId,
          accountCode: r.accountCode,
          accountName: r.accountName,
          ficheNo: r.ficheNo,
          invoiceDate: r.invoiceDate,
          dueDate: r.dueDate,
          amount: r.amount,
          daysUntilDue,
          status,
        };
      })
      .filter((r) => r.status === 'overdue' || (r.dueDate >= today && r.dueDate <= horizonEnd))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount)
      .slice(0, ROW_LIMIT);
  },

  async getSalesReturns(opts: { startDate: string; endDate: string }): Promise<SalesReturnRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!start || !end) return [];

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();
      const sales = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_sales`,
          {
            select:
              'id,fiche_no,date,customer_name,payment_method,net_amount,cashier,notes,fiche_type,trcode,is_cancelled,status,is_deposit',
            order: 'date.desc',
            limit: ROW_LIMIT,
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      const inRange = (sales || []).filter((s) => {
        const d = String(s.date || '').slice(0, 10);
        return d >= start && d <= end;
      });
      return mapReturnReportRows(inRange).slice(0, ROW_LIMIT);
    }

    const { rows } = await postgres.query(
      `
      SELECT
        s.id::text AS id,
        COALESCE(s.fiche_no, '') AS fiche_no,
        ${sqlUtcDate('s.date')}::text AS date,
        COALESCE(s.customer_name, '') AS account_name,
        COALESCE(s.payment_method, '') AS payment_method,
        COALESCE(s.net_amount, 0) AS net_amount,
        COALESCE(s.cashier, '') AS cashier,
        COALESCE(s.notes, '') AS notes,
        COALESCE(s.trcode, 0) AS trcode,
        LOWER(TRIM(COALESCE(s.fiche_type, ''))) AS fiche_type,
        COALESCE(s.is_deposit, false) AS is_deposit
      FROM sales s
      WHERE COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND COALESCE(s.is_deposit, false) = false
        AND (
          LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('return_invoice', 'i')
          OR s.trcode IN (${SALES_RETURN_TRCODES.join(', ')}, ${PURCHASE_RETURN_TRCODE})
        )
        AND ${sqlUtcDate('s.date')} >= $1::date
        AND ${sqlUtcDate('s.date')} <= $2::date
      ORDER BY s.date DESC
      LIMIT ${ROW_LIMIT}
      `,
      [start, end],
    );
    return mapReturnReportRows(rows || []);
  },

  async getProductGrossProfit(opts: {
    startDate: string;
    endDate: string;
    /** product = yalnızca Malzeme (varsayılan); service = Hizmet; all = ikisi */
    lineKind?: 'all' | 'product' | 'service';
  }): Promise<ProductGrossProfitRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!start || !end) return [];
    const firmNr = padFirm();
    const lineKind = opts.lineKind ?? 'product';

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = firmNr;
      const pn = padPeriod();
      const [sales, items, products, services, beautyServices, consumables, beautySales, beautyAppointments] = await Promise.all([
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_sales`,
            {
              select: 'id,date,fiche_no,fiche_type,is_cancelled,status,trcode,created_at,net_amount,is_deposit,linked_appointment_id,sale_group_id',
              order: 'date.desc',
              limit: 8000,
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
              limit: 12000,
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_products`,
            { select: 'id,code,barcode,name,cost', limit: 8000 },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_services`,
            { select: 'id,code,name,purchase_price', limit: 8000 },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_beauty_services`,
            { select: 'id,name,cost_price', limit: 8000 },
            { schema: 'beauty' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_beauty_service_consumables`,
            { select: 'service_id,product_id,qty_per_service', limit: 12000 },
            { schema: 'beauty' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_beauty_sales`,
            { select: 'invoice_number,linked_appointment_id', limit: 8000 },
            { schema: 'beauty' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_beauty_appointments`,
            { select: 'id,status,total_price,deposit_amount,remainder_paid_amount,service_name,remainder_sale_id,deposit_sale_id,sale_group_id', limit: 8000 },
            { schema: 'beauty' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);

      const salesById = new Map((sales || []).map((s) => [String(s.id), s]));
      const productById = new Map(
        (products || []).map((p) => [String(p.id), p]),
      );
      const serviceById = new Map(
        (services || []).map((s) => [String(s.id), s]),
      );
      const beautyById = new Map(
        (beautyServices || []).map((s) => [String(s.id), s]),
      );
      const serviceByCode = new Map<string, Record<string, unknown>>();
      for (const s of services || []) {
        const code = String(s.code || '').trim();
        if (code) serviceByCode.set(code, s);
      }
      const productIdByCode = new Map<string, string>();
      const productIdByBarcode = new Map<string, string>();
      for (const p of products || []) {
        const id = String(p.id);
        const code = String(p.code || '').trim();
        const barcode = String(p.barcode || '').trim();
        if (code) productIdByCode.set(code, id);
        if (barcode) productIdByBarcode.set(barcode, id);
      }

      type PurchaseHit = { unitCost: number; dateKey: string; createdAt: string };
      const lastById = new Map<string, PurchaseHit>();
      const lastByCode = new Map<string, PurchaseHit>();

      const resolvePurchaseProductId = (it: Record<string, unknown>): string => {
        const fromLine = resolveLineProductId(it);
        if (fromLine) return fromLine;
        const code = String(it.item_code || '').trim();
        if (!code) return '';
        return productIdByCode.get(code) || productIdByBarcode.get(code) || '';
      };

      for (const it of items || []) {
        const inv = salesById.get(String(it.invoice_id));
        if (!inv || inv.is_cancelled === true || inv.is_cancelled === 'true') continue;
        if (!isPurchaseFiche(inv)) continue;
        const itemType = String(it.item_type || 'Malzeme');
        if (itemType === 'Promosyon' || itemType === 'İndirim') continue;
        const unitCost = unitCostFromPurchaseLine(it);
        if (!unitCost) continue;
        const dateKey = String(inv.date || '').slice(0, 10);
        const createdAt = String(inv.created_at || '');
        const hit: PurchaseHit = { unitCost, dateKey, createdAt };
        const newer = (prev: PurchaseHit | undefined) =>
          !prev ||
          dateKey > prev.dateKey ||
          (dateKey === prev.dateKey && createdAt > prev.createdAt);

        const pid = resolvePurchaseProductId(it);
        if (pid && newer(lastById.get(pid))) lastById.set(pid, hit);
        const code = String(it.item_code || '').trim();
        if (code && newer(lastByCode.get(code))) lastByCode.set(code, hit);
      }

      const recipeByService = new Map<string, number>();
      for (const c of consumables || []) {
        const sid = String(c.service_id || '').trim();
        const cpid = String(c.product_id || '').trim();
        if (!sid || !cpid) continue;
        const qty = Number(c.qty_per_service ?? 0) || 0;
        const consProd = productById.get(cpid);
        const consCode = String(consProd?.code || '').trim();
        const consBarcode = String(consProd?.barcode || '').trim();
        const unit =
          lastById.get(cpid)?.unitCost ||
          (consCode && lastByCode.get(consCode)?.unitCost) ||
          (consBarcode && lastByCode.get(consBarcode)?.unitCost) ||
          0;
        if (!qty) continue;
        recipeByService.set(sid, (recipeByService.get(sid) || 0) + qty * unit);
      }

      const linesNetByInvoice = new Map<string, number>();
      for (const it of items || []) {
        const iid = String(it.invoice_id || '');
        if (!iid) continue;
        linesNetByInvoice.set(
          iid,
          (linesNetByInvoice.get(iid) || 0) + (Number(it.net_amount ?? 0) || 0),
        );
      }

      // BEA-* (güzellik) randevu köprüsü: fiche_no → { total_price, status }
      // Bug 32 — beauty_sales üzerinden appointment'a bağlanır (sales.linked_appointment_id NULL).
      // No-show / iptal randevulara bağlı BEA fişleri Hariç (ciro yansımaz, sadece kasa etkilenir).
      const apptStatusById = new Map<string, string>();
      const apptTotalPriceById = new Map<string, number>();
      for (const a of beautyAppointments || []) {
        const id = String(a.id || '').trim();
        if (!id) continue;
        apptStatusById.set(id, String(a.status || '').toLowerCase().trim());
        apptTotalPriceById.set(id, Number(a.total_price ?? 0) || 0);
      }
      const beautyApptByFiche = new Map<string, { totalPrice: number; status: string; appointmentId: string }>();
      for (const bs of beautySales || []) {
        const ficheNo = String(bs.invoice_number || '').trim();
        const apptId = String(bs.linked_appointment_id || '').trim();
        if (!ficheNo || !apptId) continue;
        beautyApptByFiche.set(ficheNo, {
          totalPrice: apptTotalPriceById.get(apptId) ?? 0,
          status: apptStatusById.get(apptId) ?? '',
          appointmentId: apptId,
        });
      }
      const BEA_EXCLUDED_STATUSES = new Set([
        'cancelled', 'canceled', 'refunded', 'void',
        'silindi', 'iptal', 'deleted', 'no_show',
      ]);

      const saleOk = new Set(
        (sales || [])
          .filter((s) => {
            if (s.is_cancelled === true || s.is_cancelled === 'true') return false;
            const st = String(s.status || 'approved').toLowerCase();
            if (!(st === 'completed' || st === 'approved' || !s.status)) return false;
            if (!isPlSalesOrReturnFiche(s)) return false;
            const d = String(s.date || '').slice(0, 10);
            if (d < start || d > end) return false;
            // Bug 28 follow-up — Rezervasyon peşinatı Hariç (henüz
            // hizmet verilmemiş avanslar Brüt Kâr'a katılmaz).
            if (s.is_deposit === true || s.is_deposit === 'true') return false;
            // Bug 26 follow-up — Randevuya bağlı fiş hizmet tamamlanmamışsa
            // Hariç (status completed/paid/tamamlandı dışındakiler).
            const linkedAppt = String(s.linked_appointment_id || '').trim();
            if (linkedAppt) {
              const completed = new Set([
                'completed', 'complete', 'done', 'finished',
                'tamamlandi', 'tamamlandı', 'paid', 'closed',
              ]);
              if (!completed.has(st)) return false;
            }
            // Bug 32 (2026-10-09 guzel DB) — BEA-* (güzellik) satışı randevuya
            // bağlıysa appointment status kontrolü. No-show / iptal
            // randevulara bağlı BEA fişleri Hariç (ciro yansımaz, sadece
            // kasa'ya gider).
            // Ürün satırı randevu köprüsü olmadan da kalır. Hizmet satırı
            // aşağıda, fiş BEA ve randevu yok/iptal ise düşer.
            return true;
          })
          .map((s) => String(s.id)),
      );

      const nonDepositCountByInvoice = new Map<string, number>();
      for (const it of items || []) {
        const invoiceId = String(it.invoice_id || '');
        if (!saleOk.has(invoiceId)) continue;
        const rawItemType = String(it.item_type ?? '').trim();
        if (rawItemType === 'Promosyon' || rawItemType === 'İndirim') continue;
        const name = String(it.item_name ?? '');
        const code = String(it.item_code ?? '');
        const depositLine = rawItemType.toLocaleLowerCase('tr-TR') === 'deposit'
          || name.toLocaleLowerCase('tr-TR').startsWith('depozito')
          || name.toLocaleLowerCase('tr-TR').startsWith('deposit')
          || code.toLocaleLowerCase('tr-TR') === 'deposit';
        if (depositLine) continue;
        nonDepositCountByInvoice.set(invoiceId, (nonDepositCountByInvoice.get(invoiceId) || 0) + 1);
      }

      type GrossFoldLine = {
        index: number;
        invoiceId: string;
        productName: string;
        lineType: string;
        quantity: number;
        total: number;
        invoiceClosed: boolean;
      };
      const prepared: GrossFoldLine[] = [];
      (items || []).forEach((it, index) => {
        if (!saleOk.has(String(it.invoice_id))) return;
        const rawItemType = String(it.item_type ?? '').trim();
        const itemType = rawItemType || 'Malzeme';
        if (itemType === 'Promosyon' || itemType === 'İndirim') return;
        const inv = salesById.get(String(it.invoice_id));
        if (!inv) return;
        const ficheNo = String(inv.fiche_no || '').trim();
        const appt = beautyApptByFiche.get(ficheNo);
        const beaServiceBlocked = ficheNo.startsWith('BEA-')
          && (!appt || BEA_EXCLUDED_STATUSES.has(appt.status));
        if (beaServiceBlocked && !isExplicitProductItemType(rawItemType)) return;
        const sgn = isSalesReturnFiche(inv) ? -1 : 1;
        const rawLineNet = Number(it.net_amount ?? 0) || 0;
        const invoiceId = String(it.invoice_id);
        const lineNet = sgn * resolveBeautyLineNet({
          ficheNo,
          itemType: rawItemType || itemType,
          lineNet: rawLineNet,
          appointmentTotal: appt?.totalPrice ?? 0,
          nonDepositLineCount: nonDepositCountByInvoice.get(invoiceId) || 1,
          linesNetSum: linesNetByInvoice.get(invoiceId) || 0,
          invoiceNet: Number(inv.net_amount ?? 0) || 0,
        });
        prepared.push({
          index,
          invoiceId,
          productName: String(it.item_name ?? ''),
          lineType: rawItemType || itemType,
          quantity: Number(it.quantity ?? 0) || 0,
          total: lineNet,
          invoiceClosed: true,
        });
      });
      const byInvoice = new Map<string, GrossFoldLine[]>();
      for (const line of prepared) {
        const bucket = byInvoice.get(line.invoiceId);
        if (bucket) bucket.push(line);
        else byInvoice.set(line.invoiceId, [line]);
      }
      const revenueByIndex = new Map<number, number>();
      for (const [invoiceId, group] of byInvoice) {
        const inv = salesById.get(invoiceId);
        const sgn = inv && isSalesReturnFiche(inv) ? -1 : 1;
        const ficheNo = String(inv?.fiche_no || '').trim();
        const bridgedId = beautyApptByFiche.get(ficheNo)?.appointmentId || null;
        const linked = inv?.linked_appointment_id == null || String(inv.linked_appointment_id).trim() === ''
          ? bridgedId
          : String(inv.linked_appointment_id);
        const folded = foldRestProfitInvoice(group, {
          id: invoiceId,
          total: sgn * (Number(inv?.net_amount ?? 0) || 0),
          linkedAppointmentId: linked,
          saleGroupId: inv?.sale_group_id == null ? null : String(inv.sale_group_id),
        }, beautyAppointments);
        for (const line of folded) {
          if (typeof line.index === 'number') revenueByIndex.set(line.index, line.total);
        }
      }

      const map = new Map<string, ProductGrossProfitRow>();
      const saleItems = items || [];
      for (let lineIndex = 0; lineIndex < saleItems.length; lineIndex++) {
        const it = saleItems[lineIndex];
        if (!saleOk.has(String(it.invoice_id))) continue;
        const rawItemType = String(it.item_type ?? '').trim();
        const itemType = rawItemType || 'Malzeme';
        if (itemType === 'Promosyon' || itemType === 'İndirim') continue;
        if (!revenueByIndex.has(lineIndex)) continue;
        const pid = resolveLineProductId(it);
        const prod = pid ? productById.get(pid) : undefined;
        const beauty = pid ? beautyById.get(pid) : undefined;
        const svc =
          (pid && serviceById.get(pid)) ||
          serviceByCode.get(String(it.item_code || '').trim()) ||
          undefined;
        const isService =
          isServiceLineType(rawItemType)
          || (!isExplicitProductItemType(rawItemType) && !!(svc || beauty));
        const inv = salesById.get(String(it.invoice_id));
        if (!inv) continue;
        const ficheNo = String(inv.fiche_no || '').trim();
        if (ficheNo.startsWith('BEA-') && !isExplicitProductItemType(rawItemType)) {
          const appt = beautyApptByFiche.get(ficheNo);
          if (!appt || BEA_EXCLUDED_STATUSES.has(appt.status)) continue;
        }
        if (lineKind === 'product' && isService) continue;
        if (lineKind === 'service' && !isService) continue;
        const sgn = isSalesReturnFiche(inv) ? -1 : 1;
        const code = displayItemCode(prod?.code, svc?.code, it.item_code);
        const rawLineNet = Number(it.net_amount ?? 0) || 0;
        const unitPrice = Number(it.unit_price ?? 0) || 0;
        // qty=0 ama tutar var (hatalı iade) → ciro/fiyattan miktar tahmin
        const absQty = inferQtyFromRevenue(
          Number(it.quantity ?? 0) || 0,
          rawLineNet,
          unitPrice,
        );
        const qty = sgn * absQty;
        const revenue = revenueByIndex.get(lineIndex) ?? 0;
        const resolvedPid =
          pid ||
          (String(it.item_code || '').trim() &&
            productIdByCode.get(String(it.item_code || '').trim())) ||
          (String(it.item_code || '').trim() &&
            productIdByBarcode.get(String(it.item_code || '').trim())) ||
          (String(prod?.code || '').trim() &&
            productIdByCode.get(String(prod?.code || '').trim())) ||
          '';
        const lpc =
          (resolvedPid && lastById.get(resolvedPid)?.unitCost) ||
          (pid && lastById.get(pid)?.unitCost) ||
          (String(it.item_code || '').trim() &&
            lastByCode.get(String(it.item_code || '').trim())?.unitCost) ||
          (String(prod?.code || '').trim() &&
            lastByCode.get(String(prod?.code || '').trim())?.unitCost) ||
          0;
        const recipeUnit =
          (resolvedPid && recipeByService.get(resolvedPid)) ||
          (pid && recipeByService.get(pid)) ||
          (svc && recipeByService.get(String(svc.id))) ||
          0;
        const serviceUnit = restServiceUnitCost({
          lineUnitCost: it.unit_cost,
          purchasePrice: svc?.purchase_price,
          beautyCostPrice: beauty?.cost_price,
          recipeUnitCost: recipeUnit,
        });
        const cost =
          sgn *
          lineCostAmount({
            quantity: absQty,
            lastPurchaseUnit: lpc,
            itemType,
            serviceUnitCost: serviceUnit,
            isService,
          });
        const gp = revenue - cost;
        const mapKey = `${isService ? 'S' : 'P'}|${resolvedPid || pid || code}`;
        const cur = map.get(mapKey) || {
          productId: resolvedPid || pid,
          productCode: code,
          productName: String(it.item_name ?? prod?.name ?? svc?.name ?? beauty?.name ?? ''),
          quantity: 0,
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          marginPct: 0,
          lineKind: isService ? ('service' as const) : ('product' as const),
        };
        cur.quantity += qty;
        cur.revenue += revenue;
        cur.cost += cost;
        cur.grossProfit += gp;
        if (!cur.productName && it.item_name) cur.productName = String(it.item_name);
        if (!cur.productId && (resolvedPid || pid)) cur.productId = resolvedPid || pid;
        map.set(mapKey, cur);
      }
      const baseRows = mergeProductGrossProfitRows(
        Array.from(map.values())
          .map((r) => ({
            ...r,
            marginPct: productGrossProfitMarginPct(r.revenue, r.grossProfit),
          }))
          .sort((a, b) => b.grossProfit - a.grossProfit)
          .slice(0, ROW_LIMIT),
      );
      return applyWeightedAvgCostToGrossProfit(baseRows, firmNr, end);
    }

    const profitCtes = buildProfitCostCtes('$1');
    const { rows } = await postgres.query(
      `
      WITH ${profitCtes}
      SELECT
        s.id::text AS invoice_id,
        (${SQL_SALES_SIGN}) * COALESCE(s.net_amount, 0) AS invoice_net,
        COALESCE(s.sale_group_id::text, '') AS sale_group_id,
        COALESCE(s.parent_sale_id::text, '') AS parent_sale_id,
        COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '') AS product_id,
        ${SQL_DISPLAY_ITEM_CODE} AS product_code,
        COALESCE(
          NULLIF(TRIM(si.item_name), ''),
          p.name,
          svc.name,
          bsvc.name,
          '—'
        ) AS product_name,
        COALESCE(si.item_type, '') AS item_type,
        CASE WHEN ${SQL_IS_SERVICE_LINE} THEN 'service' ELSE 'product' END AS line_kind,
        ${SIGNED_LINE_QTY_EXPR} AS quantity,
        ${SIGNED_FOLD_LINE_REVENUE_EXPR} AS revenue,
        ${SIGNED_LINE_COST_EXPR} AS cost,
        (${SQL_SALES_SIGN}) * (${SQL_SERVICE_DEPOSIT_AMOUNT}) AS service_deposit,
        ${SQL_FICHE_DEPOSIT_LIST} AS fiche_deposits,
        ${SQL_FICHE_REMAINDER_LIST} AS fiche_remainders,
        COALESCE(ba_total.appt_status, '') AS appointment_status
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      ${PRODUCTS_JOIN}
      ${SERVICE_COST_JOINS}
      ${LAST_PURCHASE_JOIN}
      ${INVOICE_LINE_SCALE_JOIN}
      ${BEAUTY_APPOINTMENT_BRIDGE_JOIN}
      WHERE s.firm_nr = $1
        AND COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND ${SQL_PL_SALES_OR_RETURN}
        AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
        AND ${SQL_BEAUTY_APPT_INCLUDED}
        AND ${sqlUtcDate('s.date')} >= $2::date
        AND ${sqlUtcDate('s.date')} <= $3::date
      `,
      [firmNr, start, end],
      { firmNr, periodNr: padPeriod() },
    );
    const folded = foldProductProfitSaleLines((rows || []).map((r: any) => {
      const invoiceNet = Number(r.invoice_net) || 0;
      const sign = invoiceNet < 0 ? -1 : 1;
      return {
        invoiceId: String(r.invoice_id || ''),
        invoiceNet,
        saleGroupId: String(r.sale_group_id || '').trim(),
        parentSaleId: String(r.parent_sale_id || '').trim(),
        productId: String(r.product_id ?? ''),
        productCode: displayItemCode(r.product_code),
        productName: String(r.product_name ?? ''),
        lineType: String(r.item_type || ''),
        lineKind: r.line_kind === 'service' ? 'service' as const : 'product' as const,
        quantity: Number(r.quantity ?? 0),
        total: Number(r.revenue ?? 0),
        cost: Number(r.cost ?? 0),
        depositAmount: sign * Math.abs(Number(r.service_deposit) || 0),
        ficheDeposits: parseFicheDepositList(r.fiche_deposits).map((n) => sign * Math.abs(n)),
        ficheRemainders: parseFicheDepositList(r.fiche_remainders).map((n) => sign * Math.abs(n)),
        appointmentStatus: String(r.appointment_status || ''),
        invoiceClosed: true,
      };
    })).filter((line) => lineKind === 'all' || line.lineKind === lineKind);

    const grouped = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      quantity: number;
      revenue: number;
      cost: number;
      lineKind: 'service' | 'product';
    }>();
    for (const line of folded) {
      const key = `${line.lineKind}|${line.productId}|${line.productCode}|${line.productName}`;
      const cur = grouped.get(key) || {
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: 0,
        revenue: 0,
        cost: 0,
        lineKind: line.lineKind,
      };
      cur.quantity += line.quantity;
      cur.revenue += line.total;
      cur.cost += line.cost;
      if (!cur.productId && line.productId) cur.productId = line.productId;
      grouped.set(key, cur);
    }
    const aggregated = Array.from(grouped.values())
      .filter((row) => Math.abs(row.revenue) > 0.009 || Math.abs(row.quantity) > 0.0001)
      .sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))
      .slice(0, ROW_LIMIT);

    return applyWeightedAvgCostToGrossProfit(
      mergeProductGrossProfitRows(
        aggregated.map((r) => {
          const grossProfit = r.revenue - r.cost;
          return {
            ...r,
            grossProfit,
            marginPct: productGrossProfitMarginPct(r.revenue, grossProfit),
          };
        }),
      ),
      firmNr,
      end,
    );
  },

  /**
   * Karlılık Analizi genel bakış — Kar-Zarar ile aynı satış katlaması.
   *   Ciro    = kapalı faturanın tam tutarı − iade
   *             (peşinat bir kez eklenir, ikinci kez eklenmez; açık ve iptal peşinat yok)
   *   Maliyet = satır SMM (formül değişmez)
   *   Brüt Kâr = Ciro − Maliyet
   *   Marj %   = (Brüt Kâr / Ciro) × 100, iki ondalık; ciro 0 ise 0
   */
  async getProductGrossProfitTotals(opts: {
    startDate: string;
    endDate: string;
    lineKind?: 'all' | 'product' | 'service';
  }): Promise<{
    ciro: number;
    maliyet: number;
    brutKar: number;
    marjPct: number;
    productCount: number;
    profitableProducts: number;
    lossProducts: number;
    topProduct: string | null;
  }> {
    const rows = await this.getProductGrossProfit({
      startDate: opts.startDate,
      endDate: opts.endDate,
      lineKind: opts.lineKind ?? 'all',
    });
    return aggregateProductGrossProfitTotals(rows);
  },

  async getCariExtract(opts: {
    accountId: string;
    cardType: 'customer' | 'supplier' | 'employee';
    startDate: string;
    endDate: string;
    accountName?: string;
  }): Promise<CariExtractRow[]> {
    const accountId = String(opts.accountId || '').trim();
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!accountId || !start || !end) return [];

    // Personel ekstresi — party_ledger (+ cash_lines) üzerinden
    if (opts.cardType === 'employee') {
      const { getPartyStatement } = await import('./partyStatements');
      const stmt = await getPartyStatement(accountId, 'employee', start, end);
      let running = Number(stmt.opening_balance) || 0;
      const openingRow: CariExtractRow | null =
        Math.abs(running) > 0.009
          ? {
              id: `opening-${accountId}`,
              date: start,
              ficheNo: '',
              definition: 'Açılış',
              // Personel: +bakiye = ödenmemiş maaş alacağı (Alacak), −bakiye = avans borcu (Borç)
              debit: running < 0 ? Math.abs(running) : 0,
              credit: running > 0 ? running : 0,
              balance: running,
              source: 'movement',
              ficheType: 'OPENING',
              trcode: 0,
              notes: '',
              isCancelled: false,
            }
          : null;
      const rows: CariExtractRow[] = [];
      if (openingRow) rows.push(openingRow);
      for (let idx = 0; idx < (stmt.rows || []).length; idx++) {
        const r = stmt.rows[idx];
        const debit = Number(r.debit) || 0;
        const credit = Number(r.credit) || 0;
        running = Number(r.balance_after);
        rows.push({
          id: `${r.id || r.fiche_no || 'e'}-${String(r.date || '').slice(0, 10)}-${idx}`,
          date: String(r.date || '').slice(0, 10),
          ficheNo: String(r.fiche_no ?? ''),
          definition: String(r.definition || r.transaction_type || ''),
          debit,
          credit,
          balance: running,
          source: r.source === 'cash_line' ? 'cash' : 'movement',
          ficheType: String(r.transaction_type || ''),
          trcode: 0,
          notes: String(r.definition || ''),
          isCancelled: false,
        });
      }
      return rows.slice(0, ROW_LIMIT);
    }

    // Cari listesi / ekstre paneli ile aynı kaynak: sales + cash_lines (customer_id / party_id).
    let accountName = String(opts.accountName || '').trim();
    if (!accountName) {
      try {
        const cards = await this.getCariBalances({
          cardType: opts.cardType,
          onlyNonZero: false,
        });
        accountName = cards.find((c) => c.accountId === accountId)?.accountName || '';
      } catch {
        accountName = '';
      }
    }

    const raw = await supplierAPI.getAccountStatement(
      accountId,
      start,
      end,
      accountName || undefined,
      opts.cardType,
    );
    const ekstre = buildEkstreRows(
      (raw || []).map((r: any) => ({
        ...r,
        date: r.date,
        fiche_no: r.fiche_no,
        fiche_type: r.fiche_type,
        trcode: r.trcode,
        notes: r.notes,
        total_amount: r.total_amount,
        is_cancelled: r.is_cancelled,
      })),
      opts.cardType,
    );

    return ekstre.map((r, idx) => {
      const ft = String(r.fiche_type || '');
      const trcode = Number(r.trcode) || 0;
      const cancelled = r.is_cancelled === true;
      const ftUpper = ft.trim().toUpperCase();
      let source: CariExtractRow['source'] = 'sale';
      if (ftUpper === 'CH_ODEME' || ftUpper === 'CH_TAHSILAT') source = 'cash';
      return {
        id: `${r.fiche_no || 'x'}-${String(r.date || '').slice(0, 10)}-${idx}`,
        date: String(r.date || '').slice(0, 10),
        ficheNo: String(r.fiche_no ?? ''),
        definition: resolveEkstreDescription(r.notes, ft, trcode, cancelled),
        debit: Number(r.borcAmount) || 0,
        credit: Number(r.alacakAmount) || 0,
        balance: Number(r.balance) || 0,
        source,
        ficheType: ft,
        trcode,
        notes: String(r.notes || ''),
        isCancelled: cancelled,
      };
    }).slice(0, ROW_LIMIT);
  },

  async getCriticalStock(): Promise<CriticalStockRow[]> {
    const avgMaps = await loadStockValuationUnitCostMaps();

    const mapRaw = (raw: {
      productId: string;
      productCode: string;
      productName: string;
      warehouseCode: string;
      stock: number;
      minStock: number;
      maxStock: number;
      safeStock: number;
      criticalStock: number;
      unitCost: number;
    }): CriticalStockRow | null => {
      const status = classifyCriticalStockLevel({
        stock: raw.stock,
        minStock: raw.minStock,
        maxStock: raw.maxStock,
        safeStock: raw.safeStock,
        criticalStock: raw.criticalStock,
      });
      if (status === 'ok') return null;
      const shownSafe = raw.safeStock > 0 ? raw.safeStock : raw.criticalStock;
      return {
        productId: raw.productId,
        productCode: raw.productCode,
        productName: raw.productName,
        warehouseCode: raw.warehouseCode,
        stock: raw.stock,
        minStock: raw.minStock,
        maxStock: raw.maxStock,
        safeStock: shownSafe,
        criticalStock: raw.criticalStock,
        unitCost: raw.unitCost,
        stockValue: raw.stock * raw.unitCost,
        status,
      };
    };

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const baseQuery = {
        is_active: 'eq.true',
        order: 'name.asc',
        limit: 4000,
      };
      let products: Record<string, unknown>[] = [];
      const selectWithSafe =
        'id,code,name,stock,min_stock,max_stock,safe_stock,critical_stock,cost,purchase_price,warehouse_code,is_active';
      const selectLegacy =
        'id,code,name,stock,min_stock,max_stock,critical_stock,cost,purchase_price,warehouse_code,is_active';
      try {
        products = await postgrest.get<Record<string, unknown>[]>(
          `/rex_${fn}_products`,
          { ...baseQuery, select: selectWithSafe },
          { schema: 'public' },
        );
      } catch (error) {
        const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
        const missingSafe = message.includes('safe_stock') || message.includes('42703') || message.includes('pgrst204');
        if (!missingSafe) throw error;
        products = await postgrest.get<Record<string, unknown>[]>(
          `/rex_${fn}_products`,
          { ...baseQuery, select: selectLegacy },
          { schema: 'public' },
        );
      }
      return (products || [])
        .map((p) => {
          const unitCost = resolveStockValuationUnitCost(avgMaps, {
            id: String(p.id ?? ''),
            code: String(p.code ?? ''),
            cost: Number(p.cost ?? 0) || 0,
            purchase_price: Number(p.purchase_price ?? 0) || 0,
          });
          return mapRaw({
            productId: String(p.id ?? ''),
            productCode: String(p.code ?? ''),
            productName: String(p.name ?? ''),
            warehouseCode: String(p.warehouse_code ?? '') || '—',
            stock: Number(p.stock ?? 0),
            minStock: Number(p.min_stock ?? 0),
            maxStock: Number(p.max_stock ?? 0),
            safeStock: Number(p.safe_stock ?? 0),
            criticalStock: Number(p.critical_stock ?? 0),
            unitCost,
          });
        })
        .filter((r): r is CriticalStockRow => r != null)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, ROW_LIMIT);
    }

    const levelFilter = `
          (COALESCE(p.min_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.min_stock)
          OR (COALESCE(p.safe_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.safe_stock)
          OR (
            COALESCE(p.safe_stock, 0) <= 0
            AND COALESCE(p.critical_stock, 0) > 0
            AND COALESCE(p.stock, 0) <= p.critical_stock
          )
          OR (COALESCE(p.max_stock, 0) > 0 AND COALESCE(p.stock, 0) > p.max_stock)
    `;
    const legacyFilter = `
          (COALESCE(p.critical_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.critical_stock)
          OR (COALESCE(p.min_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.min_stock)
          OR (COALESCE(p.max_stock, 0) > 0 AND COALESCE(p.stock, 0) > p.max_stock)
    `;
    const sqlFor = (filter: string, safeExpr: string) => `
      SELECT
        p.id::text AS product_id,
        COALESCE(p.code, '') AS product_code,
        COALESCE(p.name, '') AS product_name,
        COALESCE(NULLIF(TRIM(p.warehouse_code), ''), '—') AS warehouse_code,
        COALESCE(p.stock, 0) AS stock,
        COALESCE(p.min_stock, 0) AS min_stock,
        COALESCE(p.max_stock, 0) AS max_stock,
        ${safeExpr} AS safe_stock,
        COALESCE(p.critical_stock, 0) AS critical_stock,
        ${SQL_PRODUCT_CARD_UNIT_COST} AS unit_cost,
        COALESCE(p.cost, 0) AS cost,
        COALESCE(p.purchase_price, 0) AS purchase_price
      FROM products p
      WHERE COALESCE(p.is_active, true) = true
        AND (
          ${filter}
        )
      ORDER BY COALESCE(p.stock, 0) ASC
      LIMIT ${ROW_LIMIT}
    `;

    let rows: any[] = [];
    try {
      const result = await postgres.query(
        sqlFor(levelFilter, 'COALESCE(p.safe_stock, 0)'),
        [],
      );
      rows = result.rows || [];
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
      if (!message.includes('safe_stock') && !message.includes('42703')) throw error;
      const result = await postgres.query(
        sqlFor(legacyFilter, '0'),
        [],
      );
      rows = result.rows || [];
    }
    return (rows || [])
      .map((r: any) => {
        const unitCost = resolveStockValuationUnitCost(
          avgMaps,
          {
            id: String(r.product_id ?? ''),
            code: String(r.product_code ?? ''),
            cost: Number(r.cost ?? 0) || 0,
            purchase_price: Number(r.purchase_price ?? 0) || 0,
          },
          Number(r.unit_cost ?? 0),
        );
        return mapRaw({
          productId: String(r.product_id ?? ''),
          productCode: String(r.product_code ?? ''),
          productName: String(r.product_name ?? ''),
          warehouseCode: String(r.warehouse_code ?? '—'),
          stock: Number(r.stock ?? 0),
          minStock: Number(r.min_stock ?? 0),
          maxStock: Number(r.max_stock ?? 0),
          safeStock: Number(r.safe_stock ?? 0),
          criticalStock: Number(r.critical_stock ?? 0),
          unitCost,
        });
      })
      .filter((r): r is CriticalStockRow => r != null);
  },

  /**
   * Depo Stok Özeti — depo koduna göre SKU / miktar / stok değeri.
   * Değer: Σ(stok × birim maliyet); birim = ağırlıklı ort. alış → kart cost/purchase_price
   * (satış fiyatı değil). warehouse_code boşsa tek aktif deponun kodu/adı ile doldurulur
   * (ürün kartında depo alanı set edilmemişse tek depo varsayılır).
   */
  async getWarehouseStock(): Promise<WarehouseStockRow[]> {
    const avgMaps = await loadStockValuationUnitCostMaps();
    const firmNr = padFirm();

    // Tek aktif depo (boş warehouse_code fallback): kod + ad
    let defaultWhCode = '';
    let defaultWhName = '';
    try {
      const wh = await postgres.query<{ code: string; name: string }>(
        `SELECT code, name FROM stores WHERE COALESCE(is_active, true) = true ORDER BY code LIMIT 1`,
        [],
      );
      defaultWhCode = String(wh.rows?.[0]?.code ?? '').trim();
      defaultWhName = String(wh.rows?.[0]?.name ?? '').trim();
    } catch {
      /* yoksay — fallback '—' kullanılır */
    }

    /** Boş warehouse_code için fallback etiket: "ST_01 — Merkez Depo" */
    const fallbackLabel = defaultWhCode
      ? defaultWhName
        ? `${defaultWhCode} — ${defaultWhName}`
        : defaultWhCode
      : '—';

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const products = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${firmNr}_products`,
          {
            select: 'id,code,name,stock,cost,purchase_price,warehouse_code,min_stock,critical_stock,is_active',
            is_active: 'eq.true',
            limit: 5000,
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      const map = new Map<string, WarehouseStockRow>();
      for (const p of products || []) {
        const rawWh = String(p.warehouse_code || '').trim();
        const wh = rawWh || defaultWhCode || '—';
        const stock = Number(p.stock ?? 0);
        const minStock = Number(p.min_stock ?? 0);
        const criticalStock = Number(p.critical_stock ?? 0);
        const unitCost = resolveStockValuationUnitCost(avgMaps, {
          id: String(p.id ?? ''),
          code: String(p.code ?? ''),
          cost: Number(p.cost ?? 0) || 0,
          purchase_price: Number(p.purchase_price ?? 0) || 0,
        });
        const cur = map.get(wh) || {
          warehouseCode: wh,
          warehouseLabel: rawWh ? wh : fallbackLabel,
          productNames: [],
          productCodes: [],
          skuCount: 0,
          totalQty: 0,
          totalValue: 0,
          criticalCount: 0,
        };
        if (stock > 0 || minStock > 0 || criticalStock > 0) {
          // yalnızca görünür ürünler (stok > 0 veya kritik eşikle izlenen)
          const nm = String(p.name ?? '').trim();
          const cd = String(p.code ?? '').trim();
          if (nm) cur.productNames.push(nm);
          if (cd) cur.productCodes.push(cd);
        }
        cur.skuCount += 1;
        cur.totalQty += stock;
        cur.totalValue += stock * unitCost;
        if (
          (criticalStock > 0 && stock <= criticalStock) ||
          (minStock > 0 && stock <= minStock)
        ) {
          cur.criticalCount += 1;
        }
        map.set(wh, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue).slice(0, 500);
    }

    // SQL yolu: ürün satırlarını çekip ağırlıklı ort. ile değerle (kart cost 0 olsa bile alıştan gelir)
    const { rows } = await postgres.query(
      `
      SELECT
        p.id::text AS product_id,
        COALESCE(p.code, '') AS product_code,
        COALESCE(NULLIF(TRIM(p.name), ''), '') AS product_name,
        COALESCE(NULLIF(TRIM(p.warehouse_code), ''), '') AS warehouse_code,
        COALESCE(p.stock, 0) AS stock,
        COALESCE(p.min_stock, 0) AS min_stock,
        COALESCE(p.critical_stock, 0) AS critical_stock,
        COALESCE(p.cost, 0) AS cost,
        COALESCE(p.purchase_price, 0) AS purchase_price,
        ${SQL_PRODUCT_CARD_UNIT_COST} AS unit_cost
      FROM products p
      WHERE COALESCE(p.is_active, true) = true
        AND COALESCE(p.stock, 0) <> 0
      `,
      [],
    );
    const map = new Map<string, WarehouseStockRow>();
    for (const r of rows || []) {
      const rawWh = String(r.warehouse_code ?? '').trim();
      const wh = rawWh || defaultWhCode || '—';
      const stock = Number(r.stock ?? 0);
      const minStock = Number(r.min_stock ?? 0);
      const criticalStock = Number(r.critical_stock ?? 0);
      const unitCost = resolveStockValuationUnitCost(
        avgMaps,
        {
          id: String(r.product_id ?? ''),
          code: String(r.product_code ?? ''),
          cost: Number(r.cost ?? 0) || 0,
          purchase_price: Number(r.purchase_price ?? 0) || 0,
        },
        Number(r.unit_cost ?? 0),
      );
      const cur = map.get(wh) || {
        warehouseCode: wh,
        warehouseLabel: rawWh ? wh : fallbackLabel,
        productNames: [],
        productCodes: [],
        skuCount: 0,
        totalQty: 0,
        totalValue: 0,
        criticalCount: 0,
      };
      const nm = String(r.product_name ?? '').trim();
      const cd = String(r.product_code ?? '').trim();
      if (nm) cur.productNames.push(nm);
      if (cd) cur.productCodes.push(cd);
      cur.skuCount += 1;
      cur.totalQty += stock;
      cur.totalValue += stock * unitCost;
      if (
        (criticalStock > 0 && stock <= criticalStock) ||
        (minStock > 0 && stock <= minStock)
      ) {
        cur.criticalCount += 1;
      }
      map.set(wh, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue).slice(0, 500);
  },

  /* ========================================================================== */
  /* VIVA SOLAR — Yeni ERP Raporları (Faz 2)                                     */
  /* ========================================================================== */

  /**
   * EarningsByProject — fatura bazında kâr-zarar.
   * VIVA SOLAR `earnings` sayfası karşılığı.
   * Kaynak: `sales` (firm-period) + `sale_items.total_cost` + `cash_lines.amount*sign` tahsilat.
   * Mali denetim: iade (trcode 2/3 veya fiche_type 'return_invoice') negatif invoiceAmount ile döner.
   * `profit` = invoiceAmount - maliyet + tahsilat (iade ters işaret).
   */
  async getEarningsByProject(params: {
    from: string;
    to: string;
    cariIds?: string[];
    projectId?: string;
  }): Promise<EarningsByProjectRow[]> {
    const from = String(params.from ?? '').slice(0, 10);
    const to = String(params.to ?? '').slice(0, 10);
    const cariIds = Array.isArray(params.cariIds) ? params.cariIds.filter(Boolean) : [];
    if (!from || !to) return [];
    const firmNr = padFirm();

    const values: unknown[] = [firmNr, from, to];
    let cariClause = '';
    if (cariIds.length > 0) {
      values.push(cariIds);
      cariClause = `AND s.customer_id = ANY($${values.length}::uuid[])`;
    }

    const { rows } = await postgres.query(
      `
      SELECT
        s.id::text AS id,
        ${sqlUtcDate('s.date')}::text AS date,
        COALESCE(s.fiche_no, '') AS invoice_no,
        s.customer_id::text AS customer_id,
        COALESCE(c.code, '') AS customer_code,
        COALESCE(c.name, s.customer_name, '') AS customer_name,
        COALESCE(s.total_discount, 0) AS discount,
        COALESCE((
          SELECT SUM(cl.amount * cl.sign)
          FROM cash_lines cl
          WHERE cl.fiche_no = s.fiche_no
            AND UPPER(TRIM(COALESCE(cl.transaction_type, ''))) = 'CH_TAHSILAT'
        ), 0) AS collected,
        COALESCE(s.total_net, s.net_amount, 0) AS invoice_amount,
        COALESCE((
          SELECT SUM(si.total_cost)
          FROM sale_items si
          WHERE si.invoice_id = s.id
        ), 0) AS cost,
        COALESCE(s.total_cost, 0) AS total_cost,
        (
          LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('return_invoice')
          OR COALESCE(s.trcode, 0) IN (2, 3)
        ) AS is_return
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.firm_nr = $1::text
        AND ${sqlUtcDate('s.date')} BETWEEN $2::date AND $3::date
        AND COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')
        ${cariClause}
      ORDER BY s.date DESC, s.fiche_no
      LIMIT ${ROW_LIMIT}
      `,
      values,
    );

    return (rows || []).map((r: any) => {
      const invoiceAmount = Number(r.invoice_amount ?? 0);
      const cost = Number(r.cost ?? 0);
      const collected = Number(r.collected ?? 0);
      const discount = Number(r.discount ?? 0);
      const isReturn = r.is_return === true;
      const sign = isReturn ? -1 : 1;
      const signedInvoice = sign * invoiceAmount;
      const spent = Math.max(0, cost);
      const loadingExpense = 0;
      const dailyExpense = 0;
      const profit = signedInvoice - spent - loadingExpense - dailyExpense;
      return {
        id: String(r.id ?? ''),
        date: String(r.date ?? ''),
        invoiceNo: String(r.invoice_no ?? ''),
        customerId: String(r.customer_id ?? ''),
        customerName: String(r.customer_name ?? ''),
        projectId: undefined,
        projectName: undefined,
        category: isReturn ? 'return' : 'service',
        description: String(r.invoice_no ?? ''),
        discount,
        collected,
        invoiceAmount: signedInvoice,
        loadingExpense,
        spent,
        dailyExpense,
        profit,
        isReturn,
      };
    });
  },

  /**
   * CashLedger — kasa defteri (kümülatif bakiye).
   * VIVA SOLAR `TOTAL EXPENDITURE PER` + `total incoming` karşılığı.
   * Kaynak: `cash_lines` UNION `bank_lines`, artı kasaya yazılmamış nakit satış iadesi.
   * Gelen brüt giriştir (peşinat dahil). Nakit iade giden satırdır; peşinat düşülmez.
   * `cumulative` birleşik satırlar üzerinde yürüyen bakiyedir.
   */
  async getCashLedger(params: {
    from: string;
    to: string;
    groups?: string[];
    subGroups?: string[];
    cariId?: string;
  }): Promise<CashLedgerRow[]> {
    const from = String(params.from ?? '').slice(0, 10);
    const to = String(params.to ?? '').slice(0, 10);
    if (!from || !to) return [];
    const values: unknown[] = [from, to];
    let cariClause = '';
    // trx_date CTE'de date tipinde kalmalı — text + AT TIME ZONE → timezone(unknown, text)
    if (params.cariId) {
      values.push(String(params.cariId));
      cariClause = `WHERE x.trx_date BETWEEN $1::date AND $2::date AND x.customer_id = $${values.length}::uuid`;
    } else {
      cariClause = `WHERE x.trx_date BETWEEN $1::date AND $2::date`;
    }

    const sql = `
      WITH x AS (
        SELECT
          cl.id::text AS id,
          ${sqlUtcDate('cl.date')} AS trx_date,
          COALESCE(cl.fiche_no, '') AS fiche_no,
          cl.customer_id AS customer_id,
          cl.amount AS amount,
          COALESCE(cl.sign, 1) AS sign,
          COALESCE(cl.transaction_type, '') AS tx_type,
          COALESCE(cl.definition, '') AS description,
          cl.register_id AS register_id,
          'cash'::text AS register_kind
        FROM cash_lines cl
        UNION ALL
        SELECT
          bl.id::text AS id,
          ${sqlUtcDate('bl.date')} AS trx_date,
          COALESCE(bl.fiche_no, '') AS fiche_no,
          bl.customer_id AS customer_id,
          bl.amount AS amount,
          COALESCE(bl.sign, 1) AS sign,
          COALESCE(bl.transaction_type, '') AS tx_type,
          COALESCE(bl.definition, '') AS description,
          bl.register_id AS register_id,
          'bank'::text AS register_kind
        FROM bank_lines bl
      )
      SELECT
        x.id,
        x.trx_date::text AS date,
        x.fiche_no,
        ROW_NUMBER() OVER (PARTITION BY x.fiche_no ORDER BY x.id) AS sequence,
        UPPER(COALESCE(NULLIF(TRIM(x.tx_type), ''), 'OFFICE')) AS grp,
        '' AS sub_group,
        x.description,
        CASE WHEN x.sign > 0 THEN ABS(x.amount) ELSE 0 END AS incoming,
        CASE WHEN x.sign < 0 THEN ABS(x.amount) ELSE 0 END AS outgoing,
        x.customer_id::text AS cari_id,
        COALESCE(cust.name, sup.name, '') AS cari_name,
        x.register_id::text AS cash_register_id,
        COALESCE(
          CASE WHEN x.register_kind = 'cash' THEN cr.name ELSE NULL END,
          CASE WHEN x.register_kind = 'bank' THEN br.name ELSE NULL END,
          ''
        ) AS cash_register_name
      FROM x
      LEFT JOIN customers cust ON cust.id = x.customer_id
      LEFT JOIN suppliers sup ON sup.id = x.customer_id
      LEFT JOIN cash_registers cr
        ON x.register_kind = 'cash' AND cr.id = x.register_id
      LEFT JOIN bank_registers br
        ON x.register_kind = 'bank' AND br.id = x.register_id
      ${cariClause}
      ORDER BY x.trx_date ASC, x.fiche_no ASC, sequence ASC
      LIMIT ${ROW_LIMIT}
    `;

    const { rows } = await postgres.query(sql, values);
    type Raw = {
      id: string;
      date: string;
      fiche_no: string;
      sequence: number;
      grp: string;
      sub_group: string;
      description: string;
      incoming: number;
      outgoing: number;
      cari_id: string;
      cari_name: string;
      cash_register_id: string;
      cash_register_name: string;
    };
    const movements = ((rows || []) as Raw[]).map((r) => ({
      id: String(r.id ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      ficheNo: String(r.fiche_no ?? ''),
      sequence: Number(r.sequence ?? 1),
      group: String(r.grp ?? 'OFFICE'),
      subGroup: String(r.sub_group ?? ''),
      description: String(r.description ?? ''),
      incoming: Number(r.incoming ?? 0),
      outgoing: Number(r.outgoing ?? 0),
      cumulative: 0,
      cariId: String(r.cari_id ?? ''),
      cariName: String(r.cari_name ?? ''),
      cashRegisterId: String(r.cash_register_id ?? ''),
      cashRegisterName: String(r.cash_register_name ?? ''),
    }));
    const refunds = await fetchSalesCashRefundSources({
      from,
      to,
      cariId: params.cariId,
    });
    return mergeCashLedgerRefunds(movements, refunds);
  },

  /**
   * ContactAccountLegacy — eski müşteriler / devam eden alacaklar.
   * VIVA SOLAR `OLD CUSTOMER` karşılığı.
   * Kaynak: `sales` (firm-period) + cari kalan bakiye hesaplaması.
   * Kalan = fatura.net_amount − tahsilat (cash_lines.amount*sign toplamı, satıra bağlı fiche_no üzerinden).
   */
  async getContactAccountLegacy(params: {
    from: string;
    to: string;
    cariIds?: string[];
    productGroup?: string;
    priceMin?: number;
    priceMax?: number;
  }): Promise<Record<string, unknown>[]> {
    const from = String(params.from ?? '').slice(0, 10);
    const to = String(params.to ?? '').slice(0, 10);
    if (!from || !to) return [];
    const firmNr = padFirm();
    const values: unknown[] = [firmNr, from, to];
    let joins = '';
    let where = 'si.invoice_id = s.id';
    if (params.productGroup) {
      values.push(String(params.productGroup));
      joins = `LEFT JOIN products p ON p.id = si.product_id`;
      where += ` AND COALESCE(p.group_code, '') = $${values.length}`;
    } else {
      joins = `LEFT JOIN products p ON p.id = si.product_id`;
    }
    // Alış fiyatı filtresi: products.purchase_price tercih edilir; yoksa satır maliyeti (unit_cost).
    // Etiket "Alış Fiyatı" olduğundan eski unit_price (satış fiyatı) yerine alış maliyeti baz alınır.
    const purchasePriceExpr = `COALESCE(NULLIF(p.purchase_price, 0), NULLIF(si.unit_cost, 0), si.unit_price)`;
    if (typeof params.priceMin === 'number' && Number.isFinite(params.priceMin)) {
      values.push(params.priceMin);
      where += ` AND ${purchasePriceExpr} >= $${values.length}`;
    }
    if (typeof params.priceMax === 'number' && Number.isFinite(params.priceMax)) {
      values.push(params.priceMax);
      where += ` AND ${purchasePriceExpr} <= $${values.length}`;
    }
    if (Array.isArray(params.cariIds) && params.cariIds.length > 0) {
      values.push(params.cariIds.filter(Boolean));
      where += ` AND s.customer_id = ANY($${values.length}::uuid[])`;
    }

    const { rows } = await postgres.query(
      `
      WITH coll AS (
        SELECT cl.fiche_no, SUM(cl.amount * cl.sign) AS paid
        FROM cash_lines cl
        WHERE UPPER(TRIM(COALESCE(cl.transaction_type, ''))) = 'CH_TAHSILAT'
          AND COALESCE(cl.fiche_no, '') <> ''
        GROUP BY cl.fiche_no
      )
      SELECT
        si.id::text AS id,
        ${sqlUtcDate('s.date')}::text AS date,
        COALESCE(s.fiche_no, '') AS receipt_no,
        COALESCE(NULLIF(TRIM(p.group_code), ''), 'OLD') AS grp,
        COALESCE(NULLIF(TRIM(p.sub_group_code), ''), '') AS sub_group,
        COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, '') AS product,
        COALESCE(si.quantity, 0) AS qty,
        ${purchasePriceExpr} AS price,
        COALESCE(si.discount_amount, 0) AS discount,
        COALESCE(si.net_amount, 0) AS line_total,
        COALESCE(c.name, s.customer_name, '') AS customer,
        COALESCE(s.net_amount, 0) AS invoice_total,
        COALESCE(s.net_amount, 0) - COALESCE(coll.paid, 0) AS balance
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN coll ON coll.fiche_no = s.fiche_no
      ${joins}
      WHERE ${where}
        AND s.firm_nr = $1::text
        AND ${sqlUtcDate('s.date')} BETWEEN $2::date AND $3::date
        AND COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND s.fiche_type IN ('sales_invoice', 'service', 'hizmet')
      ORDER BY s.date ASC, s.fiche_no, si.id
      LIMIT ${ROW_LIMIT}
      `,
      values,
    );

    const out = (rows || []).map((r: any) => ({
      id: String(r.id ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      receiptNo: String(r.receipt_no ?? ''),
      group: String(r.grp ?? ''),
      subGroup: String(r.sub_group ?? ''),
      product: String(r.product ?? ''),
      qty: Number(r.qty ?? 0),
      price: Number(r.price ?? 0),
      discount: Number(r.discount ?? 0),
      counterValue: 0,
      total: Number(r.line_total ?? 0),
      customer: String(r.customer ?? ''),
      invoiceTotal: Number(r.invoice_total ?? 0),
      balance: Number(r.balance ?? 0),
    }));
    return out.filter((r) => Number(r.balance ?? 0) > 0.009);
  },

  /**
   * StaffAttendance — PDKS / Personel yoklama (aylık).
   * VIVA SOLAR `personel` karşılığı.
   *
   * Kaynaklar (migration 137):
   *   • public.staff                    → personel kartları
   *   • rex_<f>_<p>_staff_attendance    → günlük giriş/çıkış (dönemsel)
   *   • rex_<f>_<p>_staff_leaves        → izinler
   *
   * Çıktı: StaffAttendanceRow[] — `days[0..30]` dizisinde
   *   1 = PRESENT/LATE/HALF_DAY, 0 = ABSENT, null = veri yok.
   * `salary` = public.staff.base_salary (aylık brüt); `extraPayment` şimdilik
   * mesai/prim için 0 (ileride ek sütun eklenecek).
   */
  async getStaffAttendance(params: {
    year: number;
    month: number;
    staffIds?: string[];
    departmentId?: string;
  }): Promise<Record<string, unknown>[]> {
    const year = Number(params.year);
    const month = Number(params.month);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return [];
    }
    const firmNr = padFirm();
    const periodNr = padPeriod();
    const staffIds = Array.isArray(params.staffIds) ? params.staffIds.filter(Boolean) : null;

    // PostgreSQL: 31 günlük tablo için generate_series ile join — performanslı.
    // Her zaman 31 sabit döner; frontend `daysInMonth` filtresiyle görünür kolon sayısını kırpar.
    if (DB_SETTINGS.connectionProvider !== 'rest_api') {
      try {
        const values: unknown[] = [firmNr, year, month, periodNr];
        let filterSql = '';
        if (staffIds && staffIds.length > 0) {
          values.push(staffIds);
          filterSql += ` AND s.id = ANY($${values.length}::uuid[])`;
        }
        if (params.departmentId) {
          values.push(String(params.departmentId));
          filterSql += ` AND COALESCE(s.department, d.name, '') = $${values.length}`;
        }
        const sql = `
          WITH days AS (
            SELECT generate_series(1, 31) AS day
          ),
          staff_base AS (
            SELECT s.id, s.full_name, COALESCE(s.department, d.name, '') AS department,
                   COALESCE(s.base_salary, 0) AS salary, s.created_at
              FROM public.staff s
              LEFT JOIN public.staff_departments d ON d.id = s.department_id
             WHERE s.firm_nr = $1 AND s.is_active = TRUE${filterSql}
          )
          SELECT
            sb.id::text AS staff_id,
            sb.full_name AS staff_name,
            sb.department,
            sb.salary,
            array_agg(
              CASE
                WHEN a.status IN ('PRESENT','LATE','HALF_DAY') THEN 1
                WHEN a.status = 'ABSENT' THEN 0
                ELSE NULL
              END
              ORDER BY d.day
            ) AS days,
            array_agg(to_char(a.clock_in, 'HH24:MI') ORDER BY d.day) AS clock_ins,
            array_agg(to_char(a.clock_out, 'HH24:MI') ORDER BY d.day) AS clock_outs,
            0::numeric AS extra_payment
          FROM staff_base sb
          CROSS JOIN days d
          LEFT JOIN public.staff_attendance a
            ON a.staff_id = sb.id
           AND a.firm_nr = $1
           AND a.period_nr = $4
           AND EXTRACT(DAY FROM a.attendance_date)::int = d.day
           AND EXTRACT(MONTH FROM a.attendance_date)::int = $3
           AND EXTRACT(YEAR FROM a.attendance_date)::int = $2
          GROUP BY sb.id, sb.full_name, sb.department, sb.salary, sb.created_at
          ORDER BY sb.created_at DESC NULLS LAST, sb.full_name ASC
          LIMIT ${ROW_LIMIT}`;
        const { rows } = await postgres.query(sql, values);
        return (rows || []).map((r: any) => ({
          staffId: String(r.staff_id ?? ''),
          staffName: String(r.staff_name ?? ''),
          department: String(r.department ?? ''),
          salary: Number(r.salary ?? 0),
          days: Array.from({ length: 31 }, (_, i) => {
            const raw = r.days?.[i];
            if (raw === 1 || raw === '1') return 1;
            if (raw === 0 || raw === '0') return 0;
            return null;
          }),
          clockIns: Array.from({ length: 31 }, (_, i) => {
            const v = r.clock_ins?.[i];
            return v == null || v === '' ? null : String(v).slice(0, 5);
          }),
          clockOuts: Array.from({ length: 31 }, (_, i) => {
            const v = r.clock_outs?.[i];
            return v == null || v === '' ? null : String(v).slice(0, 5);
          }),
          extraPayment: Number(r.extra_payment ?? 0),
        }));
      } catch (err: unknown) {
        // Tablo yoksa (henüz migration çalışmadıysa) boş dön + UI uyarısı
        const msg = err instanceof Error ? err.message : String(err);
        if (typeof console !== 'undefined') {
          console.warn(
            '[erpReportsAPI.getStaffAttendance] staff_attendance sorgusu başarısız:',
            msg,
          );
        }
        return [];
      }
    }

    // REST API (postgrest) yolu — postgrest üzerinden firm-period tablosu
    try {
      const { postgrest } = await import('./postgrestClient');
      const daysInMonth = new Date(year, month, 0).getDate();
      const [staffRows, attRows] = await Promise.all([
        postgrest
          .get<Record<string, unknown>[]>(
            `/staff`,
            {
              select: 'id,full_name,department,base_salary,is_active,firm_nr,created_at',
              firm_nr: `eq.${firmNr}`,
              is_active: 'eq.true',
              order: 'created_at.desc',
              limit: ROW_LIMIT,
              ...(staffIds && staffIds.length > 0
                ? { id: `in.(${staffIds.join(',')})` }
                : {}),
              ...(params.departmentId
                ? { department: `eq.${String(params.departmentId)}` }
                : {}),
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/staff_attendance`,
            {
              select: 'staff_id,attendance_date,status,clock_in,clock_out',
              firm_nr: `eq.${firmNr}`,
              period_nr: `eq.${periodNr}`,
              attendance_date: `gte.${year}-${String(month).padStart(2, '0')}-01`,
              limit: ROW_LIMIT,
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);
      const byStaff = new Map<string, Map<number, { status: string; clockIn: string | null; clockOut: string | null }>>();
      for (const a of attRows || []) {
        const sid = String(a.staff_id || '');
        if (!sid) continue;
        const d = String(a.attendance_date || '').slice(0, 10);
        const day = Number(d.slice(8, 10));
        if (!Number.isFinite(day) || day < 1 || day > daysInMonth) continue;
        const m = byStaff.get(sid) || new Map();
        const cin = a.clock_in == null ? null : String(a.clock_in).slice(0, 5);
        const cout = a.clock_out == null ? null : String(a.clock_out).slice(0, 5);
        m.set(day, { status: String(a.status || ''), clockIn: cin, clockOut: cout });
        byStaff.set(sid, m);
      }
      return (staffRows || []).map((s) => {
        const sid = String(s.id ?? '');
        const m = byStaff.get(sid) || new Map();
        const days: (1 | 0 | null)[] = Array.from({ length: 31 }, (_, i) => {
          const rec = m.get(i + 1);
          if (!rec?.status) return null;
          if (rec.status === 'ABSENT') return 0;
          if (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.status === 'HALF_DAY') return 1;
          return null;
        });
        const clockIns = Array.from({ length: 31 }, (_, i) => m.get(i + 1)?.clockIn ?? null);
        const clockOuts = Array.from({ length: 31 }, (_, i) => m.get(i + 1)?.clockOut ?? null);
        return {
          staffId: sid,
          staffName: String(s.full_name ?? ''),
          department: String(s.department ?? ''),
          salary: Number(s.base_salary ?? 0),
          days,
          clockIns,
          clockOuts,
          extraPayment: 0,
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof console !== 'undefined') {
        console.warn('[erpReportsAPI.getStaffAttendance] REST sorgusu başarısız:', msg);
      }
      return [];
    }
  },

  /**
   * InvoiceItemsDetail — fatura kalem detayı.
   * VIVA SOLAR `ALL PROJECY` karşılığı.
   * Kaynak: `sale_items` JOIN `sales` JOIN `customers` JOIN `parties` (cari polymorphism için).
   */
  async getInvoiceItemsDetail(params: {
    from: string;
    to: string;
    cariIds?: string[];
    search?: string;
    priceMin?: number;
    priceMax?: number;
  }): Promise<InvoiceItemsDetailRow[]> {
    const from = String(params.from ?? '').slice(0, 10);
    const to = String(params.to ?? '').slice(0, 10);
    if (!from || !to) return [];
    const firmNr = padFirm();
    const values: unknown[] = [firmNr, from, to];
    const where: string[] = [
      `s.firm_nr = $1::text`,
      `${sqlUtcDate('s.date')} BETWEEN $2::date AND $3::date`,
      `COALESCE(s.is_cancelled, false) = false`,
      `${SQL_COUNTABLE_SALE_STATUS}`,
      `s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')`,
    ];

    if (Array.isArray(params.cariIds) && params.cariIds.length > 0) {
      values.push(params.cariIds.filter(Boolean));
      where.push(`s.customer_id = ANY($${values.length}::uuid[])`);
    }
    if (typeof params.priceMin === 'number' && Number.isFinite(params.priceMin)) {
      values.push(params.priceMin);
      where.push(`COALESCE(si.unit_price, 0) >= $${values.length}`);
    }
    if (typeof params.priceMax === 'number' && Number.isFinite(params.priceMax)) {
      values.push(params.priceMax);
      where.push(`COALESCE(si.unit_price, 0) <= $${values.length}`);
    }
    if (params.search && String(params.search).trim()) {
      values.push(`%${String(params.search).trim()}%`);
      const ph = values.length;
      where.push(`(COALESCE(si.item_name, '') ILIKE $${ph} OR COALESCE(p.name, '') ILIKE $${ph})`);
    }

    const { rows } = await postgres.query(
      `
      SELECT
        si.id::text AS id,
        ${sqlUtcDate('s.date')}::text AS date,
        COALESCE(s.fiche_no, '') AS invoice_no,
        COALESCE(s.customer_id::text, '') AS customer_id,
        COALESCE(c.name, s.customer_name, '') AS customer,
        COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, '') AS product,
        COALESCE(NULLIF(TRIM(si.item_type), ''), '') AS item_type,
        COALESCE(s.trcode, 0) AS trcode,
        LOWER(TRIM(COALESCE(s.fiche_type, ''))) AS fiche_type,
        COALESCE(si.quantity, 0) AS qty,
        COALESCE(si.unit_price, 0) AS unit_price,
        COALESCE(si.discount_amount, 0) AS discount_amount,
        COALESCE(si.discount_rate, 0) AS discount_rate,
        COALESCE(si.total_amount, 0) AS line_gross,
        COALESCE(si.net_amount, 0) AS line_total,
        COALESCE(c.phone, '') AS phone
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.date DESC, s.fiche_no, si.id
      LIMIT ${ROW_LIMIT}
      `,
      values,
    );

    // Frontend `InvoiceItemsDetailRow` tipi camelCase bekler; backend SQL snake_case
    // döndürür. Burada iki katman arasında tip uyumunu koruyoruz — aksi halde
    // ürün adı boş, miktar 0 görünür (UI sızdıran alanlar).
    return (rows || []).map((r: any) => {
      const ficheType = String(r.fiche_type ?? '');
      const trcode = Number(r.trcode ?? 0);
      const isReturn = isSalesReturnFiche({ fiche_type: ficheType, trcode });
      const amounts = mapInvoiceItemsDetailAmounts({
        quantity: Number(r.qty ?? 0),
        unitPrice: Number(r.unit_price ?? 0),
        lineGross: Number(r.line_gross ?? 0),
        lineTotal: Number(r.line_total ?? 0),
        discountAmount: Number(r.discount_amount ?? 0),
        discountRate: Number(r.discount_rate ?? 0),
        isReturn,
      });
      return {
        id: String(r.id ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        invoiceNo: String(r.invoice_no ?? ''),
        customerId: String(r.customer_id ?? ''),
        customerName: String(r.customer ?? ''),
        productName: String(r.product ?? ''),
        itemType: String(r.item_type ?? ''),
        ficheType,
        trcode,
        invoiceType: invoiceItemsDetailTypeLabel(ficheType, trcode),
        quantity: amounts.quantity,
        unitPrice: amounts.unitPrice,
        discount: amounts.discount,
        lineGross: amounts.lineGross,
        lineTotal: amounts.lineTotal,
        invoiceTotal: amounts.invoiceTotal,
        phone: String(r.phone ?? ''),
      };
    });
  },

  /**
   * Cari (müşteri / tedarikçi) bazlı tarih aralığı satış raporu.
   *
   * - `cardType = 'customer'` → `sales_invoice`, `service`, `hizmet`, `return_invoice`
   *   (müşteriden tahsilat/avans/mahsup HARİÇ — yalnızca gerçek satış belgeleri).
   * - `cardType = 'supplier'` → `purchase_invoice`, `return_invoice` ve ilgili trcode'lar.
   *
   * Brüt / İade / Net ayrı:
   *   - **gross_amount** = sadece satış (iade olmayan) belge tutarı
   *   - **return_amount** = iade kovası (artı veya eksi olabilir)
   *   - **net** = brüt − |iade| (`mapPartySalesPeriodAmounts`, bir kez)
   *
   * Miktar: brüt miktar − |iade miktarı|. İade adedi brüte eklenmez.
   *
   * Borç yönü (muhasebe denetimi):
   *   - Müşteri: `credit_amount − paid_amount` (cari kart bakiyesiyle çapraz kontrol)
   *   - Tedarikçi: aynı formül; supplierAPI.getAll ile uyumlu.
   *   Kalan borç işaretine mutlak değer uygulanmaz.
   *
   * Kimlik eşlemesi metindir. Tarih parametresi uuid dizisine bağlanmaz.
   */
  async getPartySalesByPeriod(opts: {
    cardType: 'customer' | 'supplier';
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD (dahil)
    partyIds?: string[]; // opsiyonel filtre; yoksa tüm aktif cariler
  }): Promise<PartySalesByPeriodRow[]> {
    const { cardType, startDate, endDate, partyIds } = opts;
    if (!startDate || !endDate) return [];

    const normalizedPartyIds = normalizePartySalesPartyIds(partyIds);
    const sql = buildPartySalesByPeriodSql({
      cardType,
      partyIds: normalizedPartyIds,
    });
    const params: unknown[] = [startDate, endDate];
    if (normalizedPartyIds.length > 0) params.push(normalizedPartyIds);
    const { rows } = await postgres.query(sql, params);
    return (rows || []).map((r: any) => {
      const amounts = mapPartySalesPeriodAmounts({
        grossAmount: r.gross_amount,
        returnAmount: r.return_amount,
        grossQuantity: r.gross_quantity,
        returnQuantity: r.return_quantity,
      });
      return {
        partyId: String(r.party_id ?? ''),
        partyCode: String(r.party_code ?? ''),
        partyName: String(r.party_name ?? ''),
        phone: String(r.phone ?? ''),
        currentBalance: Number(r.current_balance ?? 0),
        grossAmount: amounts.grossAmount,
        returnAmount: amounts.returnAmount,
        netAmount: amounts.netAmount,
        totalQuantity: amounts.totalQuantity,
        grossCount: Number(r.gross_count ?? 0),
        returnCount: Number(r.return_count ?? 0),
        paidAmount: Number(r.paid_amount ?? 0),
        remainingDebt: Number(r.remaining_debt ?? 0),
        lastSaleDate: String(r.last_sale_date ?? '').slice(0, 10),
      };
    });
  },

  /**
   * Ürün bazlı tarih aralığı satış raporu.
   *
   * `sale_items` üzerinden ürün başına gruplar; `sales` ile join tarih filtresi,
   * `is_cancelled`, fiche_type ve status için.
   *
   * **Yalnızca malzemeler** — hizmet/paket/promosyon/indirim satırları Hariç
   * (`item_type` ile). Beauty/guzellik müşterilerinin hizmet satırları (örn.
   * "HAIR CUT" → `item_type='Hizmet'`) bu rapora dahil edilmez; hizmet
   * raporları ayrı modülde.
   *
   * Brüt / İade / Net ayrı:
   *   - **gross_amount** = sadece satış (iade olmayan kalem) tutar toplamı
   *   - **return_amount** = iade kalemleri (fişte artı da olabilir)
   *   - **net** = brüt − |iade| (`settleProductPeriodSalesNet`, bir kez)
   *
   * Miktar:
   *   - **gross_quantity** = iade hariç kalem miktarı
   *   - **return_quantity** = iade miktarı (bilgi kolonu, artı büyüklük)
   *   - **net miktar** = brüt miktar − |iade miktarı|
   *
   * `distinct_customers` ürünü kaç farklı müşteri almış (benzersiz customer_id).
   * `avg_unit_price` = net tutar / net miktar (ağırlıklı ortalama).
   */
  async getProductSalesByPeriod(opts: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD (dahil)
    productIds?: string[];
    partyIds?: string[]; // müşteri filtresi (boş = tüm cariler)
    onlyReturn?: boolean; // opsiyonel: sadece iade edilenler
  }): Promise<ProductSalesByPeriodRow[]> {
    const { startDate, endDate, productIds, partyIds, onlyReturn } = opts;
    if (!startDate || !endDate) return [];

    // Parametre indeksleri dinamik: $1=start, $2=end, $3.. opsiyonel diziler.
    const productFilter =
      productIds && productIds.length > 0
        ? `AND si.product_id = ANY($${3 + (partyIds && partyIds.length > 0 ? 1 : 0)}::uuid[])`
        : '';
    const partyFilter =
      partyIds && partyIds.length > 0
        ? `AND s.customer_id = ANY($3::uuid[])`
        : '';
    const returnOnlyFilter = onlyReturn
      ? `AND LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'`
      : '';

    const sql = `
      WITH item_lines AS (
        SELECT
          si.id AS line_id,
          si.product_id,
          COALESCE(si.item_code, '') AS item_code,
          COALESCE(NULLIF(TRIM(si.item_name), ''), '') AS item_name,
          COALESCE(NULLIF(LOWER(TRIM(COALESCE(si.unit, ''))), ''), 'adet') AS unit_norm,
          COALESCE(NULLIF(LOWER(TRIM(COALESCE(si.unit, ''))), ''), 'adet') AS unit_disp,
          COALESCE(si.quantity, 0) AS quantity,
          COALESCE(si.net_amount, si.quantity * si.unit_price, 0) AS line_amount,
          COALESCE(si.unit_price, 0) AS unit_price,
          COALESCE(s.customer_id::text, si.invoice_id::text) AS buyer_id,
          COALESCE(s.is_cancelled, false) AS is_cancelled,
          LOWER(TRIM(COALESCE(s.fiche_type, ''))) AS fiche_type_norm,
          COALESCE(NULLIF(${sqlUtcDate('s.date')}, NULL), ${sqlUtcDate('s.created_at')}) AS doc_date
        FROM sale_items si
        JOIN sales s ON s.id = si.invoice_id
        WHERE COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')
          AND si.product_id IS NOT NULL
          -- Ürün bazlı rapor: yalnızca malzeme satırları.
          -- Hizmet/paket/promosyon/indirim Hariç (güzellik HAIR CUT vb.).
          AND ${SQL_PRODUCT_SALES_MATERIAL_ONLY}
          AND ${sqlUtcDate('COALESCE(s.date, s.created_at)')} BETWEEN $1 AND $2
          ${productFilter}
          ${partyFilter}
          ${returnOnlyFilter}
      ),
      product_totals AS (
        SELECT
          product_id,
          unit_norm,
          MAX(item_code) AS item_code,
          MAX(item_name) AS item_name,
          MAX(unit_disp) AS unit,
          SUM(CASE WHEN fiche_type_norm <> 'return_invoice' THEN 1 ELSE 0 END) AS gross_count,
          SUM(CASE WHEN fiche_type_norm = 'return_invoice' THEN 1 ELSE 0 END) AS return_count,
          SUM(CASE WHEN fiche_type_norm <> 'return_invoice' THEN quantity ELSE 0 END) AS gross_quantity,
          SUM(CASE WHEN fiche_type_norm = 'return_invoice' THEN quantity ELSE 0 END) AS return_quantity,
          SUM(CASE WHEN fiche_type_norm <> 'return_invoice' THEN line_amount ELSE 0 END) AS gross_amount,
          SUM(CASE WHEN fiche_type_norm = 'return_invoice' THEN line_amount ELSE 0 END) AS return_amount,
          COUNT(DISTINCT buyer_id) AS distinct_customers,
          MIN(doc_date)::text AS first_sale_date,
          MAX(doc_date)::text AS last_sale_date
        FROM item_lines
        WHERE product_id IS NOT NULL
        GROUP BY product_id, unit_norm
      )
      SELECT
        pt.product_id::text AS product_id,
        COALESCE(pt.item_code, '') AS product_code,
        COALESCE(pt.item_name, '') AS product_name,
        COALESCE(pt.unit, 'adet') AS unit,
        COALESCE(pt.gross_count, 0)::int AS gross_count,
        COALESCE(pt.return_count, 0)::int AS return_count,
        COALESCE(pt.gross_quantity, 0) AS gross_quantity,
        COALESCE(pt.return_quantity, 0) AS return_quantity,
        COALESCE(pt.gross_amount, 0) AS gross_amount,
        COALESCE(pt.return_amount, 0) AS return_amount,
        COALESCE(pt.distinct_customers, 0)::int AS distinct_customers,
        COALESCE(pt.first_sale_date, '') AS first_sale_date,
        COALESCE(pt.last_sale_date, '') AS last_sale_date
      FROM product_totals pt
      ORDER BY COALESCE(pt.gross_amount, 0) DESC, product_code ASC, unit ASC
    `;

    const params: unknown[] = [startDate, endDate];
    if (partyIds && partyIds.length > 0) params.push(partyIds);
    if (productIds && productIds.length > 0) params.push(productIds);
    const { rows } = await postgres.query(sql, params);
    return (rows || []).map((r: any) => {
      const net = settleProductPeriodSalesNet({
        grossAmount: Number(r.gross_amount ?? 0),
        returnAmount: Number(r.return_amount ?? 0),
        grossQuantity: Number(r.gross_quantity ?? 0),
        returnQuantity: Number(r.return_quantity ?? 0),
      });
      return {
        productId: String(r.product_id ?? ''),
        productCode: String(r.product_code ?? ''),
        productName: String(r.product_name ?? ''),
        unit: String(r.unit ?? ''),
        grossCount: Number(r.gross_count ?? 0),
        returnCount: Number(r.return_count ?? 0),
        grossQuantity: net.grossQuantity,
        returnQuantity: net.returnQuantity,
        grossAmount: net.grossAmount,
        returnAmount: net.returnAmount,
        netAmount: net.netAmount,
        distinctCustomers: Number(r.distinct_customers ?? 0),
        avgUnitPrice: net.avgUnitPrice,
        firstSaleDate: String(r.first_sale_date ?? '').slice(0, 10),
        lastSaleDate: String(r.last_sale_date ?? '').slice(0, 10),
      };
    });
  },
};

/* ========================================================================== */
/* VIVA SOLAR — Yeni ERP Raporları (Faz 2) — Tipler                            */
/* ========================================================================== */

export interface PartySalesByPeriodRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  phone: string;
  /** Carinin güncel ledger bakiyesi (cari kart.balance) — referans kontrol. */
  currentBalance: number;
  /** Brüt satış toplamı (iade hariç) */
  grossAmount: number;
  /** İade tutarı (bilgi kolonu, artı büyüklük). Net hesaba bir kez girer. */
  returnAmount: number;
  /** Net = brüt − |iade| (iade bir kez düşülür) */
  netAmount: number;
  /** Net miktar = brüt miktar − |iade miktarı| */
  totalQuantity: number;
  /** Brüt satış adedi (iade olmayan belge sayısı) */
  grossCount: number;
  /** İade adedi */
  returnCount: number;
  /** Brüt satışlardan tahsil edilen toplam */
  paidAmount: number;
  /** Brüt satışlardan kalan borç (credit - paid) */
  remainingDebt: number;
  /** Son satış tarihi (YYYY-MM-DD) */
  lastSaleDate: string;
}

export interface ProductSalesByPeriodRow {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  /** Brüt satış adedi (kalem satırı sayısı, iade hariç) */
  grossCount: number;
  /** İade adedi (kalem satırı sayısı) */
  returnCount: number;
  /** Brüt miktar (iade hariç) */
  grossQuantity: number;
  /** İade miktarı (bilgi kolonu, artı büyüklük) */
  returnQuantity: number;
  /** Brüt tutar (iade hariç) */
  grossAmount: number;
  /** İade tutarı (bilgi kolonu, artı büyüklük) */
  returnAmount: number;
  /** Net tutar = brüt − |iade| (iade bir kez düşülür) */
  netAmount: number;
  /** Benzersiz müşteri sayısı */
  distinctCustomers: number;
  /** Ağırlıklı ortalama birim fiyat (net tutar / net miktar) */
  avgUnitPrice: number;
  /** İlk satış tarihi */
  firstSaleDate: string;
  /** Son satış tarihi */
  lastSaleDate: string;
}

export interface EarningsByProjectRow {
  id: string;
  date: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  projectId?: string;
  projectName?: string;
  category: string;
  description: string;
  discount: number;
  collected: number;
  invoiceAmount: number;
  loadingExpense: number;
  spent: number;
  dailyExpense: number;
  profit: number;
  isReturn: boolean;
}

export interface CashLedgerRow {
  id: string;
  date: string;
  ficheNo: string;
  sequence: number;
  group: string;
  subGroup: string;
  description: string;
  incoming: number;
  outgoing: number;
  cumulative: number;
  cariId?: string;
  cariName?: string;
  cashRegisterId?: string;
  cashRegisterName?: string;
}

export type CashLedgerGroup =
  | 'GASOLINE'
  | 'OFFICE'
  | 'PERSONEL'
  | 'WAREHOUSE'
  | 'INCOMING'
  | 'OUT'
  | string; // yayılma: kullanıcı tanımlı grup da olabilir

/**
 * Güzellik (beauty) — Müşteri Satış Analizi satırı. Randevu bazlı agregasyon.
 *
 * Neden appointment tablosu? Bug 32 (2026-10-09 guzel DB):
 *  - Beauty müşterileri için gerçek ciro `beauty_appointments` satırında
 *    (`total_price` = brüt hizmet tutarı, `deposit_amount` = rezervasyon
 *    avansı, `remainder_paid_amount` = hizmet verildikten sonra tahsil
 *    edilen kalan).
 *  - `public.sales` (sales_invoice) tablosunda yalnızca kalan ödeme fişi
 *    yansıyor (`net_amount = remainder_paid_amount`); avans hiçbir fatura
 *    fişine yazılmıyor. Bu yüzden `effectiveCatalogSales` → invoice
 *    zinciri güzellik için deposit'i eksik raporluyordu.
 *  - Bu fonksiyon appointment tablosundan aggregate hesap yapar:
 *      Hizmet Tutarı   = SUM(total_price)            (avans dahil brüt)
 *      Rezervasyon     = SUM(deposit_amount)          (avans)
 *      Alınan Tutar    = SUM(remainder_paid_amount)   (kalan ödeme)
 *      Toplam Ciro     = SUM(total_price)            (hizmet brüt)
 *      Satış Sayısı    = COUNT(DISTINCT appointment_id)
 *
 * İade / iptal edilmiş randevular (`status = 'cancelled' / 'canceled' /
 * 'refunded' / 'void' / 'silindi' / 'iptal' / 'deleted' / 'no_show'`)
 * hariç tutulur.
 */
export interface BeautyCustomerSalesRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  /** Tamamlanmış (veya henüz iptal edilmemiş) randevu sayısı. */
  appointmentCount: number;
  /** Hizmet brüt tutarı (avans dahil) — toplam ciro. */
  serviceRevenue: number;
  /** Rezervasyon peşinatı (avans). */
  depositRevenue: number;
  /** Hizmet tamamlandıktan sonra tahsil edilen kalan tutar. */
  remainderRevenue: number;
  /** Toplam ciro = hizmet (depozito payı içeride; ikinci kez eklenmez). */
  totalRevenue: number;
  /** Tahsil edilen: kalan ödeme + rezervasyon payı, ciroyu aşmaz. */
  collectedAmount: number;
  /** Ortalama hizmet tutarı. */
  avgServiceRevenue: number;
  /** Son randevu tarihi (YYYY-MM-DD). */
  lastAppointmentDate: string;
}

export async function getCustomerSalesFromAppointments(opts: {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (dahil)
}): Promise<BeautyCustomerSalesRow[]> {
  const { startDate, endDate } = opts;
  if (!startDate || !endDate) return [];
  const { aggregateCustomerAppointmentSales } = await import('../../utils/customerSalesDeposit');
  const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
  const custTable = postgres.getCardTableName('customers');
  const avansTable = postgres.getMovementTableName('cari_avans');
  // Avans alt sorgusu tablo yoksa tüm raporu düşürür. Randevu listesi ayrı okunur.
  const sql = `
    SELECT
      a.id::text                                              AS id,
      COALESCE(c.id, a.client_id)::text                       AS customer_id,
      COALESCE(c.code, '')                                    AS customer_code,
      COALESCE(c.name, '')                                    AS customer_name,
      COALESCE(c.phone, '')                                   AS phone,
      a.appointment_date::text                                AS appointment_date,
      a.created_at::text                                      AS created_at,
      COALESCE(a.total_price, 0)::float8                      AS total_price,
      COALESCE(a.deposit_amount, 0)::float8                   AS deposit_amount,
      COALESCE(a.remainder_paid_amount, 0)::float8            AS remainder_paid,
      LOWER(TRIM(COALESCE(a.status::text, '')))               AS status_lc
    FROM ${aptTable} a
    LEFT JOIN ${custTable} c ON c.id = a.client_id
    WHERE a.appointment_date::date >= $1::date
      AND a.appointment_date::date <= $2::date
  `;
  const narrowSql = `
    SELECT
      a.id::text                                              AS id,
      COALESCE(c.id, a.client_id)::text                       AS customer_id,
      COALESCE(c.code, '')                                    AS customer_code,
      COALESCE(c.name, '')                                    AS customer_name,
      COALESCE(c.phone, '')                                   AS phone,
      a.appointment_date::text                                AS appointment_date,
      NULL::text                                              AS created_at,
      COALESCE(a.total_price, 0)::float8                      AS total_price,
      COALESCE(a.deposit_amount, 0)::float8                   AS deposit_amount,
      0::float8                                               AS remainder_paid,
      LOWER(TRIM(COALESCE(a.status::text, '')))               AS status_lc
    FROM ${aptTable} a
    LEFT JOIN ${custTable} c ON c.id = a.client_id
    WHERE a.appointment_date::date >= $1::date
      AND a.appointment_date::date <= $2::date
  `;
  let rows: any[] = [];
  try {
    const full = await postgres.query(sql, [startDate, endDate]);
    rows = full.rows || [];
  } catch (err) {
    console.warn('[getCustomerSalesFromAppointments] daraltılmış sorguya düşüldü:', err);
    const narrow = await postgres.query(narrowSql, [startDate, endDate]);
    rows = narrow.rows || [];
  }
  const avansByAppointment = new Map<string, number>();
  try {
    const avansRes = await postgres.query(
      `SELECT notes, ABS(amount)::float8 AS amount
         FROM ${avansTable}
        WHERE created_at >= $1::date
          AND created_at < ($2::date + INTERVAL '1 day')`,
      [startDate, endDate],
    );
    for (const row of avansRes.rows || []) {
      const notes = String((row as { notes?: string }).notes ?? '');
      const match = notes.match(/rex_appt:([0-9a-f-]{36})/i);
      const amount = Math.abs(Number((row as { amount?: number }).amount) || 0);
      if (!match || amount <= 0.004) continue;
      const id = match[1].toLowerCase();
      avansByAppointment.set(id, (avansByAppointment.get(id) || 0) + amount);
    }
  } catch (err) {
    console.warn('[getCustomerSalesFromAppointments] cari avans okunamadı:', err);
  }
  const aggregated = aggregateCustomerAppointmentSales(
    (rows || []).map((r: any) => {
      const id = String(r.id ?? '');
      return {
        id,
        customerId: String(r.customer_id ?? ''),
        customerCode: String(r.customer_code ?? ''),
        customerName: String(r.customer_name ?? ''),
        phone: String(r.phone ?? ''),
        date: String(r.appointment_date ?? '').slice(0, 10),
        createdAt: r.created_at ? String(r.created_at) : null,
        totalPrice: Number(r.total_price ?? 0),
        depositAmount: Number(r.deposit_amount ?? 0),
        remainderPaid: Number(r.remainder_paid ?? 0),
        linkedAvans: avansByAppointment.get(id.toLowerCase()) || 0,
        status: String(r.status_lc ?? ''),
      };
    }),
  );
  return aggregated.map((row) => ({
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    phone: row.phone,
    appointmentCount: row.salesCount,
    serviceRevenue: row.serviceRevenue,
    depositRevenue: row.depositRevenue,
    remainderRevenue: Math.max(0, row.collectedAmount - row.depositRevenue),
    totalRevenue: row.totalRevenue,
    collectedAmount: row.collectedAmount,
    avgServiceRevenue: row.avgSale,
    lastAppointmentDate: row.lastSaleDate,
  }));
}
