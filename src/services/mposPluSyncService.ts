/**
 * PLU / kısayol tuş (48 slot) — merkezden kasaya gönderim.
 */

import { ERP_SETTINGS } from './postgres';
import { resolveSyncPgEndpoint } from './enterpriseSyncService';
import { queryPgRows } from './hybridSyncEngine';
import type { MposSendFileType } from './mposSendService';

export type PosQuickSlot = {
  pageIndex: number;
  slotIndex: number;
  productId: string | null;
  productCode?: string;
  productName?: string;
  barcode?: string;
  price?: number;
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
}

/** İşyeri PLU tanımlarını oku; yoksa aktif ürünlerden otomatik 48 slot üret */
export async function loadStoreQuickSlots(storeId: string): Promise<PosQuickSlot[]> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  const productsTable = `rex_${firm}_products`;

  try {
    const configured = await queryPgRows(
      pg,
      `SELECT q.page_index, q.slot_index, q.product_id::text AS product_id,
              p.code AS product_code, p.name AS product_name,
              p.barcode, COALESCE(p.sale_price, p.price, 0)::float AS price
       FROM pos_quick_slots q
       LEFT JOIN ${productsTable} p ON p.id = q.product_id
       WHERE q.store_id = $1::uuid AND q.firm_nr = $2
       ORDER BY q.page_index, q.slot_index`,
      [storeId, firm],
    );
    if (configured.length > 0) {
      return configured.map((r: Record<string, unknown>) => ({
        pageIndex: Number(r.page_index ?? 0),
        slotIndex: Number(r.slot_index ?? 0),
        productId: r.product_id ? String(r.product_id) : null,
        productCode: r.product_code ? String(r.product_code) : undefined,
        productName: r.product_name ? String(r.product_name) : undefined,
        barcode: r.barcode ? String(r.barcode) : undefined,
        price: Number(r.price ?? 0),
      }));
    }
  } catch {
    /* pos_quick_slots yok — fallback */
  }

  try {
    const rows = await queryPgRows(
      pg,
      `SELECT id::text AS product_id, code AS product_code, name AS product_name,
              barcode, COALESCE(sale_price, price, 0)::float AS price
       FROM ${productsTable}
       WHERE COALESCE(is_active, true) = true
       ORDER BY updated_at DESC NULLS LAST, name
       LIMIT 48`,
      [],
    );
    return rows.map((r: Record<string, unknown>, idx: number) => ({
      pageIndex: Math.floor(idx / 12),
      slotIndex: idx % 12,
      productId: String(r.product_id),
      productCode: r.product_code ? String(r.product_code) : undefined,
      productName: r.product_name ? String(r.product_name) : undefined,
      barcode: r.barcode ? String(r.barcode) : undefined,
      price: Number(r.price ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function upsertStoreQuickSlot(opts: {
  storeId: string;
  pageIndex: number;
  slotIndex: number;
  productId: string | null;
}): Promise<boolean> {
  const pg = resolveSyncPgEndpoint();
  const firm = firmNrPadded();
  try {
    if (!opts.productId) {
      await queryPgRows(
        pg,
        `DELETE FROM pos_quick_slots
         WHERE store_id = $1::uuid AND firm_nr = $2
           AND page_index = $3 AND slot_index = $4`,
        [opts.storeId, firm, opts.pageIndex, opts.slotIndex],
      );
      return true;
    }
    await queryPgRows(
      pg,
      `INSERT INTO pos_quick_slots (firm_nr, store_id, page_index, slot_index, product_id, updated_at)
       VALUES ($1, $2::uuid, $3, $4, $5::uuid, NOW())
       ON CONFLICT (store_id, page_index, slot_index)
       DO UPDATE SET product_id = EXCLUDED.product_id, firm_nr = EXCLUDED.firm_nr, updated_at = NOW()`,
      [firm, opts.storeId, opts.pageIndex, opts.slotIndex, opts.productId],
    );
    return true;
  } catch {
    return false;
  }
}

/** Kasa kuyruğuna PLU/kısayol payload */
export async function buildPluShortcutsPayload(storeId: string): Promise<{
  slots: PosQuickSlot[];
  pages: Record<string, PosQuickSlot[]>;
  slotCount: number;
}> {
  const slots = await loadStoreQuickSlots(storeId);
  const pages: Record<string, PosQuickSlot[]> = {};
  for (const s of slots) {
    const key = String(s.pageIndex);
    if (!pages[key]) pages[key] = [];
    pages[key].push(s);
  }
  return { slots, pages, slotCount: slots.filter((s) => s.productId).length };
}

export function pluFileTypeLabel(): MposSendFileType {
  return 'shortcuts';
}
