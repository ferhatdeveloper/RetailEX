/**
 * PostgREST tercih + hybrid bridge fallback — reportsApi `runReportTransport` ile aynı.
 */
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';

/**
 * Köprü / ağ / apiMode hatalarını yutma — ekranda ErrorBanner görünsün.
 * Şema eksikliği (relation does not exist vb.) için sessiz fallback kalabilir.
 */
export function isTransportInfrastructureError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('apimode=postgrest') ||
    msg.includes('ham sql') ||
    msg.includes('bu işlem hâlâ bridge') ||
    msg.includes('köprü') ||
    msg.includes('bridge') ||
    msg.includes('pg_query') ||
    msg.includes('postgrest') ||
    msg.includes('ulaşılamadı') ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('remote_rest_url') ||
    msg.includes('remoteresturl') ||
    /http\s*(404|502|503)/.test(msg)
  );
}

export function rethrowTransportInfra(err: unknown, label?: string): void {
  if (isTransportInfrastructureError(err)) throw err;
  if (__DEV__ && label) {
    console.warn(
      `[dataTransport:${label}]`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function runDataTransport<T>(opts: {
  label: string;
  viaRest: () => Promise<T>;
  viaBridge: () => Promise<T>;
}): Promise<T> {
  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      return await opts.viaRest();
    } catch (err) {
      if (!shouldUseBridgeSql(cfg)) throw err;
      if (__DEV__) {
        console.warn(
          `[dataTransport:${opts.label}] PostgREST → bridge`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return opts.viaBridge();
}
