/**
 * Grafana HTTP API — istemci token (localStorage) veya bridge fallback.
 */

import { getBridgeUrl, IS_TAURI } from '../utils/env';
import {
  isGrafanaClientReady,
  loadGrafanaClientConfig,
  buildGrafanaDashboardEmbedUrl,
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

function slugUid(title: string, prefix = 'rex-ai'): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${base || 'dash'}-${suffix}`;
}

/** Minimal text + stat panelli dashboard JSON */
export function buildSimpleAiDashboard(title: string): Record<string, unknown> {
  const uid = slugUid(title, 'rex-ai');
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

export type PivotGrafanaInput = {
  title: string;
  groupColumnLabel: string;
  rows: Array<{ label: string; count: number; values: Record<string, number> }>;
  metrics: Array<{ id: string; label: string }>;
  metricId: string;
  /** Karşılaştırma metrikleri (yoksa [metricId]) */
  metricIds?: string[];
  chartKind?: string;
};

function metricValue(
  row: { count: number; values: Record<string, number> },
  metricId: string,
): number {
  if (metricId === '__count__' || metricId === 'count') return Number(row.count) || 0;
  return Number(row.values[metricId]) || 0;
}

/**
 * DevEx grup pivot anlık verisinden Grafana dashboard JSON
 * (markdown tablo + grup başına stat + bargauge metni).
 */
export function buildPivotGrafanaDashboard(input: PivotGrafanaInput): Record<string, unknown> {
  const title = input.title.trim() || 'RetailEX Pivot Dashboard';
  const uid = slugUid(title, 'rex-pvt');
  const compareIds =
    Array.isArray(input.metricIds) && input.metricIds.length > 0
      ? input.metricIds
      : [input.metricId || '__count__'];
  const metricId = compareIds[0] || '__count__';
  const metricLabel =
    metricId === '__count__'
      ? 'Kayıt adedi'
      : input.metrics.find((m) => m.id === metricId)?.label || metricId;
  const compareLabels = compareIds.map((id) =>
    id === '__count__'
      ? 'Kayıt adedi'
      : input.metrics.find((m) => m.id === id)?.label || id,
  );

  const headerCols = [
    input.groupColumnLabel || 'Grup',
    'Kayıt',
    ...input.metrics.map((m) => m.label),
  ];
  const mdHeader = `| ${headerCols.join(' | ')} |`;
  const mdSep = `| ${headerCols.map(() => '---').join(' | ')} |`;
  const mdRows = input.rows.map((r) => {
    const cells = [
      r.label.replace(/\|/g, '/'),
      String(r.count),
      ...input.metrics.map((m) => String(Number(r.values[m.id]) || 0)),
    ];
    return `| ${cells.join(' | ')} |`;
  });
  const tableMd = [mdHeader, mdSep, ...mdRows].join('\n');

  const panels: Record<string, unknown>[] = [
    {
      id: 1,
      type: 'text',
      title: title,
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      options: {
        mode: 'markdown',
        content: [
          `## ${title}`,
          '',
          `- **Grup:** ${input.groupColumnLabel}`,
          `- **Metrik (grafik):** ${compareLabels.join(' · ')}`,
          `- **Tür:** ${input.chartKind || 'bar'}`,
          `- **Oluşturma:** ${new Date().toISOString()}`,
          '',
          '_Anlık özet — RetailEX DevEx grup pivot. Canlı SQL için Grafana datasource ekleyin._',
        ].join('\n'),
      },
    },
    {
      id: 2,
      type: 'text',
      title: 'Pivot tablo',
      gridPos: { h: 10, w: 14, x: 0, y: 3 },
      options: {
        mode: 'markdown',
        content: tableMd || '_Veri yok_',
      },
    },
  ];

  // Karşılaştırma metrikleri için sıralama panelleri (en fazla 3)
  let rankY = 3;
  compareIds.slice(0, 3).forEach((mid, mi) => {
    const mLabel =
      mid === '__count__'
        ? 'Kayıt adedi'
        : input.metrics.find((m) => m.id === mid)?.label || mid;
    const ranked = [...input.rows]
      .map((r) => ({ label: r.label, value: metricValue(r, mid) }))
      .sort((a, b) => b.value - a.value);
    const gaugeMd = ranked
      .map((r, i) => `${i + 1}. **${r.label.replace(/\|/g, '/')}** — \`${r.value}\``)
      .join('\n');
    const w = compareIds.length === 1 ? 10 : compareIds.length === 2 ? 5 : 3;
    const x = 14 + (mi % 3) * (compareIds.length <= 2 ? 5 : 3);
    panels.push({
      id: 3 + mi,
      type: 'text',
      title: `${mLabel} sıralama`,
      gridPos: { h: 10, w: Math.min(w, 10), x: Math.min(x, 21), y: rankY },
      options: {
        mode: 'markdown',
        content: gaugeMd || '_Veri yok_',
      },
    });
  });

  // Stat panelleri (ilk metrik, ilk 8 grup)
  let x = 0;
  let y = 13;
  const rankedPrimary = [...input.rows]
    .map((r) => ({ label: r.label, value: metricValue(r, metricId) }))
    .sort((a, b) => b.value - a.value);
  rankedPrimary.slice(0, 8).forEach((r, idx) => {
    if (x >= 24) {
      x = 0;
      y += 4;
    }
    panels.push({
      id: 10 + idx,
      type: 'stat',
      title: r.label.slice(0, 40),
      gridPos: { h: 4, w: 3, x, y },
      options: {
        reduceOptions: { calcs: ['lastNotNull'] },
        colorMode: 'background',
        graphMode: 'none',
        textMode: 'value_and_name',
      },
      fieldConfig: {
        defaults: {
          unit: 'none',
          thresholds: {
            mode: 'absolute',
            steps: [
              { color: 'blue', value: null },
              { color: 'green', value: 0 },
            ],
          },
        },
      },
      // Grafana testdata CSV — stat için sabit değer
      targets: [
        {
          refId: 'A',
          datasource: { type: 'grafana-testdata-datasource', uid: 'grafana' },
          scenarioId: 'csv_content',
          stringInput: `metric\n${r.value}`,
        },
      ],
    });
    x += 3;
  });

  return {
    uid,
    title,
    tags: ['retailex', 'ready', 'pivot', 'devex-group'],
    timezone: 'browser',
    schemaVersion: 39,
    version: 1,
    refresh: '',
    time: { from: 'now-24h', to: 'now' },
    panels,
  };
}

/**
 * Hazır dashboard JSON’u Grafana’ya yazar (istemci API veya bridge).
 */
export async function publishGrafanaDashboard(
  dashboard: Record<string, unknown>,
  message = 'RetailEX',
): Promise<{
  ok: boolean;
  uid?: string;
  url?: string;
  error?: string;
  source: 'client' | 'bridge';
  needsClientConfig?: boolean;
}> {
  const cfg = loadGrafanaClientConfig();
  const uidHint = String(dashboard.uid || '');

  if (isGrafanaClientReady(cfg)) {
    try {
      const res = await fetch(`${cfg.baseUrl}/api/dashboards/db`, {
        method: 'POST',
        headers: authHeaders(cfg),
        body: JSON.stringify({
          dashboard: { ...dashboard, id: null },
          overwrite: false,
          message,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        uid?: string;
        url?: string;
        message?: string;
      };
      if (!res.ok) {
        return {
          ok: false,
          error: body.message || `HTTP ${res.status}`,
          source: 'client',
        };
      }
      const uid = String(body.uid || uidHint || '');
      let url = body.url ? String(body.url) : undefined;
      if (!url && uid) {
        url = buildGrafanaDashboardEmbedUrl(uid, 'light', cfg).replace('&kiosk', '');
      } else if (url && url.startsWith('/') && cfg.baseUrl) {
        url = `${cfg.baseUrl.replace(/\/+$/, '')}${url}`;
      }
      return {
        ok: true,
        uid,
        url,
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
      error: 'Masaüstünde Grafana URL + API token gerekli (OpenRouter API → Grafana sekmesi).',
      source: 'bridge',
      needsClientConfig: true,
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
      return {
        ok: false,
        error:
          body.error ||
          `Grafana bridge HTTP ${res.status}. Stack’te grafana + bridge çalışıyor mu?`,
        source: 'bridge',
      };
    }
    const first = body.results?.[0];
    if (first?.ok && first.uid) {
      return {
        ok: true,
        uid: first.uid,
        url: buildGrafanaDashboardEmbedUrl(first.uid, 'light').replace('&kiosk', ''),
        source: 'bridge',
      };
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

export async function createGrafanaDashboardForAssistant(title: string): Promise<{
  ok: boolean;
  uid?: string;
  url?: string;
  error?: string;
  source: 'client' | 'bridge';
}> {
  return publishGrafanaDashboard(buildSimpleAiDashboard(title), 'RetailEX AI Asistan');
}

export async function createGrafanaDashboardFromPivot(
  input: PivotGrafanaInput,
): Promise<{
  ok: boolean;
  uid?: string;
  url?: string;
  error?: string;
  source: 'client' | 'bridge';
  needsClientConfig?: boolean;
}> {
  return publishGrafanaDashboard(buildPivotGrafanaDashboard(input), 'RetailEX DevEx Pivot');
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
