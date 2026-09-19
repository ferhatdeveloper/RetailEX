import type { ReactNode } from 'react';
import { cn } from '../../ui/utils';

export type ReportKpiItem = {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
  className?: string;
};

export type ReportKpiStripProps = {
  items: ReportKpiItem[];
  /** Optional strip wrapper class */
  className?: string;
  /** Default card chrome; overridden per item via item.className */
  itemClassName?: string;
  /**
   * Column count. Defaults to item count (capped at 5).
   * Side-by-side; wraps on small screens when columns ≥ 4.
   */
  columns?: 2 | 3 | 4 | 5;
};

/**
 * Compact horizontal KPI / summary strip for reports.
 * Prefer side-by-side cards with minimal padding — not stacked full-width blocks.
 */
export function ReportKpiStrip({
  items,
  className,
  itemClassName,
  columns,
}: ReportKpiStripProps) {
  const cols = columns ?? Math.min(Math.max(items.length, 1), 5);

  return (
    <div
      className={cn(
        'grid gap-2',
        cols === 2 && 'grid-cols-2',
        cols === 3 && 'grid-cols-3',
        cols === 4 && 'grid-cols-2 md:grid-cols-4',
        cols === 5 && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
        className,
      )}
      role="group"
    >
      {items.map((item, i) => (
        <div
          key={item.key ?? String(i)}
          className={cn(
            'min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm',
            itemClassName,
            item.className,
          )}
        >
          <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
            {item.label}
          </p>
          <div
            className={cn(
              'mt-0.5 truncate text-sm font-bold tabular-nums leading-tight text-slate-900',
              item.valueClassName,
            )}
          >
            {item.value}
          </div>
          {item.hint != null && item.hint !== false ? (
            <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
