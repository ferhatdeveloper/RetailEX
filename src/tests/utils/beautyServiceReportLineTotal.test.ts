/**
 * Güzellik satır raporu — Toplam Tutar peşinatı ciroya eklemez.
 *
 * Ekran: 50.000 ve 60.000 hizmet, rezervasyon payları 9.000 ve 11.000.
 * Toplam tutar 110.000 olmalı; 59.000, 71.000 ve 130.000 olmamalı.
 * Rezervasyon kolonu bilgi olarak 9.000 + 11.000 = 20.000 kalır.
 */
import { describe, expect, it } from 'vitest';
import {
  beautyServiceReportGrandMoney,
  beautyServiceReportLineMoney,
} from '../../utils/beautyServiceReportLineTotal';

describe('güzellik satır raporu toplam tutar', () => {
  const rows = [
    beautyServiceReportLineMoney(50_000, 9_000),
    beautyServiceReportLineMoney(60_000, 11_000),
  ];
  const grand = beautyServiceReportGrandMoney(rows);

  it('satır toplamları hizmet tutarıdır', () => {
    expect(rows.map((row) => row.lineTotal)).toEqual([50_000, 60_000]);
    expect(rows.map((row) => row.amount)).toEqual([50_000, 60_000]);
  });

  it('rezervasyon payı bilgi kolonunda kalır', () => {
    expect(rows.map((row) => row.depositAmount)).toEqual([9_000, 11_000]);
    expect(grand.depositAmount).toBe(20_000);
  });

  it('genel toplam tutar 110.000 olur, 130.000 olmaz', () => {
    expect(grand.amount).toBe(110_000);
    expect(grand.lineTotal).toBe(110_000);
    expect(grand.lineTotal).toBe(50_000 + 60_000);
    expect(grand.lineTotal).not.toBe(110_000 + 20_000);
    expect(rows[0].lineTotal).not.toBe(50_000 + 9_000);
    expect(rows[1].lineTotal).not.toBe(60_000 + 11_000);
  });

  it('peşinat sıfırken toplam yine hizmet tutarıdır', () => {
    const row = beautyServiceReportLineMoney(50_000, 0);
    expect(row).toEqual({ amount: 50_000, depositAmount: 0, lineTotal: 50_000 });
  });

  it('geçersiz tutar sıfır sayılır', () => {
    const row = beautyServiceReportLineMoney(Number.NaN, Number.NaN);
    expect(row).toEqual({ amount: 0, depositAmount: 0, lineTotal: 0 });
  });
});
