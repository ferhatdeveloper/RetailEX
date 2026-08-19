import { useCallback, useMemo, useState } from 'react';

/**
 * Çoklu rapor tablosu için kolon-bazlı filtre state pool'u.
 * Her rapor (selectedTab) kendi filtre sözlüğüne sahip olur.
 * `useReportFilters(tab)` ile seçilen raporun filtre durumunu al.
 *
 * DevExpress ASPxGridView tarzı: tip + operatör + (opsiyonel) ikinci değer.
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

/**
 * Eski API ile uyum: `Record<string, string>` olarak da `setFilters` kabul edilir.
 * Bu format sessizce yeni modele migrate edilir (kind + default operatör).
 */
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

export interface ReportFiltersApi {
  /** Yeni model — operatör + (opsiyonel) value2 ile. */
  values: FilterValueMap;
  /** Eski API ile uyumlu — string sözlüğü de kabul eder; sessiz migrate edilir. */
  setFilters: (next: FilterValueMap | Record<string, string>) => void;
  /** Tek bir kolon için operatörlü set. */
  setFilter: (key: string, model: Partial<FilterValueModel>) => void;
  filtered: <T extends Record<string, unknown>>(rows: T[]) => T[];
  clearAll: () => void;
  activeCount: number;
}

export const useReportColumnFiltersPool = () => {
  const [pool, setPool] = useState<Record<string, FilterValueMap>>({});

  const api = useMemo(() => {
    const result: Record<string, ReportFiltersApi> = {};
    const allTabs = Object.keys(pool);
    for (const tab of allTabs) {
      const values = pool[tab] || {};
      const setFilters: ReportFiltersApi['setFilters'] = (next) => {
        setPool((prev) => {
          // kind tespiti için mevcut değerlerin kind'ına düş, yoksa 'text' varsay
          const cur = prev[tab] || {};
          const kindFor = (k: string): FilterType => cur[k]?.kind || 'text';
          const cleaned = normalizeToModelMap(next, kindFor);
          if (
            Object.keys(cleaned).length === Object.keys(cur).length &&
            Object.entries(cleaned).every(([k, v]) => {
              const c = cur[k];
              if (!c) return false;
              return c.kind === v.kind && c.operator === v.operator && c.value === v.value && (c.value2 ?? '') === (v.value2 ?? '');
            })
          ) {
            return prev;
          }
          return { ...prev, [tab]: cleaned };
        });
      };
      const setFilter: ReportFiltersApi['setFilter'] = (key, model) => {
        setPool((prev) => {
          const cur = { ...(prev[tab] || {}) };
          const existing = cur[key];
          const kind = model.kind ?? existing?.kind ?? 'text';
          const operator =
            model.operator ?? existing?.operator ?? defaultOperatorFor(kind);
          const merged: FilterValueModel = {
            kind,
            operator,
            value: model.value ?? existing?.value ?? '',
            value2: model.value2 ?? existing?.value2 ?? '',
          };
          const trimmedValue = (merged.value ?? '').trim();
          const trimmedValue2 = (merged.value2 ?? '').trim();
          if (trimmedValue === '' && trimmedValue2 === '') {
            delete cur[key];
          } else {
            cur[key] = merged;
          }
          if (
            Object.keys(cur).length === Object.keys(prev[tab] || {}).length &&
            Object.entries(cur).every(([k, v]) => {
              const c = (prev[tab] || {})[k];
              if (!c) return false;
              return c.kind === v.kind && c.operator === v.operator && c.value === v.value && (c.value2 ?? '') === (v.value2 ?? '');
            })
          ) {
            return prev;
          }
          return { ...prev, [tab]: cur };
        });
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
      result[tab] = { values, setFilters, setFilter, filtered, clearAll, activeCount };
    }
    return result;
    // pool bağımlılığı kasıtlı: filtre değişimi api'yi yeniden kurar
  }, [pool]);

  const forTab = useCallback(
    (tab: string, columnKinds?: Record<string, FilterType>): ReportFiltersApi => {
      const existing = api[tab];
      if (existing) return existing;
      return {
        values: {},
        setFilters: (next) => {
          setPool((prev) => {
            const cur = prev[tab] || {};
            const kindFor = (k: string): FilterType =>
              columnKinds?.[k] || cur[k]?.kind || 'text';
            const cleaned = normalizeToModelMap(next, kindFor);
            if (Object.keys(cleaned).length === 0) return prev;
            return { ...prev, [tab]: cleaned };
          });
        },
        setFilter: (_key, _model) => {
          // tab henüz yok; setFilters üzerinden geç
        },
        filtered: <T extends Record<string, unknown>>(rows: T[]) => rows,
        clearAll: () => {
          setPool((prev) => {
            if (!prev[tab]) return prev;
            const next = { ...prev };
            delete next[tab];
            return next;
          });
        },
        activeCount: 0,
      };
    },
    [api],
  );

  return { forTab, pool };
};

// ─── Operatör uygulama ──────────────────────────────────────────────────────

function lc(s: unknown): string {
  if (s == null) return '';
  return String(s).toLowerCase().trim();
}

function toNumber(s: unknown): number | null {
  if (s == null || s === '') return null;
  const t = String(s).replace(/\s+/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hücre değeri tip'e göre normalize edilir; number/date için sayısal karşılaştırma,
 * text için case-insensitive string karşılaştırma yapılır.
 */
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
      case 'between':
        if (target2 == null) return cellNum >= target;
        const lo = Math.min(target, target2);
        const hi = Math.max(target, target2);
        return cellNum >= lo && cellNum <= hi;
      default:
        return false;
    }
  }

  if (model.kind === 'date') {
    const cellStr = lc(cellValue);
    const a = v.toLowerCase();
    const b = v2.toLowerCase();
    switch (model.operator) {
      case 'equals':
        return cellStr.startsWith(a);
      case 'before':
        // Tarih karşılaştırması string karşılaştırmasıyla yapılır (yyyy-aa-gg formatı)
        return cellStr < a;
      case 'after':
        return cellStr > a;
      case 'between':
        if (b === '') return cellStr.startsWith(a);
        const loD = a <= b ? a : b;
        const hiD = a <= b ? b : a;
        return cellStr >= loD && cellStr <= hiD;
      default:
        return false;
    }
  }

  // text
  const cellStr = lc(cellValue);
  const needle = v.toLowerCase();
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
