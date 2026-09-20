import { describe, expect, it } from 'vitest';
import { buildPivotGrafanaDashboard } from '../../services/grafanaClientApi';

describe('buildPivotGrafanaDashboard', () => {
  it('markdown tablo ve stat panelleri üretir', () => {
    const dash = buildPivotGrafanaDashboard({
      title: 'Test Pivot',
      groupColumnLabel: 'Kategori',
      rows: [
        { label: 'A', count: 2, values: { amt: 100 } },
        { label: 'B', count: 1, values: { amt: 40 } },
      ],
      metrics: [{ id: 'amt', label: 'Tutar' }],
      metricId: 'amt',
      chartKind: 'bar',
    });

    expect(dash.title).toBe('Test Pivot');
    expect(String(dash.uid)).toMatch(/^rex-pvt-/);
    expect(dash.tags).toEqual(expect.arrayContaining(['retailex', 'pivot']));
    const panels = dash.panels as Array<{ type: string; title?: string; options?: { content?: string } }>;
    expect(panels.some((p) => p.type === 'text' && p.options?.content?.includes('| Kategori |'))).toBe(true);
    expect(panels.filter((p) => p.type === 'stat')).toHaveLength(2);
  });
});
