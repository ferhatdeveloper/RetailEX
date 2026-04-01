import { useEffect, useRef, useState, useCallback } from 'react';
import type { RestaurantCallerIdConfig, RestaurantCallerIdEvent } from '../components/restaurant/types';
import {
    parseCallerIdPollPayload,
    parsePhoneFromCallerIdRawLine,
    resolveCallerIdPollUrl,
} from '../services/restaurantCallerIdService';
import { IS_TAURI } from '../utils/env';

/**
 * Restoran Caller ID: HTTP poll (sanal / yerel köprü) veya Tauri seri port dinleme.
 */
export function useRestaurantCallerId(
    config: RestaurantCallerIdConfig,
    active: boolean
): {
    incomingCall: RestaurantCallerIdEvent | null;
    dismissIncoming: () => void;
    pollError: string | null;
} {
    const [incomingCall, setIncomingCall] = useState<RestaurantCallerIdEvent | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const lastSeenAtRef = useRef<string | null>(null);
    const lastSerialDedupRef = useRef<{ phone: string; at: number } | null>(null);

    const dismissIncoming = useCallback(() => {
        setIncomingCall(null);
    }, []);

    const emitIfNew = useCallback((ev: RestaurantCallerIdEvent, dedupeSerialMs?: number) => {
        if (dedupeSerialMs !== undefined) {
            const now = Date.now();
            const prev = lastSerialDedupRef.current;
            if (prev && prev.phone === ev.phone && now - prev.at < dedupeSerialMs) {
                return;
            }
            lastSerialDedupRef.current = { phone: ev.phone, at: now };
        } else {
            if (lastSeenAtRef.current === ev.receivedAt) return;
            lastSeenAtRef.current = ev.receivedAt;
        }
        setIncomingCall(ev);
    }, []);

    // HTTP poll
    useEffect(() => {
        if (!active || config.mode === 'off' || config.mode === 'physical_serial') {
            if (config.mode !== 'physical_serial') setPollError(null);
            return;
        }

        const url = resolveCallerIdPollUrl(config);
        if (!url) {
            if (config.mode === 'physical_device') {
                setPollError('Fiziksel mod için poll URL gerekli (yerel köprü / cihaz arayüzü).');
            }
            return;
        }

        const intervalMs = Math.max(1500, config.pollIntervalMs || 2500);
        let cancelled = false;

        const tick = async () => {
            try {
                const res = await fetch(url, { method: 'GET', cache: 'no-store' });
                if (!res.ok) {
                    if (!cancelled) setPollError(`Caller ID: HTTP ${res.status}`);
                    return;
                }
                const data = await res.json();
                if (!cancelled) setPollError(null);
                const ev = parseCallerIdPollPayload(data);
                if (!ev || cancelled) return;
                emitIfNew(ev);
            } catch (e: unknown) {
                if (!cancelled) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setPollError(`Caller ID: ${msg}`);
                }
            }
        };

        tick();
        const id = window.setInterval(tick, intervalMs);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [active, config.mode, config.pollUrl, config.pollIntervalMs, config.apiToken, emitIfNew]);

    // Tauri serial
    useEffect(() => {
        if (!active || config.mode !== 'physical_serial') {
            return;
        }

        if (!IS_TAURI) {
            setPollError('Seri port yalnızca masaüstü (DeskApp) uygulamasında kullanılabilir.');
            return;
        }

        const port = config.serialPort.trim();
        if (!port) {
            setPollError('Seri port seçin (DeskApp).');
            return;
        }

        let unSub: (() => void) | undefined;
        let cancelled = false;

        (async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                const { invoke } = await import('@tauri-apps/api/core');

                await invoke('caller_serial_start', {
                    portPath: port,
                    baud: Math.max(1200, config.serialBaud || 9600),
                });

                const u1 = await listen<{ raw?: string }>('rest:caller-id', (e) => {
                    if (cancelled) return;
                    setPollError(null);
                    const raw = e.payload?.raw;
                    if (!raw || typeof raw !== 'string') return;
                    const phone = parsePhoneFromCallerIdRawLine(raw);
                    if (!phone) return;
                    const ev: RestaurantCallerIdEvent = {
                        phone,
                        receivedAt: new Date().toISOString(),
                    };
                    emitIfNew(ev, 4000);
                });

                const u2 = await listen<string>('rest:caller-id-error', (e) => {
                    if (!cancelled) setPollError(`Seri port: ${e.payload}`);
                });

                unSub = () => {
                    u1();
                    u2();
                };
            } catch (err: unknown) {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setPollError(`Caller ID seri: ${msg}`);
                }
            }
        })();

        return () => {
            cancelled = true;
            unSub?.();
            import('@tauri-apps/api/core')
                .then(({ invoke }) => invoke('caller_serial_stop').catch(() => {}))
                .catch(() => {});
        };
    }, [active, config.mode, config.serialPort, config.serialBaud, emitIfNew]);

    return { incomingCall, dismissIncoming, pollError };
}
