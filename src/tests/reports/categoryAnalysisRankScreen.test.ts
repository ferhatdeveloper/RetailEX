import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReportGridColumns } from '../../components/reports/shared/ReportDataGrid';
import { mergeDevExDefaultColumnVisibility } from '../../components/shared/DevExDataGrid';
import { translate } from '../../locales/module-translations';

const screenSource = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
const translations = readFileSync(resolve('src/locales/module-translations.ts'), 'utf8');
const commissionSource = readFileSync(resolve('src/components/beauty/components/CommissionReport.tsx'), 'utf8');

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Kategori Analizi ve En Çok Satanlar ekran kaynağı', () => {
  const categoryBlock = sliceBetween(
    screenSource,
    "selectedTab === 'category-analysis' &&",
    "selectedTab === 'hourly-analysis'",
  );
  const topBlock = sliceBetween(
    screenSource,
    "selectedTab === 'top-products' &&",
    "selectedTab === 'category-analysis' &&",
  );

  it('kategori ekranı hazır aralık etiketlerini ve aralık sorgusunu içerir', () => {
    expect(screenSource).not.toContain('üstteki tarih seçicisindeki güne göre');
    expect(screenSource).not.toContain('Bu gün için kategori satışı bulunamadı');
    expect(screenSource).not.toContain('Seçili güne ait satış kalemi yok');
    expect(translations).not.toContain('üstteki tarih seçicisindeki güne göre');
    expect(translations).not.toContain('Bu gün için kategori satışı bulunamadı');

    for (const label of ['Başlangıç', 'Bitiş', 'Bugün', 'Bu hafta', 'Bu ay', 'Geçen ay']) {
      expect(screenSource).toContain(label);
      expect(categoryBlock).toContain('analysisRankFilterLabels');
      expect(translate(
        label === 'Başlangıç' ? 'dateFrom'
          : label === 'Bitiş' ? 'dateTo'
            : label === 'Bugün' ? 'bCallBoardToday'
              : label === 'Bu hafta' ? 'bCallBoardWeek'
                : label === 'Bu ay' ? 'bCallBoardMonth'
                  : 'reportDatePresetLastMonth',
        'tr',
      )).toBe(label);
    }

    expect(categoryBlock).toContain('AnalysisRankDateFilter');
    expect(categoryBlock).toContain('categoryRankRange');
    expect(categoryBlock).toContain('data-testid="category-analysis-screen"');
    expect(categoryBlock).toContain('rankRangeSales');
    expect(categoryBlock).toContain('seçili başlangıç ve bitiş tarihine göre');
    expect(categoryBlock).toContain('Seçili tarih aralığında kategori satışı bulunamadı');
    expect(categoryBlock).not.toContain('güne göre');

    expect(topBlock).toContain('AnalysisRankDateFilter');
    expect(topBlock).toContain('topRankRange');
    expect(topBlock).toContain('analysisRankFilterLabels');
    expect(topBlock).toContain('Seçili tarih aralığında satış kalemi yok');
    expect(topBlock).not.toContain('Seçili güne');

    const query = sliceBetween(screenSource, 'const loadRankRangeSales', 'const loadActiveRankReport');
    expect(query).toContain('getForDailyReport');
    expect(query).toContain('getSalesInRange');
    expect(query).toContain('filterSalesForAnalysisRange');
  });
});

describe('Prim oranı kolonu varsayılan görünür', () => {
  it('tarihsel döküm kolon kimliği commission_rate ve defaultVisible', () => {
    const history = sliceBetween(commissionSource, 'const historyColumns', 'const lineColumns');
    expect(history).toContain("key: 'commission_rate'");
    expect(history).toContain('defaultVisible: true');
    expect(history).toContain('bCommissionLineRate');
    expect(history.indexOf("key: 'commission_rate'")).toBeLessThan(history.indexOf("key: 'service_commission'"));
    expect(commissionSource).toContain('storageNamespace="beauty-commission-history-rate"');
    expect(translate('bCommissionLineRate', 'tr')).toBe('Prim oranı');

    const columns = buildReportGridColumns([
      { id: 'date_ymd', header: 'Tarih' },
      { id: 'name', header: 'UZMAN' },
      { id: 'commission_rate', header: 'Prim oranı', defaultVisible: true },
      { id: 'service_commission', header: 'Hizmet primi' },
      { id: 'total_commission', header: 'Toplam prim' },
    ]);
    const visibility = mergeDevExDefaultColumnVisibility(columns, { commission_rate: false });
    expect(visibility.commission_rate).toBe(true);
    expect(visibility.service_commission).not.toBe(false);
    expect(visibility.total_commission).not.toBe(false);
  });
});
