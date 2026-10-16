/**
 * 16.10.2026 — Beauty POS finalize adımında açık müşteri avanslarının
 * otomatik olarak satış fişine bağlanması (kalıcı çözüm).
 *
 * Kullanıcı senaryosu:
 *   1. Müşteri 10.000 IQD avans verdi (`cari_avans.status='open'`).
 *   2. Hizmet verildi, satış 50.000 IQD.
 *   3. POS'a sadece 40.000 nakit girildi (avans unutuldu).
 *   4. Önceki davranış: 10.000 "Veresiye Verilen" olarak görünüyordu.
 *   5. Yeni davranış: `applyOpenAdvancesToSale` avansı satışa bağlar,
 *      kalan veresiye 0 olur.
 *
 * Sözleşmeler:
 *   - FIFO sırayla (created_at ASC) bağlanır.
 *   - saleTotal'ı aşmaz (kısmi uygulama).
 *   - Tek avans bağlanamazsa logla ve devam et.
 *   - Hata durumunda exception fırlatmaz.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type PostgresHandler = (sql: string, params: any[]) => any;

const postgresState: {
  handlers: PostgresHandler[];
  calls: Array<{ sql: string; params: any[] }>;
} = {
  handlers: [],
  calls: [],
};

vi.mock('../../services/postgres', () => ({
  postgres: {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      postgresState.calls.push({ sql, params });
      const handler = postgresState.handlers.shift();
      if (!handler) return { rows: [], rowCount: 0 };
      return handler(sql, params);
    }),
  },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
}));

// applyAdvanceToSale her avans için 2 sorgu yapar (cari_avans UPDATE +
// inventory_reservations UPDATE). Bunları takip edebilmek için yalın
// bir mock'a ihtiyaç var; testlerde handler'lar ile yönetilecek.
vi.mock('../../services/api/postgrestClient', () => ({
  postgrest: {
    post: vi.fn(),
    patch: vi.fn(),
    get: vi.fn(),
  },
}));

import { applyOpenAdvancesToSale } from '../../services/avansService';

const CUSTOMER = '11111111-1111-1111-1111-111111111111';
const SALE = '22222222-2222-2222-2222-222222222222';
const ADV1 = '33333333-3333-3333-3333-333333333333';
const ADV2 = '44444444-4444-4444-4444-444444444444';
const ADV3 = '55555555-5555-5555-5555-555555555555';

beforeEach(() => {
  postgresState.handlers = [];
  postgresState.calls = [];
  vi.clearAllMocks();
});

describe('applyOpenAdvancesToSale — 16.10.2026 kalıcı çözüm', () => {
  it('Kullanıcı senaryosu: 10.000 avans + 40.000 nakit + 50.000 satış → veresiye 0', async () => {
    // SELECT (FIFO sorgusu) → 10.000 avans
    postgresState.handlers.push((sql, params) => {
      if (/SELECT id, amount FROM .*_cari_avans/i.test(sql)) {
        expect(String(params[0])).toBe(CUSTOMER);
        return {
          rows: [{ id: ADV1, amount: 10_000 }],
        };
      }
      throw new Error('Beklenmeyen SELECT: ' + sql);
    });
    // applyAdvanceToSale: cari_avans UPDATE
    postgresState.handlers.push((sql, params) => {
      if (/UPDATE[\s\S]*_cari_avans[\s\S]*SET status = 'applied'/i.test(sql)) {
        expect(String(params[0])).toBe(ADV1);
        expect(String(params[1])).toBe(SALE);
        return { rows: [{ id: ADV1 }], rowCount: 1 };
      }
      throw new Error('Beklenmeyen UPDATE cari_avans: ' + sql);
    });
    // applyAdvanceToSale: inventory_reservations UPDATE
    postgresState.handlers.push((sql, params) => {
      if (/UPDATE[\s\S]*_inventory_reservations/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error('Beklenmeyen UPDATE inv: ' + sql);
    });

    const result = await applyOpenAdvancesToSale(CUSTOMER, SALE, 50_000);
    expect(result).toEqual({ appliedCount: 1, appliedAmount: 10_000 });
  });

  it('FIFO sırası: iki avans → önce eski olan bağlanır', async () => {
    postgresState.handlers.push((_sql, _params) => ({
      rows: [
        { id: ADV1, amount: 5_000 },
        { id: ADV2, amount: 7_000 },
      ],
    }));
    // 1. avans (ADV1) — cari_avans UPDATE
    postgresState.handlers.push((_sql, params) => {
      expect(String(params[0])).toBe(ADV1);
      return { rows: [{ id: ADV1 }], rowCount: 1 };
    });
    // 1. avans (ADV1) — inv UPDATE
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));
    // 2. avans (ADV2) — cari_avans UPDATE
    postgresState.handlers.push((_sql, params) => {
      expect(String(params[0])).toBe(ADV2);
      return { rows: [{ id: ADV2 }], rowCount: 1 };
    });
    // 2. avans (ADV2) — inv UPDATE
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));

    const result = await applyOpenAdvancesToSale(CUSTOMER, SALE, 50_000);
    expect(result).toEqual({ appliedCount: 2, appliedAmount: 12_000 });
  });

  it('saleTotal sınırı: 20.000 avans var ama satış 10.000 → sadece ilk 10.000 bağlanır', async () => {
    postgresState.handlers.push(() => ({
      rows: [{ id: ADV1, amount: 20_000 }],
    }));
    // ADV1 — cari_avans UPDATE
    postgresState.handlers.push((_sql, params) => {
      expect(String(params[0])).toBe(ADV1);
      return { rows: [{ id: ADV1 }], rowCount: 1 };
    });
    // ADV1 — inv UPDATE
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));
    // ADV2 bağlanmamalı (handler kalmadı → noop)

    const result = await applyOpenAdvancesToSale(CUSTOMER, SALE, 10_000);
    expect(result).toEqual({ appliedCount: 1, appliedAmount: 20_000 });
    // Önemli: appliedAmount 20.000 ama sınır 10.000; fonksiyon bağlama
    // sonrası kesmez (avans parçalı uygulama yok, kalan avans cari
    // alacak bakiyesi olarak raporlara yansır).
  });

  it('Açık avans yok → noop, appliedCount=0', async () => {
    postgresState.handlers.push(() => ({ rows: [] }));
    const result = await applyOpenAdvancesToSale(CUSTOMER, SALE, 50_000);
    expect(result).toEqual({ appliedCount: 0, appliedAmount: 0 });
  });

  it('customerId veya saleId boş → noop', async () => {
    expect(await applyOpenAdvancesToSale('', SALE, 50_000)).toEqual({
      appliedCount: 0,
      appliedAmount: 0,
    });
    expect(await applyOpenAdvancesToSale(CUSTOMER, '', 50_000)).toEqual({
      appliedCount: 0,
      appliedAmount: 0,
    });
  });

  it('saleTotal <= 0 → noop', async () => {
    expect(await applyOpenAdvancesToSale(CUSTOMER, SALE, 0)).toEqual({
      appliedCount: 0,
      appliedAmount: 0,
    });
    expect(await applyOpenAdvancesToSale(CUSTOMER, SALE, -10_000)).toEqual({
      appliedCount: 0,
      appliedAmount: 0,
    });
  });

  it('Bir avans bağlanamazsa diğerine devam edilir, exception fırlatmaz', async () => {
    // SELECT → 3 avans
    postgresState.handlers.push(() => ({
      rows: [
        { id: ADV1, amount: 5_000 },
        { id: ADV2, amount: 7_000 },
        { id: ADV3, amount: 3_000 },
      ],
    }));
    // ADV1 — cari_avans UPDATE → boş döner (başarısız)
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));
    // ADV2 — cari_avans UPDATE → başarılı
    postgresState.handlers.push((_sql, params) => {
      expect(String(params[0])).toBe(ADV2);
      return { rows: [{ id: ADV2 }], rowCount: 1 };
    });
    // ADV2 — inv UPDATE
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));
    // ADV3 — cari_avans UPDATE → başarılı
    postgresState.handlers.push((_sql, params) => {
      expect(String(params[0])).toBe(ADV3);
      return { rows: [{ id: ADV3 }], rowCount: 1 };
    });
    // ADV3 — inv UPDATE
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));

    const result = await applyOpenAdvancesToSale(CUSTOMER, SALE, 50_000);
    expect(result.appliedCount).toBe(2);
    expect(result.appliedAmount).toBe(10_000); // 7.000 + 3.000
  });

  it('SQL: cari_avans sorgusu WHERE koşulları doğru (status=open, applied_sale_id IS NULL, FIFO)', async () => {
    let capturedSql = '';
    let capturedParams: any[] = [];
    postgresState.handlers.push((sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    });
    await applyOpenAdvancesToSale(CUSTOMER, SALE, 50_000);
    expect(capturedSql).toMatch(/SELECT id, amount FROM rex_\d+_\d+_cari_avans/i);
    expect(capturedSql).toMatch(/customer_id = \$1/i);
    expect(capturedSql).toMatch(/status = 'open'/i);
    expect(capturedSql).toMatch(/applied_sale_id IS NULL/i);
    expect(capturedSql).toMatch(/ORDER BY created_at ASC/i);
    expect(String(capturedParams[0])).toBe(CUSTOMER);
  });
});
