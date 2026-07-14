/**
 * ERP çekirdek raporları — mevcut kiracı tablolarından (sales, cash_lines, bank_lines, customers, suppliers).
 * Yeni view/tablo yok; LIMIT ile ağır sorgular sınırlanır.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
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
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[])
    : [];
  const byId = new Map(cards.map((c) => [String(c.id), c]));

  return openSales
    .map((s) => {
      const card = byId.get(String(s.customer_id || ''));
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
    .filter((r) => Math.abs(r.amount) > 0.009);
}

export const erpReportsAPI = {
  async getCariAging(opts?: {
    cardType?: 'customer' | 'supplier' | 'all';
  }): Promise<CariAgingRow[]> {
    const today = localTodayDateKey();
    const want = opts?.cardType ?? 'all';

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const parts: CariAgingRow[] = [];
      if (want === 'all' || want === 'customer') {
        parts.push(...(await fetchAgingViaRest('customer', today)));
      }
      if (want === 'all' || want === 'supplier') {
        parts.push(...(await fetchAgingViaRest('supplier', today)));
      }
      return parts.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount).slice(0, ROW_LIMIT);
    }

    const rows: CariAgingRow[] = [];

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
          )
        ORDER BY s.date DESC
        LIMIT ${ROW_LIMIT}
        `,
        [],
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
          )
        ORDER BY s.date DESC
        LIMIT ${ROW_LIMIT}
        `,
        [],
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
  }): Promise<CariBalanceRow[]> {
    const want = opts?.cardType ?? 'all';
    const onlyNonZero = opts?.onlyNonZero !== false;
    const balFilter = onlyNonZero ? 'AND ABS(COALESCE(balance, 0)) > 0.009' : '';

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const fn = padFirm();
      const out: CariBalanceRow[] = [];
      const load = async (path: string, cardType: 'customer' | 'supplier') => {
        const rows = await postgrest
          .get<Record<string, unknown>[]>(
            path,
            {
              select: 'id,code,name,balance,credit_limit,payment_terms,is_active',
              is_active: 'eq.true',
              order: 'name.asc',
              limit: '2000',
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]);
        for (const r of rows || []) {
          const balance = Number(r.balance ?? 0);
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
      return out.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, ROW_LIMIT);
    }

    const parts: string[] = [];
    if (want === 'all' || want === 'customer') {
      parts.push(`
        SELECT id::text AS account_id, COALESCE(code,'') AS account_code, COALESCE(name,'') AS account_name,
               'customer'::text AS card_type, COALESCE(balance,0) AS balance,
               COALESCE(credit_limit,0) AS credit_limit, COALESCE(payment_terms::text,'') AS payment_terms
        FROM customers
        WHERE COALESCE(is_active, true) = true ${balFilter}
      `);
    }
    if (want === 'all' || want === 'supplier') {
      parts.push(`
        SELECT id::text AS account_id, COALESCE(code,'') AS account_code, COALESCE(name,'') AS account_name,
               'supplier'::text AS card_type, COALESCE(balance,0) AS balance,
               COALESCE(credit_limit,0) AS credit_limit, COALESCE(payment_terms::text,'') AS payment_terms
        FROM suppliers
        WHERE COALESCE(is_active, true) = true ${balFilter}
      `);
    }
    if (!parts.length) return [];
    const { rows } = await postgres.query(
      `${parts.join(' UNION ALL ')} ORDER BY ABS(balance) DESC LIMIT ${ROW_LIMIT}`,
      [],
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
        LEFT JOIN customers c ON c.id = cl.customer_id
        LEFT JOIN suppliers s ON s.id = cl.customer_id
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
        LEFT JOIN customers c ON c.id = bl.customer_id
        LEFT JOIN suppliers s ON s.id = bl.customer_id
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
          netAmount: Math.abs(Number(s.net_amount ?? 0)),
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
        ABS(COALESCE(s.net_amount, 0)) AS net_amount,
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
      const movements = await postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_account_movements`,
          {
            select: 'id,fiche_no,date,amount,sign,definition,customer_id,supplier_id',
            order: 'date.asc',
            limit: String(ROW_LIMIT),
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);

      const filtered = (movements || []).filter((m) => {
        const d = String(m.date || '').slice(0, 10);
        if (d < start || d > end) return false;
        const id = isCustomer ? String(m.customer_id || '') : String(m.supplier_id || m.customer_id || '');
        return id === accountId;
      });

      if (filtered.length) {
        return mapRunning(
          filtered.map((m) => ({
            id: String(m.id ?? `${m.fiche_no}-${m.date}`),
            date: String(m.date || '').slice(0, 10),
            ficheNo: String(m.fiche_no ?? ''),
            definition: String(m.definition ?? ''),
            amount: Number(m.amount ?? 0),
            sign: Number(m.sign ?? 1) || 1,
            source: 'movement' as const,
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
    let rows: any[] = [];
    try {
      const res = await postgres.query(
        `
        SELECT
          am.id::text AS id,
          (am.date AT TIME ZONE 'UTC')::date::text AS date,
          COALESCE(am.fiche_no, '') AS fiche_no,
          COALESCE(am.definition, '') AS definition,
          ABS(COALESCE(am.amount, 0)) AS amount,
          COALESCE(am.sign, 1) AS sign,
          'movement'::text AS source
        FROM account_movements am
        WHERE am.${idCol}::text = $1
          AND (am.date AT TIME ZONE 'UTC')::date >= $2::date
          AND (am.date AT TIME ZONE 'UTC')::date <= $3::date
        ORDER BY am.date ASC, am.created_at ASC NULLS LAST
        LIMIT ${ROW_LIMIT}
        `,
        [accountId, start, end],
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
};
