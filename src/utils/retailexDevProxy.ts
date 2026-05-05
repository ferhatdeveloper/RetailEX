/**
 * Üretimde api.retailex.app CORS yalnızca https://retailex.app origin’ine izin verir.
 * `npm run dev` / `tauri:dev` (localhost:6173) için istekler Vite proxy üzerinden aynı origin’den gider.
 * Paketlenmiş Tauri: WebView `fetch` CORS’a takılır — `@tauri-apps/plugin-http` kullanılır.
 * @see vite.config.ts — `/__retailex-api` → https://api.retailex.app
 */

import { IS_TAURI } from './env';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export const RETAILEX_APP_API_HOST = 'api.retailex.app';

/** Vite `server.proxy` ile eşleşen önek (path rewrite ile tam URL’ye dönüşür). */
export const VITE_DEV_API_PROXY_PREFIX = '/__retailex-api';

/**
 * Geliştirme modunda `https://api.retailex.app/...` → `http://localhost:6173/__retailex-api/...`
 * Kiracı (/aqua), merkez (/merkez) ve diğer PostgREST tabanları aynı kural ile çalışır.
 */
export function rewriteRetailexAppUrlForViteDev(url: string): string {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return url;
  const raw = (url || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname !== RETAILEX_APP_API_HOST) return url;
    return `${window.location.origin}${VITE_DEV_API_PROXY_PREFIX}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/**
 * PostgREST / merkez API: tarayıcıda (DEV) Vite proxy; Tauri masaüstünde plugin-http (CORS yok).
 */
export async function fetchRetailexAware(url: string, init?: RequestInit): Promise<Response> {
  const raw = (url || '').trim();
  try {
    const u = new URL(raw);
    if (IS_TAURI && u.hostname === RETAILEX_APP_API_HOST) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      return tauriFetch(raw, {
        ...init,
        connectTimeout: 60_000,
      });
    }

    const isCapacitorNative =
      !IS_TAURI &&
      Capacitor.isNativePlatform() &&
      (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');
    if (isCapacitorNative && u.hostname === RETAILEX_APP_API_HOST) {
      const method = (init?.method || 'GET').toUpperCase();
      const headers = { ...(init?.headers as Record<string, string> | undefined) };
      const data = typeof init?.body === 'string' ? init.body : undefined;
      const res = await CapacitorHttp.request({
        url: raw,
        method,
        headers,
        data,
        connectTimeout: 60_000,
        readTimeout: 60_000,
      });

      const responseBody =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? null);
      return new Response(responseBody, {
        status: res.status,
        headers: res.headers as HeadersInit,
      });
    }
  } catch {
    return fetch(raw, init);
  }
  const proxied = rewriteRetailexAppUrlForViteDev(raw);
  return fetch(proxied, init);
}
