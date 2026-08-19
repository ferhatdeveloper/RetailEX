import React, { useMemo, useState } from 'react';
import { Input, Select } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useLanguage } from '../../../contexts/LanguageContext';
import { moduleTranslations, translate as translateModule } from '../../../locales/module-translations';
import type {
  FilterType,
  FilterValueMap,
  FilterValueModel,
  TextOperator,
  NumberOperator,
  DateOperator,
} from './useReportColumnFilters';

export type ReportColumnFilterType = FilterType;

export interface ReportColumnFilterDef {
  key: string;
  label: string;
  type?: ReportColumnFilterType;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportColumnFiltersProps {
  columns: ReportColumnFilterDef[];
  /** Yeni model — operatörlü filtre değerleri. */
  values: FilterValueMap;
  /**
   * Eski API ile uyumlu: `Record<string, string>` veya yeni model kabul eder.
   * Not: Bu bileşen operatör+value+value2 modelini kullandığı için, ReportsModule'da
   * `setFilters` yerine `setFilter` (tekil) tercih edilir.
   */
  onChange?: (next: FilterValueMap | Record<string, string>) => void;
  /** Tek bir kolon için model güncelleme — operatör + value + value2 burada geçilir. */
  onFilterChange?: (key: string, model: Partial<FilterValueModel>) => void;
  onClear?: () => void;
  disabled?: boolean;
  extraCells?: number;
  /** Operatör dropdown'ları görünür mü? Default true (DevExpress tarzı). */
  showOperators?: boolean;
  /** Panel aç/kapa (≡ toggle). Default true. */
  defaultPanelOpen?: boolean;
}

const DEFAULT_TEXT_OP: TextOperator = 'contains';
const DEFAULT_NUMBER_OP: NumberOperator = 'equals';
const DEFAULT_DATE_OP: DateOperator = 'equals';

function defaultModelFor(kind: FilterType): FilterValueModel {
  const operator = (
    kind === 'number' ? DEFAULT_NUMBER_OP : kind === 'date' ? DEFAULT_DATE_OP : DEFAULT_TEXT_OP
  ) as TextOperator | NumberOperator | DateOperator;
  return { kind, operator, value: '', value2: '' };
}

function modelFromLegacy(
  legacy: FilterValueMap | Record<string, string> | undefined,
  columns: ReportColumnFilterDef[],
): FilterValueMap {
  const out: FilterValueMap = {};
  if (!legacy) return out;
  const kindFor = (k: string): FilterType =>
    columns.find((c) => c.key === k)?.type || 'text';
  for (const [k, v] of Object.entries(legacy)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') continue;
      const kind = kindFor(k);
      out[k] = {
        kind,
        operator:
          kind === 'number' ? DEFAULT_NUMBER_OP : kind === 'date' ? DEFAULT_DATE_OP : DEFAULT_TEXT_OP,
        value: v,
        value2: '',
      };
    } else {
      const trimmed = (v.value ?? '').trim();
      const trimmed2 = (v.value2 ?? '').trim();
      if (trimmed === '' && trimmed2 === '') continue;
      out[k] = v;
    }
  }
  return out;
}

const TEXT_OPS: TextOperator[] = ['contains', 'equals', 'startsWith', 'endsWith', 'doesNotContain'];
const NUMBER_OPS: NumberOperator[] = ['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'between'];
const DATE_OPS: DateOperator[] = ['equals', 'before', 'after', 'between'];

export const ReportColumnFilters: React.FC<ReportColumnFiltersProps> = ({
  columns,
  values,
  onChange,
  onFilterChange,
  onClear,
  disabled,
  extraCells = 0,
  showOperators: showOperatorsProp,
  defaultPanelOpen = true,
}) => {
  const { language } = useLanguage();
  const langKey = (language || 'tr') as 'tr' | 'en' | 'ar' | 'ku';
  const tm = (key: string): string => {
    const fallback = (moduleTranslations as Record<string, Record<string, string>>)[key]?.[langKey];
    if (fallback) return fallback;
    return (translateModule as (k: string, l: typeof langKey) => string)(key, langKey);
  };

  const [internalPanelOpen, setInternalPanelOpen] = useState<boolean>(defaultPanelOpen);
  const showOperators = showOperatorsProp ?? internalPanelOpen;

  const normalized = useMemo(() => modelFromLegacy(values, columns), [values, columns]);

  const ensureModel = (key: string): FilterValueModel => {
    return normalized[key] || defaultModelFor(columns.find((c) => c.key === key)?.type || 'text');
  };

  const updateModel = (key: string, patch: Partial<FilterValueModel>) => {
    const cur = ensureModel(key);
    const next: FilterValueModel = {
      kind: patch.kind ?? cur.kind,
      operator: patch.operator ?? cur.operator,
      value: patch.value ?? cur.value,
      value2: patch.value2 ?? cur.value2,
    };
    // value ve value2 boşsa, kolonu sil
    const trimmedValue = (next.value ?? '').trim();
    const trimmedValue2 = (next.value2 ?? '').trim();
    const out: FilterValueMap = { ...normalized };
    if (trimmedValue === '' && trimmedValue2 === '') {
      delete out[key];
    } else {
      out[key] = next;
    }

    if (onFilterChange) {
      onFilterChange(key, { kind: next.kind, ...patch });
      // onFilterChange çağrıldığında parent state'i kendi yöneteceği için onChange'i çağırma
      return;
    }
    if (onChange) {
      // Eski API uyumluluğu: sadece value taşı, operatör/value2 sessizce yoksayılır
      // (ReportsModule'da setFilters yeni modele migrate edilir).
      if (Object.keys(out).length === 0) {
        onChange({});
        return;
      }
      const legacyOut: Record<string, string> = {};
      for (const [k, m] of Object.entries(out)) {
        legacyOut[k] = m.value;
      }
      onChange(legacyOut);
    }
  };

  const operatorOptions = (kind: FilterType) => {
    const ops = kind === 'number' ? NUMBER_OPS : kind === 'date' ? DATE_OPS : TEXT_OPS;
    return ops.map((op) => ({
      value: op,
      label: tm(`reportColumnFiltersOp${op.charAt(0).toUpperCase()}${op.slice(1)}`),
    }));
  };

  const isBetween = (m: FilterValueModel) =>
    (m.kind === 'number' || m.kind === 'date') && m.operator === 'between';

  const activeCount = Object.values(normalized).filter((m) => {
    const v = (m.value ?? '').trim();
    const v2 = (m.value2 ?? '').trim();
    return v !== '' || v2 !== '';
  }).length;

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      {showOperators && (
        <th className="px-1 py-1.5 font-normal w-8" scope="col">
          <button
            type="button"
            onClick={() => setInternalPanelOpen((v) => !v)}
            disabled={disabled}
            className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={tm('reportColumnFiltersTogglePanel')}
            aria-label={tm('reportColumnFiltersTogglePanel')}
          >
            <FilterOutlined className="text-[12px]" />
          </button>
        </th>
      )}
      {columns.map((col, idx) => {
        const widthClass = col.width ?? 'min-w-[120px]';
        const align = col.align ?? 'left';
        const alignClass =
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
        const type = col.type ?? 'text';
        const m = ensureModel(col.key);
        const placeholder = `${tm('reportColumnFiltersFilter')} ${col.label}`;
        const cellAlign =
          type === 'number'
            ? { inputMode: 'decimal' as const, inputAlign: 'right' as const }
            : type === 'date'
              ? { inputAlign: 'center' as const }
              : { inputAlign: align === 'right' ? ('right' as const) : ('left' as const) };
        const hasValue =
          (m.value ?? '').trim() !== '' || (m.value2 ?? '').trim() !== '';
        return (
          <th
            key={`${col.key}-${idx}`}
            className={`${alignClass} px-2 py-1.5 font-normal`}
            scope="col"
          >
            <div className="flex items-center gap-1">
              <div className="relative flex-1 min-w-0">
                <Input
                  size="small"
                  allowClear
                  disabled={disabled}
                  value={m.value}
                  onChange={(e) => updateModel(col.key, { value: e.target.value })}
                  placeholder={placeholder}
                  type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                  prefix={type === 'text' ? <SearchOutlined className="text-slate-400" /> : undefined}
                  className={`${widthClass} text-xs`}
                  {...cellAlign}
                />
                {hasValue && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white"
                    title={tm('reportColumnFiltersActive')}
                    aria-label={tm('reportColumnFiltersActive')}
                  />
                )}
              </div>
              {showOperators && (
                <Select
                  size="small"
                  disabled={disabled}
                  value={m.operator}
                  onChange={(op) => updateModel(col.key, { operator: op as typeof m.operator })}
                  options={operatorOptions(type)}
                  className="w-[88px] shrink-0 text-[11px]"
                  popupMatchSelectWidth={false}
                  variant="borderless"
                />
              )}
              {showOperators && isBetween(m) && (
                <Input
                  size="small"
                  disabled={disabled}
                  value={m.value2}
                  onChange={(e) => updateModel(col.key, { value2: e.target.value })}
                  placeholder="—"
                  type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                  className={`${widthClass} text-xs w-[80px] shrink-0`}
                  {...cellAlign}
                />
              )}
            </div>
          </th>
        );
      })}
      {extraCells > 0 &&
        Array.from({ length: extraCells }).map((_, i) => (
          <th key={`extra-${i}`} className="px-2 py-1.5 font-normal" scope="col">
            {i === 0 && activeCount > 0 && onClear ? (
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
