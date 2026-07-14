/**
 * POS fiş kaydı — web InvoicesAPI / MarketPOS ile aynı tablolar
 * (rex_{firm}_{period}_sales + sale_items).
 */

import { pgQuery } from './pgClient';
import {
  firmNr,
  newUuid,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
} from './erpTables';
import { useAuthStore } from '../store/authStore';

export type PosCartLine = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string | null;
  code?: string | null;
};

export type PosSaleResult = {
  id: string;
  ficheNo: string;
  total: number;
};

function nextFicheNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `POS-${stamp}`;
}

export async function savePosSale(
  lines: PosCartLine[],
  paymentMethod = 'Nakit',
): Promise<PosSaleResult> {
  if (!lines.length) throw new Error('Sepet boş');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const user = useAuthStore.getState().user;
  const id = newUuid();
  const ficheNo = nextFicheNo();
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const cashier = user?.fullName || user?.username || 'mobile';

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $4, NOW(),
       'retail', 8, 'Perakende',
       $5, 0, $5, 0, $5,
       'TRY', 1, 'completed', $6, $7, 'RetailEX Mobile POS'
     )`,
    [id, fn, pn, ficheNo, total, paymentMethod, cashier],
  );

  for (const line of lines) {
    const lineNet = line.price * line.qty;
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
        line.price,
        lineNet,
        line.unit || 'Adet',
      ],
    );

    // Stok düşümü — kolon yoksa sessizce geç
    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) - $1,
             updated_at = NOW()
         WHERE id::text = $2`,
        [line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  return { id, ficheNo, total };
}
