/**
 * Prim kalemi: prim ciroya eklenmez, peşinat yazılmaz, iade bir kez eksidir.
 */
import { describe, expect, it } from 'vitest';
import {
  mapCommissionReportLine,
  signCommissionLineAmounts,
} from '../../utils/commissionReportLines';

describe('prim kalemi işareti', () => {
  it('prim ciroya eklenmez', () => {
    const signed = signCommissionLineAmounts(false, 100_000, 30_000);
    expect(signed.revenue).toBe(100_000);
    expect(signed.commission).toBe(30_000);
    expect(signed.rate).toBe(30);
    expect(signed.revenue).not.toBe(100_000 + 30_000);
  });

  it('artı yazılmış iade bir kez eksi olur, ikinci işaret 0 üretmez', () => {
    const once = signCommissionLineAmounts(true, 10_000, 1_000);
    expect(once.revenue).toBe(-10_000);
    expect(once.commission).toBe(-1_000);
    const twice = signCommissionLineAmounts(true, once.revenue, once.commission);
    expect(twice.revenue).toBe(-10_000);
    expect(twice.commission).toBe(-1_000);
    expect(twice.revenue).not.toBe(0);
    expect(twice.rate).toBe(10);
  });

  it('peşinat kalemi döküme girmez ve müşteri adı fişten önce gelir', () => {
    expect(
      mapCommissionReportLine({
        lineId: 'dep',
        specialistId: 'spc-1',
        dateYmd: '2026-10-02',
        customerName: 'Ayşe',
        ficheNo: 'BEA-1',
        itemName: 'Peşinat',
        itemType: 'service',
        revenue: 9_000,
        commissionAmount: 900,
        isDeposit: false,
        paymentStatus: 'paid',
      }),
    ).toBeNull();
    expect(
      mapCommissionReportLine({
        lineId: 'sale',
        specialistId: 'spc-1',
        dateYmd: '2026-10-02',
        customerName: 'Ayşe',
        ficheNo: 'BEA-2',
        itemName: 'Saç kesimi',
        itemType: 'service',
        revenue: 50_000,
        commissionAmount: 5_000,
        isDeposit: false,
        paymentStatus: 'paid',
      }),
    ).toMatchObject({
      customer_or_fiche: 'Ayşe',
      revenue: 50_000,
      commission_amount: 5_000,
    });
    expect(
      mapCommissionReportLine({
        lineId: 'fiche',
        specialistId: 'spc-1',
        dateYmd: '2026-10-03',
        customerName: '',
        ficheNo: 'BEA-3',
        itemName: 'Şampuan',
        itemType: 'product',
        revenue: 15_000,
        commissionAmount: 0,
        isDeposit: false,
        paymentStatus: 'paid',
      })?.customer_or_fiche,
    ).toBe('BEA-3');
  });
});