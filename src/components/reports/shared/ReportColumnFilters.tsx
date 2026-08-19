import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useLanguage } from '../../../contexts/LanguageContext';
import { moduleTranslations, translate as translateModule } from '../../../locales/module-translations';

export type ReportColumnFilterType = 'text' | 'number' | 'date';

export interface ReportColumnFilterDef {
  key: string;
  label: string;
  type?: ReportColumnFilterType;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportColumnFiltersProps {
  columns: ReportColumnFilterDef[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onClear?: () => void;
  disabled?: boolean;
  extraCells?: number;
}

const noop = (_k: string) => '';

export const ReportColumnFilters: React.FC<ReportColumnFiltersProps> = ({
  columns,
  values,
  onChange,
  onClear,
  disabled,
  extraCells = 0,
}) => {
  const { language } = useLanguage();
  const langKey = (language || 'tr') as 'tr' | 'en' | 'ar' | 'ku';
  const tm = (key: string): string => {
    const fallback = (moduleTranslations as Record<string, Record<string, string>>)[key]?.[langKey];
    if (fallback) return fallback;
    return translateModule(key, langKey, noop);
  };

  const handleChange = (key: string, raw: string) => {
    const next = { ...values };
    if (raw == null || raw === '') {
      delete next[key];
    } else {
      next[key] = raw;
    }
    onChange(next);
  };

  const hasAnyValue = Object.values(values || {}).some((v) => !!v);

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      {columns.map((col, idx) => {
        const widthClass = col.width ?? 'min-w-[120px]';
        const align = col.align ?? 'left';
        const alignClass =
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
        const value = values[col.key] ?? '';
        const type = col.type ?? 'text';
        const placeholder = `${tm('reportColumnFiltersFilter')} ${col.label}`;
        const cellAlign =
          type === 'number'
            ? { inputMode: 'decimal' as const, inputAlign: 'right' as const }
            : type === 'date'
              ? { inputAlign: 'center' as const }
              : { inputAlign: align === 'right' ? ('right' as const) : ('left' as const) };
        return (
          <th
            key={`${col.key}-${idx}`}
            className={`${alignClass} px-2 py-1.5 font-normal`}
            scope="col"
          >
            <Input
              size="small"
              allowClear
              disabled={disabled}
              value={value}
              onChange={(e) => handleChange(col.key, e.target.value)}
              placeholder={placeholder}
              type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
              prefix={type === 'text' ? <SearchOutlined className="text-slate-400" /> : undefined}
              className={`${widthClass} text-xs`}
              {...cellAlign}
            />
          </th>
        );
      })}
      {extraCells > 0 &&
        Array.from({ length: extraCells }).map((_, i) => (
          <th key={`extra-${i}`} className="px-2 py-1.5 font-normal" scope="col">
            {i === 0 && hasAnyValue && onClear ? (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                title={tm('reportColumnFiltersClearAll')}
              >
                {tm('reportColumnFiltersClearAll')}
              </button>
            ) : null}
          </th>
        ))}
    </tr>
  );
};

export default ReportColumnFilters;
