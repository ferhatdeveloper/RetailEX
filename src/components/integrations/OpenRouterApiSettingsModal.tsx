import { useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown, Eye, EyeOff, Loader2, Save, X, Zap } from 'lucide-react';
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

interface OpenRouterApiSettingsModalProps {
  onClose: () => void;
}

/**
 * OpenRouter API anahtarı / model ayarları — PercentBodyModal.
 * Anahtar yalnızca localStorage (`retailex_openrouter_config_v1`); commit edilmez.
 */
export function OpenRouterApiSettingsModal({ onClose }: OpenRouterApiSettingsModalProps) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const [cfg, setCfg] = useState<OpenRouterConfig>(() => loadOpenRouterConfig());
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const reload = useCallback(() => {
    setCfg(loadOpenRouterConfig());
  }, []);

  useEffect(() => {
    reload();
    const onCfg = () => reload();
    window.addEventListener('retailex:openrouter-config', onCfg);
    return () => window.removeEventListener('retailex:openrouter-config', onCfg);
  }, [reload]);

  const inputClass = darkMode
    ? 'w-full px-3 py-2.5 rounded-xl border border-gray-600 bg-gray-800 text-gray-100 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400'
    : 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400';

  const labelClass = darkMode
    ? 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'
    : 'text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block';

  const handleSave = () => {
    setSaving(true);
    try {
      const next = saveOpenRouterConfig({
        enabled: cfg.enabled,
        apiKey: cfg.apiKey.trim(),
        model: (cfg.model || DEFAULT_OPENROUTER_CONFIG.model).trim(),
        baseUrl: (cfg.baseUrl || DEFAULT_OPENROUTER_CONFIG.baseUrl).trim(),
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        siteName: cfg.siteName || 'RetailEX',
        siteUrl: cfg.siteUrl,
      });
      setCfg(next);
      toast.success(
        next.enabled ? tm('orAiToastSavedEnabled') : tm('orAiToastSavedDisabled'),
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

  return (
    <PercentBodyModal onClose={onClose} size="compact" ariaLabel={tm('orAiModalTitle')} nested>
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

      <PercentBodyModalScrollBody
        className={`p-5 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
      >
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
            {tm('orAiApiKeyExtra')}
          </span>
        </label>

        <label className="block mb-4">
          <span className={labelClass}>{tm('orAiModelLabel')}</span>
          <div className="relative">
            <select
              value={cfg.model}
              onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
              className={`${inputClass} appearance-none pr-11`}
            >
              {OPENROUTER_MODEL_PRESETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                darkMode ? 'text-gray-500' : 'text-slate-400'
              }`}
              aria-hidden
            />
          </div>
        </label>

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
                  maxTokens: Math.min(16000, Math.max(256, Math.round(Number(e.target.value) || 2048))),
                }))
              }
              className={inputClass}
            />
          </label>
        </div>
      </PercentBodyModalScrollBody>

      <div
        className={`p-4 border-t flex gap-2 shrink-0 ${
          darkMode ? 'border-gray-800 bg-gray-800/50' : 'border-slate-100 bg-slate-50/60'
        }`}
      >
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
