import { describe, expect, it } from 'vitest';
import {
  pickBestPivotMetricId,
  pivotMetricHasData,
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
  });

  it('dashboard kaydet / listele / sil', () => {
    const scope = `test_scope_${Date.now()}`;
    const snap = saveDevExPivotDashboard({
      title: 'Test Dash',
      scope,
      groupColumnLabel: 'Açıklama',
      chartKind: 'bar',
      metricId: '__count__',
      rows: [{ key: 'x', label: 'x', count: 1, values: {} }],
      metrics: [],
    });
    expect(listDevExPivotDashboards(scope).some((d) => d.id === snap.id)).toBe(true);
    deleteDevExPivotDashboard(snap.id);
    expect(listDevExPivotDashboards(scope).some((d) => d.id === snap.id)).toBe(false);
  });
});
