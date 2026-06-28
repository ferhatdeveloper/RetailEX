/**
 * Merkez (uzak) PostgreSQL'de firma/dönem tablolarını oluşturur.
 * Hibrit sync sırasında rex_002_* 42P01 hatalarını önler.
 */

import { DB_SETTINGS, getCentralRemotePgConfig } from './postgres';
import { queryPgRows } from './hybridSyncEngine';

function padFirmNr(nr: string): string {
  const d = String(nr ?? '').replace(/\D/g, '');
  return d ? d.padStart(3, '0') : '001';
}

function padPeriodNr(nr?: string): string {
  const d = String(nr ?? '01').replace(/\D/g, '');
  return d ? d.padStart(2, '0') : '01';
}

export async function ensureCentralFirmPeriodSchemas(
  firmNr: string,
  periodNr?: string,
): Promise<{ ok: boolean; message: string }> {
  if (DB_SETTINGS.activeMode !== 'hybrid' && DB_SETTINGS.activeMode !== 'online') {
    return { ok: true, message: 'Yalnızca hibrit/online modda merkez şema kontrolü yapılır.' };
  }

  const cfg = getCentralRemotePgConfig();
  if (!cfg.host?.trim() || !cfg.database?.trim()) {
    return { ok: false, message: 'Merkez veritabanı yapılandırılmamış.' };
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
    return { ok: true, message: `Merkez şema hazır: firma ${firm}, dönem ${period}.` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
