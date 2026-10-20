import { describe, expect, it } from 'vitest';
import { isDepositProductLine } from '../../utils/beautyDepositAllocation';
import { foldProfitLossLines, type ProfitLossDepositLine } from '../../utils/profitLossDeposit';

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
});
