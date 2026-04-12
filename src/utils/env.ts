/**
 * Environment Detection Utility
 */

import { APP_VERSION } from '../core/version';

export const IS_TAURI = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
export const IS_BROWSER = !IS_TAURI;

const BRIDGE_URL_OVERRIDE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BRIDGE_URL
    ? String((import.meta as any).env.VITE_BRIDGE_URL)
    : ''
  ).trim();

/**
 * Safely invoke a Tauri command. 
 * If running in a browser, returns a fallback value or throws a descriptive error.
 */
export async function safeInvoke<T>(command: string, args?: any, fallback?: T): Promise<T> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(command, args) as T;
    } catch (error) {
      const msg = String(error ?? '');
      const isCommandNotFound = msg.includes('not found') || msg.includes('Command');
      if (!isCommandNotFound) console.error(`[Tauri Invoke Error] ${command}:`, error);
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  console.warn(`[Browser Mode] Skipping Tauri command: ${command}`);
  if (fallback !== undefined) return fallback;
  
  // Natural fallback logic for common commands
  if (command === 'get_app_config')
    return { is_configured: false, regulatory_region: 'IQ', default_currency: 'IQD' } as any;
  if (command === 'get_app_version') return `${APP_VERSION.full}-web` as any;
  if (command === 'check_pg16') return true as any; // Pretend PG exists for bridge
  
  throw new Error(`Tauri command "${command}" is not available in browser mode.`);
}

/** Windows Tauri: RetailEX arka plan / VPN / SQL Bridge / Logo Windows hizmetlerini durdurur ve kaldırır. */
export async function removeRetailexWindowsServicesIfTauri(): Promise<{ ok: boolean; detail?: string }> {
  if (!IS_TAURI) return { ok: true };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const detail = await invoke<string>('remove_retailex_windows_services');
    return { ok: true, detail };
  } catch (e: unknown) {
    return { ok: false, detail: String(e) };
  }
}

/** Windows Tauri: `C:\\RetailEX` klasorunu siler (fabrika / yeniden kurulum secenegi). */
export async function deleteCRetailexFolderIfTauri(): Promise<{ ok: boolean; detail?: string }> {
  if (!IS_TAURI) return { ok: true };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const detail = await invoke<string>('delete_c_retailex_folder');
    return { ok: true, detail };
  } catch (e: unknown) {
    return { ok: false, detail: String(e) };
  }
}

/**
 * PostgreSQL Bridge tabanı (tarayıcıda `/api/pg_query` vb. için).
 * Vite dev: aynı origin + `vite.config` proxy → bridge :3001 (köprü yine çalışır durumda olmalı).
 */
export const getBridgeUrl = () => {
  if (BRIDGE_URL_OVERRIDE) return BRIDGE_URL_OVERRIDE.replace(/\/+$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3001';

  const host = window.location.hostname.toLowerCase();
  const isLocalHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1';

  const dev =
    typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
  if (dev && isLocalHost) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return isLocalHost ? 'http://localhost:3001' : 'https://api.retailex.app';
};
