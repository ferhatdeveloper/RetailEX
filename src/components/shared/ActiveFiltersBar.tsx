import React from 'react';
import { X } from 'lucide-react';

/** Tablo üstünde görünen aktif kolon filtresi (kolon · operatör · değer). */
export interface ActiveFilterChip {
  id: string;
  columnLabel: string;
  operatorLabel: string;
  valueLabel: string;
}

export interface ActiveFiltersBarProps {
  chips: ActiveFilterChip[];
  onRemove: (id: string) => void;
  onClearAll?: () => void;
  disabled?: boolean;
  title?: string;
  clearAllLabel: string;
  removeAriaLabel: string;
  className?: string;
}

export function filterOperatorI18nKey(op: string): string {
  const aliases: Record<string, string> = {
    notContains: 'doesNotContain',
    range: 'between',
    multiselect: 'multiSelect',
  };
  const normalized = aliases[op] ?? op;
  if (normalized === 'multiSelect') return 'multiSelect';
  return `reportColumnFiltersOp${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export const ActiveFiltersBar: React.FC<ActiveFiltersBarProps> = ({
  chips,
  onRemove,
  onClearAll,
  disabled,
  title,
  clearAllLabel,
  removeAriaLabel,
  className = '',
}) => {
  if (chips.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 min-w-0 ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {title ? (
        <span className="text-[11px] font-semibold text-slate-500 shrink-0">{title}</span>
      ) : null}
      {chips.map((chip) => {
        const summary = `${chip.columnLabel} · ${chip.operatorLabel} · ${chip.valueLabel}`;
        return (
          <span
            key={chip.id}
            className="inline-flex items-center gap-1 max-w-[min(100%,28rem)] rounded-full border border-blue-200 bg-blue-50 text-blue-950 pl-2.5 pr-0.5 py-0.5 text-[11px] font-medium"
            title={summary}
          >
            <span className="min-w-0 truncate">
              <span className="font-semibold">{chip.columnLabel}</span>
              <span className="text-blue-700/80"> · {chip.operatorLabel} · </span>
              <span>{chip.valueLabel}</span>
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(chip.id)}
              className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-700 hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`${removeAriaLabel}: ${chip.columnLabel}`}
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
          </span>
        );
      })}
      {onClearAll ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClearAll}
          className="shrink-0 h-6 px-2 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {clearAllLabel}
        </button>
      ) : null}
    </div>
  );
};

export default ActiveFiltersBar;
