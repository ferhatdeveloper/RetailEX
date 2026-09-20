/**
 * DevEx gruplama → pivot / grafik için satır agregasyonu.
 */

export type DevExPivotMetricDef = {
  id: string;
  label: string;
};

export type DevExPivotRow = {
  key: string;
  label: string;
  count: number;
  values: Record<string, number>;
};

export type DevExPivotChartPoint = {
  name: string;
  count: number;
  [metricId: string]: string | number;
};

function normalizeGroupLabel(raw: unknown): string {
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

/**
 * Detay satırlarını grup anahtarına göre toplar (adet + sayısal metrikler).
 */
export function aggregateDevExGroupPivot<T>(
  data: readonly T[],
  getGroupLabel: (row: T) => unknown,
  metrics: Array<{ id: string; getValue: (row: T) => number }>,
): DevExPivotRow[] {
  const map = new Map<string, { count: number; values: Record<string, number> }>();

  for (const row of data) {
    const label = normalizeGroupLabel(getGroupLabel(row));
    let bucket = map.get(label);
    if (!bucket) {
      bucket = { count: 0, values: {} };
      for (const m of metrics) bucket.values[m.id] = 0;
      map.set(label, bucket);
    }
    bucket.count += 1;
    for (const m of metrics) {
      const n = Number(m.getValue(row));
      bucket.values[m.id] = (bucket.values[m.id] || 0) + (Number.isFinite(n) ? n : 0);
    }
  }

  const out: DevExPivotRow[] = [];
  for (const [label, bucket] of map) {
    out.push({
      key: label,
      label,
      count: bucket.count,
      values: { ...bucket.values },
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'tr', { sensitivity: 'base' }));
  return out;
}

/** Recharts için düz noktalar (name + count + metrik id’leri). */
export function toDevExPivotChartPoints(rows: readonly DevExPivotRow[]): DevExPivotChartPoint[] {
  return rows.map((r) => ({
    name: r.label.length > 28 ? `${r.label.slice(0, 26)}…` : r.label,
    count: r.count,
    ...r.values,
  }));
}
