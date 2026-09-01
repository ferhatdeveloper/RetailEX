/**
 * Regression test: ficheTypeToInfo i18n entegrasyonu
 *
 * Skandal: Ekstre TYPE kolonundaki etiketler ("Alış", "İade", "Sipariş",
 * "İrsaliye", "Ödeme", "Tahsilat" vb.) hardcoded Türkçe idi. Dil
 * İngilizce/Arapça/Kürtçe'ye çevrildiğinde bile UI'da aynı Türkçe
 * etiketler görünüyordu (2026-09-01 kasap ekstresi).
 *
 * Düzeltme: ficheTypeToInfo opsiyonel `t` parametresi aldı; modül
 * çevirilerinden (module-translations.ts) anahtar ile çeviri döner.
 * `t` verilmezse eski hardcoded Türkçe korunur (geriye uyumluluk).
 */
import { describe, expect, it, vi } from 'vitest';
import { ficheTypeToInfo } from './cariAccountStatement';

describe('ficheTypeToInfo — i18n', () => {
  it('t verilmezse hardcoded Türkçe korunur (geriye uyumluluk)', () => {
    expect(ficheTypeToInfo('purchase_invoice', 0, false).label).toBe('Alış');
    expect(ficheTypeToInfo('return_invoice', 0, false).label).toBe('İade');
    expect(ficheTypeToInfo('waybill', 0, false).label).toBe('İrsaliye');
    expect(ficheTypeToInfo('order', 0, false).label).toBe('Sipariş');
    expect(ficheTypeToInfo('CH_ODEME', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false).label).toBe('Tahsilat');
    expect(ficheTypeToInfo('', 9, false).label).toBe('Hizmet');
    expect(ficheTypeToInfo('sales_invoice', 0, false).label).toBe('Satış');
    expect(ficheTypeToInfo('opening_balance', 0, false).label).toBe('Devir');
    expect(ficheTypeToInfo('X', 0, true).label).toBe('Silindi');
  });

  it('t verilirse çevrilmiş etiket döner (İngilizce)', () => {
    const t = (key: string) => {
      const map: Record<string, string> = {
        ficheTypePurchaseInvoice: 'Purchase',
        ficheTypeReturnInvoice: 'Return',
        ficheTypeWaybill: 'Waybill',
        ficheTypeOrder: 'Order',
        ficheTypePaymentOut: 'Payment',
        ficheTypePaymentIn: 'Collection',
        ficheTypeService: 'Service',
        ficheTypeSalesInvoice: 'Sale',
        ficheTypeOpeningBalance: 'Opening Balance',
        ficheTypeCancelled: 'Cancelled',
      };
      return map[key] || key;
    };
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Purchase');
    expect(ficheTypeToInfo('return_invoice', 0, false, t).label).toBe('Return');
    expect(ficheTypeToInfo('waybill', 0, false, t).label).toBe('Waybill');
    expect(ficheTypeToInfo('order', 0, false, t).label).toBe('Order');
    expect(ficheTypeToInfo('CH_ODEME', 0, false, t).label).toBe('Payment');
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false, t).label).toBe('Collection');
    expect(ficheTypeToInfo('', 9, false, t).label).toBe('Service');
    expect(ficheTypeToInfo('sales_invoice', 0, false, t).label).toBe('Sale');
    expect(ficheTypeToInfo('opening_balance', 0, false, t).label).toBe('Opening Balance');
    expect(ficheTypeToInfo('X', 0, true, t).label).toBe('Cancelled');
  });

  it('t hata fırlatırsa hardcoded Türkçe fallback olur (güvenli)', () => {
    const t = vi.fn(() => {
      throw new Error('translation missing');
    });
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Alış');
    expect(ficheTypeToInfo('return_invoice', 0, false, t).label).toBe('İade');
  });

  it('isReturn / isOpening / cancelled bayrakları korunur', () => {
    expect(ficheTypeToInfo('return_invoice', 0, false).isReturn).toBe(true);
    expect(ficheTypeToInfo('purchase_invoice', 0, false).isReturn).toBe(false);
    expect(ficheTypeToInfo('CH_ODEME', 0, false).isReturn).toBe(true);
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false).isReturn).toBe(true);
    expect(ficheTypeToInfo('opening_balance', 0, false).isOpening).toBe(true);
    expect(ficheTypeToInfo('X', 0, true).label).toBe('Silindi');
  });

  it('renk sınıfları sabit kalır (görsel UI için)', () => {
    expect(ficheTypeToInfo('purchase_invoice', 0, false).color).toBe('bg-orange-100 text-orange-700');
    expect(ficheTypeToInfo('return_invoice', 0, false).color).toBe('bg-red-100 text-red-700');
    expect(ficheTypeToInfo('CH_ODEME', 0, false).color).toBe('bg-green-100 text-green-700');
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false).color).toBe('bg-teal-100 text-teal-700');
    expect(ficheTypeToInfo('opening_balance', 0, false).color).toBe('bg-indigo-100 text-indigo-800');
  });

  it('büyük/küçük harf duyarsız: CH_odeme ve ch_TAHSİLAT aynı sonucu verir', () => {
    expect(ficheTypeToInfo('CH_odeme', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('ch_TAHSILAT', 0, false).label).toBe('Tahsilat');
  });
});