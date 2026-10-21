import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ClinicReportCenter } from '../../../components/beauty/components/ClinicReportCenter';
import { GENERAL_REPORTS_TAB } from '../../../utils/clinicReportCenter';

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

describe('Klinik rapor merkezi ekranı', () => {
  it('Tüm raporlar genel rapor anahtarını açar', async () => {
    const onOpenAllReports = vi.fn();
    render(
      <ThemeProvider>
        <ClinicReportCenter onOpenAllReports={onOpenAllReports} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('clinic-report-center')).toBeTruthy();
    expect(await screen.findByText('Şube')).toBeTruthy();
    expect(await screen.findByText('Merkez')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Kurum' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Gelir-Gider' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Alacak ve Tahsilat' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Hizmet' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Müşteri' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Randevu' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Personel Performans' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Denetim' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('clinic-report-all'));
    expect(onOpenAllReports).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('clinic-report-all').textContent).toBe('Tüm raporlar');
    expect(GENERAL_REPORTS_TAB).toBe('reports');
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(translate('bCrcAllReports', lang).trim().length).toBeGreaterThan(0);
    }
  });
});
