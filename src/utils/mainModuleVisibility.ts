import type { Module } from '../App';
import { shellEnabledModulesForTenantRegistryModule } from '../services/merkezTenantRegistry';
import {
  ASIN_SHELL_FALLBACK_ORDER,
  isAsinDisabledShellModule,
} from './asinProductGates';

function readStoredShellEnabledModules(): string[] {
  try {
    const enabled: unknown = JSON.parse(localStorage.getItem('retailex_enabled_modules') || '[]');
    return Array.isArray(enabled)
      ? (enabled as string[]).filter((id) => !isAsinDisabledShellModule(id))
      : [];
  } catch {
    return [];
  }
}

/**
 * Kabuk için açık modül listesi: önce `retailex_enabled_modules`; boşsa merkez kiracı
 * `retailex_web_config.tenant_module` (tenant_registry.module) ile türetilir; ikisi de yoksa null (bayi / tümü mantığı).
 * Restoran ve güzellik Asin'de her zaman filtrelenir.
 */
function getExplicitShellEnabledList(): string[] | null {
  const stored = readStoredShellEnabledModules();
  if (stored.length > 0) return stored;
  try {
    const rawCfg = localStorage.getItem('retailex_web_config');
    if (!rawCfg) return null;
    const cfg = JSON.parse(rawCfg) as { tenant_module?: string };
    const tm = String(cfg.tenant_module || '').trim().toLowerCase();
    if (!tm) return null;
    // clinic / restaurant tenant_module → kabukta pasif; retail kabuğuna düş
    if (tm === 'clinic' || tm === 'restaurant' || tm === 'beauty') {
      return ['pos', 'management', 'wms', 'mobile-pos'];
    }
    const shell = shellEnabledModulesForTenantRegistryModule(tm).filter(
      (id) => !isAsinDisabledShellModule(id),
    );
    return shell.length > 0 ? shell : null;
  } catch {
    return null;
  }
}

/**
 * MainLayout üst modül sekmeleri.
 * Yönetim her zaman erişilebilir. Restoran / güzellik tamamen pasif.
 */
export function isMainModuleVisible(moduleId: string): boolean {
  if (isAsinDisabledShellModule(moduleId)) return false;
  if (moduleId === 'management') return true;
  if (typeof localStorage === 'undefined') return true;
  const bayiSeti = localStorage.getItem('retailex_bayi_seti') === 'true';
  try {
    const explicit = getExplicitShellEnabledList();
    if (explicit !== null) return explicit.includes(moduleId);
    return !bayiSeti;
  } catch {
    return true;
  }
}

const PRIMARY_SHELL_IDS = new Set<string>(['pos', 'wms', 'mobile-pos']);

/** Ana kabuk modülleri — restoran/güzellik yok */
const SHELL_MODULE_IDS = new Set<string>(['pos', 'management', 'wms', 'mobile-pos']);

function isPrimaryShellId(id: string): id is Module {
  return PRIMARY_SHELL_IDS.has(id);
}

/**
 * Caller ID / bildirim tıklaması: işletme tipine göre (retailex_web_config.system_type)
 * ilk görünür iş kabuğu — yönetimde otururken bile Market POS'a zorlamaz.
 *
 * `activeShell`: kullanıcı şu an bir iş kabuğundaysa (ör. Güzellik), Caller ID kartı ve
 * geçmiş satırları o kabuğa göre seçilir; aksi halde bayi/yanlış system_type kurulumlarında
 * sürekli POS/restoran önceliği güzellik akışını bozuyordu.
 */
export function getPrimaryShellModuleForCallerId(activeShell?: Module): Module {
  if (activeShell && activeShell !== 'management') {
    if (isPrimaryShellId(activeShell) && isMainModuleVisible(activeShell)) {
      return activeShell;
    }
  }
  const order = getShellModuleDisplayOrder();
  for (const id of order) {
    if (id === 'management') continue;
    if (isMainModuleVisible(id) && isPrimaryShellId(id)) {
      return id;
    }
  }
  return 'pos';
}

/** Görünür modül yoksa sırayla denenecek id'ler — Asin: yalnızca perakende kabuğu. */
export function getShellModuleFallbackOrder(): string[] {
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (!raw) return [...ASIN_SHELL_FALLBACK_ORDER];
    const cfg = JSON.parse(raw) as { system_type?: string };
    const st = cfg.system_type;
    if (st === 'wms') return ['wms', 'pos', 'management', 'mobile-pos'];
    return [...ASIN_SHELL_FALLBACK_ORDER];
  } catch {
    return [...ASIN_SHELL_FALLBACK_ORDER];
  }
}

/**
 * Üst kabukta modül ikonlarının sırası.
 * `retailex_enabled_modules` veya `tenant_module` ile gelen liste önce; ardından
 * görünür kalanlar `getShellModuleFallbackOrder` ile tamamlanır (ör. yönetim her zaman).
 */
export function getShellModuleDisplayOrder(): string[] {
  const fallback = getShellModuleFallbackOrder();
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const explicit = getExplicitShellEnabledList();
    if (explicit === null) return fallback;

    const seen = new Set<string>();
    const out: string[] = [];

    for (const id of explicit) {
      if (!SHELL_MODULE_IDS.has(id) || seen.has(id)) continue;
      if (!isMainModuleVisible(id)) continue;
      out.push(id);
      seen.add(id);
    }

    for (const id of fallback) {
      if (seen.has(id)) continue;
      if (!isMainModuleVisible(id)) continue;
      out.push(id);
      seen.add(id);
    }
    return out;
  } catch {
    return fallback;
  }
}
