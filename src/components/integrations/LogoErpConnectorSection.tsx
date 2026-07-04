import { useCallback, useEffect, useState } from 'react';
import { Cloud, Database, Plug } from 'lucide-react';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoErpMode,
  resolveLogoErpModeFromConfig,
  saveLogoErpMode,
  type LogoErpMode,
} from '../../services/logoErpMode';
import { startLogoMssqlAutoSync, stopLogoMssqlAutoSync } from '../../services/logoMssqlSyncService';
import { startLogoRestAutoSync, stopLogoRestAutoSync } from '../../services/logoRestSyncService';
import { LogoTigerRestPanel } from './LogoTigerRestPanel';
import { LogoMssqlSyncPanel } from './LogoMssqlSyncPanel';

export function LogoErpConnectorSection() {
  const [mode, setMode] = useState<LogoErpMode>(() => loadLogoErpMode());
  const [ready, setReady] = useState(false);

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

  return (
    <div className="rounded-xl border border-orange-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-orange-600 to-amber-600 text-white flex items-center gap-2">
        <Plug className="h-5 w-5 shrink-0" />
        <div>
          <h3 className="font-semibold text-sm">Logo ERP Entegrasyonu</h3>
          <p className="text-xs text-orange-100">
            Veri kaynağını seçin: Logo Tiger REST servisi veya doğrudan MSSQL veritabanı
          </p>
        </div>
      </div>

      <div className="p-4 border-b bg-orange-50/60">
        <p className="text-xs text-gray-600 mb-3">Bağlantı türü</p>
        <div className="inline-flex rounded-xl border border-orange-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleSelectMode('rest')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'rest'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-orange-50'
            }`}
          >
            <Cloud className="h-4 w-4" />
            REST Servis
          </button>
          <button
            type="button"
            onClick={() => handleSelectMode('mssql')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'mssql'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-gray-700 hover:bg-slate-50'
            }`}
          >
            <Database className="h-4 w-4" />
            MSSQL
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-2 leading-snug">
          {mode === 'rest'
            ? 'Logo Tiger REST API — web ve masaüstünde HTTP üzerinden ürün, cari ve fatura senkronu.'
            : IS_TAURI
              ? 'Logo MSSQL — kurulumdaki SQL Server bağlantısı ile doğrudan veritabanından periyodik çekim (masaüstü).'
              : 'MSSQL modu yalnızca masaüstü uygulamasında kullanılabilir; web için REST Servis seçin.'}
        </p>
      </div>

      <div className="p-4">
        {!ready ? (
          <p className="text-sm text-gray-500 py-6 text-center">Logo entegrasyon modu yükleniyor…</p>
        ) : mode === 'rest' ? (
          <LogoTigerRestPanel />
        ) : (
          <LogoMssqlSyncPanel />
        )}
      </div>
    </div>
  );
}
