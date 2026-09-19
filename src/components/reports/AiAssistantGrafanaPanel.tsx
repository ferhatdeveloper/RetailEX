import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  createGrafanaDashboardForAssistant,
  listGrafanaDashboardsForAssistant,
  type GrafanaDashListItem,
} from '../../services/grafanaClientApi';
import {
  buildGrafanaDashboardEmbedUrl,
  isGrafanaClientReady,
  loadGrafanaClientConfig,
} from '../../services/grafanaClientConfig';

interface AiAssistantGrafanaPanelProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

/**
 * AI Asistan → Grafana panoları: listele, oluştur, iframe ile göster.
 */
export function AiAssistantGrafanaPanel({
  onClose,
  onOpenSettings,
}: AiAssistantGrafanaPanelProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dashboards, setDashboards] = useState<GrafanaDashListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [embedUid, setEmbedUid] = useState<string | null>(null);
  const [search, setSearch] = useState('retailex');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listGrafanaDashboardsForAssistant(search.trim() || 'retailex');
    setDashboards(result.dashboards);
    setSource(result.source);
    if (!result.ok && result.error) setError(result.error);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const title = newTitle.trim() || tm('gfAiDefaultDashTitle');
    setCreating(true);
    try {
      const result = await createGrafanaDashboardForAssistant(title);
      if (!result.ok) {
        toast.error(result.error || tm('gfAiCreateFailed'));
        if (!isGrafanaClientReady(loadGrafanaClientConfig()) && result.source === 'bridge') {
          // bridge yoksa ayarlara yönlendir
        }
        return;
      }
      toast.success(tm('gfAiCreateOk'));
      setNewTitle('');
      if (result.uid) setEmbedUid(result.uid);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const embedUrl = embedUid
    ? buildGrafanaDashboardEmbedUrl(embedUid, darkMode ? 'dark' : 'light')
    : null;

  const inputClass = darkMode
    ? 'w-full px-3 py-2 rounded-xl border border-gray-600 bg-gray-800 text-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-500'
    : 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <>
      <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('gfAiPanelTitle')} nested>
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-5 py-4 text-white shrink-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black uppercase tracking-tight">{tm('gfAiPanelTitle')}</h3>
            <p className="text-[10px] text-amber-100 font-bold uppercase tracking-widest mt-0.5 opacity-90">
              {source ? `${tm('gfAiSource')}: ${source}` : tm('gfAiPanelSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"
            title={tm('refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={tm('close')}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`px-5 py-3 shrink-0 border-b space-y-2 ${
            darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-slate-100'
          }`}
        >
          <div className="flex gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load();
              }}
              placeholder={tm('gfAiSearchPlaceholder')}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={onOpenSettings}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shrink-0 ${
                darkMode
                  ? 'border border-gray-600 text-gray-200 hover:bg-gray-800'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tm('gfAiOpenSettings')}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={tm('gfAiNewTitlePlaceholder')}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-orange-600 disabled:opacity-50 shrink-0"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {tm('gfAiCreate')}
            </button>
          </div>
          {error && (
            <p className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
              {error} — {tm('gfAiBridgeFallbackHint')}
            </p>
          )}
        </div>

        <PercentBodyModalScrollBody
          className={`p-4 ${darkMode ? 'bg-gray-900' : 'bg-slate-50'}`}
        >
          {loading && dashboards.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              {tm('gfAiLoading')}
            </div>
          ) : dashboards.length === 0 ? (
            <p className={`text-sm text-center py-10 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              {tm('gfAiEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {dashboards.map((d) => (
                <li
                  key={d.uid}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    darkMode
                      ? 'border-gray-700 bg-gray-800'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <LayoutDashboard
                    className={`w-4 h-4 shrink-0 ${darkMode ? 'text-amber-400' : 'text-orange-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        darkMode ? 'text-gray-100' : 'text-slate-800'
                      }`}
                    >
                      {d.title}
                    </p>
                    <p className={`text-[10px] truncate ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                      {d.uid}
                      {d.folder ? ` · ${d.folder}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmbedUid(d.uid)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-blue-700"
                  >
                    {tm('gfAiShow')}
                  </button>
                  <a
                    href={buildGrafanaDashboardEmbedUrl(d.uid, darkMode ? 'dark' : 'light').replace(
                      '&kiosk',
                      '',
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-1.5 rounded-lg ${
                      darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title={tm('gfAiOpenExternal')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </PercentBodyModalScrollBody>
      </PercentBodyModal>

      {embedUid && embedUrl && (
        <PercentBodyModal
          onClose={() => setEmbedUid(null)}
          size="full"
          ariaLabel={tm('gfAiEmbedTitle')}
          nested
        >
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-4 py-3 text-white shrink-0 flex items-center gap-3">
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-bold flex-1 truncate">{tm('gfAiEmbedTitle')}</h3>
            <a
              href={embedUrl.replace('&kiosk', '')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100"
            >
              {tm('gfAiOpenExternal')}
            </a>
            <button
              type="button"
              onClick={() => setEmbedUid(null)}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-black">
            <iframe
              title={tm('gfAiEmbedTitle')}
              src={embedUrl}
              className="w-full h-full border-0"
              allow="fullscreen"
            />
          </div>
        </PercentBodyModal>
      )}
    </>
  );
}
