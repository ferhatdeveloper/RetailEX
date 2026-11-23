import { describe, expect, it } from 'vitest';
import {
  formatCommissionRatePercent,
  formatHistoryCommissionRate,
  mapCommissionReportLine,
  singleCommissionKindRate,
} from '../../utils/commissionReportLines';

describe('prim dökümü oranı', () => {
  it('gösterilen oran mevcut satır oranıdır ve tutarlar değişmez', () => {
    const line = mapCommissionReportLine({
      lineId: 'ln-1',
      specialistId: 'spc-1',
      dateYmd: '2026-11-22',
      customerName: 'Ayşe',
      itemName: 'Saç boyama',
      itemType: 'service',
      revenue: 875_000,
      commissionAmount: 87_500,
      paymentStatus: 'paid',
    });
    expect(line).not.toBeNull();
    expect(line?.revenue).toBe(875_000);
    expect(line?.commission_amount).toBe(87_500);
    expect(line?.commission_rate).toBe(10);
    expect(formatCommissionRatePercent(line!.commission_rate)).toBe('10%');
    expect(formatHistoryCommissionRate({
      serviceRate: line!.commission_rate,
      productRate: null,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('10%');
    expect(line?.revenue).not.toBe(875_000 + 87_500);
  });

  it('hizmet ve ürün oranları ayrıysa ikisini yazar, aynıysa tek yüzde, karışıkta ortalama yok', () => {
    expect(formatHistoryCommissionRate({
      serviceRate: 10,
      productRate: 5,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('Hizmet 10% · Ürün 5%');
    expect(formatHistoryCommissionRate({
      serviceRate: 10,
      productRate: 10,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('10%');
    expect(formatHistoryCommissionRate({
      serviceRate: 0,
      productRate: null,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('0%');
    expect(formatHistoryCommissionRate({
      serviceRate: null,
      productRate: null,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('');
    expect(formatHistoryCommissionRate({
      serviceRate: null,
      productRate: 5,
      serviceLineCount: 2,
      productLineCount: 1,
      serviceLabel: 'Hizmet',
      productLabel: 'Ürün',
    })).toBe('Ürün 5%');
    expect(singleCommissionKindRate(10, 10, 4)).toBe(10);
    expect(singleCommissionKindRate(10, 20, 2)).toBeNull();
    expect(singleCommissionKindRate(0, 0, 1)).toBe(0);
    expect(singleCommissionKindRate(10, 10, 0)).toBeNull();
    expect(formatCommissionRatePercent(20.5)).toBe('20.5%');
  });
});
