import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { DB_SETTINGS, updateConfigs, type HybridSyncTransport } from '../../services/postgres';
import { buildSyncFilter, buildKasaInboundFilter, getBranchSyncStats } from '../../services/hybridSyncService';
import { resolveKasaPullContext } from '../../services/mposKasaAutoPullService';
import {
  getLastKasaDataArrival,
  subscribeKasaDataArrival,
  formatSyncBreakdown,
  type KasaDataArrivalState,
} from '../../services/kasaDataArrivalNotify';
import {
  auditSyncTransportConfig,
  formatSyncTransportLabel,
  logSyncTransportDiagnostics,
} from '../../services/syncTransportDiagnostics';
import { wsService } from '../../services/websocket';
import { cn } from '../ui/utils';
import { HybridSyncModal } from './HybridSyncModal';

type Props = {
  /** Mobil üst çubuk — daha küçük düğme */
  compact?: boolean;
};

const TRANSPORT_OPTIONS: { value: HybridSyncTransport; label: string; hint: string }[] = [
  {
    value: 'both',
    label: 'WS + Periyodik',
    hint: 'WebSocket anlık + arka plan periyodik (önerilen)',
  },
  {
    value: 'websocket',
    label: 'Yalnız WebSocket',
    hint: 'Anlık merkez bildirimi; periyodik timer kapalı',
  },
  {
    value: 'polling',
    label: 'Yalnız Periyodik',
    hint: 'Belirli aralıkla sync_queue; WebSocket gerekmez',
  },
];

export function HybridSyncToolbarButtons({ compact = false }: Props) {
  const { user } = useAuth();
  const isHybrid = DB_SETTINGS.activeMode === 'hybrid';
  const [modalOpen, setModalOpen] = useState(false);
  const [transportMenuOpen, setTransportMenuOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [inboundPending, setInboundPending] = useState(0);
  const [isKasa, setIsKasa] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>(() =>
    wsService.getStatus(),
  );
  const [transport, setTransport] = useState<HybridSyncTransport>(DB_SETTINGS.hybridSyncTransport);
  const menuRef = useRef<HTMLDivElement>(null);
  const [lastArrival, setLastArrival] = useState<KasaDataArrivalState | null>(() =>
    getLastKasaDataArrival(),
  );

  useEffect(() => subscribeKasaDataArrival(setLastArrival), []);

  useEffect(() => {
    setTransport(DB_SETTINGS.hybridSyncTransport);
  }, [DB_SETTINGS.hybridSyncTransport, DB_SETTINGS.activeMode]);

  useEffect(() => {
    const id = window.setInterval(() => setWsStatus(wsService.getStatus()), 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!transportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTransportMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [transportMenuOpen]);

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

  useEffect(() => {
    if (isHybrid) {
      logSyncTransportDiagnostics('ToolbarMount');
    }
  }, [isHybrid]);

  const handleTransportChange = async (next: HybridSyncTransport) => {
    setTransportMenuOpen(false);
    setTransport(next);
    await updateConfigs({ settings: { hybridSyncTransport: next } });
    logSyncTransportDiagnostics('TransportChange');
    toast.success(`Senkron modu: ${formatSyncTransportLabel(next)}`);

    const { stopUnifiedHybridAutoSync, startUnifiedHybridAutoSync } = await import(
      '../../services/mposKasaAutoPullService'
    );
    stopUnifiedHybridAutoSync();
    if (next === 'polling' || next === 'both') {
      startUnifiedHybridAutoSync({ intervalSec: DB_SETTINGS.hybridSyncIntervalSec });
    }

    wsService.disconnect();
    if ((next === 'websocket' || next === 'both') && user?.id) {
      void wsService.connect(user.id, user.store_id || 'default_store').catch(() => {
        logSyncTransportDiagnostics('TransportChangeWsFail');
      });
    }
  };

  const showWsDiagnostics = () => {
    const audit = logSyncTransportDiagnostics('ToolbarDiagnostics');
    const firstErr = audit.issues.find((i) => i.severity === 'error');
    if (firstErr) {
      toast.error(firstErr.message, { description: firstErr.solution, duration: 12000 });
    } else if (wsStatus === 'connected') {
      toast.success('WebSocket bağlı', {
        description: audit.wsUrl || 'Merkez gerçek zamanlı kanal aktif.',
      });
    } else {
      toast.warning('WebSocket bağlı değil', {
        description:
          audit.issues[0]?.solution ||
          'Kiracı PostgREST URL ve api_gateway WS yolunu kontrol edin.',
        duration: 12000,
      });
    }
  };

  const totalBadge = Math.max(0, pending) + Math.max(0, inboundPending);
  const hasError = inboundPending < 0;
  const audit = isHybrid ? auditSyncTransportConfig() : null;
  const configIssue = audit?.issues.some((i) => i.severity === 'error') ?? false;
  const wsActive = transport === 'websocket' || transport === 'both';

  const shellClass = cn('flex items-center shrink-0', compact ? 'gap-0.5' : 'gap-1');

  const btnClass = cn(
    'relative flex items-center justify-center rounded-xl border transition-colors touch-manipulation active:scale-95',
    compact ? 'h-8 min-w-[2.25rem] px-1.5 gap-1' : 'h-9 min-w-[2.75rem] px-2 gap-1.5',
    isHybrid
      ? 'border-white/25 bg-white/15 hover:bg-white/25 text-white'
      : 'border-white/10 bg-white/5 text-blue-200/70 cursor-not-allowed opacity-80',
  );

  const labelClass = compact
    ? 'hidden sm:inline text-[9px] font-black uppercase tracking-wide'
    : 'hidden md:inline text-[10px] font-black uppercase tracking-wide';

  const statusDotClass =
    wsStatus === 'connected'
      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
      : wsStatus === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : configIssue
          ? 'bg-red-400'
          : 'bg-slate-400/90';

  if (!isHybrid) {
    return (
      <div className={shellClass} title="Senkron yalnızca hibrit modda">
        <button type="button" disabled className={btnClass}>
          <RefreshCw className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'opacity-60')} />
          <span className={labelClass}>Senkron</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={shellClass}>
        {/* Taşıma modu + durum — tek dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            title="Senkron taşıma modu ve bağlantı durumu"
            onClick={() => setTransportMenuOpen((o) => !o)}
            className={cn(btnClass, 'gap-1 pr-1.5')}
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', wsActive ? statusDotClass : 'bg-blue-300/80')} />
            {transport === 'polling' ? (
              <RefreshCw className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            ) : (
              <Radio className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            )}
            <span className={cn(labelClass, 'max-w-[5.5rem] truncate')}>
              {formatSyncTransportLabel(transport)}
            </span>
            <ChevronDown className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3', 'opacity-70')} />
          </button>

          {transportMenuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] z-[20060] w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-slate-600 bg-slate-900 text-white shadow-2xl ring-1 ring-black/40"
              role="menu"
            >
              <div className="border-b border-slate-700 bg-slate-800/90 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Senkron durumu</p>
                {wsActive && (
                  <button
                    type="button"
                    onClick={showWsDiagnostics}
                    className="flex w-full items-center gap-2 rounded-lg bg-slate-800 px-2 py-1.5 text-left hover:bg-slate-700"
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', statusDotClass)} />
                    {wsStatus === 'connected' ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className="text-xs font-semibold">
                      WebSocket: {wsStatus === 'connected' ? 'Bağlı' : wsStatus === 'connecting' ? 'Bağlanıyor…' : 'Kapalı'}
                    </span>
                  </button>
                )}
                <p className="text-[11px] text-slate-300">
                  Gönderilecek: <strong className="text-white">{pending}</strong>
                  {isKasa ? (
                    <>
                      {' '}
                      · Alınacak:{' '}
                      <strong className="text-white">{inboundPending >= 0 ? inboundPending : '—'}</strong>
                    </>
                  ) : null}
                </p>
                {isKasa && lastArrival && lastArrival.inserted + lastArrival.updated > 0 ? (
                  <p className="flex items-center gap-1 text-[10px] text-emerald-300">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    Son alım: {new Date(lastArrival.at).toLocaleString('tr-TR')}
                  </p>
                ) : null}
              </div>

              <div className="py-1">
                {TRANSPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitem"
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-slate-800',
                      transport === opt.value && 'bg-slate-800/80',
                    )}
                    onClick={() => void handleTransportChange(opt.value)}
                  >
                    <span className="text-xs font-bold text-white">{opt.label}</span>
                    <span className="text-[10px] leading-snug text-slate-400">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manuel senkron */}
        <button
          type="button"
          title="Veri senkronu"
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
