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
