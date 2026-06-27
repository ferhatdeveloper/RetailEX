/**
 * Kasa / terminal runtime bağlamı — web login + config birleşimi.
 */

import { IS_TAURI } from '../utils/env';

const POS_ROLES = new Set(['pos', 'terminal', 'kasa', 'mpos', 'cashier']);

export type TerminalRuntime = {
  terminalName: string;
  storeId: string;
  role: string;
};

export let TERMINAL_RUNTIME: TerminalRuntime = {
  terminalName: '',
  storeId: '',
  role: '',
};

export function isPosTerminalRole(role?: string | null): boolean {
  const r = String(role ?? TERMINAL_RUNTIME.role ?? '').trim().toLowerCase();
  return POS_ROLES.has(r);
}

export function isKasaTerminalRuntime(): boolean {
  if (isPosTerminalRole(TERMINAL_RUNTIME.role)) return true;
  return TERMINAL_RUNTIME.terminalName.trim().length > 0;
}

export function applyTerminalRuntimeFromConfig(config: Record<string, unknown> | null | undefined): void {
  if (!config || typeof config !== 'object') return;
  TERMINAL_RUNTIME = {
    terminalName: String(config.terminal_name ?? TERMINAL_RUNTIME.terminalName ?? '').trim(),
    storeId: String(config.store_id ?? TERMINAL_RUNTIME.storeId ?? '').trim(),
    role: String(config.role ?? TERMINAL_RUNTIME.role ?? '').trim().toLowerCase(),
  };
}

export function applyTerminalRuntimeFromAuth(user: {
  store_id?: string | null;
  username?: string | null;
  role?: string | null;
  roles?: Array<{ name?: string; landingRoute?: string }>;
}): void {
  const roleName =
    user.role ||
    user.roles?.[0]?.name ||
    (user.roles?.[0]?.landingRoute === 'pos' ? 'pos' : '');

  if (user.store_id?.trim()) {
    TERMINAL_RUNTIME.storeId = String(user.store_id).trim();
  }
  if (!TERMINAL_RUNTIME.terminalName.trim() && user.username?.trim()) {
    TERMINAL_RUNTIME.terminalName = String(user.username).trim();
  }
  if (roleName) {
    TERMINAL_RUNTIME.role = String(roleName).trim().toLowerCase();
  }
  persistTerminalRuntimeToWebConfig();
}

function persistTerminalRuntimeToWebConfig(): void {
  if (typeof window === 'undefined' || IS_TAURI) return;
  try {
    const raw = localStorage.getItem('retailex_web_config');
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      'retailex_web_config',
      JSON.stringify({
        ...prev,
        store_id: TERMINAL_RUNTIME.storeId || prev.store_id,
        terminal_name: TERMINAL_RUNTIME.terminalName || prev.terminal_name,
        role: TERMINAL_RUNTIME.role || prev.role,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function readTerminalRuntimeFromWebStorage(): TerminalRuntime {
  if (typeof window === 'undefined') return TERMINAL_RUNTIME;
  try {
    const raw = localStorage.getItem('retailex_web_config');
    if (!raw) return TERMINAL_RUNTIME;
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    return {
      terminalName: String(cfg.terminal_name ?? TERMINAL_RUNTIME.terminalName ?? '').trim(),
      storeId: String(cfg.store_id ?? TERMINAL_RUNTIME.storeId ?? '').trim(),
      role: String(cfg.role ?? TERMINAL_RUNTIME.role ?? '').trim().toLowerCase(),
    };
  } catch {
    return TERMINAL_RUNTIME;
  }
}
