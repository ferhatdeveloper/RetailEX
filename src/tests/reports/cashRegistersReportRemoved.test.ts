/**
 * Ödeme ve İşlemler altındaki Kasalar raporu menüden ve sayfadan kalktı.
 * Kasa Durumu ve içindeki kasalar tablosu durur.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLINIC_MIRROR_REPORTS } from '../../utils/clinicReportCenter';
import { GRAFANA_APP_REPORTS_META } from '../../utils/grafanaAppReportsCatalog';

const reportsModuleSrc = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');

describe('Kasalar raporu kaldırıldı', () => {
  it('menü anahtarı cash-registers yok, sayfa bağı yok, gizli listede', () => {
    expect(reportsModuleSrc).not.toMatch(/\{\s*key:\s*'cash-registers'/);
    expect(reportsModuleSrc).not.toContain("selectedTab === 'cash-registers'");
    expect(reportsModuleSrc).toContain("'cash-registers'");
    expect(reportsModuleSrc).toContain("requested !== 'cash-registers'");
  });

  it('Kasa Durumu menüsü ve içindeki kasalar tablosu duruyor', () => {
    expect(reportsModuleSrc).toContain("{ key: 'cash-status', label: tm('kasaDurumu')");
    expect(reportsModuleSrc).toContain("selectedTab === 'cash-status'");
    expect(reportsModuleSrc).toContain("cashStatusPane === 'registers'");
    expect(reportsModuleSrc).toContain('renderCashRegisterPanels()');
    expect(reportsModuleSrc).toContain("tm('cashStatusTabRegisters')");
  });

  it('klinik V2 ayna listesinde ve rapor kataloğunda ayrı Kasalar kaydı yok', () => {
    const clinicIds = CLINIC_MIRROR_REPORTS.map((row) => row.id);
    const catalogIds = GRAFANA_APP_REPORTS_META.map((row) => row.id);
    expect(clinicIds).not.toContain('cash-registers');
    expect(catalogIds).not.toContain('cash-registers');
    expect(catalogIds).toContain('cash-status');
  });
});
