/**
 * KLRetail M-POS «Bilgilerinin Alınması» — dosya tipi + işyeri + kasa (eğitim videosu devamı).
 */

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
  | 'cashier_movements';

/** Kalem M-POS «Bilgi Al» dosya tipleri (satış → günsonu → rapor akışı) */
export const MPOS_RECEIVE_FILE_TYPES: { id: MposReceiveFileType; label: string }[] = [
  { id: 'sales', label: 'Satış Verileri' },
  { id: 'day_end', label: 'Günsonu Verisi' },
  { id: 'z_report', label: 'Z Raporu / Kasa Özet' },
  { id: 'meal_voucher', label: 'Yemek Çeki Tahsilatları' },
  { id: 'cashier_movements', label: 'Kasiyer / Satıcı Hareketleri' },
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
}): Promise<{ ok: boolean; message: string; synced: number }> {
  const { fileType, storeId, terminalName, terminalDeviceId } = opts;
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
    default:
      return { ok: false, message: 'Desteklenmeyen dosya tipi.', synced: 0 };
  }

  if (result.ok) {
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
