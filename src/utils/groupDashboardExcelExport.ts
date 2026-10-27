import type { DevExPivotRow } from './devExGroupPivot';
import { exportAoaToExcel } from './gridExcelExport';

export type GroupDashboardMetric = {
  id: string;
  label: string;
};

export type GroupDashboardExportInput = {
  groupColumnLabel: string;
  countLabel: string;
  metrics: GroupDashboardMetric[];
  rows: DevExPivotRow[];
  /** pivot: tablodaki bütün kolonlar. Diğer görünüm: seçili seri kolonları. */
  chartKind: string;
  selectedMetricIds?: string[];
};

function metricLabel(metric: GroupDashboardMetric | undefined, fallback: string): string {
  const label = metric?.label?.trim();
  if (label) return label;
  return fallback;
}

/**
 * Grup dashboard Excel matrisi. Pivot tablonun veya seçili grafiğin kolon ve satırları.
 * Satır düşmez; başlık boş kalmaz.
 */
export function buildGroupDashboardExportAoa(input: GroupDashboardExportInput): unknown[][] {
  const groupHeader = input.groupColumnLabel.trim() || 'Grup';
  const countHeader = input.countLabel.trim() || 'Kayıt adedi';
  const metrics = input.metrics.filter((m) => m.id);
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const pivot = input.chartKind === 'pivot';

  const columns: Array<{ header: string; read: (row: DevExPivotRow) => unknown }> = [
    { header: groupHeader, read: (row) => (row.label?.trim() ? row.label : '—') },
  ];

  if (pivot) {
    columns.push({
      header: countHeader,
      read: (row) => Number(row.count) || 0,
    });
    for (const metric of metrics) {
      columns.push({
        header: metricLabel(metric, metric.id),
        read: (row) => Number(row.values[metric.id]) || 0,
      });
    }
  } else {
    const selected = (input.selectedMetricIds ?? []).filter((id) => id);
    const ids = selected.length > 0 ? selected : ['__count__', ...metrics.map((m) => m.id)];
    for (const id of ids) {
      if (id === '__count__') {
        columns.push({
          header: countHeader,
          read: (row) => Number(row.count) || 0,
        });
        continue;
      }
      const metric = metricById.get(id);
      columns.push({
        header: metricLabel(metric, id),
        read: (row) => Number(row.values[id]) || 0,
      });
    }
  }

  const aoa: unknown[][] = [columns.map((c) => c.header)];
  for (const row of input.rows) {
    aoa.push(columns.map((c) => c.read(row)));
  }
  return aoa;
}

export function exportGroupDashboardToExcel(input: GroupDashboardExportInput, fileName = 'grup_dashboard'): void {
  exportAoaToExcel(buildGroupDashboardExportAoa(input), fileName);
}
