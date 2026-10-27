/**
 * Ödeme ve İşlemler altındaki Ödeme Dağılımı raporu menüden ve sayfadan kalktı.
 * İndirim Raporu, Kasa Durumu ve diğer raporlar durur.
 * Açılış bu sekmeyi isterse güzellikte hizmet raporu, restoranda ürün raporu, diğerinde günlük rapora döner.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../../locales/module-translations';
import { GRAFANA_APP_REPORTS_META } from '../../utils/grafanaAppReportsCatalog';

const reportsModuleSrc = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');

function sliceFn(name: string, nextName: string): string {
  const start = reportsModuleSrc.indexOf(`function ${name}`);
  const end = reportsModuleSrc.indexOf(`function ${nextName}`);
  return reportsModuleSrc.slice(start, end);
}

describe('Ödeme Dağılımı raporu kaldırıldı', () => {
  it('menü anahtarı ve sayfa bağı yok; gizli listede ve açılış reddeder', () => {
    expect(reportsModuleSrc).not.toMatch(/\{\s*key:\s*'payment-distribution'/);
    expect(reportsModuleSrc).not.toContain("selectedTab === 'payment-distribution'");
    expect(reportsModuleSrc).not.toContain("tm('odemeDagilimi')");
    expect(reportsModuleSrc).toContain("'payment-distribution'");
    expect(reportsModuleSrc).toContain("requested !== 'payment-distribution'");

    const initial = sliceFn('resolveInitialReportTab', 'filterReportMenuGroups');
    expect(initial).toContain("requested !== 'payment-distribution'");
    expect(initial).toContain("return 'beauty-service-report'");
    expect(initial).toContain("return 'product-reports'");
    expect(initial).toContain("return 'daily'");
  });

  it('yanındaki raporlar menüde durur', () => {
    expect(reportsModuleSrc).toContain("{ key: 'party-customer-sales'");
    expect(reportsModuleSrc).toContain("{ key: 'party-supplier-purchases'");
    expect(reportsModuleSrc).toContain("{ key: 'product-sales-by-period'");
    expect(reportsModuleSrc).toContain("{ key: 'cari-extract'");
    expect(reportsModuleSrc).toContain("{ key: 'cash-ledger'");
    expect(reportsModuleSrc).toContain("{ key: 'invoice-items-detail'");
    expect(reportsModuleSrc).toContain("{ key: 'purchase-summary'");
    expect(reportsModuleSrc).toContain("{ key: 'supplier-purchase-returns'");
    expect(reportsModuleSrc).toContain("{ key: 'stock-status'");
    expect(reportsModuleSrc).toContain("{ key: 'discount-report', label: tm('indirimRaporu')");
    expect(reportsModuleSrc).toContain("{ key: 'cash-status', label: tm('kasaDurumu')");
    expect(reportsModuleSrc).toContain("selectedTab === 'discount-report'");
    expect(reportsModuleSrc).toContain("selectedTab === 'cash-status'");
  });

  it('dört dildeki menü adı kalkar; katalogda ayrı kayıt yok', () => {
    expect(moduleTranslations).not.toHaveProperty('odemeDagilimi');
    expect(moduleTranslations).not.toHaveProperty('paymentDistribution');
    expect(moduleTranslations.indirimRaporu.tr).toBe('İndirim Raporu');
    expect(moduleTranslations.kasaDurumu.tr).toBe('Kasa Durumu');
    expect(moduleTranslations.odemeVeIslemler.tr).toBe('ÖDEME VE İŞLEMLER');
    const catalogIds = GRAFANA_APP_REPORTS_META.map((row) => row.id);
    expect(catalogIds).not.toContain('payment-distribution');
    expect(catalogIds).toContain('discount-report');
    expect(catalogIds).toContain('cash-status');
  });
});
