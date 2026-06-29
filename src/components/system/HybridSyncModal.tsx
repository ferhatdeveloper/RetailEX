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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import {
  DB_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  resolveHybridSyncConnectionProvider,
} from '../../services/postgres';
import {
  buildSyncEndpoints,
  getPendingQueueBreakdown,
  getPendingQueueBreakdownEndpoint,
  runHybridSync,
  type SyncQueueBreakdownRow,
} from '../../services/hybridSyncEngine';
import {
  buildKasaInboundFilter,
  buildSyncFilter,
  getBranchSyncStats,
} from '../../services/hybridSyncService';
import {
  pullInboundMasterNow,
  resolveKasaPullContext,
} from '../../services/mposKasaAutoPullService';
import { formatSyncBreakdown } from '../../services/kasaDataArrivalNotify';

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
  const top = rows.slice(0, 4).map((r) => `${tableLabel(r.tableName)} (${r.count})`);
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
      const outboundBreakdown = await getPendingQueueBreakdown(LOCAL_CONFIG, outboundFilter);

      let inboundBreakdown: SyncQueueBreakdownRow[] = [];
      const inboundPending = isKasa
        ? inboundStats.remotePending >= 0
          ? inboundStats.remotePending
          : -1
        : outboundStats.remotePending >= 0
          ? outboundStats.remotePending
          : 0;

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
          description: isKasa
            ? formatBreakdown(inboundBreakdown, Math.max(0, inboundPending))
            : `${Math.max(0, inboundPending)} kayıt`,
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
      });

      if (!sendResult.success && sendResult.failed > 0 && sendResult.totalSynced === 0) {
        updateStep('send', {
          status: 'error',
          detail: sendResult.message || 'Gönderim başarısız.',
        });
      } else if (sendResult.totalSynced === 0 && sendResult.failed === 0) {
        updateStep('send', { status: 'skipped', detail: 'Gönderilecek kayıt yok.' });
      } else {
        updateStep('send', {
          status: 'done',
          detail:
            formatSyncBreakdown(sendResult) ||
            `${sendResult.totalSynced} kayıt gönderildi` +
              (sendResult.failed > 0 ? ` · ${sendResult.failed} hata` : ''),
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
              formatSyncBreakdown(pull) ||
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
        });

        if (!recvResult.success && recvResult.failed > 0 && recvResult.totalSynced === 0) {
          updateStep('receive', {
            status: 'error',
            detail: recvResult.message || 'Alım başarısız.',
          });
        } else if (recvResult.totalSynced === 0 && recvResult.failed === 0) {
          updateStep('receive', { status: 'skipped', detail: 'Alınacak kayıt yok.' });
        } else {
          updateStep('receive', {
            status: 'done',
            detail:
              formatSyncBreakdown(recvResult) ||
              `${recvResult.totalSynced} kayıt alındı` +
                (recvResult.failed > 0 ? ` · ${recvResult.failed} hata` : ''),
          });
        }
      }

      setFinished(true);
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

  const handleClose = () => {
    if (running) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            Veri senkronu
          </DialogTitle>
          <DialogDescription>
            {preview?.isKasa
              ? 'Kasa: önce yerel veriler merkeze gider, ardından merkezden master veri alınır.'
              : 'Şube: yerel ve merkez arasında çift yönlü veri aktarımı.'}
          </DialogDescription>
        </DialogHeader>

        {loadingPreview ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Özet hazırlanıyor…
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Gönderilecek
                </div>
                <p className="text-lg font-bold">{preview.localPending}</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {formatBreakdown(preview.outboundBreakdown, preview.localPending)}
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Alınacak
                </div>
                <p className="text-lg font-bold">
                  {preview.inboundPending >= 0 ? preview.inboundPending : '—'}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {preview.isKasa
                    ? formatBreakdown(preview.inboundBreakdown, Math.max(0, preview.inboundPending))
                    : preview.inboundPending >= 0
                      ? `${preview.inboundPending} merkez kaydı`
                      : 'Merkez bağlantısı kontrol edilemedi'}
                </p>
              </div>
            </div>

            {preview.isKasa && preview.terminalName ? (
              <p className="text-xs text-muted-foreground">
                Hedef kasa: <strong>{preview.terminalName}</strong>
              </p>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Aktarım adımları
              </p>
              <ol className="space-y-2">
                {steps.map((step, idx) => (
                  <li
                    key={step.id}
                    className={cn(
                      'flex gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      step.status === 'running' && 'border-blue-300 bg-blue-50/60 dark:bg-blue-950/30',
                      step.status === 'done' && 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20',
                      step.status === 'error' && 'border-red-200 bg-red-50/40 dark:bg-red-950/20',
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{stepIcon(step.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {idx + 1}. {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      {step.detail ? (
                        <p
                          className={cn(
                            'text-xs mt-1',
                            step.status === 'error' ? 'text-red-600' : 'text-foreground/80',
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
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Bekleyen kayıt görünmüyor; yine de senkron çalıştırılabilir.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Özet yüklenemedi. Hibrit mod ve bağlantıyı kontrol edin.</p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={running} onClick={handleClose}>
            {finished ? 'Kapat' : 'Vazgeç'}
          </Button>
          {!finished ? (
            <Button
              type="button"
              disabled={running || loadingPreview || !preview}
              onClick={() => void runSync()}
              className="gap-2"
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
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void loadPreview()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Yenile
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
