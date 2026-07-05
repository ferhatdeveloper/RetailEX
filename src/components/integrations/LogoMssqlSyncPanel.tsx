import { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, Play, Clock } from 'lucide-react';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoMssqlSyncSettings,
  saveLogoMssqlSyncSettings,
  runLogoMssqlSyncNow,
  startLogoMssqlAutoSync,
  subscribeLogoMssqlSyncLogs,
  type LogoMssqlSyncSettings,
} from '../../services/logoMssqlSyncService';
import { LogoMssqlDatabaseSelect } from './LogoMssqlDatabaseSelect';
import type { LogoErpPanelTab } from './logoErpPanelTypes';

const inputCls =
  'w-full h-9 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/40';

type Props = {
  activeTab?: LogoErpPanelTab;
};

export function LogoMssqlSyncPanel({ activeTab = 'general' }: Props) {
  const [settings, setSettings] = useState<LogoMssqlSyncSettings>(() => loadLogoMssqlSyncSettings());
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!IS_TAURI) return;
    startLogoMssqlAutoSync();

    const unsub = subscribeLogoMssqlSyncLogs((line) => {
      setLogs((prev) => [...prev.slice(-80), line]);
    });

    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<string>('sync-event', (ev) => {
          const msg = String(ev.payload ?? '');
          if (msg) setLogs((prev) => [...prev.slice(-80), msg]);
        });
      } catch {
        /* event API yok */
      }
    })();

    return () => {
      unsub();
      unlisten?.();
    };
  }, [settings.enabled, settings.intervalMinutes]);

  const refreshSettings = useCallback(() => {
    setSettings(loadLogoMssqlSyncSettings());
  }, []);

  const patch = (p: Partial<LogoMssqlSyncSettings>) => {
    const next = saveLogoMssqlSyncSettings(p);
    setSettings(next);
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const r = await runLogoMssqlSyncNow();
      refreshSettings();
      if (!r.ok) setLogs((prev) => [...prev, `Hata: ${r.message}`]);
    } finally {
      setRunning(false);
    }
  };

  if (!IS_TAURI) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        Logo MSSQL yalnızca masaüstü uygulamasında kullanılabilir. Web modunda üstteki <strong>REST</strong>{' '}
        servis tipini seçin.
      </div>
    );
  }

  if (activeTab === 'general') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            LOBJECT / MSSQL
          </h4>
          <LogoMssqlDatabaseSelect
            value={settings.erpDb}
            allowManual
            onChange={(db) => patch({ erpDb: db })}
          />
          <p className="text-[11px] text-gray-500 leading-snug">
            Bağlantı bilgileri: Kurulum → ERP (MSSQL host, kullanıcı, şifre). Çoklu Logo DB için doğru veritabanını
            seçin.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-gray-600 flex items-center">
          REST yerine doğrudan SQL Server üzerinden periyodik veri çekimi. Parametre ve senkron sekmelerinden modül
          seçimini yapın.
        </div>
      </div>
    );
  }

  if (activeTab === 'params') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Otomatik aktarım</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ['masterData', 'Stok / cari kart'],
                ['customerMovements', 'Cari hareket & bakiye'],
                ['invoices', 'Faturalar (alış/satış/iade)'],
                ['cashMovements', 'Kasa hareketleri'],
                ['stockMovements', 'Stok hareketleri'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-700">{label}</span>
                <select
                  value={settings.modules[key] ? 'yes' : 'no'}
                  onChange={(e) =>
                    patch({ modules: { ...settings.modules, [key]: e.target.value === 'yes' } })
                  }
                  className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white"
                >
                  <option value="no">Hayır</option>
                  <option value="yes">Evet</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Periyodik otomatik senkron</span>
            <select
              value={settings.enabled ? 'yes' : 'no'}
              onChange={(e) => patch({ enabled: e.target.value === 'yes' })}
              className="h-8 text-xs border border-gray-200 rounded-lg px-2"
            >
              <option value="no">Hayır</option>
              <option value="yes">Evet</option>
            </select>
          </label>
          <label className="text-sm text-gray-700">
            <span className="block text-[11px] font-medium text-gray-600 mb-1">Aralık (dk)</span>
            <input
              type="number"
              min={5}
              max={1440}
              value={settings.intervalMinutes}
              onChange={(e) =>
                patch({ intervalMinutes: Math.min(1440, Math.max(5, parseInt(e.target.value, 10) || 30)) })
              }
              className={inputCls}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={() => void handleRunNow()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Şimdi çek
        </button>
        {settings.lastSyncAt ? (
          <span className="text-xs text-gray-600 inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Son: {new Date(settings.lastSyncAt).toLocaleString('tr-TR')}
            {settings.lastMessage ? ` — ${settings.lastMessage}` : ''}
          </span>
        ) : (
          <span className="text-xs text-gray-500">Henüz senkron çalıştırılmadı.</span>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 max-h-48 overflow-y-auto p-2 font-mono text-[11px] text-gray-800 space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-gray-400">Senkron logları burada görünür…</span>
        ) : (
          logs.map((line, i) => <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>)
        )}
      </div>
    </div>
  );
}
