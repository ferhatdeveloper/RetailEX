/**
 * Malzeme Açılış Faturası (slip_kind='invoice') — servis testleri
 *
 * Sözleşmeler:
 *   - createStockOpeningInvoiceSlip **absolute replace**: products.stock = qty,
 *     products.cost = unitCostExclVat. Delta ekleme YASAK.
 *   - Aynı ürün için zaten aktif açılış faturası varsa → hata (UNIQUE kısıt).
 *   - Tek satır + çoklu satır: stok + maliyet doğru güncellenir.
 *   - İptal: ürün kartı stoğu ve maliyeti 0'a çekilir (absolute geri al).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Postgres & PostgrEST mock'ları ───────────────────────────────────────

type PostgresHandler = (sql: string, params: any[]) => any;

const postgresState: {
  handlers: PostgresHandler[];
  calls: Array<{ sql: string; params: any[] }>;
} = {
  handlers: [],
  calls: [],
};

// Postgres mock — `query` sıralı handler'ları çağırır; tüketir.
// UPDATE rex_*_products SET stock, cost için productStore mock'unu da günceller.
vi.mock('../../services/postgres', () => ({
  postgres: {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      postgresState.calls.push({ sql, params });
      // Ürün kartı absolute update — mock productStore ile hizala.
      if (
        /UPDATE\s+rex_\d+_products\s+SET\s+stock\s*=/i.test(sql) &&
        /cost\s*=/i.test(sql)
      ) {
        const id = String(params[2] || '');
        const stock = Number(params[0]) || 0;
        const cost = Number(params[1]) || 0;
        if (productStore[id]) {
          productStore[id].stock = stock;
          productStore[id].cost = cost;
        }
        return { rows: [], rowCount: 1 };
      }
      const handler = postgresState.handlers.shift();
      if (!handler) {
        return { rows: [], rowCount: 0 };
      }
      return handler(sql, params);
    }),
  },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
  DB_SETTINGS: { connectionProvider: 'db' },
}));

// Postgrest mock (yalnızca testlerde rest_api modunu test etmek istersek).
const postgrestState = {
  patches: new Map<string, any>(),
  posts: [] as Array<{ path: string; body: any; response: any }>,
  gets: new Map<string, any>(),
};

vi.mock('../../services/api/postgrestClient', () => ({
  postgrest: {
    post: vi.fn(async (path: string, body: any) => {
      const entry = postgrestState.posts.shift();
      return entry ? entry.response : [{ id: 'mov-mock', ...body }];
    }),
    patch: vi.fn(async (path: string, body: any) => {
      const resp = postgrestState.patches.get(path);
      return resp !== undefined ? resp : [{ id: 'patch-mock', ...body }];
    }),
    get: vi.fn(async (path: string) => {
      const resp = postgrestState.gets.get(path);
      return resp !== undefined ? resp : [];
    }),
  },
}));

// productAPI mock.
const productStore: Record<
  string,
  { id: string; name: string; stock: number; cost: number; unit: string }
> = {};

vi.mock('../../services/api/products', () => ({
  productAPI: {
    getAll: vi.fn(async () => Object.values(productStore)),
    updateStock: vi.fn(async (id: string, qty: number) => {
      const p = productStore[id];
      if (p) {
        p.stock = qty;
        return true;
      }
      return false;
    }),
    search: vi.fn(async () => Object.values(productStore)),
  },
}));

vi.mock('../../services/stockMovementAPI', () => ({
  STOCK_SLIP_TRCODES: {
    CONSUMPTION: 1,
    PRODUCTION_IN: 2,
    TRANSFER: 5,
    WASTAGE: 11,
    OPENING: 14,
    COUNTING: 25,
    SURPLUS: 26,
    SHORTAGE: 50,
    WAREHOUSE_IN: 51,
    WAREHOUSE_OUT: 52,
    PRICE_CHANGE: 78,
  },
}));

// ─── Test ortak helper ────────────────────────────────────────────────────

const firmNr = '001';
const periodNr = '01';
const date = '2026-09-29';

function seedProduct(id: string, name: string, stock: number, cost: number) {
  productStore[id] = { id, name, stock, cost, unit: 'Adet' };
}

function freshHandlers() {
  postgresState.handlers = [];
  postgresState.calls = [];
  postgrestState.patches.clear();
  postgrestState.posts = [];
  postgrestState.gets.clear();
  for (const k of Object.keys(productStore)) delete productStore[k];
}

// ─── createStockOpeningInvoiceSlip testleri ───────────────────────────────

describe('createStockOpeningInvoiceSlip — absolute replace', () => {
  beforeEach(() => {
    freshHandlers();
  });

  it('tek satır: products.stock = qty ve products.cost = unitCostExclVat (absolute)', async () => {
    seedProduct('p1', 'Ürün A', 0, 0);
    const newQty = 12;
    const newUnit = 7.5;

    // postgres.query handler sırası:
    //   1) findExisting SELECT DISTINCT smi.product_id → []
    //   2) generateOpeningInvoiceDocNo SELECT document_no (last) → []
    //   3) INSERT INTO stock_movements (header) → mov-1
    //   4) SELECT stock, cost FROM rex_001_products → { stock:0, cost:0 }
    //   5) UPDATE rex_001_products SET stock, cost → []
    //   6) INSERT INTO stock_movement_items → item-1
    postgresState.handlers.push(
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [{ id: 'mov-1' }], rowCount: 1 }),
      () => ({ rows: [{ stock: 0, cost: 0 }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'item-1' }], rowCount: 1 }),
    );

    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    const res = await createStockOpeningInvoiceSlip({
      firmNr,
      periodNr,
      date,
      warehouseId: 'wh-1',
      lines: [
        {
          productId: 'p1',
          productCode: 'P1',
          productName: 'Ürün A',
          qty: newQty,
          unitCostExclVat: newUnit,
          vatRate: 0,
        },
      ],
    });

    expect(res.movementId).toBe('mov-1');
    expect(res.documentNo).toMatch(/^AF-OPEN-\d{8}-\d{4}$/);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].qty).toBe(newQty);
    expect(res.lines[0].unitCostExclVat).toBe(newUnit);

    // Ürün kartı absolute set edildi mi?
    expect(productStore['p1'].stock).toBe(newQty);
    expect(productStore['p1'].cost).toBe(newUnit);

    // sideEffects snapshot
    expect(res.sideEffects[0]).toEqual({
      productId: 'p1',
      prevStock: 0,
      nextStock: newQty,
      prevCost: 0,
      nextCost: newUnit,
    });
  });

  it('çoklu satır: her satır kendi ürününe absolute yazılır', async () => {
    seedProduct('p1', 'Ürün A', 5, 3);
    seedProduct('p2', 'Ürün B', 100, 12.5);
    seedProduct('p3', 'Ürün C', 0, 0);

    // 1) findExisting → []
    // 2) docNo → []
    // 3) INSERT movement → mov-2
    // 4) SELECT prev p1 → {stock:5, cost:3}
    // 5) UPDATE p1
    // 6) INSERT item-1
    // 7) SELECT prev p2
    // 8) UPDATE p2
    // 9) INSERT item-2
    // 10) SELECT prev p3
    // 11) UPDATE p3
    // 12) INSERT item-3
    postgresState.handlers.push(
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [{ id: 'mov-2' }], rowCount: 1 }),
      () => ({ rows: [{ stock: 5, cost: 3 }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'item-1' }], rowCount: 1 }),
      () => ({ rows: [{ stock: 100, cost: 12.5 }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'item-2' }], rowCount: 1 }),
      () => ({ rows: [{ stock: 0, cost: 0 }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'item-3' }], rowCount: 1 }),
    );

    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    const res = await createStockOpeningInvoiceSlip({
      firmNr,
      periodNr,
      date,
      warehouseId: 'wh-1',
      lines: [
        { productId: 'p1', qty: 7, unitCostExclVat: 4, vatRate: 10 },
        { productId: 'p2', qty: 50, unitCostExclVat: 15, vatRate: 20 },
        { productId: 'p3', qty: 3, unitCostExclVat: 8, vatRate: 0 },
      ],
    });

    expect(res.lines).toHaveLength(3);
    expect(productStore['p1'].stock).toBe(7);
    expect(productStore['p1'].cost).toBe(4);
    expect(productStore['p2'].stock).toBe(50);
    expect(productStore['p2'].cost).toBe(15);
    expect(productStore['p3'].stock).toBe(3);
    expect(productStore['p3'].cost).toBe(8);

    // Subtotal/VAT/GrandTotal
    // p1: 7*4=28, vat 28*0.10=2.80, total 30.80
    // p2: 50*15=750, vat 750*0.20=150, total 900
    // p3: 3*8=24, vat 0, total 24
    expect(res.subtotalExclVat).toBe(28 + 750 + 24);
    expect(res.vatTotal).toBe(2.8 + 150 + 0);
    expect(res.grandTotal).toBe(30.8 + 900 + 24);

    expect(res.sideEffects.map((s) => s.productId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('mevcut 5+3 ürününe yeni 7+4 yazılınca delta değil absolute replace olur', async () => {
    seedProduct('p1', 'Ürün A', 5, 3);
    postgresState.handlers.push(
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [], rowCount: 0 }),
      () => ({ rows: [{ id: 'mov-3' }], rowCount: 1 }),
      () => ({ rows: [{ stock: 5, cost: 3 }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'item-1' }], rowCount: 1 }),
    );

    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    await createStockOpeningInvoiceSlip({
      firmNr,
      periodNr,
      date,
      warehouseId: 'wh-1',
      lines: [
        { productId: 'p1', qty: 7, unitCostExclVat: 4, vatRate: 0 },
      ],
    });

    // Önceki 5 değerine 7 EKLENMEZ; doğrudan 7 olur.
    expect(productStore['p1'].stock).toBe(7);
    // Maliyet de 3'ten 4'e atlar (absolute).
    expect(productStore['p1'].cost).toBe(4);
  });

  it('boş satır → hata fırlatır', async () => {
    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    await expect(
      createStockOpeningInvoiceSlip({
        firmNr,
        periodNr,
        date,
        lines: [],
      }),
    ).rejects.toThrow(/En az bir satır/);
  });
});

// ─── findExistingOpeningInvoiceProductIds — UNIQUE ön-kontrol ─────────────

describe('findExistingOpeningInvoiceProductIds — UNIQUE ön-kontrol', () => {
  beforeEach(() => {
    freshHandlers();
  });

  it('aktif fişlerde geçen ürünleri döner', async () => {
    // Tek SQL: SELECT DISTINCT smi.product_id ... WHERE sm.trcode=14 AND slip_kind='invoice' AND status<>cancelled AND product_id = ANY(...)
    postgresState.handlers.push(() => ({
      rows: [{ product_id: 'p1' }, { product_id: 'p2' }],
      rowCount: 2,
    }));
    const { findExistingOpeningInvoiceProductIds } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    const used = await findExistingOpeningInvoiceProductIds(['p1', 'p2', 'p3']);
    expect(used.size).toBe(2);
    expect(used.has('p1')).toBe(true);
    expect(used.has('p2')).toBe(true);
    expect(used.has('p3')).toBe(false);
  });

  it('boş liste → boş set', async () => {
    const { findExistingOpeningInvoiceProductIds } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    const used = await findExistingOpeningInvoiceProductIds([]);
    expect(used.size).toBe(0);
  });
});

// ─── createStockOpeningInvoiceSlip — duplicate guard ─────────────────────

describe('createStockOpeningInvoiceSlip — duplicate ürün reddi', () => {
  beforeEach(() => {
    freshHandlers();
  });

  it('aynı ürün için ikinci açılış faturası reddedilir', async () => {
    seedProduct('p1', 'Ürün A', 0, 0);
    // findExisting → p1 zaten aktif
    postgresState.handlers.push(() => ({
      rows: [{ product_id: 'p1' }],
      rowCount: 1,
    }));

    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    await expect(
      createStockOpeningInvoiceSlip({
        firmNr,
        periodNr,
        date,
        warehouseId: 'wh-1',
        lines: [{ productId: 'p1', qty: 5, unitCostExclVat: 3, vatRate: 0 }],
      }),
    ).rejects.toThrow(/zaten açılış faturası mevcut/);
  });
});

// ─── cancelStockOpeningInvoiceSlip — absolute geri al ────────────────────

describe('cancelStockOpeningInvoiceSlip — absolute geri al', () => {
  beforeEach(() => {
    freshHandlers();
  });

  it('iptal: movement status=cancelled ve ürün kartı stock/cost 0', async () => {
    seedProduct('p1', 'Ürün A', 7, 4);
    seedProduct('p2', 'Ürün B', 50, 15);

    // Sıra:
    //   1) SELECT items WHERE movement_id = ... → [p1, p2]
    //   2) UPDATE stock_movements SET status='cancelled'
    //   3) UPDATE products SET stock=0, cost=0  (p1)
    //   4) UPDATE products SET stock=0, cost=0  (p2)
    postgresState.handlers.push(
      () => ({
        rows: [
          { id: 'item-1', product_id: 'p1', quantity: 7 },
          { id: 'item-2', product_id: 'p2', quantity: 50 },
        ],
        rowCount: 2,
      }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [], rowCount: 1 }),
    );

    const { cancelStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    const out = await cancelStockOpeningInvoiceSlip('mov-2');
    expect(out.productIds.sort()).toEqual(['p1', 'p2']);
    expect(productStore['p1'].stock).toBe(0);
    expect(productStore['p1'].cost).toBe(0);
    expect(productStore['p2'].stock).toBe(0);
    expect(productStore['p2'].cost).toBe(0);
  });

  it('boş fiş → hata', async () => {
    postgresState.handlers.push(() => ({ rows: [], rowCount: 0 }));
    const { cancelStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    await expect(cancelStockOpeningInvoiceSlip('mov-empty')).rejects.toThrow(
      /İptal edilecek satır bulunamadı/,
    );
  });
});

// ─── İptemiz guard testleri ──────────────────────────────────────────────

describe('sözleşme — UNIQUE kısıt geri kalan davranış', () => {
  beforeEach(() => {
    freshHandlers();
  });

  it('aynı ürün için ikinci kez create → UNIQUE ihlali ön-kontrol ile', async () => {
    seedProduct('p1', 'Ürün A', 0, 0);
    postgresState.handlers.push(() => ({
      rows: [{ product_id: 'p1' }],
      rowCount: 1,
    }));

    const { createStockOpeningInvoiceSlip } = await import(
      '../../services/api/stockOpeningInvoice'
    );
    await expect(
      createStockOpeningInvoiceSlip({
        firmNr,
        periodNr,
        date,
        warehouseId: 'wh-1',
        lines: [{ productId: 'p1', qty: 5, unitCostExclVat: 2, vatRate: 0 }],
      }),
    ).rejects.toThrow(/zaten açılış faturası mevcut/);
  });
});