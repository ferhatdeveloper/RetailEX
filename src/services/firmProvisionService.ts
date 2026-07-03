/**
 * Firma/dönem şema provision — yerel oluşturma → merkez DB otomatik (PostgREST RPC).
 */

import { DB_SETTINGS, LOCAL_CONFIG, postgres, getCentralRemotePgConfig, shouldUseCentralApi } from './postgres';
import { queryPgRows, type PgEndpointConfig } from './hybridSyncEngine';
import { centralRpcCall, isCentralRestAvailable } from './centralRpcService';

export function padFirmNr(nr: string): string {
  const d = String(nr ?? '').replace(/\D/g, '');
  return d ? d.padStart(3, '0') : '001';
}

export function padPeriodNr(nr?: string): string {
  const d = String(nr ?? '01').replace(/\D/g, '');
  return d ? d.padStart(2, '0') : '01';
}

export type ProvisionFirmOptions = {
  firmNr: string;
  periodNr?: string;
  firmName?: string;
  currency?: string;
  bootstrapModules?: boolean;
};

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
    await queryPgRows(cfg, `SELECT public.provision_firm_schema($1, $2, NULL, 'IQD', true)`, [
      firm,
      period,
    ]);
    return { ok: true, message: `${label}: firma ${firm}, dönem ${period} hazır.` };
  } catch {
    try {
      await queryPgRows(cfg, `SELECT public.CREATE_FIRM_TABLES($1::varchar)`, [firm]);
      await queryPgRows(cfg, `SELECT public.CREATE_PERIOD_TABLES($1::varchar, $2::varchar)`, [
        firm,
        period,
      ]);
      try {
        await queryPgRows(cfg, `SELECT pg_notify('pgrst', 'reload schema')`, []);
      } catch {
        /* ignore */
      }
      return { ok: true, message: `${label}: firma ${firm}, dönem ${period} hazır (DDL fallback).` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: `${label}: ${msg}` };
    }
  }
}

async function provisionCentralViaRpc(opts: ProvisionFirmOptions): Promise<{ ok: boolean; message: string }> {
  const firm = padFirmNr(opts.firmNr);
  const period = padPeriodNr(opts.periodNr);

  try {
    const row = await centralRpcCall<{ out_ok?: boolean; out_message?: string }>(
      'provision_firm_schema',
      {
        p_firm_nr: firm,
        p_period_nr: period,
        p_firm_name: opts.firmName ?? null,
        p_currency: opts.currency ?? 'IQD',
        p_bootstrap_modules: opts.bootstrapModules !== false,
      },
    );
    if (row.out_ok === false) {
      return { ok: false, message: row.out_message || 'Merkez RPC provision başarısız.' };
    }
    return { ok: true, message: row.out_message || `Merkez: firma ${firm} dönem ${period} hazır.` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (shouldUseCentralApi()) {
      return { ok: false, message: `Merkez RPC: ${msg}` };
    }
    if (msg.includes('42883') || msg.includes('does not exist') || msg.includes('provision_firm_schema')) {
      return ensureOnEndpoint(getCentralRemotePgConfig(), firm, period, 'Merkez DB');
    }
    return { ok: false, message: `Merkez RPC: ${msg}` };
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
  opts?: Pick<ProvisionFirmOptions, 'firmName' | 'currency' | 'bootstrapModules'>,
): Promise<{ ok: boolean; message: string }> {
  if (DB_SETTINGS.activeMode !== 'hybrid' && DB_SETTINGS.activeMode !== 'online') {
    return { ok: true, message: 'Yalnızca hibrit/online modda merkez şema kontrolü yapılır.' };
  }

  if (isCentralRestAvailable()) {
    return provisionCentralViaRpc({ firmNr, periodNr, ...opts });
  }
  if (shouldUseCentralApi()) {
    return { ok: false, message: 'Merkez API (remote_rest_url) yapılandırılmamış.' };
  }

  return ensureOnEndpoint(getCentralRemotePgConfig(), firmNr, padPeriodNr(periodNr), 'Merkez DB');
}

/** Yerel firma oluşturulduğunda veya güncellendiğinde: yerel + merkez şema */
export async function provisionFirmEverywhere(
  opts: ProvisionFirmOptions,
): Promise<{ ok: boolean; messages: string[] }> {
  const firm = padFirmNr(opts.firmNr);
  const period = padPeriodNr(opts.periodNr);
  const messages: string[] = [];
  let ok = true;

  if (DB_SETTINGS.activeMode === 'offline' || DB_SETTINGS.activeMode === 'hybrid') {
    const local = await ensureLocalFirmPeriodSchemas(firm, period);
    messages.push(local.message);
    ok = ok && local.ok;
  }

  if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'online') {
    const central = await ensureCentralFirmPeriodSchemas(firm, period, opts);
    messages.push(central.message);
    ok = ok && central.ok;
  }

  if (DB_SETTINGS.activeMode === 'online' && !isCentralRestAvailable()) {
    const central = await ensureOnEndpoint(
      getCentralRemotePgConfig(),
      firm,
      period,
      'Merkez DB',
    );
    messages.push(central.message);
    ok = ok && central.ok;
  }

  return { ok, messages };
}

export async function ensureFirmPeriodSchemasForMode(
  firmNr: string,
  periodNr?: string,
  opts?: Pick<ProvisionFirmOptions, 'firmName' | 'currency'>,
): Promise<{ ok: boolean; messages: string[] }> {
  return provisionFirmEverywhere({ firmNr, periodNr, ...opts });
}

const ensuredKeys = new Set<string>();

export async function ensureFirmPeriodSchemasOnce(
  firmNr: string,
  periodNr?: string,
  target: 'local' | 'central' | 'both' = 'both',
  opts?: Pick<ProvisionFirmOptions, 'firmName' | 'currency'>,
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
    const r = await ensureCentralFirmPeriodSchemas(firm, period, opts);
    if (r.ok) ensuredKeys.add(`central:${firm}:${period}`);
  }
  ensuredKeys.add(key);
}

/** Dönem kaydı sonrası firm_nr çözümle */
export async function resolveFirmNrByFirmId(firmId: string): Promise<string | null> {
  if (!firmId?.trim()) return null;
  try {
    const { rows } = await postgres.query(
      `SELECT firm_nr FROM firms WHERE id = $1::uuid LIMIT 1`,
      [firmId],
    );
    const nr = rows[0]?.firm_nr;
    return nr ? padFirmNr(String(nr)) : null;
  } catch {
    return null;
  }
}
