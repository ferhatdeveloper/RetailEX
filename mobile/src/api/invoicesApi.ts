import { pgQuery } from './pgClient';
import { firmNr, periodNr, saleItemsTable, salesTable } from './erpTables';

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
}): Promise<InvoiceRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const limit = opts?.limit ?? 100;
  const q = (opts?.search ?? '').trim();

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
         )
       ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT $2`,
      [like, limit],
    );
    return res.rows;
  }

  const res = await pgQuery<InvoiceRow>(
    `SELECT ${cols}
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false
     ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function fetchInvoiceSummary(): Promise<{
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
}> {
  const table = salesTable();
  try {
    const res = await pgQuery<{
      sales_total: string | number;
      sales_count: string | number;
      purchase_total: string | number;
    }>(
      `SELECT
         COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
           WHERE COALESCE(is_cancelled,false)=false
             AND (COALESCE(trcode,0) IN (0,1,2,3,7,8,9) OR fiche_type ILIKE '%sat%' OR fiche_type IS NULL)
         ), 0)::numeric AS sales_total,
         COUNT(*) FILTER (
           WHERE COALESCE(is_cancelled,false)=false
         )::int AS sales_count,
         COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
           WHERE COALESCE(is_cancelled,false)=false
             AND (COALESCE(trcode,0) IN (4,5,6) OR fiche_type ILIKE '%al%')
         ), 0)::numeric AS purchase_total
       FROM ${table}
       WHERE date::date >= (CURRENT_DATE - INTERVAL '30 days')`,
    );
    const r = res.rows[0];
    return {
      salesTotal: Number(r?.sales_total ?? 0),
      salesCount: Number(r?.sales_count ?? 0),
      purchaseTotal: Number(r?.purchase_total ?? 0),
    };
  } catch {
    return { salesTotal: 0, salesCount: 0, purchaseTotal: 0 };
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
