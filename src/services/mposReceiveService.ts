/**
 * KLRetail M-POS «Bilgilerinin Alınması» — dosya tipi + işyeri + kasa (eğitim videosu devamı).
 */

import { logTerminalSync } from './mposSyncLogService';
import {
  pullBranchDataFromCenter,
  pullSalesAndDayEndFromBranches,
  processEnterpriseSyncQueue,
  resolveSyncPgEndpoint,
} from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';
import { ERP_SETTINGS } from './postgres';

export type MposReceiveFileType =
  | 'sales'
  | 'day_end'
  | 'z_report'
  | 'meal_voucher'
  | 'cashier_movements'
  | 'point_movements'
  | 'promotion_sales';

/** Kalem «Bilgi Al» — eğitim 1 (satış/günsonu) + eğitim 2 (puan/promosyon) */
export const MPOS_RECEIVE_FILE_TYPES: { id: MposReceiveFileType; label: string }[] = [
  { id: 'sales', label: 'Satış Verileri' },
  { id: 'day_end', label: 'Günsonu Verisi' },
  { id: 'z_report', label: 'Z Raporu / Kasa Özet' },
  { id: 'meal_voucher', label: 'Yemek Çeki Tahsilatları' },
  { id: 'cashier_movements', label: 'Kasiyer / Satıcı Hareketleri' },
  { id: 'point_movements', label: 'Puan Hareketleri (Kazanım / Harcama / İade)' },
  { id: 'promotion_sales', label: 'Promosyon Uygulama Verisi' },
];

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function periodSalesTable(): string {
  const f = firmNrPadded();
  const p = String(ERP_SETTINGS.periodNr || '01')
    .replace(/\D/g, '')
    .padStart(2, '0');
  return `rex_${f}_${p}_sales`;
}

async function logMposReceiveRequest(opts: {
  fileType: MposReceiveFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
  resultMessage: string;
  synced: number;
}): Promise<void> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  try {
    await queryPgRows(
      pg,
      `INSERT INTO sync_queue (
         table_name, record_id, action, firm_nr, data,
         source_store_id, terminal_name, status, synced_at
       )
       VALUES (
         $1, gen_random_uuid(), 'PULL', $2, $3::jsonb,
         $4::uuid, $5, 'completed', NOW()
       )`,
      [
        `mpos_receive_${opts.fileType}`,
        firm,
        JSON.stringify({
          mpos_receive_type: opts.fileType,
          terminal_device_id: opts.terminalDeviceId,
          terminal_name: opts.terminalName,
          message: opts.resultMessage,
          synced: opts.synced,
          received_at: new Date().toISOString(),
        }),
        opts.storeId,
        opts.terminalName || null,
      ],
    );
  } catch {
    /* opsiyonel günlük */
  }
}

/** Seçili kasadan dosya tipine göre bilgi al (merkeze çek) */
export async function receiveMposInfoFromKasa(opts: {
  fileType: MposReceiveFileType;
  storeId: string;
  terminalName: string;
  terminalDeviceId: string;
  businessDate?: string;
}): Promise<{ ok: boolean; message: string; synced: number }> {
  const { fileType, storeId, terminalName, terminalDeviceId, businessDate } = opts;
  const kasaLabel = terminalName ? `${terminalName}` : 'kasa';

  let result: { ok: boolean; message: string; synced: number };

  switch (fileType) {
    case 'sales': {
      const pull = await pullBranchDataFromCenter();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Satış verisi alındı (${pull.synced} kayıt).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'day_end': {
      const pull = await pullSalesAndDayEndFromBranches();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Günsonu verisi alındı (${pull.synced} kayıt).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'z_report': {
      const pull = await pullBranchDataFromCenter();
      await processEnterpriseSyncQueue();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Z raporu / kasa özeti işlendi.`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'meal_voucher': {
      const pg = resolveSyncPgEndpoint();
      const salesTable = periodSalesTable();
      let mealCount = 0;
      try {
        const rows = await queryPgRows(
          pg,
          `SELECT COUNT(*)::text AS cnt
           FROM ${salesTable} s
           WHERE s.store_id = $1::uuid
             AND s.created_at >= CURRENT_DATE
             AND (
               LOWER(COALESCE(s.payment_method, '')) LIKE '%yemek%'
               OR LOWER(COALESCE(s.payment_method, '')) LIKE '%meal%'
               OR LOWER(COALESCE(s.notes, '')) LIKE '%yemek%'
             )`,
          [storeId],
        );
        mealCount = Number(rows[0]?.cnt ?? 0);
      } catch {
        /* tablo yok */
      }
      const pull = await pullBranchDataFromCenter();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Yemek çeki tahsilatları alındı (bugün ${mealCount} kayıt).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'cashier_movements': {
      const pull = await pullBranchDataFromCenter();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Kasiyer/satıcı hareketleri alındı (${pull.synced} kayıt).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'point_movements': {
      const pull = await pullBranchDataFromCenter();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Puan hareketleri alındı — kazanım, harcama, iade (eğitim 2).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    case 'promotion_sales': {
      const pull = await pullSalesAndDayEndFromBranches();
      result = {
        ok: pull.ok,
        message: pull.ok
          ? `${kasaLabel}: Promosyon uygulama verisi alındı (${pull.synced} kayıt).`
          : pull.message,
        synced: pull.synced,
      };
      break;
    }
    default:
      return { ok: false, message: 'Desteklenmeyen dosya tipi.', synced: 0 };
  }

  if (result.ok) {
    await logTerminalSync({
      storeId,
      terminalName,
      terminalDeviceId,
      direction: 'receive',
      fileType,
      status: 'ok',
      recordCount: result.synced,
      businessDate: businessDate || null,
      message: result.message,
      detail: businessDate ? { businessDate } : {},
    });
    await logMposReceiveRequest({
      fileType,
      storeId,
      terminalName,
      terminalDeviceId,
      resultMessage: result.message,
      synced: result.synced,
    });
  }

  return result;
}

/** JRetail günsonu: seçili kasalardan iş gününe göre al */
export async function receiveDayEndFromKasas(opts: {
  storeId: string;
  businessDate: string;
  terminals: { terminalName: string; terminalDeviceId: string }[];
  onProgress?: (current: number, total: number, terminalName: string) => void;
}): Promise<{ ok: boolean; message: string; success: number; failed: number; synced: number }> {
  let success = 0;
  let failed = 0;
  let synced = 0;
  const errors: string[] = [];
  const total = opts.terminals.length;

  for (let i = 0; i < opts.terminals.length; i += 1) {
    const t = opts.terminals[i];
    opts.onProgress?.(i + 1, total, t.terminalName);
    const r = await receiveMposInfoFromKasa({
      fileType: 'day_end',
      storeId: opts.storeId,
      terminalName: t.terminalName,
      terminalDeviceId: t.terminalDeviceId,
      businessDate: opts.businessDate,
    });
    if (r.ok) {
      success += 1;
      synced += r.synced;
    } else {
      failed += 1;
      if (errors.length < 3) errors.push(`${t.terminalName}: ${r.message}`);
    }
  }

  const msg =
    failed === 0
      ? `${success} kasadan günsonu alındı (${opts.businessDate}, ${synced} kayıt).`
      : `${success} kasa başarılı, ${failed} hata.${errors.length ? ` ${errors.join('; ')}` : ''}`;

  return { ok: success > 0, message: msg, success, failed, synced };
}
