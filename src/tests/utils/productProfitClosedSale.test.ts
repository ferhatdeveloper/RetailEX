/**
 * Ürün kârlılığı satış tutarı — kar-zarar raporu ile aynı net.
 * HIGHLIGHT ve STRONG kapalı faturanın peşinatını bir kez alır.
 * SABUN iadesi bir kez düşer. Açık ve iptal peşinat satışa girmez.
 */
import { describe, expect, it } from 'vitest';
import { productGrossProfitMarginPct } from '../../utils/productGrossProfitMargin';
import {
  SQL_FICHE_DEPOSIT_LIST,
  SQL_PROFIT_APPT_DEPOSIT_SKIP,
  SQL_PROFIT_FICHE_DEPOSIT_LIST,
  SQL_PROFIT_FICHE_REMAINDER_LIST,
  SQL_PROFIT_SERVICE_DEPOSIT_AMOUNT,
  SQL_SERVICE_DEPOSIT_AMOUNT,
} from '../../utils/lastPurchaseCostSql';
import {
  foldProductProfitSaleLines,
  foldRestProfitInvoice,
  type ProductProfitSaleLine,
} from '../../utils/productProfitClosedSale';

function totals(lines: ProductProfitSaleLine[]) {
  const byName = new Map<string, { revenue: number; cost: number }>();
  for (const line of lines) {
    const name = String(line.productName || '');
    const cur = byName.get(name) || { revenue: 0, cost: 0 };
    cur.revenue += Number(line.total) || 0;
    cur.cost += Number(line.cost) || 0;
    byName.set(name, cur);
  }
  let revenue = 0;
  let cost = 0;
  for (const row of byName.values()) {
    revenue += row.revenue;
    cost += row.cost;
  }
  const profit = revenue - cost;
  return { byName, revenue, cost, profit, margin: productGrossProfitMarginPct(revenue, profit) };
}

describe('kapanmış randevu peşinatı ürün kârlılığı satışında', () => {
  const closedLines: ProductProfitSaleLine[] = [
    {
      invoiceId: 'hl',
      invoiceNet: 50000,
      productName: 'HIGHLIGHT',
      lineType: 'Hizmet',
      lineKind: 'service',
      quantity: 1,
      total: 50000,
      cost: 25000,
      depositAmount: 25000,
      ficheDeposits: [25000],
      ficheRemainders: [50000],
      appointmentStatus: 'completed',
    },
    {
      invoiceId: 'st',
      invoiceNet: 20000,
      productName: 'STRONG',
      lineType: 'Hizmet',
      lineKind: 'service',
      quantity: 1,
      total: 20000,
      cost: 10000,
      depositAmount: 5000,
      ficheDeposits: [5000],
      ficheRemainders: [20000],
      appointmentStatus: 'kapandı',
    },
    {
      invoiceId: 'sabun',
      invoiceNet: 30000,
      productName: 'SABUN',
      productCode: '000001',
      lineType: 'Malzeme',
      lineKind: 'product',
      quantity: 1,
      total: 30000,
      cost: 5000,
    },
    {
      invoiceId: 'sabun-iade',
      invoiceNet: -15000,
      productName: 'SABUN',
      productCode: '000001',
      lineType: 'Malzeme',
      lineKind: 'product',
      quantity: -1,
      total: -15000,
      cost: 0,
    },
    {
      invoiceId: 'acik',
      invoiceNet: 10000,
      productName: 'DEPOSIT',
      lineType: 'deposit',
      quantity: 1,
      total: 10000,
      cost: 0,
      appointmentStatus: 'pre_paid',
    },
    {
      invoiceId: 'iptal',
      invoiceNet: -8000,
      productName: 'DEPOSIT',
      lineType: 'deposit',
      quantity: -1,
      total: -8000,
      cost: 0,
      appointmentStatus: 'cancelled',
    },
  ];

  it('HIGHLIGHT 75.000 / 50.000, STRONG 25.000 / 15.000, SABUN net 15.000 / 10.000, toplam 115.000 / 40.000 / 75.000', () => {
    const folded = foldProductProfitSaleLines(closedLines);
    const sum = totals(folded);
    const highlight = sum.byName.get('HIGHLIGHT');
    const strong = sum.byName.get('STRONG');
    const soap = sum.byName.get('SABUN');

    expect(highlight?.revenue).toBe(75000);
    expect(highlight?.cost).toBe(25000);
    expect((highlight?.revenue || 0) - (highlight?.cost || 0)).toBe(50000);

    expect(strong?.revenue).toBe(25000);
    expect(strong?.cost).toBe(10000);
    expect((strong?.revenue || 0) - (strong?.cost || 0)).toBe(15000);

    expect(soap?.revenue).toBe(15000);
    expect(soap?.cost).toBe(5000);
    expect((soap?.revenue || 0) - (soap?.cost || 0)).toBe(10000);

    expect(sum.revenue).toBe(115000);
    expect(sum.cost).toBe(40000);
    expect(sum.profit).toBe(75000);
    expect(sum.margin).toBe(65.22);
    expect(folded.some((line) => line.productName === 'DEPOSIT')).toBe(false);
  });

  it('peşinat satıştan düşülmez ve tam tutara ikinci kez eklenmez', () => {
    const once = foldProductProfitSaleLines([
      {
        invoiceId: 'hl',
        invoiceNet: 75000,
        productName: 'HIGHLIGHT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 75000,
        cost: 25000,
        depositAmount: 25000,
        ficheDeposits: [25000],
        ficheRemainders: [50000],
        appointmentStatus: 'completed',
      },
    ]);
    expect(once[0]?.total).toBe(75000);
    expect(once[0]?.total).not.toBe(100000);
    expect(once[0]?.total).not.toBe(50000);
    expect((once[0]?.total || 0) - (once[0]?.cost || 0)).toBe(50000);
  });

  it('açık peşinat satışa girmez; iptal peşinatı iade olmaz', () => {
    const folded = foldProductProfitSaleLines([
      {
        invoiceId: 'acik-hizmet',
        invoiceNet: 40000,
        productName: 'AÇIK HİZMET',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 40000,
        cost: 1000,
        depositAmount: 10000,
        ficheDeposits: [10000],
        ficheRemainders: [40000],
        appointmentStatus: 'scheduled',
      },
      {
        invoiceId: 'iptal',
        invoiceNet: -7000,
        productName: 'DEPOSIT',
        lineType: 'deposit',
        quantity: -1,
        total: -7000,
        cost: 0,
        appointmentStatus: 'cancelled',
      },
    ]);
    expect(folded.map((line) => line.productName)).toEqual(['AÇIK HİZMET']);
    expect(folded[0]?.total).toBe(40000);
    expect(folded.reduce((sum, line) => sum + (Number(line.total) || 0), 0)).toBe(40000);
  });

  it('REST katlaması aynı üç satırı ve toplamı verir', () => {
    const highlight = foldRestProfitInvoice(
      [{
        invoiceId: 'hl',
        productName: 'HIGHLIGHT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 50000,
        cost: 25000,
      }],
      { id: 'hl', total: 50000, linkedAppointmentId: 'a-hl' },
      [{
        id: 'a-hl',
        status: 'completed',
        deposit_amount: 25000,
        remainder_paid_amount: 50000,
        service_name: 'HIGHLIGHT',
      }],
    );
    const strong = foldRestProfitInvoice(
      [{
        invoiceId: 'st',
        productName: 'STRONG',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 20000,
        cost: 10000,
      }],
      { id: 'st', total: 20000, linkedAppointmentId: 'a-st' },
      [{
        id: 'a-st',
        status: 'completed',
        deposit_amount: 5000,
        remainder_paid_amount: 20000,
        service_name: 'STRONG',
      }],
    );
    const soapSale = foldRestProfitInvoice(
      [{
        invoiceId: 'sabun',
        productName: 'SABUN',
        lineType: 'Malzeme',
        lineKind: 'product',
        quantity: 1,
        total: 30000,
        cost: 5000,
      }],
      { id: 'sabun', total: 30000 },
      [],
    );
    const soapReturn = foldRestProfitInvoice(
      [{
        invoiceId: 'sabun-iade',
        productName: 'SABUN',
        lineType: 'Malzeme',
        lineKind: 'product',
        quantity: -1,
        total: -15000,
        cost: 0,
      }],
      { id: 'sabun-iade', total: -15000 },
      [],
    );
    const open = foldRestProfitInvoice(
      [{
        invoiceId: 'acik',
        productName: 'DEPOSIT',
        lineType: 'deposit',
        total: 12000,
        cost: 0,
        appointmentStatus: 'pre_paid',
      }],
      { id: 'acik', total: 12000, linkedAppointmentId: 'a-open' },
      [{
        id: 'a-open',
        status: 'pre_paid',
        deposit_amount: 12000,
        remainder_paid_amount: 0,
        service_name: 'DEPOSIT',
      }],
    );
    const sum = totals([...highlight, ...strong, ...soapSale, ...soapReturn, ...open]);
    expect(sum.byName.get('HIGHLIGHT')?.revenue).toBe(75000);
    expect((sum.byName.get('HIGHLIGHT')?.revenue || 0) - (sum.byName.get('HIGHLIGHT')?.cost || 0)).toBe(50000);
    expect(sum.byName.get('STRONG')?.revenue).toBe(25000);
    expect((sum.byName.get('STRONG')?.revenue || 0) - (sum.byName.get('STRONG')?.cost || 0)).toBe(15000);
    expect(sum.byName.get('SABUN')?.revenue).toBe(15000);
    expect((sum.byName.get('SABUN')?.revenue || 0) - (sum.byName.get('SABUN')?.cost || 0)).toBe(10000);
    expect(sum.revenue).toBe(115000);
    expect(sum.cost).toBe(40000);
    expect(sum.profit).toBe(75000);
    expect(open).toHaveLength(0);
  });

  it('kârlılık sorgusu açık ve iptal peşinatı listeden çıkarır; kar-zarar listesi durur', () => {
    expect(SQL_PROFIT_APPT_DEPOSIT_SKIP).toContain("'pre_paid'");
    expect(SQL_PROFIT_APPT_DEPOSIT_SKIP).toContain("'cancelled'");
    expect(SQL_PROFIT_APPT_DEPOSIT_SKIP).toContain("'scheduled'");
    expect(SQL_PROFIT_SERVICE_DEPOSIT_AMOUNT).toContain('NOT');
    expect(SQL_PROFIT_FICHE_DEPOSIT_LIST).toContain(SQL_PROFIT_APPT_DEPOSIT_SKIP);
    expect(SQL_PROFIT_FICHE_REMAINDER_LIST).toContain(SQL_PROFIT_APPT_DEPOSIT_SKIP);
    expect(SQL_PROFIT_SERVICE_DEPOSIT_AMOUNT).not.toBe(SQL_SERVICE_DEPOSIT_AMOUNT);
    expect(SQL_FICHE_DEPOSIT_LIST).not.toContain(SQL_PROFIT_APPT_DEPOSIT_SKIP);
  });
});
