/**
 * Grafana PostgreSQL datasource — sunucu kodu → database_name → köprü API.
 * Dashboard listesi: GET /api/grafana/dashboards
 */

import { getBridgeUrl, IS_TAURI } from '../utils/env';
import {
  DB_SETTINGS,
  ensureTenantDatabaseFromRegistry,
  resolveEffectiveTenantDatabaseName,
} from './postgres';
import { fetchTenantRegistryRow, tenantRowToAppConfigPatch } from './merkezTenantRegistry';
import {
  GRAFANA_READY_REPORTS,
  categoryFromGrafanaTags,
  dashEmbed,
  type GrafanaReadyReport,
  type GrafanaReportCategory,
} from '../utils/grafanaEmbed';

export type GrafanaDbEnsureResult =
  | { ok: true; database: string; serverCode: string }
  | { ok: false; needServerCode: true; reason: string }
  | { ok: false; needServerCode: false; reason: string };

export type GrafanaApiDashboard = {
  uid: string;
  title: string;
  url: string;
  tags: string[];
  folder: string;
};

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
 * Grafana API üzerinden panoları çeker; başarısızsa statik katalog.
 */
export async function listGrafanaDashboardsViaApi(): Promise<{
  source: 'api' | 'static';
  reports: GrafanaReadyReport[];
  error?: string;
}> {
  if (IS_TAURI) {
    return { source: 'static', reports: GRAFANA_READY_REPORTS };
  }
  try {
    const bridge = getBridgeUrl();
    const res = await fetch(`${bridge}/api/grafana/dashboards?q=retailex`, {
      method: 'GET',
      credentials: 'same-origin',
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      dashboards?: GrafanaApiDashboard[];
    };
    if (!res.ok) {
      return {
        source: 'static',
        reports: GRAFANA_READY_REPORTS,
        error: body.error || `HTTP ${res.status}`,
      };
    }
    const apiList = Array.isArray(body.dashboards) ? body.dashboards : [];
    if (apiList.length === 0) {
      return { source: 'static', reports: GRAFANA_READY_REPORTS, error: 'API boş liste' };
    }

    const byUid = new Map(GRAFANA_READY_REPORTS.map((r) => [r.uid, r]));
    const tools = GRAFANA_READY_REPORTS.filter((r) => r.isBuilder);
    const merged: GrafanaReadyReport[] = [];
    const seen = new Set<string>();

    for (const d of apiList) {
      const uid = d.uid;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const known = byUid.get(uid);
      if (known) {
        merged.push(known);
        continue;
      }
      const category: GrafanaReportCategory = categoryFromGrafanaTags(d.tags);
      const title = d.title || uid;
      merged.push({
        id: uid.replace(/^retailex-/, '') || uid,
        uid,
        category,
        titleTr: title,
        titleEn: title,
        descriptionTr:
          (d.tags || []).filter((t) => t !== 'retailex' && t !== 'ready').join(' · ') || 'Grafana',
        descriptionEn:
          (d.tags || []).filter((t) => t !== 'retailex' && t !== 'ready').join(' · ') || 'Grafana',
        embedPath: (theme, vars) => dashEmbed(uid, theme, '&refresh=2m', vars),
      });
    }

    for (const t of tools) {
      if (!seen.has(t.uid)) merged.push(t);
    }

    for (const r of GRAFANA_READY_REPORTS) {
      if (r.isBuilder) continue;
      if (!seen.has(r.uid)) merged.push(r);
    }

    return { source: 'api', reports: merged };
  } catch (e) {
    return {
      source: 'static',
      reports: GRAFANA_READY_REPORTS,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

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
