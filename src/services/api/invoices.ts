/**
 * Invoices API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { IS_TAURI } from '../../utils/env';
import { type Invoice } from '../../core/types';
import { customerAPI } from './customers';
import { productAPI } from './products';
import { hydrateWeightLineFromDb, resolveStockQuantityFromLine } from '../../utils/scaleQuantity';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import {
  canonicalInvoiceLineType,
  invoiceLineTypeToDb,
  isInvoiceStockLineType,
  isInvoiceSupplierPayableLineType,
  invoiceLinePayableNetAmount,
} from '../../utils/invoiceLineType';
import { readInvoiceHeaderFields } from '../../utils/invoiceHeaderFields';
import type { PurchasePromotionReportLine } from '../../utils/purchasePromotionReport';
import {
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
} from '../../utils/paymentMethodUtils';
export type { Invoice };

export {
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
  sqlPaymentMethodImpliesCustomerDebtExpr,
  sqlPaymentMethodImpliesSupplierDebtExpr,
} from '../../utils/paymentMethodUtils';

// Helper to validate UUID format
const isValidUuid = (uuid: any): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

function isNonEmptyScalar(v: string | number | undefined | null): boolean {
  if (v === undefined || v === null) return false;
  return String(v).trim() !== '';
}

function invoiceLineDateOrNull(value: unknown): string | null {
  const s = toSqlDateInputString(value as string | Date | number | null | undefined);
  return s || null;
}

/** Stok hareketi miktarı — KG/GR alış 1,610 = tartı satış 1610 g */
function invoiceLineStockQuantity(item: Record<string, unknown>): number {
  return resolveStockQuantityFromLine({
    quantity: Number(item.quantity),
    baseQuantity: item.baseQuantity != null ? Number(item.baseQuantity) : undefined,
    unit: String(item.unit ?? ''),
    multiplier: Number(item.multiplier || 1),
  });
}

/**
 * Fatura satırının ürün kartı stokuna etkisi.
 * Logo: trcode 6 = alış iade → stok düşer (kategori yanlışlıkla Alis olsa bile).
 */
function invoiceLineStockDelta(
  category: string | undefined,
  trcode: number,
  baseQty: number
): number {
  if (!baseQty || !Number.isFinite(baseQty)) return 0;
  const tc = Number(trcode) || 0;
  // Alış iade (6) / satış iade stok çıkışı (2): her zaman eksi
  if (tc === 6 || tc === 2) return -baseQty;
  if (category === 'Alis') return baseQty;
  if (category === 'Satis') return -baseQty;
  if (category === 'Iade') {
    // 3 = satıştan iade (stok girer)
    if (tc === 3) return baseQty;
    return baseQty;
  }
  return 0;
}

function resolveSaleItemProductUuid(item: {
  productId?: unknown;
  code?: unknown;
}): string | null {
  const candidates = [item.productId, item.code];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (isValidUuid(s)) return s;
  }
  return null;
}

/** Restoran `closeBill` notu — ERP fatura silinince adisyon da iptal */
function extractRestOrderIdFromInvoiceNotes(notes?: string | null): string | null {
  if (!notes || typeof notes !== 'string') return null;
  const m = notes.match(/rest_order_id:([0-9a-f-]{36})/i);
  return m ? m[1]! : null;
}

/**
 * Satışta cari borç (müşteri bize borçlu) yalnızca veresiye / açık hesap — paymentMethodUtils.
 */
const CANCELLED_INVOICE_STATUSES = new Set(['iptal', 'cancelled', 'canceled', 'deleted', 'silindi']);

function isInvoiceCancelledStatus(status: string | undefined | null): boolean {
  return CANCELLED_INVOICE_STATUSES.has(String(status || '').toLowerCase().trim());
}

function salesHeaderRowToRevertInvoice(h: Record<string, unknown>, id: string): Invoice {
  return mapDatabaseInvoiceToInvoice({
    ...h,
    id,
    firma_id: h.firm_nr,
    donem_id: h.period_nr,
  });
}

/** Satış faturasında kasa defterine yansıyacak tahsilat (nakit / POS cash) */
export function paymentMethodImpliesCashInKasa(pm: string | undefined | null): boolean {
  const p = String(pm || '').trim().toLowerCase();
  if (!p) return false;
  return p === 'cash' || p === 'nakit';
}

/** Kasa hareketleri `rex_{firma}_{dönem}_cash_lines` tablosunda; silme sorgusu satışın dönemine göre çözülmeli */
function buildCashLinePgOpts(firmRaw?: string | null, periodRaw?: string | null): { firmNr: string; periodNr: string } {
  const firmNr = String(firmRaw ?? ERP_SETTINGS.firmNr ?? '001').trim() || '001';
  const periodNr = String(periodRaw ?? ERP_SETTINGS.periodNr ?? '01').trim() || '01';
  return { firmNr, periodNr };
}

/** `rest_api`: fiş no ile kasa satırlarını bul, kasa defteri bakiyesini düzelt, satırları sil */
async function removeCashLinesByFicheNoPostgrest(
  ficheNo: string,
  opt: { firmNr: string; periodNr: string }
): Promise<boolean> {
  try {
    const { postgrest } = await import('./postgrestClient');
    const fn = String(opt.firmNr).trim().padStart(3, '0').slice(0, 10);
    const pn = String(opt.periodNr).trim().padStart(2, '0').slice(0, 10);
    const cashPath = `/rex_${fn}_${pn}_cash_lines`;
    const regPath = `/rex_${fn}_cash_registers`;
    const cashRows = await postgrest.get<any[]>(
      cashPath,
      { select: 'id,register_id,amount,sign', fiche_no: `eq.${ficheNo}` },
      { schema: 'public' }
    );
    if (!Array.isArray(cashRows) || cashRows.length === 0) return false;

    for (const line of cashRows) {
      const regId = line.register_id;
      const amt = parseFloat(String(line.amount ?? 0)) || 0;
      const sgn = parseInt(String(line.sign ?? 1), 10) || 1;
      const delta = amt * sgn;
      if (regId && delta !== 0 && !Number.isNaN(delta)) {
        try {
          const cur = await postgrest.get<any[]>(
            regPath,
            { select: 'balance', id: `eq.${regId}`, limit: 1 },
            { schema: 'public' }
          );
          const row = Array.isArray(cur) ? cur[0] : null;
          const b = Number(row?.balance ?? 0);
          await postgrest.patch(
            `${regPath}?id=eq.${encodeURIComponent(String(regId))}`,
            { balance: b - delta },
            { schema: 'public', prefer: 'return=minimal' }
          );
        } catch {
          /* kasa defteri güncellenemezse yine de satır silinir */
        }
      }
    }
    await postgrest.delete(
      `${cashPath}?fiche_no=eq.${encodeURIComponent(String(ficheNo))}`,
      { schema: 'public', prefer: 'return=minimal' }
    );
    return true;
  } catch (e) {
    console.warn('[InvoicesAPI] removeCashLinesByFicheNoPostgrest:', e);
    return false;
  }
}

/** Fiş no ile kasa satırını bul (WHERE yalnızca fiche_no — tablo adı zaten firma+dönem ile ayrılmış), bakiyeyi geri al, satırı sil */
async function removeCashRegisterLinesForSaleFiche(
  ficheNo: string,
  primaryOpts: { firmNr: string; periodNr: string }
): Promise<void> {
  const trimmed = String(ficheNo || '').trim();
  if (!trimmed) return;

  const attempts: { firmNr: string; periodNr: string }[] = [
    primaryOpts,
    buildCashLinePgOpts(ERP_SETTINGS.firmNr, ERP_SETTINGS.periodNr),
  ];
  const seen = new Set<string>();
  for (const opt of attempts) {
    const key = `${opt.firmNr}|${opt.periodNr}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const cleared = await removeCashLinesByFicheNoPostgrest(trimmed, opt);
      if (cleared) return;
      continue;
    }

    const { rows: cashRows } = await postgres.query(
      `SELECT id, register_id, amount, sign FROM cash_lines WHERE fiche_no::text = $1::text`,
      [trimmed],
      { firmNr: opt.firmNr, periodNr: opt.periodNr }
    );
    if (!cashRows?.length) continue;

    for (const line of cashRows) {
      const regId = line.register_id;
      const amt = parseFloat(String(line.amount ?? 0)) || 0;
      const sgn = parseInt(String(line.sign ?? 1), 10) || 1;
      const delta = amt * sgn;
      if (regId && delta !== 0 && !Number.isNaN(delta)) {
        await postgres.query(
          `UPDATE cash_registers SET balance = COALESCE(balance, 0)::numeric - $1::numeric WHERE id = $2::uuid`,
          [String(delta), regId],
          { firmNr: opt.firmNr }
        );
      }
    }
    await postgres.query(`DELETE FROM cash_lines WHERE fiche_no::text = $1::text`, [trimmed], {
      firmNr: opt.firmNr,
      periodNr: opt.periodNr,
    });
    return;
  }
}

/**
 * Firma kodu: önce faturadan gelen değer (seçili firma), yoksa oturumdaki ERP_SETTINGS.
 * `v ?? ERP_SETTINGS` zincirinde `''` atlanmazdı → yanlışlıkla boş string ile '001'e düşmez;
 * firma değişince fatura `firma_id` güncellenmediyse en azından aktif oturum firması kullanılır.
 */
function normalizeFirmNrForRow(v: string | number | undefined | null): string {
  const fromInvoice = isNonEmptyScalar(v) ? String(v).trim() : '';
  const fromSession = String(ERP_SETTINGS.firmNr ?? '').trim();
  const raw = fromInvoice || fromSession;
  if (!raw) {
    console.warn(
      '[InvoicesAPI] Firma numarası yok: fatura firma_id ve ERP_SETTINGS.firmNr boş. rex_* eşleşmesi için 001 kullanılıyor — config kontrol edin.'
    );
    return '001';
  }
  return raw.padStart(3, '0').slice(0, 10);
}

function normalizePeriodNrForRow(v: string | number | undefined | null): string {
  const fromInvoice = isNonEmptyScalar(v) ? String(v).trim() : '';
  const fromSession = String(ERP_SETTINGS.periodNr ?? '').trim();
  const raw = fromInvoice || fromSession;
  if (!raw) {
    console.warn(
      '[InvoicesAPI] Dönem numarası yok: fatura donem_id ve ERP_SETTINGS.periodNr boş. 01 kullanılıyor.'
    );
    return '01';
  }
  return raw.padStart(2, '0').slice(0, 10);
}

/** Logo trcode grupları — getPaginated SQL ile birebir; liste ekranı istemci filtresi burayı kullanmalı (INVOICE_TYPES ile değil). */
export const TRCODES_BY_INVOICE_CATEGORY: Record<string, readonly number[]> = {
  Alis: [1, 4, 5, 6, 13, 26, 41, 42],
  Satis: [7, 8, 9, 14, 29, 30, 31, 32],
  Iade: [2, 3, 6],
  Irsaliye: [10, 11, 12, 13, 25],
  Siparis: [20, 21],
  Teklif: [30, 31],
  Hizmet: [4, 9, 21, 24]
};

function normalizeInvoiceCategoryKey(invoiceCategory?: string): string | undefined {
  const raw = String(invoiceCategory || '').trim();
  if (!raw) return undefined;
  const key = raw.toLocaleLowerCase('tr');
  if (['alis', 'alış', 'purchase', 'purchases', 'buy'].includes(key)) return 'Alis';
  if (['satis', 'satış', 'sales', 'sale'].includes(key)) return 'Satis';
  if (['iade', 'return', 'returns'].includes(key)) return 'Iade';
  if (['irsaliye', 'waybill', 'dispatch'].includes(key)) return 'Irsaliye';
  if (['siparis', 'sipariş', 'order', 'orders'].includes(key)) return 'Siparis';
  if (['teklif', 'quote', 'quotation'].includes(key)) return 'Teklif';
  if (['hizmet', 'service', 'services'].includes(key)) return 'Hizmet';
  return raw;
}

function defaultFicheTypeByCategory(invoiceCategory?: string): string | null {
  switch (invoiceCategory) {
    case 'Alis':
      return 'purchase_invoice';
    case 'Satis':
      return 'sales_invoice';
    case 'Iade':
      return 'return_invoice';
    case 'Irsaliye':
      return 'waybill';
    case 'Siparis':
      return 'order';
    case 'Teklif':
      return 'quote';
    case 'Hizmet':
      // Hizmet satırları farklı trcode varyantlarıyla gelebiliyor; en yaygın başlık sales_invoice.
      return 'sales_invoice';
    default:
      return null;
  }
}

function legacyFicheTypesByCategory(invoiceCategory?: string): string[] {
  switch (invoiceCategory) {
    case 'Alis':
      return ['purchase_invoice', 'A'];
    case 'Satis':
      return ['sales_invoice', 'S'];
    case 'Iade':
      return ['return_invoice', 'I'];
    default: {
      const fallback = defaultFicheTypeByCategory(invoiceCategory);
      return fallback ? [fallback] : [];
    }
  }
}

function legacyFicheTypesByInvoiceType(invoiceType?: number | null): string[] {
  switch (Number(invoiceType || 0)) {
    case 1:
      return ['purchase_invoice', 'A'];
    case 8:
      return ['sales_invoice', 'S'];
    case 3:
      return ['return_invoice', 'I'];
    default:
      return [];
  }
}

/** Birden fazla modül kategorisi için trcode / fiche_type birleşimi (liste API filtresi). */
function trcodeAndFicheTypesForCategories(categories: string[]): {
  trcodes: number[];
  ficheTypes: string[];
  includesAlis: boolean;
} {
  const trcodeSet = new Set<number>();
  const ficheSet = new Set<string>();
  let includesAlis = false;
  for (const raw of categories) {
    const key = normalizeInvoiceCategoryKey(raw);
    if (!key) continue;
    if (key === 'Alis') includesAlis = true;
    for (const tc of TRCODES_BY_INVOICE_CATEGORY[key] || []) trcodeSet.add(tc);
    for (const ft of legacyFicheTypesByCategory(key)) ficheSet.add(ft);
  }
  return { trcodes: [...trcodeSet], ficheTypes: [...ficheSet], includesAlis };
}

function deriveFicheTypeFromTrcode(trcode: number): string {
  if ([1, 4, 5, 6, 13, 26, 41, 42].includes(trcode)) return 'purchase_invoice';
  if ([7, 8, 9, 14, 29, 30, 31, 32].includes(trcode)) return 'sales_invoice';
  if ([2, 3].includes(trcode)) return 'return_invoice';
  if ([10, 11, 12, 13, 25].includes(trcode)) return 'waybill';
  if ([20, 21].includes(trcode)) return 'order';
  if ([30, 31].includes(trcode)) return 'quote';
  return 'sales_invoice';
}

function resolveTrcodeFromInvoice(inv: Invoice): number {
  const tr = (inv as Invoice & { trcode?: number }).trcode;
  const t = Number(inv.invoice_type ?? tr ?? 0);
  if (t) return t;
  switch (inv.invoice_category) {
    case 'Alis':
      return 1;
    case 'Satis':
      return 8;
    case 'Iade':
      return 3;
    default:
      return 8;
  }
}

/** Alış faturasında tedarikçi borcuna yazılacak tutar — promosyon/indirim satırları hariç */
export function computeInvoiceSupplierPayableAmount(inv: Invoice): number {
  if (inv.invoice_category !== 'Alis') return Number(inv.total_amount || 0);
  if (inv.items?.length) {
    return inv.items.reduce((sum, item) => sum + invoiceLinePayableNetAmount(item as any), 0);
  }
  return Number(inv.total_amount || 0);
}

function invoiceItemAffectsStock(item: Record<string, unknown>, category: string | undefined): boolean {
  return isInvoiceStockLineType(String(item.type ?? ''), category);
}

/** Ürün UUID → stok değişimi (oluşturma ile aynı kurallar) */
async function collectInvoiceStockDeltasByProduct(inv: Invoice, trcode: number): Promise<Map<string, number>> {
  const category = inv.invoice_category;
  const deltas = new Map<string, number>();
  if (!inv.items?.length || !category) return deltas;

  for (const item of inv.items) {
    if (!invoiceItemAffectsStock(item as Record<string, unknown>, category)) continue;
    const productId = item.code || item.productId;
    if (!productId) continue;
    const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
    const stockModifier = invoiceLineStockDelta(category, Number(trcode), baseQty);
    if (stockModifier === 0) continue;

    const prod = await resolveProductForStockLine(String(productId).trim());
    if (!prod) continue;
    deltas.set(prod.id, (deltas.get(prod.id) || 0) + stockModifier);
  }
  return deltas;
}

async function applyProductStockDeltaMap(
  deltas: Map<string, number>,
  queryOpts?: { firmNr: string; periodNr: string }
): Promise<void> {
  if (deltas.size === 0) return;
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await Promise.all(
      [...deltas.entries()].map(async ([id, delta]) => {
        if (!delta) return;
        const p = await productAPI.getById(id);
        if (!p) return;
        await productAPI.updateStock(id, Number(p.stock ?? 0) + delta);
      })
    );
  } else {
    await Promise.all(
      [...deltas.entries()].map(async ([id, delta]) => {
        if (!delta) return;
        await postgres.query(
          `UPDATE products SET stock = COALESCE(stock::numeric, 0) + $1::numeric WHERE id = $2::uuid`,
          [delta, id],
          queryOpts
        );
      })
    );
  }
}

/** `mult=1` oluşturma etkisi; `mult=-1` geri alma (fatura güncellemede eski kayıt) */
async function applyInvoiceBalanceSideEffectsSql(
  inv: Invoice,
  firmNr: string,
  queryOpts: { firmNr: string; periodNr: string },
  mult: 1 | -1 = 1
): Promise<void> {
  const accountId = inv.customer_id || inv.supplier_id;
  const salePm = (inv as any).payment_method as string | undefined;
  if (!accountId || !isValidUuid(String(accountId))) return;
  const baseAmt =
    inv.invoice_category === 'Alis' ? computeInvoiceSupplierPayableAmount(inv) : Number(inv.total_amount || 0);
  if (!baseAmt || Number.isNaN(baseAmt)) return;
  const amount = baseAmt * mult;
  const trcode = resolveTrcodeFromInvoice(inv);
  const ficheType = deriveFicheTypeFromTrcode(trcode);

  if (
    (inv.invoice_category === 'Satis' || inv.invoice_category === 'Hizmet')
    && paymentMethodImpliesCustomerDebt(salePm)
  ) {
    await postgres
      .query(
        `UPDATE customers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
        [amount, accountId, firmNr],
        queryOpts
      )
      .catch(() => {});
  } else if (inv.invoice_category === 'Alis' && paymentMethodImpliesSupplierDebt(salePm)) {
    await postgres
      .query(`UPDATE suppliers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid`, [amount, accountId], queryOpts)
      .catch(() => {});
  } else if (inv.invoice_category === 'Iade') {
    if (trcode === 3 || ficheType === 'return_invoice') {
      const { rowCount } = await postgres
        .query(
          `UPDATE customers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
          [amount, accountId, firmNr],
          queryOpts
        )
        .catch(() => ({ rowCount: 0 }));
      if (!rowCount) {
        await postgres
          .query(
            `UPDATE suppliers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid`,
            [amount, accountId],
            queryOpts
          )
          .catch(() => {});
      }
    }
  }
}

async function revertInvoiceBalanceUpdatesRestApi(inv: Invoice, firmNr: string): Promise<void> {
  const accountId = inv.customer_id || inv.supplier_id;
  if (!accountId || !isValidUuid(String(accountId))) return;
  const amt =
    inv.invoice_category === 'Alis' ? computeInvoiceSupplierPayableAmount(inv) : Number(inv.total_amount || 0);
  if (!amt || Number.isNaN(amt)) return;
  const trcode = resolveTrcodeFromInvoice(inv);
  const ficheType = deriveFicheTypeFromTrcode(trcode);
  const salePm = (inv as any).payment_method as string | undefined;

  if ((inv.invoice_category === 'Satis' || inv.invoice_category === 'Hizmet') && paymentMethodImpliesCustomerDebt(salePm)) {
    await customerAPI.addBalance(accountId, -amt);
    return;
  }
  if (inv.invoice_category === 'Alis' && paymentMethodImpliesSupplierDebt(salePm)) {
    await adjustSupplierBalanceDeltaPostgrest(accountId, -amt, firmNr);
    return;
  }
  if (inv.invoice_category === 'Iade') {
    if (trcode === 3 || ficheType === 'return_invoice') {
      const ok = await customerAPI.addBalance(accountId, amt);
      if (!ok) await adjustSupplierBalanceDeltaPostgrest(accountId, amt, firmNr);
    }
  }
}

async function revertInvoiceLedgerSideEffects(existing: Invoice, firmNr: string, periodNr: string): Promise<void> {
  const trcode = resolveTrcodeFromInvoice(existing);
  const deltas = await collectInvoiceStockDeltasByProduct(existing, trcode);
  const neg = new Map<string, number>();
  deltas.forEach((v, k) => neg.set(k, -v));
  await applyProductStockDeltaMap(neg, { firmNr, periodNr });

  const queryOpts = { firmNr, periodNr };
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await revertInvoiceBalanceUpdatesRestApi(existing, firmNr);
  } else {
    await applyInvoiceBalanceSideEffectsSql(existing, firmNr, queryOpts, -1);
  }

  const cashOpts = buildCashLinePgOpts(firmNr, periodNr);
  const ficheNo = String(existing.invoice_no || '').trim();
  if (ficheNo) {
    await removeCashRegisterLinesForSaleFiche(ficheNo, cashOpts);
  }
}

async function applyInvoiceLedgerSideEffects(merged: Invoice, firmNr: string, periodNr: string): Promise<void> {
  const trcode = resolveTrcodeFromInvoice(merged);
  const ficheType = deriveFicheTypeFromTrcode(trcode);
  const deltas = await collectInvoiceStockDeltasByProduct(merged, trcode);
  await applyProductStockDeltaMap(deltas, { firmNr, periodNr });

  const queryOpts = { firmNr, periodNr };
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await applyInvoiceBalanceUpdatesRestApi(merged, firmNr, trcode, ficheType);
  } else {
    await applyInvoiceBalanceSideEffectsSql(merged, firmNr, queryOpts, 1);
  }

  if (
    merged.invoice_category === 'Satis'
    && paymentMethodImpliesCashInKasa((merged as any).payment_method)
    && Number(merged.total_amount || 0) !== 0
    && String(merged.status || '').toLowerCase() !== 'cancelled'
  ) {
    try {
      const { fetchKasalar, createKasaIslemi } = await import('./kasa');
      let targetKasaId = (ERP_SETTINGS as any).selected_cash_registers?.[0] as string | undefined;
      if (!targetKasaId) {
        const kasalar = await fetchKasalar({ firm_nr: String(firmNr), aktif: true });
        if (kasalar.length > 0) targetKasaId = kasalar[0].id;
      }
      if (targetKasaId) {
        const total = Number(merged.total_amount || 0);
        await createKasaIslemi({
          firma_id: String(firmNr),
          kasa_id: targetKasaId,
          islem_no: String(merged.invoice_no || '').trim() || `INV-${String(merged.id || '').slice(0, 8)}`,
          islem_tarihi: merged.invoice_date || merged.created_at || new Date().toISOString(),
          islem_tipi: 'KASA_GIRIS',
          tutar: total,
          islem_aciklamasi: `Satış faturası — ${merged.invoice_no || ''}`,
          cari_hesap_id: merged.customer_id && isValidUuid(merged.customer_id) ? merged.customer_id : undefined,
          cari_hesap_unvani: merged.customer_name || '',
          doviz_kodu: 'YEREL',
          dovizli_tutar: 0,
        });
      }
    } catch (e: any) {
      console.warn('[InvoicesAPI] Kasa satırı (fatura güncelleme):', e?.message || String(e));
    }
  }
}

function shouldTryRestApiCreateFallback(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('connection terminated due to connection timeout') ||
    msg.includes('database query failed') ||
    msg.includes('timeout') ||
    msg.includes('bad gateway')
  );
}

async function createInvoiceViaPostgrest(invoice: Invoice, opts: {
  firmNr: string;
  periodNr: string;
  trcode: number;
  ficheType: string;
}): Promise<Invoice | null> {
  const { postgrest } = await import('./postgrestClient');
  const salesTable = `/rex_${String(opts.firmNr).padStart(3, '0')}_${String(opts.periodNr).padStart(2, '0')}_sales`;
  const itemsTable = `/rex_${String(opts.firmNr).padStart(3, '0')}_${String(opts.periodNr).padStart(2, '0')}_sale_items`;
  const invoiceId = self.crypto.randomUUID();

  const customerId = isValidUuid(invoice.customer_id)
    ? invoice.customer_id
    : isValidUuid(invoice.supplier_id)
      ? invoice.supplier_id
      : null;

  const enhancedPayload: Record<string, unknown> = {
    id: invoiceId,
    firm_nr: String(opts.firmNr),
    period_nr: String(opts.periodNr),
    fiche_no: String(invoice.invoice_no),
    date: invoice.created_at || new Date().toISOString(),
    fiche_type: opts.ficheType,
    trcode: Number(opts.trcode),
    customer_id: customerId,
    customer_name: String(invoice.customer_name || invoice.supplier_name || ''),
    total_net: Number(invoice.subtotal || 0),
    total_vat: Number(invoice.tax || 0),
    total_discount: Number(invoice.discount || 0),
    net_amount: Number(invoice.total_amount || 0),
    total_cost: Number(invoice.total_cost || 0),
    gross_profit: Number(invoice.gross_profit || 0),
    profit_margin: Number(invoice.profit_margin || 0),
    currency: String(invoice.currency || 'IQD'),
    currency_rate: Number(invoice.currency_rate || 1),
    status: 'approved',
    notes: String(invoice.notes || ''),
    document_no: String((invoice as any).document_no || invoice.invoice_no || ''),
    payment_method: String((invoice as any).payment_method || 'Nakit'),
    cashier: String((invoice as any).cashier || ''),
    store_id: isValidUuid((invoice as any).store_id) ? (invoice as any).store_id : null,
    created_by_user_id: isValidUuid((invoice as any).created_by_user_id) ? (invoice as any).created_by_user_id : null,
    header_fields: (invoice as any).header_fields ?? {},
  };

  const legacyPayload: Record<string, unknown> = {
    id: invoiceId,
    firm_nr: String(opts.firmNr),
    period_nr: String(opts.periodNr),
    fiche_no: String(invoice.invoice_no),
    date: invoice.created_at || new Date().toISOString(),
    fiche_type: opts.ficheType,
    trcode: Number(opts.trcode),
    customer_id: customerId,
    customer_name: String(invoice.customer_name || invoice.supplier_name || ''),
    total_net: Number(invoice.subtotal || 0),
    total_vat: Number(invoice.tax || 0),
    total_discount: Number(invoice.discount || 0),
    net_amount: Number(invoice.total_amount || 0),
    total_cost: Number(invoice.total_cost || 0),
    gross_profit: Number(invoice.gross_profit || 0),
    profit_margin: Number(invoice.profit_margin || 0),
    currency: String(invoice.currency || 'IQD'),
    currency_rate: Number(invoice.currency_rate || 1),
    status: 'approved',
    notes: String(invoice.notes || ''),
  };

  try {
    await postgrest.post<any>(salesTable, enhancedPayload, { schema: 'public' });
  } catch {
    await postgrest.post<any>(salesTable, legacyPayload, { schema: 'public' });
  }

  if (invoice.items?.length) {
    const itemEnhancedList = invoice.items.map((item) => {
      const unitMultiplier = Number((item as any).multiplier || 1);
      const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
      const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
      const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');
      const productUuid = resolveSaleItemProductUuid(item as { productId?: unknown; code?: unknown });
      return {
        id: self.crypto.randomUUID(),
        invoice_id: invoiceId,
        firm_nr: String(opts.firmNr),
        period_nr: String(opts.periodNr),
        product_id: productUuid,
        item_code: String(item.code || item.productId || ''),
        item_name: String(item.description || item.productName || ''),
        quantity: Number(item.quantity || 0),
        unit: String((item as any).unit || 'Adet'),
        unit_price: Number(item.unitPrice || item.price || 0),
        discount_rate: Number(item.discount || 0),
        vat_rate: Number((item as any).taxRate || (item as any).vat_rate || 0),
        total_amount: Number(item.total || item.netAmount || 0),
        net_amount: Number(item.netAmount || item.total || 0),
        unit_cost: Number(item.unitCost || 0),
        total_cost: Number(item.totalCost || 0),
        gross_profit: Number(item.grossProfit || 0),
        unit_multiplier: unitMultiplier,
        base_quantity: baseQty,
        unit_price_fc: unitPriceFC,
        currency: itemCurrency,
        expiry_date: invoiceLineDateOrNull((item as any).expiryDate),
        batch_no: String((item as any).batchNo || '').trim() || null,
        item_type: invoiceLineTypeToDb((item as any).type),
      };
    });
    const itemLegacyList = invoice.items.map((item) => {
      const productUuid = resolveSaleItemProductUuid(item as { productId?: unknown; code?: unknown });
      return {
        id: self.crypto.randomUUID(),
        invoice_id: invoiceId,
        firm_nr: String(opts.firmNr),
        period_nr: String(opts.periodNr),
        product_id: productUuid,
        item_code: String(item.code || item.productId || ''),
        item_name: String(item.description || item.productName || ''),
        quantity: Number(item.quantity || 0),
        unit: String((item as any).unit || 'Adet'),
        unit_price: Number(item.unitPrice || item.price || 0),
        discount_rate: Number(item.discount || 0),
        vat_rate: Number((item as any).taxRate || (item as any).vat_rate || 0),
        total_amount: Number(item.total || item.netAmount || 0),
        net_amount: Number(item.netAmount || item.total || 0),
        // SKT/parti — enhanced INSERT düşerse legacy yolda da kaybolmasın
        expiry_date: invoiceLineDateOrNull((item as any).expiryDate),
        batch_no: String((item as any).batchNo || '').trim() || null,
      };
    });
    try {
      await postgrest.post<any>(itemsTable, itemEnhancedList, { schema: 'public', prefer: 'return=minimal' });
    } catch {
      try {
        await postgrest.post<any>(itemsTable, itemLegacyList, { schema: 'public', prefer: 'return=minimal' });
      } catch {
        for (let i = 0; i < invoice.items!.length; i++) {
          try {
            await postgrest.post<any>(itemsTable, itemEnhancedList[i]!, { schema: 'public', prefer: 'return=minimal' });
          } catch {
            await postgrest.post<any>(itemsTable, itemLegacyList[i]!, { schema: 'public', prefer: 'return=minimal' });
          }
        }
      }
    }
  }

  return {
    ...invoice,
    id: invoiceId,
    created_at: new Date().toISOString(),
  };
}

async function resolveProductForStockLine(pidStr: string): Promise<{ id: string; stock?: number } | null> {
  const s = String(pidStr || '').trim();
  if (!s) return null;
  if (isValidUuid(s)) {
    const p = await productAPI.getById(s);
    if (p) return p;
  }
  const byCode = await productAPI.getByCode(s);
  if (byCode) return byCode;
  const lu = await productAPI.lookupByBarcode(s);
  return lu?.product || null;
}

/** `rest_api`: SQL INSERT yok; stok ürün API (PostgREST patch) ile güncellenir */
async function applyInvoiceStockUpdatesRestApi(
  invoice: Invoice,
  createOptions: { skipProductStockUpdate?: boolean } | undefined,
  trcodeResolved: number
): Promise<void> {
  if (createOptions?.skipProductStockUpdate || !invoice.items?.length) return;
  const category = invoice.invoice_category;
  const trcode = Number(trcodeResolved || invoice.invoice_type || 0);
  const deltas = new Map<string, number>();

  for (const item of invoice.items) {
    if (!invoiceItemAffectsStock(item as Record<string, unknown>, category)) continue;
    const productId = item.code || item.productId;
    if (!productId) continue;
    const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
    const stockModifier = invoiceLineStockDelta(category, trcode, baseQty);
    if (stockModifier === 0) continue;

    const prod = await resolveProductForStockLine(String(productId).trim());
    if (!prod) continue;
    deltas.set(prod.id, (deltas.get(prod.id) || 0) + stockModifier);
  }

  await Promise.all(
    [...deltas.entries()].map(async ([id, delta]) => {
      const p = await productAPI.getById(id);
      if (!p) return;
      const next = Number(p.stock ?? 0) + delta;
      await productAPI.updateStock(id, next);
    })
  );
}

async function adjustSupplierBalanceDeltaPostgrest(supplierId: string, delta: number, firmNr: string): Promise<void> {
  if (!delta || !isValidUuid(supplierId)) return;
  try {
    const { postgrest } = await import('./postgrestClient');
    const fn = String(firmNr).padStart(3, '0');
    const table = `/rex_${fn}_suppliers`;
    const cur = await postgrest.get<any[]>(
      table,
      {
        select: 'balance',
        id: `eq.${supplierId}`,
        firm_nr: `eq.${String(firmNr).padStart(3, '0')}`,
        limit: 1,
      },
      { schema: 'public' }
    );
    const row = Array.isArray(cur) ? cur[0] : null;
    if (!row) return;
    const next = Number(row.balance ?? 0) + delta;
    await postgrest.patch(
      `${table}?id=eq.${encodeURIComponent(supplierId)}&firm_nr=eq.${encodeURIComponent(String(firmNr).padStart(3, '0'))}`,
      { balance: next },
      { schema: 'public', prefer: 'return=minimal' }
    );
  } catch (e) {
    console.warn('[InvoicesAPI] adjustSupplierBalanceDeltaPostgrest:', e);
  }
}

/** `rest_api`: cari borç/alacak — müşteri `customerAPI`, tedarikçi PostgREST patch */
async function applyInvoiceBalanceUpdatesRestApi(
  invoice: Invoice,
  firmNr: string,
  trcode: number,
  ficheType: string
): Promise<void> {
  const accountId = invoice.customer_id || invoice.supplier_id;
  const salePm = (invoice as any).payment_method as string | undefined;
  if (!accountId || !isValidUuid(accountId)) return;
  const amount =
    invoice.invoice_category === 'Alis'
      ? computeInvoiceSupplierPayableAmount(invoice)
      : Number(invoice.total_amount || 0);

  if (
    (invoice.invoice_category === 'Satis' || invoice.invoice_category === 'Hizmet')
    && paymentMethodImpliesCustomerDebt(salePm)
  ) {
    await customerAPI.addBalance(accountId, amount);
    return;
  }
  if (invoice.invoice_category === 'Alis' && paymentMethodImpliesSupplierDebt(salePm)) {
    await adjustSupplierBalanceDeltaPostgrest(accountId, amount, firmNr);
    return;
  }
  if (invoice.invoice_category === 'Iade') {
    if (trcode === 3 || ficheType === 'return_invoice') {
      const ok = await customerAPI.addBalance(accountId, -amount);
      if (!ok) await adjustSupplierBalanceDeltaPostgrest(accountId, -amount, firmNr);
    }
  }
}

/** Modül kategorisi (Alis/Satis/…) ile satırın uyumu — önce Logo trcode grubu, sonra invoice_category */
export function invoiceMatchesModuleCategory(
  inv: { invoice_category?: string; invoice_type?: number; trcode?: number; fiche_type?: string },
  moduleCategory: string
): boolean {
  if (!moduleCategory) return true;
  const tc = Number(inv.invoice_type ?? inv.trcode ?? 0);
  const moduleCodes = TRCODES_BY_INVOICE_CATEGORY[moduleCategory];
  if (tc > 0 && moduleCodes?.includes(tc)) return true;

  if (inv.invoice_category) {
    if (inv.invoice_category === moduleCategory) return true;
    // Hizmet / İade ekranları: trcode öncelikli (4,9 → Hizmet; 6 → İade) — yanlış infer edilmiş kategori
    if (moduleCategory === 'Hizmet' && inv.invoice_category !== 'Hizmet') {
      return [4, 9, 21, 24].includes(tc);
    }
    if (moduleCategory === 'Iade' && inv.invoice_category !== 'Iade') {
      return [2, 3, 6].includes(tc);
    }
    return false;
  }

  if (moduleCodes?.includes(tc)) return true;
  const ft = String(inv.fiche_type ?? '').trim();
  return legacyFicheTypesByCategory(moduleCategory).includes(ft);
}

/** sale_items satırını UniversalInvoiceForm / grid satır modeline çevirir (SQL ve PostgREST ortak) */
export function mapSaleItemRowToInvoiceLine(item: any, inv: Invoice) {
  const codeRaw = item.item_code ?? item.product_id;
  const code = codeRaw != null && codeRaw !== '' ? String(codeRaw) : '';
  const hdrCur = String(inv.currency || 'IQD').trim().toUpperCase();
  const rowCur = String(item.currency || hdrCur || 'IQD').trim().toUpperCase();
  const rate = Number(inv.currency_rate) > 0 ? Number(inv.currency_rate) : 1;
  const uFCraw = item.unit_price_fc;
  const uFC =
    uFCraw != null && uFCraw !== '' && !Number.isNaN(parseFloat(String(uFCraw)))
      ? parseFloat(String(uFCraw))
      : NaN;
  const uLoc = parseFloat(item.unit_price || 0);
  const grossIQD = parseFloat(item.total_amount || 0);
  const netIQD = parseFloat(item.net_amount || 0);
  const useFc =
    Number.isFinite(uFC) && rowCur !== 'IQD' && !(uFC === 0 && uLoc > 0);
  const unitPrice = useFc ? uFC : uLoc;
  const netAmount = useFc ? netIQD / rate : netIQD;
  const total = useFc ? grossIQD / rate : grossIQD;
  const unit = item.unit || 'Adet';
  const multiplier = parseFloat(item.unit_multiplier || 1);
  const hydrated = hydrateWeightLineFromDb({
    quantity: parseFloat(item.quantity),
    baseQuantity: parseFloat(item.base_quantity ?? item.quantity),
    unit,
    multiplier,
  });
  return {
    id: item.id,
    productId: item.product_id != null ? String(item.product_id) : code,
    code,
    description: item.item_name || '',
    productName: item.item_name || '',
    quantity: hydrated.quantity,
    unit,
    unitPrice,
    price: unitPrice,
    discount: parseFloat(item.discount_rate || 0),
    tax: 0,
    netAmount,
    total,
    unitCost: parseFloat(item.unit_cost || 0),
    totalCost: parseFloat(item.total_cost || 0),
    grossProfit: parseFloat(item.gross_profit || 0),
    multiplier,
    baseQuantity: hydrated.baseQuantity,
    unitPriceFC: Number.isFinite(uFC) ? uFC : uLoc,
    currency: item.currency || inv.currency || 'IQD',
    expiryDate: invoiceLineDateOrNull(item.expiry_date),
    batchNo: item.batch_no || undefined,
    type: canonicalInvoiceLineType(item.item_type ?? item.type),
  };
}

export const invoicesAPI = {
  /**
   * Create new invoice
   * @param createOptions.skipProductStockUpdate — true ise satır kaydı yapılır ama ürün stoku güncellenmez (ör. sayım sonrası yalnızca belge/maliyet kaydı).
   */
  async create(invoice: Invoice, createOptions?: { skipProductStockUpdate?: boolean }): Promise<Invoice | null> {
    try {
      if (import.meta.env.DEV) {
        console.log('[InvoicesAPI] Creating invoice via Dynamic Public Tables...', invoice.invoice_no);
      }

      // Firma/dönem: fatura logicalref "1" iken ürünler firm_nr "001" — stok UPDATE eşleşmesi için normalize et
      const firmNr = normalizeFirmNrForRow((invoice as any).firma_id ?? ERP_SETTINGS.firmNr);
      const periodNr = normalizePeriodNrForRow((invoice as any).donem_id ?? ERP_SETTINGS.periodNr);

      const queryOptions = { firmNr, periodNr };

      // Map Invoice Category to TRCODE and Fiche Type based on Logo standards
      let trcode = Number(invoice.invoice_type || 0);
      let ficheType = 'sales_invoice';

      if (trcode === 0) {
        switch (invoice.invoice_category) {
          case 'Alis': trcode = 1; ficheType = 'purchase_invoice'; break;
          case 'Satis': trcode = 8; ficheType = 'sales_invoice'; break;
          case 'Iade': trcode = 3; ficheType = 'return_invoice'; break;
          case 'Irsaliye': trcode = 8; ficheType = 'waybill'; break;
          case 'Siparis': trcode = 1; ficheType = 'order'; break;
          case 'Hizmet': trcode = 9; ficheType = 'sales_invoice'; break;
          default: trcode = 8; ficheType = 'sales_invoice';
        }
      } else {
        // Infer ficheType from trcode (Logo standards)
        if ([1, 4, 5, 6, 13, 26, 41, 42].includes(trcode)) ficheType = 'purchase_invoice';
        else if ([7, 8, 9, 14, 29, 30, 31, 32].includes(trcode)) ficheType = 'sales_invoice';
        else if ([2, 3].includes(trcode)) ficheType = 'return_invoice';
        // Waybills (Irsaliye)
        else if ([10, 11, 12, 13, 25].includes(trcode)) ficheType = 'waybill';
        // Orders (Siparis)
        else if ([20, 21].includes(trcode)) ficheType = 'order';
        // Quotes (Teklif)
        else if ([30, 31].includes(trcode)) ficheType = 'quote';
      }

      // PostgREST-only: fatura ve yan etkiler doğrudan HTTP (SQL köprüsü yok / kullanılmıyor)
      if (
        DB_SETTINGS.connectionProvider === 'rest_api' &&
        !(IS_TAURI && DB_SETTINGS.activeMode === 'hybrid')
      ) {
        const saved = await createInvoiceViaPostgrest(invoice, { firmNr, periodNr, trcode, ficheType });
        if (!saved?.id) throw new Error('Fatura PostgREST ile oluşturulamadı');
        await applyInvoiceStockUpdatesRestApi(invoice, createOptions, trcode);
        await applyInvoiceBalanceUpdatesRestApi(invoice, firmNr, trcode, ficheType);
        void import('../messaging/messagingService').then(({ messagingService }) =>
          messagingService.maybeEnqueueInvoiceNotification(invoice, saved.id!, firmNr, periodNr)
        ).catch((e) => console.warn('[InvoicesAPI] WhatsApp kuyruk:', e));
        return saved;
      }

      // 1. Insert invoice header
      let rows;
      const newId = self.crypto.randomUUID();

      // 1a. Try Enhanced Schema (with store_id etc)
      const tEnh = import.meta.env.DEV ? '[InvoicesAPI] Enhanced_Insert' : '';
      if (import.meta.env.DEV) console.time(tEnh);
      try {
        const result = await postgres.query(
          `INSERT INTO sales (
              id,
              firm_nr, period_nr, fiche_no, date, fiche_type, trcode,
              customer_id, customer_name, total_net, total_vat, total_discount, net_amount, 
              total_cost, gross_profit, profit_margin, currency, currency_rate,
              status, notes, document_no,
              payment_method, cashier, store_id, created_by_user_id
          ) VALUES ($1::text::uuid, $2::text, $3::text, $4::text, $5::text::timestamptz, $6::text, $7::text::int, $8::text::uuid, $9::text, $10::text::numeric, $11::text::numeric, $12::text::numeric, $13::text::numeric, $14::text::numeric, $15::text::numeric, $16::text::numeric, $17::text, $18::text::numeric, $19::text, $20::text, $21::text, $22::text, $23::text, $24::text::uuid, $25::text::uuid) RETURNING id`,
          [
            newId,
            String(firmNr),
            String(periodNr),
            String(invoice.invoice_no),
            invoice.created_at || new Date(),
            ficheType,
            Number(trcode),
            // customer_id yoksa supplier_id'yi kullan (alış faturalarında tedarikçi UUID buraya yazılır)
            isValidUuid(invoice.customer_id) ? invoice.customer_id
              : isValidUuid(invoice.supplier_id) ? invoice.supplier_id : null,
            String(invoice.customer_name || invoice.supplier_name || ''),
            Number(invoice.subtotal || 0),
            Number(invoice.tax || 0),
            Number(invoice.discount || 0),
            Number(invoice.total_amount || 0),
            Number(invoice.total_cost || 0),
            Number(invoice.gross_profit || 0),
            Number(invoice.profit_margin || 0),
            String(invoice.currency || 'IQD'),
            Number(invoice.currency_rate || 1),
            'approved',
            String(invoice.notes || ''),
            String((invoice as any).document_no || invoice.invoice_no || ''),
            String((invoice as any).payment_method || 'Nakit'),
            String((invoice as any).cashier || ''),
            isValidUuid((invoice as any).store_id) ? (invoice as any).store_id : null,
            isValidUuid((invoice as any).created_by_user_id) ? (invoice as any).created_by_user_id : null
          ],
          queryOptions
        );
        rows = result.rows;
      } catch (e) {
        console.warn('Enhanced insert threw error directly:', e);
        rows = [];
      }
      if (import.meta.env.DEV) console.timeEnd(tEnh);

      // Check if enhanced insert failed (empty rows mean failure in postgres.ts wrapper)
      // If rows is empty, it means the INSERT failed, likely due to schema mismatch or data error.
      if (!rows || rows.length === 0) {
        console.warn('[InvoicesAPI] Enhanced INSERT failed (swallowed error or 0 rows), trying legacy fallback...');

        // 1b. Fallback to Legacy Schema
        const tLeg = import.meta.env.DEV ? '[InvoicesAPI] Legacy_Insert' : '';
        if (import.meta.env.DEV) console.time(tLeg);
        const result = await postgres.query(
          `INSERT INTO sales (
              id,
              firm_nr, period_nr, fiche_no, date, fiche_type, trcode,
              customer_id, customer_name, total_net, total_vat, total_discount, net_amount, 
              total_cost, gross_profit, profit_margin, currency, currency_rate,
              status, notes
          ) VALUES ($1::text::uuid, $2::text, $3::text, $4::text, $5::text::timestamptz, $6::text, $7::text::int, $8::text::uuid, $9::text, $10::text::numeric, $11::text::numeric, $12::text::numeric, $13::text::numeric, $14::text::numeric, $15::text::numeric, $16::text::numeric, $17::text, $18::text::numeric, $19::text, $20::text) RETURNING id`,
          [
            newId,
            String(firmNr),
            String(periodNr),
            String(invoice.invoice_no),
            invoice.created_at || new Date(),
            ficheType,
            Number(trcode),
            isValidUuid(invoice.customer_id) ? invoice.customer_id
              : isValidUuid(invoice.supplier_id) ? invoice.supplier_id : null,
            String(invoice.customer_name || invoice.supplier_name || ''),
            Number(invoice.subtotal || 0),
            Number(invoice.tax || 0),
            Number(invoice.discount || 0),
            Number(invoice.total_amount || 0),
            Number(invoice.total_cost || 0),
            Number(invoice.gross_profit || 0),
            Number(invoice.profit_margin || 0),
            String(invoice.currency || 'IQD'),
            Number(invoice.currency_rate || 1),
            'approved',
            String(invoice.notes || '')
          ],
          queryOptions
        );
        rows = result.rows;
        if (import.meta.env.DEV) console.timeEnd(tLeg);
      }

      const invoiceId = rows[0]?.id;
      if (!invoiceId) throw new Error("Invoice creation failed");

      const cashierName = String((invoice as any).cashier || '').trim();
      if (cashierName) {
        await postgres.query(
          `UPDATE sales SET cashier = $1::text WHERE id = $2::text::uuid`,
          [cashierName, invoiceId],
          queryOptions,
        ).catch(() => { /* legacy şemada kolon yoksa yoksay */ });
      }

      // 2. Insert invoice items (tek INSERT) + 3. stok güncellemeleri paralel
      if (invoice.items && invoice.items.length > 0) {
        const COLS = 24;
        const rowTuples: string[] = [];
        const flatParams: unknown[] = [];

        const stockPromises: Promise<void>[] = [];

        for (let idx = 0; idx < invoice.items.length; idx++) {
          const item = invoice.items[idx]!;
          const productId = item.code || item.productId;
          const productUuid = resolveSaleItemProductUuid(item as { productId?: unknown; code?: unknown });
          const unitMultiplier = Number((item as any).multiplier || 1);
          const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
          const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
          const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');

          const base = idx * COLS;
          const ph = [
            `$${base + 1}::text::uuid`,
            `$${base + 2}::text::uuid`,
            `$${base + 3}::text`,
            `$${base + 4}::text`,
            `$${base + 5}::uuid`,
            `$${base + 6}::text`,
            `$${base + 7}::text`,
            `$${base + 8}::text::numeric`,
            `$${base + 9}::text`,
            `$${base + 10}::text::numeric`,
            `$${base + 11}::text::numeric`,
            `$${base + 12}::text::numeric`,
            `$${base + 13}::text::numeric`,
            `$${base + 14}::text::numeric`,
            `$${base + 15}::text::numeric`,
            `$${base + 16}::text::numeric`,
            `$${base + 17}::text::numeric`,
            `$${base + 18}::text::numeric`,
            `$${base + 19}::text::numeric`,
            `$${base + 20}::text::numeric`,
            `$${base + 21}::text`,
            `$${base + 22}::date`,
            `$${base + 23}::text`,
            `$${base + 24}::text`,
          ];
          rowTuples.push(`(${ph.join(', ')})`);

          flatParams.push(
            self.crypto.randomUUID(),
            invoiceId,
            String(firmNr),
            String(periodNr),
            productUuid,
            String(productId || ''),
            String(item.description || item.productName),
            Number(item.quantity),
            String((item as any).unit || 'Adet'),
            Number(item.unitPrice || item.price),
            Number(item.discount || 0),
            Number((item as any).taxRate || (item as any).vat_rate || 0),
            Number(item.total || item.netAmount),
            Number(item.netAmount || item.total),
            Number(item.unitCost || 0),
            Number(item.totalCost || 0),
            Number(item.grossProfit || 0),
            unitMultiplier,
            baseQty,
            unitPriceFC,
            itemCurrency,
            invoiceLineDateOrNull((item as any).expiryDate),
            String((item as any).batchNo || '').trim() || null,
            invoiceLineTypeToDb((item as any).type)
          );

          const isStockLine = isInvoiceStockLineType((item as any).type, invoice.invoice_category);
          if (productId && isStockLine) {
            const stockModifier = invoiceLineStockDelta(
              invoice.invoice_category,
              Number(trcode),
              baseQty
            );

            if (stockModifier !== 0 && !createOptions?.skipProductStockUpdate) {
              const pid = String(productId).trim();
              stockPromises.push(
                postgres
                  .query<{ id: string; code: string; stock: string }>(
                    `UPDATE products AS p
                 SET stock = COALESCE(p.stock::numeric, 0) + $1::numeric
                 FROM (
                   SELECT p2.id
                   FROM products p2
                   LEFT JOIN product_barcodes pb ON pb.product_id = p2.id
                   WHERE (
                     btrim(COALESCE(p2.code, '')) = btrim($2::text)
                     OR btrim(COALESCE(p2.barcode, '')) = btrim($2::text)
                     OR p2.id::text = btrim($2::text)
                     OR btrim(COALESCE(pb.barcode_code, '')) = btrim($2::text)
                   )
                   AND (
                     btrim(p2.firm_nr::text) = btrim($3::text)
                     OR (
                       btrim(p2.firm_nr::text) ~ '^[0-9]+$'
                       AND btrim($3::text) ~ '^[0-9]+$'
                       AND btrim(p2.firm_nr::text)::bigint = btrim($3::text)::bigint
                     )
                   )
                   LIMIT 1
                 ) AS sub
                 WHERE p.id = sub.id
                 RETURNING p.id, p.code, p.stock`,
                    [stockModifier, pid, firmNr],
                    queryOptions
                  )
                  .then((stkRes) => {
                    if (!stkRes.rows?.length) {
                      console.warn('[InvoicesAPI] Stok güncellenemedi — ürün veya firma eşleşmedi', {
                        item_code: pid,
                        firmNr,
                        stockModifier,
                        invoice_no: invoice.invoice_no,
                        category: invoice.invoice_category
                      });
                    }
                  })
              );
            }
          }
        }

        await postgres.query(
          `INSERT INTO sale_items (
                id,
                invoice_id, firm_nr, period_nr, product_id, item_code, item_name,
                quantity, unit, unit_price, discount_rate, vat_rate,
                total_amount, net_amount,
                unit_cost, total_cost, gross_profit,
                unit_multiplier, base_quantity, unit_price_fc, currency,
                expiry_date, batch_no, item_type
             ) VALUES ${rowTuples.join(', ')}`,
          flatParams,
          queryOptions
        );

        if (stockPromises.length > 0) {
          await Promise.all(stockPromises);
        }
      }

      // 4. Cari borç: yalnızca veresiye / açık hesap (nakit-kart satışta müşteri seçili olsa bile borç yazılmaz)
      const accountId = invoice.customer_id || invoice.supplier_id;
      const salePm = (invoice as any).payment_method as string | undefined;
      if (accountId && isValidUuid(accountId)) {
        const amount =
          invoice.invoice_category === 'Alis'
            ? computeInvoiceSupplierPayableAmount(invoice)
            : Number(invoice.total_amount || 0);

        if (
          (invoice.invoice_category === 'Satis' || invoice.invoice_category === 'Hizmet')
          && paymentMethodImpliesCustomerDebt(salePm)
        ) {
          // Veresiye satış: müşteri borcu artar
          await postgres.query(
            `UPDATE customers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
            [amount, accountId, firmNr],
            queryOptions
          ).catch(() => { }); // Müşteri bulunamazsa sessizce geç
        } else if (invoice.invoice_category === 'Alis' && paymentMethodImpliesSupplierDebt(salePm)) {
          // Alış: yalnızca açık hesap / veresiye — peşin alışta tedarikçi borcu yazılmaz
          await postgres.query(
            `UPDATE suppliers SET balance = COALESCE(balance, 0) + $1::numeric WHERE id = $2::uuid`,
            [amount, accountId],
            queryOptions
          ).catch(() => { });
        } else if (invoice.invoice_category === 'Iade') {
          // İade: trcode'a göre yön belirle
          // trcode 3 = müşteriden iade → müşteri bakiyesi azalır
          // trcode 2 = tedarikçiye iade → tedarikçi bakiyesi azalır
          if (trcode === 3 || ficheType === 'return_invoice') {
            const { rowCount } = await postgres.query(
              `UPDATE customers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
              [amount, accountId, firmNr],
              queryOptions
            ).catch(() => ({ rowCount: 0 }));
            if (!rowCount) {
              await postgres.query(
                `UPDATE suppliers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid`,
                [amount, accountId],
                queryOptions
              ).catch(() => { });
            }
          }
        }
      }

      void import('../messaging/messagingService').then(({ messagingService }) =>
        messagingService.maybeEnqueueInvoiceNotification(invoice, invoiceId, firmNr, periodNr)
      ).catch((e) => console.warn('[InvoicesAPI] WhatsApp kuyruk:', e));

      return {
        ...invoice,
        id: invoiceId,
        created_at: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('[InvoicesAPI] create failed:', error);
      console.error('[InvoicesAPI] Failed Invoice Data:', JSON.stringify(invoice, null, 2));
      if (DB_SETTINGS.connectionProvider === 'rest_api' && shouldTryRestApiCreateFallback(error)) {
        try {
          const firmNr = normalizeFirmNrForRow((invoice as any).firma_id ?? ERP_SETTINGS.firmNr);
          const periodNr = normalizePeriodNrForRow((invoice as any).donem_id ?? ERP_SETTINGS.periodNr);
          let trcode = Number(invoice.invoice_type || 0);
          let ficheType = deriveFicheTypeFromTrcode(trcode);
          if (trcode === 0) {
            switch (invoice.invoice_category) {
              case 'Alis': trcode = 1; ficheType = 'purchase_invoice'; break;
              case 'Satis': trcode = 8; ficheType = 'sales_invoice'; break;
              case 'Iade': trcode = 3; ficheType = 'return_invoice'; break;
              case 'Irsaliye': trcode = 8; ficheType = 'waybill'; break;
              case 'Siparis': trcode = 1; ficheType = 'order'; break;
              case 'Hizmet': trcode = 9; ficheType = 'sales_invoice'; break;
              default: trcode = 8; ficheType = 'sales_invoice';
            }
          }
          console.warn('[InvoicesAPI] PostgreSQL timeout; trying PostgREST create fallback...');
          const saved = await createInvoiceViaPostgrest(invoice, { firmNr, periodNr, trcode, ficheType });
          if (saved?.id) {
            void import('../messaging/messagingService').then(({ messagingService }) =>
              messagingService.maybeEnqueueInvoiceNotification(invoice, saved.id!, firmNr, periodNr)
            ).catch((e) => console.warn('[InvoicesAPI] WhatsApp kuyruk:', e));
            return saved;
          }
        } catch (fallbackErr: any) {
          console.error('[InvoicesAPI] PostgREST create fallback failed:', fallbackErr);
        }
      }
      throw new Error(error.message || 'Fatura kaydedilemedi');
    }
  },

  /**
   * Get invoices with pagination and filters
   */
  async getPaginated(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    customerId?: string;
    invoiceCategory?: string;
    /** Birden fazla kategori (ör. Satış + İade) — invoiceType yokken birleşik SQL filtresi */
    invoiceCategories?: string[];
    invoiceType?: number;
    firmNr?: string | number;
    periodNr?: string | number;
    /** false (varsayılan): iptal/silinen faturalar listede görünmez */
    includeCancelled?: boolean;
    /** true: yalnızca silinen/iptal faturalar */
    cancelledOnly?: boolean;
  }): Promise<{ data: Invoice[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const {
      page = 1,
      pageSize = 50,
      search,
      status,
      startDate,
      endDate,
      customerId,
      invoiceCategory,
      invoiceCategories,
      invoiceType,
      includeCancelled = false,
      cancelledOnly = false,
    } = options;

    try {
      const firmNr = options.firmNr ?? ERP_SETTINGS.firmNr;
      const periodNr = options.periodNr ?? ERP_SETTINGS.periodNr;
      const categoryKey = normalizeInvoiceCategoryKey(invoiceCategory);
      const categoryKeys =
        invoiceCategories?.length
          ? invoiceCategories.map((c) => normalizeInvoiceCategoryKey(c)).filter((c): c is string => !!c)
          : categoryKey
            ? [categoryKey]
            : [];

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const tableName = `/rex_${String(firmNr).padStart(3, '0')}_${String(periodNr).padStart(2, '0')}_sales`;

        const baseFilters: Record<string, string | number> = {
          select: '*',
          order: 'date.desc',
        };

        if (invoiceType !== undefined && invoiceType !== null && invoiceType !== 0) {
          const legacyFicheTypes = legacyFicheTypesByInvoiceType(invoiceType);
          if (legacyFicheTypes.length > 0) {
            baseFilters.or = `(trcode.eq.${String(invoiceType)},fiche_type.in.(${legacyFicheTypes.join(',')}))`;
          } else {
            baseFilters.trcode = `eq.${String(invoiceType)}`;
          }
        } else if (categoryKeys.length > 0) {
          const { trcodes, ficheTypes } = trcodeAndFicheTypesForCategories(categoryKeys);
          if (trcodes.length > 0 && ficheTypes.length > 0) {
            baseFilters.or = `(trcode.in.(${trcodes.join(',')}),fiche_type.in.(${ficheTypes.join(',')}))`;
          } else if (trcodes.length > 0) {
            baseFilters.trcode = `in.(${trcodes.join(',')})`;
          } else if (ficheTypes.length > 0) {
            baseFilters.fiche_type = `in.(${ficheTypes.join(',')})`;
          }
        }

        if (search) {
          const s = String(search).replace(/,/g, '\\,');
          const searchOr = `fiche_no.ilike.*${s}*,notes.ilike.*${s}*,document_no.ilike.*${s}*,cashier.ilike.*${s}*,customer_name.ilike.*${s}*`;
          const prevOr = typeof baseFilters.or === 'string' ? baseFilters.or : '';
          // PostgREST: iç içe or birleştirme sözdizimini bozmamak için and ile ayır
          if (prevOr) {
            baseFilters.and = `(or${prevOr},or(${searchOr}))`;
            delete baseFilters.or;
          } else {
            baseFilters.or = `(${searchOr})`;
          }
        }
        if (status) baseFilters.status = `eq.${status}`;
        if (customerId) baseFilters.customer_id = `eq.${customerId}`;

        // PostgREST tek parametrede iki ayrı date filtresini desteklemediği için tarih aralığını istemci tarafında kesinleştiriyoruz.
        // Sunucu max-rows kesmesini aşmak için yüksek limit iste
        baseFilters.limit = Math.min(Math.max(pageSize * Math.max(page, 1) + pageSize, 5000), 20000);

        const fullRows = await postgrest.get<any[]>(
          tableName,
          baseFilters,
          { schema: 'public' }
        );

        const filteredRows = (Array.isArray(fullRows) ? fullRows : []).filter((r: any) => {
          const cancelled =
            r?.is_cancelled === true || isInvoiceCancelledStatus(String(r?.status || ''));
          if (cancelledOnly && !cancelled) return false;
          if (!includeCancelled && !cancelledOnly && cancelled) return false;
          const d = String(r?.date || '').substring(0, 10);
          if (startDate && d < String(startDate).substring(0, 10)) return false;
          if (endDate && d > String(endDate).substring(0, 10)) return false;
          return true;
        });

        const total = filteredRows.length;
        const start = Math.max(0, (page - 1) * pageSize);
        const end = start + pageSize;
        const invoices = filteredRows.slice(start, end).map(mapDatabaseInvoiceToInvoice);

        return {
          data: invoices,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        };
      }

      let sql = `SELECT * FROM sales WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      console.log('[InvoicesAPI] [getPaginated] Base SQL:', sql);
      console.log('[InvoicesAPI] [getPaginated] ERP Context:', { firmNr, periodNr });
      console.log('[InvoicesAPI] [getPaginated] Options:', options);

      // Filter by fiche_type or trcode based on category
      if (invoiceType !== undefined && invoiceType !== null && invoiceType !== 0) {
        const legacyFicheTypes = legacyFicheTypesByInvoiceType(invoiceType);
        if (legacyFicheTypes.length > 0) {
          sql += ` AND (trcode::text = $${paramIndex}::text OR fiche_type::text = ANY($${paramIndex + 1}::text[]))`;
          params.push(String(invoiceType), legacyFicheTypes);
          paramIndex += 2;
        } else {
          sql += ` AND trcode::text = $${paramIndex}::text`;
          params.push(String(invoiceType));
          paramIndex++;
        }
      } else if (categoryKeys.length > 0) {
        const { trcodes, ficheTypes, includesAlis } = trcodeAndFicheTypesForCategories(categoryKeys);

        if (trcodes.length > 0) {
          sql += ` AND (trcode::int IN (${trcodes.join(',')})`;
          if (ficheTypes.length > 0) {
            sql += ` OR fiche_type::text = ANY($${paramIndex}::text[])`;
            params.push(ficheTypes);
            paramIndex++;
          }
          if (includesAlis) {
            sql += ` OR (
              fiche_type::text = 'return_invoice'
              AND customer_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM suppliers sup WHERE sup.id = sales.customer_id)
            )`;
          }
          sql += `)`;
        } else {
          const ficheTypesFallback = ficheTypes.length ? ficheTypes : ['sales_invoice'];
          sql += ` AND fiche_type::text = ANY($${paramIndex}::text[])`;
          params.push(ficheTypesFallback);
          paramIndex++;
        }
      }

      if (search) {
        sql += ` AND (fiche_no::text ILIKE $${paramIndex}::text OR notes::text ILIKE $${paramIndex}::text OR document_no::text ILIKE $${paramIndex}::text OR cashier::text ILIKE $${paramIndex}::text OR customer_name::text ILIKE $${paramIndex}::text)`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status) {
        sql += ` AND status::text = $${paramIndex}::text`;
        params.push(status);
        paramIndex++;
      }

      if (customerId) {
        sql += ` AND customer_id::text = $${paramIndex}::text`;
        params.push(customerId);
        paramIndex++;
      }

      if (startDate) {
        sql += ` AND date::date >= $${paramIndex}::date`;
        // Fix: Truncate to YYYY-MM-DD to avoid "error serializing parameter"
        params.push(String(startDate).substring(0, 10));
        paramIndex++;
      }

      if (endDate) {
        sql += ` AND date::date <= $${paramIndex}::date`;
        // Fix: Truncate to YYYY-MM-DD to avoid "error serializing parameter"
        params.push(String(endDate).substring(0, 10));
        paramIndex++;
      }

      if (cancelledOnly) {
        sql += ` AND (COALESCE(is_cancelled, false) = true OR LOWER(TRIM(COALESCE(status, ''))) IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted'))`;
      } else if (!includeCancelled) {
        sql += ` AND COALESCE(is_cancelled, false) = false AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')`;
      }

      // Count total
      const { rows: countRows } = await postgres.query(`SELECT COUNT(*) as total FROM (${sql}) as sub`, params);
      const total = countRows && countRows[0] ? parseInt(countRows[0].total) : 0;

      // Add ordering and pagination
      sql += ` ORDER BY date DESC LIMIT $${paramIndex}::text::int OFFSET $${paramIndex + 1}::text::int`;
      params.push(pageSize);
      params.push((page - 1) * pageSize);

      const { rows } = await postgres.query(sql, params);
      const invoices = rows.map(mapDatabaseInvoiceToInvoice);

      return {
        data: invoices,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (error) {
      console.error('[InvoicesAPI] getPaginated failed:', error);
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
  },

  /**
   * Get invoice by ID
   */
  async getById(id: string): Promise<Invoice | null> {
    const firmNr = ERP_SETTINGS.firmNr;
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    const firmNrStr = String(firmNr ?? '').trim();
    const parsedFirm = firmNrStr ? parseInt(firmNrStr, 10) : NaN;
    const firmFromInt = Number.isFinite(parsedFirm) ? String(parsedFirm).padStart(3, '0') : '';
    const firmVariants = Array.from(
      new Set(
        [firmNrStr, firmNrStr ? firmNrStr.padStart(3, '0') : '', firmFromInt].filter((x) => Boolean(x))
      )
    );
    if (firmVariants.length === 0) {
      firmVariants.push(String(ERP_SETTINGS.firmNr || '001').padStart(3, '0'));
    }

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      try {
        const { postgrest } = await import('./postgrestClient');
        const sessionFirm = String(firmVariants[0] || ERP_SETTINGS.firmNr || '001').padStart(3, '0');
        const sessionPeriod = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

        const fetchHeader = async (fn: string, pn: string): Promise<any | null> => {
          const path = `/rex_${fn}_${pn}_sales`;
          const rows = await postgrest.get<any[]>(
            path,
            { select: '*', id: `eq.${cleanId}`, limit: 1 },
            { schema: 'public' }
          );
          return Array.isArray(rows) && rows[0] ? rows[0] : null;
        };

        let header: any | null =
          (await fetchHeader(sessionFirm, sessionPeriod)) ||
          (firmVariants.length > 1 ? await fetchHeader(String(firmVariants[1]).padStart(3, '0'), sessionPeriod) : null);

        if (!header) {
          for (const fv of firmVariants.slice(2)) {
            header = await fetchHeader(String(fv).padStart(3, '0'), sessionPeriod);
            if (header) break;
          }
        }

        if (!header) {
          console.warn('[InvoicesAPI] getById PostgREST: sales başlığı bulunamadı', cleanId);
          return null;
        }

        const fn = String(header.firm_nr ?? sessionFirm).padStart(3, '0');
        const pn = String(header.period_nr ?? sessionPeriod).padStart(2, '0');
        const itemsPath = `/rex_${fn}_${pn}_sale_items`;

        const invoice = mapDatabaseInvoiceToInvoice(header);

        let itemRows: any[] = [];
        try {
          const rows = await postgrest.get<any[]>(
            itemsPath,
            { select: '*', invoice_id: `eq.${cleanId}`, order: 'id.asc' },
            { schema: 'public' }
          );
          itemRows = Array.isArray(rows) ? rows : [];
        } catch (e) {
          console.warn('[InvoicesAPI] getById PostgREST sale_items (invoice_id) failed:', e);
        }

        if (itemRows.length === 0) {
          try {
            const rows = await postgrest.get<any[]>(
              itemsPath,
              {
                select: '*',
                or: `(invoice_id.eq.${cleanId},sale_id.eq.${cleanId})`,
                order: 'id.asc',
              },
              { schema: 'public' }
            );
            itemRows = Array.isArray(rows) ? rows : [];
          } catch (e) {
            console.warn('[InvoicesAPI] getById PostgREST sale_items (or invoice_id/sale_id) failed:', e);
          }
        }

        invoice.items = itemRows.map((row) => mapSaleItemRowToInvoiceLine(row, invoice));
        if (itemRows.length === 0) {
          console.warn('[InvoicesAPI] getById PostgREST: sale_items boş', cleanId, { itemsPath });
        }
        return invoice;
      } catch (error) {
        console.error('[InvoicesAPI] getById PostgREST failed:', error);
        return null;
      }
    }

    let rows: any[];
    try {
      /* join_* ile s.customer_name çakışması yok; tedarikçi adı her zaman join'den gelir */
      let res = await postgres.query(
        `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         LEFT JOIN suppliers sup ON s.customer_id = sup.id
         WHERE s.id::text = $1 AND s.firm_nr::text = $2`,
        [cleanId, firmVariants[0] || firmNrStr]
      );
      rows = res.rows;
      if (rows.length === 0 && firmVariants.length > 1) {
        for (let i = 1; i < firmVariants.length; i++) {
          res = await postgres.query(
            `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
             LEFT JOIN suppliers sup ON s.customer_id = sup.id
             WHERE s.id::text = $1 AND s.firm_nr::text = $2`,
            [cleanId, firmVariants[i]]
          );
          if (res.rows.length > 0) {
            rows = res.rows;
            break;
          }
        }
      }
      /* firm_nr 1 vs 001 uyuşmazlığı: id UUID yeterli (tekil) */
      if (rows.length === 0) {
        res = await postgres.query(
          `SELECT s.*, c.name AS join_customer_name, sup.name AS join_supplier_name
           FROM sales s
           LEFT JOIN customers c ON s.customer_id = c.id
           LEFT JOIN suppliers sup ON s.customer_id = sup.id
           WHERE s.id::text = $1`,
          [cleanId]
        );
        rows = res.rows;
      }
    } catch (error) {
      console.error('[InvoicesAPI] getById header failed:', error);
      return null;
    }

    if (rows.length === 0) return null;

    const header = rows[0];
    const invoice = mapDatabaseInvoiceToInvoice(header);

    /* Satırlar: sales + sale_items aynı firma/dönem önekine çözülsün diye JOIN; başlıktaki period_nr öncelikli */
    const itemTableOpts = {
      firmNr: header.firm_nr != null && header.firm_nr !== '' ? String(header.firm_nr) : String(firmNr),
      periodNr:
        header.period_nr != null && header.period_nr !== ''
          ? String(header.period_nr)
          : String(ERP_SETTINGS.periodNr || '01')
    };

    let itemRows: any[] = [];

    const tryJoinItems = async (opts?: { firmNr: string; periodNr: string }) => {
      const q = `
        SELECT si.*
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.invoice_id
        WHERE s.id::text = $1
      `;
      const r = await postgres.query(q, [cleanId], opts);
      return r.rows || [];
    };

    const tryDirectItems = async (opts?: { firmNr: string; periodNr: string }) => {
      const q = `SELECT * FROM sale_items WHERE invoice_id = $1::uuid`;
      const r = await postgres.query(q, [cleanId], opts);
      return r.rows || [];
    };

    try {
      itemRows = await tryJoinItems(itemTableOpts);
    } catch (e) {
      console.warn('[InvoicesAPI] getById sale_items JOIN (header period) failed:', e);
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryDirectItems(itemTableOpts);
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items direct (header period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryJoinItems();
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items JOIN (ERP period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        itemRows = await tryDirectItems();
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items direct (ERP period) failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE invoice_id::text = $1`,
          [cleanId],
          itemTableOpts
        );
        itemRows = r.rows || [];
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items text match failed:', e);
      }
    }

    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE invoice_id::text = $1`,
          [cleanId]
        );
        itemRows = r.rows || [];
      } catch (e) {
        console.warn('[InvoicesAPI] getById sale_items text (ERP period) failed:', e);
      }
    }

    /* Eski şemada sale_id kullanılmış olabilir */
    if (itemRows.length === 0) {
      try {
        const r = await postgres.query(
          `SELECT * FROM sale_items WHERE sale_id = $1::uuid OR sale_id::text = $1`,
          [cleanId],
          itemTableOpts
        );
        itemRows = r.rows || [];
      } catch {
        /* sale_id kolonu yoksa normal */
      }
    }

    invoice.items = itemRows.map((row) => mapSaleItemRowToInvoiceLine(row, invoice));

    if (itemRows.length === 0) {
      console.warn('[InvoicesAPI] getById: no sale_items for invoice', cleanId, itemTableOpts);
    }

    return invoice;
  },

  /**
   * Update existing invoice
   */
  async update(id: string, invoice: Partial<Invoice>): Promise<Invoice | null> {
    try {
      console.log('[InvoicesAPI] Updating invoice...', id);
      const cleanId = String(id || '').trim();
      const existingFull = await this.getById(cleanId);
      if (!existingFull) throw new Error('Fatura bulunamadı');
      const fn0 = normalizeFirmNrForRow((existingFull as any).firma_id ?? ERP_SETTINGS.firmNr);
      const pn0 = normalizePeriodNrForRow((existingFull as any).donem_id ?? ERP_SETTINGS.periodNr);
      const resyncLedger = Array.isArray(invoice.items);
      const prevStatus = String(existingFull.status || '').toLowerCase().trim();
      const nextStatus =
        invoice.status != null ? String(invoice.status).toLowerCase().trim() : '';
      const isNewCancel =
        !resyncLedger &&
        nextStatus.length > 0 &&
        isInvoiceCancelledStatus(nextStatus) &&
        !isInvoiceCancelledStatus(prevStatus);

      if (isNewCancel) {
        try {
          await revertInvoiceLedgerSideEffects(existingFull, fn0, pn0);
        } catch (e) {
          console.warn('[InvoicesAPI] cancel ledger revert:', e);
        }
        (invoice as Record<string, unknown>).is_cancelled = true;
      }

      if (resyncLedger) {
        try {
          await revertInvoiceLedgerSideEffects(existingFull, fn0, pn0);
        } catch (e) {
          console.warn('[InvoicesAPI] update ledger revert:', e);
        }
      }

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        const fn = fn0;
        const pn = pn0;
        const salesTable = `/rex_${fn}_${pn}_sales`;
        const itemsTable = `/rex_${fn}_${pn}_sale_items`;

        const patchBody: Record<string, unknown> = {};
        if (invoice.invoice_no) patchBody.fiche_no = invoice.invoice_no;
        if (invoice.status) patchBody.status = invoice.status;
        if (invoice.notes !== undefined) patchBody.notes = invoice.notes;
        if (invoice.total_amount !== undefined) patchBody.net_amount = Number(invoice.total_amount);
        if (invoice.customer_name !== undefined) patchBody.customer_name = invoice.customer_name;
        const partnerIdRest = invoice.customer_id || invoice.supplier_id;
        if (partnerIdRest !== undefined && isValidUuid(String(partnerIdRest))) {
          patchBody.customer_id = String(partnerIdRest);
        }
        if (invoice.subtotal !== undefined) patchBody.total_net = Number(invoice.subtotal);
        if (invoice.tax !== undefined) patchBody.total_vat = Number(invoice.tax);
        if (invoice.discount !== undefined) patchBody.total_discount = Number(invoice.discount);
        if (invoice.total_cost !== undefined) patchBody.total_cost = Number(invoice.total_cost);
        if (invoice.gross_profit !== undefined) patchBody.gross_profit = Number(invoice.gross_profit);
        if (invoice.currency !== undefined) patchBody.currency = invoice.currency;
        if (invoice.currency_rate !== undefined) patchBody.currency_rate = Number(invoice.currency_rate);
        if (invoice.payment_method !== undefined) patchBody.payment_method = String(invoice.payment_method);
        if ((invoice as Record<string, unknown>).document_no !== undefined) {
          patchBody.document_no = String((invoice as Record<string, unknown>).document_no || '');
        }
        if ((invoice as Record<string, unknown>).header_fields !== undefined) {
          patchBody.header_fields = (invoice as Record<string, unknown>).header_fields;
        }
        if ((invoice as Record<string, unknown>).cashier !== undefined) {
          patchBody.cashier = String((invoice as Record<string, unknown>).cashier || '');
        }
        if ((invoice as Record<string, unknown>).is_cancelled === true) patchBody.is_cancelled = true;

        if (Object.keys(patchBody).length > 0) {
          await postgrest.patch(
            `${salesTable}?id=eq.${encodeURIComponent(cleanId)}&firm_nr=eq.${encodeURIComponent(fn)}`,
            patchBody,
            { schema: 'public', prefer: 'return=minimal' }
          );
        }

        if (invoice.items && Array.isArray(invoice.items)) {
          try {
            await postgrest.delete(
              `${itemsTable}?invoice_id=eq.${encodeURIComponent(cleanId)}`,
              { schema: 'public', prefer: 'return=minimal' }
            );
          } catch {
            /* satır yok veya filtre uyuşmadı */
          }
          try {
            await postgrest.delete(
              `${itemsTable}?sale_id=eq.${encodeURIComponent(cleanId)}`,
              { schema: 'public', prefer: 'return=minimal' }
            );
          } catch {
            /* sale_id kolonu yoksa */
          }

          for (const item of invoice.items) {
            const productId = item.code || item.productId;
            const unitMultiplier = Number((item as any).multiplier || 1);
            const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
            const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
            const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');
            const productUuid = resolveSaleItemProductUuid(item as { productId?: unknown; code?: unknown });
            const itemEnhanced: Record<string, unknown> = {
              id: self.crypto.randomUUID(),
              invoice_id: cleanId,
              firm_nr: String(fn),
              period_nr: String(pn),
              product_id: productUuid,
              item_code: String(productId || ''),
              item_name: String(item.description || item.productName || ''),
              quantity: Number(item.quantity || 0),
              unit: String((item as any).unit || 'Adet'),
              unit_price: Number(item.unitPrice || item.price || 0),
              discount_rate: Number(item.discount || 0),
              vat_rate: Number((item as any).taxRate || (item as any).vat_rate || 0),
              total_amount: Number(item.total || item.netAmount || 0),
              net_amount: Number(item.netAmount || item.total || 0),
              unit_cost: Number(item.unitCost || 0),
              total_cost: Number(item.totalCost || 0),
              gross_profit: Number(item.grossProfit || 0),
              unit_multiplier: unitMultiplier,
              base_quantity: baseQty,
              unit_price_fc: unitPriceFC,
              currency: itemCurrency,
              expiry_date: invoiceLineDateOrNull((item as any).expiryDate),
              batch_no: String((item as any).batchNo || '').trim() || null,
              item_type: invoiceLineTypeToDb((item as any).type),
            };
            const itemLegacy: Record<string, unknown> = {
              id: self.crypto.randomUUID(),
              invoice_id: cleanId,
              firm_nr: String(fn),
              period_nr: String(pn),
              product_id: productUuid,
              item_code: String(productId || ''),
              item_name: String(item.description || item.productName || ''),
              quantity: Number(item.quantity || 0),
              unit: String((item as any).unit || 'Adet'),
              unit_price: Number(item.unitPrice || item.price || 0),
              discount_rate: Number(item.discount || 0),
              vat_rate: Number((item as any).taxRate || (item as any).vat_rate || 0),
              total_amount: Number(item.total || item.netAmount || 0),
              net_amount: Number(item.netAmount || item.total || 0),
              expiry_date: invoiceLineDateOrNull((item as any).expiryDate),
              batch_no: String((item as any).batchNo || '').trim() || null,
            };
            try {
              await postgrest.post<any>(itemsTable, itemEnhanced, { schema: 'public' });
            } catch {
              await postgrest.post<any>(itemsTable, itemLegacy, { schema: 'public' });
            }
          }
        }

        const mergedRest = await this.getById(cleanId);
        if (resyncLedger && mergedRest) {
          try {
            await applyInvoiceLedgerSideEffects(mergedRest, fn0, pn0);
          } catch (e) {
            console.warn('[InvoicesAPI] update ledger apply:', e);
          }
        }
        return mergedRest;
      }

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (invoice.invoice_no) { fields.push(`fiche_no = $${i++}`); values.push(invoice.invoice_no); }
      if (invoice.status) { fields.push(`status = $${i++}`); values.push(invoice.status); }
      if (invoice.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(invoice.notes); }
      if (invoice.total_amount !== undefined) { fields.push(`net_amount = $${i++}`); values.push(invoice.total_amount); }
      if (invoice.customer_name !== undefined) { fields.push(`customer_name = $${i++}`); values.push(invoice.customer_name); }
      const partnerId = invoice.customer_id || invoice.supplier_id;
      if (partnerId !== undefined && isValidUuid(String(partnerId))) {
        fields.push(`customer_id = $${i++}::uuid`);
        values.push(String(partnerId));
      }
      if (invoice.subtotal !== undefined) { fields.push(`total_net = $${i++}`); values.push(invoice.subtotal); }
      if (invoice.tax !== undefined) { fields.push(`total_vat = $${i++}`); values.push(invoice.tax); }
      if (invoice.discount !== undefined) { fields.push(`total_discount = $${i++}`); values.push(invoice.discount); }
      if (invoice.total_cost !== undefined) { fields.push(`total_cost = $${i++}`); values.push(invoice.total_cost); }
      if (invoice.gross_profit !== undefined) { fields.push(`gross_profit = $${i++}`); values.push(invoice.gross_profit); }
      if (invoice.currency !== undefined) { fields.push(`currency = $${i++}`); values.push(invoice.currency); }
      if (invoice.currency_rate !== undefined) { fields.push(`currency_rate = $${i++}`); values.push(invoice.currency_rate); }
      if (invoice.payment_method !== undefined) { fields.push(`payment_method = $${i++}`); values.push(String(invoice.payment_method)); }
      if ((invoice as Record<string, unknown>).is_cancelled === true) {
        fields.push(`is_cancelled = $${i++}`);
        values.push(true);
      }

      const sqlOpts = { firmNr: fn0, periodNr: pn0 };
      if (fields.length > 0) {
        values.push(id);
        values.push(fn0);
        await postgres.query(
          `UPDATE sales SET ${fields.join(', ')} WHERE id::text = $${i} AND firm_nr = $${i + 1}`,
          values,
          sqlOpts
        );
      }

      if (invoice.items) {
        await postgres.query(`DELETE FROM sale_items WHERE invoice_id::text::uuid = $1::text::uuid`, [id], sqlOpts);
        for (const item of invoice.items) {
          const productId = item.code || item.productId;
          const productUuid = resolveSaleItemProductUuid(item as { productId?: unknown; code?: unknown });
          const unitMultiplier = Number((item as any).multiplier || 1);
          const baseQty = invoiceLineStockQuantity(item as Record<string, unknown>);
          const unitPriceFC = Number((item as any).unitPriceFC || item.unitPrice || item.price || 0);
          const itemCurrency = String((item as any).currency || (invoice as any).currency || 'IQD');
          await postgres.query(
            `INSERT INTO sale_items (
                invoice_id, firm_nr, period_nr, product_id, item_code, item_name,
                quantity, unit, unit_price, discount_rate, vat_rate,
                total_amount, net_amount,
                unit_cost, total_cost, gross_profit,
                unit_multiplier, base_quantity, unit_price_fc, currency,
                expiry_date, batch_no, item_type
             ) VALUES ($1::text::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::text,
               $7::text::numeric, $8::text, $9::text::numeric, $10::text::numeric, $11::text::numeric,
               $12::text::numeric, $13::text::numeric,
               $14::text::numeric, $15::text::numeric, $16::text::numeric,
               $17::text::numeric, $18::text::numeric, $19::text::numeric, $20::text,
               $21::date, $22::text, $23::text)`,
            [
              id,
              String(fn0),
              String(pn0),
              productUuid,
              String(productId || ''),
              String(item.description || item.productName),
              Number(item.quantity),
              String((item as any).unit || 'Adet'),
              Number(item.unitPrice || item.price),
              Number(item.discount || 0),
              Number((item as any).taxRate || (item as any).vat_rate || 0),
              Number(item.total || item.netAmount),
              Number(item.netAmount || item.total),
              Number(item.unitCost || 0),
              Number(item.totalCost || 0),
              Number(item.grossProfit || 0),
              unitMultiplier,
              baseQty,
              unitPriceFC,
              itemCurrency,
              invoiceLineDateOrNull((item as any).expiryDate),
              String((item as any).batchNo || '').trim() || null,
              invoiceLineTypeToDb((item as any).type),
            ],
            sqlOpts
          );
        }
      }

      const mergedSql = await this.getById(cleanId);
      if (resyncLedger && mergedSql) {
        try {
          await applyInvoiceLedgerSideEffects(mergedSql, fn0, pn0);
        } catch (e) {
          console.warn('[InvoicesAPI] update ledger apply (SQL):', e);
        }
      }
      return mergedSql;
    } catch (error: any) {
      console.error('[InvoicesAPI] update failed:', error);
      throw new Error(error.message || 'Fatura güncellenemedi');
    }
  },

  async getProductHistory(
    productId: string,
    hint?: { code?: string; barcode?: string }
  ): Promise<any[]> {
    try {
      const pid = String(productId || '').trim();
      if (!pid) return [];

      const { shouldUseTenantPostgrestApi } = await import('../../config/postgrest.config');
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const { productAPI } = await import('./products');
        const fn = normalizeFirmNrForRow(ERP_SETTINGS.firmNr);
        const pn = normalizePeriodNrForRow(ERP_SETTINGS.periodNr);
        const itemsPath = `/rex_${fn}_${pn}_sale_items`;
        const salesPath = `/rex_${fn}_${pn}_sales`;
        const custTable = `rex_${fn}_customers`;
        const suppTable = `rex_${fn}_suppliers`;
        const chunkSize = 35;

        // Not: dönem sale_items şemasında sale_id yok; yalnızca invoice_id (PostgREST bilinmeyen kolon → 400).
        const itemSelect =
          'id,quantity,unit_price,total_amount,net_amount,invoice_id,item_code,product_id';

        const fetchSaleItems = async (extra: Record<string, string>) =>
          postgrest
            .get<any[]>(
              itemsPath,
              {
                select: itemSelect,
                limit: 500,
                ...extra,
              },
              { schema: 'public' }
            )
            .catch(() => [] as any[]);

        // Satış satırında item_code çoğunlukla UUID; alışta ürün kodu/barkod — her iki anahtarı da topla.
        let resolvedUuid = isValidUuid(pid) ? pid : '';
        let resolvedCode = String(hint?.code || '').trim();
        let resolvedBarcode = String(hint?.barcode || '').trim();
        if (isValidUuid(resolvedCode)) {
          if (!resolvedUuid) resolvedUuid = resolvedCode;
          resolvedCode = '';
        }
        if (!isValidUuid(pid) && !resolvedCode) resolvedCode = pid;

        const codeLooksLikeUuid = Boolean(resolvedCode && isValidUuid(resolvedCode));
        // UUID varken gerçek ürün kodunu her zaman karttan çek (hint.code UUID/boş olsa bile).
        if (!resolvedUuid || !resolvedCode || codeLooksLikeUuid) {
          try {
            let prod =
              (resolvedUuid ? await productAPI.getById(resolvedUuid) : null) ||
              (resolvedCode && !isValidUuid(resolvedCode)
                ? await productAPI.getByCode(resolvedCode)
                : null) ||
              (pid && !isValidUuid(pid) && pid !== resolvedCode
                ? await productAPI.getByCode(pid)
                : null) ||
              (resolvedBarcode ? await productAPI.getByBarcode(resolvedBarcode) : null);
            if (!prod && isValidUuid(pid) && pid !== resolvedUuid) {
              prod = await productAPI.getById(pid);
            }
            if (prod?.id) resolvedUuid = String(prod.id);
            if (prod?.code) resolvedCode = String(prod.code).trim();
            if (prod?.barcode && !resolvedBarcode) resolvedBarcode = String(prod.barcode).trim();
          } catch (e) {
            console.warn('[InvoicesAPI] getProductHistory product resolve:', e);
          }
        }

        const codeKeys = new Set<string>();
        if (resolvedCode && !isValidUuid(resolvedCode)) codeKeys.add(resolvedCode);
        if (pid) codeKeys.add(pid);
        if (resolvedUuid) codeKeys.add(resolvedUuid);
        if (resolvedBarcode) codeKeys.add(resolvedBarcode);

        const mergedBuckets: any[] = [];
        for (const key of codeKeys) {
          const rows = await fetchSaleItems({ item_code: `eq.${key}` });
          if (Array.isArray(rows)) mergedBuckets.push(...rows);
        }
        if (resolvedUuid) {
          const rowsByProductId = await fetchSaleItems({ product_id: `eq.${resolvedUuid}` });
          if (Array.isArray(rowsByProductId)) mergedBuckets.push(...rowsByProductId);
        } else if (isValidUuid(pid)) {
          const rowsByProductId = await fetchSaleItems({ product_id: `eq.${pid}` });
          if (Array.isArray(rowsByProductId)) mergedBuckets.push(...rowsByProductId);
        }

        const seenKeys = new Set<string>();
        const list: any[] = [];
        for (const row of mergedBuckets) {
          const key = row?.id
            ? String(row.id)
            : `${String(row.invoice_id || '')}|${String(row.item_code || '')}|${String(row.product_id || '')}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          list.push(row);
        }
        const invIds = [
          ...new Set(
            list
              .map((x) => String(x.invoice_id || '').trim())
              .filter((x) => x && isValidUuid(x))
          ),
        ];
        if (invIds.length === 0) return [];

        const headersById = new Map<
          string,
          { fiche_no?: string; date?: string; fiche_type?: string; customer_id?: string; trcode?: number }
        >();
        for (let i = 0; i < invIds.length; i += chunkSize) {
          const chunk = invIds.slice(i, i + chunkSize);
          const inList = chunk.join(',');
          const rows = await postgrest
            .get<any[]>(
              salesPath,
              {
                select: 'id,fiche_no,date,fiche_type,customer_id,trcode',
                id: `in.(${inList})`,
                limit: chunk.length,
              },
              { schema: 'public' }
            )
            .catch(() => [] as any[]);
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            if (r?.id) headersById.set(String(r.id), r);
          });
        }

        const partnerIds = [
          ...new Set(
            [...headersById.values()]
              .map((h) => h.customer_id)
              .filter((x): x is string => Boolean(x && isValidUuid(String(x))))
          ),
        ];
        const namesById = new Map<string, string>();
        for (let i = 0; i < partnerIds.length; i += chunkSize) {
          const chunk = partnerIds.slice(i, i + chunkSize);
          const inList = chunk.join(',');
          const [crows, srows] = await Promise.all([
            postgrest
              .get<any[]>(
                `/${custTable}`,
                {
                  select: 'id,name',
                  id: `in.(${inList})`,
                  firm_nr: `eq.${fn}`,
                },
                { schema: 'public' }
              )
              .catch(() => [] as any[]),
            postgrest
              .get<any[]>(`/${suppTable}`, { select: 'id,name', id: `in.(${inList})` }, { schema: 'public' })
              .catch(() => [] as any[]),
          ]);
          (Array.isArray(crows) ? crows : []).forEach((r) => namesById.set(String(r.id), String(r.name || '')));
          (Array.isArray(srows) ? srows : []).forEach((r) => namesById.set(String(r.id), String(r.name || '')));
        }

        const mapped = list
          .map((it) => {
            const invKey = String(it.invoice_id || '').trim();
            const hd = invKey ? headersById.get(invKey) : undefined;
            if (!hd) return null;
            const partner = hd.customer_id ? namesById.get(String(hd.customer_id)) : undefined;
            const ficheType = String(hd.fiche_type || '');
            const trcode = Number(hd.trcode || 0);
            let type: string = 'sales';
            if (ficheType === 'purchase_invoice') type = 'purchase';
            else if (ficheType === 'return_invoice' && trcode === 3) type = 'sales_return';
            else if (ficheType === 'return_invoice') type = 'purchase_return';
            const qty = Math.abs(parseFloat(String(it.quantity ?? 0)) || 0);
            const total = parseFloat(String(it.total_amount ?? 0)) || 0;
            const net = parseFloat(String(it.net_amount ?? 0)) || 0;
            let unitPrice = parseFloat(String(it.unit_price ?? 0)) || 0;
            if (!unitPrice && qty > 0.0000001) {
              unitPrice = (net || total) / qty;
            }
            return {
              date: hd.date,
              documentNo: hd.fiche_no,
              supplier: partner || 'N/A',
              quantity: it.quantity,
              unitPrice,
              total: total || net || unitPrice * qty,
              type,
              ficheType,
              trcode,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null);
        mapped.sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime());
        return mapped;
      }

      const hintCode = String(hint?.code || '').trim();
      const hintBarcode = String(hint?.barcode || '').trim();
      const { rows } = await postgres.query(
        `SELECT 
            it.quantity, it.unit_price, it.total_amount, it.net_amount, s.fiche_no, s.date, s.fiche_type, s.trcode,
            COALESCE(c.name, sup.name) as partner_name
         FROM sale_items it 
         JOIN sales s ON it.invoice_id = s.id 
         LEFT JOIN customers c ON s.customer_id = c.id 
         LEFT JOIN suppliers sup ON s.customer_id = sup.id
         WHERE it.item_code = $1 
            OR it.product_id::text = $1
            OR it.item_code IN (
                 SELECT code FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
               )
            OR it.item_code IN (
                 SELECT id::text FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
               )
            OR it.item_code IN (
                 SELECT barcode FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
               )
            OR it.product_id IN (
                 SELECT id FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
               )
            OR (
                 NULLIF(TRIM($2::text), '') IS NOT NULL
                 AND (
                   it.item_code = TRIM($2::text)
                   OR it.product_id IN (
                     SELECT id FROM products WHERE code = TRIM($2::text) OR barcode = TRIM($2::text)
                   )
                 )
               )
            OR (
                 NULLIF(TRIM($3::text), '') IS NOT NULL
                 AND (
                   it.item_code = TRIM($3::text)
                   OR it.product_id IN (
                     SELECT id FROM products WHERE barcode = TRIM($3::text) OR code = TRIM($3::text)
                   )
                 )
               )
         ORDER BY s.date DESC`,
        [pid, hintCode, hintBarcode]
      );

      return rows.map(r => {
        const ficheType = String(r.fiche_type || '');
        const trcode = Number(r.trcode || 0);
        let type: string = 'sales';
        if (ficheType === 'purchase_invoice') type = 'purchase';
        else if (ficheType === 'return_invoice' && trcode === 3) type = 'sales_return';
        else if (ficheType === 'return_invoice') type = 'purchase_return';
        const qty = Math.abs(parseFloat(String(r.quantity ?? 0)) || 0);
        const total = parseFloat(String(r.total_amount ?? 0)) || 0;
        const net = parseFloat(String(r.net_amount ?? 0)) || 0;
        let unitPrice = parseFloat(String(r.unit_price ?? 0)) || 0;
        if (!unitPrice && qty > 0.0000001) {
          unitPrice = (net || total) / qty;
        }
        return {
          date: r.date,
          documentNo: r.fiche_no,
          supplier: r.partner_name || 'N/A',
          quantity: r.quantity,
          unitPrice,
          total: total || net || unitPrice * qty,
          type,
          ficheType,
          trcode,
        };
      });
    } catch (error) {
      console.error('[InvoicesAPI] getProductHistory failed:', error);
      return [];
    }
  },

  /**
   * Alış faturalarındaki promosyon (hediye) satırları — stok girişi, dağıtılmış maliyet, borçsuz kayıt özeti.
   */
  async getPurchasePromotionReport(
    startDate: string,
    endDate: string,
    options?: { firmNr?: string | number; periodNr?: string | number },
  ): Promise<PurchasePromotionReportLine[]> {
    const firmNr = String(options?.firmNr ?? ERP_SETTINGS.firmNr ?? '').trim();
    const periodNr = String(options?.periodNr ?? ERP_SETTINGS.periodNr ?? '01').trim();
    const from = String(startDate || '').slice(0, 10);
    const to = String(endDate || '').slice(0, 10);
    if (!from || !to) return [];

    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const page = await this.getPaginated({
          page: 1,
          pageSize: 500,
          invoiceCategory: 'Alis',
          startDate: from,
          endDate: to,
          firmNr,
          periodNr,
        });
        const lines: PurchasePromotionReportLine[] = [];
        for (const inv of page.data) {
          const full = inv.items?.length ? inv : await this.getById(inv.id);
          if (!full?.items?.length) continue;
          const paidTotal = computeInvoiceSupplierPayableAmount(full);
          const dateKey = String(full.invoice_date || full.created_at || '').slice(0, 10);
          full.items.forEach((item, idx) => {
            if (canonicalInvoiceLineType((item as any).type) !== 'Promosyon') return;
            lines.push({
              id: String((item as any).id || `${full.id}-${idx}`),
              invoiceId: full.id,
              invoiceNo: String(full.invoice_no || ''),
              invoiceDate: dateKey,
              supplierName: String(full.supplier_name || full.customer_name || '—'),
              productCode: String(item.code || ''),
              productName: String(item.description || item.productName || '—'),
              quantity: Number(item.quantity || 0),
              unit: String((item as any).unit || 'Adet'),
              allocatedUnitCost: Number(item.unitCost || 0),
              allocatedTotalCost: Number(item.totalCost || 0),
              invoicePaidTotal: paidTotal,
            });
          });
        }
        return lines.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
      }

      const queryOpts = { firmNr, periodNr };
      const res = await postgres.query<{
        id: string;
        invoice_id: string;
        item_code: string;
        item_name: string;
        quantity: string;
        unit: string;
        unit_cost: string;
        total_cost: string;
        fiche_no: string;
        invoice_date: string;
        supplier_name: string;
        invoice_paid_total: string;
      }>(
        `SELECT
            si.id,
            si.invoice_id,
            si.item_code,
            si.item_name,
            si.quantity,
            si.unit,
            si.unit_cost,
            si.total_cost,
            s.fiche_no,
            COALESCE(s.date, s.created_at)::date::text AS invoice_date,
            COALESCE(s.customer_name, '') AS supplier_name,
            (
              SELECT COALESCE(SUM(si2.net_amount::numeric), 0)
              FROM sale_items si2
              WHERE si2.invoice_id = si.invoice_id
                AND COALESCE(si2.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
            ) AS invoice_paid_total
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.invoice_id
         WHERE (s.trcode = 1 OR s.fiche_type = 'purchase_invoice')
           AND COALESCE(si.item_type, '') = 'Promosyon'
           AND COALESCE(s.is_cancelled, false) = false
           AND LOWER(COALESCE(s.status, '')) NOT IN ('silindi', 'cancelled', 'canceled', 'iptal', 'deleted')
           AND COALESCE(s.date, s.created_at)::date >= $1::date
           AND COALESCE(s.date, s.created_at)::date <= $2::date
         ORDER BY s.date DESC, s.fiche_no DESC`,
        [from, to],
        queryOpts,
      );

      return (res.rows || []).map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceNo: row.fiche_no || '',
        invoiceDate: row.invoice_date || '',
        supplierName: row.supplier_name || '—',
        productCode: row.item_code || '',
        productName: row.item_name || '—',
        quantity: parseFloat(row.quantity || '0'),
        unit: row.unit || 'Adet',
        allocatedUnitCost: parseFloat(row.unit_cost || '0'),
        allocatedTotalCost: parseFloat(row.total_cost || '0'),
        invoicePaidTotal: parseFloat(row.invoice_paid_total || '0'),
      }));
    } catch (error) {
      console.error('[InvoicesAPI] getPurchasePromotionReport failed:', error);
      return [];
    }
  },



  /**
   * Refund invoice (POS style status update)
   * Ideally this should be a new Return Invoice, but for quick POS actions we might just flag it.
   */
  async refund(
    id: string,
    context?: { firmNr?: string | number | null; periodNr?: string | number | null; receiptNumber?: string | null; reason?: string | null }
  ): Promise<boolean> {
    try {
      const firmNr = ERP_SETTINGS.firmNr;
      const saleId = String(id ?? '').trim();
      if (!saleId) return false;

      // Faturayı getir → bakiyeyi geri al
      let invoice: Invoice | null = null;
      try {
        invoice = await this.getById(saleId);
      } catch (e) {
        console.warn('[InvoicesAPI] refund getById skipped:', e);
        invoice = null;
      }
      const saleFirmNr = normalizeFirmNrForRow(context?.firmNr ?? (invoice as any)?.firma_id ?? firmNr);
      const salePeriodNr = normalizePeriodNrForRow(context?.periodNr ?? (invoice as any)?.donem_id ?? ERP_SETTINGS.periodNr);
      const saleReceiptNo =
        String(context?.receiptNumber ?? invoice?.invoice_no ?? '').trim();
      const refundReason = String(context?.reason ?? '').trim();
      const reasonNote = refundReason ? `[CANCEL_REASON] ${refundReason}` : '';
      const saleQueryOpts = { firmNr: saleFirmNr, periodNr: salePeriodNr };
      if (invoice) {
        const accountId = invoice.customer_id || invoice.supplier_id;
        const amount = Number(invoice.total_amount || invoice.total || 0);
        if (accountId && isValidUuid(accountId) && amount > 0) {
          if (
            (invoice.invoice_category === 'Satis' || invoice.invoice_category === 'Hizmet')
            && paymentMethodImpliesCustomerDebt(invoice.payment_method)
          ) {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
              await customerAPI.addBalance(accountId, -amount).catch(() => { });
            } else {
              await postgres.query(
                `UPDATE customers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid AND firm_nr = $3`,
                [amount, accountId, saleFirmNr],
                saleQueryOpts
              ).catch(() => { });
            }
          } else if (invoice.invoice_category === 'Alis' && paymentMethodImpliesSupplierDebt(invoice.payment_method)) {
            if (DB_SETTINGS.connectionProvider === 'rest_api') {
              try {
                const { postgrest } = await import('./postgrestClient');
                const fnB = normalizeFirmNrForRow(saleFirmNr);
                const supPath = `/rex_${fnB}_suppliers`;
                const balRows = await postgrest.get<any[]>(
                  supPath,
                  { select: 'balance', id: `eq.${accountId}`, limit: 1 },
                  { schema: 'public' }
                );
                const br = Array.isArray(balRows) ? balRows[0] : null;
                if (br) {
                  const nb = Number(br.balance ?? 0) - amount;
                  await postgrest.patch(
                    `${supPath}?id=eq.${encodeURIComponent(String(accountId))}`,
                    { balance: nb },
                    { schema: 'public', prefer: 'return=minimal' }
                  );
                }
              } catch {
                /* tedarikçi bakiyesi güncellenemezse iade yine denenir */
              }
            } else {
              await postgres.query(
                `UPDATE suppliers SET balance = COALESCE(balance, 0) - $1::numeric WHERE id = $2::uuid`,
                [amount, accountId],
                saleQueryOpts
              ).catch(() => { });
            }
          }
        }
      }

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('./postgrestClient');
          const fn = normalizeFirmNrForRow(saleFirmNr);
          const pn = normalizePeriodNrForRow(salePeriodNr);
          const salesBase = `/rex_${fn}_${pn}_sales`;
          const mergeNotes = (prev: unknown) => {
            const p = String(prev ?? '').trim();
            if (!reasonNote) return p;
            return p ? `${p}\n${reasonNote}` : reasonNote;
          };
          const tryPatchRefund = async (extra: Record<string, string>): Promise<boolean> => {
            try {
              const q: Record<string, string> = { select: 'id,notes', limit: '1', ...extra };
              const rows = await postgrest.get<any[]>(salesBase, q, { schema: 'public' });
              const row = Array.isArray(rows) ? rows[0] : null;
              if (!row?.id) return false;
              await postgrest.patch(
                `${salesBase}?id=eq.${encodeURIComponent(String(row.id))}`,
                { status: 'refunded', notes: mergeNotes(row.notes) },
                { schema: 'public', prefer: 'return=minimal' }
              );
              return true;
            } catch {
              return false;
            }
          };

          if (await tryPatchRefund({ id: `eq.${saleId}`, firm_nr: `eq.${String(saleFirmNr).trim()}` })) {
            return true;
          }
          if (await tryPatchRefund({ id: `eq.${saleId}` })) return true;
          if (saleReceiptNo) {
            if (await tryPatchRefund({ fiche_no: `eq.${saleReceiptNo}` })) return true;
          }
          if (await tryPatchRefund({ id: `eq.${saleId}`, firm_nr: `eq.${fn}` })) return true;
        } catch (e) {
          console.warn('[InvoicesAPI] refund PostgREST:', e);
        }
        return false;
      }

      const attempts: Array<{ sql: string; params: unknown[]; options?: { firmNr?: string; periodNr?: string } }> = [
        {
          sql: `UPDATE sales
                SET status = 'refunded',
                    notes = CASE WHEN $3::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $3::text)) ELSE notes END
                WHERE id::text = $1::text
                  AND lpad(trim(firm_nr::text), 3, '0') = lpad(trim($2::text), 3, '0')
                RETURNING id`,
          params: [saleId, String(saleFirmNr ?? '').trim(), reasonNote],
          options: saleQueryOpts,
        },
        {
          sql: `UPDATE sales
                SET status = 'refunded',
                    notes = CASE WHEN $2::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $2::text)) ELSE notes END
                WHERE id::text = $1::text
                RETURNING id`,
          params: [saleId, reasonNote],
          options: saleQueryOpts,
        },
        {
          sql: `UPDATE sales
                SET status = 'refunded',
                    notes = CASE WHEN $2::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $2::text)) ELSE notes END
                WHERE id::text = $1::text
                RETURNING id`,
          params: [saleId, reasonNote],
        },
        ...(saleReceiptNo
          ? [
              {
                sql: `UPDATE sales
                      SET status = 'refunded',
                          notes = CASE WHEN $2::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $2::text)) ELSE notes END
                      WHERE fiche_no::text = $1::text
                      RETURNING id`,
                params: [saleReceiptNo, reasonNote],
                options: saleQueryOpts,
              },
              {
                sql: `UPDATE sales
                      SET status = 'refunded',
                          notes = CASE WHEN $2::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $2::text)) ELSE notes END
                      WHERE fiche_no::text = $1::text
                      RETURNING id`,
                params: [saleReceiptNo, reasonNote],
              },
            ]
          : []),
        {
          sql: `UPDATE sales
                SET status = 'refunded',
                    updated_at = NOW(),
                    notes = CASE WHEN $2::text <> '' THEN trim(concat_ws(E'\n', COALESCE(NULLIF(notes, ''), ''), $2::text)) ELSE notes END
                WHERE id::text = $1::text
                RETURNING id`,
          params: [saleId, reasonNote],
          options: saleQueryOpts,
        },
      ];

      for (const attempt of attempts) {
        try {
          const { rowCount } = await postgres.query(attempt.sql, attempt.params as any[], attempt.options);
          if ((rowCount || 0) > 0) return true;
        } catch (e) {
          console.warn('[InvoicesAPI] refund update attempt failed:', e);
        }
      }

      return false;
    } catch (error) {
      console.error('[InvoicesAPI] refund failed:', error);
      return false;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      console.log('[InvoicesAPI] Soft-deleting invoice (revert ledger + is_cancelled)...', id);
      const firmNr = ERP_SETTINGS.firmNr;
      const firmNrStr = String(firmNr ?? '').trim();

      let header: Invoice | null = null;
      try {
        header = await this.getById(id);
      } catch {
        header = null;
      }

      if (header && (header as Invoice & { is_cancelled?: boolean }).is_cancelled === true) {
        return true;
      }

      let ficheNo = header?.invoice_no ? String(header.invoice_no).trim() : '';
      let notes = header?.notes != null ? String(header.notes) : '';
      let paymentMethod = header?.payment_method;
      let customerId = header?.customer_id && isValidUuid(header.customer_id) ? header.customer_id : '';
      let totalAmt = Number(header?.total_amount ?? header?.total ?? 0);
      let saleFirmNr: string | null = header ? String((header as any).firma_id ?? '').trim() || null : null;
      let salePeriodNr: string | null = header ? String((header as any).donem_id ?? '').trim() || null : null;
      let invoiceForRevert: Invoice | null = header;

      if (!header) {
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
          try {
            const { postgrest } = await import('./postgrestClient');
            const fnH = normalizeFirmNrForRow(ERP_SETTINGS.firmNr);
            const pnH = normalizePeriodNrForRow(ERP_SETTINGS.periodNr);
            const path = `/rex_${fnH}_${pnH}_sales`;
            const rows = await postgrest.get<any[]>(
              path,
              {
                select:
                  'id,fiche_no,notes,payment_method,customer_id,net_amount,firm_nr,period_nr,fiche_type,trcode,status,customer_name',
                id: `eq.${String(id).trim()}`,
                limit: 1,
              },
              { schema: 'public' }
            );
            const h = Array.isArray(rows) ? rows[0] : null;
            if (h) {
              if (!ficheNo && h.fiche_no) ficheNo = String(h.fiche_no).trim();
              if (!notes && h.notes != null) notes = String(h.notes);
              if (paymentMethod == null && h.payment_method != null) paymentMethod = String(h.payment_method);
              if (!customerId && h.customer_id && isValidUuid(h.customer_id)) customerId = String(h.customer_id);
              if (!totalAmt && h.net_amount != null) totalAmt = parseFloat(String(h.net_amount)) || 0;
              if (h.firm_nr != null) saleFirmNr = String(h.firm_nr).trim();
              if (h.period_nr != null) salePeriodNr = String(h.period_nr).trim();
              invoiceForRevert = salesHeaderRowToRevertInvoice(h, String(id).trim());
            }
          } catch {
            /* yedek başlık okunamazsa silme yine denenir */
          }
        } else {
          try {
            const { rows: hdrRows } = await postgres.query(
              `SELECT id, fiche_no, notes, payment_method, customer_id, net_amount, firm_nr, period_nr, fiche_type, trcode, status, customer_name
               FROM sales WHERE id::text = $1::text LIMIT 1`,
              [String(id).trim()]
            );
            const h = hdrRows?.[0];
            if (h) {
              if (!ficheNo && h.fiche_no) ficheNo = String(h.fiche_no).trim();
              if (!notes && h.notes != null) notes = String(h.notes);
              if (paymentMethod == null && h.payment_method != null) paymentMethod = String(h.payment_method);
              if (!customerId && h.customer_id && isValidUuid(h.customer_id)) customerId = String(h.customer_id);
              if (!totalAmt && h.net_amount != null) totalAmt = parseFloat(String(h.net_amount)) || 0;
              if (h.firm_nr != null) saleFirmNr = String(h.firm_nr).trim();
              if (h.period_nr != null) salePeriodNr = String(h.period_nr).trim();
              invoiceForRevert = salesHeaderRowToRevertInvoice(h, String(id).trim());
            }
          } catch {
            /* yedek başlık okunamazsa yalnızca sales silinir */
          }
        }
      }

      const restOrderId = extractRestOrderIdFromInvoiceNotes(notes);

      const fnR = normalizeFirmNrForRow(saleFirmNr ?? ERP_SETTINGS.firmNr);
      const pnR = normalizePeriodNrForRow(salePeriodNr ?? ERP_SETTINGS.periodNr);

      if (invoiceForRevert) {
        try {
          await revertInvoiceLedgerSideEffects(invoiceForRevert, fnR, pnR);
        } catch (e) {
          console.warn('[InvoicesAPI] delete ledger revert:', e);
        }
      } else {
        const cashOptsFallback = buildCashLinePgOpts(saleFirmNr, salePeriodNr);
        if (ficheNo) {
          await removeCashRegisterLinesForSaleFiche(ficheNo, cashOptsFallback);
        }
        if (paymentMethodImpliesCustomerDebt(paymentMethod) && customerId && totalAmt !== 0 && !Number.isNaN(totalAmt)) {
          try {
            await customerAPI.addBalance(customerId, -totalAmt);
          } catch (e) {
            console.warn('[InvoicesAPI] Veresiye bakiye geri alınamadı:', e);
          }
        }
      }

      const sid = String(id).trim();
      const softDeleteBody = {
        is_cancelled: true,
        status: 'Silindi',
        updated_at: new Date().toISOString(),
      };

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('./postgrestClient');
          const fnD = normalizeFirmNrForRow(saleFirmNr ?? ERP_SETTINGS.firmNr);
          const pnD = normalizePeriodNrForRow(salePeriodNr ?? ERP_SETTINGS.periodNr);
          const salesPath = `/rex_${fnD}_${pnD}_sales`;
          await postgrest.patch(
            `${salesPath}?id=eq.${encodeURIComponent(sid)}`,
            softDeleteBody,
            { schema: 'public', prefer: 'return=minimal' }
          );
        } catch (e) {
          console.warn('[InvoicesAPI] soft delete PostgREST:', e);
          return false;
        }
      } else {
        const { rowCount } = await postgres.query(
          `UPDATE sales
           SET is_cancelled = true, status = 'Silindi', updated_at = NOW()
           WHERE id::text = $1::text AND firm_nr::text = $2::text`,
          [sid, firmNrStr]
        );
        if (!rowCount) {
          await postgres.query(
            `UPDATE sales SET is_cancelled = true, status = 'Silindi', updated_at = NOW() WHERE id::text = $1::text`,
            [sid]
          );
        }
      }

      // 3) Restoran adisyonu (DB transaction dışında — farklı bağlantı / şema)
      if (restOrderId) {
        try {
          const { RestaurantService } = await import('../restaurant');
          await RestaurantService.cancelOrder(restOrderId);
        } catch (e) {
          console.warn('[InvoicesAPI] Bağlı restoran adisyonu iptal edilemedi:', e);
        }
      }

      try {
        const { repairCariLedgerConsistency } = await import('./accountLedgerRepair');
        await repairCariLedgerConsistency();
      } catch (e) {
        console.warn('[InvoicesAPI] Cari bakiye onarımı atlandı:', e);
      }

      return true;
    } catch (error) {
      console.error('[InvoicesAPI] delete failed:', error);
      return false;
    }
  }
};

/**
 * Bazı kayıtlarda başlık `net_amount` indirim düşülmeden `total_net` (brüt) ile aynı kalıyor;
 * anasayfa / raporlarda ciro şişiyor. Yalnızca tutarsızlık barizse bileşenlerden net tahsilatı kur.
 */
function normalizeSalesHeaderNetAmount(dbInv: any, category: Invoice['invoice_category']): number {
  const rawNet = parseFloat(dbInv.net_amount || 0);
  if (category !== 'Satis') return rawNet;

  const totalNet = parseFloat(dbInv.total_net || 0);
  const totalDisc = parseFloat(dbInv.total_discount || 0);
  const totalVat = parseFloat(dbInv.total_vat || 0);
  if (!(totalDisc > 0.001) || !(totalNet > 0)) return rawNet;

  const eps = 0.02;
  if (rawNet + eps >= totalNet) {
    const recomputed = Math.max(0, totalNet - totalDisc + totalVat);
    if (recomputed + eps < rawNet) return recomputed;
  }
  return rawNet;
}

function inferInvoiceCategoryFromDbRow(dbInv: any): Invoice['invoice_category'] {
  const ft = String(dbInv?.fiche_type || '').toLowerCase();
  const tc = Number(dbInv?.trcode ?? dbInv?.invoice_type ?? 0);
  if (tc === 6) return 'Iade';
  if (ft === 'purchase_invoice' || ft === 'a') return 'Alis';
  if (ft === 'sales_invoice' || ft === 's') return 'Satis';
  if (ft === 'return_invoice' || ft === 'i') return 'Iade';
  if (ft === 'waybill') return 'Irsaliye';
  if (ft === 'order') return 'Siparis';
  if (ft === 'quote') return 'Teklif';
  if (tc) {
    for (const [cat, codes] of Object.entries(TRCODES_BY_INVOICE_CATEGORY)) {
      if ((codes as readonly number[]).includes(tc)) {
        if (cat === 'Hizmet') continue;
        return cat as Invoice['invoice_category'];
      }
    }
  }
  return 'Hizmet';
}

function mapDatabaseInvoiceToInvoice(dbInv: any): Invoice {
  const category = inferInvoiceCategoryFromDbRow(dbInv);
  const inferredType =
    dbInv.trcode != null
      ? Number(dbInv.trcode)
      : category === 'Alis'
        ? 1
        : category === 'Satis'
          ? 8
          : category === 'Iade'
            ? 3
            : 0;

  const joinCust = dbInv.join_customer_name;
  const joinSup = dbInv.join_supplier_name;
  /* Alış: customer_id tedarikçi UUID; customers join boş — ünvan suppliers veya sales.customer_name */
  const partnerNameAlis = joinSup || dbInv.customer_name || '';
  const partnerNameSatis = joinCust || dbInv.customer_name || '';

  const netAmount = normalizeSalesHeaderNetAmount(dbInv, category);

  return {
    id: dbInv.id || '',
    invoice_no: dbInv.fiche_no || dbInv.document_no,
    document_no: String(dbInv.document_no || '').trim() || undefined,
    header_fields: readInvoiceHeaderFields(dbInv.header_fields),
    invoice_date: dbInv.created_at || dbInv.date,
    customer_id: dbInv.customer_id,
    customer_name: category === 'Alis' ? partnerNameAlis : partnerNameSatis,
    supplier_id: dbInv.customer_id,
    supplier_name: category === 'Alis' ? partnerNameAlis : (joinSup || dbInv.supplier_name || ''),
    trcode: inferredType || undefined,
    subtotal: parseFloat(dbInv.total_net || 0),
    tax: parseFloat(dbInv.total_vat || 0),
    discount: parseFloat(dbInv.total_discount || 0),
    total_amount: netAmount,
    total: netAmount,
    status: dbInv.status,
    notes: dbInv.notes,
    invoice_category: category,
    created_at: dbInv.created_at || dbInv.date,
    items: [],
    source: 'invoice',
    invoice_type: inferredType,
    firma_id: dbInv.firm_nr,
    firma_name: '',
    donem_id: dbInv.period_nr,
    donem_name: '',
    total_cost: parseFloat(dbInv.total_cost || 0),
    gross_profit: parseFloat(dbInv.gross_profit || 0),
    profit_margin: parseFloat(dbInv.profit_margin || 0),
    currency: String(dbInv.currency ?? dbInv.currency_code ?? '').trim() || 'IQD',
    currency_rate: parseFloat(dbInv.currency_rate || 1),
    payment_method: dbInv.payment_method,
    cashier: String(dbInv.cashier || '').trim() || undefined,
    store_id: dbInv.store_id || undefined,
    created_by_user_id: dbInv.created_by_user_id || undefined,
    is_cancelled: dbInv.is_cancelled === true || isInvoiceCancelledStatus(dbInv.status),
  } as Invoice;
}
