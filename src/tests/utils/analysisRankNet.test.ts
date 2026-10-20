import { describe, expect, it } from 'vitest';
import { resolveAnalysisSaleCategory } from '../../utils/analysisSaleLine';
import {
  signedRankAmount,
  summarizeRankNet,
  type RankNetLine,
  type RankNetSale,
} from '../../utils/analysisRankNet';

const BOYA_ID = '11111111-1111-4111-8111-111111111111';
const SABUN_ID = '22222222-2222-4222-8222-222222222222';

const catalog = [
  { id: BOYA_ID, code: '0000001', name: 'BOYA', isService: false, category: '' },
  { id: SABUN_ID, code: '0000099', name: 'SABUN', isService: false, category: '' },
];

const beautyServices = [
  { id: 'svc-hair', name: 'HAIR CUT', parent_category: 'beauty', category: 'hair' },
  { id: 'svc-color', name: 'HAIR PINK COLOR', parent_category: 'beauty', category: 'hair' },
];

const tm = (key: string) =>
  (({ bCatBeauty: 'Güzellik', bCatOther: 'Diğer' }) as Record<string, string>)[key] || key;

function categoryOf(line: RankNetLine): string {
  return resolveAnalysisSaleCategory(
    {
      productId: line.productId,
      productName: line.productName,
      lineType: line.lineType,
      item_type: line.itemType,
    },
    catalog,
    beautyServices,
    { other: 'Diğer', service: 'Hizmet', tm },
  );
}

function summarize(sales: RankNetSale[]) {
  return summarizeRankNet(sales, {
    categoryOf,
    inTopSellers: (line) => catalog.some((product) => product.id === line.productId),
  });
}

function boyaSale(): RankNetSale {
  return {
    id: 'sale-boya',
    status: 'completed',
    total: 20_000,
    items: [
      {
        productId: BOYA_ID,
        productName: 'BOYA',
        productCode: '0000001',
        lineType: 'Malzeme',
        quantity: 2,
        price: 10_000,
        total: 20_000,
      },
    ],
  };
}

function boyaReturn(overrides: Partial<RankNetSale> = {}): RankNetSale {
  return {
    id: 'return-boya',
    status: 'return',
    total: -10_000,
    trcode: 3,
    fiche_type: 'return_invoice',
    items: [
      {
        productId: BOYA_ID,
        productName: 'BOYA',
        productCode: '0000001',
        lineType: 'Malzeme',
        quantity: 1,
        price: 10_000,
        total: 10_000,
      },
    ],
    ...overrides,
  };
}

function serviceSale(): RankNetSale {
  return {
    id: 'sale-service',
    status: 'completed',
    total: 110_000,
    linkedAppointmentId: 'appt-1',
    items: [
      {
        productId: 'svc-hair',
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        quantity: 1,
        price: 50_000,
        total: 50_000,
      },
      {
        productId: 'svc-color',
        productName: 'HAIR PINK COLOR',
        lineType: 'Hizmet',
        quantity: 1,
        price: 60_000,
        total: 60_000,
      },
      {
        productId: 'deposit-line',
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        quantity: 1,
        price: 20_000,
        total: 20_000,
      },
    ],
  };
}

function depositSale(): RankNetSale {
  return {
    id: 'deposit-sale',
    status: 'completed',
    total: 20_000,
    isDeposit: true,
    items: [
      {
        productId: BOYA_ID,
        productName: 'BOYA',
        lineType: 'Malzeme',
        quantity: 2,
        price: 10_000,
        total: 20_000,
      },
    ],
  };
}

function knownReceipt(): RankNetSale[] {
  return [serviceSale(), boyaSale(), boyaReturn(), depositSale()];
}

describe('En Çok Satanlar ve Kategori Performansı — iade net', () => {
  it('2×10.000 satış ve 1×10.000 iade → BOYA 1 adet / 10.000, kategori toplamı 120.000', () => {
    const { products, categories } = summarize(knownReceipt());
    const boya = products.find((row) => row.productName === 'BOYA');
    const beauty = categories.find((row) => row.name === 'Güzellik');
    const other = categories.find((row) => row.name === 'Diğer');
    const revenue = categories.reduce((sum, row) => sum + row.totalRevenue, 0);
    const quantity = categories.reduce((sum, row) => sum + row.totalQuantity, 0);
    const sku = categories.reduce((sum, row) => sum + row.productCount, 0);

    expect(boya).toMatchObject({
      quantity: 1,
      revenue: 10_000,
      avgPrice: 10_000,
    });
    expect(boya).not.toHaveProperty('stock');
    expect(products.some((row) => row.productName === 'HAIR CUT')).toBe(false);
    expect(beauty).toMatchObject({
      totalRevenue: 110_000,
      totalQuantity: 2,
      productCount: 2,
      avgPrice: 55_000,
    });
    expect(other).toMatchObject({
      totalRevenue: 10_000,
      totalQuantity: 1,
      productCount: 1,
      avgPrice: 10_000,
    });
    expect(revenue).toBe(120_000);
    expect(quantity).toBe(3);
    expect(sku).toBe(3);
    expect(revenue).not.toBe(140_000);
    expect(quantity).not.toBe(5);
    expect(boya?.revenue).not.toBe(30_000);
    expect(boya?.quantity).not.toBe(3);
  });

  it('aynı iade fişi ikinci kez düşülmez', () => {
    const once = boyaReturn();
    const { products } = summarize([boyaSale(), once, { ...once }]);
    expect(products[0].quantity).toBe(1);
    expect(products[0].revenue).toBe(10_000);
  });

  it('veritabanında eksi yazılmış iade bir kez düşülür, 0 olmaz', () => {
    const { products, categories } = summarize([
      serviceSale(),
      boyaSale(),
      boyaReturn({
        items: [
          {
            productId: BOYA_ID,
            productName: 'BOYA',
            productCode: '0000001',
            lineType: 'Malzeme',
            quantity: -1,
            price: 10_000,
            total: -10_000,
          },
        ],
      }),
    ]);
    expect(products[0].quantity).toBe(1);
    expect(products[0].revenue).toBe(10_000);
    expect(products[0].avgPrice).toBe(10_000);
    const revenue = categories.reduce((sum, row) => sum + row.totalRevenue, 0);
    expect(revenue).toBe(120_000);
  });

  it('işaret fonksiyonu ikinci kez uygulanınca tutar aynı kalır', () => {
    const once = signedRankAmount(true, 1, 10_000);
    const twice = signedRankAmount(true, once.quantity, once.total);
    expect(once).toEqual({ quantity: -1, total: -10_000 });
    expect(twice).toEqual(once);
  });

  it('peşinat 20.000 ciroya eklenmez, hizmet 110.000 kalır', () => {
    const { categories, products } = summarize(knownReceipt());
    const beauty = categories.find((row) => row.name === 'Güzellik');
    expect(beauty?.totalRevenue).toBe(110_000);
    expect(products[0].revenue).toBe(10_000);
    expect(categories.some((row) => row.totalRevenue === 20_000)).toBe(false);
    expect(categories.reduce((sum, row) => sum + row.totalRevenue, 0)).toBe(120_000);
  });

  it('başka ürünün iadesi BOYA satırına yazılmaz', () => {
    const { products } = summarize([
      boyaSale(),
      boyaReturn(),
      {
        id: 'return-sabun',
        status: 'return',
        total: -5_000,
        trcode: 3,
        fiche_type: 'return_invoice',
        items: [
          {
            productId: SABUN_ID,
            productName: 'SABUN',
            productCode: '0000099',
            lineType: 'Malzeme',
            quantity: 1,
            price: 5_000,
            total: 5_000,
          },
        ],
      },
    ]);
    const boya = products.find((row) => row.productId === BOYA_ID);
    const sabun = products.find((row) => row.productId === SABUN_ID);
    expect(boya?.quantity).toBe(1);
    expect(boya?.revenue).toBe(10_000);
    expect(sabun?.quantity).toBe(-1);
    expect(sabun?.revenue).toBe(-5_000);
  });

  it('alış iadesi BOYA satışından düşülmez', () => {
    const { products } = summarize([
      boyaSale(),
      boyaReturn({
        id: 'purchase-return',
        trcode: 6,
        fiche_type: 'return_invoice',
        total: -10_000,
      }),
    ]);
    expect(products[0].quantity).toBe(2);
    expect(products[0].revenue).toBe(20_000);
  });

  it('ürün kodu ile eşleşen iade aynı üründen düşülür', () => {
    const { products } = summarize([
      boyaSale(),
      boyaReturn({
        items: [
          {
            productId: '',
            productName: '',
            productCode: '0000001',
            lineType: 'Malzeme',
            quantity: 1,
            price: 10_000,
            total: 10_000,
          },
        ],
      }),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].productId).toBe(BOYA_ID);
    expect(products[0].quantity).toBe(1);
    expect(products[0].revenue).toBe(10_000);
  });

  it('aynı girdi ikinci kez özetlenince net değişmez', () => {
    const first = summarize(knownReceipt());
    const second = summarize(knownReceipt());
    expect(second.products[0].revenue).toBe(first.products[0].revenue);
    expect(second.products[0].revenue).toBe(10_000);
    expect(second.categories.reduce((sum, row) => sum + row.totalRevenue, 0)).toBe(120_000);
  });
});
