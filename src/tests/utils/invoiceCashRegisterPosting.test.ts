/**
 * Nakit fatura seçilen kasaya yazılır.
 * Satış iadesi kasadan bir kez çıkar. Alış iadesi kasaya bir kez girer.
 * Açık cari ve veresiye iade kasayı oynatmaz.
 */
import { describe, expect, it } from 'vitest';
import { computeCashBalanceForRegister } from '../../utils/cashBalance';
import { cashStatusMovementRows, cashStatusThreeBoxes } from '../../utils/cashStatusTotals';
import { dailyNetSaleRevenue } from '../../utils/dailyReportKpis';
import {
  applyInvoiceToCashDrawers,
  boundReturnCashAmount,
  emptyCashDrawerState,
  planInvoiceCashPosting,
  voidInvoiceCash,
} from '../../utils/invoiceCashRegisterPosting';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';

const SECILEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DIGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function cashSale(amount = 15000) {
  return {
    category: 'Satis',
    trcode: 8,
    paymentMethod: 'Nakit',
    netAmount: amount,
    cashRegisterId: SECILEN,
    ficheNo: 'SF-1',
  };
}

describe('fatura kasa seçimi ve iade işaretleri', () => {
  it('nakit satış tahsilatı seçilen kasaya artı tutar yazar, diğer kasa değişmez', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), cashSale());
    expect(state.registers[SECILEN]).toBe(15000);
    expect(state.registers[DIGER] ?? 0).toBe(0);
    expect(state.customerBalance).toBe(0);
    expect(state.lines[0]?.sign).toBe(1);
    expect(state.lines).toHaveLength(1);
  });

  it('kart tahsilatı da seçilen kasaya yazılır', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      ...cashSale(),
      paymentMethod: 'Kredi Kartı',
      ficheNo: 'SF-KART',
    });
    expect(state.registers[SECILEN]).toBe(15000);
    expect(state.registers[DIGER] ?? 0).toBe(0);
  });

  it('açık cari hesap kasaya yazmaz, tutar müşteri borcunda kalır', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      ...cashSale(),
      paymentMethod: 'Açık Cari Hesap',
      ficheNo: 'SF-ACIK',
    });
    expect(state.lines).toHaveLength(0);
    expect(state.registers[SECILEN] ?? 0).toBe(0);
    expect(state.customerBalance).toBe(15000);
  });

  it('satış iadesi seçilen kasadan fatura netini düşer, ciro ve net düşer, müşteri alacağı oluşmaz', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      discount: 1000,
      cashRegisterId: SECILEN,
      ficheNo: 'SI-1',
    });
    expect(state.registers[SECILEN]).toBe(-15000);
    expect(state.registers[DIGER] ?? 0).toBe(0);
    expect(state.revenue).toBe(-15000);
    expect(state.netCash).toBe(-15000);
    expect(state.customerBalance).toBe(0);
    expect(state.lines[0]?.sign).toBe(-1);
    expect(state.lines[0]?.transactionType).toBe('SATIS_IADE_FATURASI');
  });

  it('indirim ve peşinat iade tutarına ikinci kez eklenmez', () => {
    const plan = planInvoiceCashPosting({
      category: 'Iade',
      trcode: 3,
      netAmount: 15000,
      discount: 2000,
      payments: [
        { method: 'Peşinat', amount: 2000, cashRegisterId: SECILEN },
        { method: 'Nakit', amount: 20000, cashRegisterId: SECILEN },
      ],
      cashRegisterId: SECILEN,
    });
    expect(plan.cashAmount).toBe(15000);
    expect(plan.refundableCash).toBe(15000);
  });

  it('kısmi ödemede iade tutarı nakit payını aşmaz', () => {
    const bound = boundReturnCashAmount({
      category: 'Iade',
      trcode: 3,
      netAmount: 15000,
      payments: [
        { method: 'Nakit', amount: 10000, cashRegisterId: SECILEN },
        { method: 'Açık Cari Hesap', amount: 5000 },
      ],
    });
    expect(bound.amount).toBe(10000);
    expect(bound.sign).toBe(-1);
    expect(bound.blocked).toBe('none');
  });

  it('alış iadesi seçilen kasaya fatura neti girer, ciro artmaz', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 6,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'AI-1',
    });
    expect(state.registers[SECILEN]).toBe(15000);
    expect(state.registers[DIGER] ?? 0).toBe(0);
    expect(state.revenue).toBe(0);
    expect(state.netCash).toBe(15000);
    expect(state.supplierBalance).toBe(0);
    expect(state.lines[0]?.sign).toBe(1);
    expect(state.lines[0]?.transactionType).toBe('ALIS_IADE_FATURASI');
  });

  it('veresiye satış iadesinde kasa hareketi olmaz, cari borç düşer', () => {
    const sold = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'Açık Cari Hesap',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'SF-VER',
    });
    const returned = applyInvoiceToCashDrawers(sold, {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Açık Cari Hesap',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'SI-VER',
    });
    expect(returned.lines).toHaveLength(0);
    expect(returned.registers[SECILEN] ?? 0).toBe(0);
    expect(returned.customerBalance).toBe(0);
    expect(returned.netCash).toBe(0);
  });

  it('veresiye alış iadesinde kasa girişi olmaz, tedarikçi borcu düşer', () => {
    const bought = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Alis',
      trcode: 4,
      paymentMethod: 'Veresiye',
      netAmount: 15000,
      ficheNo: 'AF-VER',
    });
    const returned = applyInvoiceToCashDrawers(bought, {
      category: 'Iade',
      trcode: 6,
      paymentMethod: 'Veresiye',
      netAmount: 15000,
      ficheNo: 'AI-VER',
    });
    expect(returned.lines).toHaveLength(0);
    expect(returned.supplierBalance).toBe(0);
    expect(returned.revenue).toBe(0);
  });

  it('aynı iade ikinci kez kasa yazmaz; silinen iade kasa satırını kaldırır', () => {
    const once = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'SI-1',
    });
    const twice = applyInvoiceToCashDrawers(once, {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'SI-1',
    });
    expect(twice.registers[SECILEN]).toBe(-15000);
    expect(twice.lines).toHaveLength(1);
    expect(twice.revenue).toBe(-15000);
    const removed = voidInvoiceCash(twice, {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      ficheNo: 'SI-1',
    });
    expect(removed.lines).toHaveLength(0);
    expect(removed.registers[SECILEN]).toBe(0);
    expect(removed.revenue).toBe(0);
    expect(removed.netCash).toBe(0);
  });

  it('daha önce yazılan tutar kalan iadeyi kapatır', () => {
    const bound = boundReturnCashAmount({
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: SECILEN,
      alreadyPosted: 15000,
    });
    expect(bound.blocked).toBe('already');
    expect(bound.amount).toBe(0);
  });

  it('kasa bakiyesi hareket işaretinin toplamıdır', () => {
    const lines = [
      { kasa_id: SECILEN, islem_tipi: 'KASA_GIRIS', tutar: 15000 },
      { kasa_id: SECILEN, islem_tipi: 'SATIS_IADE_FATURASI', tutar: 15000 },
      { kasa_id: SECILEN, islem_tipi: 'ALIS_IADE_FATURASI', tutar: 4000 },
      { kasa_id: DIGER, islem_tipi: 'KASA_GIRIS', tutar: 500 },
    ];
    expect(computeCashBalanceForRegister(SECILEN, lines)).toBe(4000);
    expect(computeCashBalanceForRegister(DIGER, lines)).toBe(500);
  });

  it('satış iadesi çıkan kutudadır ve gider değildir; alış iadesi girendir ve ciro değildir', () => {
    const day = '2026-10-25';
    const boxes = cashStatusThreeBoxes({
      salesCash: 20000,
      expense: 50,
      lines: [
        {
          islem_tipi: 'SATIS_IADE_FATURASI',
          tutar: 15000,
          payment_method: 'Nakit',
          islem_tarihi: day,
          islem_aciklamasi: 'Satış iade — SI-1',
        },
        {
          islem_tipi: 'KASA_CIKIS',
          tutar: 3000,
          payment_method: 'Nakit',
          islem_tarihi: day,
          islem_aciklamasi: 'Nakit iade — SI-2',
        },
        {
          islem_tipi: 'ALIS_IADE_FATURASI',
          tutar: 8000,
          payment_method: 'Nakit',
          islem_tarihi: day,
          islem_aciklamasi: 'Alış iade — AI-1',
        },
        {
          islem_tipi: 'VIRMAN',
          tutar: 9000,
          payment_method: 'Nakit',
          islem_tarihi: day,
          sign: -1,
        },
      ],
    });
    expect(boxes.totalIn).toBe(28000);
    expect(boxes.totalOut).toBe(18050);
    expect(boxes.balance).toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);

    const rows = cashStatusMovementRows({
      lines: [
        {
          islem_tipi: 'SATIS_IADE_FATURASI',
          tutar: 15000,
          payment_method: 'Nakit',
          islem_tarihi: day,
        },
        {
          islem_tipi: 'ALIS_IADE_FATURASI',
          tutar: 8000,
          payment_method: 'Nakit',
          islem_tarihi: day,
        },
      ],
    });
    expect(rows.find((row) => row.typeCode === 'SATIS_IADE_FATURASI')?.categoryCode).toBe('cashOut');
    expect(rows.find((row) => row.typeCode === 'ALIS_IADE_FATURASI')?.categoryCode).toBe('cashIn');

    const expenses = mergeExpensesWithCashOuts([], [
      {
        id: 'iade',
        islem_tipi: 'KASA_CIKIS',
        tutar: 15000,
        islem_tarihi: day,
        islem_aciklamasi: 'Satış iade — SI-1',
      },
      {
        id: 'gider',
        islem_tipi: 'KASA_CIKIS',
        tutar: 40,
        islem_tarihi: day,
        islem_aciklamasi: 'Kira',
      },
    ]);
    expect(expenses.map((row) => row.amount)).toEqual([40]);

    expect(dailyNetSaleRevenue([
      { total: 20000, status: 'completed' },
      { total: 15000, status: 'return' },
    ])).toBe(5000);
  });
});
