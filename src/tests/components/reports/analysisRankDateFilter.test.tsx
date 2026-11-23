import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisRankDateFilter } from '../../../components/reports/AnalysisRankDateFilter';
import { translate } from '../../../locales/module-translations';
import { analysisRankPresetRange } from '../../../utils/analysisRankDateRange';

describe('Kategori ve çok satan tarih filtresi', () => {
  it('hazır aralık başlangıç ve bitişi doldurur', () => {
    const onChange = vi.fn();
    const lastMonth = analysisRankPresetRange('lastMonth', new Date(2026, 10, 23, 12, 0, 0));
    render(
      <AnalysisRankDateFilter
        value={{ preset: 'today', monthOffset: 0, from: '2026-11-23', to: '2026-11-23' }}
        onChange={onChange}
        tm={(key) => translate(key, 'tr')}
      />,
    );

    expect(screen.getByText('Başlangıç')).toBeTruthy();
    expect(screen.getByText('Bitiş')).toBeTruthy();
    expect(screen.getByTestId('analysis-rank-preset-today').textContent).toBe('Bugün');
    expect(screen.getByTestId('analysis-rank-preset-week').textContent).toBe('Bu hafta');
    expect(screen.getByTestId('analysis-rank-preset-month').textContent).toBe('Bu ay');
    expect(screen.getByTestId('analysis-rank-preset-lastMonth').textContent).toBe('Geçen ay');

    fireEvent.click(screen.getByTestId('analysis-rank-preset-lastMonth'));
    const picked = onChange.mock.calls[0]?.[0];
    expect(picked.preset).toBe('lastMonth');
    expect(picked.monthOffset).toBe(0);
    expect(picked.from.slice(8)).toBe('01');
    expect(Number(picked.to.slice(8))).toBeGreaterThan(27);
    expect(lastMonth.from.endsWith('-01')).toBe(true);
    expect(lastMonth.to).toBe('2026-10-31');
  });
});
