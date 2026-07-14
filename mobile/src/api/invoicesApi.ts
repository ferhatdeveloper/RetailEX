import { pgQuery } from './pgClient';
import { firmNr, newUuid, periodNr, productsTable, saleItemsTable, salesTable } from './erpTables';
import {
  buildInvoiceFilterClause,
  type InvoiceListFilter,
} from './invoiceFilters';
import {
  adjustCustomerBalance,
  adjustSupplierBalance,
  recordKasaGirisForSale,
} from './cashApi';
import {
  paymentMethodImpliesCashInKasa,
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
} from './paymentMethodUtils';

export type { InvoiceListFilter, InvoicesListPreset } from './invoiceFilters';
export {
  invoiceFilterLabel,
  resolveInvoicesRouteParams,
  trcodeBadgeLabel,
} from './invoiceFilters';

/** Liste filtresi — web Logo trcode / fiche_type grupları ile uyumlu */
export type InvoiceKind = 'all' | 'sales' | 'purchase';

const PURCHASE_TRCODES = [1, 4, 5, 6, 13, 26, 41, 42] as const;

export function isPurchaseInvoice(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): boolean {
  const tc = Number(row.trcode ?? 0);
  const ft = String(row.fiche_type ?? '').toLowerCase().trim();
  if (ft === 'purchase_invoice' || ft === 'a') return true;
  if (ft.includes('alis') || ft.includes('alış') || ft.includes('purchase')) return true;
  return (PURCHASE_TRCODES as readonly number[]).includes(tc);
}

export function isSalesInvoice(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): boolean {
  if (isPurchaseInvoice(row)) return false;
  const tc = Number(row.trcode ?? 0);
  const ft = String(row.fiche_type ?? '').toLowerCase().trim();
  if (ft === 'sales_invoice' || ft === 'sales' || ft === 'retail' || ft === 'service') return true;
  if (ft.includes('sat') || ft.includes('sales')) return true;
  if ([0, 2, 3, 7, 8, 9, 14, 29, 30, 31, 32].includes(tc)) return true;
  return !ft;
}

export function invoiceKindLabel(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): 'Alış' | 'Satış' {
  return isPurchaseInvoice(row) ? 'Alış' : 'Satış';
}

function kindSqlWhere(kind: InvoiceKind): string {
  if (kind === 'purchase') {
    return `(COALESCE(trcode, 0) IN (1, 4, 5, 6, 13, 26, 41, 42)
      OR LOWER(TRIM(COALESCE(fiche_type, ''))) IN ('purchase_invoice', 'a')
      OR COALESCE(fiche_type, '') ILIKE '%alis%'
      OR COALESCE(fiche_type, '') ILIKE '%alış%')`;
  }
  if (kind === 'sales') {
    return `NOT (
      COALESCE(trcode, 0) IN (1, 4, 5, 6, 13, 26, 41, 42)
      OR LOWER(TRIM(COALESCE(fiche_type, ''))) IN ('purchase_invoice', 'a')
      OR COALESCE(fiche_type, '') ILIKE '%alis%'
      OR COALESCE(fiche_type, '') ILIKE '%alış%'
    )`;
  }
  return 'TRUE';
}

export type InvoiceRow = {
  id: string;
  fiche_no: string | null;
  date: string | null;
  customer_name: string | null;
  net_amount: number;
  total_gross: number;
  status: string | null;
  fiche_type: string | null;
  trcode: number | null;
  payment_method: string | null;
  is_cancelled: boolean;
};

export async function fetchInvoices(opts?: {
  search?: string;
  limit?: number;
  /** Genel satış/alış ayrımı — `filter` verilmişse yok sayılır */
  kind?: InvoiceKind;
  /** trcode / fiche_type — satış iade (3), alış iade (6) vb. */
  filter?: InvoiceListFilter;
}): Promise<InvoiceRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const limit = opts?.limit ?? 100;
  const q = (opts?.search ?? '').trim();
  const useTrcodeFilter = !!opts?.filter && opts.filter.preset !== 'all';
  const kind = useTrcodeFilter ? 'all' : (opts?.kind ?? 'all');

  let filterSql = '';
  let filterParams: unknown[] = [];
  if (useTrcodeFilter) {
    const fc = buildInvoiceFilterClause(opts!.filter, q.length >= 1 ? 3 : 2);
    filterSql = fc.sql;
    filterParams = fc.params;
  } else if (kind !== 'all') {
    filterSql = ` AND (${kindSqlWhere(kind)})`;
  }

  const cols = `id, fiche_no, date::text AS date, customer_name,
    COALESCE(net_amount, total_net, total_gross, 0)::float8 AS net_amount,
    COALESCE(total_gross, 0)::float8 AS total_gross,
    status, fiche_type, trcode, payment_method,
    COALESCE(is_cancelled, false) AS is_cancelled`;

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<InvoiceRow>(
      `SELECT ${cols}
       FROM ${table}
       WHERE COALESCE(is_cancelled, false) = false
         AND (
           fiche_no ILIKE $1 OR COALESCE(customer_name,'') ILIKE $1
           OR COALESCE(document_no,'') ILIKE $1
         )${filterSql}
       ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT $2`,
      [like, limit, ...filterParams],
    );
    return res.rows;
  }

  const res = await pgQuery<InvoiceRow>(
    `SELECT ${cols}
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false${filterSql}
     ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT $1`,
    [limit, ...filterParams],
  );
  return res.rows;
}

/** Filtrelenmiş liste özeti (iade ekranları için) */
export async function fetchInvoiceFilterSummary(
  filter?: InvoiceListFilter,
): Promise<{ count: number; total: number }> {
  if (!filter || filter.preset === 'all') {
    return { count: 0, total: 0 };
  }
  const table = salesTable();
  const fc = buildInvoiceFilterClause(filter, 1);
  try {
    const res = await pgQuery<{ cnt: string | number; total: string | number }>(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(COALESCE(net_amount, total_net, total_gross, 0)), 0)::float8 AS total
       FROM ${table}
       WHERE COALESCE(is_cancelled, false) = false${fc.sql}`,
      fc.params,
    );
    const r = res.rows[0];
    return { count: Number(r?.cnt ?? 0), total: Number(r?.total ?? 0) };
  } catch {
    return { count: 0, total: 0 };
  }
}

export async function fetchInvoiceSummary(): Promise<{
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
}> {
  const table = salesTable();
  const purchaseCond = kindSqlWhere('purchase');
  const salesCond = kindSqlWhere('sales');
  try {
    const res = await pgQuery<{
      sales_total: string | number;
      sales_count: string | number;
      purchase_total: string | number;
      purchase_count: string | number;
    }>(
      `SELECT
         COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
           WHERE COALESCE(is_cancelled,false)=false AND (${salesCond})
         ), 0)::numeric AS sales_total,
         COUNT(*) FILTER (
           WHERE COALESCE(is_cancelled,false)=false AND (${salesCond})
         )::int AS sales_count,
         COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
           WHERE COALESCE(is_cancelled,false)=false AND (${purchaseCond})
         ), 0)::numeric AS purchase_total,
         COUNT(*) FILTER (
           WHERE COALESCE(is_cancelled,false)=false AND (${purchaseCond})
         )::int AS purchase_count
       FROM ${table}
       WHERE date::date >= (CURRENT_DATE - INTERVAL '30 days')`,
    );
    const r = res.rows[0];
    return {
      salesTotal: Number(r?.sales_total ?? 0),
      salesCount: Number(r?.sales_count ?? 0),
      purchaseTotal: Number(r?.purchase_total ?? 0),
      purchaseCount: Number(r?.purchase_count ?? 0),
    };
  } catch {
    return { salesTotal: 0, salesCount: 0, purchaseTotal: 0, purchaseCount: 0 };
  }
}

export type InvoiceLine = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number;
  net_amount: number;
  unit: string | null;
};

export type InvoiceDetail = InvoiceRow & {
  notes: string | null;
  total_vat: number;
  total_discount: number;
  currency: string | null;
  lines: InvoiceLine[];
};

export async function fetchInvoiceById(id: string): Promise<InvoiceDetail | null> {
  if (!id) return null;
  const header = salesTable();
  const items = saleItemsTable();

  const hRes = await pgQuery<InvoiceRow & {
    notes: string | null;
    total_vat: number;
    total_discount: number;
    currency: string | null;
  }>(
    `SELECT id, fiche_no, date::text AS date, customer_name,
            COALESCE(net_amount, total_net, total_gross, 0)::float8 AS net_amount,
            COALESCE(total_gross, 0)::float8 AS total_gross,
            status, fiche_type, trcode, payment_method,
            COALESCE(is_cancelled, false) AS is_cancelled,
            notes,
            COALESCE(total_vat, 0)::float8 AS total_vat,
            COALESCE(total_discount, 0)::float8 AS total_discount,
            currency
     FROM ${header}
     WHERE id::text = $1
     LIMIT 1`,
    [id],
  );
  const row = hRes.rows[0];
  if (!row) return null;

  let lines: InvoiceLine[] = [];
  try {
    const lRes = await pgQuery<InvoiceLine>(
      `SELECT id, item_code, item_name,
              COALESCE(quantity, 0)::float8 AS quantity,
              COALESCE(unit_price, 0)::float8 AS unit_price,
              COALESCE(net_amount, total_amount, 0)::float8 AS net_amount,
              unit
       FROM ${items}
       WHERE invoice_id::text = $1
       ORDER BY id`,
      [id],
    );
    lines = lRes.rows;
  } catch {
    lines = [];
  }

  return { ...row, lines };
}

export type InvoiceDraftLine = {
  productId: string;
  code?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string | null;
};

function nextFicheNo(prefix: 'SF' | 'AF'): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}`;
}

/** Basit satış faturası — POS ile aynı tablolar, fiche_type=sales_invoice, trcode=8 (toptan) */
export async function createSalesInvoice(opts: {
  customerId?: string;
  customerName: string;
  notes?: string;
  paymentMethod?: string;
  lines: InvoiceDraftLine[];
}): Promise<{ id: string; ficheNo: string; total: number }> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = newUuid();
  const ficheNo = nextFicheNo('SF');
  const total = opts.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'mobile';
  const customerName = opts.customerName.trim() || 'Perakende';

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $4, NOW(),
       'sales_invoice', 8, $5::uuid, $6,
       $7, 0, $7, 0, $7,
       'TRY', 1, 'approved', $8, $9, $10
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      opts.customerId || null,
      customerName,
      total,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'RetailEX Mobile Fatura',
    ],
  );

  for (const line of opts.lines) {
    const lineNet = line.unitPrice * line.qty;
    const lineId = newUuid();
    await pgQuery(
      `INSERT INTO ${items} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10, $10, $11
       )`,
      [
        lineId,
        id,
        fn,
        pn,
        line.productId,
        line.code ?? null,
        line.name,
        line.qty,
        line.unitPrice,
        lineNet,
        line.unit || 'Adet',
      ],
    );

    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) - $1, updated_at = NOW()
         WHERE id::text = $2`,
        [line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  const pm = opts.paymentMethod || 'Nakit';
  if (opts.customerId && paymentMethodImpliesCustomerDebt(pm) && total > 0) {
    try {
      await adjustCustomerBalance(opts.customerId, total);
    } catch {
      /* cari yoksa sessiz */
    }
  }
  if (paymentMethodImpliesCashInKasa(pm) && total > 0) {
    try {
      await recordKasaGirisForSale({
        amount: total,
        ficheNo,
        description: `Satış faturası — ${ficheNo}`,
        customerId: opts.customerId || null,
      });
    } catch {
      /* kasa yoksa sessiz */
    }
  }

  return { id, ficheNo, total };
}

/** Basit alış faturası — trcode=1, stok artışı */
export async function createPurchaseInvoice(opts: {
  supplierId?: string;
  supplierName: string;
  notes?: string;
  paymentMethod?: string;
  lines: InvoiceDraftLine[];
}): Promise<{ id: string; ficheNo: string; total: number }> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = newUuid();
  const ficheNo = nextFicheNo('AF');
  const total = opts.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'mobile';
  const supplierName = opts.supplierName.trim() || 'Tedarikçi';

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $4, NOW(),
       'purchase_invoice', 1, $5::uuid, $6,
       $7, 0, $7, 0, $7,
       'TRY', 1, 'approved', $8, $9, $10
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      opts.supplierId || null,
      supplierName,
      total,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'RetailEX Mobile Alış Faturası',
    ],
  );

  for (const line of opts.lines) {
    const lineNet = line.unitPrice * line.qty;
    const lineId = newUuid();
    await pgQuery(
      `INSERT INTO ${items} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10, $10, $11
       )`,
      [
        lineId,
        id,
        fn,
        pn,
        line.productId,
        line.code ?? null,
        line.name,
        line.qty,
        line.unitPrice,
        lineNet,
        line.unit || 'Adet',
      ],
    );

    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) + $1, updated_at = NOW()
         WHERE id::text = $2`,
        [line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  const pm = opts.paymentMethod || 'Nakit';
  // Peşin alışta tedarikçi borcu yok; veresiye / açık hesap → balance +=
  if (opts.supplierId && paymentMethodImpliesSupplierDebt(pm) && total > 0) {
    try {
      await adjustSupplierBalance(opts.supplierId, total);
    } catch {
      /* tedarikçi yoksa sessiz */
    }
  }

  return { id, ficheNo, total };
}

/** Mevcut fatura — not ve durum güncelleme (mobil düzenleme) */
export async function updateInvoiceHeader(
  id: string,
  patch: { notes?: string; status?: string },
): Promise<void> {
  if (!id) throw new Error('Fatura id gerekli');
  const table = salesTable();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (patch.notes !== undefined) {
    sets.push(`notes = $${i++}`);
    vals.push(patch.notes.trim() || null);
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(patch.status.trim() || null);
  }
  if (!sets.length) return;

  vals.push(id);
  await pgQuery(`UPDATE ${table} SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
}
