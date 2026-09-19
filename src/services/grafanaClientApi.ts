/**
 * Grafana HTTP API — istemci token (localStorage) veya bridge fallback.
 */

import { getBridgeUrl, IS_TAURI } from '../utils/env';
import {
  isGrafanaClientReady,
  loadGrafanaClientConfig,
  type GrafanaClientConfig,
} from './grafanaClientConfig';
import { listGrafanaDashboardsViaApi, type GrafanaApiDashboard } from './grafanaDatasourceService';

export type GrafanaDashListItem = {
  uid: string;
  title: string;
  url: string;
  tags: string[];
  folder: string;
};

function authHeaders(cfg: GrafanaClientConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function listViaClientApi(cfg: GrafanaClientConfig, q = ''): Promise<{
  ok: boolean;
  dashboards: GrafanaDashListItem[];
  error?: string;
  source: 'client';
}> {
  try {
    const qs = new URLSearchParams({ type: 'dash-db', limit: '200' });
    if (q.trim()) qs.set('query', q.trim());
    const res = await fetch(`${cfg.baseUrl}/api/search?${qs}`, {
      method: 'GET',
      headers: authHeaders(cfg),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return {
        ok: false,
        dashboards: [],
        error: `Grafana ${res.status}: ${t.slice(0, 180)}`,
        source: 'client',
      };
    }
    const items = (await res.json()) as Array<{
      uid?: string;
      title?: string;
      url?: string;
      tags?: string[];
      folderTitle?: string;
    }>;
    const dashboards = (Array.isArray(items) ? items : [])
      .filter((d) => d?.uid)
      .map((d) => ({
        uid: String(d.uid),
        title: String(d.title || d.uid),
        url: String(d.url || `/d/${d.uid}`),
        tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
        folder: String(d.folderTitle || ''),
      }));
    return { ok: true, dashboards, source: 'client' };
  } catch (e: unknown) {
    return {
      ok: false,
      dashboards: [],
      error: e instanceof Error ? e.message : String(e),
      source: 'client',
    };
  }
}

/**
 * Önce istemci API (ayarlıysa), yoksa bridge /api/grafana/dashboards.
 */
export async function listGrafanaDashboardsForAssistant(q = 'retailex'): Promise<{
  ok: boolean;
  dashboards: GrafanaDashListItem[];
  error?: string;
  source: 'client' | 'bridge' | 'static';
}> {
  const cfg = loadGrafanaClientConfig();
  if (isGrafanaClientReady(cfg)) {
    return listViaClientApi(cfg, q);
  }

  if (IS_TAURI) {
    const via = await listGrafanaDashboardsViaApi();
    return {
      ok: via.reports.length > 0,
      dashboards: via.reports
        .filter((r) => !r.isBuilder)
        .map((r) => ({
          uid: r.uid,
          title: r.titleTr,
          url: `/d/${r.uid}`,
          tags: [r.category],
          folder: '',
        })),
      error: via.error,
      source: via.source === 'api' ? 'bridge' : 'static',
    };
  }

  try {
    const bridge = getBridgeUrl();
    const res = await fetch(
      `${bridge}/api/grafana/dashboards?q=${encodeURIComponent(q || 'retailex')}`,
      { method: 'GET', credentials: 'same-origin' },
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      dashboards?: GrafanaApiDashboard[];
    };
    if (!res.ok) {
      return {
        ok: false,
        dashboards: [],
        error: body.error || `HTTP ${res.status}`,
        source: 'bridge',
      };
    }
    const dashboards = Array.isArray(body.dashboards) ? body.dashboards : [];
    return { ok: true, dashboards, source: 'bridge' };
  } catch (e: unknown) {
    return {
      ok: false,
      dashboards: [],
      error: e instanceof Error ? e.message : String(e),
      source: 'bridge',
    };
  }
}

function slugUid(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `rex-ai-${base || 'dash'}-${suffix}`;
}

/** Minimal text + stat panelli dashboard JSON */
export function buildSimpleAiDashboard(title: string): Record<string, unknown> {
  const uid = slugUid(title);
  const now = Date.now();
  return {
    uid,
    title: title.trim() || 'RetailEX AI Dashboard',
    tags: ['retailex', 'ai-assistant'],
    timezone: 'browser',
    schemaVersion: 39,
    version: 1,
    refresh: '2m',
    time: { from: 'now-24h', to: 'now' },
    panels: [
      {
        id: 1,
        type: 'text',
        title: 'AI Asistan',
        gridPos: { h: 4, w: 24, x: 0, y: 0 },
        options: {
          mode: 'markdown',
          content: `## ${title.trim() || 'RetailEX'}\n\nBu pano AI Asistan üzerinden oluşturuldu (${new Date(now).toISOString()}).\nGrafana datasource / SQL panellerini düzenleyerek genişletebilirsiniz.`,
        },
      },
      {
        id: 2,
        type: 'stat',
        title: 'Hazır',
        gridPos: { h: 4, w: 6, x: 0, y: 4 },
        options: {
          reduceOptions: { calcs: ['lastNotNull'] },
          colorMode: 'value',
          graphMode: 'none',
        },
        fieldConfig: {
          defaults: { mappings: [], thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] } },
        },
        targets: [],
      },
    ],
  };
}

export async function createGrafanaDashboardForAssistant(title: string): Promise<{
  ok: boolean;
  uid?: string;
  url?: string;
  error?: string;
  source: 'client' | 'bridge';
}> {
  const dashboard = buildSimpleAiDashboard(title);
  const cfg = loadGrafanaClientConfig();

  if (isGrafanaClientReady(cfg)) {
    try {
      const res = await fetch(`${cfg.baseUrl}/api/dashboards/db`, {
        method: 'POST',
        headers: authHeaders(cfg),
        body: JSON.stringify({
          dashboard: { ...dashboard, id: null },
          overwrite: false,
          message: 'RetailEX AI Asistan',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        uid?: string;
        url?: string;
        message?: string;
        status?: string;
      };
      if (!res.ok) {
        return {
          ok: false,
          error: body.message || `HTTP ${res.status}`,
          source: 'client',
        };
      }
      return {
        ok: true,
        uid: String(body.uid || dashboard.uid || ''),
        url: body.url ? String(body.url) : undefined,
        source: 'client',
      };
    } catch (e: unknown) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        source: 'client',
      };
    }
  }

  if (IS_TAURI) {
    return {
      ok: false,
      error: 'Masaüstünde Grafana oluşturmak için istemci URL + API token ayarlayın.',
      source: 'bridge',
    };
  }

  try {
    const bridge = getBridgeUrl();
    const res = await fetch(`${bridge}/api/grafana/dashboards/import`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      results?: Array<{ ok: boolean; uid?: string; error?: string }>;
    };
    if (!res.ok) {
      return { ok: false, error: body.error || `HTTP ${res.status}`, source: 'bridge' };
    }
    const first = body.results?.[0];
    if (first?.ok && first.uid) {
      return { ok: true, uid: first.uid, source: 'bridge' };
    }
    return {
      ok: false,
      error: first?.error || body.error || 'Dashboard oluşturulamadı',
      source: 'bridge',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      source: 'bridge',
    };
  }
}

export async function testGrafanaClientConnection(cfg?: GrafanaClientConfig): Promise<{
  ok: boolean;
  message: string;
}> {
  const c = cfg ?? loadGrafanaClientConfig();
  if (!c.baseUrl.trim()) {
    return { ok: false, message: 'Grafana URL gerekli' };
  }
  if (!c.apiToken.trim()) {
    return { ok: false, message: 'API token gerekli' };
  }
  try {
    const res = await fetch(`${c.baseUrl.replace(/\/+$/, '')}/api/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${c.apiToken}` },
    });
    if (res.ok) return { ok: true, message: 'Grafana bağlantısı başarılı' };
    // health genelde auth istemez; search ile token doğrula
    const search = await fetch(
      `${c.baseUrl.replace(/\/+$/, '')}/api/search?type=dash-db&limit=1`,
      { headers: authHeaders({ ...c, baseUrl: c.baseUrl.replace(/\/+$/, '') }) },
    );
    if (search.ok) return { ok: true, message: 'Grafana API token geçerli' };
    const t = await search.text().catch(() => '');
    return { ok: false, message: `Token/API hata: ${search.status} ${t.slice(0, 120)}` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
