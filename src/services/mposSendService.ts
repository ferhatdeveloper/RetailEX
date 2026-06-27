/**
 * KLRetail M-POS «Bilgilerinin Gönderilmesi» — dosya tipi + işyeri + kasa (Kalem eğitim videosu).
 */

import { APP_SEMVER } from '../core/version';
import { ERP_SETTINGS } from './postgres';
import {
  enqueueEnterpriseBulk,
  enqueueAllMasterData,
  pushMasterDataToBranches,
  resolveSyncPgEndpoint,
} from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';

export type MposSendFileType =
  | 'products'
  | 'customers'
  | 'campaign_points'
  | 'exchange_rates'
  | 'cashiers'
  | 'shortcuts'
  | 'program_info'
  | 'receipt_design'
  | 'version_update';

/** Kalem M-POS «Dosya Tipi» listesi (OuFtuJRL5t0 eğitim videosu) */
export const MPOS_SEND_FILE_TYPES: { id: MposSendFileType; label: string }[] = [
  { id: 'products', label: 'Malzeme Kartları' },
  { id: 'customers', label: 'Cari Kartları' },
  { id: 'campaign_points', label: 'Puan Tanımları' },
  { id: 'exchange_rates', label: 'Döviz Kur Bilgileri' },
  { id: 'cashiers', label: 'Kasiyer / Satıcı Bilgileri' },
  { id: 'shortcuts', label: 'Kısayol Tuş Tanımları' },
  { id: 'program_info', label: 'Program Bilgileri' },
  { id: 'receipt_design', label: 'Fiş Dizaynları' },
  { id: 'version_update', label: 'Versiyon Güncelleme' },
];

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

async function insertKasaSyncRows(opts: {
  tableName: string;
  rows: { id: string; data: Record<string, unknown> }[];
  storeId: string;
  terminalName: string;
  action?: string;
}): Promise<number> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const action = opts.action ?? 'UPDATE';
  let inserted = 0;

  for (const row of opts.rows) {
    try {
      await queryPgRows(
        pg,
        `INSERT INTO sync_queue (
           table_name, record_id, action, firm_nr, data,
           target_store_id, terminal_name, status
         )
         SELECT $1, $2::uuid, $3, $4, $5::jsonb, $6::uuid, $7, 'pending'
         WHERE NOT EXISTS (
           SELECT 1 FROM sync_queue sq
           WHERE sq.table_name = $1 AND sq.record_id = $2::uuid
             AND sq.status = 'pending'
             AND sq.target_store_id = $6::uuid
             AND COALESCE(sq.terminal_name, '') = COALESCE($7, '')
         )`,
        [
          opts.tableName,
          row.id,
          action,
          firm,
          JSON.stringify(row.data),
          opts.storeId,
          opts.terminalName || null,
        ],
      );
      inserted += 1;
    } catch {
      /* tek kayıt atla */
    }
  }
  return inserted;
}

async function enqueueTableForKasa(
  tableName: string,
  sql: string,
  params: unknown[],
  storeId: string,
  terminalName: string,
): Promise<{ ok: boolean; message: string; count: number }> {
  const pg = resolveSyncPgEndpoint();
  try {
    const rows = await queryPgRows(
      pg,
      sql,
      params,
    );
    if (!rows.length) {
      return { ok: false, message: 'Gönderilecek kayıt bulunamadı.', count: 0 };
    }
    const mapped = rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      data: (r.data as Record<string, unknown>) ?? {},
    }));
    const count = await insertKasaSyncRows({
      tableName,
      rows: mapped,
      storeId,
      terminalName,
    });
    return {
      ok: count > 0,
      message: count > 0 ? `${count} kayıt kasa kuyruğuna eklendi.` : 'Yeni kuyruk kaydı oluşturulamadı.',
      count,
    };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), count: 0 };
  }
}

async function enqueueMposConfigPayload(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; message: string; count: number }> {
  const count = await insertKasaSyncRows({
    tableName: `mpos_${opts.fileType}`,
    rows: [
      {
        id: opts.storeId,
        data: {
          ...opts.payload,
          mpos_file_type: opts.fileType,
          terminal_device_id: opts.terminalDeviceId,
          terminal_name: opts.terminalName,
          sent_at: new Date().toISOString(),
        },
      },
    ],
    storeId: opts.storeId,
    terminalName: opts.terminalName,
  });
  return {
    ok: count > 0,
    message: count > 0 ? 'Program bilgisi kasa kuyruğuna eklendi.' : 'Kuyruk kaydı oluşturulamadı.',
    count,
  };
}

/** Kalem: seçili işyeri + kasaya dosya tipine göre bilgi gönder */
export async function sendMposInfoToKasa(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
}): Promise<{ ok: boolean; message: string; count: number }> {
  const { fileType, storeId, terminalName, terminalDeviceId } = opts;
  const firm = firmNrPadded();
  const pg = resolveSyncPgEndpoint();

  switch (fileType) {
    case 'products': {
      const r = await enqueueEnterpriseBulk({
        type: 'product',
        onlyActive: true,
        limit: 5000,
        targetStoreId: storeId,
      });
      if (r.ok && r.count > 0) {
        await tagPendingQueueTerminal(storeId, terminalName, `rex_${firm}_products`);
      }
      return r;
    }
    case 'customers': {
      const r = await enqueueEnterpriseBulk({
        type: 'customer',
        onlyActive: true,
        limit: 5000,
        targetStoreId: storeId,
      });
      if (r.ok && r.count > 0) {
        await tagPendingQueueTerminal(storeId, terminalName, `rex_${firm}_customers`);
      }
      return r;
    }
    case 'campaign_points':
      return enqueueTableForKasa(
        `rex_${firm}_campaigns`,
        `SELECT id::text AS id, to_jsonb(t) AS data FROM rex_${firm}_campaigns t
         WHERE COALESCE(t.is_active, true) = true ORDER BY t.updated_at DESC NULLS LAST LIMIT 500`,
        [],
        storeId,
        terminalName,
      );
    case 'exchange_rates':
      return enqueueTableForKasa(
        'exchange_rates',
        `SELECT id::text AS id, to_jsonb(t) AS data FROM exchange_rates t
         WHERE COALESCE(t.is_active, true) = true
         ORDER BY t.date DESC LIMIT 100`,
        [],
        storeId,
        terminalName,
      );
    case 'cashiers':
      return enqueueTableForKasa(
        'users',
        `SELECT id::text AS id, to_jsonb(t) AS data FROM users t
         WHERE store_id = $1::uuid AND COALESCE(t.is_active, true) = true
         ORDER BY t.full_name, t.username`,
        [storeId],
        storeId,
        terminalName,
      );
    case 'shortcuts':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: { kind: 'pos_shortcuts', note: 'Kasa kısayol tuş tanımları — merkezden gönderim' },
      });
    case 'program_info': {
      let storeRow: Record<string, unknown> = {};
      try {
        const rows = await queryPgRows(
          pg,
          `SELECT to_jsonb(s) AS data FROM stores s WHERE s.id = $1::uuid LIMIT 1`,
          [storeId],
        );
        storeRow = (rows[0]?.data as Record<string, unknown>) ?? {};
      } catch {
        /* */
      }
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'program_info',
          firm_nr: firm,
          period_nr: ERP_SETTINGS.periodNr,
          store: storeRow,
        },
      });
    }
    case 'receipt_design':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: { kind: 'receipt_design', store_id: storeId },
      });
    case 'version_update':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: { kind: 'version_update', app_version: APP_SEMVER, server: 'retailex_center' },
      });
    default:
      return { ok: false, message: 'Desteklenmeyen dosya tipi.', count: 0 };
  }
}

/** Bulk enqueue sonrası bekleyen satırlara kasa adı yaz */
async function tagPendingQueueTerminal(
  storeId: string,
  terminalName: string,
  tableName: string,
): Promise<void> {
  if (!terminalName?.trim()) return;
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  try {
    await queryPgRows(
      pg,
      `UPDATE sync_queue SET terminal_name = $4
       WHERE status = 'pending' AND target_store_id = $1::uuid
         AND table_name = $2 AND firm_nr = $3
         AND (terminal_name IS NULL OR terminal_name = '')`,
      [storeId, tableName, firm, terminalName.trim()],
    );
  } catch {
    /* optional */
  }
}

/** Gönder + kuyruğu kasaya ilet */
export async function sendMposInfoToKasaAndPush(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
}): Promise<{ ok: boolean; message: string }> {
  const enq = await sendMposInfoToKasa(opts);
  if (!enq.ok) return { ok: false, message: enq.message };

  const push = await pushMasterDataToBranches({ targetStoreId: opts.storeId });
  const msg = push.ok
    ? `${enq.message} ${push.message}`
    : `${enq.message} (İletim uyarısı: ${push.message})`;
  return { ok: true, message: msg };
}
