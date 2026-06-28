/**
 * Yerel ve merkez PostgreSQL'de firma/dönem tablolarını oluşturur.
 */

import { DB_SETTINGS, getCentralRemotePgConfig, LOCAL_CONFIG } from './postgres';
import { queryPgRows, type PgEndpointConfig } from './hybridSyncEngine';

function padFirmNr(nr: string): string {
  const d = String(nr ?? '').replace(/\D/g, '');
  return d ? d.padStart(3, '0') : '001';
}

function padPeriodNr(nr?: string): string {
  const d = String(nr ?? '01').replace(/\D/g, '');
  return d ? d.padStart(2, '0') : '01';
}

async function ensureOnEndpoint(
  cfg: PgEndpointConfig,
  firmNr: string,
  periodNr: string,
  label: string,
): Promise<{ ok: boolean; message: string }> {
  if (!cfg.host?.trim() || !cfg.database?.trim()) {
    return { ok: false, message: `${label}: bağlantı yapılandırılmamış.` };
  }

  const firm = padFirmNr(firmNr);
  const period = padPeriodNr(periodNr);

  try {
    await queryPgRows(cfg, `SELECT public.CREATE_FIRM_TABLES($1::varchar)`, [firm]);
    await queryPgRows(cfg, `SELECT public.CREATE_PERIOD_TABLES($1::varchar, $2::varchar)`, [
      firm,
      period,
    ]);
    try {
      await queryPgRows(cfg, `SELECT pg_notify('pgrst', 'reload schema')`, []);
    } catch {
      /* PostgREST yoksa sorun değil */
    }
    return { ok: true, message: `${label}: firma ${firm}, dönem ${period} hazır.` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `${label}: ${msg}` };
  }
}

export async function ensureLocalFirmPeriodSchemas(
  firmNr: string,
  periodNr?: string,
): Promise<{ ok: boolean; message: string }> {
  return ensureOnEndpoint(LOCAL_CONFIG, firmNr, padPeriodNr(periodNr), 'Yerel DB');
}

export async function ensureCentralFirmPeriodSchemas(
  firmNr: string,
  periodNr?: string,
): Promise<{ ok: boolean; message: string }> {
  if (DB_SETTINGS.activeMode !== 'hybrid' && DB_SETTINGS.activeMode !== 'online') {
    return { ok: true, message: 'Yalnızca hibrit/online modda merkez şema kontrolü yapılır.' };
  }
  return ensureOnEndpoint(getCentralRemotePgConfig(), firmNr, padPeriodNr(periodNr), 'Merkez DB');
}

/** Hibrit: yerel + merkez; online: merkez; offline: yerel */
export async function ensureFirmPeriodSchemasForMode(
  firmNr: string,
  periodNr?: string,
): Promise<{ ok: boolean; messages: string[] }> {
  const period = padPeriodNr(periodNr);
  const messages: string[] = [];
  let ok = true;

  if (DB_SETTINGS.activeMode === 'offline' || DB_SETTINGS.activeMode === 'hybrid') {
    const local = await ensureLocalFirmPeriodSchemas(firmNr, period);
    messages.push(local.message);
    ok = ok && local.ok;
  }

  if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'online') {
    const central = await ensureCentralFirmPeriodSchemas(firmNr, period);
    messages.push(central.message);
    ok = ok && central.ok;
  }

  return { ok, messages };
}

const ensuredKeys = new Set<string>();

export async function ensureFirmPeriodSchemasOnce(
  firmNr: string,
  periodNr?: string,
  target: 'local' | 'central' | 'both' = 'both',
): Promise<void> {
  const firm = padFirmNr(firmNr);
  const period = padPeriodNr(periodNr);
  const key = `${target}:${firm}:${period}`;
  if (ensuredKeys.has(key)) return;

  if (target === 'local' || target === 'both') {
    const r = await ensureLocalFirmPeriodSchemas(firm, period);
    if (r.ok) ensuredKeys.add(`local:${firm}:${period}`);
  }
  if (target === 'central' || target === 'both') {
    const r = await ensureCentralFirmPeriodSchemas(firm, period);
    if (r.ok) ensuredKeys.add(`central:${firm}:${period}`);
  }
  ensuredKeys.add(key);
}
