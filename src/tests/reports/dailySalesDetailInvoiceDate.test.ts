/**
 * Satış Detayları — fatura tarihi kolonu.
 *
 * Aralık 01.10.2026–24.10.2026 iken satırda gün görünmüyordu; yalnızca saat vardı.
 * Tarih, fişin fatura / işlem günüdür. Saat ayrı kalır.
 * Ciro 215.000, indirim 1.500, gider 0, net 213.500. Peşinat nakde eklenmez.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../../locales/module-translations';
import {
  buildDailySalesDetailExpenseRows,
  sumDailySalesDetailCashBalance,
} from '../../utils/dailySalesDetailCashBalance';
import {
  dailySalesDetailInvoiceDateLabel,
  dailySalesDetailInvoiceDateRaw,
} from '../../utils/dailySalesDetailInvoiceDate';
import { dailySalesDetailNetAmount } from '../../utils/dailySalesDetailNet';
import { formatSaleWallClockTime } from '../../utils/saleWallClock';

const invoiceNoon = '2026-10-24T12:00:00.000Z';
const wallClock = '2026-10-24T08:58:00.000Z';

describe('dailySalesDetailInvoiceDate — fatura günü', () => {
  it('satırda fatura tarihi dolu, saat ayrı, net tutar aynı', () => {
    const sale = {
      receiptNumber: 'BEA-2026-00001',
      date: invoiceNoon,
      created_at: wallClock,
      beforeDiscount: 50_000,
      total: 50_000,
      discount: 0,
    };
    const invoiceDate = dailySalesDetailInvoiceDateRaw({
      date: sale.date,
      created_at: sale.created_at,
      erpSale: { date: sale.date, created_at: sale.created_at },
    });
    const label = dailySalesDetailInvoiceDateLabel(invoiceDate);
    const hour = formatSaleWallClockTime({ date: sale.date, created_at: sale.created_at });
    expect(invoiceDate).toBe('2026-10-24');
    expect(label).toBe('24.10.2026');
    expect(hour).not.toBe('—');
    expect(hour).not.toContain('24.10.2026');
    expect(hour).not.toContain('2026-10-24');
    expect(label).not.toContain(hour);
    expect(dailySalesDetailNetAmount(sale)).toBe(50_000);
  });

  it('duvar saati ertesi güne kaysa da fatura günü 01.10.2026 kalır', () => {
    const label = dailySalesDetailInvoiceDateLabel({
      date: '2026-10-01T12:00:00.000Z',
      created_at: '2026-10-01T22:30:00.000Z',
    });
    expect(label).toBe('01.10.2026');
    expect(dailySalesDetailInvoiceDateLabel({
      created_at: '2026-10-24T08:58:00.000Z',
    })).toBe('—');
  });

  it('gider satırı kendi belge tarihini yazar, net eksi kalır', () => {
    const createdAt = '2026-10-24T08:58:00.000Z';
    const rows = buildDailySalesDetailExpenseRows([], [{
      key: 'kira',
      ficheNo: 'G-1',
      amount: 5_000,
      date: '2026-10-03',
      createdAt,
      description: 'Kira',
      paymentMethod: 'cash',
      isCash: true,
    }], 'Gider');
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiceDate).toBe('2026-10-03');
    expect(dailySalesDetailInvoiceDateLabel(rows[0].invoiceDate)).toBe('03.10.2026');
    expect(rows[0].hour).toBe(formatSaleWallClockTime({
      date: '2026-10-03',
      created_at: createdAt,
    }));
    expect(rows[0].hour).not.toContain('03.10.2026');
    expect(rows[0].total).toBe(-5_000);
    expect(dailySalesDetailNetAmount(rows[0])).toBe(-5_000);
  });

  it('ciro 215.000, indirim 1.500, peşinat hariç, gider 0, net 213.500', () => {
    const lines = [
      { beforeDiscount: 50_000, total: 50_000, discount: 0, date: invoiceNoon, created_at: wallClock },
      { beforeDiscount: 50_000, total: 50_000, discount: 0, date: '2026-10-10T12:00:00.000Z', created_at: wallClock },
      { beforeDiscount: 50_000, total: 50_000, discount: 1_500, date: '2026-10-18T12:00:00.000Z', created_at: wallClock },
      { beforeDiscount: 65_000, total: 65_000, discount: 0, date: '2026-10-01T12:00:00.000Z', created_at: wallClock },
    ];
    const reservation = {
      beforeDiscount: 10_000,
      total: 10_000,
      discount: 0,
      isDeposit: true,
      date: invoiceNoon,
    };
    const ciro = lines.reduce((sum, row) => sum + row.beforeDiscount, 0);
    const indirim = lines.reduce((sum, row) => sum + row.discount, 0);
    expect(ciro).toBe(215_000);
    expect(indirim).toBe(1_500);
    expect(reservation.total).toBe(10_000);
    expect(sumDailySalesDetailCashBalance([...lines, reservation])).toBe(213_500);
    for (const row of lines) {
      const label = dailySalesDetailInvoiceDateLabel({
        date: row.date,
        created_at: row.created_at,
      });
      expect(label).toMatch(/^\d{2}\.\d{2}\.2026$/);
      const hour = formatSaleWallClockTime({ date: row.date, created_at: row.created_at });
      expect(hour).not.toContain(label);
      expect(dailySalesDetailNetAmount(row)).toBe(row.total - row.discount);
    }
    expect(dailySalesDetailInvoiceDateLabel(lines[3])).toBe('01.10.2026');
    expect(dailySalesDetailInvoiceDateLabel(lines[0])).toBe('24.10.2026');
  });

  it('ızgara kolonu Fiş No ile Saat arasındadır', () => {
    const src = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const start = src.indexOf('data={dailySalesDetailGridRows}');
    expect(start).toBeGreaterThan(-1);
    const slice = src.slice(start, start + 1800);
    const receipt = slice.indexOf("key: 'receiptNumber'");
    const invoice = slice.indexOf("key: 'invoiceDate'");
    const hour = slice.indexOf("key: 'hour'");
    expect(receipt).toBeGreaterThan(-1);
    expect(invoice).toBeGreaterThan(receipt);
    expect(hour).toBeGreaterThan(invoice);
    expect(slice).toContain("header: tm('dateLabel')");
    expect(slice).toContain('dailySalesDetailInvoiceDateLabel');
    expect(src).toContain('invoiceDate: dailySalesDetailInvoiceDateRaw');
  });

  it('başlık dört dilde Tarih', () => {
    const pack = moduleTranslations.dateLabel;
    expect(pack.tr).toBe('Tarih');
    expect(pack.en).toBe('Date');
    expect(pack.ar).toBe('التاريخ');
    expect(pack.ku).toBe('بەروار');
  });
});
