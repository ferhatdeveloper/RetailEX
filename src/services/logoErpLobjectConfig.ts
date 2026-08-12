/**
 * Logo LOBJECT / MSSQL bağlantı alanları — Kurulum config.db + yerel ek alanlar.
 */

import { IS_TAURI, safeInvoke } from '../utils/env';

const EXTRA_STORAGE_KEY = 'retailex_logo_lobject_extra';

export type LogoLobjectConfig = {
  erp_host: string;
  erp_user: string;
  erp_pass: string;
  erp_db: string;
  erp_port: string;
  erp_integrator_api: string;
};

const DEFAULTS: LogoLobjectConfig = {
  erp_host: '26.154.3.237',
  erp_user: 'sa',
  erp_pass: '',
  erp_db: 'LOGO',
  erp_port: '1433',
  erp_integrator_api: '',
};

type LobjectExtra = Pick<LogoLobjectConfig, 'erp_port' | 'erp_integrator_api'>;

function loadExtra(): LobjectExtra {
  if (typeof window === 'undefined') {
    return { erp_port: DEFAULTS.erp_port, erp_integrator_api: DEFAULTS.erp_integrator_api };
  }
  try {
    const raw = localStorage.getItem(EXTRA_STORAGE_KEY);
    if (!raw) return { erp_port: DEFAULTS.erp_port, erp_integrator_api: '' };
    const parsed = JSON.parse(raw) as Partial<LobjectExtra>;
    return {
      erp_port: String(parsed.erp_port ?? DEFAULTS.erp_port),
      erp_integrator_api: String(parsed.erp_integrator_api ?? ''),
    };
  } catch {
    return { erp_port: DEFAULTS.erp_port, erp_integrator_api: '' };
  }
}

function saveExtra(extra: LobjectExtra): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(extra));
}

export async function loadLogoLobjectConfig(): Promise<LogoLobjectConfig> {
  const extra = loadExtra();
  if (!IS_TAURI) {
    const webRaw =
      typeof window !== 'undefined' ? localStorage.getItem('retailex_logo_lobject_web') : null;
    if (webRaw) {
      try {
        const w = JSON.parse(webRaw) as Partial<LogoLobjectConfig>;
        return {
          erp_host: String(w.erp_host ?? DEFAULTS.erp_host),
          erp_user: String(w.erp_user ?? DEFAULTS.erp_user),
          erp_pass: String(w.erp_pass ?? DEFAULTS.erp_pass),
          erp_db: String(w.erp_db ?? DEFAULTS.erp_db),
          erp_port: extra.erp_port,
          erp_integrator_api: extra.erp_integrator_api,
        };
      } catch {
        /* fall through */
      }
    }
    return { ...DEFAULTS, ...extra };
  }

  const cfg = (await safeInvoke('get_app_config')) as Record<string, unknown>;
  return {
    erp_host: String(cfg.erp_host ?? DEFAULTS.erp_host),
    erp_user: String(cfg.erp_user ?? DEFAULTS.erp_user),
    erp_pass: String(cfg.erp_pass ?? DEFAULTS.erp_pass),
    erp_db: String(cfg.erp_db ?? DEFAULTS.erp_db),
    erp_port: extra.erp_port,
    erp_integrator_api: String(cfg.logo_objects_path ?? extra.erp_integrator_api ?? ''),
  };
}

export async function saveLogoLobjectConfig(patch: Partial<LogoLobjectConfig>): Promise<LogoLobjectConfig> {
  const current = await loadLogoLobjectConfig();
  const next: LogoLobjectConfig = { ...current, ...patch };

  saveExtra({
    erp_port: next.erp_port,
    erp_integrator_api: next.erp_integrator_api,
  });

  if (!IS_TAURI) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'retailex_logo_lobject_web',
        JSON.stringify({
          erp_host: next.erp_host,
          erp_user: next.erp_user,
          erp_pass: next.erp_pass,
          erp_db: next.erp_db,
        }),
      );
    }
    return next;
  }

  const cfg = (await safeInvoke('get_app_config')) as Record<string, unknown>;
  await safeInvoke('save_app_config', {
    config: {
      ...cfg,
      erp_host: next.erp_host,
      erp_user: next.erp_user,
      erp_pass: next.erp_pass,
      erp_db: next.erp_db,
      logo_objects_path: next.erp_integrator_api,
    },
  });
  return next;
}
