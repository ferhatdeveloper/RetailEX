import { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, Play, RefreshCw, Clock } from 'lucide-react';
import { IS_TAURI } from '../../utils/env';
import {
  loadLogoMssqlSyncSettings,
  saveLogoMssqlSyncSettings,
  runLogoMssqlSyncNow,
  startLogoMssqlAutoSync,
  subscribeLogoMssqlSyncLogs,
  type LogoMssqlSyncSettings,
} from '../../services/logoMssqlSyncService';

export function LogoMssqlSyncPanel() {
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
        Logo MSSQL yalnızca masaüstü (Tauri) uygulamasında kullanılabilir. Web modunda üstteki{' '}
        <strong>REST Servis</strong> sekmesini kullanın.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-700 to-slate-800 text-white flex items-center gap-2">
        <Database className="h-5 w-5" />
        <div>
          <h3 className="font-semibold text-sm">Logo MSSQL Senkron</h3>
          <p className="text-xs text-slate-300">
            Ürün, cari, cari hareket/bakiye, faturalar (alış/satış/iade), kasa — kurulumdaki ERP bağlantısı
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Periyodik otomatik senkron
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700 flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Aralık (dk)
          </label>
          <input
            type="number"
            min={5}
            max={1440}
            value={settings.intervalMinutes}
            onChange={(e) =>
              patch({ intervalMinutes: Math.min(1440, Math.max(5, parseInt(e.target.value, 10) || 30)) })
            }
            className="w-24 border rounded px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRunNow()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Şimdi çek
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {(
            [
              ['masterData', 'Stok / cari kart'],
              ['customerMovements', 'Cari hareket & bakiye'],
              ['invoices', 'Faturalar (alış/satış/iade)'],
              ['cashMovements', 'Kasa hareketleri'],
              ['stockMovements', 'Stok hareketleri'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-gray-700">
              <input
                type="checkbox"
                checked={settings.modules[key]}
                onChange={(e) => patch({ modules: { ...settings.modules, [key]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </div>

        {settings.lastSyncAt ? (
          <p className="text-xs text-gray-600">
            Son senkron: {new Date(settings.lastSyncAt).toLocaleString('tr-TR')}
            {settings.lastMessage ? ` — ${settings.lastMessage}` : ''}
          </p>
        ) : (
          <p className="text-xs text-gray-500">Henüz Logo MSSQL senkronu çalıştırılmadı.</p>
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 max-h-40 overflow-y-auto p-2 font-mono text-[11px] text-gray-800 space-y-0.5">
          {logs.length === 0 ? (
            <span className="text-gray-400">Senkron logları burada görünür…</span>
          ) : (
            logs.map((line, i) => <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>)
          )}
        </div>

        <p className="text-[10px] text-gray-500 leading-snug">
          Bağlantı: Kurulum / Ayarlar → ERP (MSSQL host, veritabanı, kullanıcı). Çoklu firma için Entegrasyonlardaki
          Logo Tiger REST <code>firmMappings</code> veya kurulumda firma seçimi kullanılır.
        </p>
      </div>
    </div>
  );
}
