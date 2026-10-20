/**
 * Kasa defteri: nakit iade 10.000 varken gelen 130.000, giden 10.000, net 120.000.
 * Peşinat 20.000 kasada kalır.
 * Fatura kalem: 50.000 + 60.000 + 20.000 − 10.000 = 120.000, iade miktarı eksi.
 */
import { describe, expect, it } from 'vitest';
import {
  cashLedgerTotals,
  cashRefundAmount,
  invoiceItemsDetailCards,
  mergeCashLedgerRefunds,
  signInvoiceDetailAmounts,
  type CashLedgerMovement,
  type SalesCashRefundSource,
} from '../../utils/reportReturnCashSign';

function movement(partial: Partial<CashLedgerMovement> & Pick<CashLedgerMovement, 'id' | 'ficheNo' | 'incoming'>): CashLedgerMovement {
  return {
    date: '2026-10-20',
    sequence: 1,
    group: 'KASA_GIRIS',
    subGroup: '',
    description: '',
    outgoing: 0,
    cumulative: 0,
    ...partial,
  };
}

const cashReturn: SalesCashRefundSource = {
  id: 'ret-1',
  date: '2026-10-20',
  ficheNo: '0000003',
  ficheType: 'return_invoice',
  trcode: 3,
  paymentMethod: 'Nakit',
  netAmount: 10_000,
  totalNet: 10_000,
  isDeposit: false,
  customerId: 'c1',
  customerName: 'FERDİN BEY',
};

describe('kasa defteri nakit iade', () => {
  const base = [
    movement({
      id: '1',
      ficheNo: 'BEA-2026-MVY6L8RM',
      group: 'KASA_CIKIS',
      description: 'Satış tahsilatı — BEA-2026-MVY6L8RM',
      incoming: 90_000,
      cariName: 'TEST',
    }),
    movement({
      id: '2',
      ficheNo: 'BEA-2026-MVX2EUWF',
      group: 'KASA_GIRIS',
      description: 'Satış tahsilatı — BEA-2026-MVX2EUWF',
      incoming: 20_000,
      cariName: 'FERDİN BEY',
    }),
    movement({
      id: '3',
      ficheNo: 'KL-AVANS',
      group: 'CH_TAHSILAT',
      description: 'Rezervasyon tahsilatı · AVANS-bea2b0a2',
      incoming: 20_000,
      cariName: 'TEST',
    }),
  ];

  it('nakit iade 10.000 varken gelen 130.000, giden 10.000, net ve son bakiye 120.000', () => {
    const rows = mergeCashLedgerRefunds(base, [cashReturn]);
    const totals = cashLedgerTotals(rows);
    const refund = rows.find((row) => row.ficheNo === '0000003');

    expect(refund).toBeDefined();
    expect(refund?.incoming).toBe(0);
    expect(refund?.outgoing).toBe(10_000);
    expect(totals.incoming).toBe(130_000);
    expect(totals.outgoing).toBe(10_000);
    expect(totals.net).toBe(120_000);
    expect(totals.finalBalance).toBe(120_000);
    expect(rows[rows.length - 1]?.cumulative).toBe(120_000);
    expect(totals.incoming).not.toBe(120_000);
  });

  it('peşinat 20.000 iade sanılıp düşülmez', () => {
    const rows = mergeCashLedgerRefunds(base, [cashReturn]);
    const deposit = rows.find((row) => row.ficheNo === 'KL-AVANS');
    expect(deposit?.incoming).toBe(20_000);
    expect(deposit?.outgoing).toBe(0);
    expect(cashRefundAmount({
      id: 'dep',
      date: '2026-10-20',
      ficheNo: 'KL-AVANS',
      ficheType: 'sales_invoice',
      trcode: 8,
      paymentMethod: 'Nakit',
      netAmount: 20_000,
      isDeposit: true,
    })).toBe(0);
    expect(cashRefundAmount({
      id: 'avans-iade',
      date: '2026-10-20',
      ficheNo: '0000099',
      ficheType: 'return_invoice',
      trcode: 3,
      paymentMethod: 'Avans',
      netAmount: 20_000,
      isDeposit: false,
    })).toBe(0);
  });

  it('kart iadesi ve mevcut giden satırı kasayı ikinci kez düşürmez', () => {
    expect(cashRefundAmount({
      ...cashReturn,
      paymentMethod: 'Kredi Kartı',
    })).toBe(0);

    const already = mergeCashLedgerRefunds(
      [
        movement({
          id: 'out',
          ficheNo: '0000003',
          group: 'KASA_CIKIS',
          description: 'Nakit iade — 0000003',
          incoming: 0,
          outgoing: 10_000,
        }),
      ],
      [cashReturn],
    );
    expect(already.filter((row) => row.ficheNo === '0000003')).toHaveLength(1);
    expect(cashLedgerTotals(already).outgoing).toBe(10_000);
  });
});

describe('fatura kalem detayı iade işareti', () => {
  it('satırlar 50+60+20−10 = 120.000, iade miktarı eksi, başlık iki kez toplanmaz', () => {
    const lines = [
      {
        ...signInvoiceDetailAmounts({
          quantity: 1,
          lineGross: 10_000,
          lineTotal: 10_000,
          invoiceTotal: 10_000,
        }, true),
        id: '1',
        invoiceNo: '0000003',
        unitPrice: 10_000,
      },
      {
        ...signInvoiceDetailAmounts({
          quantity: 2,
          lineGross: 20_000,
          lineTotal: 20_000,
          invoiceTotal: 20_000,
        }, false),
        id: '2',
        invoiceNo: 'BEA-URUN',
        unitPrice: 10_000,
      },
      {
        ...signInvoiceDetailAmounts({
          quantity: 1,
          lineGross: 50_000,
          lineTotal: 50_000,
          invoiceTotal: 110_000,
        }, false),
        id: '3',
        invoiceNo: 'BEA-HIZMET',
        unitPrice: 50_000,
      },
      {
        ...signInvoiceDetailAmounts({
          quantity: 1,
          lineGross: 60_000,
          lineTotal: 60_000,
          invoiceTotal: 110_000,
        }, false),
        id: '4',
        invoiceNo: 'BEA-HIZMET',
        unitPrice: 60_000,
      },
    ];

    expect(lines[0]?.quantity).toBe(-1);
    expect(lines[0]?.lineTotal).toBe(-10_000);
    expect(lines[0]?.invoiceTotal).toBe(-10_000);
    expect(lines[0]?.unitPrice).toBe(10_000);

    const cards = invoiceItemsDetailCards(lines);
    const headerSumPerRow = lines.reduce((sum, row) => sum + row.invoiceTotal, 0);

    expect(cards.qty).toBe(3);
    expect(cards.lineTotal).toBe(120_000);
    expect(cards.invoiceTotal).toBe(120_000);
    expect(cards.invoiceCount).toBe(3);
    expect(headerSumPerRow).toBe(230_000);
    expect(cards.invoiceTotal).not.toBe(headerSumPerRow);
    expect(cards.invoiceTotal).not.toBe(140_000);
    expect(cards.qty).not.toBe(5);
  });

  it('iade zaten eksi ise bir kez kalır', () => {
    const line = signInvoiceDetailAmounts({
      quantity: -1,
      lineGross: -10_000,
      lineTotal: -10_000,
      invoiceTotal: -10_000,
    }, true);
    expect(line.quantity).toBe(-1);
    expect(line.lineTotal).toBe(-10_000);
    expect(line.invoiceTotal).toBe(-10_000);
  });
});
