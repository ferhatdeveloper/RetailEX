/**
 * AVANS → FATURA (Basit Model) — ortak tipler
 *
 * Kararlar (194_avans_reserve.sql + uygulama planı):
 *   1. Avans referans no: UUID (örn. `AVANS-<uuid-kısa>`)
 *   2. Stok: RESERVE — avans anında `reserved_quantity` artır,
 *      finalize'da gerçek stoğa düş + reserve serbest bırak
 *   3. Çoklu avans: HAYIR — tek avans tek satışla eşleşir
 *   4. Avans iade: YOK — iptal olursa avans cari bakiyesinde kalır
 *   5. Para birimi: Ana birime çevrim (nadir durum, exchange rate kullan)
 *
 * Tablolar:
 *   - rex_<firmNr>_<periodNr>_cari_avans
 *   - rex_<firmNr>_<periodNr>_inventory_reservations
 */

import type { SaleItem } from './models';

/** `cari_avans.status` enum değerleri */
export type AvansStatus = 'open' | 'applied' | 'kept_on_cancel';

/** Avans kabul edilen ödeme yöntemleri (POS ile uyumlu) */
export type AvansPaymentMethod = 'cash' | 'card' | 'transfer' | 'pesinatli';

/** `cari_avans` satırı (DB ile 1:1). */
export interface AvansRecord {
  id: string;
  firmNr: string;
  periodNr: string;
  /** Cari müşteri UUID */
  customerId: string;
  /** Ana para birimindeki tutar */
  amount: number;
  /** Orijinal kur / para birimi (nadir durum) */
  originalAmount?: number | null;
  originalCurrency?: string | null;
  paymentMethod: AvansPaymentMethod;
  status: AvansStatus;
  /** Uygulandığı sales fiş id */
  appliedSaleId?: string | null;
  /** Üretilen referans no: `AVANS-<uuid-kısa>` (DB GENERATED kolon) */
  referenceNo?: string | null;
  /** Kasa bağlantısı (nakit/kart/transfer için) */
  cashRegisterId?: string | null;
  cashRegisterCode?: string | null;
  cashLineId?: string | null;
  /** Cari hareket bağlantısı */
  cariMovementId?: string | null;
  createdAt: string;
  createdBy?: string | null;
  notes?: string | null;
}

/** `inventory_reservations.status` enum değerleri */
export type ReservationStatus = 'reserved' | 'finalized' | 'released';

/** `inventory_reservations` satırı (DB ile 1:1). */
export interface InventoryReservation {
  id: string;
  firmNr: string;
  periodNr: string;
  customerId: string;
  productId: string;
  quantity: number;
  status: ReservationStatus;
  avansId?: string | null;
  saleId?: string | null;
  createdAt: string;
  releasedAt?: string | null;
  notes?: string | null;
}

/** `recordAdvance` input (POS'tan) */
export interface RecordAdvanceInput {
  customerId: string;
  /** Ana para birimindeki tutar (zorunlu) */
  amount: number;
  /** Ödeme yöntemi (cash | card | transfer | pesinatli) */
  paymentMethod: AvansPaymentMethod;
  /** Orijinal kur bilgisi (nadir durum) */
  currency?: string;
  /** Rezerve edilecek ürünler (sepetten) */
  items?: Array<{ productId: string; quantity: number }>;
  /** Kasa (nakit / kart / transfer için) */
  cashRegisterId?: string;
  cashRegisterCode?: string;
  cashRegisterName?: string;
  /** Oluşturan kullanıcı */
  userId?: string;
  userName?: string;
  /** Not (opsiyonel) */
  notes?: string;
}

/** `recordAdvance` çıktısı */
export interface RecordAdvanceResult {
  avans: AvansRecord;
  reservations: InventoryReservation[];
  cashLineId: string | null;
  cariMovementId: string | null;
}

/** `finalizeSale` input (fatura modülünden) */
export interface FinalizeSaleInput {
  customerId: string;
  items: Array<SaleItem & { productId: string; quantity: number; unitPrice: number; total: number }>;
  payments: Array<{
    method: 'cash' | 'card' | 'transfer' | 'veresiye';
    amount: number;
    currency?: string;
    cashRegisterId?: string;
    cashRegisterCode?: string;
    cashRegisterName?: string;
  }>;
  totalAmount: number;
  /** Uygulanacak avans (varsa) */
  avansId?: string;
  userId?: string;
  userName?: string;
  notes?: string;
}

/** `reserveStock` input */
export interface ReserveStockInput {
  items: Array<{ productId: string; quantity: number }>;
  avansId: string;
  customerId: string;
  notes?: string;
}

/** Avans hareket etiketleri (UI için). */
export const AVANS_STATUS_LABELS: Record<AvansStatus, string> = {
  open: 'Açık',
  applied: 'Uygulandı',
  kept_on_cancel: 'İptal — Cari Bakiyesinde',
};

/** Rezervasyon durum etiketleri (UI için). */
export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  reserved: 'Rezerve',
  finalized: 'Stoktan Düşüldü',
  released: 'Serbest Bırakıldı',
};
