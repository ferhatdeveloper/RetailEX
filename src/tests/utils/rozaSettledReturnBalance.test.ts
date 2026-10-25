/**
 * roza: nakit satış ve nakit iade borç = alacak. Peşinat da borç = alacak.
 * Liste kolonu ve ekstre başlığı aynı neti gösterir: 0.
 * Açık iade tek taraflı alacak kalır. Tedarikçi ticari alacağı durur.
 * Kasa satırı ve defter işareti değişmez.
 */
import { describe, expect, it } from 'vitest';
import {
  cariCashLineLedgerContrib,
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
  sqlCustomerAccountBalancesCte,
} from '../../services/api/accountBalance';
import { buildEkstreRows, isCariCreditorBalance } from '../../utils/cariAccountStatement';
import {
  cariListBalanceForDisplay,
  ekstreHeaderBalanceForDisplay,
  sumCariListDisplayBalances,
} from '../../utils/cariListBalance';
import { sumReservationDepositsByAccount } from '../../utils/reservationDepositByAccount';

const ROZA = 'roza';
const ALI = 'ali-rasid';

const CASH_LINES = [
  {
    customer_id: ROZA,
    amount: 5_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: 'REZERVASYON',
    definition: 'Rezervasyon tahsilatı · AVANS-33985dd1',
  },
  {
    customer_id: ROZA,
    amount: 5_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: 'REZERVASYON',
    definition: 'Rezervasyon tahsilatı · AVANS-db01faa6',
  },
];

const SALES = [
  {
    customer_id: ROZA,
    customer_name: 'roza',
    net_amount: 15_000,
    fiche_type: 'sales_invoice',
    payment_method: 'Nakit',
    is_cancelled: false,
  },
  {
    customer_id: ROZA,
    customer_name: 'roza',
    net_amount: 15_000,
    fiche_type: 'return_invoice',
    payment_method: 'Nakit',
    is_cancelled: false,
  },
];

describe('roza nakit iade — liste ve ekstre başlığı 0', () => {
  it('borç=alacak iade 15.000 ve peşinat varken bakiye 0, tedarikçi 50.000 A durur, kasa değişmez', () => {
    const cashBefore = CASH_LINES.map((row) => ({ ...row }));
    const deposits = sumReservationDepositsByAccount(CASH_LINES);
    expect(deposits[ROZA]).toBe(10_000);

    const ledger = computeCustomerBalanceFromLedger(ROZA, 'roza', SALES, CASH_LINES, -25_000);
    expect(ledger).toBe(-10_000);
    expect(ledger).not.toBe(-25_000);
    expect(ledger).not.toBe(-15_000);

    const listBalance = cariListBalanceForDisplay('customer', ledger, deposits[ROZA]);
    const headerBalance = ekstreHeaderBalanceForDisplay('customer', ledger, deposits[ROZA]);
    expect(listBalance).toBe(0);
    expect(headerBalance).toBe(0);
    expect(headerBalance).toBe(listBalance);
    expect(isCariCreditorBalance('customer', listBalance)).toBe(false);
    expect(isCariCreditorBalance('customer', headerBalance)).toBe(false);

    const ekstre = buildEkstreRows(
      [
        {
          date: '2026-10-25',
          fiche_no: 'KL-MVN664D-LN9517',
          fiche_type: 'CH_TAHSILAT',
          special_code: 'REZERVASYON',
          notes: 'Rezervasyon tahsilatı · AVANS-33985dd1',
          total_amount: 5000,
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00002',
          fiche_type: 'sales_invoice',
          total_amount: 15000,
          payment_method: 'Nakit',
        },
        {
          date: '2026-10-25',
          fiche_no: 'KL-MVN2BX05-YB8TED',
          fiche_type: 'CH_TAHSILAT',
          special_code: 'REZERVASYON',
          notes: 'Rezervasyon tahsilatı · AVANS-db01faa6',
          total_amount: 5000,
        },
        {
          date: '2026-10-25',
          fiche_no: '00006',
          fiche_type: 'return_invoice',
          trcode: 3,
          total_amount: 15000,
          payment_method: 'Nakit',
        },
      ],
      'customer',
    );
    const iade = ekstre[3];
    expect(iade.borcAmount).toBe(15_000);
    expect(iade.alacakAmount).toBe(15_000);
    expect(iade.balance).toBe(0);
    const borc = ekstre.reduce((sum, row) => sum + row.borcAmount, 0);
    const alacak = ekstre.reduce((sum, row) => sum + row.alacakAmount, 0);
    expect(borc).toBe(40_000);
    expect(alacak).toBe(40_000);
    expect(borc - alacak).toBe(0);
    expect(headerBalance).toBe(borc - alacak);

    const aliLedger = computeSupplierBalanceFromLedger(
      ALI,
      'ALI RASID',
      [
        {
          customer_id: ALI,
          customer_name: 'ALI RASID',
          net_amount: 50_000,
          fiche_type: 'purchase_invoice',
          payment_method: 'Veresiye',
          is_cancelled: false,
        },
        {
          customer_id: ALI,
          customer_name: 'ALI RASID',
          net_amount: 15_000,
          fiche_type: 'return_invoice',
          payment_method: 'Nakit',
          is_cancelled: false,
        },
      ],
      [],
      50_000,
    );
    expect(aliLedger).toBe(50_000);
    const aliList = cariListBalanceForDisplay('supplier', aliLedger, 0);
    const aliHeader = ekstreHeaderBalanceForDisplay('supplier', aliLedger, 0);
    expect(aliList).toBe(50_000);
    expect(aliHeader).toBe(50_000);
    expect(isCariCreditorBalance('supplier', aliList)).toBe(true);

    const footer = sumCariListDisplayBalances([
      { cardType: 'customer', balance: ledger, reservationDeposit: deposits[ROZA] },
      { cardType: 'supplier', balance: aliLedger, reservationDeposit: 0 },
      { cardType: 'customer', balance: 8_000, reservationDeposit: 0 },
    ]);
    expect(footer).toBe(58_000);
    expect(cariListBalanceForDisplay('customer', 8_000, 0)).toBe(8_000);

    expect(CASH_LINES).toEqual(cashBefore);
    expect(CASH_LINES[0].amount).toBe(5_000);
    expect(CASH_LINES[0].transaction_type).toBe('CH_TAHSILAT');
    expect(cariCashLineLedgerContrib(5_000, 'CH_TAHSILAT', 'customer')).toBe(-5_000);
    expect(cariCashLineLedgerContrib(50_000, 'CH_TAHSILAT', 'supplier')).toBe(50_000);

    const cte = sqlCustomerAccountBalancesCte('rex_001_customers', '$1::text');
    expect(cte).toContain("WHEN fiche_type = 'return_invoice' AND");
    expect(cte).toContain('THEN 0');
    expect(cte).toContain("'nakit'");
    expect(cte).toContain('THEN -net_amount');
  });

  it('açık cari iade 15.000 tek taraflı alacak kalır', () => {
    const ledger = computeCustomerBalanceFromLedger(
      'acik',
      'acik',
      [
        {
          customer_id: 'acik',
          customer_name: 'acik',
          net_amount: 15_000,
          fiche_type: 'return_invoice',
          payment_method: 'Veresiye',
          is_cancelled: false,
        },
      ],
      [],
      0,
    );
    expect(ledger).toBe(-15_000);
    expect(cariListBalanceForDisplay('customer', ledger, 0)).toBe(-15_000);
    expect(ekstreHeaderBalanceForDisplay('customer', ledger, 0)).toBe(-15_000);
  });

  it('kart kolonu sapsa da yalnız nakit iade varken gösterim 0', () => {
    const ledger = computeCustomerBalanceFromLedger(
      ROZA,
      'roza',
      [SALES[1]],
      [],
      -25_000,
    );
    expect(ledger).toBe(0);
    expect(cariListBalanceForDisplay('customer', ledger, 0)).toBe(0);
    expect(ekstreHeaderBalanceForDisplay('customer', ledger, 0)).toBe(0);
  });
});
