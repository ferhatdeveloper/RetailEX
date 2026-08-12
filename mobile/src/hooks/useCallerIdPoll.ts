import { useEffect, useRef } from 'react';
import {
  findCustomerByPhoneLoose,
  parseCallerIdPollPayload,
  postCallerIdCustomerContext,
  resolveCallerIdPollUrl,
} from '../api/callerIdApi';
import { useCallerIdStore, isCallerIdListening } from '../store/callerIdStore';
import { useConfigStore } from '../store/configStore';

/**
 * App-root HTTP poll — web `useRestaurantCallerId` parity (serial hariç).
 */
export function useCallerIdPoll(active: boolean): void {
  const config = useCallerIdStore((s) => s.config);
  const hydrated = useCallerIdStore((s) => s.hydrated);
  const setIncoming = useCallerIdStore((s) => s.setIncoming);
  const setMatchedCustomer = useCallerIdStore((s) => s.setMatchedCustomer);
  const setPollError = useCallerIdStore((s) => s.setPollError);
  const bridgeHost = useConfigStore((s) => s.config.bridgeHost);
  const bridgePort = useConfigStore((s) => s.config.bridgePort);
  const lastSeenAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !active || !isCallerIdListening(config)) {
      setPollError(null);
      return;
    }

    const url = resolveCallerIdPollUrl(config);
    if (!url) {
      if (config.mode === 'physical_device') {
        setPollError('callerId.errorPhysicalUrl');
      }
      return;
    }

    const intervalMs = Math.max(1500, (config.pollIntervalSec || 3) * 1000);
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(config.apiToken.trim()
              ? { Authorization: `Bearer ${config.apiToken.trim()}` }
              : {}),
          },
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setPollError(`callerId.errorHttp:${res.status}`);
          return;
        }
        const data = await res.json();
        if (!cancelled) setPollError(null);
        const ev = parseCallerIdPollPayload(data);
        if (!ev || cancelled) return;
        if (lastSeenAtRef.current === ev.receivedAt) return;
        lastSeenAtRef.current = ev.receivedAt;
        setIncoming(ev);

        const customer = await findCustomerByPhoneLoose(ev.phone);
        if (cancelled) return;
        setMatchedCustomer(customer);
        if (customer) {
          try {
            await postCallerIdCustomerContext(
              {
                phone: ev.phone,
                customerName: customer.name,
                address: [customer.city].filter(Boolean).join(', ') || undefined,
              },
              config.apiToken,
            );
          } catch {
            /* köprü yoksa sessiz */
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setPollError(`callerId.errorNet:${msg}`);
        }
      }
    };

    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    active,
    hydrated,
    config.mode,
    config.pollUrl,
    config.pollIntervalSec,
    config.apiToken,
    bridgeHost,
    bridgePort,
    setIncoming,
    setMatchedCustomer,
    setPollError,
  ]);
}
