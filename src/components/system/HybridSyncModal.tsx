import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import {
  DB_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  getCentralRemotePgConfig,
  ERP_SETTINGS,
  normalizeHybridSyncIntervalSec,
  resolveHybridSyncConnectionProvider,
  type HybridSyncTransport,
} from '../../services/postgres';
import {
  buildSyncEndpoints,
  countPendingQueueEndpoint,
  countRemoteMasterTables,
  formatRemoteMasterVerifyMessage,
  getPendingQueueBreakdown,
  getPendingQueueBreakdownEndpoint,
  getSyncQueueRecentErrors,
  masterTableNamesForFirm,
  pruneRedundantSyncQueue,
  runHybridSync,
  type SyncQueueBreakdownRow,
  type SyncQueueErrorRow,
  type RemoteTableCountRow,
  type HybridSyncProgressEvent,
} from '../../services/hybridSyncEngine';
import {
  buildSyncFilter,
  buildKasaInboundFilter,
  getBranchSyncStats,
  getRemoteMasterSnapshot,
  type RemoteMasterSnapshot,
} from '../../services/hybridSyncService';
import {
  applyHybridAutoSyncSettings,
  isHybridPeriodicAutoSyncEnabled,
  readHybridTransportPreference,
  resolveKasaPullContext,
} from '../../services/mposKasaAutoPullService';
import {
  formatDeviceSyncLogSummary,
  getHybridDeviceId,
  listDeviceSyncTransferLogs,
} from '../../services/hybridDeviceSyncLogService';
import {
  auditSyncTransportConfig,
  formatSyncTransportLabel,
} from '../../services/syncTransportDiagnostics';
import { wsService } from '../../services/websocket';
import { toast } from 'sonner';
import { CenterDeviceSyncMonitor } from './CenterDeviceSyncMonitor';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type SyncStep = {
  id: 'send' | 'receive';
  title: string;
  description: string;
  status: StepStatus;
  detail?: string;
};

type PreviewData = {
  localPending: number;
  inboundPending: number;
  inboundQueueAvailable: boolean;
  remoteMaster: RemoteMasterSnapshot;
  outboundBreakdown: SyncQueueBreakdownRow[];
  inboundBreakdown: SyncQueueBreakdownRow[];
  /** Kayıtlı terminal adı (bilgi); şube senkronunu kasa moduna çevirmez */
  registeredTerminal?: string;
  receiveEnabled: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

const AUTO_SYNC_INTERVAL_PRESETS = [15, 30, 60, 120, 300] as const;

const TRANSPORT_OPTIONS: { value: HybridSyncTransport; label: string }[] = [
  { value: 'both', label: 'WebSocket + Periyodik' },
  { value: 'polling', label: 'Yalnız periyodik' },
  { value: 'websocket', label: 'Yalnız WebSocket (periyodik kapalı)' },
];

const TABLE_LABELS: Record<string, string> = {
  products: 'Ürünler',
  product: 'Ürünler',
  customers: 'Cariler',
  customer: 'Cariler',
  sales: 'Satışlar',
  sale: 'Satış',
  promotions: 'Promosyonlar',
  promotion: 'Promosyon',
  campaigns: 'Kampanyalar',
  campaign: 'Kampanya',
  stock_movements: 'Stok hareketleri',
  inventory: 'Stok',
  prices: 'Fiyatlar',
  price: 'Fiyat',
  day_end: 'Günsonu',
  dayend: 'Günsonu',
  users: 'Kullanıcılar',
  stores: 'Mağazalar',
};

function tableLabel(name: string): string {
  const key = name.trim().toLowerCase();
  return TABLE_LABELS[key] ?? name.replace(/_/g, ' ');
}

function formatBreakdown(rows: SyncQueueBreakdownRow[], total: number): string {
  if (total <= 0) return 'Bekleyen kayıt yok';
  if (!rows.length) return `${total} kayıt`;
  const top = rows.slice(0, 4).map((r) => {
    const raw = r.tableName.trim();
    const short = raw.replace(/^rex_\d+_/i, '').replace(/_/g, ' ');
    return `${tableLabel(short)} (${r.count})`;
  });
  const rest = total - rows.slice(0, 4).reduce((s, r) => s + r.count, 0);
  if (rest > 0) top.push(`diğer (${rest})`);
  return top.join(' · ');
}

function stepIcon(status: StepStatus) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-600" />;
  if (status === 'skipped') return <Circle className="h-4 w-4 text-gray-300" />;
  return <Circle className="h-4 w-4 text-gray-400" />;
}

function formatHybridSyncMessage(result: { totalSynced?: number; failed?: number; message?: string }): string {
  if (result.message) return result.message;
  return '';
}

function formatMasterCounts(rows: RemoteTableCountRow[]): string {
  const parts = rows
    .filter((r) => r.count !== null && r.count > 0)
    .map((r) => {
      const short = r.tableName.replace(/^rex_\d+_/i, '').replace(/_/g, ' ');
      return `${tableLabel(short)} (${r.count})`;
    });
  return parts.length ? parts.join(' · ') : 'Merkez tablolarında kayıt görünmüyor';
}

function formatInboundPreview(preview: PreviewData): string {
  if (!preview.receiveEnabled) {
    return 'Senkron yönü yalnızca gönderim (yerel → merkez)';
  }
  if (preview.inboundQueueAvailable) {
    const breakdown = formatBreakdown(preview.inboundBreakdown, Math.max(0, preview.inboundPending));
    return preview.inboundPending > 0 ? breakdown : `${preview.inboundPending} merkez kuyruk kaydı`;
  }
  const master = formatMasterCounts(preview.remoteMaster.tables);
  return `Kuyruk erişilemiyor · Merkezde: ${master}`;
}

function formatLiveStepDetail(opts: {
  verb: string;
  totalAtStart: number;
  remaining: number;
  engineSynced: number;
  engineFailed: number;
  lastTable?: string;
}): string {
  const doneFromQueue = Math.max(0, opts.totalAtStart - opts.remaining);
  const done = Math.max(doneFromQueue, opts.engineSynced);
  const parts: string[] = [`${opts.verb}… ${done} / ${opts.totalAtStart} tamamlandı`];
  if (opts.remaining > 0) parts.push(`${opts.remaining} kalan`);
  if (opts.engineFailed > 0) parts.push(`${opts.engineFailed} hata`);
  if (opts.lastTable) {
    const short = opts.lastTable.replace(/^rex_\d+_/i, '').replace(/_/g, ' ');
    parts.push(`son: ${tableLabel(short)}`);
  }
  return parts.join(' · ');
}

function parseEngineErrorLine(line: string): { table?: string; message: string } {
  const m = line.match(/^(?:yerel→uzak|uzak→yerel)\s+(\S+)\/([^:]+):\s*(.+)$/i);
  if (m) {
    const short = m[1].replace(/^rex_\d+_/i, '').replace(/_/g, ' ');
    return { table: tableLabel(short), message: m[3].trim() };
  }
  return { message: line };
}

function SyncErrorLogPanel({
  queueErrors,
  sessionErrors,
  expanded,
  onToggle,
}: {
  queueErrors: SyncQueueErrorRow[];
  sessionErrors: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = queueErrors.length + sessionErrors.length;
  if (total === 0) return null;

  const merged = [
    ...sessionErrors.map((line, i) => ({
      key: `sess-${i}`,
      table: parseEngineErrorLine(line).table,
      message: parseEngineErrorLine(line).message,
      retry: null as number | null,
    })),
    ...queueErrors.map((row) => ({
      key: row.id,
      table: tableLabel(row.tableName.replace(/^rex_\d+_/i, '').replace(/_/g, ' ')),
      message: row.errorMessage,
      retry: row.retryCount,
    })),
  ];

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-100/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-red-700" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-red-700" />
        )}
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
        <span className="text-sm font-semibold text-red-900">
          Hata günlüğü ({total})
        </span>
        {!expanded && merged[0] ? (
          <span className="text-xs text-red-800 truncate ml-1 min-w-0">
            — {merged[0].table ? `${merged[0].table}: ` : ''}
            {merged[0].message}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <ul className="max-h-48 overflow-y-auto border-t border-red-200/80 divide-y divide-red-100/80 text-xs">
          {merged.slice(0, 50).map((item) => (
            <li key={item.key} className="px-3 py-2 leading-snug">
              {item.table ? (
                <span className="font-semibold text-red-900">{item.table}</span>
              ) : null}
              {item.table ? <span className="text-red-800"> — </span> : null}
              <span className="text-red-800">{item.message}</span>
              {item.retry != null && item.retry > 0 ? (
                <span className="text-red-600 ml-1">(deneme {item.retry})</span>
              ) : null}
            </li>
          ))}
          {merged.length > 50 ? (
            <li className="px-3 py-2 text-red-700 italic">
              … ve {merged.length - 50} hata daha (kuyruk tablosunda error_message alanına bakın)
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

async function verifySentDataOnRemote(
  outboundBreakdown: SyncQueueBreakdownRow[],
): Promise<string> {
  const tablesFromQueue = outboundBreakdown
    .filter((r) => r.count > 0)
    .map((r) => r.tableName.trim())
    .filter((t) => /^rex_\d{3}_[a-z0-9_]+$/i.test(t));

  const tables =
    tablesFromQueue.length > 0
      ? tablesFromQueue
      : masterTableNamesForFirm(ERP_SETTINGS.firmNr);

  const { remote } = buildSyncEndpoints({
    local: LOCAL_CONFIG,
    remote: getCentralRemotePgConfig(),
    connectionProvider: resolveHybridSyncConnectionProvider(),
    remoteRestUrl: DB_SETTINGS.remoteRestUrl,
  });

  const counts = await countRemoteMasterTables(remote, tables.slice(0, 8));
  return formatRemoteMasterVerifyMessage(counts);
}

export function HybridSyncModal({ open, onOpenChange, onComplete }: Props) {
  const { user } = useAuth();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [steps, setSteps] = useState<SyncStep[]>([]);
  const [finished, setFinished] = useState(false);
  const [queueErrors, setQueueErrors] = useState<SyncQueueErrorRow[]>([]);
  const [sessionErrors, setSessionErrors] = useState<string[]>([]);
  const [errorsExpanded, setErrorsExpanded] = useState(true);
  const [autoSyncExpanded, setAutoSyncExpanded] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => isHybridPeriodicAutoSyncEnabled());
  const [autoSyncIntervalSec, setAutoSyncIntervalSec] = useState(
    () => DB_SETTINGS.hybridSyncIntervalSec ?? 30,
  );
  const [autoSyncTransport, setAutoSyncTransport] = useState<HybridSyncTransport>(
    () => DB_SETTINGS.hybridSyncTransport ?? 'both',
  );
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>(() =>
    wsService.getStatus(),
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineProgressRef = useRef<{ synced: number; failed: number; lastTable?: string }>({
    synced: 0,
    failed: 0,
  });
  const totalsAtStartRef = useRef<{ send: number; receive: number }>({ send: 0, receive: 0 });

  const stopLivePoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopLivePoll(), [stopLivePoll]);

  useEffect(() => {
    if (!open) return;
    setAutoSyncEnabled(isHybridPeriodicAutoSyncEnabled());
    setAutoSyncIntervalSec(DB_SETTINGS.hybridSyncIntervalSec ?? 30);
    setAutoSyncTransport(DB_SETTINGS.hybridSyncTransport ?? 'both');
    setWsStatus(wsService.getStatus());
    const wsPoll = window.setInterval(() => setWsStatus(wsService.getStatus()), 2000);
    return () => window.clearInterval(wsPoll);
  }, [open]);

  const persistAutoSyncSettings = useCallback(
    async (patch: { transport?: HybridSyncTransport; intervalSec?: number }) => {
      setAutoSyncSaving(true);
      try {
        await applyHybridAutoSyncSettings({
          transport: patch.transport,
          intervalSec: patch.intervalSec,
          userId: user?.id ?? null,
          storeId: user?.store_id ?? null,
        });
        if (patch.transport !== undefined) {
          setAutoSyncTransport(patch.transport);
          setAutoSyncEnabled(patch.transport === 'polling' || patch.transport === 'both');
        }
        if (patch.intervalSec !== undefined) {
          setAutoSyncIntervalSec(normalizeHybridSyncIntervalSec(patch.intervalSec));
        }
        setWsStatus(wsService.getStatus());
      } catch (e) {
        console.warn('[HybridSyncModal] auto sync ayarı:', e);
        toast.error('Otomatik senkron ayarı kaydedilemedi');
      } finally {
        setAutoSyncSaving(false);
      }
    },
    [user?.id, user?.store_id],
  );

  const handleAutoSyncToggle = useCallback(
    async (enabled: boolean) => {
      if (autoSyncSaving) return;
      if (enabled) {
        const pref = readHybridTransportPreference();
        const nextTransport: HybridSyncTransport =
          autoSyncTransport === 'websocket' ? pref : autoSyncTransport;
        await persistAutoSyncSettings({
          transport: nextTransport === 'websocket' ? 'both' : nextTransport,
          intervalSec: autoSyncIntervalSec,
        });
        toast.success(`Otomatik senkron açıldı (${autoSyncIntervalSec} sn)`);
      } else {
        await persistAutoSyncSettings({ transport: 'websocket' });
        toast.info('Periyodik otomatik senkron kapatıldı');
      }
    },
    [autoSyncSaving, autoSyncIntervalSec, autoSyncTransport, persistAutoSyncSettings],
  );

  const handleAutoSyncIntervalChange = useCallback(
    async (sec: number) => {
      const normalized = normalizeHybridSyncIntervalSec(sec);
      setAutoSyncIntervalSec(normalized);
      if (!autoSyncEnabled) return;
      await persistAutoSyncSettings({ intervalSec: normalized });
      toast.success(`Senkron aralığı: ${normalized} sn`);
    },
    [autoSyncEnabled, persistAutoSyncSettings],
  );

  const handleAutoSyncTransportChange = useCallback(
    async (next: HybridSyncTransport) => {
      setAutoSyncTransport(next);
      await persistAutoSyncSettings({ transport: next });
      const periodicOn = next === 'polling' || next === 'both';
      setAutoSyncEnabled(periodicOn);
      toast.success(`Taşıma modu: ${formatSyncTransportLabel(next)}`);
    },
    [persistAutoSyncSettings],
  );

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const kasaCtx = await resolveKasaPullContext(user?.store_id || null);
      const receiveEnabled = DB_SETTINGS.hybridSyncDirection !== 'local_to_remote';
      const outboundFilter = buildSyncFilter({
        storeId: user?.store_id || null,
        userId: null,
        cashierUsername: null,
        scopeCashierOnly: false,
      });
      const inboundFilter = buildKasaInboundFilter({
        storeId: kasaCtx?.storeId ?? user?.store_id ?? null,
        terminalName: kasaCtx?.terminalName ?? null,
      });

      await pruneRedundantSyncQueue(LOCAL_CONFIG, ERP_SETTINGS.firmNr);

      const branchStats = await getBranchSyncStats(outboundFilter);
      const remoteMaster = await getRemoteMasterSnapshot(ERP_SETTINGS.firmNr);
      const outboundBreakdown = await getPendingQueueBreakdown(LOCAL_CONFIG, outboundFilter);
      const recentQueueErrors = await getSyncQueueRecentErrors(LOCAL_CONFIG, outboundFilter, 40);

      let inboundBreakdown: SyncQueueBreakdownRow[] = [];
      const inboundQueueAvailable = branchStats.remotePending >= 0;
      let inboundPending = branchStats.remotePending >= 0 ? branchStats.remotePending : -1;

      if (receiveEnabled) {
        try {
          const { remote } = buildSyncEndpoints({
            local: LOCAL_CONFIG,
            remote: getCentralRemotePgConfig(),
            connectionProvider: resolveHybridSyncConnectionProvider(),
            remoteRestUrl: DB_SETTINGS.remoteRestUrl,
          });
          inboundBreakdown = await getPendingQueueBreakdownEndpoint(remote, inboundFilter);
          inboundPending = await countPendingQueueEndpoint(remote, inboundFilter);
        } catch {
          /* merkez kırılım alınamadı */
        }
      }

      setPreview({
        localPending: branchStats.localPending,
        inboundPending,
        inboundQueueAvailable,
        remoteMaster,
        outboundBreakdown,
        inboundBreakdown,
        registeredTerminal: kasaCtx?.terminalName,
        receiveEnabled,
      });
      setQueueErrors(recentQueueErrors);
      setSessionErrors([]);
      setErrorsExpanded(recentQueueErrors.length > 0);

      setSteps([
        {
          id: 'send',
          title: 'Yerelden merkeze gönder',
          description: formatBreakdown(outboundBreakdown, branchStats.localPending),
          status: 'pending',
        },
        {
          id: 'receive',
          title: 'Merkezden yerel al',
          description: formatInboundPreview({
            localPending: branchStats.localPending,
            inboundPending,
            inboundQueueAvailable,
            remoteMaster,
            outboundBreakdown,
            inboundBreakdown,
            receiveEnabled,
          }),
          status: receiveEnabled ? 'pending' : 'skipped',
        },
      ]);
      setFinished(false);
    } catch {
      setPreview(null);
      setSteps([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [user?.store_id]);

  useEffect(() => {
    if (open) void loadPreview();
  }, [open, loadPreview]);

  const updateStep = (id: SyncStep['id'], patch: Partial<SyncStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const runSync = async () => {
    if (!preview) return;
    setRunning(true);
    setFinished(false);
    setSessionErrors([]);
    stopLivePoll();

    const kasaCtx = await resolveKasaPullContext(user?.store_id || null);
    const outboundFilter = buildSyncFilter({
      storeId: user?.store_id || null,
      userId: null,
      cashierUsername: null,
      scopeCashierOnly: false,
    });
    const inboundFilter = buildKasaInboundFilter({
      storeId: kasaCtx?.storeId ?? user?.store_id ?? null,
      terminalName: kasaCtx?.terminalName ?? preview.registeredTerminal ?? null,
    });
    const receiveEnabled = preview.receiveEnabled;
    const deviceId = await getHybridDeviceId();

    totalsAtStartRef.current = {
      send: Math.max(0, preview.localPending),
      receive: Math.max(0, preview.inboundPending),
    };

    const refreshLiveCounts = async (stepId: 'send' | 'receive') => {
      try {
        if (stepId === 'send') {
          const breakdown = await getPendingQueueBreakdown(LOCAL_CONFIG, outboundFilter);
          const remaining = breakdown.reduce((s, r) => s + r.count, 0);
          const totalAtStart = totalsAtStartRef.current.send;
          const eng = engineProgressRef.current;
          setPreview((p) =>
            p ? { ...p, localPending: remaining, outboundBreakdown: breakdown } : p,
          );
          updateStep('send', {
            description: formatBreakdown(breakdown, remaining),
            detail: formatLiveStepDetail({
              verb: 'Gönderiliyor',
              totalAtStart,
              remaining,
              engineSynced: eng.synced,
              engineFailed: eng.failed,
              lastTable: eng.lastTable,
            }),
          });
        } else {
          let remaining = 0;
          let breakdown: SyncQueueBreakdownRow[] = [];
          try {
            const { remote } = buildSyncEndpoints({
              local: LOCAL_CONFIG,
              remote: getCentralRemotePgConfig(),
              connectionProvider: resolveHybridSyncConnectionProvider(),
              remoteRestUrl: DB_SETTINGS.remoteRestUrl,
            });
            breakdown = await getPendingQueueBreakdownEndpoint(remote, inboundFilter);
            remaining = await countPendingQueueEndpoint(remote, inboundFilter);
          } catch {
            /* kırılım alınamadı */
          }
          const totalAtStart = totalsAtStartRef.current.receive;
          const eng = engineProgressRef.current;
          const safeRemaining = Math.max(0, remaining);
          setPreview((p) =>
            p
              ? {
                  ...p,
                  inboundPending: safeRemaining,
                  inboundBreakdown: breakdown.length ? breakdown : p.inboundBreakdown,
                }
              : p,
          );
          updateStep('receive', {
            description: formatBreakdown(breakdown, safeRemaining) || `${safeRemaining} kuyruk kaydı`,
            detail: formatLiveStepDetail({
              verb: 'Alınıyor',
              totalAtStart,
              remaining: safeRemaining,
              engineSynced: eng.synced,
              engineFailed: eng.failed,
              lastTable: eng.lastTable,
            }),
          });
        }
      } catch {
        /* canlı sayım atlandı */
      }
    };

    const startLivePoll = (stepId: 'send' | 'receive') => {
      stopLivePoll();
      engineProgressRef.current = { synced: 0, failed: 0 };
      void refreshLiveCounts(stepId);
      pollTimerRef.current = setInterval(() => {
        void refreshLiveCounts(stepId);
      }, 700);
    };

    const appendSessionErrors = (lines?: string[]) => {
      if (!lines?.length) return;
      setSessionErrors((prev) => {
        const next = [...prev];
        for (const line of lines) {
          if (!next.includes(line)) next.push(line);
        }
        return next.slice(-80);
      });
      setErrorsExpanded(true);
    };

    const makeOnProgress =
      (stepId: 'send' | 'receive') => (ev: HybridSyncProgressEvent) => {
        if (ev.lastError) appendSessionErrors([ev.lastError]);
        engineProgressRef.current = {
          synced: ev.synced,
          failed: ev.failed,
          lastTable: ev.lastTable,
        };
        setSteps((prev) =>
          prev.map((s) => {
            if (s.id !== stepId || s.status !== 'running') return s;
            const totalAtStart =
              stepId === 'send'
                ? totalsAtStartRef.current.send
                : totalsAtStartRef.current.receive;
            const remaining = Math.max(0, totalAtStart - ev.synced);
            return {
              ...s,
              detail: formatLiveStepDetail({
                verb: stepId === 'send' ? 'Gönderiliyor' : 'Alınıyor',
                totalAtStart,
                remaining,
                engineSynced: ev.synced,
                engineFailed: ev.failed,
                lastTable: ev.lastTable,
              }),
            };
          }),
        );
      };

    try {
      startLivePoll('send');
      updateStep('send', { status: 'running', detail: 'Gönderiliyor… 0 / …' });
      const sendResult = await runHybridSync({
        flow: 'send',
        direction: 'local_to_remote',
        scope: 'all',
        filter: outboundFilter,
        local: LOCAL_CONFIG,
        remote: getCentralRemotePgConfig(),
        connectionProvider: resolveHybridSyncConnectionProvider(),
        remoteRestUrl: DB_SETTINGS.remoteRestUrl,
        incremental: true,
        deviceId,
        storeId: user?.store_id || null,
        terminalName: kasaCtx?.terminalName ?? null,
        onProgress: makeOnProgress('send'),
      });
      stopLivePoll();
      await refreshLiveCounts('send');
      appendSessionErrors(sendResult.errors);

      if (!sendResult.success && sendResult.failed > 0 && sendResult.totalSynced === 0) {
        updateStep('send', {
          status: 'error',
          detail: sendResult.message || 'Gönderim başarısız.',
        });
      } else if (sendResult.totalSynced === 0 && sendResult.failed === 0) {
        updateStep('send', { status: 'skipped', detail: 'Gönderilecek kayıt yok.', description: 'Bekleyen kayıt yok' });
      } else {
        const verifyMsg = await verifySentDataOnRemote(preview.outboundBreakdown);
        updateStep('send', {
          status: 'done',
          description: 'Bekleyen kayıt yok',
          detail:
            (formatHybridSyncMessage(sendResult) ||
              `${sendResult.totalSynced} kayıt gönderildi` +
                (sendResult.failed > 0 ? ` · ${sendResult.failed} hata` : '')) +
            (verifyMsg ? ` · ${verifyMsg}` : '') +
            (sendResult.errors?.[0] ? ` · Son hata: ${sendResult.errors[0].split(': ').slice(1).join(': ') || sendResult.errors[0]}` : ''),
        });
      }

      const queueErrorsAfterSend = await getSyncQueueRecentErrors(LOCAL_CONFIG, outboundFilter, 40);
      setQueueErrors(queueErrorsAfterSend);

      if (receiveEnabled) {
        startLivePoll('receive');
        updateStep('receive', { status: 'running', detail: 'Alınıyor… 0 / …' });

        const recvResult = await runHybridSync({
          flow: 'receive',
          direction: 'remote_to_local',
          scope: 'all',
          filter: inboundFilter,
          local: LOCAL_CONFIG,
          remote: getCentralRemotePgConfig(),
          connectionProvider: resolveHybridSyncConnectionProvider(),
          remoteRestUrl: DB_SETTINGS.remoteRestUrl,
          incremental: true,
          deviceId,
          storeId: kasaCtx?.storeId ?? user?.store_id ?? null,
          terminalName: kasaCtx?.terminalName ?? preview.registeredTerminal ?? null,
          onProgress: makeOnProgress('receive'),
        });
        stopLivePoll();
        await refreshLiveCounts('receive');
        appendSessionErrors(recvResult.errors);
        if (!recvResult.success && recvResult.failed > 0 && recvResult.totalSynced === 0) {
          updateStep('receive', {
            status: 'error',
            detail: recvResult.message || 'Alım başarısız.',
          });
        } else if (recvResult.totalSynced === 0 && recvResult.failed === 0) {
          const masterHint = !preview.inboundQueueAvailable
            ? ` · Merkez tablolarında veri var (${formatMasterCounts(preview.remoteMaster.tables)}) ancak sync_queue erişilemiyor`
            : '';
          updateStep('receive', {
            status: 'skipped',
            detail: `Alınacak kuyruk kaydı yok${masterHint}.`,
          });
        } else {
          updateStep('receive', {
            status: 'done',
            detail:
              formatHybridSyncMessage(recvResult) ||
              `${recvResult.totalSynced} kayıt alındı` +
                (recvResult.failed > 0 ? ` · ${recvResult.failed} hata` : ''),
          });
        }
      } else {
        updateStep('receive', {
          status: 'skipped',
          detail: 'Hibrit senkron yönü yalnızca gönderim — alım atlandı.',
        });
      }

      setFinished(true);
      const recentLogs = await listDeviceSyncTransferLogs({ deviceId, limit: 2 });
      if (recentLogs.length) {
        setSteps((prev) =>
          prev.map((s) => {
            const log = recentLogs.find(
              (l) =>
                (l.direction === 'local_to_remote' && s.id === 'send') ||
                (l.direction === 'remote_to_local' && s.id === 'receive'),
            );
            if (!log || (s.status !== 'done' && s.status !== 'skipped')) return s;
            const logLine = `Log: ${formatDeviceSyncLogSummary(log)}`;
            return { ...s, detail: s.detail ? `${s.detail} · ${logLine}` : logLine };
          }),
        );
      }
      onComplete?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSteps((prev) =>
        prev.map((s) =>
          s.status === 'running' ? { ...s, status: 'error', detail: msg } : s,
        ),
      );
    } finally {
      stopLivePoll();
      setRunning(false);
    }
  };

  const totalPending = useMemo(() => {
    if (!preview) return 0;
    return Math.max(0, preview.localPending) + Math.max(0, preview.inboundPending);
  }, [preview]);

  const transportAudit = useMemo(() => (open ? auditSyncTransportConfig() : null), [open]);

  const handleClose = () => {
    if (running) return;
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <PercentBodyModal onClose={handleClose} size="wide" ariaLabel="Veri senkronu">
        <div className="p-3 border-b flex items-center shrink-0 border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2 text-white">
            <RefreshCw className="h-5 w-5" />
            <div>
              <h3 id="hybrid-sync-title" className="text-base font-bold">Veri senkronu</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                {preview?.receiveEnabled === false
                  ? 'Yerel → merkez (alıma kapalı)'
                  : 'Şube: yerel ↔ merkez çift yönlü aktarım'}
              </p>
            </div>
          </div>
        </div>

        <PercentBodyModalScrollBody className="p-4 space-y-4">
        {transportAudit && transportAudit.issues.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
            <p className="font-semibold">
              Taşıma: {formatSyncTransportLabel(transportAudit.transport)}
              {transportAudit.tenantSlug ? ` · kiracı: ${transportAudit.tenantSlug}` : ''}
            </p>
            {transportAudit.issues
              .filter((i) => i.severity !== 'info')
              .slice(0, 2)
              .map((issue) => (
                <p key={issue.code}>
                  {issue.message}{' '}
                  <span className="text-amber-800">→ {issue.solution}</span>
                </p>
              ))}
          </div>
        )}

        {loadingPreview ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Özet hazırlanıyor…
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-blue-200 p-3 space-y-1 bg-blue-50/80">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-800">
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Gönderilecek
                </div>
                <p
                  className={cn(
                    'text-lg font-bold text-gray-900 tabular-nums transition-all',
                    running && 'text-blue-700',
                  )}
                >
                  {preview.localPending}
                </p>
                <p className="text-xs text-gray-700 leading-snug">
                  {formatBreakdown(preview.outboundBreakdown, preview.localPending)}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 p-3 space-y-1 bg-emerald-50/80">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  {preview.inboundQueueAvailable ? 'Alınacak (kuyruk)' : 'Merkezde kayıtlı'}
                </div>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {preview.inboundQueueAvailable
                    ? preview.inboundPending
                    : preview.remoteMaster.tables.reduce(
                        (s, r) => s + (r.count ?? 0),
                        0,
                      ) || '—'}
                </p>
                <p className="text-xs text-gray-700 leading-snug">
                  {!preview.receiveEnabled
                    ? 'Senkron yönü yalnızca gönderim'
                    : preview.inboundQueueAvailable
                      ? formatBreakdown(preview.inboundBreakdown, Math.max(0, preview.inboundPending)) ||
                        `${preview.inboundPending} merkez kuyruk kaydı`
                      : formatMasterCounts(preview.remoteMaster.tables)}
                </p>
                {!preview.inboundQueueAvailable ? (
                  <p className="text-[10px] text-amber-800 leading-snug">
                    Merkez <code className="font-mono">sync_queue</code> PostgREST üzerinden okunamıyor
                    (048–049–088 migration ve şema yenileme gerekebilir). Tablo sayıları doğrudan API ile
                    gösteriliyor; gönderim çalışır, merkezden kuyruk ile alım sınırlı olabilir.
                  </p>
                ) : null}
              </div>
            </div>

            {preview.registeredTerminal ? (
              <p className="text-xs text-gray-600">
                Kayıtlı terminal: <strong className="text-gray-900">{preview.registeredTerminal}</strong>
                <span className="text-gray-500">
                  {' '}
                  — bu ekranda şube senkronu çalışır; kasa master çekimi POS otomatik servisindedir.
                </span>
              </p>
            ) : null}

            <SyncErrorLogPanel
              queueErrors={queueErrors}
              sessionErrors={sessionErrors}
              expanded={errorsExpanded}
              onToggle={() => setErrorsExpanded((v) => !v)}
            />

            <div className="rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setAutoSyncExpanded((v) => !v)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 pl-0.5 text-left hover:bg-blue-100/50"
                  aria-expanded={autoSyncExpanded}
                >
                  {autoSyncExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-blue-800" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-blue-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                      Otomatik senkron
                    </p>
                    {!autoSyncExpanded ? (
                      <p className="text-[10px] text-blue-800/85 truncate leading-snug">
                        {autoSyncEnabled ? (
                          <>
                            {autoSyncIntervalSec} sn
                            {autoSyncTransport === 'both' || autoSyncTransport === 'websocket' ? (
                              <>
                                {' '}
                                · WS{' '}
                                {wsStatus === 'connected'
                                  ? 'bağlı'
                                  : wsStatus === 'connecting'
                                    ? '…'
                                    : 'kapalı'}
                              </>
                            ) : null}
                            {' '}
                            · {formatSyncTransportLabel(autoSyncTransport)}
                          </>
                        ) : (
                          <>
                            Kapalı
                            {autoSyncTransport === 'websocket' ? (
                              <>
                                {' '}
                                · WS{' '}
                                {wsStatus === 'connected'
                                  ? 'bağlı'
                                  : wsStatus === 'connecting'
                                    ? '…'
                                    : 'kapalı'}
                              </>
                            ) : null}
                          </>
                        )}
                        {autoSyncSaving ? <span className="text-blue-700"> · kaydediliyor…</span> : null}
                      </p>
                    ) : null}
                  </div>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSyncEnabled}
                  disabled={autoSyncSaving || running}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleAutoSyncToggle(!autoSyncEnabled);
                  }}
                  className={cn(
                    'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
                    autoSyncEnabled ? 'bg-emerald-500' : 'bg-gray-300',
                  )}
                  title={autoSyncEnabled ? 'Otomatik senkron açık' : 'Otomatik senkron kapalı'}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
                      autoSyncEnabled ? 'left-[1.35rem]' : 'left-0.5',
                    )}
                  />
                </button>
              </div>

              {autoSyncExpanded ? (
                <div className="space-y-2 border-t border-blue-200/70 px-3 pb-3 pt-2">
                  <p className="text-[10px] text-blue-800/90 leading-snug">
                    Arka planda periyodik sync_queue işleme. Manuel «Senkronu başlat» her zaman
                    kullanılabilir.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">
                        Aralık (saniye)
                      </span>
                      <select
                        value={autoSyncIntervalSec}
                        disabled={!autoSyncEnabled || autoSyncSaving || running}
                        onChange={(e) => void handleAutoSyncIntervalChange(Number(e.target.value))}
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50"
                      >
                        {AUTO_SYNC_INTERVAL_PRESETS.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec} sn
                          </option>
                        ))}
                        {!AUTO_SYNC_INTERVAL_PRESETS.includes(
                          autoSyncIntervalSec as (typeof AUTO_SYNC_INTERVAL_PRESETS)[number],
                        ) ? (
                          <option value={autoSyncIntervalSec}>{autoSyncIntervalSec} sn</option>
                        ) : null}
                      </select>
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600">
                        Taşıma modu
                      </span>
                      <select
                        value={autoSyncTransport}
                        disabled={autoSyncSaving || running}
                        onChange={(e) =>
                          void handleAutoSyncTransportChange(e.target.value as HybridSyncTransport)
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50"
                      >
                        {TRANSPORT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <p className="text-[10px] text-gray-600 leading-snug">
                    {autoSyncEnabled ? (
                      <>
                        Periyodik: <strong>her {autoSyncIntervalSec} sn</strong>
                        {autoSyncTransport === 'both' || autoSyncTransport === 'websocket' ? (
                          <>
                            {' '}
                            · WebSocket:{' '}
                            <strong>
                              {wsStatus === 'connected'
                                ? 'bağlı'
                                : wsStatus === 'connecting'
                                  ? 'bağlanıyor…'
                                  : 'kapalı'}
                            </strong>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Periyodik timer kapalı.
                        {autoSyncTransport === 'websocket' ? (
                          <>
                            {' '}
                            WebSocket:{' '}
                            <strong>
                              {wsStatus === 'connected'
                                ? 'bağlı (anlık bildirim)'
                                : wsStatus === 'connecting'
                                  ? 'bağlanıyor…'
                                  : 'kapalı'}
                            </strong>
                          </>
                        ) : null}
                      </>
                    )}
                    {autoSyncSaving ? (
                      <span className="ml-1 text-blue-700">Kaydediliyor…</span>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </div>

            <CenterDeviceSyncMonitor
              compact
              hours={168}
              defaultTab="sessions"
              collapsible
              defaultCollapsed
            />

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Aktarım adımları
              </p>
              <ol className="space-y-2">
                {steps.map((step, idx) => (
                  <li
                    key={step.id}
                    className={cn(
                      'flex gap-3 rounded-lg border px-3 py-2.5 transition-colors bg-white',
                      step.status === 'running' && 'border-blue-300 bg-blue-50',
                      step.status === 'done' && 'border-emerald-200 bg-emerald-50/80',
                      step.status === 'error' && 'border-red-200 bg-red-50/80',
                      step.status === 'pending' && 'border-gray-200',
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{stepIcon(step.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {idx + 1}. {step.title}
                      </p>
                      <p className="text-xs text-gray-700 mt-0.5 leading-snug">{step.description}</p>
                      {step.detail ? (
                        <p
                          className={cn(
                            'text-xs mt-1 leading-snug tabular-nums',
                            step.status === 'error' ? 'text-red-700 font-medium' : 'text-gray-800',
                            step.status === 'running' && 'font-medium text-blue-800',
                          )}
                        >
                          {step.detail}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {totalPending === 0 && !running && !finished ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Bekleyen kayıt görünmüyor; yine de senkron çalıştırılabilir.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-gray-600 py-4">Özet yüklenemedi. Hibrit mod ve bağlantıyı kontrol edin.</p>
        )}
        </PercentBodyModalScrollBody>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2 shrink-0">
          <button
            type="button"
            disabled={running}
            onClick={handleClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            {finished ? 'Kapat' : 'Vazgeç'}
          </button>
          {!finished ? (
            <button
              type="button"
              disabled={running || loadingPreview || !preview}
              onClick={() => void runSync()}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aktarılıyor…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Senkronu başlat
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void loadPreview()}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded hover:bg-white flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Yenile
            </button>
          )}
        </div>
    </PercentBodyModal>
  );
}
