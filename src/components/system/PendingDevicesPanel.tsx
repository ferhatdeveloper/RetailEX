import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Monitor, Pencil, RefreshCw, Shield, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { IS_TAURI } from '../../utils/env';
import { useAuth } from '../../contexts/AuthContext';
import { DeviceRegistrationInfoCard } from './DeviceRegistrationInfoCard';
import {
  approvePosTerminal,
  listCentralStoresForPlacement,
  listPosTerminalRegistrations,
  rejectPosTerminal,
  updatePosTerminalPlacement,
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

function fmt(ms: number) {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type DeviceRowProps = {
  d: PosTerminalRegistration;
  draft: PlacementDraft;
  firmStores: DevicePlacementOption[];
  darkMode: boolean;
  busy: boolean;
  fieldClass: string;
  onStoreChange: (storeId: string) => void;
  onTerminalNameChange: (name: string) => void;
  actions: React.ReactNode;
  statusBadge: React.ReactNode;
};

function DevicePlacementRow({
  d,
  draft,
  firmStores,
  darkMode,
  busy,
  fieldClass,
  onStoreChange,
  onTerminalNameChange,
  actions,
  statusBadge,
}: DeviceRowProps) {
  return (
    <div
      className={`rounded-lg border ${
        darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'
      } overflow-hidden`}
    >
      <div className="p-3 border-b border-gray-200/60 dark:border-gray-700/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Monitor className="w-5 h-5 text-blue-500 shrink-0" />
            <span className="font-medium truncate">{d.terminalName}</span>
            {d.firmName && <span className="text-xs text-gray-500">Firma: {d.firmName}</span>}
            {statusBadge}
          </div>
          <div className="flex gap-2 shrink-0">{actions}</div>
        </div>
        <div className="text-xs text-gray-500 mt-2 break-all">
          Cihaz ID: {d.deviceId}
          {d.storeName ? ` · Şube: ${d.storeName}` : ''}
        </div>
        <div className="text-xs text-gray-500 mt-1">
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
            onChange={(e) => onStoreChange(e.target.value)}
            disabled={busy}
            className={`w-full h-9 rounded-md border px-2 text-sm ${fieldClass}`}
          >
            <option value="">— İşyeri seçin —</option>
            {firmStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ''}
              </option>
            ))}
          </select>
          {firmStores.length === 0 && (
            <p className="text-[10px] text-amber-600">
              Bu firma için aktif şube bulunamadı; firma/dönem tanımlarını kontrol edin.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kasa adı</Label>
          <Input
            value={draft.terminalName}
            onChange={(e) => onTerminalNameChange(e.target.value)}
            disabled={busy}
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
}

export function PendingDevicesPanel({ darkMode = false }: Props) {
  const { user } = useAuth();
  const [pendingItems, setPendingItems] = useState<PosTerminalRegistration[]>([]);
  const [approvedItems, setApprovedItems] = useState<PosTerminalRegistration[]>([]);
  const [storesByFirm, setStoresByFirm] = useState<Record<string, DevicePlacementOption[]>>({});
  const [placements, setPlacements] = useState<Record<string, PlacementDraft>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');

  const loadStoresForFirms = useCallback(async (firmNrs: string[]) => {
    const unique = [...new Set(firmNrs.filter(Boolean))];
    const entries = await Promise.all(
      unique.map(async (firmNr) => {
        const list = await listCentralStoresForPlacement(firmNr);
        return [firmNr, list] as const;
      }),
    );
    setStoresByFirm((prev) => {
      const next = { ...prev };
      for (const [firmNr, list] of entries) next[firmNr] = list;
      return next;
    });
  }, []);

  const syncPlacements = useCallback((rows: PosTerminalRegistration[]) => {
    setPlacements((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!next[row.id]) next[row.id] = defaultPlacement(row);
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, approved] = await Promise.all([
        listPosTerminalRegistrations({ status: 'pending', limit: 50, allFirms: true }),
        listPosTerminalRegistrations({ status: 'approved', limit: 200, allFirms: true }),
      ]);
      setPendingItems(pending);
      setApprovedItems(approved);
      syncPlacements([...pending, ...approved]);
      const firmNrs = [...new Set([...pending, ...approved].map((r) => r.firmNr))];
      await loadStoresForFirms(firmNrs);
    } finally {
      setLoading(false);
    }
  }, [loadStoresForFirms, syncPlacements]);

  useEffect(() => {
    if (IS_TAURI) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const approvedMissingStore = useMemo(
    () => approvedItems.filter((d) => !d.storeId?.trim()).length,
    [approvedItems],
  );

  if (IS_TAURI) return null;

  const updatePlacement = (id: string, patch: Partial<PlacementDraft>) => {
    setPlacements((prev) => {
      const item = [...pendingItems, ...approvedItems].find((i) => i.id === id);
      const base = item ? defaultPlacement(item) : { storeId: '', terminalName: '' };
      return {
        ...prev,
        [id]: { ...base, ...prev[id], ...patch },
      };
    });
  };

  const validateDraft = (draft: PlacementDraft): boolean => {
    if (!draft.terminalName.trim()) {
      toast.error('Kasa adı zorunludur.');
      return false;
    }
    if (!draft.storeId.trim()) {
      toast.error('İşyeri (şube) seçin.');
      return false;
    }
    return true;
  };

  const handleApprove = async (d: PosTerminalRegistration) => {
    const draft = placements[d.id] ?? defaultPlacement(d);
    if (!validateDraft(draft)) return;

    setBusyId(d.id);
    try {
      const r = await approvePosTerminal(d.id, user?.id || null, {
        storeId: draft.storeId,
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

  const handleSaveApproved = async (d: PosTerminalRegistration) => {
    const draft = placements[d.id] ?? defaultPlacement(d);
    if (!validateDraft(draft)) return;

    setBusyId(d.id);
    try {
      const r = await updatePosTerminalPlacement(d.id, user?.id || null, {
        storeId: draft.storeId,
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

  const fieldClass = darkMode
    ? 'bg-gray-900 border-gray-600 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  const storesForDevice = (d: PosTerminalRegistration) => storesByFirm[d.firmNr] || [];

  return (
    <Card
      className={`p-4 border-2 ${
        pendingItems.length > 0
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
          <Shield className={`w-5 h-5 ${pendingItems.length > 0 ? 'text-amber-500' : 'text-blue-500'}`} />
          <div>
            <h3 className="text-sm font-semibold">Kasa Cihazları</h3>
            <p className="text-xs text-gray-500">
              Bekleyen onaylar ve onaylı cihazlarda işyeri / kasa yerleştirmesi
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'approved')}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending" className="gap-1.5">
            Bekleyen
            {pendingItems.length > 0 ? (
              <Badge className="h-5 px-1.5 text-[10px] bg-amber-500">{pendingItems.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1.5">
            Onaylı
            {approvedItems.length > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {approvedItems.length}
              </Badge>
            ) : null}
            {approvedMissingStore > 0 ? (
              <Badge className="h-5 px-1.5 text-[10px] bg-red-500">{approvedMissingStore} şubesiz</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-0">
          {pendingItems.length === 0 ? (
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
              {pendingItems.map((d) => {
                const draft = placements[d.id] ?? defaultPlacement(d);
                return (
                  <DevicePlacementRow
                    key={d.id}
                    d={d}
                    draft={draft}
                    firmStores={storesForDevice(d)}
                    darkMode={darkMode}
                    busy={busyId === d.id}
                    fieldClass={fieldClass}
                    onStoreChange={(storeId) => updatePlacement(d.id, { storeId })}
                    onTerminalNameChange={(terminalName) => updatePlacement(d.id, { terminalName })}
                    statusBadge={<Badge className="text-xs bg-amber-500">Onay bekliyor</Badge>}
                    actions={
                      <>
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
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-0">
          {approvedItems.length === 0 ? (
            <p className="text-sm text-gray-500">Onaylı kasa cihazı bulunamadı.</p>
          ) : (
            <div className="space-y-3">
              {approvedMissingStore > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                  {approvedMissingStore} onaylı cihazda mağaza bağlantısı yok. Aşağıdan işyeri seçip{' '}
                  <strong>Kaydet</strong> ile güncelleyin; ardından Veri Gönder/Al çalışır.
                </p>
              ) : null}
              {approvedItems.map((d) => {
                const draft = placements[d.id] ?? defaultPlacement(d);
                const missingStore = !d.storeId?.trim();
                return (
                  <DevicePlacementRow
                    key={d.id}
                    d={d}
                    draft={draft}
                    firmStores={storesForDevice(d)}
                    darkMode={darkMode}
                    busy={busyId === d.id}
                    fieldClass={fieldClass}
                    onStoreChange={(storeId) => updatePlacement(d.id, { storeId })}
                    onTerminalNameChange={(terminalName) => updatePlacement(d.id, { terminalName })}
                    statusBadge={
                      <>
                        <Badge className="text-xs bg-green-600">Onaylı</Badge>
                        {missingStore ? (
                          <Badge variant="destructive" className="text-xs">
                            Mağaza yok
                          </Badge>
                        ) : null}
                      </>
                    }
                    actions={
                      <Button
                        size="sm"
                        disabled={busyId === d.id}
                        onClick={() => void handleSaveApproved(d)}
                        className="gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Kaydet
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
