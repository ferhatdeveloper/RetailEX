/**
 * Asin ürün kapıları — restoran / güzellik pasif; yalnızca bulut (online + PostgREST).
 */

export const ASIN_DISABLED_SHELL_MODULES = ['restaurant', 'beauty'] as const;

export type AsinDisabledShellModule = (typeof ASIN_DISABLED_SHELL_MODULES)[number];

export function isAsinDisabledShellModule(moduleId: string): boolean {
  return (ASIN_DISABLED_SHELL_MODULES as readonly string[]).includes(moduleId);
}

/** Kabuk varsayılan sırası — restoran/güzellik yok */
export const ASIN_SHELL_FALLBACK_ORDER = ['pos', 'management', 'wms', 'mobile-pos'] as const;

/** Bağlantı: yerel/offline/hybrid kapalı — yalnızca online + rest_api */
export const ASIN_FORCED_DB_MODE = 'online' as const;
export const ASIN_FORCED_CONNECTION_PROVIDER = 'rest_api' as const;
