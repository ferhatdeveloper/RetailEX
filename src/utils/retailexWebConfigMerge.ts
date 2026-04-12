/**
 * SQLite'daki Rust AppConfig ile tarayıcı önbelleğindeki tam nesneyi birleştirir.
 * Rust tarafında olmayan alanlar (enabled_modules, bayi_seti, title, …) korunur.
 */

export function parseStoredRetailexWebConfig(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** İşletme tipine göre varsayılan modül listesi (önbellek bozuksa geri yükleme). */
export function defaultEnabledModulesForSystemType(systemType: string): string[] {
  switch (systemType) {
    case 'retail':
    case 'market':
      return ['pos', 'wms'];
    case 'wms':
      return ['wms'];
    case 'restaurant':
      return ['pos', 'restaurant'];
    case 'beauty':
      return ['beauty'];
    case 'bayi':
      return ['pos', 'wms', 'restaurant', 'beauty'];
    default:
      return ['pos', 'wms'];
  }
}

/**
 * Rust'tan gelen config ile localStorage birleşimi: önce önbellek, üzerine Rust (gerçek kaynak alanları).
 * Rust'ta olmayan anahtarlar önbellekten kalır.
 */
export function mergeRustIntoStoredWebConfig(rustConfig: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const prev = parseStoredRetailexWebConfig();
  if (!rustConfig || typeof rustConfig !== 'object') return { ...prev };

  const merged: Record<string, unknown> = { ...prev, ...rustConfig };

  const st = String(merged.system_type || prev.system_type || 'retail').toLowerCase();
  merged.system_type = st;

  const mods = merged.enabled_modules;
  const prevMods = prev.enabled_modules;
  if (!Array.isArray(mods) || mods.length === 0) {
    merged.enabled_modules =
      Array.isArray(prevMods) && prevMods.length > 0 ? prevMods : defaultEnabledModulesForSystemType(st);
  }

  if (merged.bayi_seti === undefined && typeof prev.bayi_seti === 'boolean') {
    merged.bayi_seti = prev.bayi_seti;
  }

  if ((merged.title === undefined || merged.title === '') && typeof prev.title === 'string' && prev.title.trim()) {
    merged.title = prev.title;
  }

  return merged;
}
