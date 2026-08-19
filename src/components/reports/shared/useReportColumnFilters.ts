import { useCallback, useMemo, useState } from 'react';

/**
 * Çoklu rapor tablosu için kolon-bazlı filtre state pool'u.
 * Her rapor (selectedTab) kendi filtre sözlüğüne sahip olur.
 * `useReportFilters(tab)` ile seçilen raporun filtre durumunu al.
 */

export type FilterType = 'text' | 'number' | 'date';

export interface FilterColumnDef {
  key: string;
  type?: FilterType;
}

export interface ReportFiltersApi {
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
  filtered: <T extends Record<string, unknown>>(rows: T[]) => T[];
  clearAll: () => void;
}

export const useReportColumnFiltersPool = () => {
  const [pool, setPool] = useState<Record<string, Record<string, string>>>({});

  const api = useMemo(() => {
    const result: Record<string, ReportFiltersApi> = {};
    const allTabs = Object.keys(pool);
    for (const tab of allTabs) {
      const filters = pool[tab] || {};
      const setFilters = (next: Record<string, string>) => {
        setPool((prev) => {
          const cleaned: Record<string, string> = {};
          for (const [k, v] of Object.entries(next)) {
            if (v != null && v !== '') cleaned[k] = v;
          }
          const cur = prev[tab] || {};
          if (
            Object.keys(cleaned).length === Object.keys(cur).length &&
            Object.entries(cleaned).every(([k, v]) => cur[k] === v)
          ) {
            return prev;
          }
          return { ...prev, [tab]: cleaned };
        });
      };
      const clearAll = () => setFilters({});
      const filtered = <T extends Record<string, unknown>>(rows: T[]): T[] => {
        const activeKeys = Object.keys(filters).filter((k) => filters[k] != null && filters[k] !== '');
        if (activeKeys.length === 0) return rows;
        return rows.filter((row) =>
          activeKeys.every((k) => {
            const raw = filters[k];
            if (raw == null || raw === '') return true;
            const type: FilterType = 'text';
            return matches(row[k], raw, type);
          }),
        );
      };
      result[tab] = { filters, setFilters, filtered, clearAll };
    }
    return result;
    // pool bağımlılığı kasıtlı: filtre değişimi api'yi yeniden kurar
  }, [pool]);

  const forTab = useCallback(
    (tab: string): ReportFiltersApi => {
      return (
        api[tab] || {
          filters: {},
          setFilters: (next) => {
            setPool((prev) => ({ ...prev, [tab]: next }));
          },
          filtered: <T extends Record<string, unknown>>(rows: T[]) => rows,
          clearAll: () => {
            setPool((prev) => {
              const cur = prev[tab] || {};
              if (Object.keys(cur).length === 0) return prev;
              const next = { ...prev };
              delete next[tab];
              return next;
            });
          },
        }
      );
    },
    [api],
  );

  return { forTab, pool };
};

function normalize(s: unknown): string {
  if (s == null) return '';
  return String(s).toLowerCase().trim();
}

function matches(cellValue: unknown, rawValue: string, type: FilterType): boolean {
  const raw = rawValue.trim();
  if (raw === '') return true;
  if (type === 'number') {
    const cellStr = String(cellValue ?? '').replace(/\s+/g, '').replace(',', '.');
    const rawStr = raw.replace(/\s+/g, '').replace(',', '.');
    const cellNum = Number(cellStr);
    const rawNum = Number(rawStr);
    if (cellStr === '' || rawStr === '') return false;
    if (Number.isNaN(cellNum) || Number.isNaN(rawNum)) {
      return cellStr.includes(rawStr);
    }
    return Math.abs(cellNum - rawNum) < 1e-9 || Math.floor(cellNum) === Math.floor(rawNum);
  }
  if (type === 'date') {
    return normalize(cellValue).startsWith(raw.toLowerCase());
  }
  return normalize(cellValue).includes(raw.toLowerCase());
}
