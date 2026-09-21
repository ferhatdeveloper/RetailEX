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
   * Column count. Defaults to item count (capped at 7).
   * Side-by-side; wraps on small screens when columns ≥ 4.
   */
  columns?: 2 | 3 | 4 | 5 | 6 | 7;
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
  const cols = columns ?? Math.min(Math.max(items.length, 1), 7);

  return (
    <div
      className={cn(
        'grid gap-2',
        cols === 2 && 'grid-cols-2',
        cols === 3 && 'grid-cols-3',
        cols === 4 && 'grid-cols-2 md:grid-cols-4',
        cols === 5 && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
        cols === 6 && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6',
        cols === 7 && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7',
        className,
      )}
      role="group"
    >
      {items.map((item, i) => (
        <div
          key={item.key ?? String(i)}
          className={cn(
            'min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-slate-600 dark:bg-slate-800',
            itemClassName,
            item.className,
          )}
        >
          <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
            {item.label}
          </p>
          <div
            className={cn(
              'mt-0.5 truncate text-sm font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100',
              item.valueClassName,
            )}
          >
            {item.value}
          </div>
          {item.hint != null && item.hint !== false ? (
            <div className="mt-0.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
              {item.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
