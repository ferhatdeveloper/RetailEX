import { useCallback, useMemo, useState } from 'react';

/**
 * Çoklu rapor tablosu için kolon-bazlı filtre state pool'u.
 * Her rapor (selectedTab) kendi filtre sözlüğüne sahip olur.
 *
 * Operatör + değer modeli; ilk tuş vuruşunda tab henüz pool'da olmasa da setFilter yazar.
 */

export type FilterType = 'text' | 'number' | 'date';

export interface FilterColumnDef {
  key: string;
  type?: FilterType;
}

export type TextOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'doesNotContain';

export type NumberOperator =
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between';

export type DateOperator = 'equals' | 'before' | 'after' | 'between';

export const DEFAULT_TEXT_OP: TextOperator = 'contains';
export const DEFAULT_NUMBER_OP: NumberOperator = 'equals';
export const DEFAULT_DATE_OP: DateOperator = 'equals';

export function defaultOperatorFor(kind: FilterType): TextOperator | NumberOperator | DateOperator {
  return kind === 'number' ? DEFAULT_NUMBER_OP : kind === 'date' ? DEFAULT_DATE_OP : DEFAULT_TEXT_OP;
}

export interface FilterValueModel {
  kind: FilterType;
  operator: TextOperator | NumberOperator | DateOperator;
  value: string;
  value2?: string;
}

export type FilterValueMap = Record<string, FilterValueModel>;

function normalizeToModelMap(
  next: FilterValueMap | Record<string, string>,
  kindFor: (key: string) => FilterType,
): FilterValueMap {
  const out: FilterValueMap = {};
  for (const [k, v] of Object.entries(next)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') continue;
      const kind = kindFor(k);
      const operator =
        kind === 'number' ? ('equals' as const) : kind === 'date' ? ('equals' as const) : ('contains' as const);
      out[k] = { kind, operator, value: v };
    } else {
      const trimmed = (v.value ?? '').trim();
      const trimmed2 = (v.value2 ?? '').trim();
      if (trimmed === '' && trimmed2 === '') continue;
      out[k] = { ...v, value: v.value, value2: v.value2 };
    }
  }
  return out;
}

function modelsEqual(a: FilterValueModel | undefined, b: FilterValueModel | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.operator === b.operator && a.value === b.value && (a.value2 ?? '') === (b.value2 ?? '');
}

function mapsEqual(a: FilterValueMap, b: FilterValueMap): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => modelsEqual(a[k], b[k]));
}

function mergeFilterModel(
  existing: FilterValueModel | undefined,
  model: Partial<FilterValueModel>,
): FilterValueModel | null {
  const kind = model.kind ?? existing?.kind ?? 'text';
  const operator = model.operator ?? existing?.operator ?? defaultOperatorFor(kind);
  const merged: FilterValueModel = {
    kind,
    operator,
    value: model.value ?? existing?.value ?? '',
    value2: model.value2 ?? existing?.value2 ?? '',
  };
  const trimmedValue = (merged.value ?? '').trim();
  const trimmedValue2 = (merged.value2 ?? '').trim();
  if (trimmedValue === '' && trimmedValue2 === '') return null;
  return merged;
}

export interface ReportFiltersApi {
  values: FilterValueMap;
  setFilters: (next: FilterValueMap | Record<string, string>) => void;
  setFilter: (key: string, model: Partial<FilterValueModel>) => void;
  filtered: <T extends Record<string, unknown>>(rows: T[]) => T[];
  clearAll: () => void;
  activeCount: number;
}

function applySetFilter(
  prev: Record<string, FilterValueMap>,
  tab: string,
  key: string,
  model: Partial<FilterValueModel>,
): Record<string, FilterValueMap> {
  const cur = { ...(prev[tab] || {}) };
  const merged = mergeFilterModel(cur[key], model);
  if (!merged) {
    delete cur[key];
  } else {
    cur[key] = merged;
  }
  if (mapsEqual(cur, prev[tab] || {})) return prev;
  if (Object.keys(cur).length === 0) {
    const next = { ...prev };
    delete next[tab];
    return next;
  }
  return { ...prev, [tab]: cur };
}

export const useReportColumnFiltersPool = () => {
  const [pool, setPool] = useState<Record<string, FilterValueMap>>({});

  const forTab = useCallback((tab: string, columnKinds?: Record<string, FilterType>): ReportFiltersApi => {
    const values = pool[tab] || {};

    const setFilters: ReportFiltersApi['setFilters'] = (next) => {
      setPool((prev) => {
        const cur = prev[tab] || {};
        const kindFor = (k: string): FilterType => columnKinds?.[k] || cur[k]?.kind || 'text';
        const cleaned = normalizeToModelMap(next, kindFor);
        if (mapsEqual(cleaned, cur)) return prev;
        if (Object.keys(cleaned).length === 0) {
          const nextPool = { ...prev };
          delete nextPool[tab];
          return nextPool;
        }
        return { ...prev, [tab]: cleaned };
      });
    };

    const setFilter: ReportFiltersApi['setFilter'] = (key, model) => {
      setPool((prev) => applySetFilter(prev, tab, key, model));
    };

    const clearAll = () => {
      setPool((prev) => {
        if (!prev[tab] || Object.keys(prev[tab]).length === 0) return prev;
        const next = { ...prev };
        delete next[tab];
        return next;
      });
    };

    const filtered = <T extends Record<string, unknown>>(rows: T[]): T[] => {
      const entries = Object.entries(values);
      if (entries.length === 0) return rows;
      return rows.filter((row) =>
        entries.every(([k, model]) => {
          if (!model) return true;
          const v = (model.value ?? '').trim();
          const v2 = (model.value2 ?? '').trim();
          if (v === '' && v2 === '') return true;
          return applyOperator(row[k], model);
        }),
      );
    };

    const activeCount = Object.values(values).filter((m) => {
      if (!m) return false;
      const v = (m.value ?? '').trim();
      const v2 = (m.value2 ?? '').trim();
      return v !== '' || v2 !== '';
    }).length;

    return { values, setFilters, setFilter, filtered, clearAll, activeCount };
  }, [pool]);

  return { forTab, pool };
};

function lc(s: unknown): string {
  if (s == null) return '';
  return String(s).toLocaleLowerCase('tr-TR').trim();
}

function toNumber(s: unknown): number | null {
  if (s == null || s === '') return null;
  const t = String(s).replace(/\s+/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ISO / gg.aa.yyyy / mm/dd/yyyy / yyyy-aa-gg → yyyy-mm-dd (karşılaştırma anahtarı). */
export function normalizeDateKey(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, '0');
    const dd = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return lc(s);
}

function applyOperator(cellValue: unknown, model: FilterValueModel): boolean {
  const v = (model.value ?? '').trim();
  const v2 = (model.value2 ?? '').trim();
  if (v === '' && v2 === '') return true;

  if (model.kind === 'number') {
    const cellNum = toNumber(cellValue);
    const target = toNumber(v);
    const target2 = toNumber(v2);
    if (target == null) return false;
    if (cellNum == null) return false;
    switch (model.operator) {
      case 'equals':
        return Math.abs(cellNum - target) < 1e-9 || Math.floor(cellNum) === Math.floor(target);
      case 'notEquals':
        return !(Math.abs(cellNum - target) < 1e-9 || Math.floor(cellNum) === Math.floor(target));
      case 'gt':
        return cellNum > target;
      case 'lt':
        return cellNum < target;
      case 'gte':
        return cellNum >= target;
      case 'lte':
        return cellNum <= target;
      case 'between': {
        if (target2 == null) return cellNum >= target;
        const lo = Math.min(target, target2);
        const hi = Math.max(target, target2);
        return cellNum >= lo && cellNum <= hi;
      }
      default:
        return false;
    }
  }

  if (model.kind === 'date') {
    const cellKey = normalizeDateKey(cellValue);
    const a = normalizeDateKey(v);
    const b = v2 ? normalizeDateKey(v2) : '';
    const cellStr = lc(cellValue);
    const needle = lc(v);
    switch (model.operator) {
      case 'equals':
        if (a && cellKey) return cellKey === a || cellKey.startsWith(a);
        return cellStr.includes(needle) || cellStr.startsWith(needle);
      case 'before':
        if (a && cellKey) return cellKey < a;
        return cellStr < needle;
      case 'after':
        if (a && cellKey) return cellKey > a;
        return cellStr > needle;
      case 'between': {
        if (!a) return true;
        if (!b) return cellKey ? cellKey >= a : cellStr.startsWith(needle);
        const loD = a <= b ? a : b;
        const hiD = a <= b ? b : a;
        return cellKey >= loD && cellKey <= hiD;
      }
      default:
        return cellStr.includes(needle);
    }
  }

  const cellStr = lc(cellValue);
  const needle = v.toLocaleLowerCase('tr-TR');
  switch (model.operator) {
    case 'contains':
      return cellStr.includes(needle);
    case 'equals':
      return cellStr === needle;
    case 'startsWith':
      return cellStr.startsWith(needle);
    case 'endsWith':
      return cellStr.endsWith(needle);
    case 'doesNotContain':
      return !cellStr.includes(needle);
    default:
      return false;
  }
}
