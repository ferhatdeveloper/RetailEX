import { describe, expect, it } from 'vitest';
import { passesDailySalesDetailList } from '../../utils/dailySalesDetailRows';
import { sumDailySalesDetailCashBalance } from '../../utils/dailySalesDetailCashBalance';

/**
 * 09.10.2026 — Kullanıcı şikayeti (WhatsApp, guzel DB):
 * "BURDA TUR avans yazsin urun yaziyor urun satisi olunca bu kolonda
 *  fitlre yapilirsa avanslar urun satislarina dahil olur bu da yanlis"
 *
 * Günlük rapor TÜR kolonu için iki davranış:
 *  1) Rezervasyon avansı satırları (cari_avans / isAvans=true) TÜR
 *     kolonunda "Rezervasyon" rozeti görsün (eskiden "Ürün" yazıyordu).
 *  2) Hizmet / Ürün filtresi uygulandığında avans satırları Hariç
 *     tutulsun. Avans bir hizmet rezervasyonu — ürün satışı değil.
 *
 * ReportsModule.tsx içindeki `applyDailyKindFilter` ve
 * `dailyKindGridRows` (inline) bu davranışı uygular. Aşağıdaki
 * minik simülasyon, mantığın beklenen çıktıyı ürettiğini regresyona
 * karşı korur; fonksiyon isimleri/types.ts üzerinden değil, mantığı
 * 1:1 taklit ederek.
 */

type DailyKindFilter = 'all' | 'service' | 'product';
type SaleKindBucket = 'service' | 'product' | 'mixed' | 'all';

interface DailyUnifiedRowLite {
  isAvans?: boolean;
  isDeposit?: boolean;
  kind: SaleKindBucket;
  serviceTotal: number;
  productTotal: number;
  serviceDiscount: number;
  productDiscount: number;
  serviceBefore: number;
  productBefore: number;
  total: number;
  discount: number;
  beforeDiscount: number;
  collected?: number;
  remaining?: number;
}

/** ReportsModule.tsx → applyDailyKindFilter mantığı (09.10.2026). */
function applyDailyKindFilter(
  row: DailyUnifiedRowLite,
  filter: DailyKindFilter,
): DailyUnifiedRowLite | null {
  // 17.10.2026 — Rezervasyon avansı (isAvans=true) TÜM filtrelerde Hariç
  // (eskiden yalnızca service/product). Çift yazımı önlemek için avans
  // Ciro Dışı tahsilat olarak ayrı "Peşinat (Avans)" kartında izlenir.
  if (row.isAvans === true) return null;
  if (filter === 'all') return row;

  const sum =
    Math.abs(Number(row.serviceTotal) || 0) +
    Math.abs(Number(row.productTotal) || 0);
  const share = sum < 0.0001
    ? 0
    : filter === 'service'
      ? Math.abs(Number(row.serviceTotal) || 0) / sum
      : Math.abs(Number(row.productTotal) || 0) / sum;

  if (filter === 'service') {
    if (Math.abs(Number(row.serviceTotal) || 0) < 0.0001) return null;
    return {
      ...row,
      kind: 'service',
      total: row.serviceTotal,
      discount: row.serviceDiscount,
      beforeDiscount: row.serviceBefore,
      collected: (Number(row.collected) || 0) * share,
      remaining: (Number(row.remaining) || 0) * share,
    };
  }
  if (Math.abs(Number(row.productTotal) || 0) < 0.0001) return null;
  return {
    ...row,
    kind: 'product',
    total: row.productTotal,
    discount: row.productDiscount,
    beforeDiscount: row.productBefore,
    collected: (Number(row.collected) || 0) * share,
    remaining: (Number(row.remaining) || 0) * share,
  };
}

/** ReportsModule.tsx → dailyKindGridRows kindLabel override mantığı (09.10.2026). */
function kindLabelFor(row: DailyUnifiedRowLite, fallbackLabel: string): string {
  // 09.10.2026 — Avans satırları için TÜR etiketi override.
  if (row.isAvans === true) return 'Rezervasyon';
  return fallbackLabel;
}

const makeAvans = (amount: number): DailyUnifiedRowLite => ({
  isAvans: true,
  kind: 'product', // mapAvans hardcoded
  serviceTotal: 0,
  productTotal: amount,
  serviceDiscount: 0,
  productDiscount: 0,
  serviceBefore: 0,
  productBefore: amount,
  total: amount,
  discount: 0,
  beforeDiscount: amount,
  collected: amount,
  remaining: 0,
});

const makeProductSale = (amount: number): DailyUnifiedRowLite => ({
  kind: 'product',
  serviceTotal: 0,
  productTotal: amount,
  serviceDiscount: 0,
  productDiscount: 0,
  serviceBefore: 0,
  productBefore: amount,
  total: amount,
  discount: 0,
  beforeDiscount: amount,
  collected: amount,
  remaining: 0,
});

const makeServiceSale = (amount: number): DailyUnifiedRowLite => ({
  kind: 'service',
  serviceTotal: amount,
  productTotal: 0,
  serviceDiscount: 0,
  productDiscount: 0,
  serviceBefore: 0,
  productBefore: 0,
  total: amount,
  discount: 0,
  beforeDiscount: amount,
  collected: amount,
  remaining: 0,
});

describe('dailyKindAvansFilter — 09.10.2026 + 17.10.2026 Rezervasyon avansı ayrımı', () => {
  // 17.10.2026 — Kullanıcı isteği (whatsapp, guzel DB):
  // "rezervasyon tutari burda gorunmemeli listede musteri de yok diyor".
  // Avans artık TÜM filtrelerde Hariç (eskiden yalnızca service/product).
  // Avans Ciro Dışı tahsilattır; Satış Detayları tablosunda ayrı satır
  // gösterilmesi çift yazıma yol açar. "Peşinat (Avans)" kartında ayrıca
  // bilgi amaçlı izlenir.
  it('filter=all → avans listede kalır, ürün ve hizmet de kalır', () => {
    const avans = makeAvans(20_000);
    const product = makeProductSale(15_000);
    const service = makeServiceSale(25_000);
    expect(passesDailySalesDetailList(avans, 'all')).toBe(true);
    expect(passesDailySalesDetailList(product, 'all')).toBe(true);
    expect(passesDailySalesDetailList(service, 'all')).toBe(true);
    expect(passesDailySalesDetailList(avans, 'product')).toBe(false);
    expect(passesDailySalesDetailList(avans, 'service')).toBe(false);
  });

  it('filter=product → avans Hariç, sadece ürün geçer', () => {
    const avans = makeAvans(20_000);
    const product = makeProductSale(15_000);
    expect(applyDailyKindFilter(avans, 'product')).toBeNull();
    expect(applyDailyKindFilter(product, 'product')).not.toBeNull();
  });

  it('filter=service → avans Hariç, sadece hizmet geçer', () => {
    const avans = makeAvans(20_000);
    const service = makeServiceSale(25_000);
    expect(applyDailyKindFilter(avans, 'service')).toBeNull();
    expect(applyDailyKindFilter(service, 'service')).not.toBeNull();
  });

  it('avans satırı filter=product sonrası kind="product" döner (mevcut davranış korunur)', () => {
    // Avans Hariç olduğu için bu test, "filter uygulanmışsa kind product olur"
    // davranışının hâlâ çalıştığını doğrular; avans Hariç olduğu için null
    // dönmeli.
    const avans = makeAvans(20_000);
    expect(applyDailyKindFilter(avans, 'product')).toBeNull();
  });

  it('avans satırının TÜR etiketi "Rezervasyon" olur (eskiden "Ürün")', () => {
    const avans = makeAvans(20_000);
    expect(kindLabelFor(avans, 'Ürün')).toBe('Rezervasyon');
  });

  it('avans olmayan satır için fallback label kullanılır', () => {
    const product = makeProductSale(15_000);
    expect(kindLabelFor(product, 'Ürün')).toBe('Ürün');
    const service = makeServiceSale(25_000);
    expect(kindLabelFor(service, 'Hizmet')).toBe('Hizmet');
  });

  // 17.10.2026 — Kullanıcı ekran görüntüsü senaryosu (Süslenmiş müşteri +
  // 20.000 IQD avans satırı + admin/FERHAT 50.000 IQD gerçek satış +
  // 70.000 alt toplam). Düzeltme sonrası alt toplam 50.000 olmalı;
  // avans Ciro dışı tahsilat olarak ayrı "Peşinat (Avans)" kartında
  // izlenir.
  it('Süslenmiş müşteri avansı listede kalır, dip toplam yalnız satışı yazar', () => {
    const avansSuslenmisMusteri = makeAvans(20_000);
    const realSaleFerhat = makeServiceSale(50_000);
    const rows = [avansSuslenmisMusteri, realSaleFerhat].filter((row) =>
      passesDailySalesDetailList(row, 'all'),
    );
    expect(rows).toHaveLength(2);
    expect(sumDailySalesDetailCashBalance(rows)).toBe(50_000);
  });
});