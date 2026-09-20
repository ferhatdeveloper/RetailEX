import { describe, expect, it } from 'vitest';
import {
  pickBestPivotMetricId,
  pivotMetricHasData,
  pivotMetricsHaveData,
  normalizePivotMetricIds,
  resolveSnapshotMetricIds,
  saveDevExPivotDashboard,
  listDevExPivotDashboards,
  deleteDevExPivotDashboard,
} from '../../utils/devExPivotDashboardStore';

describe('devExPivotDashboardStore', () => {
  it('sıfır metrikte count seçer; dolu metrikte onu tercih eder', () => {
    const rows = [
      { key: 'A', label: 'A', count: 2, values: { inQty: 0, outAmt: 100 } },
      { key: 'B', label: 'B', count: 1, values: { inQty: 0, outAmt: 50 } },
    ];
    const metrics = [
      { id: 'inQty', label: 'Giriş' },
      { id: 'outAmt', label: 'Çıkış' },
    ];
    expect(pickBestPivotMetricId(rows, metrics, 'inQty')).toBe('outAmt');
    expect(pickBestPivotMetricId(rows, metrics, 'outAmt')).toBe('outAmt');
    expect(pivotMetricHasData(rows, 'inQty')).toBe(false);
    expect(pivotMetricHasData(rows, 'outAmt')).toBe(true);
    expect(pivotMetricsHaveData(rows, ['inQty', 'outAmt'])).toBe(true);
  });

  it('çoklu metrik id normalizasyonu ve snapshot geriye dönük', () => {
    expect(normalizePivotMetricIds(['outAmt', 'outAmt', 'inQty', ''])).toEqual(['outAmt', 'inQty']);
    expect(resolveSnapshotMetricIds({ metricId: 'a' })).toEqual(['a']);
    expect(resolveSnapshotMetricIds({ metricId: 'a', metricIds: ['b', 'c'] })).toEqual(['b', 'c']);
  });

  it('dashboard kaydet / listele / sil', () => {
    const scope = `test_scope_${Date.now()}`;
    const snap = saveDevExPivotDashboard({
      title: 'Test Dash',
      scope,
      groupColumnLabel: 'Açıklama',
      chartKind: 'bar',
      metricId: '__count__',
      metricIds: ['outAmt', 'inQty'],
      rows: [{ key: 'x', label: 'x', count: 1, values: {} }],
      metrics: [],
    });
    expect(snap.metricIds).toEqual(['outAmt', 'inQty']);
    expect(listDevExPivotDashboards(scope).some((d) => d.id === snap.id)).toBe(true);
    deleteDevExPivotDashboard(snap.id);
    expect(listDevExPivotDashboards(scope).some((d) => d.id === snap.id)).toBe(false);
  });
});
