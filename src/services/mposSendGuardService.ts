/**
 * KLR-2273 — M-POS gönderim öncesi günlük durum kontrolü.
 * Yalnızca bugünün kayıtları dikkate alınır; dün «alınamadı» bugün tekrar gönderime engel olmaz.
 */

import type { MposSendFileType } from './mposSendService';
import { resolveSyncPgEndpoint } from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';
import { ERP_SETTINGS } from './postgres';

export type MposSendGuardResult = {
  allowed: boolean;
  requireConfirm: boolean;
  message: string;
  sentToday: number;
  pendingToday: number;
  receivedToday: number;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function tableNamesForFileType(fileType: MposSendFileType, firm: string): string[] {
  switch (fileType) {
    case 'products':
      return [`rex_${firm}_products`];
    case 'customers':
    case 'customer_balance_risk':
      return [`rex_${firm}_customers`];
    case 'campaign_points':
    case 'promotions':
      return [`rex_${firm}_campaigns`];
    case 'exchange_rates':
      return ['exchange_rates'];
    case 'cashiers':
      return ['users'];
    default:
      return [`mpos_${fileType}`];
  }
}

/** Gönderim öncesi KLR-2273 kontrolü */
export async function checkMposSendGuard(opts: {
  fileType: MposSendFileType;
  storeId: string;
  terminalName: string;
}): Promise<MposSendGuardResult> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const tables = tableNamesForFileType(opts.fileType, firm);
  const term = opts.terminalName?.trim() || '';

  if (!opts.storeId || !term) {
    return {
      allowed: false,
      requireConfirm: false,
      message: 'İşyeri ve kasa seçilmeli.',
      sentToday: 0,
      pendingToday: 0,
      receivedToday: 0,
    };
  }

  try {
    const [sendRows, recvRows] = await Promise.all([
      queryPgRows(
        pg,
        `SELECT
           COUNT(*) FILTER (WHERE status = 'completed' AND synced_at >= CURRENT_DATE)::text AS sent,
           COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
         FROM sync_queue
         WHERE target_store_id = $1::uuid
           AND terminal_name = $2
           AND table_name = ANY($3::text[])`,
        [opts.storeId, term, tables],
      ),
      queryPgRows(
        pg,
        `SELECT COUNT(*)::text AS cnt
         FROM sync_queue
         WHERE source_store_id = $1::uuid
           AND terminal_name = $2
           AND table_name LIKE 'mpos_receive_%'
           AND status = 'completed'
           AND synced_at >= CURRENT_DATE`,
        [opts.storeId, term],
      ),
    ]);

    const sentToday = Number(sendRows[0]?.sent ?? 0);
    const pendingToday = Number(sendRows[0]?.pending ?? 0);
    const receivedToday = Number(recvRows[0]?.cnt ?? 0);

    if (pendingToday > 0) {
      return {
        allowed: true,
        requireConfirm: true,
        message: `Bu kasa için ${pendingToday} bekleyen gönderim var. Yine de ekle?`,
        sentToday,
        pendingToday,
        receivedToday,
      };
    }

    const configTypes: MposSendFileType[] = [
      'program_info',
      'shortcuts',
      'receipt_design',
      'version_update_center',
      'version_update_local',
      'point_adapter',
      'payment_keys',
      'card_password',
    ];

    if (sentToday > 0 && configTypes.includes(opts.fileType)) {
      const recvNote =
        receivedToday > 0 ? ' Kasa bugün veri aldı.' : ' Kasa henüz veri almadı — tekrar gönderim uygun.';
      return {
        allowed: true,
        requireConfirm: true,
        message: `Bugün bu dosya tipi zaten gönderildi (${sentToday}). Tekrar gönder?${recvNote}`,
        sentToday,
        pendingToday,
        receivedToday,
      };
    }

    if (sentToday > 0 && receivedToday > 0) {
      return {
        allowed: true,
        requireConfirm: true,
        message: 'Bugün gönderim yapıldı ve kasa veri aldı. Güncelleme için tekrar gönder?',
        sentToday,
        pendingToday,
        receivedToday,
      };
    }

    return {
      allowed: true,
      requireConfirm: false,
      message:
        sentToday > 0
          ? 'Bugün gönderim var; kasa henüz almadı — tekrar gönderim önerilir.'
          : 'Gönderime hazır.',
      sentToday,
      pendingToday,
      receivedToday,
    };
  } catch {
    return {
      allowed: true,
      requireConfirm: false,
      message: 'Durum kontrolü atlandı.',
      sentToday: 0,
      pendingToday: 0,
      receivedToday: 0,
    };
  }
}
