import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Monitor, RefreshCw, Shield, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { IS_TAURI } from '../../utils/env';
import { useAuth } from '../../contexts/AuthContext';
import { DeviceRegistrationInfoCard } from './DeviceRegistrationInfoCard';
import {
  approvePosTerminal,
  listCentralStoresForPlacement,
  listPosTerminalRegistrations,
  rejectPosTerminal,
  describeRegistrationTarget,
  type DevicePlacementOption,
  type PosTerminalRegistration,
} from '../../services/deviceRegistrationService';

type Props = {
  darkMode?: boolean;
};

type PlacementDraft = {
  storeId: string;
  terminalName: string;
};

function defaultPlacement(d: PosTerminalRegistration): PlacementDraft {
  return {
    storeId: d.storeId || '',
    terminalName: d.terminalName || '',
  };
}

export function PendingDevicesPanel({ darkMode = false }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<PosTerminalRegistration[]>([]);
  const [stores, setStores] = useState<DevicePlacementOption[]>([]);
  const [placements, setPlacements] = useState<Record<string, PlacementDraft>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPosTerminalRegistrations({ status: 'pending', limit: 20 });
      setItems(rows);
      setPlacements((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (!next[row.id]) next[row.id] = defaultPlacement(row);
        }
        return next;
      });

      const firmNrs = [...new Set(rows.map((r) => r.firmNr))];
      const storeLists = await Promise.all(
        firmNrs.map((firmNr) => listCentralStoresForPlacement(firmNr)),
      );
      const merged = new Map<string, DevicePlacementOption>();
      for (const list of storeLists) {
        for (const s of list) merged.set(s.id, s);
      }
      setStores([...merged.values()]);
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

  const updatePlacement = (id: string, patch: Partial<PlacementDraft>) => {
    setPlacements((prev) => {
      const item = items.find((i) => i.id === id);
      const base = item ? defaultPlacement(item) : { storeId: '', terminalName: '' };
      return {
        ...prev,
        [id]: { ...base, ...prev[id], ...patch },
      };
    });
  };

  const handleApprove = async (d: PosTerminalRegistration) => {
    const draft = placements[d.id] ?? defaultPlacement(d);
    if (!draft.terminalName.trim()) {
      toast.error('Kasa adı zorunludur.');
      return;
    }

    setBusyId(d.id);
    try {
      const r = await approvePosTerminal(d.id, user?.id || null, {
        storeId: draft.storeId || null,
        terminalName: draft.terminalName.trim(),
        firmNr: d.firmNr,
      });
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

  const fieldClass = darkMode
    ? 'bg-gray-900 border-gray-600 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

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
              Hibrit kasa kayıtları — onayda işyeri ve kasa tanımını düzenleyip yerleştirin
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
            Hibrit kasa kurulduğu halde burada görünmüyorsa: DeskApp kurulumunda{' '}
            <strong>Şube Terminali</strong> rolü ve <strong>hibrit</strong> mod seçilmeli;{' '}
            <strong>remote_db</strong> ve PostgREST URL web ile aynı kiracıyı göstermeli.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((d) => {
            const draft = placements[d.id] ?? defaultPlacement(d);
            return (
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
                      {d.firmName && (
                        <span className="text-xs text-gray-500">İşyeri: {d.firmName}</span>
                      )}
                      <Badge className="text-xs bg-amber-500">Onay bekliyor</Badge>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={busyId === d.id}
                        onClick={() => void handleApprove(d)}
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
                    {d.firmNr ? ` · Firma kodu: ${d.firmNr}` : ''}
                  </div>
                </div>

                <div className={`p-3 grid gap-3 md:grid-cols-2 border-b ${darkMode ? 'border-gray-700/60' : 'border-gray-200/60'}`}>
                  <div className="space-y-1.5">
                    <Label className="text-xs">İşyeri (şube)</Label>
                    <select
                      value={draft.storeId}
                      onChange={(e) => updatePlacement(d.id, { storeId: e.target.value })}
                      className={`w-full h-9 rounded-md border px-2 text-sm ${fieldClass}`}
                    >
                      <option value="">— İşyeri seçin —</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.code ? ` (${s.code})` : ''}
                        </option>
                      ))}
                    </select>
                    {stores.length === 0 && (
                      <p className="text-[10px] text-amber-600">
                        Merkezde aktif şube bulunamadı; onay sonrası şube tanımını kontrol edin.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kasa adı</Label>
                    <Input
                      value={draft.terminalName}
                      onChange={(e) => updatePlacement(d.id, { terminalName: e.target.value })}
                      placeholder="Örn: KASA-01"
                      className={`h-9 text-sm ${fieldClass}`}
                    />
                  </div>
                </div>

                <div className="p-3">
                  <DeviceRegistrationInfoCard registration={d} darkMode={darkMode} compact />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
