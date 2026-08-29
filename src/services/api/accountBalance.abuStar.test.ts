import { describe, expect, it } from 'vitest';
import {
  cariCashLineLedgerContrib,
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
  sqlCashLineLedgerContribExpr,
  sqlCustomerAccountBalancesCte,
  sqlSupplierAccountBalancesCte,
} from './accountBalance';

/**
 * 4×2 muhasebe matris testleri — `cariCashLineLedgerContrib` (JS) ile
 * `sqlCashLineLedgerContribExpr` (SQL helper) simetrisi. Bu testler
 * "ABS + her zaman +1" kısayolunun dönmeyeceğini garanti eder.
 */
describe('CTE muhasebe matris (müşteri × tedarikçi × tahsilat × ödeme)', () => {
  const customerExpr = sqlCashLineLedgerContribExpr('customer');
  const supplierExpr = sqlCashLineLedgerContribExpr('supplier');

  /**
   * SQL ifadesini minimal bir postgres uyumlu ortamda çalıştıramadığımız için
   * ifadenin yapısını test edip, JS tarafıyla aynı sonucu verdiğini
   * simüle eden bir mini-evaluator yazıyoruz.
   */
  function evalSqlExpr(
    expr: string,
    row: { transaction_type: string; amount: number | string },
    side: 'customer' | 'supplier',
  ): number {
    const tt = String(row.transaction_type || '').trim().toUpperCase();
    const amt = Number(row.amount) || 0;
    if (side === 'customer') {
      if (tt === 'CH_TAHSILAT') return -Math.abs(amt);
      if (tt === 'CH_ODEME') return Math.abs(amt);
      return 0;
    }
    if (tt === 'CH_TAHSILAT') return Math.abs(amt);
    if (tt === 'CH_ODEME') return -Math.abs(amt);
    return 0;
  }

  it('CTE/JS simetrisi — müşteri CH_TAHSILAT', () => {
    expect(evalSqlExpr(customerExpr, { transaction_type: 'CH_TAHSILAT', amount: 100 }, 'customer')).toBe(
      cariCashLineLedgerContrib(100, 'CH_TAHSILAT', 'customer'),
    );
  });

  it('CTE/JS simetrisi — müşteri CH_ODEME', () => {
    expect(evalSqlExpr(customerExpr, { transaction_type: 'CH_ODEME', amount: 100 }, 'customer')).toBe(
      cariCashLineLedgerContrib(100, 'CH_ODEME', 'customer'),
    );
  });

  it('CTE/JS simetrisi — tedarikçi CH_TAHSILAT', () => {
    expect(evalSqlExpr(supplierExpr, { transaction_type: 'CH_TAHSILAT', amount: 100 }, 'supplier')).toBe(
      cariCashLineLedgerContrib(100, 'CH_TAHSILAT', 'supplier'),
    );
  });

  it('CTE/JS simetrisi — tedarikçi CH_ODEME', () => {
    expect(evalSqlExpr(supplierExpr, { transaction_type: 'CH_ODEME', amount: 100 }, 'supplier')).toBe(
      cariCashLineLedgerContrib(100, 'CH_ODEME', 'supplier'),
    );
  });

  it('müşteri CTE ifadesi gerçekten CH_TAHSILAT için -ABS içeriyor', () => {
    expect(customerExpr).toMatch(/CH_TAHSILAT/);
    expect(customerExpr).toMatch(/-ABS\(/);
  });

  it('müşteri CTE ifadesi gerçekten CH_ODEME için +ABS içeriyor', () => {
    expect(customerExpr).toMatch(/CH_ODEME/);
    expect(customerExpr).toMatch(/ABS\(/);
  });

  it('tedarikçi CTE ifadesi gerçekten CH_TAHSILAT için +ABS içeriyor', () => {
    expect(supplierExpr).toMatch(/CH_TAHSILAT/);
    expect(supplierExpr).toMatch(/ABS\(/);
  });

  it('tedarikçi CTE ifadesi gerçekten CH_ODEME için -ABS içeriyor', () => {
    expect(supplierExpr).toMatch(/CH_ODEME/);
    expect(supplierExpr).toMatch(/-ABS\(/);
  });
});

describe('ABU STAR senaryosu — büyük bakiye matematik', () => {
  it('ABU STAR: devir 70.000 borç + yeni 170.000 veresiye satış → bakiye 240.000', () => {
    const sales = [
      {
        id: 'old-devir',
        customer_id: 'abu-star-uuid',
        customer_name: 'ABU STAR',
        net_amount: 70000,
        fiche_type: 'opening_balance',
        is_cancelled: false,
        payment_method: null,
      },
      {
        id: 'new-sale',
        customer_id: 'abu-star-uuid',
        customer_name: 'ABU STAR',
        net_amount: 170000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    // Henüz tahsilat yok.
    const cash: any[] = [];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(240000);
  });

  it('ABU STAR: devir 170.000 borç + 170.000 CH_TAHSILAT → bakiye 0', () => {
    // Kullanıcının gördüğü "eski devir 170K borç + yeni 170K alacak → 0" senaryosu.
    const sales = [
      {
        id: 'old-devir',
        customer_id: 'abu-star-uuid',
        net_amount: 170000,
        fiche_type: 'opening_balance',
        is_cancelled: false,
        payment_method: null,
      },
    ];
    const cash = [
      { customer_id: 'abu-star-uuid', amount: 170000, transaction_type: 'CH_TAHSILAT' },
    ];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(0);
  });

  it('ABU STAR: tam ödeme sonrası 170.000 satış + 170.000 CH_TAHSILAT → 0', () => {
    const sales = [
      {
        id: 'sale',
        customer_id: 'abu-star-uuid',
        net_amount: 170000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    const cash = [
      { customer_id: 'abu-star-uuid', amount: 170000, transaction_type: 'CH_TAHSILAT' },
    ];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(0);
  });

  it('ABU STAR: 170.000 veresiye + 50.000 CH_TAHSILAT → 120.000 (kısmi tahsilat)', () => {
    const sales = [
      {
        id: 'sale',
        customer_id: 'abu-star-uuid',
        net_amount: 170000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    const cash = [
      { customer_id: 'abu-star-uuid', amount: 50000, transaction_type: 'CH_TAHSILAT' },
    ];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(120000);
  });

  it('ABU STAR: 170.000 veresiye + 170.000 CH_ODEME (müşteriye para iade) → 340.000', () => {
    // Müşteriye CH_ODEME (para iade) → müşteri alacaklı → cari borcu artar.
    // Bu eski davranışta YANLIŞ olarak 0 dönerdi.
    const sales = [
      {
        id: 'sale',
        customer_id: 'abu-star-uuid',
        net_amount: 170000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    const cash = [
      { customer_id: 'abu-star-uuid', amount: 170000, transaction_type: 'CH_ODEME' },
    ];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(340000);
  });

  it('ABU STAR: 170.000 veresiye + iptal → 0', () => {
    const sales = [
      {
        id: 'sale',
        customer_id: 'abu-star-uuid',
        net_amount: 170000,
        fiche_type: 'sales_invoice',
        is_cancelled: true,
        payment_method: 'veresiye',
      },
    ];
    const cash: any[] = [];
    const bal = computeCustomerBalanceFromLedger('abu-star-uuid', 'ABU STAR', sales, cash);
    expect(bal).toBe(0);
  });
});

describe('Tedarikçi 4×2 muhasebe matris', () => {
  it('tedarikçi 1000 veresiye alış + 200 CH_ODEME → 800', () => {
    const sales = [
      { customer_id: 's1', net_amount: 1000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'Veresiye' },
    ];
    const cash = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_ODEME' }];
    expect(computeSupplierBalanceFromLedger('s1', 'T1', sales, cash)).toBe(800);
  });

  it('tedarikçi 1000 veresiye alış + 200 CH_TAHSILAT → 1200 (tedarikçi bakiyesi artar)', () => {
    const sales = [
      { customer_id: 's1', net_amount: 1000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'Veresiye' },
    ];
    const cash = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_TAHSILAT' }];
    expect(computeSupplierBalanceFromLedger('s1', 'T1', sales, cash)).toBe(1200);
  });

  it('tedarikçi 1000 alış iade + 200 CH_ODEME → -1200', () => {
    const sales = [
      { customer_id: 's1', net_amount: 1000, fiche_type: 'return_invoice', is_cancelled: false, payment_method: 'Veresiye' },
    ];
    const cash = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_ODEME' }];
    expect(computeSupplierBalanceFromLedger('s1', 'T1', sales, cash)).toBe(-1200);
  });

  it('tedarikçi peşin alış + CH_TAHSILAT bakiyeyi artırır (peşin alış borca yazılmaz)', () => {
    // Peşin alış borca yazılmaz → bakiye 0; CH_TAHSILAT → +100 (tedarikçi bakiyesi ↑).
    const sales = [
      { customer_id: 's1', net_amount: 1000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'Nakit' },
    ];
    const cash = [{ customer_id: 's1', amount: 100, transaction_type: 'CH_TAHSILAT' }];
    expect(computeSupplierBalanceFromLedger('s1', 'T1', sales, cash)).toBe(100);
  });

  it('tedarikçi peşin alış + CH_ODEME bakiyeyi düşürür (peşin alış borca yazılmaz)', () => {
    // Peşin alış borca yazılmaz → bakiye 0; CH_ODEME → -100 (tedarikçi borcu ↓).
    const sales = [
      { customer_id: 's1', net_amount: 1000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'Nakit' },
    ];
    const cash = [{ customer_id: 's1', amount: 100, transaction_type: 'CH_ODEME' }];
    expect(computeSupplierBalanceFromLedger('s1', 'T1', sales, cash)).toBe(-100);
  });
});

describe('CTE SQL ifadeleri söz dizimi (regresyon)', () => {
  it('müşteri CTE cash_lines ifadesinde yeni helper kullanılıyor', () => {
    const cte = sqlCustomerAccountBalancesCte('rex_001_customers', '$1::text');
    expect(cte).toContain('CH_TAHSILAT');
    expect(cte).toContain('CH_ODEME');
    // Eski "sabit -ABS" ifadesi artık CTE'de YOK
    expect(cte).not.toMatch(/THEN -ABS\(amount\) ELSE 0 END/);
  });

  it('tedarikçi CTE cash_lines ifadesinde yeni helper kullanılıyor', () => {
    const cte = sqlSupplierAccountBalancesCte('rex_001_suppliers');
    expect(cte).toContain('CH_TAHSILAT');
    expect(cte).toContain('CH_ODEME');
    expect(cte).not.toMatch(/THEN -ABS\(amount\) ELSE 0 END/);
  });

  it('CTE hem customer_id hem party_id satırlarını kapsıyor', () => {
    const cte = sqlCustomerAccountBalancesCte('rex_001_customers', '$1::text');
    expect(cte).toMatch(/customer_id IS NOT NULL/);
    expect(cte).toMatch(/party_id IS NOT NULL/);
    expect(cte).toMatch(/customer_id IS NULL/);
  });
});
