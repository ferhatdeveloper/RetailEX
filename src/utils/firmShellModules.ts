/**
 * Firma seçimine göre üst kabuk (retailex_enabled_modules) uygulaması.
 * firms.enabled_modules doluysa onu yazar; boşsa tenant_module / ALL_SHELL türetimine döner.
 */

import { shellEnabledModulesForTenantRegistryModule } from '../services/merkezTenantRegistry';

export const FIRM_SHELL_MODULES_CHANGED_EVENT = 'retailex-enabled-modules-changed';

const SHELL_IDS = new Set([
  'pos',
  'management',
  'wms',
  'mobile-pos',
  'restaurant',
  'beauty',
]);

/** Pasif tutulacak kabuk id'leri — listeye yazılsa bile temizlenir. */
const PASSIVE_SHELL_IDS = new Set(['wms', 'mobile-pos']);

export function normalizeFirmEnabledModules(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item || '')
      .trim()
      .toLowerCase();
    if (!id || !SHELL_IDS.has(id) || PASSIVE_SHELL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length === 0) return null;
  if (!out.includes('management')) out.unshift('management');
  return out;
}

function tenantFallbackModules(): string[] {
  try {
    const rawCfg = localStorage.getItem('retailex_web_config');
    if (rawCfg) {
      const cfg = JSON.parse(rawCfg) as { tenant_module?: string; enabled_modules?: unknown };
      const fromFirmCfg = normalizeFirmEnabledModules(cfg.enabled_modules);
      if (fromFirmCfg) {
        return fromFirmCfg.filter((m) => !PASSIVE_SHELL_IDS.has(m));
      }
      const tm = String(cfg.tenant_module || '').trim();
      if (tm) {
        return shellEnabledModulesForTenantRegistryModule(tm).filter(
          (m) => !PASSIVE_SHELL_IDS.has(m),
        );
      }
    }
  } catch {
    /* ignore */
  }
  return shellEnabledModulesForTenantRegistryModule('all').filter(
    (m) => !PASSIVE_SHELL_IDS.has(m),
  );
}

function persistShellModules(mods: string[]): void {
  localStorage.setItem('retailex_enabled_modules', JSON.stringify(mods));
  try {
    const raw = localStorage.getItem('retailex_web_config');
    const cfg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    cfg.enabled_modules = mods;
    localStorage.setItem('retailex_web_config', JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FIRM_SHELL_MODULES_CHANGED_EVENT, { detail: { modules: mods } }));
  }
}

/**
 * Seçili firmanın enabled_modules alanını kabuk görünürlüğüne uygular.
 * Firma alanı yoksa server varsayılanına (WMS/mobile-pos hariç) döner.
 */
export function applyFirmShellModules(firm: {
  enabled_modules?: unknown;
  firm_nr?: string | null;
} | null): string[] {
  if (typeof localStorage === 'undefined') return [];
  const fromFirm = normalizeFirmEnabledModules(firm?.enabled_modules);
  const mods = fromFirm ?? tenantFallbackModules();
  persistShellModules(mods);
  return mods;
}

export type ShellModuleFirmPick = {
  id?: string | null;
  firm_nr?: string | null;
  name?: string | null;
  enabled_modules?: unknown;
};

/**
 * Kabuk modülü (beauty/restaurant) için doğru firmayı seçer.
 * Örn. varsayılan Market (001) açıkken Güzellik’e geçilince Demo Güzellik (020).
 * Seçim değiştiyse bulunan firmayı döner; zaten uygunsa null.
 *
 * Not: `enabled_modules` yoksa firma uygun sayılmaz — yanlış firmada boş
 * `beauty.rex_001_beauty_services` okunmasını önlemek için sıkı kontrol.
 */
export function pickFirmForShellModule(
  moduleId: 'beauty' | 'restaurant',
  firms: ShellModuleFirmPick[],
  selectedFirm: ShellModuleFirmPick | null | undefined,
): ShellModuleFirmPick | null {
  const current = normalizeFirmEnabledModules(selectedFirm?.enabled_modules);
  if (current?.includes(moduleId)) return null;
  const match = firms.find((f) => normalizeFirmEnabledModules(f.enabled_modules)?.includes(moduleId));
  return match ?? null;
}

/** Firma seçim kimliği: tercihen firm_nr (pad), yoksa id — UUID’yi localStorage’a yazmayı önler. */
export function firmSelectionKey(firm: ShellModuleFirmPick | null | undefined): string {
  const nr = String(firm?.firm_nr ?? '').trim();
  if (nr) {
    const digits = nr.replace(/\D/g, '');
    return digits.length && digits.length <= 3 ? digits.padStart(3, '0') : nr;
  }
  return String(firm?.id ?? '').trim();
}
