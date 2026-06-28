import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Monitor, RefreshCw, Shield, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { IS_TAURI } from '../../utils/env';
import { useAuth } from '../../contexts/AuthContext';
import { DeviceRegistrationInfoCard } from './DeviceRegistrationInfoCard';
import {
  approvePosTerminal,
  listPosTerminalRegistrations,
  rejectPosTerminal,
  describeRegistrationTarget,
  type PosTerminalRegistration,
} from '../../services/deviceRegistrationService';

type Props = {
  darkMode?: boolean;
};

export function PendingDevicesPanel({ darkMode = false }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<PosTerminalRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPosTerminalRegistrations({ status: 'pending', limit: 20 });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (IS_TAURI) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(t);
  }, [refresh]);

  if (IS_TAURI) return null;

  const pending = items.filter((i) => i.status === 'pending');

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      const r = await approvePosTerminal(id, user?.id || null);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Red nedeni (opsiyonel):') || undefined;
    setBusyId(id);
    try {
      const r = await rejectPosTerminal(id, user?.id || null, reason);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Card
      className={`p-4 border-2 ${
        pending.length > 0
          ? darkMode
            ? 'border-amber-500/60 bg-amber-950/20'
            : 'border-amber-400 bg-amber-50/80'
          : darkMode
            ? 'border-gray-700 bg-gray-800/50'
            : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${pending.length > 0 ? 'text-amber-500' : 'text-blue-500'}`} />
          <div>
            <h3 className="text-sm font-semibold">Bekleyen Kasa Cihazları</h3>
            <p className="text-xs text-gray-500">
              Masaüstü kurulumdan gelen kayıtlar — onaylanınca kasa giriş yapabilir
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Merkez veritabanı: {describeRegistrationTarget()}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()} className="gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {pending.length === 0 ? (
        <div className="text-sm text-gray-500 space-y-2">
          <p className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Onay bekleyen cihaz yok.
          </p>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Kasa kurulduğu halde burada görünmüyorsa: DeskApp kurulumunda <strong>Terminal/Kasa</strong>{' '}
            rolü seçilmeli, <strong>remote_db</strong> ve PostgREST URL web ile aynı kiracıyı göstermeli.
            Kayıt yanlışlıkla yerel PC veritabanına gitmiş olabilir — kasada girişi tekrar deneyin (0.1.127+).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((d) => (
            <div
              key={d.id}
              className={`rounded-lg border ${
                darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'
              } overflow-hidden`}
            >
              <div className="p-3 border-b border-gray-200/60 dark:border-gray-700/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Monitor className="w-5 h-5 text-blue-500 shrink-0" />
                    <span className="font-medium">{d.terminalName}</span>
                    {d.storeName && (
                      <span className="text-xs text-gray-500">
                        {d.storeName}
                        {d.storeCode ? ` (${d.storeCode})` : ''}
                      </span>
                    )}
                    <Badge className="text-xs bg-amber-500">Onay bekliyor</Badge>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      disabled={busyId === d.id}
                      onClick={() => void handleApprove(d.id)}
                      className="gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Onayla
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyId === d.id}
                      onClick={() => void handleReject(d.id)}
                      className="gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reddet
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Kayıt: {fmt(d.registeredAt)}
                  {d.lastSeenAt ? ` · Son görülme: ${fmt(d.lastSeenAt)}` : ''}
                </div>
              </div>
              <div className="p-3">
                <DeviceRegistrationInfoCard registration={d} darkMode={darkMode} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
