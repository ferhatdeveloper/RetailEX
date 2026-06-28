/**
 * MPOS kasa gönder/al işlem geçmişi (JRetail terminal_sync_log benzeri).
 */

import { ERP_SETTINGS } from './postgres';
import { resolveSyncPgEndpoint } from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';

export type TerminalSyncDirection = 'send' | 'receive';
export type TerminalSyncLogStatus = 'ok' | 'failed' | 'partial';

export type TerminalSyncLogRow = {
  id: string;
  firmNr: string;
  storeId: string | null;
  storeName: string | null;
  terminalName: string | null;
  terminalDeviceId: string | null;
  direction: TerminalSyncDirection;
  fileType: string;
  status: TerminalSyncLogStatus;
  recordCount: number;
  businessDate: string | null;
  message: string | null;
  detail?: Record<string, unknown> | null;
  createdAt: number;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

export async function logTerminalSync(opts: {
  storeId?: string | null;
  terminalName?: string | null;
  terminalDeviceId?: string | null;
  direction: TerminalSyncDirection;
  fileType: string;
  status?: TerminalSyncLogStatus;
  recordCount?: number;
  businessDate?: string | null;
  message?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  try {
    await queryPgRows(
      pg,
      `INSERT INTO terminal_sync_log (
         firm_nr, store_id, terminal_name, terminal_device_id,
         direction, file_type, status, record_count, business_date, message, detail
       )
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::date, $10, $11::jsonb)`,
      [
        firm,
        opts.storeId || null,
        opts.terminalName || null,
        opts.terminalDeviceId || null,
        opts.direction,
        opts.fileType,
        opts.status ?? 'ok',
        opts.recordCount ?? 0,
        opts.businessDate || null,
        opts.message || null,
        JSON.stringify(opts.detail ?? {}),
      ],
    );
  } catch {
    /* tablo henüz migrate edilmemiş olabilir */
  }
}

export async function listTerminalSyncLogs(opts?: {
  storeId?: string;
  terminalName?: string;
  direction?: TerminalSyncDirection;
  limit?: number;
}): Promise<TerminalSyncLogRow[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const params: unknown[] = [firm];
  const clauses = ['l.firm_nr = $1'];

  if (opts?.storeId) {
    params.push(opts.storeId);
    clauses.push(`l.store_id = $${params.length}::uuid`);
  }
  if (opts?.terminalName?.trim()) {
    params.push(opts.terminalName.trim());
    clauses.push(`l.terminal_name = $${params.length}`);
  }
  if (opts?.direction) {
    params.push(opts.direction);
    clauses.push(`l.direction = $${params.length}`);
  }
  params.push(limit);

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT l.id::text AS id, l.firm_nr, l.store_id::text AS store_id,
              s.name AS store_name, l.terminal_name, l.terminal_device_id,
              l.direction, l.file_type, l.status, l.record_count,
              l.business_date::text AS business_date, l.message, l.detail,
              EXTRACT(EPOCH FROM l.created_at) * 1000 AS created_at_ms
       FROM terminal_sync_log l
       LEFT JOIN stores s ON s.id = l.store_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      firmNr: String(r.firm_nr ?? firm),
      storeId: r.store_id ? String(r.store_id) : null,
      storeName: r.store_name ? String(r.store_name) : null,
      terminalName: r.terminal_name ? String(r.terminal_name) : null,
      terminalDeviceId: r.terminal_device_id ? String(r.terminal_device_id) : null,
      direction: r.direction as TerminalSyncDirection,
      fileType: String(r.file_type),
      status: (r.status as TerminalSyncLogStatus) ?? 'ok',
      recordCount: Number(r.record_count ?? 0),
      businessDate: r.business_date ? String(r.business_date) : null,
      message: r.message ? String(r.message) : null,
      detail:
        r.detail && typeof r.detail === 'object'
          ? (r.detail as Record<string, unknown>)
          : r.detail
            ? (JSON.parse(String(r.detail)) as Record<string, unknown>)
            : null,
      createdAt: Number(r.created_at_ms ?? Date.now()),
    }));
  } catch {
    return [];
  }
}
