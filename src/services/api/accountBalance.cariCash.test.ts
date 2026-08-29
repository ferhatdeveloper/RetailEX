import { describe, expect, it } from 'vitest';
import {
  cariCashLineLedgerContrib,
  cariCashStoredBalanceDelta,
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
} from './accountBalance';

describe('cariCashLineLedgerContrib', () => {
  it('CH_TAHSILAT borcu azaltır (negatif katkı) — müşteri varsayılan', () => {
    expect(cariCashLineLedgerContrib(500, 'CH_TAHSILAT')).toBe(-500);
    expect(cariCashStoredBalanceDelta(500, 'CH_TAHSILAT')).toBe(-500);
  });

  it('CH_ODEME müşteriye ödeme → borç artar (pozitif katkı)', () => {
    // Müşteriye para iade → müşteri alacaklı olur → müşteri borcu ↑.
    // Önceki tur varsayımı yanlıştı; cari türüne göre işaret doğru.
    expect(cariCashLineLedgerContrib(300, 'CH_ODEME', 'customer')).toBe(300);
  });

  it('tedarikçi CH_ODEME → borç azaltır (negatif katkı)', () => {
    expect(cariCashLineLedgerContrib(300, 'CH_ODEME', 'supplier')).toBe(-300);
  });

  it('tedarikçi CH_TAHSILAT → borç artar (pozitif katkı)', () => {
    // Tedarikçiden tahsilat → alacağımız artar → tedarikçi bakiyesi ↑.
    expect(cariCashLineLedgerContrib(200, 'CH_TAHSILAT', 'supplier')).toBe(200);
  });

  it('negatif amount mutlak değerle işlenir', () => {
    expect(cariCashLineLedgerContrib(-200, 'CH_TAHSILAT')).toBe(-200);
  });

  it('küçük harf / boşluklu tip yine doğru işaret uygular (varsayılan müşteri)', () => {
    expect(cariCashLineLedgerContrib(100, ' ch_tahsilat ')).toBe(-100);
    // Müşteri CH_ODEME: borç artar (+100), düşmez.
    expect(cariCashLineLedgerContrib(100, 'ch_odeme')).toBe(100);
    // Tedarikçi CH_ODEME: borç azalır (-100).
    expect(cariCashLineLedgerContrib(100, 'ch_odeme', 'supplier')).toBe(-100);
    // Tedarikçi CH_TAHSILAT: borç artar (+100).
    expect(cariCashLineLedgerContrib(100, ' ch_tahsilat ', 'supplier')).toBe(100);
  });
});

describe('compute balance from ledger with cash', () => {
  const sales = [
    {
      customer_id: 'c1',
      net_amount: 1000,
      fiche_type: 'sales_invoice',
      is_cancelled: false,
      payment_method: 'veresiye',
    },
  ];
  const tahsilat = [{ customer_id: 'c1', amount: 200, transaction_type: 'CH_TAHSILAT' }];

  it('müşteri: tahsilat sonrası bakiye düşer', () => {
    const bal = computeCustomerBalanceFromLedger('c1', 'Test Müşteri', sales, tahsilat);
    expect(bal).toBe(800);
  });

  it('müşteri: küçük harfli CH_TAHSILAT da bakiyeyi düşürür (satış gibi eklemez)', () => {
    const messy = [{ customer_id: 'c1', amount: 200, transaction_type: 'ch_tahsilat' }];
    expect(computeCustomerBalanceFromLedger('c1', 'Test', sales, messy)).toBe(800);
  });

  it('peşin nakit satış cari borca yazılmaz', () => {
    const cashSales = [
      {
        customer_id: 'c1',
        net_amount: 1000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'cash',
      },
    ];
    expect(computeCustomerBalanceFromLedger('c1', 'Test', cashSales, [])).toBe(0);
  });

  it('tedarikçi: tedarikçiye CH_ODEME (ödeme) sonrası bakiye düşer', () => {
    // Tedarikçiye ödeme yaptık → borç azalır.
    const purchase = [
      {
        customer_id: 's1',
        net_amount: 1000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'Veresiye',
      },
    ];
    const supplierOdeme = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_ODEME' }];
    const bal = computeSupplierBalanceFromLedger('s1', 'Test Tedarikçi', purchase, supplierOdeme);
    expect(bal).toBe(800);
  });

  it('tedarikçi: tedarikçiden CH_TAHSILAT sonrası bakiye artar (doğru simetri)', () => {
    // Tedarikçiden tahsilat (örn. alacaklandığımız tutar) → bizim alacağımız ↑.
    // Önceki tur varsayımı "tahsilat bakiyeyi azaltır" idi; bu tedarikçi için yanlış.
    const purchase = [
      {
        customer_id: 's1',
        net_amount: 1000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'Veresiye',
      },
    ];
    const supplierTahsilat = [{ customer_id: 's1', amount: 200, transaction_type: 'CH_TAHSILAT' }];
    const bal = computeSupplierBalanceFromLedger('s1', 'Test Tedarikçi', purchase, supplierTahsilat);
    expect(bal).toBe(1200);
  });

  it('peşin alış tedarikçi borcuna yazılmaz', () => {
    const purchase = [
      {
        customer_id: 's1',
        net_amount: 1000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'Nakit',
      },
    ];
    expect(computeSupplierBalanceFromLedger('s1', 'Test', purchase, [])).toBe(0);
  });

  it('cift kart: baska UUID ayni unvan veresiye satisi aktif musteri bakiyesine eklenir', () => {
    const salesDup = [
      {
        customer_id: 'active-id',
        customer_name: 'ALI ROMI',
        net_amount: 1635,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
      {
        customer_id: 'inactive-dup',
        customer_name: 'ALI ROMI',
        net_amount: 982.5,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
      {
        customer_id: 'active-id',
        customer_name: 'ALI ROMI',
        net_amount: 37000,
        fiche_type: 'opening_balance',
        is_cancelled: false,
        payment_method: 'devir',
      },
    ];
    const cash = [
      { customer_id: 'active-id', amount: 39540.04, transaction_type: 'CH_TAHSILAT' },
    ];
    // 1635 + 982.5 + 37000 - 39540.04 = 77.46
    expect(computeCustomerBalanceFromLedger('active-id', 'ALI ROMI', salesDup, cash)).toBeCloseTo(77.46, 2);
  });
});
