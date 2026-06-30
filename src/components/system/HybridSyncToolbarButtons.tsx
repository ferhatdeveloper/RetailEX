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
    hint: 'WebSocket anlık çekim + arka plan periyodik senkron (önerilen)',
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
          'Kiracı PostgREST URL (ör. /lovan) ve api_gateway WS yolunu kontrol edin.',
        duration: 12000,
      });
    }
  };

  const totalBadge = Math.max(0, pending) + Math.max(0, inboundPending);
  const hasError = inboundPending < 0;
  const audit = isHybrid ? auditSyncTransportConfig() : null;
  const configIssue = audit?.issues.some((i) => i.severity === 'error') ?? false;

  const shellClass = cn(
    'flex items-center shrink-0',
    compact ? 'gap-0.5' : 'gap-1',
  );

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

  const wsDotClass =
    wsStatus === 'connected'
      ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]'
      : wsStatus === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : configIssue
          ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]'
          : 'bg-slate-400/90';

  if (!isHybrid) {
    return (
      <div className={shellClass} title="Senkron yalnızca hibrit modda — Kurulumda db_mode=hybrid seçin">
        <button
          type="button"
          disabled
          className={btnClass}
          title="Hibrit mod gerekli — Kurulum → Veritabanı → Hibrit"
        >
          <RefreshCw className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'opacity-60')} />
          <span className={labelClass}>Senkron</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={shellClass}>
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

        {/* Taşıma modu seçici */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            title="Senkron taşıma modu (WebSocket / Periyodik)"
            onClick={() => setTransportMenuOpen((o) => !o)}
            className={cn(btnClass, 'gap-0.5')}
          >
            {transport === 'polling' ? (
              <RefreshCw className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            ) : (
              <Radio className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            )}
            <span className={cn(labelClass, 'max-w-[4.5rem] truncate')}>
              {formatSyncTransportLabel(transport)}
            </span>
            <ChevronDown className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3', 'opacity-70')} />
          </button>
          {transportMenuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+4px)] z-[20060] w-56 overflow-hidden rounded-xl border border-white/20 bg-blue-800 py-1 text-xs shadow-2xl"
              role="menu"
            >
              {TRANSPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-white/10',
                    transport === opt.value && 'bg-white/15',
                  )}
                  onClick={() => void handleTransportChange(opt.value)}
                >
                  <span className="font-bold text-white">{opt.label}</span>
                  <span className="text-[10px] leading-snug text-blue-100/90">{opt.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manuel senkron */}
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

        {/* WebSocket durumu — tıklayınca tanılama */}
        {(transport === 'websocket' || transport === 'both') && (
          <button
            type="button"
            onClick={showWsDiagnostics}
            title={
              wsStatus === 'connected'
                ? 'WebSocket bağlı — tanılama için tıklayın'
                : 'WebSocket yok — tanılama ve çözüm için tıklayın (F12 konsol)'
            }
            className={cn(
              btnClass,
              'min-w-0 px-1.5',
              wsStatus !== 'connected' && configIssue && 'border-red-300/40',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', wsDotClass)} />
            {wsStatus === 'connected' ? (
              <Wifi className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5', 'opacity-90')} />
            ) : (
              <WifiOff className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5', 'opacity-80')} />
            )}
          </button>
        )}
      </div>

      <HybridSyncModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onComplete={() => void refreshPending()}
      />
    </>
  );
}
