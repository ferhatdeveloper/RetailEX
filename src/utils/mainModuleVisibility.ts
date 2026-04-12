import type { Module } from '../App';

/**
 * MainLayout üst modül sekmeleri ile aynı kurallar (retailex_enabled_modules + bayi_seti).
 * Kurulum sihirbazı: "Yönetim (Backoffice) her zaman erişilebilir" — management burada her zaman görünür.
 */
export function isMainModuleVisible(moduleId: string): boolean {
  if (moduleId === 'management') return true;
  if (typeof localStorage === 'undefined') return true;
  const bayiSeti = localStorage.getItem('retailex_bayi_seti') === 'true';
  try {
    const enabled: string[] = JSON.parse(localStorage.getItem('retailex_enabled_modules') || '[]');
    const hasExplicitEnabledList = Array.isArray(enabled) && enabled.length > 0;
    if (hasExplicitEnabledList) return enabled.includes(moduleId);
    return !bayiSeti;
  } catch {
    return true;
  }
}

const PRIMARY_SHELL_IDS = new Set<string>(['pos', 'wms', 'mobile-pos', 'restaurant', 'beauty']);

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
  const order = getShellModuleFallbackOrder();
  for (const id of order) {
    if (id === 'management') continue;
    if (isMainModuleVisible(id) && isPrimaryShellId(id)) {
      return id;
    }
  }
  return 'pos';
}

/** Görünür modül yoksa sırayla denenecek id'ler — işletme tipine göre (restoran önce POS değil). */
export function getShellModuleFallbackOrder(): string[] {
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (!raw) return ['pos', 'restaurant', 'wms', 'beauty', 'mobile-pos', 'management'];
    const cfg = JSON.parse(raw) as { system_type?: string };
    const st = cfg.system_type;
    if (st === 'restaurant') return ['restaurant', 'pos', 'wms', 'beauty', 'mobile-pos', 'management'];
    if (st === 'beauty') return ['beauty', 'pos', 'restaurant', 'wms', 'mobile-pos', 'management'];
    if (st === 'wms') return ['wms', 'pos', 'restaurant', 'beauty', 'mobile-pos', 'management'];
    if (st === 'bayi') return ['pos', 'restaurant', 'wms', 'beauty', 'mobile-pos', 'management'];
    return ['pos', 'restaurant', 'wms', 'beauty', 'mobile-pos', 'management'];
  } catch {
    return ['pos', 'restaurant', 'wms', 'beauty', 'mobile-pos', 'management'];
  }
}
