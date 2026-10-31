/**
 * Kasa Durumu — tarih yoksa İstanbul takvim yılının 1 Ocak–31 Aralık aralığı.
 * Hazır düğme ve elle girilen aralık olduğu gibi kalır.
 */
import { describe, expect, it } from 'vitest';
import { cashStatusMovementRows } from '../../utils/cashStatusTotals';
import { istanbulTodayDateKey, istanbulYearEndDateKey } from '../../utils/localCalendarDate';
import {
  buildCashStatusRange,
  emptyCashStatusDate,
  resolveCashStatusQuery,
} from '../../utils/reportDatePresets';

const noon = new Date('2026-10-24T09:00:00.000Z');

function line(no: string, day: string, amount: number) {
  return {
    kasa_id: 'k1',
    islem_tipi: amount >= 0 ? 'KASA_GIRIS' : 'KASA_CIKIS',
    tutar: Math.abs(amount),
    islem_tarihi: day,
    payment_method: 'cash',
    islem_no: no,
  };
}

describe('Kasa Durumu varsayılan yıl aralığı', () => {
  it('tarih yoksa aralık verilen yılın 1 Ocak–31 Aralık günleridir, iki uç dahildir', () => {
    const empty = emptyCashStatusDate();
    expect(empty.from).toBe('');
    expect(empty.to).toBe('');

    const query = resolveCashStatusQuery(empty, noon);
    expect(query.from).toBe('2026-01-01');
    expect(query.to).toBe('2026-12-31');
    expect(query.to).toBe(istanbulYearEndDateKey(noon));
    expect(query.filtered).toBe(false);
    expect(query.balanceFromRegisters).toBe(true);

    const rows = cashStatusMovementRows({
      lines: [
        line('ONCE', '2025-12-31', 1),
        line('YILBASI', '2026-01-01', 2),
        line('YILSONU', '2026-12-31', -3),
        line('SONRA', '2027-01-01', 4),
      ],
      dateFrom: query.from,
      dateTo: query.to,
    });

    expect(rows.map((row) => row.ficheNo).sort()).toEqual(['YILBASI', 'YILSONU']);
    expect(rows.find((row) => row.ficheNo === 'YILBASI')?.date).toBe('2026-01-01');
    expect(rows.find((row) => row.ficheNo === 'YILSONU')?.date).toBe('2026-12-31');
    expect(rows.find((row) => row.ficheNo === 'YILSONU')?.amount).toBe(-3);
  });

  it('tarih temizlenince yine aynı yıl aralığına döner', () => {
    const cleared = emptyCashStatusDate();
    const again = resolveCashStatusQuery(cleared, noon);
    expect(again.from).toBe('2026-01-01');
    expect(again.to).toBe('2026-12-31');
    expect(again.filtered).toBe(false);
  });

  it('hazır düğme ve elle girilen aralık olduğu gibi kalır', () => {
    const today = resolveCashStatusQuery(buildCashStatusRange('today', 0, '', '', noon), noon);
    expect(today.from).toBe('2026-10-24');
    expect(today.to).toBe('2026-10-24');
    expect(today.filtered).toBe(true);
    expect(today.balanceFromRegisters).toBe(false);

    const week = resolveCashStatusQuery(buildCashStatusRange('week', 0, '', '', noon), noon);
    expect(week.from).not.toBe('2026-01-01');
    expect(week.to).not.toBe('2026-12-31');
    expect(week.filtered).toBe(true);

    const month = resolveCashStatusQuery(buildCashStatusRange('month', 0, '', '', noon), noon);
    expect(month.from).toBe('2026-10-01');
    expect(month.to).toBe('2026-10-24');

    const lastMonth = resolveCashStatusQuery(buildCashStatusRange('lastMonth', 0, '', '', noon), noon);
    expect(lastMonth.from).toBe('2026-09-01');
    expect(lastMonth.to).toBe('2026-09-30');

    const picked = resolveCashStatusQuery(
      buildCashStatusRange('custom', 0, '2026-03-02', '2026-03-18', noon),
      noon,
    );
    expect(picked.from).toBe('2026-03-02');
    expect(picked.to).toBe('2026-03-18');
    expect(picked.filtered).toBe(true);
    expect(picked.balanceFromRegisters).toBe(false);
  });

  it('yıl, İstanbul takvim gününden okunur', () => {
    const stillThisYear = new Date('2026-12-31T20:30:00.000Z');
    expect(istanbulTodayDateKey(stillThisYear)).toBe('2026-12-31');
    const thisYear = resolveCashStatusQuery(emptyCashStatusDate(), stillThisYear);
    expect(thisYear.from).toBe('2026-01-01');
    expect(thisYear.to).toBe('2026-12-31');

    const nextYear = new Date('2026-12-31T21:30:00.000Z');
    expect(istanbulTodayDateKey(nextYear)).toBe('2027-01-01');
    const rolled = resolveCashStatusQuery(emptyCashStatusDate(), nextYear);
    expect(rolled.from).toBe('2027-01-01');
    expect(rolled.to).toBe('2027-12-31');
  });
});
