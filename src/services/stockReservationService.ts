/**
 * Stok Rezervasyonu Servisi
 *
 * Tek başına `avansService` tarafından kullanılır; ayrıca UI tarafında
 * da import edilebilir (ürün detay sayfası, stok ekranı).
 *
 * `avansService.recordAdvance` zaten rezervasyonu otomatik yazar; bu
 * modül:
 *   - Ürün için "available" (kullanılabilir) stok hesabı
 *   - Müşteri için açık rezervasyon listesi
 *   - Manuel reserve / release (admin / test için)
 *
 * `available = stock - sum(reserved_quantity WHERE status='reserved')`
 */

import { postgres, ERP_SETTINGS } from './postgres';
import type { InventoryReservation } from '../core/types/avans';
import { getReservedQuantityForProduct, listActiveReservationsForCustomer } from './avansService';

function getProductsTable(): string {
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  return `rex_${firm}_products`;
}

/**
 * Ürünün mevcut (kullanılabilir) stok miktarı.
 *  available = stock - reserved
 */
export async function getAvailableStock(productId: string): Promise<{
  stock: number;
  reserved: number;
  available: number;
}> {
  if (!productId) return { stock: 0, reserved: 0, available: 0 };
  const tbl = getProductsTable();
  const { rows } = await postgres.query(
    `SELECT COALESCE(stock, 0) AS stock FROM ${tbl} WHERE id = $1`,
    [productId],
  );
  const stock = Number(rows?.[0]?.stock ?? 0);
  const reserved = await getReservedQuantityForProduct(productId);
  const available = Math.max(0, stock - reserved);
  return { stock, reserved, available };
}

/** Bir ürün için tüm aktif rezervasyonları döner (müşteri, miktar, tarih). */
export async function listActiveReservationsForProduct(
  productId: string,
): Promise<InventoryReservation[]> {
  if (!productId) return [];
  const firm = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
  const invTable = `rex_${firm}_${period}_inventory_reservations`;
  const { rows } = await postgres.query(
    `SELECT * FROM ${invTable}
      WHERE product_id = $1
        AND status = 'reserved'
      ORDER BY created_at DESC`,
    [productId],
  );
  return (rows || []).map((r) => ({
    id: String(r.id),
    firmNr: String(r.firm_nr ?? firm),
    periodNr: String(r.period_nr ?? period),
    customerId: String(r.customer_id),
    productId: String(r.product_id),
    quantity: Number(r.quantity ?? 0),
    status: (String(r.status ?? 'reserved') as InventoryReservation['status']),
    avansId: r.avans_id != null ? String(r.avans_id) : null,
    saleId: r.sale_id != null ? String(r.sale_id) : null,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    releasedAt: r.released_at != null ? String(r.released_at) : null,
    notes: r.notes != null ? String(r.notes) : null,
  }));
}

/** Müşterinin aktif rezervasyonlarını döner (re-export, UI kolaylığı). */
export const listCustomerReservations = listActiveReservationsForCustomer;
