import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types/models';
import { buildReceipt80mmPrintHtml } from '../../utils/receipt80mmPrintHtml';
import {
  appointmentReceiptBanner,
  appointmentReceiptPayState,
  receiptUnpaidBalance,
} from '../../utils/receiptUnpaidBalance';

describe('receiptUnpaidBalance', () => {
  it('50.000 toplam, 20.000 nakit → kalan 30.000', () => {
    expect(receiptUnpaidBalance(50_000, 20_000)).toBe(30_000);
  });

  it('ödenen 0 ise kalan toplama eşit', () => {
    expect(receiptUnpaidBalance(50_000, 0)).toBe(50_000);
  });

  it('ödenen toplamı aşarsa kalan 0', () => {
    expect(receiptUnpaidBalance(50_000, 60_000)).toBe(0);
  });

  it('tam ödendiyse kalan 0', () => {
    expect(receiptUnpaidBalance(50_000, 50_000)).toBe(0);
  });
});

describe('appointmentReceiptBanner', () => {
  it('kısmi ödemede başlık ödenmedi demez ve kalanı kapatmaz', () => {
    expect(appointmentReceiptPayState(50_000, 20_000)).toBe('partial');
    const banner = appointmentReceiptBanner('tr', 'partial');
    expect(banner).toBe('RANDEVU — Kısmi ödeme');
    expect(banner.includes('alınmadı')).toBe(false);
    expect(banner.includes('alındı')).toBe(false);
  });

  it('ödenen yoksa başlık ödeme alınmadı kalır', () => {
    expect(appointmentReceiptPayState(50_000, 0)).toBe('unpaid');
    expect(appointmentReceiptBanner('tr', 'unpaid')).toBe('RANDEVU — Ödeme alınmadı');
  });

  it('tam ödemede başlık alındı der, kalan 0', () => {
    expect(appointmentReceiptPayState(50_000, 50_000)).toBe('paid');
    expect(appointmentReceiptBanner('tr', 'paid')).toBe('RANDEVU — Ödeme alındı');
    expect(receiptUnpaidBalance(50_000, 50_000)).toBe(0);
  });
});

describe('randevu fişi yazdırma HTML', () => {
  it('ÖDENEN satırının altında KALAN 30.000 yazar', () => {
    const sale: Sale = {
      id: 'apt-1',
      receiptNumber: 'BTY-20261024-M10-D10-820873',
      date: '2026-10-24T10:59:37',
      customerName: 'VELI',
      items: [
        {
          productId: 'torpi',
          productName: 'TORPI',
          quantity: 1,
          price: 50_000,
          discount: 0,
          total: 50_000,
          beautyStaffName: 'ARZ',
        },
      ],
      subtotal: 50_000,
      discount: 0,
      total: 50_000,
      paymentMethod: 'cash',
      cashier: 'ARZ',
    };
    const html = buildReceipt80mmPrintHtml({
      sale,
      paymentData: {
        payments: [{ method: 'cash', amount: 20_000, currency: 'IQD' }],
        totalPaid: 20_000,
        change: 0,
      },
      receiptSettings: {},
      locale: 'tr',
      interimBanner: appointmentReceiptBanner('tr', appointmentReceiptPayState(50_000, 20_000)),
    });
    const paidAt = html.indexOf('ÖDENEN');
    const kalanAt = html.indexOf('KALAN');
    expect(paidAt).toBeGreaterThan(-1);
    expect(kalanAt).toBeGreaterThan(paidAt);
    expect(html.includes('30.000')).toBe(true);
    expect(html.includes('RANDEVU — Kısmi ödeme')).toBe(true);
    expect(html.includes('Ödeme alınmadı')).toBe(false);
    expect(html.includes('ÖDEME DETAYLARI')).toBe(false);
    expect(html.includes('Nakit')).toBe(false);
    expect(html.includes('TORPI')).toBe(true);
    expect(html.includes('VELI')).toBe(true);
  });
});
