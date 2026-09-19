import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  GRAFANA_CATEGORY_LABELS,
  GRAFANA_READY_REPORTS,
  getGrafanaBaseUrl,
  type GrafanaReadyReport,
  type GrafanaReportCategory,
} from '../../utils/grafanaEmbed';
import {
  ensureGrafanaDbForCurrentServer,
  listGrafanaDashboardsViaApi,
} from '../../services/grafanaDatasourceService';
import { GrafanaServerCodeModal } from './GrafanaServerCodeModal';

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

/** Raporlar & Analiz → Rapor Oluşturucu (yalnızca Grafana; API katalog) */
export function GrafanaReportBuilderModule() {
  const { darkMode } = useTheme();
  const { language } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const lang = language || 'tr';

  const firm = padFirm(selectedFirm?.firm_nr ?? selectedFirm?.nr);
  const period = padPeriod(selectedPeriod?.nr);

  const [reports, setReports] = useState<GrafanaReadyReport[]>(GRAFANA_READY_REPORTS);
  const [catalogSource, setCatalogSource] = useState<'api' | 'static'>('static');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [grafanaId, setGrafanaId] = useState(
    () =>
      GRAFANA_READY_REPORTS.find((r) => r.category === 'executive')?.id ||
      GRAFANA_READY_REPORTS.find((r) => r.category === 'sales' && !r.isBuilder)?.id ||
      GRAFANA_READY_REPORTS[0].id
  );

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
    setReports(result.reports);
    setCatalogSource(result.source);
    if (result.error) setCatalogError(result.error);
    setGrafanaId((prev) => {
      if (result.reports.some((r) => r.id === prev)) return prev;
      return (
        result.reports.find((r) => r.category === 'executive')?.id ||
        result.reports.find((r) => !r.isBuilder && r.category !== 'ops')?.id ||
        result.reports[0]?.id ||
        prev
      );
    });
    setCatalogLoading(false);
  }, []);

  useEffect(() => {
    void linkGrafanaDb();
    void loadCatalog();
  }, [linkGrafanaDb, loadCatalog, selectedFirm?.firm_nr, selectedPeriod?.nr]);

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

  const grafanaSelected =
    reports.find((r) => r.id === grafanaId) ||
    reports.find((r) => r.category === 'executive') ||
    reports[0] ||
    GRAFANA_READY_REPORTS[0];

  const theme = darkMode ? 'dark' : 'light';
  const embedPath = grafanaSelected.embedPath(theme, { firm, period });
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
              {grafanaLinking || catalogLoading
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
            onClick={() => void loadCatalog()}
            disabled={catalogLoading}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
              darkMode
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {catalogLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {lang === 'en' ? 'Refresh list' : 'Listeyi yenile'}
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

      {(grafanaLinkError || catalogError) && (
        <div className="shrink-0 px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
          {grafanaLinkError || catalogError}{' '}
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
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className={`w-80 shrink-0 border-r flex flex-col min-h-0 overflow-hidden ${
            darkMode ? 'border-gray-700' : 'border-gray-200 bg-white'
          }`}
        >
          <div className={`shrink-0 p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${muted}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === 'en' ? 'Search reports…' : 'Rapor ara…'}
                className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none focus:ring-2 focus:ring-teal-500/40 ${inputCls}`}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1.5">
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
            ))}
            {visibleCategories.length === 0 && (
              <p className={`text-xs px-2 py-4 ${muted}`}>
                {lang === 'en' ? 'No reports match.' : 'Eşleşen rapor yok.'}
              </p>
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
              <h3 className="text-sm font-semibold truncate">{reportTitle(grafanaSelected, lang)}</h3>
              <p className={`text-xs truncate ${muted}`}>
                {reportDesc(grafanaSelected, lang)}
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
            Grafana · {baseUrl} · {lang === 'en' ? 'anonymous (no login)' : 'anonim (giriş yok)'} ·{' '}
            {catalogSource === 'api' ? 'API' : 'statik katalog'}
          </p>
        </section>
      </div>
    </div>
  );
}

export default GrafanaReportBuilderModule;
