/**
 * POS fiş kaydı — web InvoicesAPI / MarketPOS ile aynı tablolar
 * (rex_{firm}_{period}_sales + sale_items) + kasa / cari yan etki.
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
import { shouldUseLiveData } from '../offline/policy';
import {
  enqueueMutation,
  type PosCartLineInput,
} from '../offline/mutationQueue';
import { adjustProductStockInCache } from '../offline/snapshotCache';
import { useConnectivityStore } from '../store/connectivityStore';
import {
  adjustCustomerBalance,
  recordBankaGirisForSale,
  recordKasaGirisForSale,
} from './cashApi';
import {
  paymentMethodImpliesBankTransfer,
  paymentMethodImpliesCashInKasa,
  paymentMethodImpliesCustomerDebt,
} from './paymentMethodUtils';

export type PosCartLine = PosCartLineInput;

export type PosSaleResult = {
  id: string;
  ficheNo: string;
  total: number;
  /** Offline/Hybrid kuyruğa alındı — henüz PG'ye yazılmadı */
  queued?: boolean;
};

export type PosSaleWriteOptions = {
  /** Senkron motoru: canlı zorunlu */
  forceLive?: boolean;
  /** Kuyruğa alma (flush sırasında) */
  skipQueue?: boolean;
  /** Offline create için sabit id / fiş no */
  id?: string;
  ficheNo?: string;
  /** Veresiye için cari */
  customerId?: string | null;
  customerName?: string | null;
  /** Kampanya indirimi (header total_discount) */
  totalDiscount?: number;
  campaignId?: string | null;
  campaignName?: string | null;
};

function nextFicheNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `POS-${stamp}`;
}

/** Satır net (indirim yok; kampanya indirimi header'da) */
function posLineNet(line: PosCartLine): number {
  return Math.max(0, Number(line.price) || 0) * Math.max(0, Number(line.qty) || 0);
}

/** Satır KDV tutarı — web sale_items.vat_rate + invoicesAPI.tax parity */
function posLineVat(line: PosCartLine): number {
  const rate = Math.max(0, Number(line.vatRate) || 0);
  return posLineNet(line) * (rate / 100);
}

/** POS özet — dip/kampanya indirimi sonrası KDV orantılı ölçeklenir */
export function posTotalsFromLines(
  lines: PosCartLine[],
  headerDiscount = 0,
): {
  subtotal: number;
  headerDiscount: number;
  totalVat: number;
  net: number;
} {
  const subtotal = lines.reduce((s, l) => s + posLineNet(l), 0);
  const disc = Math.min(subtotal, Math.max(0, Number(headerDiscount) || 0));
  const net = Math.max(0, subtotal - disc);
  const rawVat = lines.reduce((s, l) => s + posLineVat(l), 0);
  const scale = subtotal > 0 ? net / subtotal : 1;
  const totalVat = Math.round(rawVat * scale * 100) / 100;
  return { subtotal, headerDiscount: disc, totalVat, net };
}

async function insertPosSaleItemRow(
  itemsTable: string,
  opts: {
    invoiceId: string;
    firmNr: string;
    periodNr: string;
    line: PosCartLine;
  },
): Promise<void> {
  const lineNet = posLineNet(opts.line);
  const lineId = newUuid();
  const vatRate = Math.max(0, Number(opts.line.vatRate) || 0);
  try {
    await pgQuery(
      `INSERT INTO ${itemsTable} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, vat_rate,
         net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10,
         $11, $11, $12
       )`,
      [
        lineId,
        opts.invoiceId,
        opts.firmNr,
        opts.periodNr,
        opts.line.productId,
        opts.line.code ?? null,
        opts.line.name,
        opts.line.qty,
        opts.line.price,
        vatRate,
        lineNet,
        opts.line.unit || 'Adet',
      ],
    );
  } catch {
    await pgQuery(
      `INSERT INTO ${itemsTable} (
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
        opts.invoiceId,
        opts.firmNr,
        opts.periodNr,
        opts.line.productId,
        opts.line.code ?? null,
        opts.line.name,
        opts.line.qty,
        opts.line.price,
        lineNet,
        opts.line.unit || 'Adet',
      ],
    );
  }
}

async function applyPosAccountingSideEffects(opts: {
  ficheNo: string;
  total: number;
  paymentMethod: string;
  customerId?: string | null;
}): Promise<void> {
  const { ficheNo, total, paymentMethod, customerId } = opts;

  if (paymentMethodImpliesCashInKasa(paymentMethod)) {
    try {
      await recordKasaGirisForSale({
        amount: total,
        ficheNo,
        description: `Market Satışı - ${ficheNo}`,
        customerId: customerId || null,
      });
    } catch {
      /* kasa yazılamasa satış yine geçerli */
    }
  } else if (paymentMethodImpliesBankTransfer(paymentMethod) && total > 0) {
    try {
      await recordBankaGirisForSale({
        amount: total,
        ficheNo,
        description: `Market Satışı (havale) - ${ficheNo}`,
      });
    } catch {
      /* banka yazılamasa satış yine geçerli */
    }
  }

  if (customerId && paymentMethodImpliesCustomerDebt(paymentMethod) && total > 0) {
    try {
      await adjustCustomerBalance(customerId, total);
    } catch {
      /* cari yoksa sessiz */
    }
  }
}

async function savePosSaleLive(
  lines: PosCartLine[],
  paymentMethod: string,
  opts?: Pick<
    PosSaleWriteOptions,
    | 'id'
    | 'ficheNo'
    | 'customerId'
    | 'customerName'
    | 'totalDiscount'
    | 'campaignId'
    | 'campaignName'
  >,
): Promise<PosSaleResult> {
  if (!lines.length) throw new Error('Sepet boş');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const user = useAuthStore.getState().user;
  const id = opts?.id || newUuid();
  const ficheNo = opts?.ficheNo || nextFicheNo();
  const totals = posTotalsFromLines(lines, opts?.totalDiscount);
  const total = Math.round(totals.net * 100) / 100;
  const cashier = user?.fullName || user?.username || 'mobile';
  const customerId = opts?.customerId || null;
  const customerName =
    (opts?.customerName || '').trim() || (customerId ? 'Cari' : 'Perakende');
  const campaignNote =
    opts?.campaignId && totals.headerDiscount > 0
      ? `Kampanya: ${opts.campaignName || opts.campaignId} (−${totals.headerDiscount})`
      : null;
  const notes = ['RetailEX Mobile POS', campaignNote].filter(Boolean).join(' | ');

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $4, NOW(),
       'sales_invoice', 7, $5::uuid, $6,
       $7, $8, $9, $10, $7,
       'TRY', 1, 'completed', $11, $12, $13
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      customerId,
      customerName,
      total,
      totals.totalVat,
      totals.subtotal,
      totals.headerDiscount,
      paymentMethod,
      cashier,
      notes,
    ],
  );

  for (const line of lines) {
    await insertPosSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

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

  await applyPosAccountingSideEffects({
    ficheNo,
    total,
    paymentMethod,
    customerId,
  });

  return { id, ficheNo, total };
}

export async function savePosSale(
  lines: PosCartLine[],
  paymentMethod = 'Nakit',
  opts?: PosSaleWriteOptions,
): Promise<PosSaleResult> {
  if (!lines.length) throw new Error('Sepet boş');

  const id = opts?.id || newUuid();
  const ficheNo = opts?.ficheNo || nextFicheNo();
  const totals = posTotalsFromLines(lines, opts?.totalDiscount);
  const total = Math.round(totals.net * 100) / 100;
  const live = opts?.forceLive === true || shouldUseLiveData();

  if (!live && !opts?.skipQueue) {
    await enqueueMutation({
      type: 'pos.sale',
      payload: {
        localId: id,
        ficheNo,
        lines: lines.map((l) => ({ ...l })),
        paymentMethod,
        customerId: opts?.customerId ?? null,
        customerName: opts?.customerName ?? null,
        totalDiscount: totals.headerDiscount,
        campaignId: opts?.campaignId ?? null,
        campaignName: opts?.campaignName ?? null,
      },
    });
    for (const line of lines) {
      await adjustProductStockInCache(line.productId, -line.qty);
    }
    await useConnectivityStore.getState().refreshPendingCount();
    return { id, ficheNo, total, queued: true };
  }

  return savePosSaleLive(lines, paymentMethod, {
    id,
    ficheNo,
    customerId: opts?.customerId,
    customerName: opts?.customerName,
    totalDiscount: totals.headerDiscount,
    campaignId: opts?.campaignId,
    campaignName: opts?.campaignName,
  });
}
