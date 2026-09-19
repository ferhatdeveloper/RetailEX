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

export type GrafanaSchemaColumn = {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
};

export type GrafanaSchemaTable = {
  schemaName: string;
  tableName: string;
  logicalName: string;
  kind: string;
  columns: GrafanaSchemaColumn[];
};

export type GrafanaSchemaResult =
  | {
      ok: true;
      database: string;
      firm: string;
      period: string;
      tableCount: number;
      tables: GrafanaSchemaTable[];
      source: 'grafana-api' | 'tenant';
    }
  | { ok: false; reason: string };

/**
 * Grafana ds/query → information_schema (köprü). Başarısızsa tenant postgres keşfi.
 */
export async function fetchGrafanaSchema(opts: {
  firm: string;
  period: string;
  search?: string;
}): Promise<GrafanaSchemaResult> {
  const firm = String(opts.firm || '001').replace(/\D/g, '').padStart(3, '0') || '001';
  const period = String(opts.period || '01').replace(/\D/g, '').padStart(2, '0') || '01';
  const q = String(opts.search || '').trim();

  if (!IS_TAURI) {
    try {
      const bridge = getBridgeUrl();
      const qs = new URLSearchParams({ firm, period });
      if (q) qs.set('q', q);
      const res = await fetch(`${bridge}/api/grafana/schema?${qs}`, {
        method: 'GET',
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        database?: string;
        firm?: string;
        period?: string;
        tableCount?: number;
        tables?: GrafanaSchemaTable[];
      };
      if (res.ok && Array.isArray(body.tables)) {
        return {
          ok: true,
          database: String(body.database || ''),
          firm: String(body.firm || firm),
          period: String(body.period || period),
          tableCount: Number(body.tableCount || body.tables.length),
          tables: body.tables,
          source: 'grafana-api',
        };
      }
      // düş — tenant fallback
      if (!res.ok && body.error) {
        console.warn('[Grafana schema API]', body.error);
      }
    } catch (e) {
      console.warn('[Grafana schema API]', e);
    }
  }

  try {
    const { discoverTenantReportSchema } = await import('./tenantReportSchemaService');
    const { context, tables } = await discoverTenantReportSchema({ search: q || undefined });
    return {
      ok: true,
      database: context.databaseName || '',
      firm: context.firmNr,
      period: context.periodNr,
      tableCount: tables.length,
      tables: tables.map((t) => ({
        schemaName: t.schemaName,
        tableName: t.tableName,
        logicalName: t.logicalName,
        kind: t.kind,
        columns: t.columns,
      })),
      source: 'tenant',
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export type GrafanaDashboardsSyncResult =
  | {
      ok: true;
      total: number;
      okCount: number;
      failCount: number;
      missingBefore?: string[];
    }
  | { ok: false; reason: string };

/** Repo JSON panolarını Grafana’ya yükler (Dashboard not found çözümü). */
export async function syncGrafanaDashboardsViaApi(): Promise<GrafanaDashboardsSyncResult> {
  if (IS_TAURI) {
    return { ok: false, reason: 'Masaüstünde Grafana sync yok.' };
  }
  const bridge = getBridgeUrl();

  // 1) Frontend static /grafana-dashboards/*.json → bridge import
  //    Dokploy’da bridge volume boş olsa bile nginx’teki JSON’lar yeter
  try {
    const meta = await import('../utils/grafanaAppReportsCatalog');
    const uids = [
      ...meta.GRAFANA_APP_REPORTS_META.map((m) => m.uid),
      ...GRAFANA_READY_REPORTS.filter((r) => !r.isBuilder).map((r) => r.uid),
    ];
    const unique = Array.from(new Set(uids));
    const batch: Record<string, unknown>[] = [];
    for (const uid of unique) {
      try {
        const r = await fetch(`/grafana-dashboards/${uid}.json`, { credentials: 'same-origin' });
        if (!r.ok) continue;
        const dash = (await r.json()) as Record<string, unknown>;
        if (dash && dash.uid) batch.push(dash);
      } catch {
        /* skip */
      }
    }
    if (batch.length > 0) {
      let okCount = 0;
      const chunk = 8;
      for (let i = 0; i < batch.length; i += chunk) {
        const slice = batch.slice(i, i + chunk);
        const res = await fetch(`${bridge}/api/grafana/dashboards/import`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dashboards: slice }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          okCount?: number;
        };
        if (!res.ok) {
          // Disk sync’e düş
          break;
        }
        okCount += Number(body.okCount || 0);
      }
      if (okCount > 0) {
        return { ok: true, total: batch.length, okCount, failCount: batch.length - okCount };
      }
    }
  } catch {
    /* disk sync dene */
  }

  // 2) Bridge disk sync (imaj / volume)
  try {
    const res = await fetch(`${bridge}/api/grafana/dashboards/sync`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      total?: number;
      okCount?: number;
      failCount?: number;
    };
    if (res.ok && Number(body.okCount || 0) > 0) {
      return {
        ok: true,
        total: Number(body.total || 0),
        okCount: Number(body.okCount || 0),
        failCount: Number(body.failCount || 0),
      };
    }
    return {
      ok: false,
      reason:
        body.error ||
        'Pano JSON bulunamadı. Frontend + bridge redeploy edin (public/grafana-dashboards).',
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Tek pano eksikse public JSON’dan import et */
export async function ensureGrafanaDashboardUid(uid: string): Promise<boolean> {
  if (!uid || IS_TAURI) return false;
  const bridge = getBridgeUrl();
  try {
    const check = await fetch(`${bridge}/api/grafana/dashboards/uid/${encodeURIComponent(uid)}`, {
      credentials: 'same-origin',
    });
    if (check.ok) return true;
  } catch {
    /* import dene */
  }
  try {
    const r = await fetch(`/grafana-dashboards/${uid}.json`, { credentials: 'same-origin' });
    if (!r.ok) return false;
    const dashboard = await r.json();
    const res = await fetch(`${bridge}/api/grafana/dashboards/import`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard }),
    });
    return res.ok;
  } catch {
    return false;
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
    try {
      const { grafanaAppReportsAsReady } = await import('../utils/grafanaAppReportsCatalog');
      const appReports = grafanaAppReportsAsReady();
      return {
        source: 'static',
        reports: [...appReports, ...GRAFANA_READY_REPORTS.filter((r) => !appReports.some((a) => a.uid === r.uid))],
      };
    } catch {
      return { source: 'static', reports: GRAFANA_READY_REPORTS };
    }
  }
  try {
    const { grafanaAppReportsAsReady } = await import('../utils/grafanaAppReportsCatalog');
    const appReports = grafanaAppReportsAsReady();
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
        reports: [...appReports, ...GRAFANA_READY_REPORTS.filter((r) => !appReports.some((a) => a.uid === r.uid))],
        error: body.error || `HTTP ${res.status}`,
      };
    }
    const apiList = Array.isArray(body.dashboards) ? body.dashboards : [];
    if (apiList.length === 0) {
      return {
        source: 'static',
        reports: [...appReports, ...GRAFANA_READY_REPORTS.filter((r) => !appReports.some((a) => a.uid === r.uid))],
        error: 'API boş liste',
      };
    }

    const byUid = new Map(GRAFANA_READY_REPORTS.map((r) => [r.uid, r]));
    for (const a of appReports) byUid.set(a.uid, a);
    const tools = GRAFANA_READY_REPORTS.filter((r) => r.isBuilder);
    const merged: GrafanaReadyReport[] = [];
    const seen = new Set<string>();

    // Önce uygulama raporları (Genel Rapor eşleşmesi)
    for (const a of appReports) {
      if (seen.has(a.uid)) continue;
      seen.add(a.uid);
      merged.push(a);
    }

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
        id: uid.replace(/^retailex-rpt-/, '').replace(/^retailex-/, '') || uid,
        uid,
        category,
        titleTr: title.replace(/^RetailEX\s+/i, ''),
        titleEn: title.replace(/^RetailEX\s+/i, ''),
        descriptionTr:
          (d.tags || []).filter((t) => t !== 'retailex' && t !== 'ready' && t !== 'app-report').join(' · ') ||
          'Grafana',
        descriptionEn:
          (d.tags || []).filter((t) => t !== 'retailex' && t !== 'ready' && t !== 'app-report').join(' · ') ||
          'Grafana',
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
    try {
      const { grafanaAppReportsAsReady } = await import('../utils/grafanaAppReportsCatalog');
      const appReports = grafanaAppReportsAsReady();
      return {
        source: 'static',
        reports: [...appReports, ...GRAFANA_READY_REPORTS.filter((r) => !appReports.some((a) => a.uid === r.uid))],
        error: e instanceof Error ? e.message : String(e),
      };
    } catch {
      return {
        source: 'static',
        reports: GRAFANA_READY_REPORTS,
        error: e instanceof Error ? e.message : String(e),
      };
    }
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
