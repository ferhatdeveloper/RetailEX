/**
 * ERP çekirdek raporları — mevcut kiracı tablolarından (sales, cash_lines, bank_lines, customers, suppliers).
 * Yeni view/tablo yok; LIMIT ile ağır sorgular sınırlanır.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr, normalizeTrText } from './accountBalance';
import { SQL_COUNTABLE_SALE_STATUS } from '../../utils/saleInvoiceStatus';
import { localTodayDateKey } from '../../utils/localCalendarDate';
import {
  buildProfitCostCtes,
  INVOICE_LINE_SCALE_JOIN,
  isPlSalesOrReturnFiche,
  isPurchaseFiche,
  isSalesReturnFiche,
  LAST_PURCHASE_JOIN,
  lineCostAmount,
  PRODUCTS_JOIN,
  resolveLineProductId,
  scaleLineRevenueToInvoiceNet,
  SIGNED_LINE_COST_EXPR,
  SIGNED_LINE_PROFIT_EXPR,
  SIGNED_LINE_QTY_EXPR,
  SIGNED_LINE_REVENUE_EXPR,
  SQL_LINE_RESOLVED_PRODUCT_ID,
  SQL_PL_SALES_OR_RETURN,
  unitCostFromPurchaseLine,
} from '../../utils/lastPurchaseCostSql';

const ROW_LIMIT = 3000;

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
  cardType: 'customer' | 'supplier';
  balance: number;
  creditLimit: number;
  paymentTerms: string;
}

export interface CashBankMovementRow {
  id: string;
  source: 'cash' | 'bank';
  registerName: string;
  ficheNo: string;
  date: string;
  transactionType: string;
  definition: string;
  amount: number;
  sign: number;
  netAmount: number;
  accountName: string;
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
  netAmount: number;
  cashier: string;
  notes: string;
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
}

export interface CriticalStockRow {
  productId: string;
  productCode: string;
  productName: string;
  warehouseCode: string;
  stock: number;
  minStock: number;
  criticalStock: number;
  unitCost: number;
  stockValue: number;
  status: 'critical' | 'below_min' | 'ok';
}

export interface WarehouseStockRow {
  warehouseCode: string;
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
      limit: String(ROW_LIMIT),
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
            limit: '2000',
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
          (s.date AT TIME ZONE 'UTC')::date::text AS invoice_date,
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
          (s.date AT TIME ZONE 'UTC')::date::text AS invoice_date,
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
    cardType?: 'customer' | 'supplier' | 'all';
    onlyNonZero?: boolean;
    /** true ise yalnızca borç bakiyeli (balance > 0) cariler — muhasebe denetimi */
    onlyDebit?: boolean;
    cariFilter?: string;
  }): Promise<CariBalanceRow[]> {
    const want = opts?.cardType ?? 'all';
    const onlyNonZero = opts?.onlyNonZero !== false;
    const onlyDebit = opts?.onlyDebit === true;
    const rawFilter = String(opts?.cariFilter ?? '').trim();
    const filterKey = normalizeTrText(rawFilter);
    const filterExactCode = rawFilter;
    const filterLike = `%${filterKey}%`;
    const hasFilter = filterKey.length > 0;

    // balance filtresi: yalnız borç bakiyeli cariler (muhasebe denetimi)
    const balFilter = onlyDebit
      ? 'AND COALESCE(balance, 0) > 0.009'
      : onlyNonZero
        ? 'AND ABS(COALESCE(balance, 0)) > 0.009'
        : '';

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const out: CariBalanceRow[] = [];
      const load = async (path: string, cardType: 'customer' | 'supplier') => {
        const qs = new URLSearchParams();
        qs.set('select', 'id,code,name,balance,credit_limit,payment_terms,is_active');
        qs.set('is_active', 'eq.true');
        qs.set('order', 'balance.desc');
        qs.set('limit', '2000');
        if (onlyDebit) qs.append('balance', 'gt.0.009');
        else if (onlyNonZero) qs.append('balance', 'neq.0');
        if (hasFilter) qs.append('or', `(code.ilike.*${rawFilter}*,name.ilike.*${rawFilter}*)`);
        const rows = await postgrest
          .get<Record<string, unknown>[]>(
            `${path}?${qs.toString()}`,
            undefined,
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]);
        for (const r of rows || []) {
          const balance = Number(r.balance ?? 0);
          if (onlyDebit && balance <= 0.009) continue;
          if (onlyNonZero && Math.abs(balance) <= 0.009) continue;
          out.push({
            accountId: String(r.id ?? ''),
            accountCode: String(r.code ?? ''),
            accountName: String(r.name ?? ''),
            cardType,
            balance,
            creditLimit: Number(r.credit_limit ?? 0),
            paymentTerms: String(r.payment_terms ?? ''),
          });
        }
      };
      if (want === 'all' || want === 'customer') await load(`/rex_${fn}_customers`, 'customer');
      if (want === 'all' || want === 'supplier') await load(`/rex_${fn}_suppliers`, 'supplier');
      return out.sort((a, b) => b.balance - a.balance).slice(0, ROW_LIMIT);
    }

    const parts: string[] = [];
    const filterParams: unknown[] = [];
    if (hasFilter) {
      filterParams.push(filterExactCode, filterLike);
    }
    const filterClause = hasFilter
      ? ` AND (
            LOWER(TRIM(COALESCE(code, ''))) = LOWER(TRIM($1))
            OR LOWER(TRIM(COALESCE(code, ''))) LIKE LOWER(TRIM($2))
            OR LOWER(TRIM(COALESCE(name, ''))) LIKE LOWER(TRIM($2))
          )`
      : '';
    if (want === 'all' || want === 'customer') {
      parts.push(`
        SELECT id::text AS account_id, COALESCE(code,'') AS account_code, COALESCE(name,'') AS account_name,
               'customer'::text AS card_type, COALESCE(balance,0) AS balance,
               COALESCE(credit_limit,0) AS credit_limit, COALESCE(payment_terms::text,'') AS payment_terms
        FROM customers
        WHERE COALESCE(is_active, true) = true ${balFilter}${filterClause}
      `);
    }
    if (want === 'all' || want === 'supplier') {
      parts.push(`
        SELECT id::text AS account_id, COALESCE(code,'') AS account_code, COALESCE(name,'') AS account_name,
               'supplier'::text AS card_type, COALESCE(balance,0) AS balance,
               COALESCE(credit_limit,0) AS credit_limit, COALESCE(payment_terms::text,'') AS payment_terms
        FROM suppliers
        WHERE COALESCE(is_active, true) = true ${balFilter}${filterClause}
      `);
    }
    if (!parts.length) return [];
    const { rows } = await postgres.query(
      `${parts.join(' UNION ALL ')} ORDER BY balance DESC LIMIT ${ROW_LIMIT}`,
      filterParams,
    );
    return (rows || []).map((r: any) => ({
      accountId: String(r.account_id ?? ''),
      accountCode: String(r.account_code ?? ''),
      accountName: String(r.account_name ?? ''),
      cardType: r.card_type === 'supplier' ? 'supplier' : 'customer',
      balance: Number(r.balance ?? 0),
      creditLimit: Number(r.credit_limit ?? 0),
      paymentTerms: String(r.payment_terms ?? ''),
    }));
  },

  async getCashBankMovements(opts: {
    startDate: string;
    endDate: string;
    source?: 'all' | 'cash' | 'bank';
  }): Promise<CashBankMovementRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    const source = opts.source ?? 'all';
    if (!start || !end) return [];

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();
      const out: CashBankMovementRow[] = [];

      if (source === 'all' || source === 'cash') {
        const [lines, regs] = await Promise.all([
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_cash_lines`,
            { select: '*', order: 'date.desc', limit: String(ROW_LIMIT) },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_cash_registers`,
            { select: 'id,code,name', limit: '500' },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
        ]);
        const regMap = new Map(regs.map((r) => [String(r.id), String(r.name || r.code || '')]));
        for (const r of lines || []) {
          const d = String(r.date || '').slice(0, 10);
          if (d < start || d > end) continue;
          const amount = Number(r.amount ?? 0);
          const sign = Number(r.sign ?? 1) || 1;
          out.push({
            id: String(r.id ?? `c-${d}-${r.fiche_no}`),
            source: 'cash',
            registerName: regMap.get(String(r.register_id || '')) || '',
            ficheNo: String(r.fiche_no ?? ''),
            date: d,
            transactionType: String(r.transaction_type ?? ''),
            definition: String(r.definition ?? ''),
            amount,
            sign,
            netAmount: amount * sign,
            accountName: '',
          });
        }
      }

      if (source === 'all' || source === 'bank') {
        const [lines, regs] = await Promise.all([
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_bank_lines`,
            { select: '*', order: 'date.desc', limit: String(ROW_LIMIT) },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
          postgrest.get<Record<string, unknown>[]>(
            `/rex_${fn}_bank_registers`,
            { select: 'id,code,name', limit: '500' },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[]),
        ]);
        const regMap = new Map(regs.map((r) => [String(r.id), String(r.name || r.code || '')]));
        for (const r of lines || []) {
          const d = String(r.date || '').slice(0, 10);
          if (d < start || d > end) continue;
          const amount = Number(r.amount ?? 0);
          const sign = Number(r.sign ?? 1) || 1;
          out.push({
            id: String(r.id ?? `b-${d}-${r.fiche_no}`),
            source: 'bank',
            registerName: regMap.get(String(r.register_id || '')) || '',
            ficheNo: String(r.fiche_no ?? ''),
            date: d,
            transactionType: String(r.transaction_type ?? ''),
            definition: String(r.definition ?? ''),
            amount,
            sign,
            netAmount: amount * sign,
            accountName: '',
          });
        }
      }

      return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, ROW_LIMIT);
    }

    const parts: string[] = [];
    const values: unknown[] = [start, end];
    if (source === 'all' || source === 'cash') {
      parts.push(`
        SELECT
          cl.id::text AS id,
          'cash'::text AS source,
          COALESCE(cr.name, cr.code, '') AS register_name,
          COALESCE(cl.fiche_no, '') AS fiche_no,
          (cl.date AT TIME ZONE 'UTC')::date::text AS date,
          COALESCE(cl.transaction_type, '') AS transaction_type,
          COALESCE(cl.definition, '') AS definition,
          COALESCE(cl.amount, 0) AS amount,
          COALESCE(cl.sign, 1) AS sign,
          COALESCE(c.name, s.name, '') AS account_name
        FROM cash_lines cl
        LEFT JOIN cash_registers cr ON cr.id = cl.register_id
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = cl.customer_id LIMIT 1
        ) c ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM suppliers WHERE id = cl.customer_id LIMIT 1
        ) s ON TRUE
        WHERE (cl.date AT TIME ZONE 'UTC')::date >= $1::date
          AND (cl.date AT TIME ZONE 'UTC')::date <= $2::date
      `);
    }
    if (source === 'all' || source === 'bank') {
      parts.push(`
        SELECT
          bl.id::text AS id,
          'bank'::text AS source,
          COALESCE(br.name, br.code, '') AS register_name,
          COALESCE(bl.fiche_no, '') AS fiche_no,
          (bl.date AT TIME ZONE 'UTC')::date::text AS date,
          COALESCE(bl.transaction_type, '') AS transaction_type,
          COALESCE(bl.definition, '') AS definition,
          COALESCE(bl.amount, 0) AS amount,
          COALESCE(bl.sign, 1) AS sign,
          COALESCE(c.name, s.name, '') AS account_name
        FROM bank_lines bl
        LEFT JOIN bank_registers br ON br.id = bl.register_id
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = bl.customer_id LIMIT 1
        ) c ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM suppliers WHERE id = bl.customer_id LIMIT 1
        ) s ON TRUE
        WHERE (bl.date AT TIME ZONE 'UTC')::date >= $1::date
          AND (bl.date AT TIME ZONE 'UTC')::date <= $2::date
      `);
    }
    if (!parts.length) return [];
    const { rows } = await postgres.query(
      `${parts.join(' UNION ALL ')} ORDER BY date DESC LIMIT ${ROW_LIMIT}`,
      values,
    );
    return (rows || []).map((r: any) => {
      const amount = Number(r.amount ?? 0);
      const sign = Number(r.sign ?? 1) || 1;
      return {
        id: String(r.id ?? ''),
        source: r.source === 'bank' ? 'bank' : 'cash',
        registerName: String(r.register_name ?? ''),
        ficheNo: String(r.fiche_no ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        transactionType: String(r.transaction_type ?? ''),
        definition: String(r.definition ?? ''),
        amount,
        sign,
        netAmount: amount * sign,
        accountName: String(r.account_name ?? ''),
      };
    });
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
            limit: '5000',
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
      groupExpr = `to_char((s.date AT TIME ZONE 'UTC')::date, 'YYYY-MM')`;
      labelExpr = groupExpr;
      supplierExpr = `''`;
    } else if (groupBy === 'supplier') {
      groupExpr = `COALESCE(NULLIF(TRIM(s.customer_name), ''), '—')`;
      labelExpr = groupExpr;
      supplierExpr = groupExpr;
    } else {
      groupExpr = `to_char((s.date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')`;
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
        AND (s.date AT TIME ZONE 'UTC')::date >= $1::date
        AND (s.date AT TIME ZONE 'UTC')::date <= $2::date
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
              limit: '8000',
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_suppliers`,
            { select: 'id,code,name', limit: '4000' },
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
        AND (s.date AT TIME ZONE 'UTC')::date >= $1::date
        AND (s.date AT TIME ZONE 'UTC')::date <= $2::date
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
            select: 'id,fiche_no,date,customer_name,payment_method,net_amount,cashier,notes,fiche_type,trcode,is_cancelled,status',
            order: 'date.desc',
            limit: String(ROW_LIMIT),
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      return (sales || [])
        .filter((s) => {
          if (s.is_cancelled === true || s.is_cancelled === 'true') return false;
          const st = String(s.status || 'approved').toLowerCase();
          if (st === 'cancelled' || st === 'canceled') return false;
          const ft = String(s.fiche_type || '').toLowerCase();
          const tr = Number(s.trcode ?? 0);
          if (ft !== 'return_invoice' && tr !== 2 && tr !== 3) return false;
          const d = String(s.date || '').slice(0, 10);
          return d >= start && d <= end;
        })
        .map((s) => ({
          id: String(s.id ?? ''),
          ficheNo: String(s.fiche_no ?? ''),
          date: String(s.date || '').slice(0, 10),
          accountName: String(s.customer_name ?? ''),
          paymentMethod: String(s.payment_method ?? ''),
          // İade tutarı işaretli bırakılır (negatif); UI Math.abs gösterebilir.
          netAmount: Number(s.net_amount ?? 0),
          cashier: String(s.cashier ?? ''),
          notes: String(s.notes ?? ''),
        }))
        .slice(0, ROW_LIMIT);
    }

    const { rows } = await postgres.query(
      `
      SELECT
        s.id::text AS id,
        COALESCE(s.fiche_no, '') AS fiche_no,
        (s.date AT TIME ZONE 'UTC')::date::text AS date,
        COALESCE(s.customer_name, '') AS account_name,
        COALESCE(s.payment_method, '') AS payment_method,
        COALESCE(s.net_amount, 0) AS net_amount,
        COALESCE(s.cashier, '') AS cashier,
        COALESCE(s.notes, '') AS notes
      FROM sales s
      WHERE COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND (
          LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
          OR s.trcode IN (2, 3)
        )
        AND (s.date AT TIME ZONE 'UTC')::date >= $1::date
        AND (s.date AT TIME ZONE 'UTC')::date <= $2::date
      ORDER BY s.date DESC
      LIMIT ${ROW_LIMIT}
      `,
      [start, end],
    );
    return (rows || []).map((r: any) => ({
      id: String(r.id ?? ''),
      ficheNo: String(r.fiche_no ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      accountName: String(r.account_name ?? ''),
      paymentMethod: String(r.payment_method ?? ''),
      // İade tutarı işaretli bırakılır (negatif); UI Math.abs gösterebilir.
      netAmount: Number(r.net_amount ?? 0),
      cashier: String(r.cashier ?? ''),
      notes: String(r.notes ?? ''),
    }));
  },

  async getProductGrossProfit(opts: {
    startDate: string;
    endDate: string;
  }): Promise<ProductGrossProfitRow[]> {
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!start || !end) return [];
    const firmNr = padFirm();

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = firmNr;
      const pn = padPeriod();
      const [sales, items, products] = await Promise.all([
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_sales`,
            {
              select: 'id,date,fiche_type,is_cancelled,status,trcode,created_at,net_amount',
              order: 'date.desc',
              limit: '8000',
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
              limit: '12000',
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_products`,
            { select: 'id,code,barcode,name,cost', limit: '8000' },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);

      const salesById = new Map((sales || []).map((s) => [String(s.id), s]));
      const productById = new Map(
        (products || []).map((p) => [String(p.id), p]),
      );
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

      const linesNetByInvoice = new Map<string, number>();
      for (const it of items || []) {
        const iid = String(it.invoice_id || '');
        if (!iid) continue;
        linesNetByInvoice.set(
          iid,
          (linesNetByInvoice.get(iid) || 0) + (Number(it.net_amount ?? 0) || 0),
        );
      }

      const saleOk = new Set(
        (sales || [])
          .filter((s) => {
            if (s.is_cancelled === true || s.is_cancelled === 'true') return false;
            const st = String(s.status || 'approved').toLowerCase();
            if (!(st === 'completed' || st === 'approved' || !s.status)) return false;
            if (!isPlSalesOrReturnFiche(s)) return false;
            const d = String(s.date || '').slice(0, 10);
            return d >= start && d <= end;
          })
          .map((s) => String(s.id)),
      );

      const map = new Map<string, ProductGrossProfitRow>();
      for (const it of items || []) {
        if (!saleOk.has(String(it.invoice_id))) continue;
        const itemType = String(it.item_type || 'Malzeme');
        if (itemType === 'Promosyon' || itemType === 'İndirim') continue;
        const inv = salesById.get(String(it.invoice_id));
        if (!inv) continue;
        const sgn = isSalesReturnFiche(inv) ? -1 : 1;
        const pid = resolveLineProductId(it);
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
        const lpc =
          (pid && lastById.get(pid)?.unitCost) ||
          (String(it.item_code || '').trim() &&
            lastByCode.get(String(it.item_code || '').trim())?.unitCost) ||
          (String(prod?.code || '').trim() &&
            lastByCode.get(String(prod?.code || '').trim())?.unitCost) ||
          0;
        const absQty = Number(it.quantity ?? 0) || 0;
        const cost =
          sgn *
          lineCostAmount({
            quantity: absQty,
            lastPurchaseUnit: lpc,
          });
        const gp = revenue - cost;
        const cur = map.get(code) || {
          productId: pid,
          productCode: code,
          productName: String(it.item_name ?? prod?.name ?? ''),
          quantity: 0,
          revenue: 0,
          cost: 0,
          grossProfit: 0,
          marginPct: 0,
        };
        cur.quantity += qty;
        cur.revenue += revenue;
        cur.cost += cost;
        cur.grossProfit += gp;
        if (!cur.productName && it.item_name) cur.productName = String(it.item_name);
        map.set(code, cur);
      }
      return Array.from(map.values())
        .map((r) => ({
          ...r,
          marginPct: Math.abs(r.revenue) > 0.009 ? (r.grossProfit / r.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit)
        .slice(0, ROW_LIMIT);
    }

    const profitCtes = buildProfitCostCtes('$1');
    const { rows } = await postgres.query(
      `
      WITH ${profitCtes}
      SELECT
        COALESCE((${SQL_LINE_RESOLVED_PRODUCT_ID})::text, '') AS product_id,
        COALESCE(NULLIF(TRIM(p.code), ''), NULLIF(TRIM(si.item_code), ''), '—') AS product_code,
        COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, '—') AS product_name,
        COALESCE(SUM(${SIGNED_LINE_QTY_EXPR}), 0) AS quantity,
        COALESCE(SUM(${SIGNED_LINE_REVENUE_EXPR}), 0) AS revenue,
        COALESCE(SUM(${SIGNED_LINE_COST_EXPR}), 0) AS cost,
        COALESCE(SUM(${SIGNED_LINE_PROFIT_EXPR}), 0) AS gross_profit
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      ${PRODUCTS_JOIN}
      ${LAST_PURCHASE_JOIN}
      ${INVOICE_LINE_SCALE_JOIN}
      WHERE s.firm_nr = $1
        AND COALESCE(s.is_cancelled, false) = false
        AND ${SQL_COUNTABLE_SALE_STATUS}
        AND ${SQL_PL_SALES_OR_RETURN}
        AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
        AND (s.date AT TIME ZONE 'UTC')::date >= $2::date
        AND (s.date AT TIME ZONE 'UTC')::date <= $3::date
      GROUP BY 1, 2, 3
      HAVING ABS(COALESCE(SUM(${SIGNED_LINE_REVENUE_EXPR}), 0)) > 0.009
         OR ABS(COALESCE(SUM(${SIGNED_LINE_QTY_EXPR}), 0)) > 0.0001
      ORDER BY gross_profit DESC
      LIMIT ${ROW_LIMIT}
      `,
      [firmNr, start, end],
    );
    return (rows || []).map((r: any) => {
      const revenue = Number(r.revenue ?? 0);
      const cost = Number(r.cost ?? 0);
      const grossProfit = Number(r.gross_profit ?? revenue - cost);
      return {
        productId: String(r.product_id ?? ''),
        productCode: String(r.product_code ?? ''),
        productName: String(r.product_name ?? ''),
        quantity: Number(r.quantity ?? 0),
        revenue,
        cost,
        grossProfit,
        marginPct: Math.abs(revenue) > 0.009 ? (grossProfit / revenue) * 100 : 0,
      };
    });
  },

  async getCariExtract(opts: {
    accountId: string;
    cardType: 'customer' | 'supplier';
    startDate: string;
    endDate: string;
  }): Promise<CariExtractRow[]> {
    const accountId = String(opts.accountId || '').trim();
    const start = String(opts.startDate || '').slice(0, 10);
    const end = String(opts.endDate || '').slice(0, 10);
    if (!accountId || !start || !end) return [];
    const isCustomer = opts.cardType === 'customer';

    const mapRunning = (raw: { id: string; date: string; ficheNo: string; definition: string; amount: number; sign: number; source: CariExtractRow['source'] }[]) => {
      let running = 0;
      return raw.map((m) => {
        const amount = Math.abs(m.amount);
        const debit = m.sign > 0 ? amount : 0;
        const credit = m.sign < 0 ? amount : 0;
        running += debit - credit;
        return {
          id: m.id,
          date: m.date,
          ficheNo: m.ficheNo,
          definition: m.definition,
          debit,
          credit,
          balance: running,
          source: m.source,
        };
      });
    };

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const pn = padPeriod();

      // 3 kaynaktan birleştirme: account_movements (eski) + party_ledger_movements
      // (CH_ODEME / CH_TAHSILAT dahil) + cash_lines (yedek). Aynı hareket birden fazla
      // tabloda tutulmuş olabilir; tarih + fiche_no + amount + sign ile dedupe edilir.
      const [movements, ledgerMovs, cashLines] = await Promise.all([
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_account_movements`,
            {
              select: 'id,fiche_no,date,amount,sign,definition,customer_id,supplier_id',
              order: 'date.asc',
              limit: String(ROW_LIMIT),
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_party_ledger_movements`,
            {
              select: 'id,date,amount,sign,definition,transaction_type,cash_line_id,party_id,card_type',
              card_type: `eq.${isCustomer ? 'customer' : 'supplier'}`,
              party_id: `eq.${accountId}`,
              order: 'date.asc',
              limit: String(ROW_LIMIT),
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
        postgrest
          .get<Record<string, unknown>[]>(
            `/rex_${fn}_${pn}_cash_lines`,
            {
              select: 'id,fiche_no,date,amount,sign,definition,transaction_type,customer_id,party_id',
              transaction_type: 'in.(CH_ODEME,CH_TAHSILAT)',
              order: 'date.asc',
              limit: String(ROW_LIMIT),
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);

      const allMovs: Array<Record<string, unknown> & { _src: string }> = [];
      (movements || []).forEach((m) => {
        const d = String(m.date || '').slice(0, 10);
        if (d < start || d > end) return;
        const id = isCustomer ? String(m.customer_id || '') : String(m.supplier_id || m.customer_id || '');
        if (id !== accountId) return;
        allMovs.push({ ...m, _src: 'account_movements' });
      });
      (ledgerMovs || []).forEach((m) => {
        const d = String(m.date || '').slice(0, 10);
        if (d < start || d > end) return;
        const tt = String(m.transaction_type || '');
        if (tt.startsWith('CANCELLED_')) return;
        allMovs.push({ ...m, _src: 'party_ledger' });
      });
      (cashLines || []).forEach((m) => {
        const d = String(m.date || '').slice(0, 10);
        if (d < start || d > end) return;
        const tt = String(m.transaction_type || '');
        if (tt.startsWith('CANCELLED_')) return;
        const cashIdCol = isCustomer ? 'customer_id' : 'party_id';
        const id = String(m[cashIdCol] || '');
        if (id !== accountId) return;
        allMovs.push({ ...m, _src: 'cash_lines' });
      });

      // Dedupe: tarih + fiche_no + amount + sign — aynı hareket birden çok tabloda duruyorsa
      // party_ledger > account_movements > cash_lines önceliği ile tek satır tutulur.
      const seen = new Map<string, Record<string, unknown> & { _src: string }>();
      const prio = (src: string) => ({ party_ledger: 2, account_movements: 1, cash_lines: 0 } as Record<string, number>)[src] || 0;
      for (const m of allMovs) {
        const d = String(m.date || '').slice(0, 10);
        const fn_ = String(m.fiche_no || '');
        const amt = Number(m.amount ?? 0);
        const sg = Number(m.sign ?? 0);
        const key = `${d}|${fn_}|${amt}|${sg}`;
        const existing = seen.get(key);
        if (!existing || prio(m._src) > prio(existing._src)) {
          seen.set(key, m);
        }
      }
      const dedup = Array.from(seen.values()).sort(
        (a, b) => String(a.date || '').localeCompare(String(b.date || '')),
      );

      if (dedup.length) {
        return mapRunning(
          dedup.map((m) => ({
            id: String(m.id ?? `${m.fiche_no}-${m.date}`),
            date: String(m.date || '').slice(0, 10),
            ficheNo: String(m.fiche_no ?? ''),
            definition: String(m.definition ?? ''),
            amount: Number(m.amount ?? 0),
            sign: Number(m.sign ?? 1) || 1,
            source: (m._src === 'sale' ? 'sale' : 'movement') as CariExtractRow['source'],
          })),
        ).slice(0, ROW_LIMIT);
      }

      const sales = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_sales`,
          {
            select: 'id,fiche_no,date,net_amount,fiche_type,trcode,customer_id,is_cancelled,status',
            customer_id: `eq.${accountId}`,
            order: 'date.asc',
            limit: String(ROW_LIMIT),
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);

      // V2-R17 / mobilde V2-R13: alış ≠ iade; kart tipine göre işaret.
      // buildEkstreRows / ledger: alış +net, iade −net. Eski kod purchase_invoice'u da −1 yapıyordu.
      return mapRunning(
        (sales || [])
          .filter((s) => {
            if (s.is_cancelled === true || s.is_cancelled === 'true') return false;
            const d = String(s.date || '').slice(0, 10);
            return d >= start && d <= end;
          })
          .map((s) => {
            const ft = String(s.fiche_type || '').trim().toLowerCase();
            const tr = Number(s.trcode ?? 0) || 0;
            const net = Number(s.net_amount ?? 0);
            let sign = 1;
            if (ft === 'opening_balance') {
              sign = net < 0 ? -1 : 1;
            } else if (isCustomer) {
              if (ft === 'return_invoice' || tr === 2 || tr === 3) sign = -1;
            } else if (tr === 6 || ft === 'return_invoice') {
              sign = -1;
            }
            return {
              id: String(s.id ?? ''),
              date: String(s.date || '').slice(0, 10),
              ficheNo: String(s.fiche_no ?? ''),
              definition: ft === 'opening_balance' ? 'Devir' : ft || 'sale',
              amount: Math.abs(net),
              sign,
              source: 'sale' as const,
            };
          }),
      ).slice(0, ROW_LIMIT);
    }

    const idCol = isCustomer ? 'customer_id' : 'supplier_id';
    const cashIdCol = isCustomer ? 'customer_id' : 'party_id';
    const ledgerCardType = isCustomer ? 'customer' : 'supplier';
    const fn = padFirm();
    const pn = padPeriod();
    let rows: any[] = [];
    try {
      // 3 kaynaktan UNION ALL + dedupe (party_ledger öncelikli → account_movements → cash_lines).
      // CH_ODEME / CH_TAHSILAT hareketleri çoğunlukla yalnızca party_ledger_movements veya
      // cash_lines'ta tutulduğundan, yalnızca account_movements okumak tedarikçi ödemelerini
      // cari ekstresinde göstermiyordu.
      const res = await postgres.query(
        `
        WITH all_movs AS (
          SELECT
            am.id::text AS id,
            (am.date AT TIME ZONE 'UTC')::date::text AS date,
            COALESCE(am.fiche_no, '') AS fiche_no,
            COALESCE(am.definition, '') AS definition,
            ABS(COALESCE(am.amount, 0)) AS amount,
            COALESCE(am.sign, 1) AS sign,
            'movement'::text AS source,
            1 AS _prio
          FROM rex_${fn}_${pn}_account_movements am
          WHERE am.${idCol}::text = $1
            AND (am.date AT TIME ZONE 'UTC')::date >= $2::date
            AND (am.date AT TIME ZONE 'UTC')::date <= $3::date

          UNION ALL

          SELECT
            pl.id::text AS id,
            (pl.date AT TIME ZONE 'UTC')::date::text AS date,
            COALESCE(cl.fiche_no, pl.transaction_type, '') AS fiche_no,
            COALESCE(pl.definition, '') AS definition,
            ABS(COALESCE(pl.amount, 0)) AS amount,
            COALESCE(pl.sign, 1) AS sign,
            'movement'::text AS source,
            2 AS _prio
          FROM rex_${fn}_${pn}_party_ledger_movements pl
          LEFT JOIN rex_${fn}_${pn}_cash_lines cl ON cl.id = pl.cash_line_id
          WHERE pl.party_id::text = $1
            AND pl.card_type = $4
            AND pl.transaction_type NOT LIKE 'CANCELLED_%'
            AND (pl.date AT TIME ZONE 'UTC')::date >= $2::date
            AND (pl.date AT TIME ZONE 'UTC')::date <= $3::date

          UNION ALL

          SELECT
            cl.id::text AS id,
            (cl.date AT TIME ZONE 'UTC')::date::text AS date,
            COALESCE(cl.fiche_no, '') AS fiche_no,
            COALESCE(cl.definition, '') AS definition,
            ABS(COALESCE(cl.amount, 0)) AS amount,
            COALESCE(cl.sign, 1) AS sign,
            'movement'::text AS source,
            0 AS _prio
          FROM rex_${fn}_${pn}_cash_lines cl
          WHERE cl.${cashIdCol}::text = $1
            AND cl.transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
            AND cl.transaction_type NOT LIKE 'CANCELLED_%'
            AND (cl.date AT TIME ZONE 'UTC')::date >= $2::date
            AND (cl.date AT TIME ZONE 'UTC')::date <= $3::date
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY date, fiche_no, amount, sign
            ORDER BY _prio DESC
          ) AS rn
          FROM all_movs
        )
        SELECT id, date, fiche_no, definition, amount, sign, source
        FROM ranked
        WHERE rn = 1
        ORDER BY date ASC
        LIMIT ${ROW_LIMIT}
        `,
        [accountId, start, end, ledgerCardType],
      );
      rows = res.rows || [];
    } catch {
      rows = [];
    }

    if (!rows.length) {
      const ficheFilter = isCustomer
        ? `s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice', 'opening_balance')`
        : `(s.fiche_type = 'purchase_invoice' OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42) OR s.fiche_type IN ('return_invoice', 'opening_balance'))`;
      // V2-R17: kart tipine göre CASE (mobil reportsApi saleSignSql / V2-R13 ile aynı).
      // Alış (purchase_invoice / trcode 1…) → +1; iade → −1. Opening: işaretli net_amount.
      const openingSignSql = `CASE
            WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'opening_balance'
              THEN CASE WHEN COALESCE(s.net_amount, 0) < 0 THEN -1 ELSE 1 END`;
      const saleSignSql = isCustomer
        ? `${openingSignSql}
            WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
              OR COALESCE(s.trcode, 0) IN (2, 3) THEN -1
            ELSE 1
          END`
        : `${openingSignSql}
            WHEN COALESCE(s.trcode, 0) = 6
              OR LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice' THEN -1
            ELSE 1
          END`;
      const saleDefinitionSql = `CASE
            WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'opening_balance' THEN 'Devir'
            ELSE COALESCE(s.fiche_type, '')
          END`;
      const res = await postgres.query(
        `
        SELECT
          s.id::text AS id,
          (s.date AT TIME ZONE 'UTC')::date::text AS date,
          COALESCE(s.fiche_no, '') AS fiche_no,
          ${saleDefinitionSql} AS definition,
          ABS(COALESCE(s.net_amount, 0)) AS amount,
          ${saleSignSql} AS sign,
          'sale'::text AS source
        FROM sales s
        WHERE s.customer_id::text = $1
          AND COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND ${ficheFilter}
          AND (s.date AT TIME ZONE 'UTC')::date >= $2::date
          AND (s.date AT TIME ZONE 'UTC')::date <= $3::date
        ORDER BY s.date ASC
        LIMIT ${ROW_LIMIT}
        `,
        [accountId, start, end],
      );
      rows = res.rows || [];
    }

    return mapRunning(
      rows.map((r: any) => ({
        id: String(r.id ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        ficheNo: String(r.fiche_no ?? ''),
        definition: String(r.definition ?? ''),
        amount: Number(r.amount ?? 0),
        sign: Number(r.sign ?? 1) || 1,
        source: (r.source === 'sale' ? 'sale' : 'movement') as CariExtractRow['source'],
      })),
    );
  },

  async getCriticalStock(): Promise<CriticalStockRow[]> {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const products = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_products`,
          {
            select: 'id,code,name,stock,min_stock,critical_stock,cost,warehouse_code,is_active',
            is_active: 'eq.true',
            order: 'name.asc',
            limit: '4000',
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      return (products || [])
        .map((p) => {
          const stock = Number(p.stock ?? 0);
          const minStock = Number(p.min_stock ?? 0);
          const criticalStock = Number(p.critical_stock ?? 0);
          const unitCost = Number(p.cost ?? 0);
          let status: CriticalStockRow['status'] = 'ok';
          if (criticalStock > 0 && stock <= criticalStock) status = 'critical';
          else if (minStock > 0 && stock <= minStock) status = 'below_min';
          return {
            productId: String(p.id ?? ''),
            productCode: String(p.code ?? ''),
            productName: String(p.name ?? ''),
            warehouseCode: String(p.warehouse_code ?? '') || '—',
            stock,
            minStock,
            criticalStock,
            unitCost,
            stockValue: stock * unitCost,
            status,
          };
        })
        .filter((r) => r.status !== 'ok')
        .sort((a, b) => a.stock - b.stock)
        .slice(0, ROW_LIMIT);
    }

    const { rows } = await postgres.query(
      `
      SELECT
        p.id::text AS product_id,
        COALESCE(p.code, '') AS product_code,
        COALESCE(p.name, '') AS product_name,
        COALESCE(NULLIF(TRIM(p.warehouse_code), ''), '—') AS warehouse_code,
        COALESCE(p.stock, 0) AS stock,
        COALESCE(p.min_stock, 0) AS min_stock,
        COALESCE(p.critical_stock, 0) AS critical_stock,
        COALESCE(p.cost, 0) AS unit_cost
      FROM products p
      WHERE COALESCE(p.is_active, true) = true
        AND (
          (COALESCE(p.critical_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.critical_stock)
          OR (COALESCE(p.min_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.min_stock)
        )
      ORDER BY COALESCE(p.stock, 0) ASC
      LIMIT ${ROW_LIMIT}
      `,
      [],
    );
    return (rows || []).map((r: any) => {
      const stock = Number(r.stock ?? 0);
      const minStock = Number(r.min_stock ?? 0);
      const criticalStock = Number(r.critical_stock ?? 0);
      const unitCost = Number(r.unit_cost ?? 0);
      let status: CriticalStockRow['status'] = 'below_min';
      if (criticalStock > 0 && stock <= criticalStock) status = 'critical';
      return {
        productId: String(r.product_id ?? ''),
        productCode: String(r.product_code ?? ''),
        productName: String(r.product_name ?? ''),
        warehouseCode: String(r.warehouse_code ?? '—'),
        stock,
        minStock,
        criticalStock,
        unitCost,
        stockValue: stock * unitCost,
        status,
      };
    });
  },

  async getWarehouseStock(): Promise<WarehouseStockRow[]> {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const products = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_products`,
          {
            select: 'stock,cost,warehouse_code,min_stock,critical_stock,is_active',
            is_active: 'eq.true',
            limit: '5000',
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      const map = new Map<string, WarehouseStockRow>();
      for (const p of products || []) {
        const wh = String(p.warehouse_code || '').trim() || '—';
        const stock = Number(p.stock ?? 0);
        const cost = Number(p.cost ?? 0);
        const minStock = Number(p.min_stock ?? 0);
        const criticalStock = Number(p.critical_stock ?? 0);
        const cur = map.get(wh) || {
          warehouseCode: wh,
          skuCount: 0,
          totalQty: 0,
          totalValue: 0,
          criticalCount: 0,
        };
        cur.skuCount += 1;
        cur.totalQty += stock;
        cur.totalValue += stock * cost;
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

    const { rows } = await postgres.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(p.warehouse_code), ''), '—') AS warehouse_code,
        COUNT(*)::int AS sku_count,
        COALESCE(SUM(COALESCE(p.stock, 0)), 0) AS total_qty,
        COALESCE(SUM(COALESCE(p.stock, 0) * COALESCE(p.cost, 0)), 0) AS total_value,
        COUNT(*) FILTER (
          WHERE (COALESCE(p.critical_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.critical_stock)
             OR (COALESCE(p.min_stock, 0) > 0 AND COALESCE(p.stock, 0) <= p.min_stock)
        )::int AS critical_count
      FROM products p
      WHERE COALESCE(p.is_active, true) = true
      GROUP BY 1
      ORDER BY total_value DESC
      LIMIT 500
      `,
      [],
    );
    return (rows || []).map((r: any) => ({
      warehouseCode: String(r.warehouse_code ?? '—'),
      skuCount: Number(r.sku_count ?? 0),
      totalQty: Number(r.total_qty ?? 0),
      totalValue: Number(r.total_value ?? 0),
      criticalCount: Number(r.critical_count ?? 0),
    }));
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
        (s.date AT TIME ZONE 'UTC')::date::text AS date,
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
        COALESCE(s.net_amount, 0) AS invoice_amount,
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
        AND (s.date AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
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
   * Kaynak: `cash_lines` (firm-period) UNION `bank_lines` (firm-period).
   * `cumulative` TS tarafında running total olarak hesaplanır (DB sıralama değişse bile tutarlı).
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
    if (params.cariId) {
      values.push(String(params.cariId));
      cariClause = `WHERE (x.trx_date AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date AND x.customer_id = $${values.length}::uuid`;
    } else {
      cariClause = `WHERE (x.trx_date AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date`;
    }

    const sql = `
      WITH x AS (
        SELECT
          cl.id::text AS id,
          (cl.date AT TIME ZONE 'UTC')::date::text AS trx_date,
          COALESCE(cl.fiche_no, '') AS fiche_no,
          cl.customer_id AS customer_id,
          cl.amount AS amount,
          COALESCE(cl.sign, 1) AS sign,
          COALESCE(cl.transaction_type, '') AS tx_type,
          COALESCE(cl.definition, '') AS description
        FROM cash_lines cl
        UNION ALL
        SELECT
          bl.id::text AS id,
          (bl.date AT TIME ZONE 'UTC')::date::text AS trx_date,
          COALESCE(bl.fiche_no, '') AS fiche_no,
          bl.customer_id AS customer_id,
          bl.amount AS amount,
          COALESCE(bl.sign, 1) AS sign,
          COALESCE(bl.transaction_type, '') AS tx_type,
          COALESCE(bl.definition, '') AS description
        FROM bank_lines bl
      )
      SELECT
        x.id,
        x.trx_date AS date,
        x.fiche_no,
        ROW_NUMBER() OVER (PARTITION BY x.fiche_no ORDER BY x.id) AS sequence,
        UPPER(COALESCE(NULLIF(TRIM(x.tx_type), ''), 'OFFICE')) AS grp,
        '' AS sub_group,
        x.description,
        CASE WHEN x.sign > 0 THEN ABS(x.amount) ELSE 0 END AS incoming,
        CASE WHEN x.sign < 0 THEN ABS(x.amount) ELSE 0 END AS outgoing,
        x.customer_id::text AS cari_id,
        COALESCE(cust.name, sup.name, '') AS cari_name
      FROM x
      LEFT JOIN customers cust ON cust.id = x.customer_id
      LEFT JOIN suppliers sup ON sup.id = x.customer_id
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
    };
    let cumulative = 0;
    return ((rows || []) as Raw[]).map((r) => {
      const incoming = Number(r.incoming ?? 0);
      const outgoing = Number(r.outgoing ?? 0);
      cumulative += incoming - outgoing;
      return {
        id: String(r.id ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        ficheNo: String(r.fiche_no ?? ''),
        sequence: Number(r.sequence ?? 1),
        group: String(r.grp ?? 'OFFICE'),
        subGroup: String(r.sub_group ?? ''),
        description: String(r.description ?? ''),
        incoming,
        outgoing,
        cumulative,
        cariId: String(r.cari_id ?? ''),
        cariName: String(r.cari_name ?? ''),
      };
    });
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
    // Alış fiyatı filtresi: products.last_purchase_price tercih edilir; yoksa satır maliyeti (unit_cost).
    // Etiket "Alış Fiyatı" olduğundan eski unit_price (satış fiyatı) yerine alış maliyeti baz alınır.
    const purchasePriceExpr = `COALESCE(NULLIF(p.last_purchase_price, 0), NULLIF(si.unit_cost, 0), si.unit_price)`;
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
        (s.date AT TIME ZONE 'UTC')::date::text AS date,
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
        AND (s.date AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
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
              limit: String(ROW_LIMIT),
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
              select: 'staff_id,attendance_date,status',
              firm_nr: `eq.${firmNr}`,
              period_nr: `eq.${periodNr}`,
              attendance_date: `gte.${year}-${String(month).padStart(2, '0')}-01`,
              limit: String(ROW_LIMIT),
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]),
      ]);
      const byStaff = new Map<string, Map<number, string>>();
      for (const a of attRows || []) {
        const sid = String(a.staff_id || '');
        if (!sid) continue;
        const d = String(a.attendance_date || '').slice(0, 10);
        const day = Number(d.slice(8, 10));
        if (!Number.isFinite(day) || day < 1 || day > daysInMonth) continue;
        const m = byStaff.get(sid) || new Map<number, string>();
        m.set(day, String(a.status || ''));
        byStaff.set(sid, m);
      }
      return (staffRows || []).map((s) => {
        const sid = String(s.id ?? '');
        const m = byStaff.get(sid) || new Map<number, string>();
        const days: (1 | 0 | null)[] = Array.from({ length: 31 }, (_, i) => {
          const status = m.get(i + 1);
          if (!status) return null;
          if (status === 'ABSENT') return 0;
          if (status === 'PRESENT' || status === 'LATE' || status === 'HALF_DAY') return 1;
          return null;
        });
        return {
          staffId: sid,
          staffName: String(s.full_name ?? ''),
          department: String(s.department ?? ''),
          salary: Number(s.base_salary ?? 0),
          days,
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
  }): Promise<Record<string, unknown>[]> {
    const from = String(params.from ?? '').slice(0, 10);
    const to = String(params.to ?? '').slice(0, 10);
    if (!from || !to) return [];
    const firmNr = padFirm();
    const values: unknown[] = [firmNr, from, to];
    const where: string[] = [
      `s.firm_nr = $1::text`,
      `(s.date AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date`,
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
      WITH coll AS (
        SELECT cl.fiche_no, SUM(cl.amount * cl.sign) AS paid
        FROM cash_lines cl
        WHERE cl.sign > 0 AND COALESCE(cl.fiche_no, '') <> ''
        GROUP BY cl.fiche_no
      )
      SELECT
        si.id::text AS id,
        (s.date AT TIME ZONE 'UTC')::date::text AS date,
        COALESCE(s.fiche_no, '') AS invoice_no,
        COALESCE(c.name, s.customer_name, '') AS customer,
        COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, '') AS product,
        COALESCE(si.quantity, 0) AS qty,
        COALESCE(si.unit_price, 0) AS unit_price,
        COALESCE(si.discount_amount, 0) AS discount,
        COALESCE(si.net_amount, 0) AS line_total,
        COALESCE(s.net_amount, 0) AS invoice_total,
        COALESCE(c.phone, '') AS phone,
        COALESCE(s.net_amount, 0) - COALESCE(coll.paid, 0) AS balance
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN coll ON coll.fiche_no = s.fiche_no
      WHERE ${where.join(' AND ')}
      ORDER BY s.date DESC, s.fiche_no, si.id
      LIMIT ${ROW_LIMIT}
      `,
      values,
    );

    return (rows || []).map((r: any) => ({
      id: String(r.id ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      invoiceNo: String(r.invoice_no ?? ''),
      customer: String(r.customer ?? ''),
      product: String(r.product ?? ''),
      qty: Number(r.qty ?? 0),
      unitPrice: Number(r.unit_price ?? 0),
      discount: Number(r.discount ?? 0),
      lineTotal: Number(r.line_total ?? 0),
      invoiceTotal: Number(r.invoice_total ?? 0),
      balance: Number(r.balance ?? 0),
      phone: String(r.phone ?? ''),
    }));
  },
};

/* ========================================================================== */
/* VIVA SOLAR — Yeni ERP Raporları (Faz 2) — Tipler                            */
/* ========================================================================== */

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
}

export type CashLedgerGroup =
  | 'GASOLINE'
  | 'OFFICE'
  | 'PERSONEL'
  | 'WAREHOUSE'
  | 'INCOMING'
  | 'OUT'
  | string; // yayılma: kullanıcı tanımlı grup da olabilir
