/**
 * ficheTypeToInfo / ekstre açıklama i18n
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ficheTypeToInfo,
  resolveEkstreDescription,
  buildEkstreRows,
} from './cariAccountStatement';

describe('ficheTypeToInfo — i18n', () => {
  it('t verilmezse hardcoded Türkçe korunur (geriye uyumluluk)', () => {
    expect(ficheTypeToInfo('purchase_invoice', 0, false).label).toBe('Alış faturası');
    expect(ficheTypeToInfo('return_invoice', 0, false).label).toBe('İade');
    expect(ficheTypeToInfo('waybill', 0, false).label).toBe('İrsaliye');
    expect(ficheTypeToInfo('order', 0, false).label).toBe('Sipariş');
    expect(ficheTypeToInfo('CH_ODEME', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('CH_TAHSILAT', 0, false).label).toBe('Tahsilat');
    expect(ficheTypeToInfo('', 9, false).label).toBe('Hizmet');
    expect(ficheTypeToInfo('sales_invoice', 0, false).label).toBe('Satış faturası');
    expect(ficheTypeToInfo('opening_balance', 0, false).label).toBe('Devir');
    expect(ficheTypeToInfo('X', 0, true).label).toBe('Silindi');
  });

  it('t verilirse çevrilmiş etiket döner (İngilizce)', () => {
    const t = (key: string) => {
      const map: Record<string, string> = {
        ficheTypePurchaseInvoice: 'Purchase invoice',
        ficheTypeReturnInvoice: 'Return',
        ficheTypeWaybill: 'Waybill',
        ficheTypeOrder: 'Order',
        ficheTypePaymentOut: 'Payment',
        ficheTypePaymentIn: 'Collection',
        ficheTypeService: 'Service',
        ficheTypeSalesInvoice: 'Sales invoice',
        ficheTypeOpeningBalance: 'Opening Balance',
        ficheTypeCancelled: 'Cancelled',
      };
      return map[key] || key;
    };
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Purchase invoice');
    expect(ficheTypeToInfo('sales_invoice', 0, false, t).label).toBe('Sales invoice');
  });

  it('t hata fırlatırsa hardcoded Türkçe fallback olur (güvenli)', () => {
    const t = vi.fn(() => {
      throw new Error('translation missing');
    });
    expect(ficheTypeToInfo('purchase_invoice', 0, false, t).label).toBe('Alış faturası');
  });

  it('büyük/küçük harf duyarsız: CH_odeme ve ch_TAHSILAT aynı sonucu verir', () => {
    expect(ficheTypeToInfo('CH_odeme', 0, false).label).toBe('Ödeme');
    expect(ficheTypeToInfo('ch_TAHSILAT', 0, false).label).toBe('Tahsilat');
  });
});

describe('resolveEkstreDescription', () => {
  it('ham purchase_invoice notes yerine Alış faturası yazar', () => {
    expect(resolveEkstreDescription('purchase_invoice', 'purchase_invoice', 1)).toBe('Alış faturası');
    expect(resolveEkstreDescription('', 'purchase_invoice', 1)).toBe('Alış faturası');
  });

  it('gerçek açıklama metnini korur', () => {
    expect(resolveEkstreDescription('Mal alımı', 'purchase_invoice', 1)).toBe('Mal alımı');
  });
});

describe('buildEkstreRows — müşteri peşin satış', () => {
  it('nakit satış ekstede görünür ama bakiyeyi şişirmez', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-1',
          fiche_type: 'sales_invoice',
          total_amount: 150000,
          payment_method: 'cash',
        },
      ],
      'customer',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].borcAmount).toBe(150000);
    expect(rows[0].alacakAmount).toBe(150000);
    expect(rows[0].balance).toBe(0);
  });

  it('veresiye satış müşteri borcunu artırır', () => {
    const rows = buildEkstreRows(
      [
        {
          date: '2026-09-18',
          fiche_no: 'SF-2',
          fiche_type: 'sales_invoice',
          total_amount: 150000,
          payment_method: 'veresiye',
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(150000);
    expect(rows[0].alacakAmount).toBe(0);
    expect(rows[0].balance).toBe(150000);
  });
});
