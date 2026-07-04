import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { DB_SETTINGS, type HybridSyncTransport } from '../../services/postgres';
import { buildSyncFilter, buildKasaInboundFilter, getBranchSyncStats } from '../../services/hybridSyncService';
import {
  applyHybridAutoSyncSettings,
  resolveKasaPullContext,
} from '../../services/mposKasaAutoPullService';
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
import { FULLSCREEN_BODY_PORTAL_Z } from '../shared/FullscreenBodyPortal';
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

type WsConnectionStatus = 'connected' | 'disconnected' | 'connecting';

function WsLiveIndicator({ status, compact }: { status: WsConnectionStatus; compact: boolean }) {
  const title =
    status === 'connected'
      ? 'Merkez WebSocket bağlı'
      : status === 'connecting'
        ? 'WebSocket bağlanıyor…'
        : 'WebSocket bağlı değil';

  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      title={title}
      role="status"
      aria-label={title}
    >
      {status === 'connected' ? (
        <>
          <span
            className={cn(
              'absolute rounded-full bg-emerald-400/40 animate-ping',
              compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
            )}
          />
          <span
            className={cn(
              'relative rounded-full bg-emerald-400 ring-2 ring-emerald-200/90 shadow-[0_0_8px_rgba(52,211,153,0.95)]',
              compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
            )}
          />
        </>
      ) : status === 'connecting' ? (
        <span
          className={cn(
            'rounded-full bg-amber-400 animate-pulse ring-2 ring-amber-200/80',
            compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
          )}
        />
      ) : (
        <span
          className={cn(
            'rounded-full bg-slate-300 ring-1 ring-white/40',
            compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
          )}
        />
      )}
    </span>
  );
}

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
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
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setTransportMenuOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [transportMenuOpen]);

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!transportMenuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [transportMenuOpen, updateMenuPosition]);

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
    await applyHybridAutoSyncSettings({
      transport: next,
      userId: user?.id ?? null,
      storeId: user?.store_id ?? null,
    });
    logSyncTransportDiagnostics('TransportChange');
    toast.success(`Senkron modu: ${formatSyncTransportLabel(next)}`);
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

  const wsStatusLabel =
    wsStatus === 'connected' ? 'Bağlı' : wsStatus === 'connecting' ? 'Bağlanıyor…' : 'Kapalı';

  const wsStatusBadgeClass =
    wsStatus === 'connected'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : wsStatus === 'connecting'
        ? 'bg-amber-50 text-amber-900 border-amber-200'
        : 'bg-gray-100 text-gray-700 border-gray-200';

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
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            title="Senkron taşıma modu ve bağlantı durumu"
            onClick={() => setTransportMenuOpen((o) => !o)}
            className={cn(btnClass, 'gap-1 pr-1.5')}
          >
            {wsActive ? <WsLiveIndicator status={wsStatus} compact={compact} /> : null}
            {transport === 'polling' ? (
              <RefreshCw className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5', 'opacity-90')} />
            ) : (
              <Radio className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5', 'opacity-90')} />
            )}
            <span className={cn(labelClass, 'max-w-[5.5rem] truncate')}>
              {formatSyncTransportLabel(transport)}
            </span>
            <ChevronDown className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3', 'opacity-70')} />
          </button>

          {transportMenuOpen &&
            menuPos &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={dropdownRef}
                className="w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-2xl"
                style={{
                  position: 'fixed',
                  top: menuPos.top,
                  right: menuPos.right,
                  zIndex: FULLSCREEN_BODY_PORTAL_Z,
                }}
                role="menu"
              >
                <div className="border-b border-gray-200 bg-gray-50 px-3 py-2.5 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                    Senkron durumu
                  </p>
                  {wsActive && (
                    <button
                      type="button"
                      onClick={showWsDiagnostics}
                      className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left hover:bg-gray-50"
                    >
                      <WsLiveIndicator status={wsStatus} compact={false} />
                      {wsStatus === 'connected' ? (
                        <Wifi className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-gray-900">
                        WebSocket: {wsStatusLabel}
                      </span>
                      <span
                        className={cn(
                          'ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          wsStatusBadgeClass,
                        )}
                      >
                        {wsStatus === 'connected' ? 'Canlı' : wsStatus === 'connecting' ? '…' : 'Kapalı'}
                      </span>
                    </button>
                  )}
                  {configIssue ? (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Yapılandırma uyarısı — F12 konsolunda ayrıntı.
                    </p>
                  ) : null}
                  <p className="text-[11px] text-gray-700">
                    Gönderilecek: <strong className="text-gray-900">{pending}</strong>
                    {isKasa ? (
                      <>
                        {' '}
                        · Alınacak:{' '}
                        <strong className="text-gray-900">
                          {inboundPending >= 0 ? inboundPending : '—'}
                        </strong>
                      </>
                    ) : null}
                  </p>
                  {isKasa && lastArrival && lastArrival.inserted + lastArrival.updated > 0 ? (
                    <p className="flex items-center gap-1 text-[10px] text-emerald-700">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      Son alım: {new Date(lastArrival.at).toLocaleString('tr-TR')}
                    </p>
                  ) : null}
                </div>

                <div className="py-1 bg-white">
                  {TRANSPORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitem"
                      className={cn(
                        'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-blue-50',
                        transport === opt.value && 'bg-blue-50/80',
                      )}
                      onClick={() => void handleTransportChange(opt.value)}
                    >
                      <span className="text-xs font-bold text-gray-900">{opt.label}</span>
                      <span className="text-[10px] leading-snug text-gray-600">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>,
              document.body,
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
