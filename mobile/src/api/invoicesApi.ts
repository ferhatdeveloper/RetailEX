import { pgQuery } from './pgClient';
import { firmNr, newUuid, periodNr, productsTable, saleItemsTable, salesTable } from './erpTables';

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

export type InvoiceDraftLine = {
  productId: string;
  code?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string | null;
};

function nextSalesFicheNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `SF-${stamp}`;
}

/** Basit satış faturası — POS ile aynı tablolar, trcode=0 (standart satış) */
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
  const ficheNo = nextSalesFicheNo();
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
       'sales', 0, $5::uuid, $6,
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
