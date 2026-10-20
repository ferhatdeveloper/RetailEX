import { describe, expect, it } from 'vitest';
import { isDepositProductLine } from '../../utils/beautyDepositAllocation';
import {
  filterProfitLossByKind,
  foldProfitLossLines,
  type ProfitLossDepositLine,
} from '../../utils/profitLossDeposit';
import { resolveBeautyLineNet } from '../../utils/lastPurchaseCostSql';

function sum(lines: ProfitLossDepositLine[], key: 'total' | 'cost'): number {
  return lines.reduce((total, line) => total + (Number(line[key]) || 0), 0);
}

describe('foldProfitLossLines', () => {
  it('35.000 hizmet + 15.000 depozito → net satış 50.000, SMM hizmette, brüt kâr 50.000 − maliyet', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 50000,
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 35000,
        cost: 10000,
      },
      {
        invoiceId: 's1',
        invoiceNet: 50000,
        productName: 'DEPOSIT',
        productCode: 'DEPOSIT',
        lineType: 'deposit',
        quantity: 1,
        total: 15000,
        cost: 4000,
      },
    ]);

    expect(lines.map((line) => line.productName)).toEqual(['HAIR CUT']);
    expect(lines.some((line) => isDepositProductLine(line))).toBe(false);
    expect(lines[0].total).toBe(50000);
    expect(lines[0].cost).toBe(10000);
    expect((lines[0].total || 0) - (lines[0].cost || 0)).toBe(40000);
    expect(sum(lines, 'total')).toBe(50000);
    expect(sum(lines, 'cost')).toBe(10000);
    const revenue = sum(lines, 'total');
    const profit = revenue - sum(lines, 'cost');
    expect(profit).toBe(50000 - 10000);
    expect((profit / revenue) * 100).toBe(80);
  });

  it('hizmet tutarı fiş netine eşitse depozitoyu ikinci kez eklemez', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 50000,
        productName: 'HAIR CUT',
        quantity: 1,
        total: 50000,
        cost: 10000,
      },
      {
        invoiceId: 's1',
        invoiceNet: 50000,
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        quantity: 1,
        total: 15000,
        cost: 4000,
      },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0].total).toBe(50000);
    expect(lines[0].cost).toBe(10000);
    expect((lines[0].total || 0) - (lines[0].cost || 0)).toBe(40000);
    expect(lines[0].total).not.toBe(65000);
  });

  it('kalan hizmete eşitse düşülmüş satıra depozito payını bir kez yazar', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 35000,
        productName: 'HAIR CUT',
        quantity: 1,
        total: 35000,
        cost: 10000,
        ficheDeposits: [15000],
        ficheRemainders: [35000],
      },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0].productName).toBe('HAIR CUT');
    expect(lines[0].total).toBe(50000);
    expect(lines[0].cost).toBe(10000);
    expect((lines[0].total || 0) - (lines[0].cost || 0)).toBe(40000);
  });

  it('brüt hizmette kalan + depozito zaten varsa payı şişirmez', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 65000,
        productName: 'HAIR CUT',
        quantity: 1,
        total: 50000,
        cost: 10000,
        ficheRemainders: [35000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 65000,
        productName: 'DEPOSIT',
        lineType: 'deposit',
        quantity: 1,
        total: 15000,
        cost: 999,
      },
    ]);

    expect(lines.map((line) => line.productName)).toEqual(['HAIR CUT']);
    expect(lines[0].total).toBe(50000);
    expect(sum(lines, 'cost')).toBe(10000);
    expect(sum(lines, 'total') - sum(lines, 'cost')).toBe(40000);
  });

  it('iade eksi kalır; brüt kâr satış eksi maliyettir', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 'ret',
        invoiceNet: -50000,
        productName: 'HAIR CUT',
        quantity: -1,
        total: -35000,
        cost: -10000,
      },
      {
        invoiceId: 'ret',
        invoiceNet: -50000,
        productName: 'DEPOSIT',
        lineType: 'deposit',
        quantity: -1,
        total: -15000,
        cost: -4000,
      },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0].total).toBe(-50000);
    expect(lines[0].cost).toBe(-10000);
    expect((lines[0].total || 0) - (lines[0].cost || 0)).toBe(-40000);
  });

  it('iade tutarı fiş netine eşitse depozitoyu ikinci kez düşmez', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 'ret',
        invoiceNet: -50000,
        productName: 'HAIR CUT',
        quantity: -1,
        total: -50000,
        cost: -10000,
        ficheDeposits: [-15000],
        ficheRemainders: [-35000],
      },
    ]);

    expect(lines[0].total).toBe(-50000);
    expect((lines[0].total || 0) - (lines[0].cost || 0)).toBe(-40000);
  });

  it('yalnız bir hizmetin depozitosu kardeşe yayılmaz', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 40000,
        productName: 'Kesim',
        quantity: 1,
        total: 20000,
        cost: 4000,
        depositAmount: 5000,
      },
      {
        invoiceId: 's1',
        invoiceNet: 40000,
        productName: 'Boya',
        quantity: 1,
        total: 15000,
        cost: 3000,
        depositAmount: 0,
      },
    ]);

    expect(lines.map((line) => line.total)).toEqual([25000, 15000]);
    expect(lines.map((line) => line.cost)).toEqual([4000, 3000]);
    expect(sum(lines, 'total')).toBe(40000);
    expect(sum(lines, 'total') - sum(lines, 'cost')).toBe(40000 - 7000);
  });

  it('aynı tutar iki hizmete kopyalandıysa bir kez bölünür', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 35000,
        productName: 'Kesim',
        quantity: 1,
        total: 17000,
        cost: 2000,
        ficheDeposits: [5000, 5000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 35000,
        productName: 'Boya',
        quantity: 1,
        total: 13000,
        cost: 1000,
        ficheDeposits: [5000, 5000],
      },
    ]);

    expect(lines.map((line) => line.total)).toEqual([20000, 15000]);
    expect(sum(lines, 'total')).toBe(35000);
    expect(sum(lines, 'cost')).toBe(3000);
  });

  it('50.000 ve 60.000 hizmet ile 20.000 depozito net satışı 110.000 bırakır', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        quantity: 1,
        total: 50000,
        cost: 20000,
        ficheDeposits: [20000],
        ficheRemainders: [90000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'HAIR PINK COLOR',
        lineType: 'Hizmet',
        quantity: 1,
        total: 60000,
        cost: 20000,
        ficheDeposits: [20000],
        ficheRemainders: [90000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        quantity: 1,
        total: 20000,
        cost: 4000,
        ficheDeposits: [20000],
        ficheRemainders: [90000],
      },
    ]);

    expect(lines.map((line) => line.productName)).toEqual(['HAIR CUT', 'HAIR PINK COLOR']);
    expect(lines.some((line) => isDepositProductLine(line))).toBe(false);
    expect(lines.map((line) => line.total)).toEqual([50000, 60000]);
    expect(lines.map((line) => line.cost)).toEqual([20000, 20000]);
    expect(sum(lines, 'total')).toBe(110000);
    expect(sum(lines, 'total')).not.toBe(100000);
    expect(sum(lines, 'total')).not.toBe(130000);
    expect(sum(lines, 'total')).not.toBe(90000);
    expect(sum(lines, 'total') - sum(lines, 'cost')).toBe(70000);
  });

  it('başlık 130.000, 100.000 veya 90.000 olsa da depozito ciroya eklenmez ve düşülmez', () => {
    const services = [
      {
        invoiceId: 's1',
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        quantity: 1,
        total: 50000,
        cost: 20000,
        ficheDeposits: [20000],
      },
      {
        invoiceId: 's1',
        productName: 'HAIR PINK COLOR',
        lineType: 'Hizmet',
        quantity: 1,
        total: 60000,
        cost: 20000,
        ficheDeposits: [20000],
      },
      {
        invoiceId: 's1',
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        quantity: 1,
        total: 20000,
        cost: 0,
        ficheDeposits: [20000],
      },
    ];

    for (const invoiceNet of [130000, 90000, 100000]) {
      const lines = foldProfitLossLines(services.map((line) => ({ ...line, invoiceNet })));
      expect(lines.map((line) => line.total)).toEqual([50000, 60000]);
      expect(sum(lines, 'total')).toBe(110000);
      expect(sum(lines, 'cost')).toBe(40000);
    }
  });

  it('ayrı peşinat fişi satır üretmez ve payı bir kez hizmete yazar', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 'svc',
        invoiceNet: 35000,
        saleGroupId: 'dep',
        productName: 'HAIR CUT',
        quantity: 1,
        total: 35000,
        cost: 10000,
        ficheRemainders: [35000],
      },
      {
        invoiceId: 'dep',
        invoiceNet: 15000,
        productName: 'DEPOSIT',
        lineType: 'deposit',
        quantity: 1,
        total: 15000,
        cost: 4000,
      },
    ]);

    expect(lines.map((line) => line.productName)).toEqual(['HAIR CUT']);
    expect(lines[0].total).toBe(50000);
    expect(lines[0].cost).toBe(10000);
    expect(sum(lines, 'total') - sum(lines, 'cost')).toBe(40000);
  });

  it('ürün 25.000 ve hizmet 50.000 ayrı kalır; randevu fiyatı ürünü 50.000 yapmaz', () => {
    const productNet = resolveBeautyLineNet({
      ficheNo: 'BEA-2026-1',
      itemType: 'Malzeme',
      lineKind: 'product',
      lineNet: 25000,
      appointmentTotal: 50000,
      nonDepositLineCount: 1,
    });
    const serviceNet = resolveBeautyLineNet({
      ficheNo: 'BEA-2026-1',
      itemType: 'Hizmet',
      lineKind: 'service',
      lineNet: 50000,
      appointmentTotal: 50000,
      nonDepositLineCount: 2,
    });
    expect(productNet).toBe(25000);
    expect(productNet).not.toBe(50000);
    expect(serviceNet).toBe(50000);

    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 75000,
        productName: 'Şampuan',
        lineType: 'Malzeme',
        lineKind: 'product',
        quantity: 1,
        total: productNet,
        cost: 8000,
      },
      {
        invoiceId: 's1',
        invoiceNet: 75000,
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: serviceNet,
        cost: 10000,
      },
      {
        invoiceId: 's1',
        invoiceNet: 75000,
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        lineKind: 'product',
        quantity: 1,
        total: 20000,
        cost: 4000,
      },
    ]);

    expect(lines.some((line) => isDepositProductLine(line))).toBe(false);
    const products = filterProfitLossByKind(lines, 'product');
    const services = filterProfitLossByKind(lines, 'service');
    const all = filterProfitLossByKind(lines, 'all');
    expect(products.map((line) => line.productName)).toEqual(['Şampuan']);
    expect(sum(products, 'total')).toBe(25000);
    expect(sum(products, 'total') - sum(products, 'cost')).toBe(17000);
    expect(services.map((line) => line.productName)).toEqual(['HAIR CUT']);
    expect(sum(services, 'total')).toBe(50000);
    expect(sum(services, 'total') - sum(services, 'cost')).toBe(40000);
    expect(sum(all, 'total')).toBe(75000);
    expect(sum(all, 'total') - sum(all, 'cost')).toBe(57000);
    expect(products[0].total).not.toBe(50000);
  });

  it('depozito sorguda ürün türü gelse de satır olmaz; iki hizmet 110.000 kalır', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 50000,
        cost: 20000,
        ficheDeposits: [20000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'HAIR PINK COLOR',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 60000,
        cost: 20000,
        ficheDeposits: [20000],
      },
      {
        invoiceId: 's1',
        invoiceNet: 110000,
        productName: 'Depozito (Peşinat Avansı)',
        lineType: 'deposit',
        lineKind: 'product',
        quantity: 1,
        total: 20000,
        cost: 4000,
        ficheDeposits: [20000],
      },
    ]);

    expect(lines.map((line) => line.total)).toEqual([50000, 60000]);
    expect(sum(lines, 'total')).toBe(110000);
    expect(filterProfitLossByKind(lines, 'product')).toEqual([]);
    expect(sum(filterProfitLossByKind(lines, 'service'), 'total')).toBe(110000);
    expect(lines.some((line) => isDepositProductLine(line))).toBe(false);
  });

  it('ürün iadesi eksi kalır ve hizmete karışmaz', () => {
    const lines = foldProfitLossLines([
      {
        invoiceId: 'ret',
        invoiceNet: -25000,
        productName: 'Şampuan',
        lineType: 'Malzeme',
        lineKind: 'product',
        quantity: -1,
        total: -25000,
        cost: -8000,
      },
      {
        invoiceId: 'ret',
        invoiceNet: -25000,
        productName: 'HAIR CUT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: -1,
        total: -50000,
        cost: -10000,
      },
    ]);

    expect(sum(filterProfitLossByKind(lines, 'product'), 'total')).toBe(-25000);
    expect(sum(filterProfitLossByKind(lines, 'service'), 'total')).toBe(-50000);
    expect(sum(filterProfitLossByKind(lines, 'all'), 'total')).toBe(-75000);
    const product = filterProfitLossByKind(lines, 'product')[0];
    expect((product.total || 0) - (product.cost || 0)).toBe(-17000);
  });
});
