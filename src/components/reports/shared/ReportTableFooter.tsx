import React, { useMemo } from 'react';
import { formatNumber } from '../../../utils/formatNumber';
import { useLanguage } from '../../../contexts/LanguageContext';

export type AggregateType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'none';

export interface ReportFooterColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  aggregate?: AggregateType;
  /** Hücre değerini render etmek için. number ise formatNumber uygulanır. */
  formatter?: (val: number) => string;
  /** Hücre genişliği (CSS class ya da sayı). */
  widthClass?: string;
  /** Birinci kolon için etiket (örn. "TOPLAM"). aggregate yoksa bu yazılır. */
  labelOverride?: string;
}

export interface ReportTableFooterProps {
  rows: any[];
  columns: ReportFooterColumn[];
  /** Para birimi/son ek: append edilir (örn. " IQD"). */
  append?: string;
  /** Tfoot sınıfı (override). */
  className?: string;
  /** Para birimi gibi formatlanacak alanlar için global formatter (örn. value + ' IQD'). */
  currencyFormatter?: (val: number) => string;
}

function coerceNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = String(v).trim().replace(/\s+/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export const ReportTableFooter: React.FC<ReportTableFooterProps> = ({
  rows,
  columns,
  append,
  className = '',
  currencyFormatter,
}) => {
  const { tm: globalTm } = useLanguage();
  const totalLabel = globalTm('reportsFooterTotalUpper');

  const cells = useMemo(() => {
    return columns.map((col) => {
      const agg = col.aggregate ?? 'none';
      if (agg === 'none') {
        return { col, value: null as number | null, isLabel: true };
      }
      const values = rows.map((r) => coerceNumber(r?.[col.key]));
      let v = 0;
      switch (agg) {
        case 'sum':
          v = values.reduce((s, n) => s + n, 0);
          break;
        case 'count':
          v = rows.length;
          break;
        case 'avg':
          v = values.length > 0 ? values.reduce((s, n) => s + n, 0) / values.length : 0;
          break;
        case 'min':
          v = values.length > 0 ? Math.min(...values) : 0;
          break;
        case 'max':
          v = values.length > 0 ? Math.max(...values) : 0;
          break;
        default:
          v = 0;
      }
      return { col, value: v, isLabel: false };
    });
  }, [rows, columns]);

  return (
    <tfoot
      className={`bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-900 ${className}`.trim()}
    >
      <tr>
        {cells.map(({ col, value, isLabel }, idx) => {
          const align = col.align ?? (idx === 0 ? 'left' : 'right');
          const alignClass =
            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
          const baseCell = `${alignClass} px-4 py-3 ${col.widthClass ?? ''}`.trim();
          if (isLabel) {
            return (
              <td key={col.key} className={baseCell}>
                {col.labelOverride ?? (idx === 0 ? totalLabel : '')}
              </td>
            );
          }
          let display: string;
          if (col.formatter) {
            display = col.formatter(value ?? 0);
          } else if (currencyFormatter) {
            display = currencyFormatter(value ?? 0);
          } else {
            display = formatNumber(value ?? 0, 2, false);
            if (append) display = `${display}${append}`;
          }
          return (
            <td key={col.key} className={`${baseCell} tabular-nums`}>
              {display}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
};

export default ReportTableFooter;