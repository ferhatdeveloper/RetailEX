import { describe, expect, it } from 'vitest';
import {
  cariCashLineLedgerContrib,
  cariCashStoredBalanceDelta,
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
} from './accountBalance';

describe('cariCashLineLedgerContrib', () => {
  it('CH_TAHSILAT borcu azaltır (negatif katkı)', () => {
    expect(cariCashLineLedgerContrib(500, 'CH_TAHSILAT')).toBe(-500);
    expect(cariCashStoredBalanceDelta(500, 'CH_TAHSILAT')).toBe(-500);
  });

  it('CH_ODEME borcu azaltır', () => {
    expect(cariCashLineLedgerContrib(300, 'CH_ODEME')).toBe(-300);
  });

  it('negatif amount mutlak değerle işlenir', () => {
    expect(cariCashLineLedgerContrib(-200, 'CH_TAHSILAT')).toBe(-200);
  });
});

describe('compute balance from ledger with cash', () => {
  const sales = [{ customer_id: 'c1', net_amount: 1000, fiche_type: 'sales_invoice', is_cancelled: false }];
  const tahsilat = [{ customer_id: 'c1', amount: 200, transaction_type: 'CH_TAHSILAT' }];

  it('müşteri: tahsilat sonrası bakiye düşer', () => {
    const bal = computeCustomerBalanceFromLedger('c1', 'Test Müşteri', sales, tahsilat);
    expect(bal).toBe(800);
  });

  it('tedarikçi: tahsilat sonrası bakiye düşer (artmaz)', () => {
    const purchase = [{ customer_id: 's1', net_amount: 1000, fiche_type: 'purchase_invoice', is_cancelled: false }];
    const supplierTahsilat = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_TAHSILAT' }];
    const bal = computeSupplierBalanceFromLedger('s1', 'Test Tedarikçi', purchase, supplierTahsilat);
    expect(bal).toBe(800);
  });
});
