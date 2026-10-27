/**
 * Aylık Gün Özeti, Yıllık Ay Özeti ve Günlük Rapor.
 * Ciro brüt belge tutarıdır. İndirim ayrı kolondadır ve netten bir kez düşülür.
 * Satır neti indirimi zaten düşmüşse ikinci kez düşülmez.
 */
import type { ColumnDef } from '@tanstack/react-table';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dailyRevenueDiscount, dailyNetSaleRevenue, type DailyKpiSale } from '../../utils/dailyReportKpis';
import {
  displayedDailySalesDetailNet,
  sumDisplayedDailySalesDetailNet,
  type DisplayedDailySalesDetailNetRow,
} from '../../utils/dailySalesDetailNet';
import {
  buildDataGridExportAoa,
  buildGridExportWorksheet,
  excelAmountCellValue,
} from '../../utils/gridExcelExport';
import {
  periodSummaryHeadline,
  periodSummaryNetRemaining,
  reportDisplayNet,
} from '../../utils/periodSummaryNet';

describe('aylık gün ve yıllık ay net kalan', () => {
  it('ekim toplamı 515000 + 10000 − 15000 − 16000 − 100000 = 394000', () => {
    const input = {
      revenue: 515_000,
      returnsAmount: 15_000,
      returnDeduction: 15_000,
      expenses: 100_000,
      expenseEnabled: true,
      reservationDeposit: 10_000,
      discount: 16_000,
    };
    const month = periodSummaryHeadline(input);
    const year = periodSummaryHeadline(input);

    expect(month.grossRevenue).toBe(515_000);
    expect(month.netRevenue).toBe(394_000);
    expect(year.netRevenue).toBe(394_000);
    expect(month.netRevenue).toBe(year.netRevenue);
    expect(month.netRevenue).not.toBe(410_000);
  });

  it('26.10 satırı 385000 + 5000 − 15000 − 16000 − 45000 = 314000', () => {
    expect(periodSummaryNetRemaining({
      revenue: 385_000,
      returnDeduction: 15_000,
      expenses: 45_000,
      expenseEnabled: true,
      reservationDeposit: 5_000,
      discount: 16_000,
    })).toBe(314_000);
  });

  it('indirimsiz gün 130000 + 5000 − 15000 − 55000 = 65000 bozulmaz', () => {
    expect(periodSummaryNetRemaining({
      revenue: 130_000,
      returnDeduction: 15_000,
      expenses: 55_000,
      expenseEnabled: true,
      reservationDeposit: 5_000,
      discount: 0,
    })).toBe(65_000);
  });

  it('yıllık ay özeti aynı başlık fonksiyonunu kullanır', () => {
    const period = readFileSync(resolve('src/components/reports/PeriodSummaryReport.tsx'), 'utf8');
    const moduleSrc = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(period).toContain('discount: sale.discount');
    expect(moduleSrc).toContain('mode="monthly-days"');
    expect(moduleSrc).toContain('mode="yearly-months"');
    expect(moduleSrc.match(/<PeriodSummaryReport /g)?.length).toBe(2);
  });
});

describe('günlük rapor net tutar', () => {
  const roza: DisplayedDailySalesDetailNetRow = {
    beforeDiscount: 15_000,
    total: 15_000,
    discount: 1_000,
  };

  it('satır neti 14000; brüt 15000 net diye yazılmaz', () => {
    expect(displayedDailySalesDetailNet(roza)).toBe(14_000);
    expect(displayedDailySalesDetailNet(roza)).not.toBe(15_000);
    expect(displayedDailySalesDetailNet(roza)).not.toBe(13_000);
  });

  it('dip toplam satır netlerini toplar; üst kutu 370000 brütü net sanmaz', () => {
    const rows: DisplayedDailySalesDetailNetRow[] = [
      { beforeDiscount: 355_000, total: 355_000, discount: 15_000 },
      roza,
      { isAvans: true, total: 5_000, discount: 0 },
      { isExpense: true, beforeDiscount: 0, total: -45_000, discount: 0 },
    ];
    const footer = sumDisplayedDailySalesDetailNet(rows);
    expect(footer).toBe(14_000 + (355_000 - 15_000) + 5_000 - 45_000);
    expect(footer).toBe(314_000);
    expect(footer).not.toBe(15_000 + 355_000);

    const grossBase = 370_000;
    const card = reportDisplayNet({
      revenue: grossBase,
      discount: 16_000,
      reservationAmount: 5_000,
      returnDeduction: 0,
      expenses: 45_000,
      expenseEnabled: true,
    });
    expect(card).toBe(314_000);
    expect(card).toBe(footer);
    expect(card).not.toBe(grossBase + 5_000 - 45_000);

    const alreadyNet = reportDisplayNet({
      revenue: grossBase - 16_000,
      discount: 0,
      reservationAmount: 5_000,
      returnDeduction: 0,
      expenses: 45_000,
      expenseEnabled: true,
    });
    const twice = reportDisplayNet({
      revenue: grossBase - 16_000,
      discount: 16_000,
      reservationAmount: 5_000,
      returnDeduction: 0,
      expenses: 45_000,
      expenseEnabled: true,
    });
    expect(alreadyNet).toBe(card);
    expect(twice).not.toBe(card);
    expect(twice).toBe(298_000);
  });

  it('brüt satış indirimi bir kez düşülür; peşinat indirime girmez', () => {
    const sales: DailyKpiSale[] = [
      { id: 'roza', total: 15_000, discount: 1_000, status: 'completed', paymentMethod: 'cash' },
      { id: 'hizmet', total: 355_000, discount: 15_000, status: 'completed', paymentMethod: 'cash' },
      { id: 'pesinat', total: 5_000, discount: 9_000, status: 'completed', paymentMethod: 'cash', isDeposit: true },
    ];
    expect(dailyNetSaleRevenue(sales)).toBe(370_000);
    expect(dailyRevenueDiscount(sales)).toBe(16_000);
    expect(reportDisplayNet({
      revenue: dailyNetSaleRevenue(sales),
      discount: dailyRevenueDiscount(sales),
      reservationAmount: 5_000,
      returnDeduction: 0,
      expenses: 45_000,
      expenseEnabled: true,
    })).toBe(314_000);
  });
});

describe('günlük excel net tutar', () => {
  type Row = DisplayedDailySalesDetailNetRow & { customer: string };

  const columns: ColumnDef<Row, unknown>[] = [
    { id: 'customer', accessorKey: 'customer', header: 'Müşteri' },
    { id: 'beforeDiscount', accessorKey: 'beforeDiscount', header: 'İndirim öncesi' },
    { id: 'discount', accessorKey: 'discount', header: 'İndirim' },
    {
      id: 'total',
      header: 'Net tutar',
      accessorFn: (row) => displayedDailySalesDetailNet(row),
    },
  ];

  const rows: Row[] = [
    { customer: 'ARAM', beforeDiscount: 75_000, total: 75_000, discount: 0 },
    { customer: 'ROZA', beforeDiscount: 15_000, total: 15_000, discount: 1_000 },
  ];

  it('net hücre 14000 ve 75000; 14 veya 15 veya 75 yazılmaz', () => {
    expect(excelAmountCellValue('Net tutar', '14.000')).toBe(14_000);
    expect(excelAmountCellValue('Net tutar', '75.000')).toBe(75_000);
    expect(excelAmountCellValue('Net tutar', '14.000')).not.toBe(14);
    expect(excelAmountCellValue('Tarih', '26.10.2026')).toBe('26.10.2026');
    expect(excelAmountCellValue('Hizmet primi', '22.500')).toBe(22_500);
    expect(excelAmountCellValue('Hizmet primi', '22.500')).not.toBe(22.5);

    const { headers, aoa } = buildDataGridExportAoa(rows, columns, {
      footerLabel: 'TOPLAM',
      footerSumColumns: [
        { columnId: 'beforeDiscount', getValue: (row) => Number(row.beforeDiscount) || 0 },
        { columnId: 'discount', getValue: (row) => Number(row.discount) || 0 },
        { columnId: 'total', getValue: (row) => displayedDailySalesDetailNet(row) },
      ],
    });
    expect(headers[0]).toBe('Müşteri');
    expect(aoa[1]?.[3]).toBe(75_000);
    expect(aoa[2]?.[3]).toBe(14_000);
    expect(aoa[aoa.length - 1]?.[3]).toBe(89_000);

    const ws = buildGridExportWorksheet(aoa, headers);
    const merges = ws['!merges'] ?? [];
    const headerMerged = merges.some((m) => m.s.r === 0 && m.e.c > m.s.c);
    expect(headerMerged).toBe(false);
    expect(ws['A1']?.v).toBe('Müşteri');
    expect(ws['D2']?.v).toBe(75_000);
    expect(ws['D3']?.v).toBe(14_000);
    expect(ws['D3']?.v).not.toBe(14);
    expect(ws['D3']?.v).not.toBe(15_000);
    expect(ws['D4']?.v).toBe(89_000);
  });
});
