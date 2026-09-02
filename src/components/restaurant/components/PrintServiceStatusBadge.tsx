import React from 'react';
import { Server, ShieldCheck, ShieldAlert, RefreshCcw } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

type ProbeState =
    | 'idle'
    | 'checking'
    | 'reachable'
    | 'unreachable';

/**
 * Windows yazıcı servisi (RetailEX_Print_Server) durum rozeti.
 *
 * - Restoran modülünün en üstünde küçük bir rozet olarak görünür.
 * - Kaynak: kullanıcının `printViaWindowsService` tercihi + tarayıcıdan yapılan
 *   hafif bir health probe (mgmt API'si /healthz benzeri bir uç).
 * - Probe başarısız olursa veya tercih kapalıysa "KAPALI" gösterir.
 *   Mobilde WebView dışı native bir köprü olmadığı için sadece tercih rozeti
 *   gösterilir (probe atlanır).
 */
export const PrintServiceStatusBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const tm = useRestaurantModuleTm();
    const printViaWindowsService = useRestaurantStore((s) => s.printViaWindowsService);

    const [probe, setProbe] = React.useState<ProbeState>('idle');
    const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!printViaWindowsService) {
            setProbe('idle');
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        const run = async () => {
            setProbe('checking');
            try {
                // Hafif bir HEAD/GET denemesi — pg_bridge'in zaten açık
                // olduğu varsayımıyla 1.5s timeout. Başarısız olursa
                // "unreachable" düşer.
                const res = await fetch('/api/healthz', {
                    method: 'HEAD',
                    signal: controller.signal,
                    cache: 'no-store',
                }).catch(() => null);
                if (cancelled) return;
                if (res && res.ok) {
                    setProbe('reachable');
                } else {
                    setProbe('unreachable');
                }
                setLastCheckedAt(Date.now());
            } catch {
                if (!cancelled) {
                    setProbe('unreachable');
                    setLastCheckedAt(Date.now());
                }
            }
        };

        // İlk açılışta bir kez probe et, kullanıcı manüel olarak
        // tazeleyebilsin.
        void run();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [printViaWindowsService]);

    const handleRefresh = React.useCallback(() => {
        // Manuel yeniden kontrol — flag açıksa probe'u yeniden tetikle
        if (!printViaWindowsService) return;
        setProbe('checking');
        setLastCheckedAt(null);
        // useEffect bağımlılığı aynı olduğu için manuel olarak yeniden fetch tetikleyelim
        void (async () => {
            try {
                const res = await fetch('/api/healthz', { method: 'HEAD', cache: 'no-store' }).catch(() => null);
                setProbe(res && res.ok ? 'reachable' : 'unreachable');
                setLastCheckedAt(Date.now());
            } catch {
                setProbe('unreachable');
                setLastCheckedAt(Date.now());
            }
        })();
    }, [printViaWindowsService]);

    if (!printViaWindowsService) {
        return (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
                <ShieldAlert className="h-4 w-4 text-slate-400" aria-hidden />
                <span className="uppercase tracking-wider text-slate-500">
                    {tm('restPrintServiceLabel')}
                </span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {tm('restPrintServiceOff')}
                </span>
            </div>
        );
    }

    const isChecking = probe === 'checking';
    const isReachable = probe === 'reachable';

    return (
        <div
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                isChecking && 'border-amber-200 bg-amber-50 text-amber-800',
                isReachable && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                probe === 'unreachable' && 'border-red-200 bg-red-50 text-red-800',
                probe === 'idle' && 'border-indigo-200 bg-indigo-50 text-indigo-800',
            )}
            title={
                lastCheckedAt
                    ? new Date(lastCheckedAt).toLocaleString()
                    : undefined
            }
        >
            {isChecking ? (
                <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden />
            ) : isReachable ? (
                <ShieldCheck className="h-4 w-4" aria-hidden />
            ) : probe === 'unreachable' ? (
                <ShieldAlert className="h-4 w-4" aria-hidden />
            ) : (
                <Server className="h-4 w-4" aria-hidden />
            )}
            <span className="uppercase tracking-wider">
                {tm('restPrintServiceLabel')}
            </span>
            <span
                className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest',
                    isChecking && 'bg-amber-200 text-amber-900',
                    isReachable && 'bg-emerald-200 text-emerald-900',
                    probe === 'unreachable' && 'bg-red-200 text-red-900',
                    probe === 'idle' && 'bg-indigo-200 text-indigo-900',
                )}
            >
                {isChecking
                    ? tm('restPrintServiceChecking')
                    : isReachable
                      ? tm('restPrintServiceOn')
                      : probe === 'unreachable'
                        ? tm('restPrintServiceOff')
                        : tm('restPrintServiceOn')}
            </span>
            <button
                type="button"
                onClick={handleRefresh}
                className="ml-1 rounded-full p-1 text-current/70 transition-colors hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-current/30"
                aria-label={tm('restPrintServiceChecking')}
                title={tm('restPrintServiceChecking')}
            >
                <RefreshCcw className={cn('h-3.5 w-3.5', isChecking && 'animate-spin')} aria-hidden />
            </button>
        </div>
    );
};

export default PrintServiceStatusBadge;
