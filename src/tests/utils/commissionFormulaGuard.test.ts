/**
 * Prim formülü bu ekran işinde değişmez.
 * Peşinat prime eklenmez. İndirim bu raporda açık cari yapılmaz.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapCommissionReportLine,
  signCommissionLineAmounts,
} from '../../utils/commissionReportLines';

function sliceBetween(source: string, startMark: string, endMark: string): string {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark, start + startMark.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('prim formülü değişmez', () => {
  it('hizmet ve ürün primi ciroya ve peşinata eklenmeden toplanır', () => {
    const service = readFileSync(resolve('src/services/beautyService.ts'), 'utf8');
    const report = sliceBetween(service, 'async getCommissionReport(', 'async getCommissionReportLines(');
    expect(report).toContain(
      "COALESCE(SUM(CASE WHEN si.item_type = 'service' THEN si.commission_amount ELSE 0 END), 0)::float AS service_commission",
    );
    expect(report).toContain(
      "COALESCE(SUM(CASE WHEN si.item_type = 'product' THEN si.commission_amount ELSE 0 END), 0)::float AS product_commission",
    );
    expect(report).toContain(
      'COALESCE(SUM(si.commission_amount), 0)::float AS total_commission',
    );
    expect(report).toContain(
      'service_rate_effective: serviceRevenue > 0 ? Number(((serviceCommission / serviceRevenue) * 100).toFixed(2)) : 0',
    );
    expect(report).not.toContain('si.total + si.commission_amount');
    expect(report).not.toContain('si.total + a.deposit_amount');
    expect(report).not.toContain('deposit_amount +');
    expect(report.toLowerCase()).not.toContain('discount');

    const lines = sliceBetween(service, 'async getCommissionReportLines(', 'async getDepositPrePaymentReport(');
    expect(lines).toContain('COALESCE(si.total, 0)::float AS revenue');
    expect(lines).toContain('COALESCE(si.commission_amount, 0)::float AS commission_amount');
    expect(lines).toContain('COALESCE(s.is_deposit, false) = false');
    expect(lines).not.toContain('si.total + si.commission_amount');
    expect(lines.toLowerCase()).not.toContain('discount');

    const signed = signCommissionLineAmounts(false, 36_000, 7_500);
    expect(signed.revenue).toBe(36_000);
    expect(signed.commission).toBe(7_500);
    expect(signed.revenue).not.toBe(36_000 + 7_500);

    expect(mapCommissionReportLine({
      lineId: 'dep',
      specialistId: 'id-zahra',
      dateYmd: '2026-10-26',
      customerName: 'Ayşe',
      itemName: 'Peşinat',
      itemType: 'service',
      revenue: 15_000,
      commissionAmount: 1_500,
      isDeposit: true,
      paymentStatus: 'paid',
    })).toBeNull();
  });

  it('gün sonu Z pasta dosyası bu işte bozulmaz', () => {
    const zReport = readFileSync(resolve('src/utils/posZReport.ts'), 'utf8');
    const zPie = readFileSync(resolve('src/components/reports/DayEndZPieChart.tsx'), 'utf8');
    expect(zReport).toContain('export function buildDayEndZPieSlices');
    expect(zReport).toContain('discount: round2(Number(statement.discount) || 0)');
    expect(zPie).toContain('data-testid="z-report-pie"');
    expect(zPie).not.toContain('buildCommissionStaffPieSlices');
  });
});
