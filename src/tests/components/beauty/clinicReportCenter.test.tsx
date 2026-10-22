import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ClinicReportCenter } from '../../../components/beauty/components/ClinicReportCenter';
import { beautyService } from '../../../services/beautyService';
import { expenseAPI } from '../../../services/api/expenses';
import { GENERAL_REPORTS_TAB } from '../../../utils/clinicReportCenter';
import { localTodayDateKey } from '../../../utils/localCalendarDate';
import type { BeautyAppointment } from '../../../types/beauty';

vi.mock('../../../contexts/LanguageContext', async () => {
  const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
    '../../../locales/module-translations',
  );
  return {
    useLanguage: () => ({
      language: 'tr',
      tm: (key: string) => actual.translate(key, 'tr'),
    }),
  };
});

vi.mock('../../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => ({ selectedFirm: { name: 'Merkez' } }),
}));

vi.mock('../../../services/beautyService', () => ({
  beautyService: {
    getAppointmentsInRange: vi.fn(async () => []),
    getSalesWithItemsForExportRange: vi.fn(async () => []),
    getProductSalesReturnLines: vi.fn(async () => []),
    getCustomers: vi.fn(async () => []),
    getSpecialists: vi.fn(async () => []),
    getServices: vi.fn(async () => []),
    getBranches: vi.fn(async () => []),
    listAuditLog: vi.fn(async () => []),
  },
}));

vi.mock('../../../services/api/expenses', () => ({
  expenseAPI: { getAll: vi.fn(async () => []) },
}));

const MENU_LABELS = [
  'Kurum',
  'Gelir-Gider',
  'Alacak ve Tahsilat',
  'Hizmet',
  'Müşteri',
  'Randevu',
  'Personel Performans',
  'Denetim',
  'Tüm raporlar',
];

describe('Klinik rapor merkezi ekranı', () => {
  beforeEach(() => {
    vi.mocked(beautyService.getAppointmentsInRange).mockResolvedValue([]);
  });

  it('açılır listede Tüm raporlar genel rapor anahtarını ister', async () => {
    const onOpenAllReports = vi.fn();
    render(
      <ThemeProvider>
        <ClinicReportCenter onOpenAllReports={onOpenAllReports} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('clinic-report-center')).toBeTruthy();
    expect(await screen.findByText('Kurum Performansı')).toBeTruthy();
    expect(screen.getByText('Bugün')).toBeTruthy();
    expect(screen.getByText('Bu hafta')).toBeTruthy();
    expect(screen.getByText('Bu ay')).toBeTruthy();
    expect(screen.getByText('Geçen ay')).toBeTruthy();
    expect((await screen.findAllByText('Şube')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Merkez')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab')).toBeNull();
    fireEvent.click(screen.getByTestId('clinic-report-menu-trigger'));
    const menu = screen.getByTestId('clinic-report-menu-list');
    expect([...menu.querySelectorAll('[role="option"]')].map((el) => el.textContent)).toEqual(MENU_LABELS);
    const allReports = screen.getByTestId('clinic-report-all');
    expect(allReports.textContent).toBe('Tüm raporlar');
    fireEvent.click(allReports);
    expect(onOpenAllReports).toHaveBeenCalledTimes(1);
    expect(GENERAL_REPORTS_TAB).toBe('reports');
    expect(GENERAL_REPORTS_TAB).not.toBe('clinic_reports');
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(translate('bCrcAllReports', lang).trim().length).toBeGreaterThan(0);
    }
  });

  it('hizmet raporu satırı randevu kaydından gelir', async () => {
    const day = localTodayDateKey();
    vi.mocked(beautyService.getAppointmentsInRange).mockResolvedValue([
      {
        id: 'a1',
        duration: 30,
        status: 'completed',
        total_price: 50_000,
        is_package_session: false,
        service_name: 'HAIR CUT',
        customer_id: 'c1',
        customer_name: 'FERDİN BEY',
        date: day,
        deposit_amount: 9_000,
      },
      {
        id: 'a2',
        duration: 45,
        status: 'completed',
        total_price: 60_000,
        is_package_session: false,
        service_name: 'HAIR PINK COLOR',
        customer_id: 'c1',
        customer_name: 'FERDİN BEY',
        date: day,
        deposit_amount: 11_000,
        time: '11:00',
      },
    ] as BeautyAppointment[]);
    render(
      <ThemeProvider>
        <ClinicReportCenter onOpenAllReports={vi.fn()} />
      </ThemeProvider>,
    );
    expect((await screen.findAllByText('Şube')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('clinic-report-menu-trigger'));
    fireEvent.click(screen.getByTestId('clinic-report-option-service'));
    expect((await screen.findAllByText('HAIR CUT')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('HAIR PINK COLOR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('110.000').length).toBeGreaterThan(0);
    expect(screen.queryByText('130.000')).toBeNull();
    expect(screen.queryByText('140.000')).toBeNull();
  });

  it('sorgular düşerse yükleme biter ve hata metni kalır', async () => {
    const down = new Error('down');
    vi.mocked(beautyService.getAppointmentsInRange).mockRejectedValue(down);
    vi.mocked(beautyService.getSalesWithItemsForExportRange).mockRejectedValue(down);
    vi.mocked(beautyService.getProductSalesReturnLines).mockRejectedValue(down);
    vi.mocked(beautyService.getCustomers).mockRejectedValue(down);
    vi.mocked(beautyService.getSpecialists).mockRejectedValue(down);
    vi.mocked(beautyService.getServices).mockRejectedValue(down);
    vi.mocked(beautyService.getBranches).mockRejectedValue(down);
    vi.mocked(beautyService.listAuditLog).mockRejectedValue(down);
    vi.mocked(expenseAPI.getAll).mockRejectedValue(down);
    render(
      <ThemeProvider>
        <ClinicReportCenter onOpenAllReports={vi.fn()} />
      </ThemeProvider>,
    );
    expect(await screen.findByTestId('clinic-report-error')).toHaveTextContent('Rapor alınamadı');
    expect(screen.queryByTestId('clinic-report-loading')).toBeNull();
    expect(screen.getAllByText('Şube').length).toBeGreaterThan(0);
    expect(screen.queryByText('140.000')).toBeNull();
  });
});
