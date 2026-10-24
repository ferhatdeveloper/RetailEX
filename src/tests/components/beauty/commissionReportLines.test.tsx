import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { CommissionReport } from '../../../components/beauty/components/CommissionReport';
import { beautyService } from '../../../services/beautyService';

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
    getCommissionReport: vi.fn(),
    getCommissionReportLines: vi.fn(),
  },
}));

const staffRows = [
  {
    specialist_id: 'id-arz',
    name: 'ARZ',
    service_revenue: 100_000,
    service_commission: 30_000,
    service_rate_effective: 30,
    product_revenue: 0,
    product_commission: 0,
    product_rate_effective: 0,
    total_revenue: 100_000,
    total_commission: 30_000,
    total_transactions: 2,
    total_deposit: 0,
    total_outstanding: 0,
  },
  {
    specialist_id: 'id-zahra',
    name: 'ZAHRA',
    service_revenue: 150_000,
    service_commission: 15_000,
    service_rate_effective: 10,
    product_revenue: 15_000,
    product_commission: 0,
    product_rate_effective: 0,
    total_revenue: 165_000,
    total_commission: 15_000,
    total_transactions: 3,
    total_deposit: 0,
    total_outstanding: 0,
  },
];

describe('Prim raporu satır dökümü', () => {
  beforeEach(() => {
    vi.mocked(beautyService.getCommissionReport).mockResolvedValue({
      rows: staffRows,
      history_rows: [],
      totals: {
        service_revenue: 250_000,
        service_commission: 45_000,
        product_revenue: 15_000,
        product_commission: 0,
        total_revenue: 265_000,
        total_commission: 45_000,
        total_transactions: 5,
        total_deposit: 0,
        total_outstanding: 0,
      },
    });
    vi.mocked(beautyService.getCommissionReportLines).mockImplementation(async (_start, _end, specialistId) => {
      if (specialistId === 'id-zahra') {
        return [
          {
            line_id: 'z1',
            specialist_id: 'id-zahra',
            date_ymd: '2026-10-12',
            customer_or_fiche: 'Ayşe',
            item_name: 'Saç kesimi',
            kind: 'service',
            revenue: 150_000,
            commission_rate: 10,
            commission_amount: 15_000,
          },
        ];
      }
      if (specialistId === 'id-arz') {
        return [
          {
            line_id: 'a1',
            specialist_id: 'id-arz',
            date_ymd: '2026-10-08',
            customer_or_fiche: 'Mehmet',
            item_name: 'Lazer epilasyon',
            kind: 'service',
            revenue: 100_000,
            commission_rate: 30,
            commission_amount: 30_000,
          },
        ];
      }
      return [];
    });
  });

  it('satır tıklanınca modal o uzmanın kalemini gösterir, toplam satırı açılmaz', async () => {
    render(
      <ThemeProvider>
        <CommissionReport />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('commission-staff-id-zahra')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('TOPLAM'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(beautyService.getCommissionReportLines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('commission-staff-id-zahra'));

    expect(await screen.findByTestId('commission-line-title')).toHaveTextContent('ZAHRA — prim kalemleri');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Saç kesimi')).toBeTruthy();
    expect(screen.getByText('Ayşe')).toBeTruthy();
    expect(screen.queryByText('Lazer epilasyon')).toBeNull();
    expect(screen.queryByText('Mehmet')).toBeNull();
    expect(vi.mocked(beautyService.getCommissionReportLines).mock.calls.map((call) => call[2])).toEqual(['id-zahra']);

    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(translate('bCommissionLineDetailTitle', lang).includes('{name}')).toBe(true);
      expect(translate('bCommissionLineCustomerOrFiche', lang).trim().length).toBeGreaterThan(0);
      expect(translate('bCommissionLineEmpty', lang).trim().length).toBeGreaterThan(0);
    }
  });
});
