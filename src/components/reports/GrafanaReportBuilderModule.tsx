import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  GRAFANA_CATEGORY_LABELS,
  GRAFANA_READY_REPORTS,
  getGrafanaBaseUrl,
  getGrafanaExplorePostgresPath,
  type GrafanaReadyReport,
  type GrafanaReportCategory,
} from '../../utils/grafanaEmbed';
import { grafanaAppReportsAsReady } from '../../utils/grafanaAppReportsCatalog';
import {
  ensureGrafanaDbForCurrentServer,
  fetchGrafanaSchema,
  listGrafanaDashboardsViaApi,
  syncGrafanaDashboardsViaApi,
  ensureGrafanaDashboardUid,
  type GrafanaSchemaTable,
} from '../../services/grafanaDatasourceService';
import { buildSelectSql } from '../../services/tenantReportSchemaService';
import { GrafanaServerCodeModal } from './GrafanaServerCodeModal';

const STATIC_REPORTS: GrafanaReadyReport[] = (() => {
  const app = grafanaAppReportsAsReady();
  const seen = new Set(app.map((r) => r.uid));
  return [...app, ...GRAFANA_READY_REPORTS.filter((r) => !seen.has(r.uid))];
})();

function reportTitle(r: GrafanaReadyReport, lang: string): string {
  return lang === 'en' ? r.titleEn : r.titleTr;
}

function reportDesc(r: GrafanaReadyReport, lang: string): string {
  return lang === 'en' ? r.descriptionEn : r.descriptionTr;
}

function reportIcon(r: GrafanaReadyReport) {
  if (r.isBuilder) return Sparkles;
  if (r.id === 'postgres') return Database;
  if (r.id === 'ops-overview' || r.id === 'executive') return LayoutDashboard;
  return Activity;
}

function padFirm(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '001';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

function padPeriod(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '01';
  return d.length <= 2 ? d.padStart(2, '0') : d;
}

function kindLabel(kind: string, lang: string): string {
  if (lang === 'en') {
    return ({ firm: 'Firm', period: 'Period', shared: 'Shared', other: 'Other' } as Record<string, string>)[
      kind
    ] || kind;
  }
  return ({ firm: 'Firma', period: 'Dönem', shared: 'Ortak', other: 'Diğer' } as Record<string, string>)[
    kind
  ] || kind;
}

type LeftPane = 'reports' | 'tables';

/** Raporlar & Analiz → Rapor Oluşturucu (Grafana + API şema) */
export function GrafanaReportBuilderModule() {
  const { darkMode } = useTheme();
  const { language } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const lang = language || 'tr';

  const firm = padFirm(selectedFirm?.firm_nr ?? selectedFirm?.nr);
  const period = padPeriod(selectedPeriod?.nr);

  const [leftPane, setLeftPane] = useState<LeftPane>('reports');
  const [reports, setReports] = useState<GrafanaReadyReport[]>(STATIC_REPORTS);
  const [catalogSource, setCatalogSource] = useState<'api' | 'static'>('static');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [schemaTables, setSchemaTables] = useState<GrafanaSchemaTable[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaSource, setSchemaSource] = useState<string | null>(null);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [exploreSql, setExploreSql] = useState<string | null>(null);

  const [grafanaId, setGrafanaId] = useState(
    () =>
      STATIC_REPORTS.find((r) => r.category === 'general')?.id ||
      STATIC_REPORTS.find((r) => r.category === 'executive')?.id ||
      STATIC_REPORTS.find((r) => r.category === 'sales' && !r.isBuilder)?.id ||
      STATIC_REPORTS[0].id
  );

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncingDashboards, setSyncingDashboards] = useState(false);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [panelsBootstrapped, setPanelsBootstrapped] = useState(false);

  const [grafanaDbLabel, setGrafanaDbLabel] = useState<string | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverModalReason, setServerModalReason] = useState<string | null>(null);
  const [grafanaLinkError, setGrafanaLinkError] = useState<string | null>(null);
  const [grafanaLinking, setGrafanaLinking] = useState(false);

  const shell = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const active = darkMode
    ? 'bg-teal-900/40 border-teal-600 text-teal-200'
    : 'bg-teal-50 border-teal-400 text-teal-900';
  const inputCls = darkMode
    ? 'bg-gray-900 border-gray-600 text-gray-100 placeholder:text-gray-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400';

  const linkGrafanaDb = useCallback(async () => {
    setGrafanaLinking(true);
    setGrafanaLinkError(null);
    const result = await ensureGrafanaDbForCurrentServer();
    setGrafanaLinking(false);
    if (result.ok) {
      setGrafanaDbLabel(result.database);
      setServerModalOpen(false);
      return;
    }
    if (result.needServerCode) {
      setServerModalReason(result.reason);
      setServerModalOpen(true);
      return;
    }
    setGrafanaLinkError(result.reason);
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    const result = await listGrafanaDashboardsViaApi();
    const app = grafanaAppReportsAsReady();
    const byUid = new Map<string, GrafanaReadyReport>();
    for (const r of app) byUid.set(r.uid, r);
    for (const r of result.reports) {
      if (!byUid.has(r.uid)) byUid.set(r.uid, r);
    }
    for (const r of STATIC_REPORTS) {
      if (!byUid.has(r.uid)) byUid.set(r.uid, r);
    }
    const merged = Array.from(byUid.values());
    setReports(merged);
    setCatalogSource(result.source);
    if (result.error) setCatalogError(result.error);
    setGrafanaId((prev) => {
      if (merged.some((r) => r.id === prev)) return prev;
      return (
        merged.find((r) => r.category === 'general')?.id ||
        merged.find((r) => r.category === 'executive')?.id ||
        merged.find((r) => !r.isBuilder && r.category !== 'ops')?.id ||
        merged[0]?.id ||
        prev
      );
    });
    setCatalogLoading(false);
  }, []);

  const loadSchema = useCallback(
    async (q?: string) => {
      setSchemaLoading(true);
      setSchemaError(null);
      const result = await fetchGrafanaSchema({ firm, period, search: q });
      setSchemaLoading(false);
      if (!result.ok) {
        setSchemaTables([]);
        setSchemaError(result.reason);
        setSchemaSource(null);
        return;
      }
      setSchemaTables(result.tables);
      setSchemaSource(result.source);
      if (result.database) setGrafanaDbLabel(result.database);
    },
    [firm, period]
  );

  const syncDashboards = useCallback(async () => {
    setSyncingDashboards(true);
    setSyncMsg(null);
    const result = await syncGrafanaDashboardsViaApi();
    setSyncingDashboards(false);
    if (!result.ok) {
      setSyncMsg(result.reason);
      return;
    }
    setSyncMsg(
      lang === 'en'
        ? `Dashboards synced: ${result.okCount}/${result.total}`
        : `Panolar yüklendi: ${result.okCount}/${result.total}`
    );
    await loadCatalog();
    setIframeNonce((n) => n + 1);
    setPanelsBootstrapped(true);
  }, [lang, loadCatalog]);

  useEffect(() => {
    void linkGrafanaDb();
    void (async () => {
      setPanelsBootstrapped(false);
      await syncGrafanaDashboardsViaApi().catch(() => undefined);
      await loadCatalog();
      const defaultUid =
        STATIC_REPORTS.find((r) => r.category === 'general' && !r.isBuilder)?.uid ||
        STATIC_REPORTS.find((r) => r.category === 'executive' && !r.isBuilder)?.uid ||
        STATIC_REPORTS.find((r) => !r.isBuilder)?.uid;
      if (defaultUid) {
        await ensureGrafanaDashboardUid(defaultUid).catch(() => false);
      }
      setIframeNonce((n) => n + 1);
      setPanelsBootstrapped(true);
    })();
  }, [linkGrafanaDb, loadCatalog, selectedFirm?.firm_nr, selectedPeriod?.nr]);

  useEffect(() => {
    if (leftPane !== 'tables') return;
    const t = window.setTimeout(() => {
      void loadSchema(schemaSearch);
    }, 280);
    return () => window.clearTimeout(t);
  }, [leftPane, schemaSearch, loadSchema]);

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    const cats = (Object.keys(GRAFANA_CATEGORY_LABELS) as GrafanaReportCategory[])
      .filter((c) => c !== 'ops')
      .sort((a, b) => GRAFANA_CATEGORY_LABELS[a].order - GRAFANA_CATEGORY_LABELS[b].order);

    return cats
      .map((key) => {
        const items = reports.filter((r) => {
          if (r.category !== key) return false;
          if (!q) return true;
          const blob = `${r.titleTr} ${r.titleEn} ${r.descriptionTr} ${r.descriptionEn} ${r.uid}`.toLocaleLowerCase('tr');
          return blob.includes(q);
        });
        return { key, items };
      })
      .filter((c) => c.items.length > 0);
  }, [reports, search]);

  const openReport = useCallback(
    async (r: GrafanaReadyReport) => {
      setExploreSql(null);
      if (!r.isBuilder && r.uid) {
        const ok = await ensureGrafanaDashboardUid(r.uid);
        if (!ok) {
          setSyncMsg(
            lang === 'en'
              ? `Dashboard missing: ${r.uid}. Click Load panels.`
              : `Pano yok: ${r.uid}. «Panoları yükle»ye basın.`
          );
          return;
        }
        setSyncMsg(null);
      }
      setGrafanaId(r.id);
      setIframeNonce((n) => n + 1);
    },
    [lang]
  );

  const openTableInExplore = (table: GrafanaSchemaTable, columns?: string[]) => {
    const sql = buildSelectSql(
      {
        schemaName: table.schemaName,
        tableName: table.tableName,
        logicalName: table.logicalName,
        kind: (table.kind as 'firm' | 'period' | 'shared' | 'other') || 'other',
        columns: table.columns,
      },
      columns?.length ? columns : table.columns.slice(0, 20).map((c) => c.columnName)
    );
    setExploreSql(sql);
    setGrafanaId('builder-pg');
    setSelectedTableKey(`${table.schemaName}.${table.tableName}`);
  };

  const grafanaSelected =
    reports.find((r) => r.id === grafanaId) ||
    reports.find((r) => r.category === 'general') ||
    reports.find((r) => r.category === 'executive') ||
    reports[0] ||
    STATIC_REPORTS[0];

  const theme = darkMode ? 'dark' : 'light';
  const embedPath =
    grafanaId === 'builder-pg' && exploreSql
      ? getGrafanaExplorePostgresPath(theme, exploreSql)
      : grafanaSelected.embedPath(theme, { firm, period });
  const embedUrl = `${getGrafanaBaseUrl()}${embedPath}`;
  const baseUrl = getGrafanaBaseUrl();
  const firmLabel = selectedFirm?.name || `Firma ${firm}`;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${shell}`}>
      <div
        className={`shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b ${
          darkMode ? 'border-gray-700 bg-gray-800/90' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className={`h-5 w-5 shrink-0 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate">
              {lang === 'en' ? 'Report builder' : 'Rapor Oluşturucu'}
            </h2>
            <p className={`text-xs truncate ${muted}`}>
              {firmLabel}
              {' · '}
              {lang === 'en' ? 'Period' : 'Dönem'} {period}
              {grafanaDbLabel ? ` · Grafana DB ${grafanaDbLabel}` : ''}
              {` · ${catalogSource === 'api' ? 'API' : 'katalog'} (${reports.length})`}
              {schemaSource ? ` · şema:${schemaSource}` : ''}
              {grafanaLinking || catalogLoading || schemaLoading
                ? lang === 'en'
                  ? ' · loading…'
                  : ' · yükleniyor…'
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void syncDashboards()}
            disabled={syncingDashboards}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
              darkMode
                ? 'border-teal-700 text-teal-300 hover:bg-gray-700'
                : 'border-teal-300 text-teal-800 hover:bg-teal-50'
            }`}
          >
            {syncingDashboards ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            {lang === 'en' ? 'Load panels' : 'Panoları yükle'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (leftPane === 'tables') void loadSchema(schemaSearch);
              else void loadCatalog();
            }}
            disabled={catalogLoading || schemaLoading}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
              darkMode
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {catalogLoading || schemaLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {lang === 'en' ? 'Refresh' : 'Yenile'}
          </button>
          <button
            type="button"
            onClick={() => void linkGrafanaDb()}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
              darkMode
                ? 'border-gray-600 text-teal-300 hover:bg-gray-700'
                : 'border-teal-200 text-teal-700 hover:bg-teal-50'
            }`}
          >
            {lang === 'en' ? 'Reconnect DB' : 'DB bağla'}
          </button>
        </div>
      </div>

      {(grafanaLinkError || catalogError || schemaError || syncMsg) && (
        <div
          className={`shrink-0 px-4 py-2 text-xs border-b ${
            syncMsg && !grafanaLinkError && !schemaError && !catalogError
              ? 'text-teal-800 bg-teal-50 border-teal-200'
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}
        >
          {grafanaLinkError || schemaError || catalogError || syncMsg}{' '}
          {grafanaLinkError && (
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => {
                setServerModalReason(grafanaLinkError);
                setServerModalOpen(true);
              }}
            >
              {lang === 'en' ? 'Enter server code' : 'Server kodu gir'}
            </button>
          )}
          {(grafanaLinkError || schemaError || catalogError) && (
            <button
              type="button"
              className="underline font-semibold ml-2"
              onClick={() => void syncDashboards()}
            >
              {lang === 'en' ? 'Load panels' : 'Panoları yükle'}
            </button>
          )}
        </div>
      )}

      <GrafanaServerCodeModal
        open={serverModalOpen}
        reason={serverModalReason}
        onClose={() => setServerModalOpen(false)}
        onConnected={({ database }) => {
          setGrafanaDbLabel(database);
          setGrafanaLinkError(null);
          void loadCatalog();
          void loadSchema(schemaSearch);
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className={`w-80 shrink-0 border-r flex flex-col min-h-0 overflow-hidden ${
            darkMode ? 'border-gray-700' : 'border-gray-200 bg-white'
          }`}
        >
          <div className={`shrink-0 p-2 border-b space-y-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex rounded-lg border p-0.5 dark:border-gray-600 border-gray-200">
              <button
                type="button"
                onClick={() => setLeftPane('reports')}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md ${
                  leftPane === 'reports' ? active : muted
                }`}
              >
                {lang === 'en' ? 'Reports' : 'Raporlar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftPane('tables');
                  void loadSchema(schemaSearch);
                }}
                className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1 ${
                  leftPane === 'tables' ? active : muted
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                {lang === 'en' ? 'Tables' : 'Tablolar'}
              </button>
            </div>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${muted}`} />
              <input
                value={leftPane === 'tables' ? schemaSearch : search}
                onChange={(e) =>
                  leftPane === 'tables' ? setSchemaSearch(e.target.value) : setSearch(e.target.value)
                }
                placeholder={
                  leftPane === 'tables'
                    ? lang === 'en'
                      ? 'Search table / column…'
                      : 'Tablo / alan ara…'
                    : lang === 'en'
                      ? 'Search reports…'
                      : 'Rapor ara…'
                }
                className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-teal-500/40 ${inputCls}`}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
            {leftPane === 'reports' ? (
              <>
                {visibleCategories.map((cat) => (
                  <div key={cat.key} className="space-y-1.5">
                    <p className={`px-2 pt-2 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                      {lang === 'en'
                        ? GRAFANA_CATEGORY_LABELS[cat.key].en
                        : GRAFANA_CATEGORY_LABELS[cat.key].tr}
                      <span className="ml-1 opacity-70">({cat.items.length})</span>
                    </p>
                    {cat.items.map((r) => {
                      const Icon = reportIcon(r);
                      const isOn = r.id === grafanaId && !exploreSql;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => void openReport(r)}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                            isOn || (r.id === grafanaId && r.id === 'builder-pg' && exploreSql)
                              ? active
                              : `${card} hover:border-teal-400/60`
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{reportTitle(r, lang)}</div>
                              <div className={`text-xs mt-0.5 line-clamp-2 ${isOn ? '' : muted}`}>
                                {reportDesc(r, lang)}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {visibleCategories.length === 0 && (
                  <p className={`text-xs px-2 py-4 ${muted}`}>
                    {lang === 'en' ? 'No reports match.' : 'Eşleşen rapor yok.'}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className={`px-2 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                  {lang === 'en' ? 'API schema' : 'API şema'}
                  {!schemaLoading && schemaTables.length > 0 ? ` (${schemaTables.length})` : ''}
                </p>
                {schemaLoading && (
                  <div className={`flex items-center gap-2 px-2 py-3 text-xs ${muted}`}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {lang === 'en' ? 'Loading tables…' : 'Tablolar yükleniyor…'}
                  </div>
                )}
                {!schemaLoading &&
                  schemaTables.map((table) => {
                    const key = `${table.schemaName}.${table.tableName}`;
                    const isOpen = !!expanded[key];
                    const isSel = selectedTableKey === key;
                    return (
                      <div
                        key={key}
                        className={`rounded-xl border ${isSel ? active : card}`}
                      >
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            className="px-2 py-2 shrink-0"
                            onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                            aria-label="expand"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left py-2 pr-3"
                            onClick={() => openTableInExplore(table)}
                          >
                            <div className="text-sm font-medium truncate">{table.logicalName}</div>
                            <div className={`text-[10px] truncate ${muted}`}>
                              {kindLabel(table.kind, lang)} · {table.schemaName}.{table.tableName} ·{' '}
                              {table.columns.length}{' '}
                              {lang === 'en' ? 'cols' : 'alan'}
                            </div>
                          </button>
                        </div>
                        {isOpen && (
                          <div
                            className={`border-t px-2 py-1.5 space-y-0.5 max-h-48 overflow-y-auto ${
                              darkMode ? 'border-gray-700' : 'border-gray-200'
                            }`}
                          >
                            {table.columns.map((col) => (
                              <button
                                key={col.columnName}
                                type="button"
                                onClick={() => openTableInExplore(table, [col.columnName])}
                                className={`w-full text-left text-[11px] px-2 py-1 rounded-md hover:bg-teal-500/10 ${muted}`}
                              >
                                <span className="font-mono text-inherit opacity-90">{col.columnName}</span>
                                <span className="ml-1 opacity-60">{col.dataType}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => openTableInExplore(table)}
                              className="w-full text-left text-[11px] font-semibold px-2 py-1.5 text-teal-600 dark:text-teal-300"
                            >
                              {lang === 'en' ? 'Open in Explore →' : 'Explore’da aç →'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                {!schemaLoading && schemaTables.length === 0 && !schemaError && (
                  <p className={`text-xs px-2 py-4 ${muted}`}>
                    {lang === 'en'
                      ? 'No tables. Reconnect DB, then refresh.'
                      : 'Tablo yok. DB bağla, sonra yenile.'}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <div
            className={`shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {exploreSql && grafanaId === 'builder-pg'
                  ? lang === 'en'
                    ? 'Explore (table from API)'
                    : 'Explore (API tablosu)'
                  : reportTitle(grafanaSelected, lang)}
              </h3>
              <p className={`text-xs truncate ${muted}`}>
                {exploreSql && grafanaId === 'builder-pg'
                  ? selectedTableKey || exploreSql.split('\n')[0]
                  : reportDesc(grafanaSelected, lang)}
                {` · firm=${firm} period=${period}`}
              </p>
            </div>
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border shrink-0 ${
                darkMode
                  ? 'border-gray-600 text-teal-300 hover:bg-gray-700'
                  : 'border-teal-200 text-teal-700 hover:bg-teal-50'
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {lang === 'en' ? 'Open full' : 'Tam ekran'}
            </a>
          </div>
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {!panelsBootstrapped || syncingDashboards ? (
              <div className={`absolute inset-0 flex items-center justify-center gap-2 ${muted}`}>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">
                  {lang === 'en' ? 'Loading dashboards…' : 'Panolar yükleniyor…'}
                </span>
              </div>
            ) : (
              <iframe
                key={`${embedUrl}#${iframeNonce}`}
                title={reportTitle(grafanaSelected, lang)}
                src={embedUrl}
                className="absolute inset-0 w-full h-full border-0"
                allow="fullscreen"
                referrerPolicy="no-referrer-when-downgrade"
              />
            )}
          </div>
          <p className={`shrink-0 px-4 py-1.5 text-[10px] ${muted}`}>
            Grafana · {baseUrl} · {lang === 'en' ? 'anonymous (no login)' : 'anonim (giriş yok)'}
            {exploreSql ? ' · SQL API' : ''}
          </p>
        </section>
      </div>
    </div>
  );
}

export default GrafanaReportBuilderModule;
