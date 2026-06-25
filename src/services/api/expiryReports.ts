import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';

export interface ExpiringPurchaseItem {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierId?: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  batchNo?: string;
  daysLeft: number;
}

function rowToExpiringItem(row: Record<string, unknown>): ExpiringPurchaseItem {
  const expiry = String(row.expiry_date ?? '').slice(0, 10);
  return {
    invoiceId: String(row.invoice_id ?? ''),
    invoiceNo: String(row.invoice_no ?? ''),
    invoiceDate: String(row.invoice_date ?? '').slice(0, 10),
    supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
    supplierName: String(row.supplier_name ?? ''),
    itemCode: String(row.item_code ?? ''),
    itemName: String(row.item_name ?? ''),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? ''),
    expiryDate: expiry,
    batchNo: row.batch_no ? String(row.batch_no) : undefined,
    daysLeft: Number(row.days_left ?? 0),
  };
}

export const expiryReportsAPI = {
  async getExpiringPurchaseItems(daysAhead = 3): Promise<ExpiringPurchaseItem[]> {
    const fn = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
    const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
    const salesTable = `rex_${fn}_${pn}_sales`;
    const itemsTable = `rex_${fn}_${pn}_sale_items`;
    const suppliersTable = `rex_${fn}_suppliers`;
    const customersTable = `rex_${fn}_customers`;
    const limitDays = Math.max(0, Math.min(365, Math.round(Number(daysAhead) || 3)));

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const today = new Date();
      const end = new Date(today);
      end.setDate(end.getDate() + limitDays);
      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const itemRows = await postgrest.get<Record<string, unknown>[]>(
        `/${itemsTable}`,
        {
          select: '*',
          expiry_date: `gte.${ymd(today)}`,
          and: `(expiry_date.lte.${ymd(end)})`,
          order: 'expiry_date.asc',
          limit: '1000',
        },
        { schema: 'public' },
      );
      const invoiceIds = Array.from(new Set((itemRows || []).map(row => String(row.invoice_id || '')).filter(Boolean)));
      if (!invoiceIds.length) return [];
      const salesRows = await postgrest.get<Record<string, unknown>[]>(
        `/${salesTable}`,
        {
          select: 'id,fiche_no,date,customer_id,customer_name,invoice_type,trcode,fiche_type',
          id: `in.(${invoiceIds.join(',')})`,
          limit: '1000',
        },
        { schema: 'public' },
      );
      const salesById = new Map((salesRows || []).map(row => [String(row.id), row]));
      const supplierIds = Array.from(new Set((salesRows || []).map(row => String(row.customer_id || '')).filter(Boolean)));
      const supplierRows = supplierIds.length
        ? await postgrest.get<Record<string, unknown>[]>(
            `/${suppliersTable}`,
            { select: 'id,name', id: `in.(${supplierIds.join(',')})`, limit: '1000' },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[])
        : [];
      const customerRows = supplierIds.length
        ? await postgrest.get<Record<string, unknown>[]>(
            `/${customersTable}`,
            { select: 'id,name', id: `in.(${supplierIds.join(',')})`, limit: '1000' },
            { schema: 'public' },
          ).catch(() => [] as Record<string, unknown>[])
        : [];
      const names = new Map([...supplierRows, ...customerRows].map(row => [String(row.id), String(row.name || '')]));
      const now0 = new Date(ymd(today));
      return (itemRows || [])
        .map(item => {
          const sale = salesById.get(String(item.invoice_id));
          if (!sale) return null;
          const trcode = Number(sale.invoice_type ?? sale.trcode ?? 0);
          const fiche = String(sale.fiche_type ?? '').toLowerCase();
          if (!(trcode === 1 || fiche === 'purchase_invoice')) return null;
          const exp = new Date(String(item.expiry_date).slice(0, 10));
          return rowToExpiringItem({
            ...item,
            invoice_id: sale.id,
            invoice_no: sale.fiche_no,
            invoice_date: sale.date,
            supplier_id: sale.customer_id,
            supplier_name: names.get(String(sale.customer_id)) || sale.customer_name || '',
            days_left: Math.ceil((exp.getTime() - now0.getTime()) / 86400000),
          });
        })
        .filter((row): row is ExpiringPurchaseItem => row != null);
    }

    const { rows } = await postgres.query(
      `
        SELECT
          s.id AS invoice_id,
          s.fiche_no AS invoice_no,
          s.date AS invoice_date,
          s.customer_id AS supplier_id,
          COALESCE(NULLIF(TRIM(sup.name), ''), NULLIF(TRIM(c.name), ''), s.customer_name, '') AS supplier_name,
          it.item_code,
          it.item_name,
          it.quantity,
          it.unit,
          it.expiry_date,
          it.batch_no,
          (it.expiry_date::date - CURRENT_DATE)::int AS days_left
        FROM ${itemsTable} it
        INNER JOIN ${salesTable} s ON s.id = it.invoice_id
        LEFT JOIN ${suppliersTable} sup ON sup.id = s.customer_id
        LEFT JOIN ${customersTable} c ON c.id = s.customer_id
        WHERE it.expiry_date IS NOT NULL
          AND it.expiry_date >= CURRENT_DATE
          AND it.expiry_date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
          AND (s.invoice_type = 1 OR s.trcode = 1 OR LOWER(COALESCE(s.fiche_type, '')) = 'purchase_invoice')
          AND COALESCE(s.is_cancelled, false) = false
        ORDER BY it.expiry_date ASC, it.item_name ASC
      `,
      [limitDays],
      { firmNr: fn, periodNr: pn },
    );
    return rows.map(rowToExpiringItem);
  },
};
