/**
 * Karlılık Analizi genel bakış — Kar-Zarar ile aynı net.
 * Kapalı faturanın peşinatı satıştan düşülmez ve ikinci kez eklenmez.
 * Açık ve iptal peşinatı girmez. Sabun iadesi bir kez düşer.
 */
import { describe, expect, it } from 'vitest';
import {
  foldRestProfitInvoice,
  summarizeProfitDashboard,
  type ProductProfitSaleLine,
} from '../../utils/productProfitClosedSale';

const closedVisit: ProductProfitSaleLine[] = [
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
    appointmentStatus: 'confirmed',
    invoiceClosed: true,
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
    appointmentStatus: 'pre_paid',
    invoiceClosed: true,
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
    invoiceClosed: true,
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
    invoiceClosed: true,
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
    invoiceClosed: true,
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
    invoiceClosed: true,
  },
];

describe('Karlılık Analizi genel bakış', () => {
  it('satış 115.000, maliyet 40.000, kâr 75.000, marj %65,22; HIGHLIGHT 75.000', () => {
    const sum = summarizeProfitDashboard(closedVisit);
    expect(sum.byName.get('HIGHLIGHT')?.revenue).toBe(75000);
    expect(sum.byName.get('HIGHLIGHT')?.profit).toBe(50000);
    expect(sum.byName.get('STRONG')?.revenue).toBe(25000);
    expect(sum.byName.get('STRONG')?.profit).toBe(15000);
    expect(sum.byName.get('SABUN')?.revenue).toBe(15000);
    expect(sum.byName.get('SABUN')?.cost).toBe(5000);
    expect(sum.revenue).toBe(115000);
    expect(sum.cost).toBe(40000);
    expect(sum.profit).toBe(75000);
    expect(sum.margin).toBe(65.22);
    expect(sum.revenue).not.toBe(85000);
    expect(sum.profit).not.toBe(45000);
    expect(sum.byName.has('DEPOSIT')).toBe(false);
    expect(sum.topProduct).toBe('HIGHLIGHT');
  });

  it('peşinat düşülmez ve tam tutara ikinci kez eklenmez', () => {
    const sum = summarizeProfitDashboard([
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
        appointmentStatus: 'confirmed',
        invoiceClosed: true,
      },
    ]);
    expect(sum.byName.get('HIGHLIGHT')?.revenue).toBe(75000);
    expect(sum.revenue).not.toBe(50000);
    expect(sum.revenue).not.toBe(100000);
    expect(sum.profit).toBe(50000);
  });

  it('açık peşinat satışa girmez; iptal peşinatı iade olmaz', () => {
    const sum = summarizeProfitDashboard([
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
        invoiceClosed: true,
      },
    ]);
    expect(sum.byName.get('AÇIK HİZMET')?.revenue).toBe(40000);
    expect(sum.revenue).toBe(40000);
    expect(sum.byName.has('DEPOSIT')).toBe(false);
  });

  it('REST katlaması kapalı faturada confirmed peşinatı bir kez yazar', () => {
    const folded = foldRestProfitInvoice(
      [{
        invoiceId: 'hl',
        invoiceNet: 50000,
        productName: 'HIGHLIGHT',
        lineType: 'Hizmet',
        lineKind: 'service',
        quantity: 1,
        total: 50000,
        cost: 25000,
        invoiceClosed: true,
      }],
      { id: 'hl', total: 50000, linkedAppointmentId: 'a-hl' },
      [{
        id: 'a-hl',
        status: 'confirmed',
        deposit_amount: 25000,
        remainder_paid_amount: 50000,
        service_name: 'HIGHLIGHT',
      }],
    );
    const sum = summarizeProfitDashboard(folded);
    expect(sum.byName.get('HIGHLIGHT')?.revenue).toBe(75000);
    expect(sum.revenue).not.toBe(85000);
    expect(sum.revenue).not.toBe(100000);
  });

  it('ortalama işlem, satış tutarını işlem adedine böler', () => {
    const sum = summarizeProfitDashboard(closedVisit);
    const transactionCount = 6;
    const avg = transactionCount > 0 ? sum.revenue / transactionCount : 0;
    expect(Math.round(avg)).toBe(19167);
    expect(Math.round(avg)).not.toBe(14167);
  });
});
