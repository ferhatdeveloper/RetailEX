/**
 * Finansal kontrol merkezi — çok mağaza demo özet verisi (yerel gösterim).
 * Üretimde PG / rapor servisi ile değiştirilmelidir.
 */
export interface FinanceDemoStore {
  id: string;
  name: string;
  code: string;
}

export interface FinanceTodayStat {
  storeId: string;
  revenue: number;
  cashBalance: number;
  transactionCount: number;
}

export const stores: FinanceDemoStore[] = [
  { id: '1', name: 'Merkez Mağaza', code: 'M01' },
  { id: '2', name: 'Şube A', code: 'M02' },
  { id: '3', name: 'Şube B', code: 'M03' },
];

export const todayStats: FinanceTodayStat[] = stores.map((s, i) => ({
  storeId: s.id,
  revenue: 1_200_000 + i * 100_000,
  cashBalance: 40_000 + i * 15_000,
  transactionCount: 80 + i * 12,
}));
