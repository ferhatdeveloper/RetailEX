/**
 * M-POS veri aktarımı önizlemesi — merkez panel modalında «neler gidecek / gelecek» özeti.
 */

import { ERP_SETTINGS } from './postgres';
import { queryPgRows } from './hybridSyncEngine';
import { resolveSyncPgEndpoint } from './enterpriseSyncService';
import type { MposSendFileType, MposSendSyncMode } from './mposSendService';
import { MPOS_SEND_FILE_TYPES } from './mposSendService';
import type { MposReceiveFileType } from './mposReceiveService';
import { MPOS_RECEIVE_FILE_TYPES } from './mposReceiveService';

export type MposPreviewLine = {
  key: string;
  label: string;
  count: number;
  hint?: string;
};

export type MposTransferPreview = {
  sendLines: MposPreviewLine[];
  receiveLines: MposPreviewLine[];
  sendTotal: number;
  receiveTotal: number;
};

const TABLE_LABELS: Record<string, string> = {
  products: 'Malzeme / fiyat',
  rex_products: 'Malzeme / fiyat',
  customers: 'Cari kart',
  sales: 'Satış fişi',
  invoices: 'Fatura',
  invoice_items: 'Fatura satırı',
  day_end: 'Günsonu',
  campaigns: 'Promosyon',
};

function firmNrPadded(firmNr?: string): string {
  return String(firmNr || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

function periodSalesTable(firmNr?: string): string {
  const f = firmNrPadded(firmNr);
  const p = String(ERP_SETTINGS.periodNr || '01')
    .replace(/\D/g, '')
    .padStart(2, '0');
  return `rex_${f}_${p}_sales`;
}

function productsTable(firmNr?: string): string {
  return `rex_${firmNrPadded(firmNr)}_products`;
}

function labelForTable(name: string): string {
  const base = name.replace(/^rex_\d+_/, '').replace(/^rex_\d+_\d+_/, '');
  return TABLE_LABELS[base] ?? TABLE_LABELS[name] ?? name.replace(/_/g, ' ');
}

async function countQueueByDirection(opts: {
  firmNr: string;
  storeId: string;
  terminalName?: string;
  direction: 'outbound' | 'inbound';
}): Promise<MposPreviewLine[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded(opts.firmNr);
  const term = opts.terminalName?.trim() || null;

  const params: unknown[] = [opts.storeId, firm];
  let termFilter = '';
  if (term) {
    params.push(term);
    termFilter = ` AND (terminal_name IS NULL OR btrim(terminal_name) = '' OR terminal_name = $3)`;
  }

  const storeMatch =
    opts.direction === 'outbound'
      ? `(target_store_id = $1::uuid OR (target_store_id IS NULL AND (firm_nr = $2 OR lpad(ltrim(firm_nr, '0'), 3, '0') = $2)))`
      : `source_store_id = $1::uuid`;

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT table_name, COUNT(*)::text AS cnt
       FROM sync_queue
       WHERE status = 'pending' AND ${storeMatch}${termFilter}
       GROUP BY table_name
       ORDER BY COUNT(*) DESC
       LIMIT 12`,
      params,
    );
    return rows.map((r: { table_name?: string; cnt?: string }) => ({
      key: String(r.table_name ?? ''),
      label: labelForTable(String(r.table_name ?? '')),
      count: Number(r.cnt ?? 0),
      hint:
        opts.direction === 'outbound'
          ? 'Merkez → kasa kuyruğu'
          : 'Kasa → merkez kuyruğu',
    }));
  } catch {
    return [];
  }
}

async function countMasterChanges(opts: {
  firmNr: string;
  fileType: MposSendFileType;
  syncMode: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
}): Promise<number> {
  if (opts.fileType !== 'products' && opts.fileType !== 'customers') return 0;
  const pg = resolveSyncPgEndpoint();
  const table =
    opts.fileType === 'products' ? productsTable(opts.firmNr) : `rex_${firmNrPadded(opts.firmNr)}_customers`;
  const changedSince =
    opts.syncMode === 'incremental' && opts.dateFrom?.trim()
      ? opts.dateFrom.trim()
      : null;
  const changedUntil = opts.syncMode === 'incremental' && opts.dateTo?.trim() ? opts.dateTo.trim() : null;

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT COUNT(*)::text AS cnt FROM ${table} t
       WHERE COALESCE(t.is_active, true) = true
         AND ($1::date IS NULL OR t.updated_at >= $1::date)
         AND ($2::date IS NULL OR t.updated_at < ($2::date + interval '1 day'))`,
      [changedSince, changedUntil],
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

async function countBranchSales(opts: {
  firmNr: string;
  storeId: string;
  terminalName?: string;
}): Promise<number> {
  const pg = resolveSyncPgEndpoint();
  const table = periodSalesTable(opts.firmNr);
  const term = opts.terminalName?.trim() || null;
  try {
    const rows = await queryPgRows(
      pg,
      `SELECT COUNT(*)::text AS cnt FROM ${table} s
       WHERE s.store_id = $1::uuid
         AND ($2::text IS NULL OR COALESCE(s.cashier, s.terminal_name, '') ILIKE $2 OR $2 IS NULL)
         AND s.created_at >= CURRENT_DATE`,
      [opts.storeId, term ? `%${term}%` : null],
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

function sendTypeLabel(fileType: MposSendFileType, syncMode: MposSendSyncMode): string {
  if (fileType === 'products') {
    return syncMode === 'incremental'
      ? 'Fiyat / malzeme değişikliği (tarih aralığı)'
      : 'Tüm malzeme kartları';
  }
  if (fileType === 'customers') {
    return syncMode === 'incremental'
      ? 'Cari değişiklikleri (tarih aralığı)'
      : 'Tüm cari kartları';
  }
  return MPOS_SEND_FILE_TYPES.find((f) => f.id === fileType)?.label ?? fileType;
}

function mergePreviewLines(lines: MposPreviewLine[]): MposPreviewLine[] {
  const map = new Map<string, MposPreviewLine>();
  for (const line of lines) {
    const prev = map.get(line.key);
    if (prev) {
      map.set(line.key, { ...prev, count: prev.count + line.count });
    } else {
      map.set(line.key, { ...line });
    }
  }
  return Array.from(map.values());
}

export async function getMposTransferPreview(opts: {
  firmNr: string;
  storeId?: string;
  terminalName?: string;
  sendFileTypes: MposSendFileType[];
  receiveFileTypes: MposReceiveFileType[];
  syncMode: MposSendSyncMode;
  dateFrom?: string;
  dateTo?: string;
}): Promise<MposTransferPreview> {
  const storeId = opts.storeId?.trim();
  const sendTypes = opts.sendFileTypes.length ? opts.sendFileTypes : (['products'] as MposSendFileType[]);
  const receiveTypes = opts.receiveFileTypes.length ? opts.receiveFileTypes : (['sales'] as MposReceiveFileType[]);

  if (!storeId) {
    return { sendLines: [], receiveLines: [], sendTotal: 0, receiveTotal: 0 };
  }

  const [outboundQueue, inboundQueue, todaySales, ...masterCounts] = await Promise.all([
    countQueueByDirection({
      firmNr: opts.firmNr,
      storeId,
      terminalName: opts.terminalName,
      direction: 'outbound',
    }),
    countQueueByDirection({
      firmNr: opts.firmNr,
      storeId,
      terminalName: opts.terminalName,
      direction: 'inbound',
    }),
    countBranchSales({
      firmNr: opts.firmNr,
      storeId,
      terminalName: opts.terminalName,
    }),
    ...sendTypes
      .filter((t) => t === 'products' || t === 'customers')
      .map((fileType) =>
        countMasterChanges({
          firmNr: opts.firmNr,
          fileType,
          syncMode: opts.syncMode,
          dateFrom: opts.dateFrom,
          dateTo: opts.dateTo,
        }),
      ),
  ]);

  const masterByType = new Map<MposSendFileType, number>();
  let mi = 0;
  for (const fileType of sendTypes) {
    if (fileType === 'products' || fileType === 'customers') {
      masterByType.set(fileType, Number(masterCounts[mi++] ?? 0));
    }
  }

  const queueTotal = outboundQueue.reduce((s, l) => s + l.count, 0);
  const sendLines: MposPreviewLine[] = [...outboundQueue];

  for (const fileType of sendTypes) {
    if (fileType === 'products' || fileType === 'customers') {
      sendLines.unshift({
        key: fileType,
        label: sendTypeLabel(fileType, opts.syncMode),
        count: masterByType.get(fileType) ?? 0,
        hint:
          opts.syncMode === 'incremental'
            ? 'updated_at ile filtrelenir (merkez PG)'
            : 'Merkezden kasaya gönderilecek',
      });
    } else {
      sendLines.unshift({
        key: fileType,
        label: sendTypeLabel(fileType, opts.syncMode),
        count: 0,
        hint: 'Merkez → kasa paketi',
      });
    }
  }

  const mergedSendLines = mergePreviewLines(sendLines);
  const masterSum = [...masterByType.values()].reduce((s, n) => s + n, 0);
  const hasIncrementalMaster =
    opts.syncMode === 'incremental' &&
    sendTypes.some((t) => t === 'products' || t === 'customers');
  const sendTotal = hasIncrementalMaster
    ? Math.max(masterSum, queueTotal)
    : mergedSendLines.reduce((s, l) => s + l.count, 0);

  const receiveLines: MposPreviewLine[] = [...inboundQueue];
  const inboundQueueSales = inboundQueue
    .filter((l) => /invoice|sales|fatura/i.test(l.key))
    .reduce((s, l) => s + l.count, 0);

  if (receiveTypes.some((t) => t === 'sales' || t === 'day_end')) {
    receiveLines.unshift({
      key: 'today_sales',
      label: 'Bugünkü satış / fiş (merkez PG)',
      count: todaySales,
      hint:
        todaySales > 0
          ? 'Kasa → merkez kayıtlı'
          : 'Kasada satış varsa «Al» ile merkeze iletilir',
    });
  }

  for (const fileType of receiveTypes) {
    const label = MPOS_RECEIVE_FILE_TYPES.find((f) => f.id === fileType)?.label ?? fileType;
    if (fileType === 'sales' || fileType === 'day_end') continue;
    receiveLines.unshift({
      key: `receive_${fileType}`,
      label,
      count: 0,
      hint: 'Kasa → merkez «Al» ile çekilir',
    });
  }

  receiveLines.push({
    key: 'invoices_note',
    label: 'Fatura / fiş kuyruğu',
    count: inboundQueueSales,
    hint: 'Kuyrukta bekleyen satış/fatura',
  });

  const mergedReceiveLines = mergePreviewLines(receiveLines);
  const receiveTotal = Math.max(
    todaySales,
    inboundQueueSales,
    inboundQueue.reduce((s, l) => s + l.count, 0),
  );

  return {
    sendLines: mergedSendLines,
    receiveLines: mergedReceiveLines,
    sendTotal,
    receiveTotal,
  };
}
