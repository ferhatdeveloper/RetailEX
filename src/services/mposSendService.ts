/**
 * KLRetail M-POS «Bilgilerinin Gönderilmesi» — dosya tipi + işyeri + kasa (Kalem eğitim videosu).
 */

import { APP_SEMVER } from '../core/version';
import { ERP_SETTINGS } from './postgres';
import { logTerminalSync } from './mposSyncLogService';
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
  | 'promotions'
  | 'exchange_rates'
  | 'cashiers'
  | 'shortcuts'
  | 'version_update_center'
  | 'version_update_local'
  | 'receipt_design'
  | 'program_info'
  | 'customer_balance_risk'
  | 'card_password'
  | 'point_adapter'
  | 'payment_keys';

/**
 * Kalem «Dosya Tipi» sırası — ekran görüntüsü (OuFtuJRL5t0) + eğitim 2 (3TueEaussGo).
 * Görüntüdeki sıra: Puan → Döviz → Kasiyer → Kısayol → Versiyon (Kalem/Local) → Fiş → Program
 */
export type MposSendDeviceResult = {
  terminalDeviceId: string;
  terminalName: string;
  storeId: string;
  ok: boolean;
  message: string;
  count: number;
};

export const MPOS_SEND_FILE_TYPES: { id: MposSendFileType; label: string }[] = [
  { id: 'products', label: 'Malzeme Kartları' },
  { id: 'customers', label: 'Cari Kartları' },
  { id: 'campaign_points', label: 'Puan Tanımları' },
  { id: 'promotions', label: 'Promosyon Tanımları' },
  { id: 'exchange_rates', label: 'Döviz Kur Bilgileri' },
  { id: 'cashiers', label: 'Kasiyer / Satıcı Bilgileri' },
  { id: 'shortcuts', label: 'Kısayol Tuş Tanımları' },
  { id: 'version_update_center', label: 'Versiyon Güncelleme (Kalem Sunucu)' },
  { id: 'version_update_local', label: 'Versiyon Güncelleme (Local Sunucu)' },
  { id: 'receipt_design', label: 'Fiş Dizaynları' },
  { id: 'program_info', label: 'Program Bilgileri' },
  { id: 'customer_balance_risk', label: 'Cari Bakiye / Risk Bilgileri' },
  { id: 'card_password', label: 'Kart Şifre Bilgileri' },
  { id: 'point_adapter', label: 'M-POS Puan Adaptör Parametreleri' },
  { id: 'payment_keys', label: 'Ödeme Tuş Tanımları' },
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

export type MposSendSyncMode = 'full' | 'incremental';

/** Kalem: seçili işyeri + kasaya dosya tipine göre bilgi gönder */
export async function sendMposInfoToKasa(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
  includeProductImages?: boolean;
  /** JRetail «Değişenler» — yalnızca tarih aralığındaki güncellemeler (malzeme/cari) */
  syncMode?: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ ok: boolean; message: string; count: number }> {
  const {
    fileType,
    storeId,
    terminalName,
    terminalDeviceId,
    includeProductImages,
    syncMode = 'full',
    dateFrom,
    dateTo,
  } = opts;
  const firm = firmNrPadded();
  const pg = resolveSyncPgEndpoint();

  switch (fileType) {
    case 'products': {
      const r = await enqueueEnterpriseBulk({
        type: 'product',
        onlyActive: true,
        limit: 5000,
        targetStoreId: storeId,
        onlyChanged: syncMode === 'incremental',
        changedSince: syncMode === 'incremental' ? dateFrom : undefined,
        changedUntil: syncMode === 'incremental' ? dateTo : undefined,
      });
      if (r.ok && r.count > 0) {
        await tagPendingQueueTerminal(storeId, terminalName, `rex_${firm}_products`);
        if (includeProductImages) {
          await markProductImagesFlag(storeId, terminalName, `rex_${firm}_products`);
        }
      }
      return r;
    }
    case 'customers': {
      const r = await enqueueEnterpriseBulk({
        type: 'customer',
        onlyActive: true,
        limit: 5000,
        targetStoreId: storeId,
        onlyChanged: syncMode === 'incremental',
        changedSince: syncMode === 'incremental' ? dateFrom : undefined,
        changedUntil: syncMode === 'incremental' ? dateTo : undefined,
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
    case 'promotions':
      return enqueueTableForKasa(
        `rex_${firm}_campaigns`,
        `SELECT id::text AS id, to_jsonb(t) AS data FROM rex_${firm}_campaigns t
         WHERE COALESCE(t.is_active, true) = true
         ORDER BY t.updated_at DESC NULLS LAST LIMIT 500`,
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
    case 'shortcuts': {
      const { buildPluShortcutsPayload } = await import('./mposPluSyncService');
      const plu = await buildPluShortcutsPayload(storeId);
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'pos_shortcuts',
          slot_count: plu.slotCount,
          slots: plu.slots,
          pages: plu.pages,
          note: plu.slotCount > 0
            ? `${plu.slotCount} PLU/kısayol tuşu`
            : 'Tanımlı PLU yok — aktif ürünlerden otomatik doldurulamadı',
        },
      });
    }
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
    case 'version_update_center':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'version_update',
          app_version: APP_SEMVER,
          server: 'retailex_center',
          update_source: 'kalem_server',
        },
      });
    case 'version_update_local':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'version_update',
          app_version: APP_SEMVER,
          server: 'local',
          update_source: 'local_server',
        },
      });
    case 'customer_balance_risk':
      return enqueueTableForKasa(
        `rex_${firm}_customers`,
        `SELECT id::text AS id, to_jsonb(t) AS data FROM rex_${firm}_customers t
         WHERE COALESCE(t.is_active, true) = true
         ORDER BY t.updated_at DESC NULLS LAST LIMIT 2000`,
        [],
        storeId,
        terminalName,
      );
    case 'card_password':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'card_password',
          note: 'Müşteri kart şifreleri — Puan DB PUANTOT (KLR-2008)',
        },
      });
    case 'point_adapter':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'point_adapter',
          note: 'M-POS Puan Adaptör Parametreleri (eğitim 2 — 3TueEaussGo)',
          puan_db: true,
        },
      });
    case 'payment_keys':
      return enqueueMposConfigPayload({
        fileType,
        storeId,
        terminalName,
        terminalDeviceId,
        payload: {
          kind: 'payment_keys',
          includes_meal_voucher: true,
          note: 'Ödeme tuş tanımları — yemek çeki vb.',
        },
      });
    default:
      return { ok: false, message: 'Desteklenmeyen dosya tipi.', count: 0 };
  }
}

async function markProductImagesFlag(
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
      `UPDATE sync_queue SET data = COALESCE(data, '{}'::jsonb) || '{"include_product_images":true}'::jsonb
       WHERE status = 'pending' AND target_store_id = $1::uuid
         AND table_name = $2 AND firm_nr = $3 AND terminal_name = $4`,
      [storeId, tableName, firm, terminalName.trim()],
    );
  } catch {
    /* optional */
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
  includeProductImages?: boolean;
  syncMode?: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
  skipGuard?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const enq = await sendMposInfoToKasa(opts);
  await logTerminalSync({
    storeId: opts.storeId,
    terminalName: opts.terminalName,
    terminalDeviceId: opts.terminalDeviceId,
    direction: 'send',
    fileType: opts.fileType,
    status: enq.ok ? 'ok' : 'failed',
    recordCount: enq.count,
    message: enq.message,
    detail: {
      syncMode: opts.syncMode,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      includeProductImages: opts.includeProductImages,
    },
  });
  if (!enq.ok) return { ok: false, message: enq.message };

  const push = await pushMasterDataToBranches({ targetStoreId: opts.storeId });
  const { requestMposSyncPullNotify } = await import('./mposKasaAutoPullService');
  requestMposSyncPullNotify({ storeId: opts.storeId, terminalName: opts.terminalName });
  const msg = push.ok
    ? `${enq.message} ${push.message}`
    : `${enq.message} (İletim uyarısı: ${push.message})`;
  return { ok: true, message: msg };
}

/** Seçili kasalara aynı dosya tipini sırayla gönder (JRetail çoklu kasa) */
export async function sendMposInfoToSelectedKasas(opts: {
  fileType: MposSendFileType;
  terminals: { terminalName: string; terminalDeviceId: string; storeId: string }[];
  includeProductImages?: boolean;
  syncMode?: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
  onProgress?: (current: number, total: number, terminalName: string) => void;
  onDeviceResult?: (result: MposSendDeviceResult) => void;
}): Promise<{
  ok: boolean;
  message: string;
  success: number;
  failed: number;
  results: MposSendDeviceResult[];
}> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: MposSendDeviceResult[] = [];
  const total = opts.terminals.length;
  const pushedStores = new Set<string>();

  for (let i = 0; i < opts.terminals.length; i += 1) {
    const t = opts.terminals[i];
    const storeId = t.storeId?.trim();
    opts.onProgress?.(i + 1, total, t.terminalName);

    if (!storeId) {
      const deviceResult: MposSendDeviceResult = {
        terminalDeviceId: t.terminalDeviceId,
        terminalName: t.terminalName,
        storeId: '',
        ok: false,
        message: 'Mağaza (işyeri) bağlantısı yok.',
        count: 0,
      };
      results.push(deviceResult);
      opts.onDeviceResult?.(deviceResult);
      failed += 1;
      if (errors.length < 3) errors.push(`${t.terminalName}: mağaza bağlantısı yok`);
      continue;
    }

    const r = await sendMposInfoToKasa({
      fileType: opts.fileType,
      storeId,
      terminalName: t.terminalName,
      terminalDeviceId: t.terminalDeviceId,
      includeProductImages: opts.includeProductImages,
      syncMode: opts.syncMode,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
    });
    await logTerminalSync({
      storeId,
      terminalName: t.terminalName,
      terminalDeviceId: t.terminalDeviceId,
      direction: 'send',
      fileType: opts.fileType,
      status: r.ok ? 'ok' : 'failed',
      recordCount: r.count,
      message: r.message,
    });

    const deviceResult: MposSendDeviceResult = {
      terminalDeviceId: t.terminalDeviceId,
      terminalName: t.terminalName,
      storeId,
      ok: r.ok,
      message: r.message,
      count: r.count,
    };
    results.push(deviceResult);
    opts.onDeviceResult?.(deviceResult);

    if (r.ok) {
      success += 1;
      if (!pushedStores.has(storeId)) {
        await pushMasterDataToBranches({ targetStoreId: storeId });
        pushedStores.add(storeId);
      }
      const { requestMposSyncPullNotify } = await import('./mposKasaAutoPullService');
      requestMposSyncPullNotify({ storeId, terminalName: t.terminalName });
    } else {
      failed += 1;
      if (errors.length < 3) errors.push(`${t.terminalName}: ${r.message}`);
    }
  }

  const msg =
    failed === 0
      ? `${success} kasaya gönderildi ve kuyruk iletildi.`
      : `${success} kasa başarılı, ${failed} hata.${errors.length ? ` ${errors.join('; ')}` : ''}`;

  return { ok: success > 0, message: msg, success, failed, results };
}

/** İşyerindeki tüm onaylı kasalara aynı dosya tipini gönder */
export async function sendMposInfoToAllKasasInStore(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminals: { terminalName: string; terminalDeviceId: string }[];
  includeProductImages?: boolean;
  syncMode?: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ ok: boolean; message: string; success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const t of opts.terminals) {
    const r = await sendMposInfoToKasa({
      fileType: opts.fileType,
      storeId: opts.storeId,
      terminalName: t.terminalName,
      terminalDeviceId: t.terminalDeviceId,
      includeProductImages: opts.includeProductImages,
      syncMode: opts.syncMode,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
    });
    await logTerminalSync({
      storeId: opts.storeId,
      terminalName: t.terminalName,
      terminalDeviceId: t.terminalDeviceId,
      direction: 'send',
      fileType: opts.fileType,
      status: r.ok ? 'ok' : 'failed',
      recordCount: r.count,
      message: r.message,
    });
    if (r.ok) success += 1;
    else {
      failed += 1;
      if (errors.length < 3) errors.push(`${t.terminalName}: ${r.message}`);
    }
  }

  if (success > 0) {
    await pushMasterDataToBranches({ targetStoreId: opts.storeId });
  }

  const msg =
    failed === 0
      ? `${success} kasaya gönderildi ve kuyruk iletildi.`
      : `${success} kasa başarılı, ${failed} hata.${errors.length ? ` ${errors.join('; ')}` : ''}`;

  return { ok: success > 0, message: msg, success, failed };
}
