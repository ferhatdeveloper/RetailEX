/**
 * WMS depo/ambar transferi — web warehouseTransferAPI + wms.transfers tabloları.
 * Mobil bridge (pgClient) üzerinden ham SQL.
 */

import { pgQuery } from './pgClient';
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

function fn(): string {
  return firmNr();
}

export async function fetchTransferStores(): Promise<WmsStore[]> {
  return fetchCountingStores();
}

export async function generateTransferFicheNo(): Promise<string> {
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
}

export async function fetchTransfers(limit = 100): Promise<WmsTransfer[]> {
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

export async function fetchTransferWithItems(
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

export async function createTransfer(data: {
  source_store_id: string;
  target_store_id: string;
}): Promise<WmsTransfer> {
  if (data.source_store_id === data.target_store_id) {
    throw new Error('Kaynak ve hedef depo aynı olamaz');
  }
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
  const res = await pgQuery<WmsTransferItem>(
    `SELECT ti.*,
            p.name AS product_name,
            p.code AS product_code
     FROM wms.transfer_items ti
     LEFT JOIN ${productsTable()} p ON ti.product_id = p.id
     WHERE ti.transfer_id = $1::uuid AND ti.product_id = $2::uuid
     LIMIT 1`,
    [transferId, productId],
  );
  return res.rows[0] ?? null;
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
  }

  const lineId = newUuid();
  const res = await pgQuery<WmsTransferItem>(
    `INSERT INTO wms.transfer_items (id, transfer_id, product_id, quantity, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
     RETURNING *`,
    [lineId, transferId, data.product_id, data.quantity, data.notes || null],
  );
  const row = res.rows[0];
  if (!row) throw new Error('Transfer satırı eklenemedi');
  return row;
}

export async function deleteTransferItem(itemId: string): Promise<void> {
  await pgQuery(`DELETE FROM wms.transfer_items WHERE id = $1::uuid`, [itemId]);
}

export async function updateTransferStatus(
  transferId: string,
  status: TransferStatus,
): Promise<void> {
  await pgQuery(`UPDATE wms.transfers SET status = $2 WHERE id = $1::uuid`, [transferId, status]);
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
