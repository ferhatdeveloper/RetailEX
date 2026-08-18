/**
 * RetailEX — Ortak rapor toolbar.
 *
 * `SurveyReportToolbar` ve `CommissionReport` kalıbından evrim. Tek satır
 * üst başlık (icon + title + subtitle) | filter alanları | reset + refresh +
 * export dropdown. Koyu tema uyumlu.
 *
 * Bağımlılıklar:
 *   - ReportDateRangePresets (dateRange için)
 *   - ExportMenu (Excel/CSV/PDF/Print)
 *   - useFilterState + ReportFilterConfig (types/reportFilters.ts)
 *
 * Refactor notu: SurveyReportToolbar/CommissionReport HENÜZ bu bileşeni
 * kullanmıyor; uyumlu çalışacak biçimde kurgulandı. İleride sıralı olarak
 * taşınabilir.
 */

import React, { useMemo } from 'react';
import { Select, Switch } from 'antd';
import { RefreshCw, RotateCcw, Search, Calendar } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../ui/utils';
import { ReportDateRangePresets } from './ReportDateRangePresets';
import {
  buildReportDateRangeChange,
  defaultReportDateRange,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';
import { ExportMenu, type ExportFormat } from './ExportMenu';
import type {
  ReportFilterConfig,
  ReportFilterField,
  ReportFilterState,
} from '../../types/reportFilters';

/* -------------------------------------------------------------------------- */
/* API                                                                          */
/* -------------------------------------------------------------------------- */

export type { ExportFormat };
export type ReportToolbarExportFormat = ExportFormat;

export interface ReportToolbarProps {
  /** Başlık (i18n key veya ham metin) */
  title: string;
  /** Alt başlık (i18n key veya ham metin) — opsiyonel */
  subtitle?: string;
  /** Başlık yanı ikon */
  icon?: React.ReactNode;
  /** İkon container rengi (örn. 'bg-violet-100 text-violet-700') */
  iconClassName?: string;
  /** Filter konfigürasyonu (alanlar) */
  filters: ReportFilterConfig;
  /** Runtime filter state */
  state: ReportFilterState;
  /** Alan güncelleme callback */
  onChange: (key: string, value: unknown) => void;
  /** Reset callback (buton göstermek için ver) */
  onReset?: () => void;
  /** Yenile / rapor çalıştır callback */
  onRefresh?: () => void;
  /** Yenile/refresh yükleniyor mu */
  loading?: boolean;
  /** Export dispatch — toolbar'da ExportMenu gösterir */
  onExport?: (format: ExportFormat) => void;
  /** Toolbar içine ekstra filter alanı (slot) */
  extraFilters?: React.ReactNode;
  /** Birincil aksiyon butonu (örn. "Raporu Çalıştır") */
  primaryAction?: React.ReactNode;
  /** Sağ taraf ekstra aksiyonlar (export dışında) */
  rightActions?: React.ReactNode;
  /** Refresh buton metni override */
  refreshLabel?: string;
  /** Reset buton metni override */
  resetLabel?: string;
  /** Container ek className */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Tek alan render                                                              */
/* -------------------------------------------------------------------------- */

interface FieldRendererProps {
  field: ReportFilterField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  tm: (k: string) => string;
}

function FieldRenderer({ field, value, onChange, tm }: FieldRendererProps) {
  // dateRange → ReportDateRangePresets (mevcut bileşen)
  if (field.type === 'dateRange') {
    const v =
      value && typeof value === 'object'
        ? (value as ReportDateRangeValue)
        : defaultReportDateRange('month');
    return (
      <ReportDateRangePresets
        value={v}
        onChange={(next) => onChange(field.key, next)}
        tm={tm}
      />
    );
  }

  const labelEl = (
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
      {tm(field.labelKey)}
    </span>
  );

  if (field.type === 'date') {
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'shrink-0')}>
        {labelEl}
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent min-w-0"
          />
        </div>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'w-40')}>
        {labelEl}
        <Select
          value={(value as string) || undefined}
          onChange={(v) => onChange(field.key, v ?? '')}
          placeholder={field.placeholder ? tm(field.placeholder) : undefined}
          allowClear
          size="middle"
          options={(field.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          className="w-full"
        />
      </label>
    );
  }

  if (
    field.type === 'multiSelect' ||
    field.type === 'cariSelect' ||
    field.type === 'productSelect' ||
    field.type === 'staffSelect'
  ) {
    const arr = (Array.isArray(value) ? value : []) as string[];
    const placeholder = field.placeholder
      ? tm(field.placeholder)
      : tm('filterSelectPlaceholder');
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'w-56')}>
        {labelEl}
        <Select
          mode="multiple"
          value={arr}
          onChange={(v) => onChange(field.key, v ?? [])}
          placeholder={placeholder}
          allowClear
          maxTagCount="responsive"
          size="middle"
          options={(field.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          className="w-full"
        />
      </label>
    );
  }

  if (field.type === 'range') {
    const v = (value as { min?: number | null; max?: number | null }) ?? {};
    return (
      <div className={cn('flex flex-col gap-1', field.width ?? 'shrink-0')}>
        {labelEl}
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 bg-white">
          <input
            type="number"
            inputMode="decimal"
            value={v.min ?? ''}
            placeholder={String(field.min ?? '')}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === '' ? null : Number(raw);
              onChange(field.key, {
                ...v,
                min: Number.isNaN(next) ? null : next,
              });
            }}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent w-16"
          />
          <span className="text-slate-400 text-xs">—</span>
          <input
            type="number"
            inputMode="decimal"
            value={v.max ?? ''}
            placeholder={String(field.max ?? '')}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === '' ? null : Number(raw);
              onChange(field.key, {
                ...v,
                max: Number.isNaN(next) ? null : next,
              });
            }}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent w-16"
          />
        </div>
      </div>
    );
  }

  if (field.type === 'text') {
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'w-56')}>
        {labelEl}
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="search"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder ? tm(field.placeholder) : tm('filterSearchPlaceholder')}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent w-full"
          />
        </div>
      </label>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
        <Switch
          size="small"
          checked={Boolean(value)}
          onChange={(v) => onChange(field.key, v)}
        />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {labelEl}
        </span>
      </label>
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                      */
/* -------------------------------------------------------------------------- */

export function ReportToolbar({
  title,
  subtitle,
  icon,
  iconClassName = 'bg-violet-100 text-violet-700',
  filters,
  state,
  onChange,
  onReset,
  onRefresh,
  loading = false,
  onExport,
  extraFilters,
  primaryAction,
  rightActions,
  refreshLabel,
  resetLabel,
  className,
}: ReportToolbarProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();

  // dateRange alanları için default üretimde ReportDateRangeValue gerekir;
  // state boş string ise default month ver.
  const visibleFields = useMemo(
    () =>
      filters.fields.filter(
        (f) => (f.visible ? f.visible(state) : true),
      ),
    [filters.fields, state],
  );

  const containerClass = cn(
    'rounded-3xl border p-6 shadow-sm space-y-4',
    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100',
    className,
  );

  return (
    <div className={containerClass}>
      {/* Üst satır: ikon + başlık */}
      <div className="flex items-center gap-3 min-w-0">
        {icon ? (
          <div
            className={cn(
              'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
              iconClassName,
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              'text-xl font-black truncate',
              darkMode ? 'text-slate-100' : 'text-gray-900',
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className={cn(
                'text-xs font-semibold truncate',
                darkMode ? 'text-slate-400' : 'text-gray-500',
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {rightActions}
      </div>

      {/* Alt satır: filter alanları + aksiyonlar */}
      <div
        className={cn(
          'flex flex-wrap items-end gap-2 w-full pt-3',
          darkMode ? 'border-gray-700' : 'border-gray-50',
          'border-t',
        )}
      >
        {visibleFields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={state[field.key]}
            onChange={onChange}
            tm={tm}
          />
        ))}

        {extraFilters}

        {/* Sağ aksiyon grubu */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className={cn(
                'h-9 px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors',
                darkMode
                  ? 'bg-gray-700 text-slate-200 hover:bg-gray-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              <RotateCcw size={14} />
              {resetLabel ?? tm('filterReset')}
            </button>
          ) : null}

          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={cn(
                'h-9 px-4 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors',
                darkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400/40'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300',
              )}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {refreshLabel ?? (loading ? tm('filterLoading') : tm('filterRefresh'))}
            </button>
          ) : null}

          {onExport ? (
            <ExportMenu onExport={onExport} loading={loading} />
          ) : null}

          {primaryAction}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Convenience re-export — `dateRange` field default üretmek için              */
/* -------------------------------------------------------------------------- */

export { buildReportDateRangeChange, defaultReportDateRange };
export type { ReportDateRangeValue };
