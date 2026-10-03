/**
 * Satış Finalize Servisi (AVANS → FATURA)
 *
 * Fatura formu "Kaydet" dediğinde:
 *   1. Satış fişini (sales) `salesAPI.create` üzerinden oluşturur (mevcut akış)
 *   2. Eğer `avansId` verildiyse: `applyAdvanceToSale(avansId, saleId)` çağrısı
 *      - cari_avans.status = 'applied'
 *      - inventory_reservations.status = 'finalized'
 *   3. Satış fişine avans indirimi olarak ayrı satır eklenir
 *      (`AVANS <reference_no>` adıyla negatif tutar)
 *
 * Bu servis, `salesAPI.create` çağrısını sarmalar; fatura modülü tek
 * fonksiyonla hem fişi oluşturur hem avansı uygular.
 *
 * NOT: Stok düşme işlemi `salesAPI.create` (ve onun çağırdığı
 * `invoicesAPI.create`) tarafından zaten yapılır — bu yüzden burada
 * tekrar stok düşmüyoruz, sadece rezervasyonu finalize ediyoruz.
 */

import { salesAPI } from './api/sales';
import { applyAdvanceToSale } from './avansService';
import type { FinalizeSaleInput } from '../core/types/avans';
import type { Sale, SaleItem } from '../core/types/models';
import { formatAvansNote } from '../utils/avansFormatting';

export interface FinalizeSaleResult {
  sale: Sale;
  appliedAvansId: string | null;
  appliedAvansAmount: number;
  /** Avans indiriminin sales.items'a eklendi mi? (kontrol amaçlı) */
  avansDiscountLineAdded: boolean;
}

/**
 * Fatura finalize et + avans uygula.
 *
 * NOT: Bu fonksiyon `salesAPI.create` akışını sarmaladığı için fatura
 * modülü `selectedAvansId` set edip `finalizeSale`'ı çağırır. Avans
 * indirimi sales.items'a eklenir; cari bakiye avans mahsup edilmiş
 * olarak yazılır (salesAPI.create ziyadesiyle customer_debt yazar).
 */
export async function finalizeSale(input: FinalizeSaleInput): Promise<FinalizeSaleResult> {
  if (!input.customerId) {
    throw new Error('finalizeSale: customerId zorunlu');
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('finalizeSale: items boş olamaz');
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    throw new Error('finalizeSale: totalAmount > 0 olmalı');
  }

  let appliedAvansId: string | null = null;
  let appliedAvansAmount = 0;
  const enrichedItems: SaleItem[] = input.items.map((it) => ({
    productId: it.productId,
    productName: it.productName ?? '',
    productCode: (it as { productCode?: string }).productCode ?? it.productId,
    quantity: it.quantity,
    unit: it.unit ?? 'Adet',
    price: it.unitPrice,
    discount: (it as { discount?: number }).discount ?? 0,
    total: it.total,
  }));

  // 1) Avans uygulama: önce avans satışa bağlanır (rezervasyon finalize)
  //    Avans tutarı sales.items'a negatif "İndirim" satırı olarak eklenir.
  if (input.avansId) {
    // Avans tutarını öğrenmek için yeniden oku (amount DB'de)
    const { getOpenAdvances } = await import('./avansService');
    const { postgres, ERP_SETTINGS } = await import('./postgres');
    const tbl = `rex_${String(ERP_SETTINGS.firmNr || '001').padStart(3, '0')}_${String(
      ERP_SETTINGS.periodNr || '01',
    ).padStart(2, '0')}_cari_avans`;
    const { rows: avansRows } = await postgres.query(
      `SELECT id, amount, reference_no, payment_method FROM ${tbl} WHERE id = $1 AND status = 'open'`,
      [input.avansId],
    );
    if (!avansRows || avansRows.length === 0) {
      // Avans open değilse uyarı ver ama devam et (eski akışa düşmesin)
      console.warn('[finalizeSale] Avans open değil veya bulunamadı:', input.avansId);
    } else {
      const av = avansRows[0];
      appliedAvansId = String(av.id);
      appliedAvansAmount = Math.min(Number(av.amount) || 0, input.totalAmount);

      // Avans indirimi olarak ayrı satır ekle
      if (appliedAvansAmount > 0) {
        enrichedItems.push({
          productId: `AVANS-${av.id}`,
          productName: `Avans (${av.reference_no || av.id})`,
          productCode: `AVANS-${av.id}`,
          quantity: 1,
          unit: 'Adet',
          price: -appliedAvansAmount, // negatif = indirim
          discount: 0,
          total: -appliedAvansAmount,
        } as SaleItem);
      }
    }
  }

  // 2) Satış fişi oluştur (salesAPI.create — mevcut fatura motoru)
  const sale: Omit<Sale, 'id'> = {
    receiptNumber: `INV-${Date.now()}`,
    date: new Date().toISOString(),
    customerId: input.customerId,
    customerName: '',
    cashier: input.userName ?? '',
    items: enrichedItems,
    subtotal: enrichedItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 0), 0),
    discount: 0,
    total: input.totalAmount - appliedAvansAmount,
    paymentMethod: 'cash',
    payments: input.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      currency: p.currency,
      cash_register_id: p.cashRegisterId,
    })),
    notes: input.notes || (appliedAvansAmount > 0
      ? formatAvansNote(appliedAvansId!, appliedAvansAmount)
      : undefined),
  };

  const created = await salesAPI.create(sale);
  if (!created) {
    throw new Error('Fatura oluşturulamadı (salesAPI.create null döndü).');
  }

  // 3) Avansı uygula (status=applied, reservation finalize)
  if (appliedAvansId) {
    try {
      await applyAdvanceToSale(appliedAvansId, created.id);
    } catch (e) {
      console.error('[finalizeSale] applyAdvanceToSale başarısız:', e);
      // Fatura oluştu, avans uygulanamadı — logla, kullanıcıya uyar.
      // Manuel müdahale gerekir (cari hareket düzeltme).
    }
  }

  return {
    sale: created,
    appliedAvansId,
    appliedAvansAmount,
    avansDiscountLineAdded: appliedAvansAmount > 0,
  };
}
