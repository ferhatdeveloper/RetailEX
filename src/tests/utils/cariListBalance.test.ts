import { describe, expect, it } from 'vitest';
import { cariCashLineLedgerContrib } from '../../services/api/accountBalance';
import {
  cariListBalanceForDisplay,
  sumCariListDisplayBalances,
} from '../../utils/cariListBalance';
import { sumReservationDepositAmounts } from '../../utils/invoiceHeaderBalance';
import { sumReservationDepositsByAccount } from '../../utils/reservationDepositByAccount';

const SCREEN = [
  { name: 'ALİ RASİD', cardType: 'supplier' as const, balance: 50_000, reservationDeposit: 50_000 },
  { name: 'BERKEN', cardType: 'customer' as const, balance: -25_000, reservationDeposit: 25_000 },
  { name: 'DUNYA', cardType: 'customer' as const, balance: -20_000, reservationDeposit: 20_000 },
  { name: 'RZA', cardType: 'customer' as const, balance: -15_000, reservationDeposit: 15_000 },
];

describe('cari hesap listesi — rezervasyon peşinatı alacak bakiyesine yazılmaz', () => {
  it('BERKEN, DUNYA ve RZA peşinatı müşteri alacağı olarak görünmez', () => {
    expect(cariListBalanceForDisplay('customer', -25_000, 25_000)).toBe(0);
    expect(cariListBalanceForDisplay('customer', -20_000, 20_000)).toBe(0);
    expect(cariListBalanceForDisplay('customer', -15_000, 15_000)).toBe(0);
  });

  it('ALİ RASİD peşinatı tedarikçi alacağına yazılmaz; ticari alacak durur', () => {
    expect(cariListBalanceForDisplay('supplier', 50_000, 50_000)).toBe(0);
    expect(cariListBalanceForDisplay('supplier', 50_000, 0)).toBe(50_000);
    expect(cariListBalanceForDisplay('supplier', 80_000, 50_000)).toBe(30_000);
    expect(cariListBalanceForDisplay('supplier', -10_000, 50_000)).toBe(-10_000);
  });

  it('dört satırın dip toplamı düzeltilmiş bakiyelerin toplamıdır', () => {
    const raw = SCREEN.reduce((s, r) => s + r.balance, 0);
    expect(raw).toBe(-10_000);
    expect(sumCariListDisplayBalances(SCREEN)).toBe(0);
    const commercialSupplier = SCREEN.map((r) =>
      r.name === 'ALİ RASİD' ? { ...r, reservationDeposit: 0 } : r,
    );
    expect(sumCariListDisplayBalances(commercialSupplier)).toBe(50_000);
  });

  it('tamamlanan randevuda peşinat alacak olarak kalmaz', () => {
    expect(cariListBalanceForDisplay('customer', 0, 20_000)).toBe(0);
    expect(cariListBalanceForDisplay('customer', -20_000, 20_000)).toBe(0);
    expect(cariListBalanceForDisplay('supplier', 0, 50_000)).toBe(0);
  });

  it('iptalde geri ödeme alacağı oluşmaz', () => {
    expect(cariListBalanceForDisplay('customer', -15_000, 15_000)).toBe(0);
    expect(cariListBalanceForDisplay('customer', -15_000, 15_000)).not.toBe(-15_000);
    expect(cariListBalanceForDisplay('supplier', 50_000, 50_000)).toBe(0);
  });

  it('gerçek veresiye borç ayrıca durur ve peşinat kadar şişmez', () => {
    expect(cariListBalanceForDisplay('customer', 40_000, 15_000)).toBe(40_000);
    expect(cariListBalanceForDisplay('customer', 55_000, 20_000)).toBe(55_000);
  });

  it('indirim bakiyeye eklenmez', () => {
    expect(cariListBalanceForDisplay('customer', 55_000, 0)).toBe(55_000);
    expect(cariListBalanceForDisplay('customer', 55_000, 0)).not.toBe(75_000);
  });

  it('peşinat dışı gerçek alacak durur', () => {
    expect(cariListBalanceForDisplay('customer', -30_000, 20_000)).toBe(-10_000);
  });

  it('kasa satırının tutarı ve defter işareti değişmez', () => {
    const customerLine = {
      amount: 25_000,
      transaction_type: 'CH_TAHSILAT',
      special_code: 'REZERVASYON',
      customer_id: 'berken',
      party_id: null,
    };
    const supplierLine = {
      amount: 50_000,
      transaction_type: 'CH_TAHSILAT',
      special_code: 'REZERVASYON',
      customer_id: null,
      party_id: 'ali',
    };
    const before = {
      customer: { ...customerLine },
      supplier: { ...supplierLine },
    };
    const byAccount = sumReservationDepositsByAccount([customerLine, supplierLine]);
    expect(byAccount.berken).toBe(25_000);
    expect(byAccount.ali).toBe(50_000);
    expect(customerLine).toEqual(before.customer);
    expect(supplierLine).toEqual(before.supplier);
    expect(cariCashLineLedgerContrib(customerLine.amount, customerLine.transaction_type, 'customer')).toBe(-25_000);
    expect(cariCashLineLedgerContrib(supplierLine.amount, supplierLine.transaction_type, 'supplier')).toBe(50_000);
    expect(cariListBalanceForDisplay('customer', -25_000, byAccount.berken)).toBe(0);
    expect(cariListBalanceForDisplay('supplier', 50_000, byAccount.ali)).toBe(0);
  });

  it('özel kod ve rezervasyon tahsilatı aynı kimliktir; normal tahsilat karışmaz', () => {
    const rows = [
      {
        customer_id: 'dunya',
        amount: 20_000,
        transaction_type: 'CH_TAHSILAT',
        special_code: 'REZERVASYON',
      },
      {
        customer_id: 'rza',
        amount: 15_000,
        transaction_type: 'CH_TAHSILAT',
        definition: 'Rezervasyon tahsilatı - AVANS-33105061',
      },
      {
        customer_id: 'rza',
        amount: 40_000,
        transaction_type: 'CH_TAHSILAT',
        special_code: '',
        definition: 'Hizmet tahsilatı',
      },
      {
        customer_id: 'berken',
        party_id: 'ali',
        amount: 25_000,
        transaction_type: 'CH_TAHSILAT',
        special_code: 'AVANS',
      },
    ];
    const byAccount = sumReservationDepositsByAccount(rows);
    expect(byAccount.dunya).toBe(20_000);
    expect(byAccount.rza).toBe(15_000);
    expect(byAccount.berken).toBe(25_000);
    expect(byAccount.ali).toBeUndefined();
    expect(sumReservationDepositAmounts(rows)).toBe(60_000);
  });
});
