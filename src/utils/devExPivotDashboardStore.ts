/**
 * DevEx grup pivot / grafik — kaydedilebilir dashboard (localStorage).
 */

import type { DevExPivotMetricDef, DevExPivotRow } from './devExGroupPivot';

export type DevExPivotChartKind = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'pivot';

export type DevExPivotDashboardSnapshot = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Grid storageNamespace veya path */
  scope: string;
  groupColumnLabel: string;
  chartKind: DevExPivotChartKind;
  /** Geriye dönük: birincil / ilk metrik */
  metricId: string;
  /** Karşılaştırma için seçili metrikler (boşsa [metricId]) */
  metricIds?: string[];
  rows: DevExPivotRow[];
  metrics: DevExPivotMetricDef[];
};

const STORAGE_KEY = 'retailex_devex_pivot_dashboards_v1';
const MAX_DASHBOARDS = 40;

/** Vitest / SSR: localStorage yoksa bellek yedeği */
let memoryStore: string | null = null;

function readRaw(): string | null {
  let fromLs: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      fromLs = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  // Bellek yedeği (Vitest/SSR) öncelikli; yoksa localStorage
  return memoryStore ?? fromLs;
}

function writeRaw(value: string): void {
  memoryStore = value;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }
}

function safeParse(raw: string | null): DevExPivotDashboardSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is DevExPivotDashboardSnapshot =>
        d != null &&
        typeof d === 'object' &&
        typeof (d as DevExPivotDashboardSnapshot).id === 'string' &&
        typeof (d as DevExPivotDashboardSnapshot).title === 'string' &&
        Array.isArray((d as DevExPivotDashboardSnapshot).rows),
    );
  } catch {
    return [];
  }
}

export function listDevExPivotDashboards(scope?: string): DevExPivotDashboardSnapshot[] {
  const all = safeParse(readRaw());
  const scoped = scope?.trim()
    ? all.filter((d) => d.scope === scope.trim())
    : all;
  return scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveDevExPivotDashboard(
  input: Omit<DevExPivotDashboardSnapshot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): DevExPivotDashboardSnapshot {
  const now = new Date().toISOString();
  const existing = safeParse(readRaw());
  const id = input.id?.trim() || `pvt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const prev = existing.find((d) => d.id === id);
  const next: DevExPivotDashboardSnapshot = {
    id,
    title: input.title.trim() || 'Dashboard',
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    scope: input.scope || 'default',
    groupColumnLabel: input.groupColumnLabel,
    chartKind: input.chartKind,
    metricId: input.metricId,
    metricIds:
      Array.isArray(input.metricIds) && input.metricIds.length > 0
        ? normalizePivotMetricIds(input.metricIds)
        : [input.metricId],
    rows: input.rows,
    metrics: input.metrics,
  };
  const without = existing.filter((d) => d.id !== id);
  without.unshift(next);
  const trimmed = without.slice(0, MAX_DASHBOARDS);
  writeRaw(JSON.stringify(trimmed));
  return next;
}

export function deleteDevExPivotDashboard(id: string): void {
  const next = safeParse(readRaw()).filter((d) => d.id !== id);
  writeRaw(JSON.stringify(next));
}

/** Metrik için toplam; grafik boş görünmesin diye en iyi metrik seçimi. */
export function pickBestPivotMetricId(
  rows: readonly DevExPivotRow[],
  metrics: readonly DevExPivotMetricDef[],
  preferred?: string | null,
): string {
  const options = [{ id: '__count__' }, ...metrics];
  if (preferred && options.some((o) => o.id === preferred)) {
    const sum = sumMetric(rows, preferred);
    if (sum > 0 || preferred === '__count__') return preferred;
  }
  for (const m of metrics) {
    if (sumMetric(rows, m.id) > 0) return m.id;
  }
  return '__count__';
}

function sumMetric(rows: readonly DevExPivotRow[], metricId: string): number {
  if (metricId === '__count__') return rows.reduce((a, r) => a + r.count, 0);
  return rows.reduce((a, r) => a + (Number(r.values[metricId]) || 0), 0);
}

export function pivotMetricHasData(rows: readonly DevExPivotRow[], metricId: string): boolean {
  return sumMetric(rows, metricId) > 0;
}

/** Grafik dataKey: __count__ → count */
export function pivotMetricDataKey(metricId: string): string {
  return metricId === '__count__' ? 'count' : metricId;
}

const MAX_COMPARE_METRICS = 6;

/** Seçili metrik id listesini temizle (min 1, max 6, tekil). */
export function normalizePivotMetricIds(ids: readonly string[], fallback = '__count__'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_COMPARE_METRICS) break;
  }
  return out.length > 0 ? out : [fallback];
}

/** Kayıtlı snapshot’tan metrik listesi (geriye dönük metricId). */
export function resolveSnapshotMetricIds(dash: {
  metricId?: string;
  metricIds?: string[];
}): string[] {
  if (Array.isArray(dash.metricIds) && dash.metricIds.length > 0) {
    return normalizePivotMetricIds(dash.metricIds, dash.metricId || '__count__');
  }
  return normalizePivotMetricIds([dash.metricId || '__count__']);
}

/** Seçili id’lerden en az biri veri taşıyor mu? */
export function pivotMetricsHaveData(rows: readonly DevExPivotRow[], metricIds: readonly string[]): boolean {
  return normalizePivotMetricIds(metricIds).some((id) => pivotMetricHasData(rows, id));
}

export { MAX_COMPARE_METRICS };
