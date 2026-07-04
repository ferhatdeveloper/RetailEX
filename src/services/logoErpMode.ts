/**
 * Logo ERP bağlantı modu — Entegrasyonlar sayfası (REST servis vs MSSQL).
 */

import { IS_TAURI, safeInvoke } from '../utils/env';

export type LogoErpMode = 'rest' | 'mssql';

const STORAGE_KEY = 'retailex_logo_erp_mode';

export function loadLogoErpMode(): LogoErpMode {
  if (typeof window === 'undefined') return IS_TAURI ? 'mssql' : 'rest';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'rest' || raw === 'mssql') return raw;
  } catch {
    /* ignore */
  }
  return IS_TAURI ? 'mssql' : 'rest';
}

export async function resolveLogoErpModeFromConfig(): Promise<LogoErpMode> {
  const stored = loadLogoErpMode();
  if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
    return stored;
  }
  if (!IS_TAURI) return 'rest';
  try {
    const cfg = await safeInvoke<Record<string, unknown>>('get_app_config');
    const method = String(cfg.erp_method || 'sql').toLowerCase();
    if (method === 'rest' || method === 'api') return 'rest';
    return 'mssql';
  } catch {
    return stored;
  }
}

export async function saveLogoErpMode(mode: LogoErpMode): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('retailex:logo-erp-mode', { detail: mode }));
  }
  if (!IS_TAURI) return;
  try {
    const cfg = await safeInvoke<Record<string, unknown>>('get_app_config');
    await safeInvoke('save_app_config', {
      config: {
        ...cfg,
        erp_method: mode === 'rest' ? 'rest' : 'sql',
      },
    });
  } catch {
    /* config.db yoksa yalnızca localStorage */
  }
}
