import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilterOutlined } from '@ant-design/icons';
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
import { defaultOperatorFor } from './useReportColumnFilters';
import { ActiveFiltersBar, filterOperatorI18nKey, type ActiveFilterChip } from '../../shared/ActiveFiltersBar';

export type ReportColumnFilterType = FilterType;

export interface ReportColumnFilterDef {
  key: string;
  label: string;
  type?: ReportColumnFilterType;
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** false ise başlıkta filtre ikonu yok (yalnızca etiket). */
  filterable?: boolean;
}

export interface ReportColumnFiltersProps {
  columns: ReportColumnFilterDef[];
  values: FilterValueMap;
  onChange?: (next: FilterValueMap | Record<string, string>) => void;
  onFilterChange?: (key: string, model: Partial<FilterValueModel>) => void;
  onClear?: () => void;
  disabled?: boolean;
  extraCells?: number;
  /** @deprecated İkon+dropdown UX; her zaman operatör paneli dropdown içindedir. */
  showOperators?: boolean;
  /** @deprecated İkinci satır paneli kaldırıldı. */
  defaultPanelOpen?: boolean;
  /**
   * Mevcut başlık satırı. Verilirse her <th> yanına tek filtre ikonu eklenir.
   * Verilmezse columns[].label ile tek başlık satırı üretilir.
   */
  children?: React.ReactNode;
  thClassName?: string;
  headerRowClassName?: string;
}

const TEXT_OPS: TextOperator[] = [
  'contains',
  'doesNotContain',
  'equals',
  'notEquals',
  'startsWith',
  'endsWith',
  'doesNotStartWith',
  'doesNotEndWith',
  'isEmpty',
  'isNotEmpty',
];
const NUMBER_OPS: NumberOperator[] = ['equals', 'notEquals', 'gt', 'lt', 'gte', 'lte', 'between'];
const DATE_OPS: DateOperator[] = ['equals', 'before', 'after', 'between'];

const FILTER_PANEL_Z = 2000;

function defaultModelFor(kind: FilterType): FilterValueModel {
  return { kind, operator: defaultOperatorFor(kind), value: '', value2: '' };
}

function modelFromLegacy(
  legacy: FilterValueMap | Record<string, string> | undefined,
  columns: ReportColumnFilterDef[],
): FilterValueMap {
  const out: FilterValueMap = {};
  if (!legacy) return out;
  const kindFor = (k: string): FilterType => columns.find((c) => c.key === k)?.type || 'text';
  for (const [k, v] of Object.entries(legacy)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') continue;
      const kind = kindFor(k);
      out[k] = {
        kind,
        operator: defaultOperatorFor(kind),
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

function opLabelKey(op: string): string {
  return filterOperatorI18nKey(op);
}

function formatChipValue(model: FilterValueModel): string {
  if (model.operator === 'isEmpty' || model.operator === 'isNotEmpty') return '—';
  const v = (model.value ?? '').trim();
  const v2 = (model.value2 ?? '').trim();
  if (model.operator === 'between' && (v || v2)) {
    if (v && v2) return `${v} – ${v2}`;
    return v || v2;
  }
  return v || v2;
}

function chipsFromValues(
  normalized: FilterValueMap,
  columns: ReportColumnFilterDef[],
  tm: TmFn,
): ActiveFilterChip[] {
  const labelFor = (key: string) => columns.find((c) => c.key === key)?.label || key;
  return Object.entries(normalized)
    .filter(([, m]) => {
      if (!m) return false;
      if (m.operator === 'isEmpty' || m.operator === 'isNotEmpty') return true;
      return (m.value ?? '').trim() !== '' || (m.value2 ?? '').trim() !== '';
    })
    .map(([key, m]) => ({
      id: key,
      columnLabel: labelFor(key),
      operatorLabel: tm(opLabelKey(m.operator)),
      valueLabel: formatChipValue(m),
    }));
}

type TmFn = (key: string) => string;

function ColumnFilterButton({
  col,
  model,
  disabled,
  tm,
  datePlaceholder,
  onCommit,
}: {
  col: ReportColumnFilterDef;
  model: FilterValueModel;
  disabled?: boolean;
  tm: TmFn;
  datePlaceholder: string;
  onCommit: (patch: Partial<FilterValueModel>) => void;
}) {
  const kind = col.type ?? 'text';
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState<FilterValueModel>(model);

  const hasValue =
    draft.operator === 'isEmpty' ||
    draft.operator === 'isNotEmpty' ||
    (model.value ?? '').trim() !== '' ||
    (model.value2 ?? '').trim() !== '';
  const modelRef = useRef(model);
  modelRef.current = model;
  const textNeedsValue =
    kind !== 'text' ||
    (draft.operator !== 'isEmpty' && draft.operator !== 'isNotEmpty');

  const placePanel = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 260;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 6;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = modelRef.current;
    setDraft({
      kind,
      operator: current.operator || defaultOperatorFor(kind),
      value: current.value ?? '',
      value2: current.value2 ?? '',
    });
    placePanel();
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    const onWin = () => placePanel();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, kind, placePanel]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ops = kind === 'number' ? NUMBER_OPS : kind === 'date' ? DATE_OPS : TEXT_OPS;
  const isBetween = (kind === 'number' || kind === 'date') && draft.operator === 'between';
  const inputType = kind === 'number' ? 'number' : 'text';
  const placeholder =
    kind === 'date' ? datePlaceholder : `${tm('reportColumnFiltersFilter')} ${col.label}`;

  const commitDraft = (next: FilterValueModel) => {
    setDraft(next);
    onCommit({ kind: next.kind, operator: next.operator, value: next.value, value2: next.value2 });
  };

  const ariaOpen = `${col.label} — ${tm('reportColumnFiltersFilter')}`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded border-0 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          hasValue ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
        }`}
        title={ariaOpen}
        aria-label={ariaOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FilterOutlined className="text-[13px]" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaOpen}
            className="rounded-lg border border-slate-200 bg-white shadow-lg p-2.5 flex flex-col gap-2"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: 260,
              zIndex: FILTER_PANEL_Z,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] font-semibold text-slate-500">{tm('reportColumnFiltersFilter')}</span>
              <select
                disabled={disabled}
                value={draft.operator}
                onChange={(e) =>
                  commitDraft({ ...draft, operator: e.target.value as FilterValueModel['operator'] })
                }
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md bg-white text-slate-800"
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {tm(opLabelKey(op))}
                  </option>
                ))}
              </select>
            </label>
            {textNeedsValue ? (
              <input
                ref={inputRef}
                disabled={disabled}
                value={draft.value}
                onChange={(e) => commitDraft({ ...draft, value: e.target.value })}
                placeholder={placeholder}
                type={inputType}
                inputMode={kind === 'number' ? 'decimal' : undefined}
                autoComplete="off"
                spellCheck={false}
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setOpen(false);
                }}
              />
            ) : null}
            {isBetween && textNeedsValue && (
              <input
                disabled={disabled}
                value={draft.value2 ?? ''}
                onChange={(e) => commitDraft({ ...draft, value2: e.target.value })}
                placeholder={kind === 'date' ? datePlaceholder : '—'}
                type={inputType}
                inputMode={kind === 'number' ? 'decimal' : undefined}
                className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              />
            )}
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                disabled={disabled || !hasValue}
                onClick={() => {
                  const cleared = defaultModelFor(kind);
                  commitDraft(cleared);
                }}
                className="h-7 px-2 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40"
              >
                {tm('clear')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-7 px-2.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                {tm('apply')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Sayı kolonları varsayılan sağ; etiket+huni aynı hizada kalsın. */
function resolveColumnAlign(col: ReportColumnFilterDef): 'left' | 'right' | 'center' {
  return col.align ?? (col.type === 'number' ? 'right' : 'left');
}

function alignTextClass(align: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function mergeThAlignClass(existing: string | undefined, align: 'left' | 'right' | 'center'): string {
  const cleaned = (existing ?? '').replace(/\btext-(?:left|right|center)\b/g, '').replace(/\s+/g, ' ').trim();
  return `${cleaned} ${alignTextClass(align)}`.trim();
}

function HeaderLabelWithFilter({
  col,
  model,
  disabled,
  tm,
  datePlaceholder,
  onCommit,
  labelNode,
}: {
  col: ReportColumnFilterDef;
  model: FilterValueModel;
  disabled?: boolean;
  tm: TmFn;
  datePlaceholder: string;
  onCommit: (patch: Partial<FilterValueModel>) => void;
  labelNode: React.ReactNode;
}) {
  const align = resolveColumnAlign(col);
  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  const filterBtn =
    col.filterable === false ? null : (
      <ColumnFilterButton
        col={col}
        model={model}
        disabled={disabled}
        tm={tm}
        datePlaceholder={datePlaceholder}
        onCommit={onCommit}
      />
    );
  const label = <span className="min-w-0 truncate">{labelNode}</span>;
  /** Sağ hizada etiket hücre değeriyle aynı kenarda kalsın; huni solda. */
  return (
    <div className={`flex w-full items-center gap-1 min-w-0 ${justify}`}>
      {align === 'right' ? (
        <>
          {filterBtn}
          {label}
        </>
      ) : (
        <>
          {label}
          {filterBtn}
        </>
      )}
    </div>
  );
}

export const ReportColumnFilters: React.FC<ReportColumnFiltersProps> = ({
  columns,
  values,
  onChange,
  onFilterChange,
  onClear,
  disabled,
  extraCells = 0,
  children,
  thClassName = 'px-4 py-3 text-sm font-semibold text-slate-800 whitespace-nowrap',
  headerRowClassName,
}) => {
  const { language } = useLanguage();
  const langKey = (language || 'tr') as 'tr' | 'en' | 'ar' | 'ku';
  const tm = (key: string): string => {
    const fallback = (moduleTranslations as Record<string, Record<string, string>>)[key]?.[langKey];
    if (fallback) return fallback;
    return (translateModule as (k: string, l: typeof langKey) => string)(key, langKey);
  };

  const normalized = useMemo(() => modelFromLegacy(values, columns), [values, columns]);

  const ensureModel = (key: string, type: FilterType): FilterValueModel => {
    return normalized[key] || defaultModelFor(type);
  };

  const updateModel = (key: string, patch: Partial<FilterValueModel>) => {
    const kind = patch.kind ?? columns.find((c) => c.key === key)?.type ?? 'text';
    if (onFilterChange) {
      onFilterChange(key, { kind, ...patch });
      return;
    }
    if (onChange) {
      const cur = ensureModel(key, kind);
      const next: FilterValueModel = {
        kind,
        operator: patch.operator ?? cur.operator,
        value: patch.value ?? cur.value,
        value2: patch.value2 ?? cur.value2,
      };
      const out: FilterValueMap = { ...normalized };
      if (!(next.value ?? '').trim() && !(next.value2 ?? '').trim()) {
        delete out[key];
      } else {
        out[key] = next;
      }
      const legacyOut: Record<string, string> = {};
      for (const [k, m] of Object.entries(out)) {
        legacyOut[k] = m.value;
      }
      onChange(legacyOut);
    }
  };

  const datePlaceholder = tm('reportColumnFiltersDatePlaceholder');
  const chips = useMemo(() => chipsFromValues(normalized, columns, tm), [normalized, columns, language]);

  const clearChip = (key: string) => {
    const kind = columns.find((c) => c.key === key)?.type ?? 'text';
    updateModel(key, { kind, operator: defaultOperatorFor(kind), value: '', value2: '' });
  };

  const renderChipsRow = (colSpan: number) => {
    if (chips.length === 0) return null;
    return (
      <tr className="bg-sky-50/90 border-b border-sky-100">
        <th
          colSpan={Math.max(colSpan, 1)}
          scope="colgroup"
          className="px-3 py-2 font-normal text-left"
        >
          <ActiveFiltersBar
            chips={chips}
            onRemove={clearChip}
            onClearAll={() => {
              if (onClear) {
                onClear();
                return;
              }
              chips.forEach((c) => clearChip(c.id));
            }}
            disabled={disabled}
            title={tm('activeFiltersBarTitle')}
            clearAllLabel={tm('reportColumnFiltersClearAll')}
            removeAriaLabel={tm('removeFilter')}
          />
        </th>
      </tr>
    );
  };

  const titleChild = React.Children.toArray(children).find(
    (c) => React.isValidElement(c) && c.type === 'tr',
  ) as React.ReactElement<{ children?: React.ReactNode; className?: string }> | undefined;

  if (titleChild) {
    const cells = React.Children.toArray(titleChild.props.children);
    const thCount = cells.filter((cell) => React.isValidElement(cell) && cell.type === 'th').length;
    let colIdx = 0;
    const nextCells = cells.map((cell) => {
      if (!React.isValidElement(cell) || cell.type !== 'th') return cell;
      const col = columns[colIdx];
      colIdx += 1;
      if (!col) return cell;
      const type = col.type ?? 'text';
      const model = ensureModel(col.key, type);
      const align = resolveColumnAlign(col);
      const prev = cell as React.ReactElement<{ children?: React.ReactNode; className?: string }>;
      return React.cloneElement(prev, {
        className: mergeThAlignClass(prev.props.className, align),
        children: (
          <HeaderLabelWithFilter
            col={col}
            model={model}
            disabled={disabled}
            tm={tm}
            datePlaceholder={datePlaceholder}
            onCommit={(patch) => updateModel(col.key, patch)}
            labelNode={prev.props.children}
          />
        ),
      });
    });
    return (
      <>
        {renderChipsRow(thCount || columns.length)}
        {React.cloneElement(titleChild, undefined, nextCells)}
      </>
    );
  }

  const headerColSpan = columns.length + extraCells;

  return (
    <>
      {renderChipsRow(headerColSpan)}
      <tr className={headerRowClassName ?? 'bg-gray-50 border-b border-slate-200'}>
        {columns.map((col, idx) => {
          const type = col.type ?? 'text';
          const align = resolveColumnAlign(col);
          const model = ensureModel(col.key, type);
          return (
            <th
              key={`${col.key}-${idx}`}
              className={`${alignTextClass(align)} ${thClassName} ${col.width ?? ''}`.trim()}
              scope="col"
            >
              <HeaderLabelWithFilter
                col={col}
                model={model}
                disabled={disabled}
                tm={tm}
                datePlaceholder={datePlaceholder}
                onCommit={(patch) => updateModel(col.key, patch)}
                labelNode={col.label}
              />
            </th>
          );
        })}
        {extraCells > 0 &&
          Array.from({ length: extraCells }).map((_, i) => (
            <th key={`extra-${i}`} className={thClassName} scope="col" />
          ))}
      </tr>
    </>
  );
};

export default ReportColumnFilters;
