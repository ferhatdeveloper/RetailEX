import { pgQuery } from './pgClient';
import {
  appendStoreIdFilter,
  customersTable,
  firmNr,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
  stockMovementItemsTable,
  stockMovementsTable,
  suppliersTable,
} from './erpTables';

/** Web `STOCK_SLIP_TRCODES` */
export const STOCK_SLIP_TRCODES = {
  CONSUMPTION: 1,
  PRODUCTION_IN: 2,
  TRANSFER: 5,
  WASTAGE: 11,
  OPENING: 14,
  COUNTING: 25,
  SURPLUS: 26,
  SHORTAGE: 50,
  PRICE_CHANGE: 78,
} as const;

export type StockMovementRow = {
  id: string;
  document_no: string;
  trcode: number;
  movement_type: string;
  movement_date: string;
  warehouse_name: string | null;
  description: string | null;
  customer_name: string | null;
  status: string;
  line_count: number;
  source_kind: 'slip' | 'invoice';
};

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: 'Giriş',
  out: 'Çıkış',
  transfer: 'Transfer',
  adjustment: 'Düzeltme',
  price_change: 'Fiyat Değişimi',
};

const TRCODE_LABEL: Record<number, string> = {
  1: 'Sarf',
  2: 'Üretimden Giriş',
  5: 'Ambar Fişi',
  11: 'Fire',
  14: 'Devir',
  25: 'Sayım',
  26: 'Sayım Fazlası',
  50: 'Sayım Eksiği',
  78: 'Fiyat Değişimi',
};

export function stockMovementLabel(row: Pick<StockMovementRow, 'trcode' | 'movement_type'>): string {
  return TRCODE_LABEL[row.trcode] || MOVEMENT_TYPE_LABEL[row.movement_type] || row.movement_type || '—';
}

export async function fetchStockMovements(opts?: {
  trcode?: number;
  limit?: number;
}): Promise<StockMovementRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const limit = opts?.limit ?? 300;
  const trcode = opts?.trcode ?? null;

  let slips: StockMovementRow[] = [];
  try {
    const slipParams: unknown[] = [trcode, limit];
    const slipStoreSql = appendStoreIdFilter('m.warehouse_id', slipParams);
    const res = await pgQuery<{
      id: string;
      document_no: string;
      trcode: number;
      movement_type: string;
      movement_date: string;
      warehouse_name: string | null;
      description: string | null;
      status: string;
      line_count: number;
    }>(
      `SELECT m.id::text AS id,
              COALESCE(m.document_no, '') AS document_no,
              COALESCE(m.trcode, 0)::int AS trcode,
              COALESCE(m.movement_type, '') AS movement_type,
              COALESCE(m.movement_date::date, m.created_at::date)::text AS movement_date,
              s.name AS warehouse_name,
              NULLIF(TRIM(COALESCE(m.description, '')), '') AS description,
              COALESCE(m.status, '') AS status,
              (SELECT COUNT(*)::int FROM ${items} i WHERE i.movement_id = m.id) AS line_count
       FROM ${mov} m
       LEFT JOIN public.stores s ON m.warehouse_id = s.id
       WHERE ($1::int IS NULL OR COALESCE(m.trcode, 0) = $1)
         ${slipStoreSql}
       ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
       LIMIT $2`,
      slipParams,
    );
    slips = res.rows.map((r) => ({
      ...r,
      customer_name: null,
      source_kind: 'slip' as const,
    }));
  } catch {
    slips = [];
  }

  if (trcode != null) return slips;

  const sales = salesTable(fn, pn);
  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  let invoices: StockMovementRow[] = [];
  try {
    const invParams: unknown[] = [];
    const invStoreSql = appendStoreIdFilter('s.store_id', invParams);
    const res = await pgQuery<{
      id: string;
      document_no: string;
      trcode: number;
      movement_type: string;
      movement_date: string;
      warehouse_name: string | null;
      description: string | null;
      customer_name: string | null;
      status: string;
      line_count: number;
    }>(
      `SELECT s.id::text AS id,
              COALESCE(s.fiche_no, '') AS document_no,
              COALESCE(s.trcode, 0)::int AS trcode,
              CASE
                WHEN s.fiche_type = 'purchase_invoice' THEN 'in'
                WHEN s.fiche_type = 'sales_invoice' THEN 'out'
                WHEN s.fiche_type = 'return_invoice' AND COALESCE(s.trcode, 0) = 3 THEN 'in'
                WHEN s.fiche_type = 'return_invoice' THEN 'out'
                ELSE 'out'
              END AS movement_type,
              COALESCE(s.date::date, s.created_at::date)::text AS movement_date,
              st.name AS warehouse_name,
              NULLIF(TRIM(COALESCE(s.notes, '')), '') AS description,
              COALESCE(
                NULLIF(TRIM(s.customer_name), ''),
                c.name,
                sup.name,
                ''
              ) AS customer_name,
              COALESCE(s.status, 'approved') AS status,
              (SELECT COUNT(*)::int FROM ${saleItemsTable(fn, pn)} si WHERE si.invoice_id = s.id) AS line_count
       FROM ${sales} s
       LEFT JOIN public.stores st ON s.store_id = st.id
       LEFT JOIN ${cust} c ON c.id::text = s.customer_id::text
       LEFT JOIN ${supp} sup ON sup.id::text = s.customer_id::text
       WHERE s.fiche_type IN ('purchase_invoice', 'sales_invoice', 'return_invoice')
         AND COALESCE(s.is_cancelled, false) = false
         ${invStoreSql}
       ORDER BY s.date DESC NULLS LAST, s.created_at DESC NULLS LAST
       LIMIT 200`,
      invParams,
    );
    invoices = res.rows.map((r) => ({
      ...r,
      id: `inv-${r.id}`,
      source_kind: 'invoice' as const,
    }));
  } catch {
    invoices = [];
  }

  const combined = [...slips, ...invoices];
  combined.sort((a, b) => {
    const ta = new Date(a.movement_date || 0).getTime();
    const tb = new Date(b.movement_date || 0).getTime();
    return tb - ta;
  });
  return combined.slice(0, limit);
}
