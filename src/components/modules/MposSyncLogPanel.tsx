import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import {
  listTerminalSyncLogs,
  type TerminalSyncLogRow,
} from '../../services/mposSyncLogService';

type Props = {
  storeId?: string;
  terminalName?: string;
  theme: 'light' | 'dark';
};

export function MposSyncLogPanel({ storeId, terminalName, theme }: Props) {
  const [rows, setRows] = useState<TerminalSyncLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTerminalSyncLogs({
        storeId: storeId || undefined,
        terminalName: terminalName || undefined,
        limit: 30,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [storeId, terminalName]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Card className={`p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Kasa Gönder/Al Geçmişi</h3>
          <p className="text-xs text-gray-500">Son işlemler (terminal_sync_log)</p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()} className="gap-1 h-8">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Henüz kayıt yok veya migration 066 uygulanmadı.</p>
      ) : (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={`text-left border-b ${theme === 'dark' ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                <th className="py-1.5 pr-2">Zaman</th>
                <th className="py-1.5 pr-2">Yön</th>
                <th className="py-1.5 pr-2">Tip</th>
                <th className="py-1.5 pr-2">Kasa</th>
                <th className="py-1.5 pr-2">Kayıt</th>
                <th className="py-1.5">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
                  <td className="py-1.5 pr-2">{r.fileType}</td>
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
  );
}
