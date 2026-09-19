import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import {
  GRAFANA_READY_REPORTS,
  getGrafanaBaseUrl,
  getGrafanaEmbedUrl,
  type GrafanaReadyReport,
} from '../../utils/grafanaEmbed';
import {
  buildSelectSql,
  discoverTenantReportSchema,
  getTenantReportContext,
  runTenantReportQuery,
  type TenantSchemaContext,
  type TenantSchemaTable,
} from '../../services/tenantReportSchemaService';
import {
  deleteSavedCustomReport,
  listSavedCustomReports,
  saveCustomReport,
  type SavedCustomReport,
} from '../../services/savedCustomReportService';
import { ensureGrafanaDbForCurrentServer } from '../../services/grafanaDatasourceService';
import { GrafanaServerCodeModal } from './GrafanaServerCodeModal';

type MainTab = 'data' | 'grafana';

function reportTitle(r: GrafanaReadyReport, lang: string): string {
  return lang === 'en' ? r.titleEn : r.titleTr;
}

function reportDesc(r: GrafanaReadyReport, lang: string): string {
  return lang === 'en' ? r.descriptionEn : r.descriptionTr;
}

function reportIcon(r: GrafanaReadyReport) {
  if (r.isBuilder) return Sparkles;
  if (r.id === 'postgres') return Database;
  if (r.id === 'ops-overview') return LayoutDashboard;
  return Activity;
}

function kindLabel(kind: TenantSchemaTable['kind'], lang: string): string {
  if (lang === 'en') {
    return { firm: 'Firm', period: 'Period', shared: 'Shared', other: 'Other' }[kind];
  }
  return { firm: 'Firma', period: 'Dönem', shared: 'Ortak', other: 'Diğer' }[kind];
}

/**
 * Raporlar & Analiz → Rapor Oluşturucu
 * Firma tabloları + kayıtlı raporlar + hazır Grafana panoları.
 */
export function GrafanaReportBuilderModule() {
  const { darkMode } = useTheme();
  const { language } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const lang = language || 'tr';

  const [mainTab, setMainTab] = useState<MainTab>('data');
  const [grafanaId, setGrafanaId] = useState(
    () =>
      GRAFANA_READY_REPORTS.find((r) => r.category === 'erp' && !r.isBuilder)?.id ||
      GRAFANA_READY_REPORTS.find((r) => !r.isBuilder && r.category !== 'ops')?.id ||
      GRAFANA_READY_REPORTS[0].id
  );

  const [ctx, setCtx] = useState<TenantSchemaContext>(() => getTenantReportContext());
  const [tables, setTables] = useState<TenantSchemaTable[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [resultRows, setResultRows] = useState<Record<string, unknown>[]>([]);
  const [resultCols, setResultCols] = useState<string[]>([]);

  const [savedReports, setSavedReports] = useState<SavedCustomReport[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [reportName, setReportName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
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

  const loadSaved = useCallback(async () => {
    try {
      const list = await listSavedCustomReports();
      setSavedReports(list);
    } catch {
      setSavedReports([]);
    }
  }, []);

  const loadSchema = useCallback(async (q?: string) => {
    setLoadingSchema(true);
    setSchemaError(null);
    try {
      const { context, tables: list } = await discoverTenantReportSchema({ search: q });
      setCtx(context);
      setTables(list);
      setSelectedTableKey((prev) => {
        if (prev && list.some((t) => `${t.schemaName}.${t.tableName}` === prev)) return prev;
        if (list.length === 0) return null;
        const first = list[0]!;
        const key = `${first.schemaName}.${first.tableName}`;
        setExpanded((e) => ({ ...e, [key]: true }));
        const cols = first.columns.slice(0, 12).map((c) => c.columnName);
        setSelectedColumns(cols);
        setSql(buildSelectSql(first, cols));
        return key;
      });
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : String(err));
      setTables([]);
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  useEffect(() => {
    void loadSchema(search);
    void loadSaved();
  }, [selectedFirm?.firm_nr, selectedPeriod?.nr, loadSchema, loadSaved]);

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

  useEffect(() => {
    void linkGrafanaDb();
  }, [linkGrafanaDb]);

  useEffect(() => {
    if (mainTab === 'grafana') void linkGrafanaDb();
  }, [mainTab, linkGrafanaDb]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadSchema(search);
    }, 280);
    return () => window.clearTimeout(t);
  }, [search, loadSchema]);

  const selectedTable = useMemo(() => {
    if (!selectedTableKey) return null;
    return tables.find((t) => `${t.schemaName}.${t.tableName}` === selectedTableKey) ?? null;
  }, [tables, selectedTableKey]);

  const pickTable = (table: TenantSchemaTable) => {
    const key = `${table.schemaName}.${table.tableName}`;
    setSelectedTableKey(key);
    setExpanded((e) => ({ ...e, [key]: true }));
    const cols = table.columns.slice(0, 12).map((c) => c.columnName);
    setSelectedColumns(cols);
    setSql(buildSelectSql(table, cols));
    setRunError(null);
    setActiveSavedId(null);
  };

  const toggleColumnOnTable = (table: TenantSchemaTable, col: string) => {
    const key = `${table.schemaName}.${table.tableName}`;
    setSelectedTableKey(key);
    setSelectedColumns((prev) => {
      const base = key === selectedTableKey ? prev : table.columns.slice(0, 12).map((c) => c.columnName);
      const next = base.includes(col) ? base.filter((c) => c !== col) : [...base, col];
      setSql(buildSelectSql(table, next.length ? next : undefined));
      return next;
    });
  };

  const runQuery = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const { columns, rows } = await runTenantReportQuery(sql);
      setResultCols(columns);
      setResultRows(rows);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setResultRows([]);
      setResultCols([]);
    } finally {
      setRunning(false);
    }
  };

  const handleSave = async () => {
    const name = reportName.trim() || (lang === 'en' ? 'Untitled report' : 'Adsız rapor');
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await saveCustomReport({
        id: activeSavedId || undefined,
        name,
        sqlText: sql,
      });
      setActiveSavedId(saved.id);
      setReportName(saved.name);
      setSaveMsg(lang === 'en' ? 'Saved' : 'Kaydedildi');
      await loadSaved();
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const loadSavedReport = (r: SavedCustomReport) => {
    setActiveSavedId(r.id);
    setReportName(r.name);
    setSql(r.sqlText);
    setRunError(null);
    setSaveMsg(null);
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await deleteSavedCustomReport(id);
      if (activeSavedId === id) {
        setActiveSavedId(null);
        setReportName('');
      }
      await loadSaved();
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const gridColumns = useMemo(
    () =>
      resultCols.map((c) => ({
        key: c,
        header: c,
        size: 140,
      })),
    [resultCols]
  );

  const grafanaSelected =
    GRAFANA_READY_REPORTS.find((r) => r.id === grafanaId) || GRAFANA_READY_REPORTS[0];
  const embedUrl = getGrafanaEmbedUrl({ dark: darkMode, reportId: grafanaSelected.id });
  const baseUrl = getGrafanaBaseUrl();

  const firmLabel =
    selectedFirm?.name ||
    (ctx.firmNr ? `Firma ${ctx.firmNr}` : '—');

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
              {lang === 'en' ? 'Period' : 'Dönem'} {ctx.periodNr}
              {grafanaDbLabel
                ? ` · Grafana DB ${grafanaDbLabel}`
                : ctx.databaseName
                  ? ` · ${ctx.databaseName}`
                  : ''}
              {grafanaLinking ? (lang === 'en' ? ' · linking…' : ' · bağlanıyor…') : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
          <div className="flex items-center gap-1 rounded-lg border p-0.5 dark:border-gray-600 border-gray-200">
            <button
              type="button"
              onClick={() => setMainTab('data')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                mainTab === 'data' ? active : muted
              }`}
            >
              {lang === 'en' ? 'Data tables' : 'Veri tabloları'}
            </button>
            <button
              type="button"
              onClick={() => setMainTab('grafana')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                mainTab === 'grafana' ? active : muted
              }`}
            >
              Grafana
            </button>
          </div>
        </div>
      </div>

      {grafanaLinkError && (
        <div className="shrink-0 px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
          {grafanaLinkError}{' '}
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
        </div>
      )}

      <GrafanaServerCodeModal
        open={serverModalOpen}
        reason={serverModalReason}
        onClose={() => setServerModalOpen(false)}
        onConnected={({ database }) => {
          setGrafanaDbLabel(database);
          setGrafanaLinkError(null);
        }}
      />

      {mainTab === 'data' ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <aside
            className={`w-80 shrink-0 border-r flex flex-col min-h-0 overflow-hidden ${
              darkMode ? 'border-gray-700 bg-gray-850' : 'border-gray-200 bg-white'
            }`}
          >
            <div className={`p-2 border-b space-y-2 shrink-0 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="relative">
                <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${muted}`} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={lang === 'en' ? 'Search table / column…' : 'Tablo / alan ara…'}
                  className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-teal-500/40 ${inputCls}`}
                />
              </div>
              <button
                type="button"
                onClick={() => void loadSchema(search)}
                disabled={loadingSchema}
                className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border ${
                  darkMode
                    ? 'border-gray-600 hover:bg-gray-700'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {loadingSchema ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {lang === 'en' ? 'Refresh schema' : 'Şemayı yenile'}
                {!loadingSchema && tables.length > 0 ? ` (${tables.length})` : ''}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1">
              <p className={`px-2 pt-1 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                {lang === 'en' ? 'Saved reports' : 'Kayıtlı raporlar'}
              </p>
              {savedReports.length === 0 && (
                <p className={`text-[11px] px-2 pb-2 ${muted}`}>
                  {lang === 'en' ? 'No saved reports yet.' : 'Henüz kayıtlı rapor yok.'}
                </p>
              )}
              {savedReports.map((r) => {
                const isOn = r.id === activeSavedId;
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border flex items-stretch ${isOn ? active : card}`}
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left px-2.5 py-2 flex items-start gap-1.5"
                      onClick={() => loadSavedReport(r)}
                    >
                      <Bookmark className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{r.name}</div>
                        <div className={`text-[10px] truncate ${isOn ? '' : muted}`}>
                          {r.updatedAt ? String(r.updatedAt).slice(0, 16).replace('T', ' ') : ''}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      title={lang === 'en' ? 'Delete' : 'Sil'}
                      className={`px-2 shrink-0 ${muted} hover:text-red-500`}
                      onClick={() => void handleDeleteSaved(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              <p className={`px-2 pt-3 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                {lang === 'en' ? 'Tables' : 'Tablolar'}
              </p>
              {schemaError && (
                <p className="text-xs text-amber-600 dark:text-amber-400 px-2 py-1">{schemaError}</p>
              )}
              {!loadingSchema && !schemaError && tables.length === 0 && (
                <p className={`text-xs px-2 py-3 ${muted}`}>
                  {lang === 'en'
                    ? 'No tables found for this firm.'
                    : 'Bu firma için tablo bulunamadı.'}
                </p>
              )}
              {tables.map((table) => {
                const key = `${table.schemaName}.${table.tableName}`;
                const isOn = key === selectedTableKey;
                const isOpen = !!expanded[key];
                return (
                  <div key={key} className={`rounded-xl border ${isOn ? active : card}`}>
                    <button
                      type="button"
                      className="w-full text-left px-2.5 py-2 flex items-start gap-1.5"
                      onClick={() => {
                        setExpanded((e) => ({ ...e, [key]: !isOpen }));
                        pickTable(table);
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      )}
                      <Table2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{table.logicalName}</div>
                        <div className={`text-[10px] truncate ${isOn ? '' : muted}`}>
                          {kindLabel(table.kind, lang)} · {table.tableName}
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div
                        className={`px-2 pb-2 space-y-0.5 border-t ${
                          darkMode ? 'border-gray-700/80' : 'border-gray-100'
                        }`}
                      >
                        {table.columns.map((col) => {
                          const checked = selectedColumns.includes(col.columnName);
                          return (
                            <label
                              key={col.columnName}
                              className={`flex items-center gap-2 px-1.5 py-1 rounded-md text-[11px] cursor-pointer ${
                                darkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleColumnOnTable(table, col.columnName)}
                                className="rounded border-gray-300"
                              />
                              <span className="font-medium truncate">{col.columnName}</span>
                              <span className={`ml-auto shrink-0 ${muted}`}>{col.dataType}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <div
              className={`shrink-0 max-h-[min(42vh,22rem)] overflow-y-auto overscroll-contain p-3 border-b space-y-2 ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder={lang === 'en' ? 'Report name…' : 'Rapor adı…'}
                  className={`flex-1 min-w-[140px] px-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-teal-500/40 ${inputCls}`}
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !sql.trim()}
                  className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-xl border disabled:opacity-50 ${
                    darkMode
                      ? 'border-teal-700 text-teal-200 hover:bg-teal-900/40'
                      : 'border-teal-300 text-teal-800 hover:bg-teal-50'
                  }`}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {activeSavedId
                    ? lang === 'en'
                      ? 'Update'
                      : 'Güncelle'
                    : lang === 'en'
                      ? 'Save'
                      : 'Kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => void runQuery()}
                  disabled={running || !sql.trim()}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {lang === 'en' ? 'Run' : 'Çalıştır'}
                </button>
              </div>
              {selectedTable && (
                <p className={`text-xs ${muted}`}>
                  {selectedTable.schemaName}.{selectedTable.tableName}
                </p>
              )}
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={4}
                spellCheck={false}
                className={`w-full font-mono text-xs rounded-xl border p-3 outline-none focus:ring-2 focus:ring-teal-500/40 resize-y min-h-[80px] max-h-40 ${inputCls}`}
                placeholder="SELECT … FROM … LIMIT 100"
              />
              {runError && <p className="text-xs text-red-500">{runError}</p>}
              {saveMsg && !runError && (
                <p className={`text-xs ${saveMsg.includes('Kayded') || saveMsg === 'Saved' ? 'text-teal-600' : 'text-amber-600'}`}>
                  {saveMsg}
                </p>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto overscroll-contain p-3">
              {resultRows.length === 0 && !runError ? (
                <div className={`h-full min-h-[160px] flex items-center justify-center text-sm ${muted}`}>
                  {lang === 'en'
                    ? 'Select columns, run SELECT, then save the report.'
                    : 'Tablo/alan seçin, SELECT çalıştırın, raporu kaydedin.'}
                </div>
              ) : (
                <DevExDataGrid
                  data={resultRows}
                  columns={gridColumns}
                  pageSize={50}
                  enableFiltering
                  enablePagination
                />
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <aside
            className={`w-72 shrink-0 border-r flex flex-col min-h-0 overflow-hidden ${
              darkMode ? 'border-gray-700' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
              {(
                [
                  { key: 'erp' as const, tr: 'İş raporları', en: 'Business reports' },
                  { key: 'tools' as const, tr: 'Araçlar', en: 'Tools' },
                ] as const
              ).map((cat) => {
                const items = GRAFANA_READY_REPORTS.filter((r) => r.category === cat.key);
                if (items.length === 0) return null;
                return (
                  <div key={cat.key} className="space-y-1.5">
                    <p className={`px-2 pt-2 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                      {lang === 'en' ? cat.en : cat.tr}
                    </p>
                    {items.map((r) => {
                      const Icon = reportIcon(r);
                      const isOn = r.id === grafanaId;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setGrafanaId(r.id)}
                          className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                            isOn ? active : `${card} hover:border-teal-400/60`
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
                );
              })}
            </div>
          </aside>
          <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <div
              className={`shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">{reportTitle(grafanaSelected, lang)}</h3>
                <p className={`text-xs truncate ${muted}`}>{reportDesc(grafanaSelected, lang)}</p>
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
              <iframe
                key={embedUrl}
                title={reportTitle(grafanaSelected, lang)}
                src={embedUrl}
                className="absolute inset-0 w-full h-full border-0"
                allow="fullscreen"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <p className={`shrink-0 px-4 py-1.5 text-[10px] ${muted}`}>
              Grafana · {baseUrl} · {lang === 'en' ? 'anonymous (no login)' : 'anonim (giriş yok)'}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

export default GrafanaReportBuilderModule;
