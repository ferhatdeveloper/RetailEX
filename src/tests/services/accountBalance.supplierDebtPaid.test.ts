/**
 * Tedarikçi Brüt Borç / Ödenen kolonları için yardımcı fonksiyon testleri.
 *
 * Kök neden: SQL CTE `debt_sum` / `paid_sum` üretiyor; dış SELECT'te
 * alias eksikti → frontend `debt_total` / `paid_total` undefined alıyordu.
 * Bu testler PostgREST yolunda kullanılan JS helper'larını doğrular.
 */

import { describe, expect, it } from 'vitest';
import {
  computeSupplierDebtTotalFromSales,
  computeSupplierPaidAmountFromCashLines,
  sqlSupplierAccountBalancesCte,
  type LedgerSaleRow,
  type LedgerCashRow,
} from '../../services/api/accountBalance';

describe('accountBalance.supplierDebtPaid', () => {
  describe('sqlSupplierAccountBalancesCte', () => {
    it('produces CTE with debt_sum and paid_sum aggregates', () => {
      const sql = sqlSupplierAccountBalancesCte('rex_001_suppliers');
      // CTE alias doğru
      expect(sql).toMatch(/supplier_balances\s+AS/i);
      // debt_sum ve paid_sum agregat kolonları içeriyor
      expect(sql).toMatch(/SUM\(\s*debt_contrib\s*\)\s+AS\s+debt_sum/);
      expect(sql).toMatch(/SUM\(\s*paid_contrib\s*\)\s+AS\s+paid_sum/);
    });
  });

  describe('computeSupplierDebtTotalFromSales', () => {
    const sales: LedgerSaleRow[] = [
      {
        customer_id: 's1',
        customer_name: 'Tedarikçi A',
        net_amount: 1000000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'credit',
      },
      {
        customer_id: 's1',
        customer_name: 'Tedarikçi A',
        net_amount: 200000,
        fiche_type: 'return_invoice',
        is_cancelled: false,
        payment_method: 'credit',
      },
      {
        customer_id: 's1',
        customer_name: 'Tedarikçi A',
        net_amount: 500000,
        fiche_type: 'opening_balance',
        is_cancelled: false,
      },
      // peşin alış → borca katmaz
      {
        customer_id: 's1',
        customer_name: 'Tedarikçi A',
        net_amount: 800000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'cash',
      },
      // iptal → dışlanır
      {
        customer_id: 's1',
        customer_name: 'Tedarikçi A',
        net_amount: 999999,
        fiche_type: 'purchase_invoice',
        is_cancelled: true,
        payment_method: 'credit',
      },
    ];

    it('sums purchase_invoice + return_invoice + opening_balance as absolute gross debt', () => {
      const sum = computeSupplierDebtTotalFromSales('s1', 'Tedarikçi A', sales);
      // 1.000.000 + 200.000 (iade ABS) + 500.000 = 1.700.000
      expect(sum).toBe(1700000);
    });

    it('matches by name when id missing (pasif/legacy card)', () => {
      const rows: LedgerSaleRow[] = [
        { customer_id: null, customer_name: 'Tedarikçi B', net_amount: 750000, fiche_type: 'purchase_invoice', payment_method: 'credit' },
      ];
      const sum = computeSupplierDebtTotalFromSales('s99', 'Tedarikçi B', rows);
      expect(sum).toBe(750000);
    });
  });

  describe('computeSupplierPaidAmountFromCashLines', () => {
    const cash: LedgerCashRow[] = [
      { customer_id: 's1', amount: 500000, transaction_type: 'CH_TAHSILAT' }, // biz ödedik → +
      { customer_id: 's1', amount: 200000, transaction_type: 'CH_ODEME' }, // tedarikçiden para çıkışı → 0
      { customer_id: 's2', amount: 999, transaction_type: 'CH_TAHSILAT' }, // başka cari → 0
      { customer_id: 's1', amount: 300000, transaction_type: 'VIRMAN' }, // filtre dışı → 0
      // party_id ile yazılan tedarikçi ödemesi (geriye uyumluluk)
      { customer_id: null, party_id: 's1', amount: 150000, transaction_type: 'CH_TAHSILAT' },
    ];

    it('returns absolute sum of CH_TAHSILAT only for matching id', () => {
      const paid = computeSupplierPaidAmountFromCashLines('s1', cash);
      expect(paid).toBe(650000); // 500000 + 150000
    });
  });
});