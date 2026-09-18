/**
 * Raporlar araç çubuğu İş kolu seçenekleri — yalnızca firmanın açık dikeyleri.
 * Kaynak: firms.enabled_modules, yoksa retailex_enabled_modules / tenant_module.
 * Dikeyler koddan silinmez; lisanslı olmayanlar listeden çıkar.
 */

import { normalizeFirmEnabledModules } from '../../utils/firmShellModules';
import { isMainModuleVisible } from '../../utils/mainModuleVisibility';

export type ReportBusinessType = 'retail' | 'market' | 'restaurant' | 'beauty';

function readTenantModuleHint(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (!raw) return '';
    const cfg = JSON.parse(raw) as { tenant_module?: string; system_type?: string };
    const tm = String(cfg.tenant_module ?? '').trim().toLowerCase();
    if (tm) return tm;
    return String(cfg.system_type ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function tenantShowsAllVerticals(hint: string): boolean {
  return (
    hint === 'all' ||
    hint === 'full' ||
    hint === 'complete' ||
    hint === 'demo' ||
    hint === 'bayi' ||
    hint.includes('all') ||
    hint.includes('full')
  );
}

function isShellOn(
  id: 'pos' | 'restaurant' | 'beauty',
  firm?: { enabled_modules?: unknown } | null,
): boolean {
  const fromFirm = normalizeFirmEnabledModules(firm?.enabled_modules);
  if (fromFirm) return fromFirm.includes(id);
  const hint = readTenantModuleHint();
  if (hint === 'clinic' || hint === 'beauty') return id === 'beauty';
  if (hint === 'restaurant') return id === 'restaurant' || id === 'pos';
  if (hint === 'retail' || hint === 'market') return id === 'pos';
  if (hint === 'wms' || hint === 'pdks' || hint === 'hrm' || hint === 'tenant_registry') {
    return false;
  }
  if (tenantShowsAllVerticals(hint)) return isMainModuleVisible(id);
  /** Hint yok: klinik/güzellik varsayılanı — POS varsayılan açık sanılıp Perakende/Market/Restoran görünmesin. */
  if (!hint) return id === 'beauty';
  return isMainModuleVisible(id);
}

/**
 * Firmanın lisanslı/aktif iş kolları.
 * Belirsiz (modül yok, tenant hint yok): yalnızca Güzellik — dört dikeyi açma.
 * `pos` → Perakende; tenant market ise Market; all/demo ise ikisi.
 */
export function resolveEnabledReportBusinessTypes(
  firm?: { enabled_modules?: unknown } | null,
): ReportBusinessType[] {
  const pos = isShellOn('pos', firm);
  const restaurant = isShellOn('restaurant', firm);
  const beauty = isShellOn('beauty', firm);
  if (!pos && !restaurant && !beauty) return ['beauty'];

  const hint = readTenantModuleHint();
  const out: ReportBusinessType[] = [];
  if (pos) {
    if (tenantShowsAllVerticals(hint)) {
      out.push('retail', 'market');
    } else if (hint === 'market') {
      out.push('market');
    } else {
      out.push('retail');
    }
  }
  if (restaurant) out.push('restaurant');
  if (beauty) out.push('beauty');
  return out;
}

export function clampReportBusinessType(
  current: ReportBusinessType,
  enabled: ReportBusinessType[],
): ReportBusinessType {
  if (enabled.includes(current)) return current;
  return enabled[0] ?? 'beauty';
}
