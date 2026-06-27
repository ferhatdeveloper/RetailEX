import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import {
  DB_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  resolveHybridSyncConnectionProvider,
} from '../../services/postgres';
import { runHybridSync } from '../../services/hybridSyncEngine';
import { buildSyncFilter, buildKasaInboundFilter, getBranchSyncStats } from '../../services/hybridSyncService';
import {
  pullInboundMasterNow,
  resolveKasaPullContext,
} from '../../services/mposKasaAutoPullService';
import {
  getLastKasaDataArrival,
  subscribeKasaDataArrival,
  type KasaDataArrivalState,
} from '../../services/kasaDataArrivalNotify';
import { cn } from '../ui/utils';

type Props = {
  /** Mobil üst çubuk — daha küçük düğmeler */
  compact?: boolean;
};

export function HybridSyncToolbarButtons({ compact = false }: Props) {
  const { user } = useAuth();
  const isHybrid = DB_SETTINGS.activeMode === 'hybrid';
  const [loading, setLoading] = useState<'send' | 'receive' | null>(null);
  const [pending, setPending] = useState(0);
  const [inboundPending, setInboundPending] = useState(0);
  const [isKasa, setIsKasa] = useState(false);
  const [lastArrival, setLastArrival] = useState<KasaDataArrivalState | null>(() =>
    getLastKasaDataArrival(),
  );

  useEffect(() => subscribeKasaDataArrival(setLastArrival), []);

  const refreshPending = useCallback(async () => {
    if (!isHybrid) return;
    try {
      const kasaCtx = await resolveKasaPullContext(user?.store_id || null);
      setIsKasa(!!kasaCtx);
      const filter = kasaCtx
        ? buildKasaInboundFilter(kasaCtx)
        : buildSyncFilter({
            storeId: user?.store_id || null,
            userId: null,
            cashierUsername: null,
            scopeCashierOnly: false,
          });
      const stats = await getBranchSyncStats(filter);
      if (kasaCtx) {
        setInboundPending(stats.remotePending >= 0 ? stats.remotePending : -1);
        setPending(stats.localPending);
      } else {
        setInboundPending(0);
        setPending(stats.localPending);
      }
    } catch {
      /* PG hazır değil */
    }
  }, [isHybrid, user?.store_id]);

  useEffect(() => {
    void refreshPending();
    const t = window.setInterval(() => void refreshPending(), 20_000);
    return () => window.clearInterval(t);
  }, [refreshPending]);

  const run = async (flow: 'send' | 'receive') => {
    if (!isHybrid) {
      toast.error('Hibrit mod aktif değil.');
      return;
    }
    setLoading(flow);
    try {
      const kasaCtx = await resolveKasaPullContext(user?.store_id || null);

      if (flow === 'receive' && kasaCtx) {
        const result = await pullInboundMasterNow(kasaCtx, { notifySource: 'manual' });
        if (result.failed > 0 && result.synced === 0) {
          /* notify pullInboundMasterNow içinde */
        } else if (result.synced === 0 && result.failed === 0) {
          toast.info('Merkezden bekleyen kasa verisi yok.', { position: 'bottom-center' });
        }
        setInboundPending(result.pending_inbound);
        await refreshPending();
        return;
      }

      const filter = buildSyncFilter({
        storeId: user?.store_id || null,
        userId: null,
        cashierUsername: null,
        scopeCashierOnly: false,
      });

      const result = await runHybridSync({
        flow,
        direction: flow === 'send' ? 'local_to_remote' : 'remote_to_local',
        scope: 'all',
        filter,
        local: LOCAL_CONFIG,
        remote: REMOTE_CONFIG,
        connectionProvider: resolveHybridSyncConnectionProvider(),
        remoteRestUrl: DB_SETTINGS.remoteRestUrl,
      });

      if (!result.success) {
        toast.error(result.message || 'Senkron başarısız.');
      } else if (result.totalSynced > 0) {
        toast.success(result.message || 'Senkron tamamlandı.');
      } else {
        toast.info(result.message || 'Eşlenecek kayıt yok.');
      }
      await refreshPending();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  if (!isHybrid) return null;

  const btnClass = cn(
    'relative flex items-center justify-center rounded-xl border border-white/20 bg-white/12 hover:bg-white/22 active:scale-95 transition-colors touch-manipulation disabled:opacity-50',
    compact ? 'h-8 min-w-[2.25rem] px-1.5 gap-0.5' : 'h-9 min-w-[2.75rem] px-2 gap-1',
  );

  const labelClass = compact
    ? 'hidden'
    : 'hidden lg:inline text-[10px] font-black uppercase tracking-wide';

  return (
    <div className={cn('flex items-center shrink-0', compact ? 'gap-0.5' : 'gap-1')}>
      {isKasa && lastArrival && lastArrival.synced > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 font-bold uppercase tracking-wide',
            compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]',
          )}
          title={`Son alım: ${new Date(lastArrival.at).toLocaleString('tr-TR')} · ${lastArrival.synced} kayıt`}
        >
          <CheckCircle2 className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          <span className={compact ? 'hidden sm:inline' : ''}>Veri alındı</span>
        </span>
      )}
      <button
        type="button"
        title="Yerelden merkeze gönder"
        disabled={loading !== null}
        onClick={() => void run('send')}
        className={btnClass}
      >
        {loading === 'send' ? (
          <Loader2 className={cn('animate-spin', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        ) : (
          <ArrowUpFromLine className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        )}
        <span className={labelClass}>Gönder</span>
        {pending > 0 && loading === null && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-400 text-[9px] font-black text-blue-950 leading-[14px] text-center">
            {pending > 99 ? '99+' : pending}
          </span>
        )}
      </button>
      <button
        type="button"
        title={isKasa ? 'Merkezden kasa verisi al (otomatik)' : 'Merkezden yerel al'}
        disabled={loading !== null}
        onClick={() => void run('receive')}
        className={btnClass}
      >
        {loading === 'receive' ? (
          <Loader2 className={cn('animate-spin', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        ) : (
          <ArrowDownToLine className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        )}
        <span className={labelClass}>Al</span>
        {inboundPending > 0 && loading === null && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-400 text-[9px] font-black text-blue-950 leading-[14px] text-center">
            {inboundPending > 99 ? '99+' : inboundPending}
          </span>
        )}
        {inboundPending < 0 && loading === null && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-400 text-[9px] font-black text-white leading-[14px] text-center">
            !
          </span>
        )}
      </button>
    </div>
  );
}
