/**
 * WMS depo/ambar transferi — web warehouseTransferAPI + wms.transfers tabloları.
 * PostgREST önce (wms şeması), bridge SQL yedek.
 */

import { pgQuery } from './pgClient';
import {
  postgrestDelete,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import { firmNr, newUuid, productsTable } from './erpTables';
import { fetchCountingStores, lookupProductByBarcode, type WmsStore } from './wmsStockCountApi';

export type TransferStatus = 'pending' | 'in_transit' | 'completed' | 'cancelled';

export type WmsTransfer = {
  id: string;
  firm_nr: string;
  fiche_no: string;
  source_store_id: string;
  target_store_id: string;
  date: string;
  status: TransferStatus | string;
  created_at: string;
  source_store_name?: string | null;
  target_store_name?: string | null;
  item_count?: number;
};

export type WmsTransferItem = {
  id: string;
  transfer_id: string;
  product_id: string | null;
  quantity: number;
  notes?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  unit?: string | null;
};

export type TransferProductLookup = {
  id: string;
  name: string;
  code: string | null;
  barcode?: string | null;
  stock: number;
  unit?: string | null;
};

const WMS_SCHEMA = { schema: 'wms' as const };
const PUB_SCHEMA = { schema: 'public' as const };

function fn(): string {
  return firmNr();
}

async function fetchStoreNameMap(): Promise<Map<string, string>> {
  const rows = await postgrestGet<Array<{ id?: string; name?: string }>>(
    '/stores',
    { select: 'id,name', limit: 5000 },
    PUB_SCHEMA,
  );
  const map = new Map<string, string>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.id) map.set(String(r.id), String(r.name ?? ''));
  }
  return map;
}

async function restGenerateTransferFicheNo(): Promise<string> {
  const firm = fn();
  const year = new Date().getFullYear();
  const prefix = `TRF-${year}-`;
  const rows = await postgrestGet<Array<{ fiche_no: string }>>(
    '/transfers',
    {
      firm_nr: `eq.${firm}`,
      fiche_no: `like.${prefix}*`,
      select: 'fiche_no',
      order: 'fiche_no.desc',
      limit: 1,
    },
    WMS_SCHEMA,
  );
  let next = 1;
  const list = Array.isArray(rows) ? rows : [];
  if (list[0]?.fiche_no) {
    const m = String(list[0].fiche_no).match(new RegExp(`^TRF-${year}-(\\d+)$`));
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function fetchTransfersViaRest(limit = 100): Promise<WmsTransfer[]> {
  const firm = fn();
  const transfers = await postgrestGet<WmsTransfer[]>(
    '/transfers',
    {
      firm_nr: `eq.${firm}`,
      select: '*',
      order: 'created_at.desc',
      limit,
    },
    WMS_SCHEMA,
  );
  const list = Array.isArray(transfers) ? transfers : [];
  if (!list.length) return [];

  const ids = list.map((t) => t.id).filter(Boolean);
  const inList = ids.map((id) => String(id)).join(',');
  let itemRows: Array<{ transfer_id: string; id: string }> = [];
  try {
    itemRows = await postgrestGet<Array<{ transfer_id: string; id: string }>>(
      '/transfer_items',
      { transfer_id: `in.(${inList})`, select: 'transfer_id,id' },
      WMS_SCHEMA,
    );
  } catch (e) {
    rethrowTransportInfra(e, 'fetchTransfersViaRest.items');
    itemRows = [];
  }
  const countByTransfer: Record<string, number> = {};
  for (const l of Array.isArray(itemRows) ? itemRows : []) {
    const tid = String(l.transfer_id);
    countByTransfer[tid] = (countByTransfer[tid] || 0) + 1;
  }

  const storeMap = await fetchStoreNameMap();
  return list.map((t) => ({
    ...t,
    source_store_name: storeMap.get(String(t.source_store_id)) || null,
    target_store_name: storeMap.get(String(t.target_store_id)) || null,
    item_count: countByTransfer[String(t.id)] || 0,
  }));
}

async function fetchTransfersViaBridge(limit = 100): Promise<WmsTransfer[]> {
  const firm = fn();
  const res = await pgQuery<WmsTransfer>(
    `SELECT t.*,
            sf.name AS source_store_name,
            st.name AS target_store_name,
            COUNT(ti.id)::int AS item_count
     FROM wms.transfers t
     LEFT JOIN public.stores sf ON t.source_store_id = sf.id
     LEFT JOIN public.stores st ON t.target_store_id = st.id
     LEFT JOIN wms.transfer_items ti ON t.id = ti.transfer_id
     WHERE t.firm_nr = $1
     GROUP BY t.id, sf.name, st.name
     ORDER BY t.created_at DESC
     LIMIT $2`,
    [firm, limit],
  );
  return res.rows;
}

export async function fetchTransferStores(): Promise<WmsStore[]> {
  return fetchCountingStores();
}

export async function generateTransferFicheNo(): Promise<string> {
  return runDataTransport({
    label: 'generateTransferFicheNo',
    viaRest: restGenerateTransferFicheNo,
    viaBridge: async () => {
      const firm = fn();
      const year = new Date().getFullYear();
      const res = await pgQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM wms.transfers
         WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
        [firm, year],
      );
      const seq = (parseInt(res.rows[0]?.count || '0', 10) + 1).toString().padStart(4, '0');
      return `TRF-${year}-${seq}`;
    },
  });
}

export async function fetchTransfers(limit = 100): Promise<WmsTransfer[]> {
  return runDataTransport({
    label: 'fetchTransfers',
    viaRest: () => fetchTransfersViaRest(limit),
    viaBridge: () => fetchTransfersViaBridge(limit),
  });
}

async function fetchTransferWithItemsViaRest(
  transferId: string,
): Promise<{ transfer: WmsTransfer | null; items: WmsTransferItem[] }> {
  const transferRows = await postgrestGet<WmsTransfer[]>(
    '/transfers',
    { id: `eq.${transferId}`, select: '*', limit: 1 },
    WMS_SCHEMA,
  );
  const transfer = Array.isArray(transferRows) ? transferRows[0] ?? null : null;
  if (!transfer) return { transfer: null, items: [] };

  const storeMap = await fetchStoreNameMap();
  transfer.source_store_name = storeMap.get(String(transfer.source_store_id)) || null;
  transfer.target_store_name = storeMap.get(String(transfer.target_store_id)) || null;

  const itemRows = await postgrestGet<WmsTransferItem[]>(
    '/transfer_items',
    {
      transfer_id: `eq.${transferId}`,
      select: '*',
      order: 'created_at.asc,id.asc',
    },
    WMS_SCHEMA,
  );
  const items = Array.isArray(itemRows) ? itemRows : [];
  const productIds = items.map((i) => i.product_id).filter(Boolean) as string[];
  const prodMap = new Map<string, { name?: string; code?: string; unit?: string }>();
  if (productIds.length) {
    const inList = productIds.map((id) => encodeURIComponent(id)).join(',');
    try {
      const prows = await postgrestGet<Record<string, unknown>[]>(
        `/${productsTable()}`,
        { id: `in.(${inList})`, select: 'id,name,code,unit' },
        PUB_SCHEMA,
      );
      for (const p of Array.isArray(prows) ? prows : []) {
        prodMap.set(String(p.id), {
          name: p.name != null ? String(p.name) : undefined,
          code: p.code != null ? String(p.code) : undefined,
          unit: p.unit != null ? String(p.unit) : undefined,
        });
      }
    } catch (e) {
      rethrowTransportInfra(e, 'fetchTransferWithItems.products');
    }
  }

  return {
    transfer,
    items: items.map((ti) => {
      const p = ti.product_id ? prodMap.get(String(ti.product_id)) : undefined;
      return {
        ...ti,
        product_name: p?.name ?? ti.product_name ?? null,
        product_code: p?.code ?? ti.product_code ?? null,
        unit: p?.unit ?? ti.unit ?? 'Adet',
      };
    }),
  };
}

async function fetchTransferWithItemsViaBridge(
  transferId: string,
): Promise<{ transfer: WmsTransfer | null; items: WmsTransferItem[] }> {
  const transferRes = await pgQuery<WmsTransfer>(
    `SELECT t.*,
            sf.name AS source_store_name,
            st.name AS target_store_name
     FROM wms.transfers t
     LEFT JOIN public.stores sf ON t.source_store_id = sf.id
     LEFT JOIN public.stores st ON t.target_store_id = st.id
     WHERE t.id = $1::uuid`,
    [transferId],
  );
  const itemsRes = await pgQuery<WmsTransferItem>(
    `SELECT ti.*,
            p.name AS product_name,
            p.code AS product_code,
            COALESCE(p.unit, 'Adet') AS unit
     FROM wms.transfer_items ti
     LEFT JOIN ${productsTable()} p ON ti.product_id = p.id
     WHERE ti.transfer_id = $1::uuid
     ORDER BY ti.created_at ASC, ti.id ASC`,
    [transferId],
  );
  return { transfer: transferRes.rows[0] ?? null, items: itemsRes.rows };
}

export async function fetchTransferWithItems(
  transferId: string,
): Promise<{ transfer: WmsTransfer | null; items: WmsTransferItem[] }> {
  return runDataTransport({
    label: 'fetchTransferWithItems',
    viaRest: () => fetchTransferWithItemsViaRest(transferId),
    viaBridge: () => fetchTransferWithItemsViaBridge(transferId),
  });
}

async function createTransferViaRest(data: {
  source_store_id: string;
  target_store_id: string;
}): Promise<WmsTransfer> {
  const firm = fn();
  const ficheNo = await restGenerateTransferFicheNo();
  const created = await postgrestPost<WmsTransfer[]>(
    '/transfers',
    {
      firm_nr: firm,
      fiche_no: ficheNo,
      source_store_id: data.source_store_id,
      target_store_id: data.target_store_id,
      date: new Date().toISOString(),
      status: 'pending',
    },
    { ...WMS_SCHEMA, prefer: 'return=representation' },
  );
  const row = Array.isArray(created) ? created[0] : created;
  if (!row) throw new Error('Transfer oluşturulamadı (PostgREST)');
  return row;
}

export async function createTransfer(data: {
  source_store_id: string;
  target_store_id: string;
}): Promise<WmsTransfer> {
  if (data.source_store_id === data.target_store_id) {
    throw new Error('Kaynak ve hedef depo aynı olamaz');
  }
  return runDataTransport({
    label: 'createTransfer',
    viaRest: () => createTransferViaRest(data),
    viaBridge: async () => {
      const firm = fn();
      const ficheNo = await generateTransferFicheNo();
      const res = await pgQuery<WmsTransfer>(
        `INSERT INTO wms.transfers
           (firm_nr, fiche_no, source_store_id, target_store_id, date, status)
         VALUES ($1, $2, $3::uuid, $4::uuid, NOW(), 'pending')
         RETURNING *`,
        [firm, ficheNo, data.source_store_id, data.target_store_id],
      );
      const transfer = res.rows[0];
      if (!transfer) throw new Error('Transfer oluşturulamadı');
      return transfer;
    },
  });
}

export async function lookupTransferProduct(barcode: string): Promise<TransferProductLookup | null> {
  const product = await lookupProductByBarcode(barcode);
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    barcode: product.barcode,
    stock: product.stock,
    unit: product.unit,
  };
}

export async function getTransferItemByProduct(
  transferId: string,
  productId: string,
): Promise<WmsTransferItem | null> {
  const { items } = await fetchTransferWithItems(transferId);
  return items.find((i) => String(i.product_id) === String(productId)) ?? null;
}

export async function upsertTransferItem(
  transferId: string,
  data: {
    product_id: string;
    quantity: number;
    notes?: string;
  },
): Promise<WmsTransferItem> {
  const existing = await getTransferItemByProduct(transferId, data.product_id);
  if (existing) {
    return runDataTransport({
      label: 'upsertTransferItem.update',
      viaRest: async () => {
        const updated = await postgrestPatch<WmsTransferItem[]>(
          `/transfer_items?id=eq.${encodeURIComponent(String(existing.id))}`,
          {
            quantity: data.quantity,
            notes: data.notes ?? existing.notes ?? null,
          },
          { ...WMS_SCHEMA, prefer: 'return=representation' },
        );
        const row = Array.isArray(updated) ? updated[0] : updated;
        if (!row) throw new Error('Transfer satırı güncellenemedi');
        return row;
      },
      viaBridge: async () => {
        const res = await pgQuery<WmsTransferItem>(
          `UPDATE wms.transfer_items
           SET quantity = $2,
               notes = COALESCE($3, notes),
               updated_at = NOW()
           WHERE id = $1::uuid
           RETURNING *`,
          [existing.id, data.quantity, data.notes || null],
        );
        const row = res.rows[0];
        if (!row) throw new Error('Transfer satırı güncellenemedi');
        return row;
      },
    });
  }

  const lineId = newUuid();
  return runDataTransport({
    label: 'upsertTransferItem.insert',
    viaRest: async () => {
      const ins = await postgrestPost<WmsTransferItem[]>(
        '/transfer_items',
        {
          id: lineId,
          transfer_id: transferId,
          product_id: data.product_id,
          quantity: data.quantity,
          notes: data.notes ?? null,
        },
        { ...WMS_SCHEMA, prefer: 'return=representation' },
      );
      const row = Array.isArray(ins) ? ins[0] : ins;
      if (!row) throw new Error('Transfer satırı eklenemedi');
      return row;
    },
    viaBridge: async () => {
      const res = await pgQuery<WmsTransferItem>(
        `INSERT INTO wms.transfer_items (id, transfer_id, product_id, quantity, notes)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         RETURNING *`,
        [lineId, transferId, data.product_id, data.quantity, data.notes || null],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Transfer satırı eklenemedi');
      return row;
    },
  });
}

export async function deleteTransferItem(itemId: string): Promise<void> {
  await runDataTransport({
    label: 'deleteTransferItem',
    viaRest: async () => {
      await postgrestDelete(`/transfer_items?id=eq.${encodeURIComponent(itemId)}`, {
        ...WMS_SCHEMA,
        prefer: 'return=minimal',
      });
    },
    viaBridge: async () => {
      await pgQuery(`DELETE FROM wms.transfer_items WHERE id = $1::uuid`, [itemId]);
    },
  });
}

export async function updateTransferStatus(
  transferId: string,
  status: TransferStatus,
): Promise<void> {
  await runDataTransport({
    label: 'updateTransferStatus',
    viaRest: async () => {
      await postgrestPatch(
        `/transfers?id=eq.${encodeURIComponent(transferId)}`,
        { status },
        { ...WMS_SCHEMA, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      await pgQuery(`UPDATE wms.transfers SET status = $2 WHERE id = $1::uuid`, [
        transferId,
        status,
      ]);
    },
  });
}

export async function cancelTransfer(transferId: string): Promise<void> {
  await updateTransferStatus(transferId, 'cancelled');
}

export async function completeTransfer(transferId: string): Promise<void> {
  const { transfer, items } = await fetchTransferWithItems(transferId);
  if (!transfer) throw new Error('Transfer bulunamadı');
  if (transfer.status === 'completed' || transfer.status === 'cancelled') {
    throw new Error('Bu transfer zaten kapatılmış');
  }
  if (items.length === 0) {
    throw new Error('Transfer satırı olmadan tamamlanamaz');
  }
  await updateTransferStatus(transferId, 'completed');
}

export function transferStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Bekliyor',
    in_transit: 'Yolda',
    completed: 'Tamamlandı',
    cancelled: 'İptal',
  };
  return map[status] ?? status;
}
