import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { DB_SETTINGS } from '../../services/postgres';
import { buildSyncFilter, buildKasaInboundFilter, getBranchSyncStats } from '../../services/hybridSyncService';
import { resolveKasaPullContext } from '../../services/mposKasaAutoPullService';
import {
  getLastKasaDataArrival,
  subscribeKasaDataArrival,
  formatSyncBreakdown,
  type KasaDataArrivalState,
} from '../../services/kasaDataArrivalNotify';
import { cn } from '../ui/utils';
import { HybridSyncModal } from './HybridSyncModal';

type Props = {
  /** Mobil üst çubuk — daha küçük düğme */
  compact?: boolean;
};

export function HybridSyncToolbarButtons({ compact = false }: Props) {
  const { user } = useAuth();
  const isHybrid = DB_SETTINGS.activeMode === 'hybrid';
  const [modalOpen, setModalOpen] = useState(false);
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

  if (!isHybrid) return null;

  const totalBadge = Math.max(0, pending) + Math.max(0, inboundPending);
  const hasError = inboundPending < 0;

  const btnClass = cn(
    'relative flex items-center justify-center rounded-xl border border-white/20 bg-white/12 hover:bg-white/22 active:scale-95 transition-colors touch-manipulation',
    compact ? 'h-8 min-w-[2.25rem] px-1.5 gap-1' : 'h-9 min-w-[2.75rem] px-2 gap-1.5',
  );

  const labelClass = compact
    ? 'hidden'
    : 'hidden lg:inline text-[10px] font-black uppercase tracking-wide';

  return (
    <>
      <div className={cn('flex items-center shrink-0', compact ? 'gap-0.5' : 'gap-1')}>
        {isKasa && lastArrival && lastArrival.inserted + lastArrival.updated > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 font-bold uppercase tracking-wide',
              compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]',
            )}
            title={`Son alım: ${new Date(lastArrival.at).toLocaleString('tr-TR')} · ${formatSyncBreakdown(lastArrival)}`}
          >
            <CheckCircle2 className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            <span className={compact ? 'hidden sm:inline' : ''}>Veri alındı</span>
          </span>
        )}
        <button
          type="button"
          title="Veri senkronu — özet ve adım adım aktarım"
          onClick={() => setModalOpen(true)}
          className={btnClass}
        >
          <RefreshCw className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          <span className={labelClass}>Senkron</span>
          {(totalBadge > 0 || hasError) && (
            <span
              className={cn(
                'absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-black leading-[14px] text-center',
                hasError ? 'bg-red-400 text-white' : 'bg-amber-400 text-blue-950',
              )}
            >
              {hasError ? '!' : totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </button>
      </div>

      <HybridSyncModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onComplete={() => void refreshPending()}
      />
    </>
  );
}
