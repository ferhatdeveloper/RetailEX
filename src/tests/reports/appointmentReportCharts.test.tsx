/**
 * Randevu raporu ekranı. Halka ve çubuklar gerçek kayıttan çizilir.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentReport } from '../../components/beauty/components/AppointmentReport';
import { translate } from '../../locales/module-translations';
import { beautyService } from '../../services/beautyService';
import { defaultReportDateRange } from '../../utils/reportDatePresets';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('../../contexts/LanguageContext', async () => {
  const actual = await vi.importActual<typeof import('../../locales/module-translations')>(
    '../../locales/module-translations',
  );
  return {
    useLanguage: () => ({
      language: 'tr',
      tm: (key: string) => actual.translate(key, 'tr'),
    }),
  };
});

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => ({ selectedFirm: { name: 'Merkez' } }),
}));

vi.mock('../../services/beautyService', () => ({
  beautyService: {
    getAppointmentsInRange: vi.fn(),
  },
}));

function appointment(partial: Record<string, unknown>) {
  return {
    id: 'apt',
    date: '',
    time: '10:00',
    duration: 60,
    status: 'completed',
    staff_id: 'st-1',
    specialist_name: 'Ayşe Demir',
    ...partial,
  };
}

describe('randevu raporu grafikleri', () => {
  const range = defaultReportDateRange('month');

  beforeEach(() => {
    vi.mocked(beautyService.getAppointmentsInRange).mockReset();
  });

  it('beş randevunun halkasını, trendini ve saatini çizer', async () => {
    const day = range.from;
    vi.mocked(beautyService.getAppointmentsInRange).mockImplementation(async (from: string, to: string) => {
      if (day < from || day > to) return [];
      return [
        appointment({ id: '1', date: day, time: '09:00', status: 'completed' }),
        appointment({ id: '2', date: day, time: '10:00', status: 'closed' }),
        appointment({ id: '3', date: day, time: '11:00', status: 'no_show' }),
        appointment({ id: '4', date: day, time: '14:00', status: 'cancelled' }),
        appointment({ id: '5', date: day, time: '16:00', status: 'completed', staff_id: 'st-2', specialist_name: 'Kemal Usta' }),
      ] as never;
    });

    render(<AppointmentReport />);

    const donut = await screen.findByTestId('appointment-report-donut');
    const slices = [...donut.querySelectorAll('path[data-slice]')];
    const counts = slices.map((node) => Number(node.getAttribute('data-count')));
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(donut.querySelector('[data-slice="came"]')?.getAttribute('data-count')).toBe('3');
    expect(donut.querySelector('[data-slice="noShow"]')?.getAttribute('data-count')).toBe('1');
    expect(donut.querySelector('[data-slice="cancelled"]')?.getAttribute('data-count')).toBe('1');
    expect(donut.textContent).toContain('%');
    expect(screen.getByTestId('appointment-report-center').textContent).toContain('5');
    expect(screen.getByTestId('appointment-report-center').textContent).toContain(translate('bApptReportCenterTotal', 'tr'));

    const trend = screen.getByTestId('appointment-report-trend');
    expect(trend.querySelector('[data-series="came"]')?.getAttribute('data-value')).toBe('3');
    expect(trend.querySelector('[data-series="noShow"]')?.getAttribute('data-value')).toBe('1');
    expect(trend.querySelector('[data-series="cancelled"]')?.getAttribute('data-value')).toBe('1');
    expect(trend.querySelectorAll('line').length).toBeGreaterThan(0);

    const hours = screen.getByTestId('appointment-report-hours');
    const hourValues = [...hours.querySelectorAll('[data-series="hour"]')].map((node) => Number(node.getAttribute('data-value')));
    expect(hourValues.reduce((sum, value) => sum + value, 0)).toBe(5);
    expect(hours.querySelectorAll('rect[data-series="hour"]').length).toBe(5);

    expect(screen.getByText('Ayşe Demir')).toBeTruthy();
    expect(screen.getByText('Kemal Usta')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Merve');
    expect(document.body.textContent).not.toContain('Selin');
    expect(screen.getByText('%75')).toBeTruthy();

    fireEvent.click(donut.querySelector('[data-slice="cancelled"]') as Element);
    expect(screen.getByTestId('appointment-slice-cancelled')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('appointment-report-center').textContent).toContain('5');
    expect(screen.getByTestId('appointment-report-donut').querySelector('[data-slice="came"]')?.getAttribute('data-count')).toBe('3');
  });

  it('kayıt yoksa halka çizmez', async () => {
    vi.mocked(beautyService.getAppointmentsInRange).mockResolvedValue([]);
    render(<AppointmentReport />);
    expect(await screen.findByTestId('appointment-report-empty')).toBeTruthy();
    expect(screen.queryByTestId('appointment-report-donut')).toBeNull();
    expect(screen.queryByTestId('appointment-report-trend')).toBeNull();
    expect(document.body.textContent).not.toContain('Merve');
  });
});
