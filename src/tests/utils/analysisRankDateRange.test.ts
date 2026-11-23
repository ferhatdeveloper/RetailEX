import { describe, expect, it } from 'vitest';
import {
  analysisRankCustomRange,
  analysisRankPresetRange,
  analysisRankQueryWindow,
  filterSalesForAnalysisRange,
  saleDayInAnalysisRange,
} from '../../utils/analysisRankDateRange';

describe('kategori ve çok satan tarih aralığı', () => {
  const noon = new Date(2026, 10, 23, 12, 0, 0);

  it('geçen ay önceki takvim ayının tamamıdır', () => {
    expect(analysisRankPresetRange('lastMonth', noon)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(analysisRankPresetRange('lastMonth', new Date(2026, 0, 15, 12))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(analysisRankPresetRange('lastMonth', new Date(2026, 2, 10, 12))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(analysisRankQueryWindow('2026-10-01', '2026-10-31')).toEqual({
      fromDate: '2026-10-01T00:00:00Z',
      toDate: '2026-10-31T23:59:59Z',
    });
  });

  it('bugün, bu hafta ve bu ay yerel takvimle dolar', () => {
    expect(analysisRankPresetRange('today', noon)).toEqual({
      from: '2026-11-23',
      to: '2026-11-23',
    });
    expect(analysisRankPresetRange('week', new Date(2026, 10, 25, 12))).toEqual({
      from: '2026-11-23',
      to: '2026-11-25',
    });
    expect(analysisRankPresetRange('week', new Date(2026, 10, 22, 12))).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(analysisRankPresetRange('month', noon)).toEqual({
      from: '2026-11-01',
      to: '2026-11-23',
    });
  });

  it('kategori ve çok satan süzgeci aralığın iki ucunu da alır, tutarı değiştirmez', () => {
    const rows = [
      { date: '2026-10-31T10:00:00', amount: 5, quantity: 1 },
      { date: '2026-11-01T10:00:00', amount: 10, quantity: 2 },
      { date: '2026-11-15T10:00:00', amount: 20, quantity: 3 },
      { date: '2026-11-16T10:00:00', amount: 30, quantity: 4 },
    ];
    const kept = filterSalesForAnalysisRange(rows, '2026-11-01', '2026-11-15');
    expect(kept.map((row) => row.amount)).toEqual([10, 20]);
    expect(kept.map((row) => row.quantity)).toEqual([2, 3]);
    expect(kept[0]).toEqual(rows[1]);
    expect(saleDayInAnalysisRange('2026-11-01T10:00:00', '2026-11-15', '2026-11-01')).toBe(true);
    expect(saleDayInAnalysisRange('2026-10-31T10:00:00', '2026-11-01', '2026-11-15')).toBe(false);
    expect(analysisRankCustomRange('2026-11-15', '2026-11-01')).toEqual({
      from: '2026-11-01',
      to: '2026-11-15',
    });
  });
});
