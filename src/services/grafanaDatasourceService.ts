/**
 * Grafana PostgreSQL datasource — sunucu kodu → database_name → köprü API.
 */

import { getBridgeUrl, IS_TAURI } from '../utils/env';
import {
  DB_SETTINGS,
  ensureTenantDatabaseFromRegistry,
  resolveEffectiveTenantDatabaseName,
} from './postgres';
import { fetchTenantRegistryRow, tenantRowToAppConfigPatch } from './merkezTenantRegistry';

export type GrafanaDbEnsureResult =
  | { ok: true; database: string; serverCode: string }
  | { ok: false; needServerCode: true; reason: string }
  | { ok: false; needServerCode: false; reason: string };

function readStoredServerCode(): string {
  const fromSettings = String(DB_SETTINGS.merkezTenantCode || '').trim();
  if (fromSettings) return fromSettings;
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem('retailex_web_config');
    if (!raw) return '';
    const cfg = JSON.parse(raw) as { merkez_tenant_code?: string };
    return String(cfg.merkez_tenant_code || '').trim();
  } catch {
    return '';
  }
}

function persistServerConfig(patch: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem('retailex_web_config');
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next = { ...prev, ...patch, is_configured: true };
    window.localStorage.setItem('retailex_web_config', JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

async function setGrafanaPostgresDatabase(database: string): Promise<void> {
  if (IS_TAURI) {
    // Masaüstü: Grafana yığını yoksa sessiz geç
    return;
  }
  const bridge = getBridgeUrl();
  const res = await fetch(`${bridge}/api/grafana/postgres-database`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ database }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; database?: string };
  if (!res.ok) {
    throw new Error(body.error || `Grafana API hata: HTTP ${res.status}`);
  }
}

/**
 * Mevcut oturum/server kodundan DB adını çözüp Grafana datasource’a yazar.
 * Çözülemezse needServerCode: true — UI modal açmalı.
 */
export async function ensureGrafanaDbForCurrentServer(): Promise<GrafanaDbEnsureResult> {
  try {
    await ensureTenantDatabaseFromRegistry().catch(() => undefined);
  } catch {
    /* devam */
  }

  const serverCode = readStoredServerCode();
  let database = resolveEffectiveTenantDatabaseName();

  if (!database && serverCode) {
    try {
      const row = await fetchTenantRegistryRow(serverCode);
      database = row.database_name?.trim() || null;
      if (database) {
        const patch = tenantRowToAppConfigPatch(row);
        persistServerConfig(patch);
        DB_SETTINGS.merkezTenantCode = row.code;
      }
    } catch (e) {
      return {
        ok: false,
        needServerCode: true,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (!serverCode && !database) {
    return {
      ok: false,
      needServerCode: true,
      reason: 'Server kodu bulunamadı. Bağlanmak için server kodunu girin.',
    };
  }

  if (!database) {
    return {
      ok: false,
      needServerCode: true,
      reason: 'Server kodundan veritabanı adı çözülemedi.',
    };
  }

  try {
    await setGrafanaPostgresDatabase(database);
    return { ok: true, database, serverCode: serverCode || database };
  } catch (e) {
    return {
      ok: false,
      needServerCode: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Kullanıcının girdiği server kodunu kaydet, DB çöz, Grafana’ya bağla.
 */
export async function connectGrafanaWithServerCode(serverCodeRaw: string): Promise<GrafanaDbEnsureResult> {
  const serverCode = String(serverCodeRaw || '').trim();
  if (!serverCode) {
    return { ok: false, needServerCode: true, reason: 'Server kodu zorunlu.' };
  }

  try {
    const row = await fetchTenantRegistryRow(serverCode);
    const database = String(row.database_name || '').trim();
    if (!database) {
      return {
        ok: false,
        needServerCode: true,
        reason: 'Kayıtta database_name yok.',
      };
    }
    const patch = tenantRowToAppConfigPatch(row);
    persistServerConfig(patch);
    DB_SETTINGS.merkezTenantCode = row.code;
    try {
      const { setRegistryResolvedTenantDatabaseName } = await import('./postgres');
      setRegistryResolvedTenantDatabaseName(database);
    } catch {
      /* ignore */
    }
    await setGrafanaPostgresDatabase(database);
    return { ok: true, database, serverCode: row.code };
  } catch (e) {
    return {
      ok: false,
      needServerCode: true,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
