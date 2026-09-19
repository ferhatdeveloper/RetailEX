import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Save,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  DEFAULT_OPENROUTER_CONFIG,
  OPENROUTER_MODEL_PRESETS,
  loadOpenRouterConfig,
  saveOpenRouterConfig,
  type OpenRouterConfig,
} from '../../services/openRouterConfig';
import { testOpenRouterConnection } from '../../services/openRouterService';
import {
  fetchOpenRouterModels,
  type OpenRouterModelGroups,
} from '../../services/openRouterModels';
import {
  DEFAULT_GRAFANA_CLIENT_CONFIG,
  loadGrafanaClientConfig,
  saveGrafanaClientConfig,
  type GrafanaClientConfig,
} from '../../services/grafanaClientConfig';
import { testGrafanaClientConnection } from '../../services/grafanaClientApi';

interface OpenRouterApiSettingsModalProps {
  onClose: () => void;
  /** Açılışta Grafana sekmesi */
  initialTab?: 'openrouter' | 'grafana';
}

type SettingsTab = 'openrouter' | 'grafana';

/**
 * OpenRouter + Grafana ayarları — PercentBodyModal.
 * Model listesi ssh reposu gibi doğrudan OpenRouter'dan çekilir.
 * Anahtar / token yalnızca localStorage; commit edilmez.
 */
export function OpenRouterApiSettingsModal({
  onClose,
  initialTab = 'openrouter',
}: OpenRouterApiSettingsModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [cfg, setCfg] = useState<OpenRouterConfig>(() => loadOpenRouterConfig());
  const [gf, setGf] = useState<GrafanaClientConfig>(() => loadGrafanaClientConfig());
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingGf, setTestingGf] = useState(false);
  const [modelGroups, setModelGroups] = useState<OpenRouterModelGroups | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('');

  const reload = useCallback(() => {
    setCfg(loadOpenRouterConfig());
    setGf(loadGrafanaClientConfig());
  }, []);

  const loadModels = useCallback(async (spin = false) => {
    if (spin) setModelsLoading(true);
    setModelsError(null);
    const result = await fetchOpenRouterModels();
    if (result.ok) {
      setModelGroups(result.groups);
    } else {
      setModelsError(result.error || 'error');
      setModelGroups(null);
    }
    setModelsLoading(false);
  }, []);

  useEffect(() => {
    reload();
    void loadModels(true);
    const onCfg = () => reload();
    window.addEventListener('retailex:openrouter-config', onCfg);
    window.addEventListener('retailex:grafana-client-config', onCfg);
    return () => {
      window.removeEventListener('retailex:openrouter-config', onCfg);
      window.removeEventListener('retailex:grafana-client-config', onCfg);
    };
  }, [reload, loadModels]);

  const inputClass = darkMode
    ? 'w-full px-3 py-2.5 rounded-xl border border-gray-600 bg-gray-800 text-gray-100 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400'
    : 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400';

  const labelClass = darkMode
    ? 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'
    : 'text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block';

  const filterLc = modelFilter.trim().toLocaleLowerCase('tr');
  const filteredGroups = useMemo(() => {
    if (!modelGroups) return null;
    if (!filterLc) return modelGroups;
    const match = (id: string, name: string) =>
      id.toLocaleLowerCase('tr').includes(filterLc) ||
      name.toLocaleLowerCase('tr').includes(filterLc);
    return {
      featured: modelGroups.featured.filter((m) => match(m.id, m.name)),
      free: modelGroups.free.filter((m) => match(m.id, m.name)),
      paid: modelGroups.paid.filter((m) => match(m.id, m.name)),
    };
  }, [modelGroups, filterLc]);

  const modelInList = useMemo(() => {
    if (!modelGroups) return true;
    const all = [...modelGroups.featured, ...modelGroups.free, ...modelGroups.paid];
    return all.some((m) => m.id === cfg.model);
  }, [modelGroups, cfg.model]);

  const handleSave = () => {
    setSaving(true);
    try {
      const nextOr = saveOpenRouterConfig({
        enabled: cfg.enabled,
        apiKey: cfg.apiKey.trim(),
        model: (cfg.model || DEFAULT_OPENROUTER_CONFIG.model).trim(),
        baseUrl: (cfg.baseUrl || DEFAULT_OPENROUTER_CONFIG.baseUrl).trim(),
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        siteName: cfg.siteName || 'RetailEX',
        siteUrl: cfg.siteUrl,
      });
      const nextGf = saveGrafanaClientConfig({
        baseUrl: gf.baseUrl.trim(),
        apiToken: gf.apiToken.trim(),
        useClientApi: gf.useClientApi,
      });
      setCfg(nextOr);
      setGf(nextGf);
      toast.success(
        nextOr.enabled ? tm('orAiToastSavedEnabled') : tm('orAiToastSavedDisabled'),
      );
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!cfg.apiKey.trim()) {
      toast.error(tm('orAiToastApiKeyRequired'));
      return;
    }
    setTesting(true);
    try {
      const result = await testOpenRouterConnection({
        ...cfg,
        enabled: true,
        apiKey: cfg.apiKey.trim(),
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleTestGrafana = async () => {
    setTestingGf(true);
    try {
      const result = await testGrafanaClientConnection(gf);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingGf(false);
    }
  };

  const tabBtn = (id: SettingsTab, label: string, Icon: typeof Bot) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${
        tab === id
          ? 'bg-blue-600 text-white shadow'
          : darkMode
            ? 'text-gray-300 hover:bg-gray-700'
            : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('orAiModalTitle')} nested>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white shrink-0 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black uppercase tracking-tight">{tm('orAiModalTitle')}</h3>
          <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-0.5 opacity-90">
            {tm('orAiModalSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tm('close')}
          className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={`px-5 pt-3 pb-2 shrink-0 flex gap-2 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
      >
        {tabBtn('openrouter', tm('orAiTabOpenRouter'), Bot)}
        {tabBtn('grafana', tm('orAiTabGrafana'), LayoutDashboard)}
      </div>

      <PercentBodyModalScrollBody className={`p-5 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {tab === 'openrouter' && (
          <>
            <p className={`text-xs leading-relaxed mb-4 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
              {tm('orAiModalHint')}
            </p>

            <label className="flex items-center justify-between gap-3 mb-4 cursor-pointer">
              <span className={labelClass + ' !mb-0'}>{tm('orAiEnabledLabel')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={cfg.enabled}
                onClick={() => setCfg((c) => ({ ...c, enabled: !c.enabled }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  cfg.enabled ? 'bg-blue-600' : darkMode ? 'bg-gray-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    cfg.enabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </label>

            <label className="block mb-4">
              <span className={labelClass}>{tm('orAiApiKeyLabel')}</span>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={cfg.apiKey}
                  onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="sk-or-v1-…"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg ${
                    darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  aria-label={showKey ? tm('orAiHideKey') : tm('orAiShowKey')}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className={`text-[10px] mt-1 block ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {tm('orAiApiKeyExtra')}{' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  openrouter.ai/keys
                </a>
              </span>
            </label>

            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={labelClass + ' !mb-0'}>{tm('orAiModelLabel')}</span>
                <button
                  type="button"
                  onClick={() => void loadModels(true)}
                  disabled={modelsLoading}
                  title={tm('orAiModelRefresh')}
                  className={`p-1.5 rounded-lg ${
                    darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-slate-500 hover:bg-slate-100'
                  } disabled:opacity-50`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <input
                type="search"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder={tm('orAiModelSearch')}
                className={`${inputClass} mb-2`}
              />
              <div className="relative">
                <select
                  value={cfg.model}
                  onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                  className={`${inputClass} appearance-none pr-11`}
                  disabled={modelsLoading && !modelGroups}
                >
                  {modelsLoading && !modelGroups && (
                    <option value="">{tm('orAiModelLoading')}</option>
                  )}
                  {!modelGroups && modelsError && (
                    <>
                      {OPENROUTER_MODEL_PRESETS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </>
                  )}
                  {filteredGroups && (
                    <>
                      {filteredGroups.featured.length > 0 && (
                        <optgroup label={tm('orAiModelFeatured')}>
                          {filteredGroups.featured.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {m.priceLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {filteredGroups.free.length > 0 && (
                        <optgroup label={tm('orAiModelFree')}>
                          {filteredGroups.free.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {m.priceLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {filteredGroups.paid.length > 0 && (
                        <optgroup label={tm('orAiModelPaid')}>
                          {filteredGroups.paid.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {m.priceLabel}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  )}
                  {cfg.model && !modelInList && (
                    <option value={cfg.model}>{cfg.model}</option>
                  )}
                </select>
                <ChevronDown
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                    darkMode ? 'text-gray-500' : 'text-slate-400'
                  }`}
                  aria-hidden
                />
              </div>
              <span className={`text-[10px] mt-1 block ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {modelsError
                  ? `${tm('orAiModelLoadFailed')}: ${modelsError}`
                  : tm('orAiModelHint')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>{tm('orAiTemperatureLabel')}</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={cfg.temperature}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>{tm('orAiMaxTokensLabel')}</span>
                <input
                  type="number"
                  min={256}
                  max={16000}
                  step={256}
                  value={cfg.maxTokens}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      maxTokens: Math.min(
                        16000,
                        Math.max(256, Math.round(Number(e.target.value) || 2048)),
                      ),
                    }))
                  }
                  className={inputClass}
                />
              </label>
            </div>
          </>
        )}

        {tab === 'grafana' && (
          <>
            <p className={`text-xs leading-relaxed mb-4 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
              {tm('gfAiHint')}
            </p>

            <label className="flex items-center justify-between gap-3 mb-4 cursor-pointer">
              <span className={labelClass + ' !mb-0'}>{tm('gfAiUseClientApi')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={gf.useClientApi}
                onClick={() => setGf((c) => ({ ...c, useClientApi: !c.useClientApi }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  gf.useClientApi ? 'bg-blue-600' : darkMode ? 'bg-gray-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    gf.useClientApi ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </label>

            <label className="block mb-4">
              <span className={labelClass}>{tm('gfAiUrlLabel')}</span>
              <input
                type="url"
                autoComplete="off"
                value={gf.baseUrl}
                onChange={(e) => setGf((c) => ({ ...c, baseUrl: e.target.value }))}
                placeholder={DEFAULT_GRAFANA_CLIENT_CONFIG.baseUrl || 'https://grafana.example.com'}
                className={inputClass}
              />
              <span className={`text-[10px] mt-1 block ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {tm('gfAiUrlExtra')}
              </span>
            </label>

            <label className="block mb-4">
              <span className={labelClass}>{tm('gfAiTokenLabel')}</span>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  value={gf.apiToken}
                  onChange={(e) => setGf((c) => ({ ...c, apiToken: e.target.value }))}
                  placeholder="glsa_…"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg ${
                    darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-slate-400 hover:bg-slate-100'
                  }`}
                  aria-label={showToken ? tm('orAiHideKey') : tm('orAiShowKey')}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className={`text-[10px] mt-1 block ${darkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {tm('gfAiTokenExtra')}
              </span>
            </label>
          </>
        )}
      </PercentBodyModalScrollBody>

      <div
        className={`p-4 border-t flex gap-2 shrink-0 ${
          darkMode ? 'border-gray-800 bg-gray-800/50' : 'border-slate-100 bg-slate-50/60'
        }`}
      >
        {tab === 'openrouter' ? (
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className={`flex-1 rounded-2xl border-2 font-bold uppercase text-xs tracking-wider py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 ${
              darkMode
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {tm('orAiTestConnection')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleTestGrafana()}
            disabled={testingGf}
            className={`flex-1 rounded-2xl border-2 font-bold uppercase text-xs tracking-wider py-2.5 flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 ${
              darkMode
                ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {testingGf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {tm('gfAiTestConnection')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-xs tracking-wider py-2.5 shadow-lg shadow-blue-200/40 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {tm('orAiSave')}
        </button>
      </div>
    </PercentBodyModal>
  );
}

export default OpenRouterApiSettingsModal;
