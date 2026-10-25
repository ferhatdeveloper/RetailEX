/**
 * Görseldeki gün sonu: işlem 3, brüt 130.000, indirim 0, iade 15.000,
 * gider 55.000, net satış 60.000, rezervasyon 5.000, net nakit 65.000.
 * Yüzde, dilim tutarı / dilimlerin toplamıdır. Seçim tutarı değiştirmez.
 */
import { createElement, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayEndZStatementPanel } from '../../components/reports/DayEndZStatementPanel';
import { buildDayEndZPieSlices, composeDayEndZStatement } from '../../utils/posZReport';

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
      onClick?: (row: { key: string }) => void;
    }) => React.createElement(
      'ul',
      { 'data-testid': 'z-pie-slices' },
      (data || []).map((item) => React.createElement(
        'li',
        { key: item.key },
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `z-pie-hit-${item.key}`,
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

const labels = {
  transactionCount: 'Toplam işlem sayısı',
  grossSales: 'Brüt satış',
  discount: 'Toplam İndirim',
  salesReturn: 'Satış iade tutarı',
  expense: 'Toplam Gider',
  netSales: 'Net satış tutarı',
  reservation: 'Rezervasyon Tutarı',
  netCash: 'Net nakit tutarı',
};

function picture() {
  return composeDayEndZStatement({
    transactionCount: 3,
    grossSales: 130_000,
    discount: 0,
    salesReturn: 15_000,
    expense: 55_000,
    reservation: {
      appointments: [{
        id: 'eeeeeeee-5050-4050-8050-505050505050',
        status: 'pre_paid',
        depositAmount: 5_000,
        appointmentDate: '2026-10-25',
      }],
    },
  });
}

function renderPicture() {
  const row = picture();
  render(createElement(DayEndZStatementPanel, {
    transactionCount: row.transactionCount,
    grossSales: row.grossSales,
    discount: row.discount,
    salesReturn: row.salesReturn,
    expense: row.expense,
    netSales: row.netSales,
    reservationAmount: row.reservationAmount,
    netCash: row.netCash,
    title: 'Günün parçaları',
    labels,
  }));
  return row;
}

describe('gün sonu Z dilim yüzdesi — 130.000 görseli', () => {
  it('net satış 60.000, net nakit 65.000; yüzdeler 44, 4, 11 ve 41', () => {
    const row = picture();
    expect(row.transactionCount).toBe(3);
    expect(row.grossSales).toBe(130_000);
    expect(row.discount).toBe(0);
    expect(row.salesReturn).toBe(15_000);
    expect(row.expense).toBe(55_000);
    expect(row.netSales).toBe(60_000);
    expect(row.netSales).toBe(130_000 - 0 - 15_000 - 55_000);
    expect(row.reservationAmount).toBe(5_000);
    expect(row.netCash).toBe(65_000);
    expect(row.netCash).toBe(row.netSales + row.reservationAmount);

    const slices = buildDayEndZPieSlices(row);
    expect(slices.find((slice) => slice.key === 'netSales')).toMatchObject({
      amount: 60_000,
      inChart: true,
      sharePercent: 44,
    });
    expect(slices.find((slice) => slice.key === 'reservation')).toMatchObject({
      amount: 5_000,
      inChart: true,
      sharePercent: 4,
    });
    expect(slices.find((slice) => slice.key === 'salesReturn')).toMatchObject({
      amount: 15_000,
      inChart: true,
      sharePercent: 11,
    });
    expect(slices.find((slice) => slice.key === 'expense')).toMatchObject({
      amount: 55_000,
      inChart: true,
      sharePercent: 41,
    });
    expect(slices.find((slice) => slice.key === 'discount')).toMatchObject({
      amount: 0,
      inChart: false,
      sharePercent: 0,
    });
    const painted = slices.filter((slice) => slice.inChart);
    expect(painted.reduce((sum, slice) => sum + slice.sharePercent, 0)).toBe(100);
    expect(painted.reduce((sum, slice) => sum + slice.amount, 0)).toBe(135_000);
  });

  it('dilim seçimi listeyi süzer, kayıtlı tutarı değiştirmez', () => {
    renderPicture();
    expect(screen.getByTestId('z-line-txn')).toHaveTextContent('3');
    expect(screen.getByTestId('z-line-gross')).toHaveTextContent('130.000');
    expect(screen.getByTestId('z-line-discount')).toHaveTextContent('0');
    expect(screen.getByTestId('z-line-return')).toHaveTextContent('15.000');
    expect(screen.getByTestId('z-line-expense')).toHaveTextContent('55.000');
    expect(screen.getByTestId('z-line-net-sales')).toHaveTextContent('60.000');
    expect(screen.getByTestId('z-line-reservation')).toHaveTextContent('5.000');
    expect(screen.getByTestId('z-line-net-cash')).toHaveTextContent('65.000');
    expect(screen.getByTestId('z-report-pie-center')).toHaveTextContent('65.000');
    expect(screen.getByTestId('z-pie-hit-netSales')).toHaveTextContent('netSales:60000:44');
    expect(screen.queryByTestId('z-pie-hit-discount')).toBeNull();

    fireEvent.click(screen.getByTestId('z-pie-hit-salesReturn'));
    expect(screen.getByTestId('z-line-return')).toHaveAttribute('data-emphasis', 'selected');
    expect(screen.getByTestId('z-line-gross')).toHaveAttribute('data-emphasis', 'dim');
    expect(screen.getByTestId('z-line-net-cash')).toHaveAttribute('data-emphasis', 'dim');
    expect(screen.getByTestId('z-line-expense')).toHaveAttribute('data-emphasis', 'dim');
    expect(screen.getByTestId('z-report-pie-slice-salesReturn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('z-line-return')).toHaveAttribute('data-amount', '15.000');
    expect(screen.getByTestId('z-line-net-sales')).toHaveAttribute('data-amount', '60.000');
    expect(screen.getByTestId('z-line-net-cash')).toHaveAttribute('data-amount', '65.000');

    fireEvent.click(screen.getByTestId('z-pie-hit-salesReturn'));
    expect(screen.getByTestId('z-line-return')).toHaveAttribute('data-emphasis', 'plain');
    expect(screen.getByTestId('z-line-gross')).toHaveAttribute('data-emphasis', 'plain');

    fireEvent.click(screen.getByTestId('z-report-pie-slice-expense'));
    expect(screen.getByTestId('z-line-expense')).toHaveAttribute('data-emphasis', 'selected');
    expect(screen.getByTestId('z-line-net-sales')).toHaveAttribute('data-emphasis', 'dim');
    expect(screen.getByTestId('z-line-expense')).toHaveTextContent('55.000');
    expect(screen.getByTestId('z-line-gross')).toHaveTextContent('130.000');

    fireEvent.click(screen.getByTestId('z-report-pie-slice-expense'));
    expect(screen.getByTestId('z-line-expense')).toHaveAttribute('data-emphasis', 'plain');
    expect(screen.getByTestId('z-report-pie-slice-discount')).toHaveAttribute('data-in-chart', '0');
    expect(screen.getByTestId('z-report-pie-slice-discount')).toHaveAttribute('data-share', '0');
  });
});
