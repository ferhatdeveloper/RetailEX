import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Monitor, RefreshCw, Shield, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { IS_TAURI } from '../../utils/env';
import { useAuth } from '../../contexts/AuthContext';
import {
  approvePosTerminal,
  listPosTerminalRegistrations,
  rejectPosTerminal,
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
      className={`p-4 mb-6 border-2 ${
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
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()} className="gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          Onay bekleyen cihaz yok.
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((d) => (
            <div
              key={d.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border ${
                darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Monitor className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{d.terminalName}</span>
                    <Badge variant="outline" className="text-xs">
                      {d.role}
                    </Badge>
                    <Badge className="text-xs bg-amber-500">Onay bekliyor</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                    <div className="font-mono truncate" title={d.deviceId}>
                      ID: {d.deviceId.slice(0, 24)}
                      {d.deviceId.length > 24 ? '…' : ''}
                    </div>
                    {d.storeName && (
                      <div>
                        Mağaza: {d.storeName}
                        {d.storeCode ? ` (${d.storeCode})` : ''}
                      </div>
                    )}
                    {d.osUser && <div>Kullanıcı: {d.osUser}</div>}
                    <div>Kayıt: {fmt(d.registeredAt)} · v{d.appVersion || '?'}</div>
                  </div>
                </div>
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
          ))}
        </div>
      )}
    </Card>
  );
}
