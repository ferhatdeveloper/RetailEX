import { useCallback, useEffect, useState } from 'react';
import { Cloud, Database, Loader2, Plug, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoErpMode,
  resolveLogoErpModeFromConfig,
  saveLogoErpMode,
  type LogoErpMode,
} from '../../services/logoErpMode';
import { loadLogoRestConfig, logoTestConnection } from '../../services/logoRestApi';
import { startLogoMssqlAutoSync, stopLogoMssqlAutoSync } from '../../services/logoMssqlSyncService';
import { startLogoRestAutoSync, stopLogoRestAutoSync } from '../../services/logoRestSyncService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { LogoTigerRestPanel } from './LogoTigerRestPanel';
import { LogoMssqlSyncPanel } from './LogoMssqlSyncPanel';
import type { LogoErpPanelTab } from './logoErpPanelTypes';

export function LogoErpConnectorSection() {
  const [mode, setMode] = useState<LogoErpMode>(() => loadLogoErpMode());
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<LogoErpPanelTab>('general');
  const [testing, setTesting] = useState(false);

  const applyModeSideEffects = useCallback((next: LogoErpMode) => {
    if (next === 'mssql') {
      stopLogoRestAutoSync();
      if (IS_TAURI) startLogoMssqlAutoSync();
    } else {
      stopLogoMssqlAutoSync();
      startLogoRestAutoSync();
    }
  }, []);

  useEffect(() => {
    void resolveLogoErpModeFromConfig().then((resolved) => {
      setMode(resolved);
      applyModeSideEffects(resolved);
      setReady(true);
    });
  }, [applyModeSideEffects]);

  const handleSelectMode = (next: LogoErpMode) => {
    if (next === mode) return;
    setMode(next);
    void saveLogoErpMode(next);
    applyModeSideEffects(next);
  };

  const handleSave = () => {
    toast.success('Entegrasyon ayarları kaydedildi');
    window.dispatchEvent(new CustomEvent('retailex:logo-settings-saved'));
  };

  const handleConnectionTest = async () => {
    if (mode === 'mssql') {
      toast.info('MSSQL bağlantısı kurulum → ERP ayarları ve masaüstü senkron ile doğrulanır.');
      setActiveTab('sync');
      return;
    }
    setTesting(true);
    try {
      const config = loadLogoRestConfig();
      const result = await logoTestConnection(config);
      if (result.ok) {
        toast.success('Logo REST bağlantısı başarılı');
        window.dispatchEvent(new CustomEvent('retailex:logo-rest-connected'));
      } else {
        toast.error(result.error || 'Bağlantı hatası');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Başlık + aksiyonlar */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-sky-700 to-blue-800 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="h-5 w-5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">ERP Entegrasyon Ayarları</h3>
            <p className="text-xs text-blue-100 truncate">Logo Tiger — REST veya MSSQL veri kaynağı</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleConnectionTest()}
            disabled={testing || !ready}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Bağlantı Test
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-800 text-xs font-semibold hover:bg-blue-50"
          >
            <Save className="h-3.5 w-3.5" />
            Güncelle
          </button>
        </div>
      </div>

      {/* Genel üst satır — ERP türü + servis tipi */}
      <div className="px-4 py-3 border-b bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">ERP Türü</label>
          <select
            disabled
            className="w-full h-9 px-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800"
            value="LOGO"
          >
            <option value="LOGO">LOGO</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">ERP Servis Tipi</label>
          <div className="inline-flex w-full rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => handleSelectMode('rest')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors ${
                mode === 'rest' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-600 hover:bg-orange-50'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              REST
            </button>
            <button
              type="button"
              onClick={() => handleSelectMode('mssql')}
              disabled={!IS_TAURI}
              title={!IS_TAURI ? 'MSSQL yalnızca masaüstünde' : undefined}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                mode === 'mssql' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-600 hover:bg-slate-50'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              LOBJECT / MSSQL
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 leading-snug pb-0.5">
          {mode === 'rest'
            ? 'Logo Tiger REST API — web ve masaüstünde HTTP üzerinden senkron.'
            : IS_TAURI
              ? 'SQL Server üzerinden doğrudan Logo veritabanı okuma.'
              : 'Web modunda REST Servis kullanın.'}
        </p>
      </div>

      {/* Sekmeler */}
      <div className="p-4">
        {!ready ? (
          <p className="text-sm text-gray-500 py-8 text-center">Entegrasyon modu yükleniyor…</p>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LogoErpPanelTab)}>
            <TabsList className="grid w-full max-w-lg grid-cols-3 mb-4">
              <TabsTrigger value="general">Genel</TabsTrigger>
              <TabsTrigger value="params">Parametreler</TabsTrigger>
              <TabsTrigger value="sync">Senkron</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-0">
              {mode === 'rest' ? (
                <LogoTigerRestPanel activeTab="general" />
              ) : (
                <LogoMssqlSyncPanel activeTab="general" />
              )}
            </TabsContent>

            <TabsContent value="params" className="mt-0">
              {mode === 'rest' ? (
                <LogoTigerRestPanel activeTab="params" />
              ) : (
                <LogoMssqlSyncPanel activeTab="params" />
              )}
            </TabsContent>

            <TabsContent value="sync" className="mt-0">
              {mode === 'rest' ? (
                <LogoTigerRestPanel activeTab="sync" />
              ) : (
                <LogoMssqlSyncPanel activeTab="sync" />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
