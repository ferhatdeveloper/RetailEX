import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { CommissionReport } from '../../../components/beauty/components/CommissionReport';
import { beautyService } from '../../../services/beautyService';

vi.mock('recharts', async () => {
  const React = await import('react');
  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => React.createElement('div', null, children),
    PieChart: ({ children }: { children?: ReactNode }) => React.createElement('div', null, children),
    Pie: ({
      data,
      onClick,
    }: {
      data?: Array<{ key: string; amount: number; sharePercent?: number }>;
      onClick?: (row: { key: string; amount: number; sharePercent?: number }) => void;
    }) => React.createElement(
      'ul',
      { 'data-testid': 'commission-pie-slices' },
      (data || []).map((item) => React.createElement(
        'li',
        { key: item.key },
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `commission-pie-hit-${item.key}`,
            onClick: () => onClick?.(item),
          },
          `${item.key}:${item.amount}:${item.sharePercent ?? ''}`,
        ),
      )),
    ),
    Cell: () => null,
    Tooltip: () => null,
  };
});

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
    specialist_id: 'id-zahra',
    name: 'ZAHRA',
    service_revenue: 36_000,
    service_commission: 7_500,
    service_rate_effective: 20.83,
    product_revenue: 4_000,
    product_commission: 0,
    product_rate_effective: 0,
    total_revenue: 40_000,
    total_commission: 7_500,
    total_transactions: 2,
    total_deposit: 15_000,
    total_outstanding: 65_000,
  },
  {
    specialist_id: 'id-admin',
    name: 'System Administrator',
    service_revenue: 0,
    service_commission: 0,
    service_rate_effective: 0,
    product_revenue: 0,
    product_commission: 0,
    product_rate_effective: 0,
    total_revenue: 0,
    total_commission: 0,
    total_transactions: 0,
    total_deposit: 65_000,
    total_outstanding: 0,
  },
];

const historyRows = [
  {
    date_ymd: '2026-10-26',
    specialist_id: 'id-zahra',
    name: 'ZAHRA',
    service_commission: 7_500,
    product_commission: 0,
    total_commission: 7_500,
  },
  {
    date_ymd: '2026-10-26',
    specialist_id: 'id-admin',
    name: 'System Administrator',
    service_commission: 0,
    product_commission: 0,
    total_commission: 0,
  },
  {
    date_ymd: '2026-10-25',
    specialist_id: 'id-admin',
    name: 'System Administrator',
    service_commission: 0,
    product_commission: 0,
    total_commission: 0,
  },
];

const linePool = [
  {
    line_id: 'z-svc',
    specialist_id: 'id-zahra',
    date_ymd: '2026-10-26',
    customer_or_fiche: 'Ayşe',
    item_name: 'Saç boyama',
    kind: 'service' as const,
    revenue: 36_000,
    commission_rate: 20.83,
    commission_amount: 7_500,
  },
  {
    line_id: 'z-prd',
    specialist_id: 'id-zahra',
    date_ymd: '2026-10-26',
    customer_or_fiche: 'Ayşe',
    item_name: 'Şampuan',
    kind: 'product' as const,
    revenue: 4_000,
    commission_rate: 0,
    commission_amount: 0,
  },
  {
    line_id: 'z-other-day',
    specialist_id: 'id-zahra',
    date_ymd: '2026-10-20',
    customer_or_fiche: 'Eski',
    item_name: 'Dünkü kalem',
    kind: 'service' as const,
    revenue: 10_000,
    commission_rate: 10,
    commission_amount: 1_000,
  },
  {
    line_id: 'admin-line',
    specialist_id: 'id-admin',
    date_ymd: '2026-10-26',
    customer_or_fiche: 'Sistem',
    item_name: 'Yönetici kalemi',
    kind: 'service' as const,
    revenue: 0,
    commission_rate: 0,
    commission_amount: 0,
  },
];

function renderReport() {
  return render(
    <ThemeProvider>
      <CommissionReport />
    </ThemeProvider>,
  );
}

describe('Prim raporu tarihsel döküm ve pasta', () => {
  beforeEach(() => {
    vi.mocked(beautyService.getCommissionReport).mockResolvedValue({
      rows: staffRows,
      history_rows: historyRows,
      totals: {
        service_revenue: 36_000,
        service_commission: 7_500,
        product_revenue: 4_000,
        product_commission: 0,
        total_revenue: 40_000,
        total_commission: 7_500,
        total_transactions: 2,
        total_deposit: 80_000,
        total_outstanding: 65_000,
      },
    });
    vi.mocked(beautyService.getCommissionReportLines).mockResolvedValue(linePool);
  });

  it('personel özet tablosu yok; tarihsel döküm kartların altında', async () => {
    renderReport();

    expect(await screen.findByTestId('commission-history-2026-10-26-id-zahra')).toBeTruthy();
    expect(screen.queryByText('PERSONEL BAZINDA PRİM')).toBeNull();
    expect(screen.queryByText('Rezervasyon Tutarı')).toBeNull();
    expect(screen.queryByText('Kalan Tutar')).toBeNull();
    expect(screen.queryByTestId('commission-staff-id-zahra')).toBeNull();
    expect(screen.getByText('Tarihsel prim dökümü')).toBeTruthy();
    expect(screen.getByTestId('commission-kpi-service')).toHaveTextContent('7.500');
    expect(screen.getByTestId('commission-kpi-product')).toHaveTextContent('0');
    expect(screen.getByTestId('commission-kpi-total')).toHaveTextContent('7.500');

    const kpis = screen.getByTestId('commission-kpis');
    const history = screen.getByTestId('commission-history-panel');
    const pie = screen.getByTestId('commission-pie-panel');
    expect(kpis.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(history.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tarihsel satır tıklanınca o gün ve uzman eşleşir', async () => {
    renderReport();
    expect(await screen.findByTestId('commission-history-2026-10-26-id-zahra')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('TOPLAM'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(beautyService.getCommissionReportLines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('commission-history-2026-10-26-id-zahra'));

    expect(await screen.findByTestId('commission-line-title')).toHaveTextContent('ZAHRA — prim kalemleri');
    const dialog = screen.getByRole('dialog');
    expect(screen.getByTestId('commission-line-subtitle')).toHaveTextContent('26.10.2026 günü hizmet ve ürün satırları');
    expect(dialog).toHaveTextContent('Saç boyama');
    expect(dialog).toHaveTextContent('Hizmet');
    expect(dialog).toHaveTextContent('Şampuan');
    expect(dialog).toHaveTextContent('Ürün');
    expect(dialog).toHaveTextContent('Ayşe');
    expect(dialog).toHaveTextContent('7.500');
    expect(dialog).not.toHaveTextContent('Dünkü kalem');
    expect(dialog).not.toHaveTextContent('Yönetici kalemi');
    expect(dialog.textContent || '').not.toContain('43.500');
    expect(vi.mocked(beautyService.getCommissionReportLines).mock.calls[0]).toEqual([
      '2026-10-26',
      '2026-10-26',
      'id-zahra',
    ]);

    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(translate('bCommissionLineDetailTitle', lang).includes('{name}')).toBe(true);
      expect(translate('bCommissionLineDetailSubtitle', lang).includes('{date}')).toBe(true);
      expect(translate('bCommissionLineEmpty', lang).trim().length).toBeGreaterThan(0);
      expect(translate('bCommissionPieTitle', lang).trim().length).toBeGreaterThan(0);
    }
  });

  it('pasta dilimi ZAHRA 7.500 ve toplam 7.500; sıfır prim dilime girmez; süzgeç tutarı değiştirmez', async () => {
    renderReport();
    expect(await screen.findByTestId('commission-pie-center')).toHaveTextContent('7.500');
    expect(screen.getByTestId('commission-pie-center')).toHaveTextContent('Toplam prim');
    expect(screen.getByTestId('commission-pie-hit-id-zahra')).toHaveTextContent('id-zahra:7500:100');
    expect(screen.queryByTestId('commission-pie-hit-id-admin')).toBeNull();

    const zahra = screen.getByTestId('commission-pie-slice-id-zahra');
    const admin = screen.getByTestId('commission-pie-slice-id-admin');
    expect(zahra).toHaveAttribute('data-in-chart', '1');
    expect(zahra).toHaveAttribute('data-amount', '7500');
    expect(zahra).toHaveAttribute('data-share', '100');
    expect(admin).toHaveAttribute('data-in-chart', '0');
    expect(admin).toHaveAttribute('data-amount', '0');
    expect(admin).toHaveAttribute('data-share', '0');
    expect(admin).toHaveTextContent('System Administrator');

    fireEvent.click(screen.getByTestId('commission-pie-hit-id-zahra'));
    expect(zahra).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('commission-history-2026-10-26-id-zahra')).toBeTruthy();
    expect(screen.queryByTestId('commission-history-2026-10-26-id-admin')).toBeNull();
    expect(screen.queryByTestId('commission-history-2026-10-25-id-admin')).toBeNull();
    expect(screen.getByTestId('commission-kpi-total')).toHaveTextContent('7.500');
    expect(screen.getByTestId('commission-kpi-service')).toHaveTextContent('7.500');
    expect(screen.getByTestId('commission-kpi-product')).toHaveTextContent('0');
    expect(screen.getByTestId('commission-pie-center')).toHaveTextContent('7.500');
    expect(zahra).toHaveAttribute('data-amount', '7500');

    fireEvent.click(screen.getByTestId('commission-pie-hit-id-zahra'));
    expect(zahra).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('commission-history-2026-10-26-id-admin')).toBeTruthy();
    expect(screen.getByTestId('commission-history-2026-10-25-id-admin')).toBeTruthy();

    fireEvent.click(admin);
    expect(admin).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('commission-history-2026-10-26-id-zahra')).toBeNull();
    expect(screen.getByTestId('commission-history-2026-10-26-id-admin')).toBeTruthy();
    expect(screen.getByTestId('commission-history-2026-10-25-id-admin')).toBeTruthy();
    expect(screen.getByTestId('commission-kpi-total')).toHaveTextContent('7.500');
    expect(screen.getByTestId('commission-pie-center')).toHaveTextContent('7.500');
    expect(zahra).toHaveAttribute('data-amount', '7500');

    fireEvent.click(admin);
    expect(admin).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('commission-history-2026-10-26-id-zahra')).toBeTruthy();
  });
});
