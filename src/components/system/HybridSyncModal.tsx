import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Circle,
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
  ERP_SETTINGS,
  resolveHybridSyncConnectionProvider,
} from '../../services/postgres';
import {
  buildSyncEndpoints,
  countRemoteMasterTables,
  formatRemoteMasterVerifyMessage,
  getPendingQueueBreakdown,
  getPendingQueueBreakdownEndpoint,
  masterTableNamesForFirm,
  runHybridSync,
  type SyncQueueBreakdownRow,
  type RemoteTableCountRow,
} from '../../services/hybridSyncEngine';
import {
  buildKasaInboundFilter,
  buildSyncFilter,
  getBranchSyncStats,
  getRemoteMasterSnapshot,
  type RemoteMasterSnapshot,
} from '../../services/hybridSyncService';
import {
  pullInboundMasterNow,
  resolveKasaPullContext,
} from '../../services/mposKasaAutoPullService';
import { formatSyncBreakdown as formatKasaSyncBreakdown } from '../../services/kasaDataArrivalNotify';
import {
  formatDeviceSyncLogSummary,
  getHybridDeviceId,
  listDeviceSyncTransferLogs,
} from '../../services/hybridDeviceSyncLogService';
import { CenterDeviceSyncMonitor } from './CenterDeviceSyncMonitor';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../shared/FullscreenBodyPortal';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type SyncStep = {
  id: 'send' | 'receive';
  title: string;
  description: string;
  status: StepStatus;
  detail?: string;
};

type PreviewData = {
  isKasa: boolean;
  localPending: number;
  inboundPending: number;
  inboundQueueAvailable: boolean;
  remoteMaster: RemoteMasterSnapshot;
  outboundBreakdown: SyncQueueBreakdownRow[];
  inboundBreakdown: SyncQueueBreakdownRow[];
  terminalName?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

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
  if (preview.isKasa) {
    return formatBreakdown(preview.inboundBreakdown, Math.max(0, preview.inboundPending));
  }
  if (preview.inboundQueueAvailable) {
    return `${preview.inboundPending} kuyruk kaydı`;
  }
  const master = formatMasterCounts(preview.remoteMaster.tables);
  return `Kuyruk erişilemiyor · Merkezde: ${master}`;
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
    remote: REMOTE_CONFIG,
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

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const kasaCtx = await resolveKasaPullContext(user?.store_id || null);
      const isKasa = !!kasaCtx;
      const outboundFilter = buildSyncFilter({
        storeId: user?.store_id || null,
        userId: null,
        cashierUsername: null,
        scopeCashierOnly: false,
      });
      const inboundFilter = kasaCtx ? buildKasaInboundFilter(kasaCtx) : outboundFilter;

      const outboundStats = await getBranchSyncStats(outboundFilter);
      const inboundStats = isKasa ? await getBranchSyncStats(inboundFilter) : outboundStats;
      const remoteMaster = await getRemoteMasterSnapshot(ERP_SETTINGS.firmNr);
      const outboundBreakdown = await getPendingQueueBreakdown(LOCAL_CONFIG, outboundFilter);

      let inboundBreakdown: SyncQueueBreakdownRow[] = [];
      const inboundQueueAvailable = isKasa
        ? inboundStats.remotePending >= 0
        : outboundStats.remotePending >= 0;
      const inboundPending = isKasa
        ? inboundStats.remotePending >= 0
          ? inboundStats.remotePending
          : -1
        : outboundStats.remotePending >= 0
          ? outboundStats.remotePending
          : -1;

      if (isKasa && kasaCtx) {
        try {
          const { remote } = buildSyncEndpoints({
            local: LOCAL_CONFIG,
            remote: REMOTE_CONFIG,
            connectionProvider: resolveHybridSyncConnectionProvider(),
            remoteRestUrl: DB_SETTINGS.remoteRestUrl,
          });
          inboundBreakdown = await getPendingQueueBreakdownEndpoint(remote, inboundFilter);
        } catch {
          /* merkez kırılım alınamadı */
        }
      }

      setPreview({
        isKasa,
        localPending: outboundStats.localPending,
        inboundPending,
        inboundQueueAvailable,
        remoteMaster,
        outboundBreakdown,
        inboundBreakdown,
        terminalName: kasaCtx?.terminalName,
      });

      setSteps([
        {
          id: 'send',
          title: 'Yerelden merkeze gönder',
          description: formatBreakdown(outboundBreakdown, outboundStats.localPending),
          status: 'pending',
        },
        {
          id: 'receive',
          title: isKasa ? 'Merkezden kasa verisi al' : 'Merkezden yerel al',
          description: formatInboundPreview({
            isKasa,
            localPending: outboundStats.localPending,
            inboundPending,
            inboundQueueAvailable,
            remoteMaster,
            outboundBreakdown,
            inboundBreakdown,
            terminalName: kasaCtx?.terminalName,
          }),
          status: 'pending',
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

    const kasaCtx = preview.isKasa ? await resolveKasaPullContext(user?.store_id || null) : null;
    const filter = buildSyncFilter({
      storeId: user?.store_id || null,
      userId: null,
      cashierUsername: null,
      scopeCashierOnly: false,
    });
    const deviceId = await getHybridDeviceId();

    try {
      updateStep('send', { status: 'running', detail: 'Gönderiliyor…' });
      const sendResult = await runHybridSync({
        flow: 'send',
        direction: 'local_to_remote',
        scope: 'all',
        filter,
        local: LOCAL_CONFIG,
        remote: REMOTE_CONFIG,
        connectionProvider: resolveHybridSyncConnectionProvider(),
        remoteRestUrl: DB_SETTINGS.remoteRestUrl,
        incremental: true,
        deviceId,
        storeId: user?.store_id || null,
      });

      if (!sendResult.success && sendResult.failed > 0 && sendResult.totalSynced === 0) {
        updateStep('send', {
          status: 'error',
          detail: sendResult.message || 'Gönderim başarısız.',
        });
      } else if (sendResult.totalSynced === 0 && sendResult.failed === 0) {
        updateStep('send', { status: 'skipped', detail: 'Gönderilecek kayıt yok.' });
      } else {
        const verifyMsg = await verifySentDataOnRemote(preview.outboundBreakdown);
        updateStep('send', {
          status: 'done',
          detail:
            (formatHybridSyncMessage(sendResult) ||
              `${sendResult.totalSynced} kayıt gönderildi` +
                (sendResult.failed > 0 ? ` · ${sendResult.failed} hata` : '')) +
            (verifyMsg ? ` · ${verifyMsg}` : ''),
        });
      }

      updateStep('receive', { status: 'running', detail: 'Alınıyor…' });

      if (kasaCtx) {
        const pull = await pullInboundMasterNow(kasaCtx, { notifySource: 'manual', silent: true });
        if (pull.failed > 0 && pull.synced === 0) {
          updateStep('receive', {
            status: 'error',
            detail: pull.message || 'Veri alımı başarısız.',
          });
        } else if (pull.synced === 0 && pull.failed === 0) {
          updateStep('receive', { status: 'skipped', detail: 'Alınacak kayıt yok.' });
        } else {
          updateStep('receive', {
            status: 'done',
            detail:
              formatKasaSyncBreakdown(pull) ||
              `${pull.synced} kayıt alındı` + (pull.failed > 0 ? ` · ${pull.failed} hata` : ''),
          });
        }
      } else {
        const recvResult = await runHybridSync({
          flow: 'receive',
          direction: 'remote_to_local',
          scope: 'all',
          filter,
          local: LOCAL_CONFIG,
          remote: REMOTE_CONFIG,
          connectionProvider: resolveHybridSyncConnectionProvider(),
          remoteRestUrl: DB_SETTINGS.remoteRestUrl,
          incremental: true,
          deviceId,
          storeId: user?.store_id || null,
        });

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
    <FullscreenBodyPortal
      zIndex={MODAL_OVERLAY_Z}
      className="overflow-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hybrid-sync-title"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(90vh,100dvh)] flex flex-col bg-white text-gray-900 shadow-2xl min-h-0 overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b flex items-center shrink-0 border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2 text-white">
            <RefreshCw className="h-5 w-5" />
            <div>
              <h3 id="hybrid-sync-title" className="text-base font-bold">Veri senkronu</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                {preview?.isKasa
                  ? 'Yerel → merkez, ardından merkezden master veri'
                  : 'Şube: çift yönlü veri aktarımı'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4">
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
                <p className="text-lg font-bold text-gray-900 tabular-nums">{preview.localPending}</p>
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
                  {preview.isKasa
                    ? formatBreakdown(preview.inboundBreakdown, Math.max(0, preview.inboundPending))
                    : preview.inboundQueueAvailable
                      ? `${preview.inboundPending} merkez kuyruk kaydı`
                      : formatMasterCounts(preview.remoteMaster.tables)}
                </p>
                {!preview.inboundQueueAvailable ? (
                  <p className="text-[10px] text-amber-800 leading-snug">
                    Merkez sync_queue PostgREST&apos;te yok; tablo sayıları API ile okunur.
                  </p>
                ) : null}
              </div>
            </div>

            {preview.isKasa && preview.terminalName ? (
              <p className="text-xs text-gray-600">
                Hedef kasa: <strong className="text-gray-900">{preview.terminalName}</strong>
              </p>
            ) : null}

            <CenterDeviceSyncMonitor compact hours={168} />

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
                            'text-xs mt-1 leading-snug',
                            step.status === 'error' ? 'text-red-700 font-medium' : 'text-gray-800',
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
        </div>

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
      </div>
    </FullscreenBodyPortal>
  );
}
