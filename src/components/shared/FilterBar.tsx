/**
 * RetailEX — Sadece filter alanlarını render eden inline bar.
 *
 * `ReportToolbar`'dan bağımsız; cari listesi, ürün listesi, personel listesi
 * gibi küçük listelerde kullanılır. Title / icon / refresh / export yok —
 * yalnızca alanlar + "Temizle" butonu.
 *
 * Kalıp: ReportFilterConfig + ReportFilterState + onChange → render alanları.
 */

import React, { useMemo } from 'react';
import { Select, Switch } from 'antd';
import { Search, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../ui/utils';
import type {
  ReportFilterConfig,
  ReportFilterField,
  ReportFilterState,
} from '../../types/reportFilters';

/* -------------------------------------------------------------------------- */
/* Tek alan render                                                             */
/* -------------------------------------------------------------------------- */

interface FieldRendererProps {
  field: ReportFilterField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const { tm } = useLanguage();

  const labelEl = (
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
      {tm(field.labelKey)}
    </span>
  );

  // dateRange için ReportToolbar içindeki preset'i yeniden kullanmıyoruz;
  // FilterBar daha kompakt, sadece başlangıç-bitiş input.
  if (field.type === 'dateRange') {
    const v = (value as { from?: string; to?: string }) ?? {};
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'shrink-0')}>
        {labelEl}
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 bg-white">
          <input
            type="date"
            value={v.from ?? ''}
            onChange={(e) => onChange(field.key, { ...v, from: e.target.value })}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent w-[110px]"
          />
          <span className="text-slate-400 text-xs">—</span>
          <input
            type="date"
            value={v.to ?? ''}
            onChange={(e) => onChange(field.key, { ...v, to: e.target.value })}
            className="text-xs font-bold text-slate-700 outline-none bg-transparent w-[110px]"
          />
        </div>
      </label>
    );
  }

  if (field.type === 'date') {
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'shrink-0')}>
        {labelEl}
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white outline-none"
        />
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
    return (
      <label className={cn('flex flex-col gap-1', field.width ?? 'w-56')}>
        {labelEl}
        <Select
          mode="multiple"
          value={arr}
          onChange={(v) => onChange(field.key, v ?? [])}
          placeholder={field.placeholder ? tm(field.placeholder) : tm('filterSelectPlaceholder')}
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
              const next = e.target.value === '' ? null : Number(e.target.value);
              onChange(field.key, { ...v, min: Number.isNaN(next) ? null : next });
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
              const next = e.target.value === '' ? null : Number(e.target.value);
              onChange(field.key, { ...v, max: Number.isNaN(next) ? null : next });
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
/* FilterBar                                                                    */
/* -------------------------------------------------------------------------- */

export interface FilterBarProps {
  config: ReportFilterConfig;
  state: ReportFilterState;
  onChange: (key: string, value: unknown) => void;
  /** Temizle (reset) callback — verilirse sağda buton gösterilir */
  onReset?: () => void;
  /** Ekstra sarmalayıcı className */
  className?: string;
  /** Yatay wrap (default true) */
  wrap?: boolean;
}

export function FilterBar({
  config,
  state,
  onChange,
  onReset,
  className,
  wrap = true,
}: FilterBarProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();

  const visibleFields = useMemo(
    () =>
      config.fields.filter(
        (f) => (f.visible ? f.visible(state) : true),
      ),
    [config.fields, state],
  );

  return (
    <div
      className={cn(
        'flex items-end gap-3 p-3 rounded-2xl border',
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200',
        wrap ? 'flex-wrap' : 'flex-nowrap overflow-x-auto',
        className,
      )}
    >
      {visibleFields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={state[field.key]}
          onChange={onChange}
        />
      ))}

      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-extrabold shrink-0 ml-auto transition-colors',
            darkMode
              ? 'bg-gray-700 text-slate-200 hover:bg-gray-600'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          )}
        >
          <X size={14} />
          {tm('filterClear')}
        </button>
      ) : null}
    </div>
  );
}
