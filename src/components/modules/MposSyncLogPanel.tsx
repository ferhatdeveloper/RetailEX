import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, MonitorOff, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import {
  listTerminalSyncLogs,
  type TerminalSyncLogRow,
} from '../../services/mposSyncLogService';
import {
  formatServiceSyncDetail,
  listKasaServiceSyncHistoryFromFile,
  type ServiceSyncHistoryEntry,
} from '../../services/kasaServiceSyncHistoryService';
import { IS_TAURI } from '../../utils/env';

type Props = {
  storeId?: string;
  terminalName?: string;
  theme: 'light' | 'dark';
};

function fileTypeLabel(fileType: string): string {
  if (fileType === 'service_background') return 'Arka plan (servis)';
  return fileType;
}

export function MposSyncLogPanel({ storeId, terminalName, theme }: Props) {
  const [rows, setRows] = useState<TerminalSyncLogRow[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceSyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, fileHistory] = await Promise.all([
        listTerminalSyncLogs({
          storeId: storeId || undefined,
          terminalName: terminalName || undefined,
          limit: 40,
        }),
        listKasaServiceSyncHistoryFromFile(30),
      ]);
      setRows(data);
      setServiceRows(fileHistory);
    } finally {
      setLoading(false);
    }
  }, [storeId, terminalName]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const dbServiceRows = useMemo(
    () => rows.filter((r) => r.fileType === 'service_background'),
    [rows],
  );

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const fmtIso = (iso: string) =>
    new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const border = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const muted = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <MonitorOff className="w-4 h-4 text-violet-500" />
              Uygulama kapalıyken (Windows servisi)
            </h3>
            <p className={`text-xs ${muted}`}>
              RetailEX_Service arka planda aldığı veriler — uygulama açık değilken
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()} className="gap-1 h-8">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {!IS_TAURI ? (
          <p className={`text-sm ${muted}`}>Yalnızca masaüstü (Tauri) kurulumunda görünür.</p>
        ) : dbServiceRows.length === 0 && serviceRows.length === 0 ? (
          <p className={`text-sm ${muted}`}>
            Henüz kayıt yok. Uygulama kapalıyken servis veri çektiğinde burada listelenir.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={`text-left border-b ${border} ${muted}`}>
                  <th className="py-1.5 pr-2">Zaman</th>
                  <th className="py-1.5 pr-2">Yeni</th>
                  <th className="py-1.5 pr-2">Güncelleme</th>
                  <th className="py-1.5 pr-2">Tekrar</th>
                  <th className="py-1.5">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {dbServiceRows.map((r) => {
                  const d = r.detail ?? {};
                  const inserted = Number(d.inserted ?? 0);
                  const updated = Number(d.updated ?? 0);
                  const skipped = Number(d.skipped ?? 0);
                  return (
                  <tr key={`db-${r.id}`} className={`border-b ${theme === 'dark' ? 'border-gray-700/60' : 'border-gray-100'}`}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-emerald-600">{inserted || '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-amber-600">{updated || '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-gray-500">{skipped || '—'}</td>
                    <td className="py-1.5 truncate max-w-[220px]" title={r.message || undefined}>
                      {r.message || `${r.recordCount} kayıt`}
                    </td>
                  </tr>
                  );
                })}
                {serviceRows.map((r, i) => (
                  <tr key={`file-${r.at}-${i}`} className={`border-b ${theme === 'dark' ? 'border-gray-700/60' : 'border-gray-100'}`}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtIso(r.at)}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-emerald-600">{r.inserted || '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-amber-600">{r.updated || '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-gray-500">{r.skipped || '—'}</td>
                    <td className="py-1.5 truncate max-w-[220px]">{formatServiceSyncDetail(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold">Kasa Gönder/Al Geçmişi</h3>
            <p className={`text-xs ${muted}`}>Son işlemler (terminal_sync_log)</p>
          </div>
        </div>

        {rows.filter((r) => r.fileType !== 'service_background').length === 0 ? (
          <p className={`text-sm ${muted}`}>Henüz kayıt yok veya migration 066 uygulanmadı.</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={`text-left border-b ${border} ${muted}`}>
                  <th className="py-1.5 pr-2">Zaman</th>
                  <th className="py-1.5 pr-2">Yön</th>
                  <th className="py-1.5 pr-2">Tip</th>
                  <th className="py-1.5 pr-2">Kasa</th>
                  <th className="py-1.5 pr-2">Kayıt</th>
                  <th className="py-1.5">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.fileType !== 'service_background')
                  .map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b ${theme === 'dark' ? 'border-gray-700/60' : 'border-gray-100'}`}
                    >
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="py-1.5 pr-2">
                        {r.direction === 'send' ? (
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            <ArrowUpCircle className="w-3 h-3" /> Gönder
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600">
                            <ArrowDownCircle className="w-3 h-3" /> Al
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">{fileTypeLabel(r.fileType)}</td>
                      <td className="py-1.5 pr-2">{r.terminalName || '—'}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{r.recordCount}</td>
                      <td className="py-1.5">
                        <Badge
                          variant={r.status === 'ok' ? 'default' : 'destructive'}
                          className="text-[10px]"
                        >
                          {r.status === 'ok' ? 'OK' : r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
