import { Fragment, useState } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import type { DayEndZPieSliceKey } from '../../utils/posZReport';
import { DayEndZPieChart } from './DayEndZPieChart';
import './DayEndZReportLayout.css';

export interface DayEndZStatementLabels {
  transactionCount: string;
  grossSales: string;
  discount: string;
  salesReturn: string;
  expense: string;
  netSales: string;
  reservation: string;
  netCash: string;
}

export interface DayEndZStatementPanelProps {
  darkMode?: boolean;
  transactionCount: number;
  grossSales: number;
  discount: number;
  salesReturn: number;
  expense: number;
  netSales: number;
  reservationAmount: number;
  netCash: number;
  title: string;
  labels: DayEndZStatementLabels;
}

type LineKey = 'txn' | 'gross' | 'discount' | 'return' | 'expense' | 'net-sales' | 'reservation' | 'net-cash';

interface StatementLine {
  key: LineKey;
  label: string;
  value: string;
  color: string;
  emphasize?: boolean;
  sliceKey: DayEndZPieSliceKey | null;
}

function lineEmphasis(
  sliceKey: DayEndZPieSliceKey | null,
  selected: DayEndZPieSliceKey | null,
): 'plain' | 'selected' | 'dim' {
  if (!selected) return 'plain';
  return sliceKey === selected ? 'selected' : 'dim';
}

/**
 * Gün sonu Z listesi ve halkası.
 * Dilim seçimi satırı belirginleştirir. Tutarlar yeniden hesaplanmaz.
 */
export function DayEndZStatementPanel({
  darkMode = false,
  transactionCount,
  grossSales,
  discount,
  salesReturn,
  expense,
  netSales,
  reservationAmount,
  netCash,
  title,
  labels,
}: DayEndZStatementPanelProps) {
  const [selected, setSelected] = useState<DayEndZPieSliceKey | null>(null);
  const toggle = (key: DayEndZPieSliceKey) => {
    setSelected((current) => (current === key ? null : key));
  };
  const ink = darkMode ? '#f8fafc' : '#0f172a';
  const deduct = darkMode ? '#f87171' : '#dc2626';
  const lines: StatementLine[] = [
    {
      key: 'txn',
      label: labels.transactionCount,
      value: String(transactionCount),
      color: ink,
      sliceKey: null,
    },
    {
      key: 'gross',
      label: labels.grossSales,
      value: formatNumber(grossSales, 2, false),
      color: ink,
      sliceKey: null,
    },
    {
      key: 'discount',
      label: labels.discount,
      value: formatNumber(discount, 2, false),
      color: ink,
      sliceKey: 'discount',
    },
    {
      key: 'return',
      label: labels.salesReturn,
      value: formatNumber(salesReturn, 2, false),
      color: deduct,
      sliceKey: 'salesReturn',
    },
    {
      key: 'expense',
      label: labels.expense,
      value: formatNumber(expense, 2, false),
      color: deduct,
      sliceKey: 'expense',
    },
    {
      key: 'net-sales',
      label: labels.netSales,
      value: formatNumber(netSales, 2, false),
      color: darkMode ? '#6ee7b7' : '#166534',
      emphasize: true,
      sliceKey: 'netSales',
    },
    {
      key: 'reservation',
      label: labels.reservation,
      value: formatNumber(reservationAmount, 2, false),
      color: ink,
      sliceKey: 'reservation',
    },
    {
      key: 'net-cash',
      label: labels.netCash,
      value: formatNumber(netCash, 2, false),
      color: darkMode ? '#a7f3d0' : '#064e3b',
      emphasize: true,
      sliceKey: null,
    },
  ];

  return (
    <div
      data-testid="z-report-statement"
      className={darkMode ? 'z-day-split z-day-dark' : 'z-day-split'}
    >
      <div className="z-day-lines-wrap">
        <div className="z-day-lines">
          {lines.map((row) => {
            const emphasis = lineEmphasis(row.sliceKey, selected);
            const tone = emphasis === 'selected' ? ' is-selected' : emphasis === 'dim' ? ' is-dim' : '';
            const strong = row.emphasize ? ' is-strong' : '';
            return (
              <Fragment key={row.key}>
                <div
                  className={`z-day-label${strong}${tone}`}
                  data-emphasis={emphasis}
                  data-line={row.key}
                >
                  {row.label}
                </div>
                <div
                  data-testid={`z-line-${row.key}`}
                  data-emphasis={emphasis}
                  data-amount={row.value}
                  className={`z-day-value${strong}${tone}`}
                  style={{ color: row.color }}
                >
                  {row.value}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="z-day-chart-wrap">
        <DayEndZPieChart
          netSales={netSales}
          reservationAmount={reservationAmount}
          salesReturn={salesReturn}
          expense={expense}
          discount={discount}
          netCash={netCash}
          title={title}
          netCashLabel={labels.netCash}
          darkMode={darkMode}
          selectedKey={selected}
          onToggle={toggle}
          labels={{
            netSales: labels.netSales,
            reservation: labels.reservation,
            salesReturn: labels.salesReturn,
            expense: labels.expense,
            discount: labels.discount,
          }}
        />
      </div>
    </div>
  );
}
