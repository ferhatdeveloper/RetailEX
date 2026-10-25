import { describe, expect, it } from 'vitest';
import { cariCashLineLedgerContrib } from '../../services/api/accountBalance';
import {
  cariListBalanceForDisplay,
  sumCariListDisplayBalances,
} from '../../utils/cariListBalance';
import {
  cashPaymentListBalanceForDisplay,
  cashPaymentSuggestedAmount,
  sumCashPaymentBalanceOffsets,
} from '../../utils/cashPaymentListBalance';

const FERHAT_ID = 'ferhat';
const ROZA_ID = 'roza';
const ALI_ID = 'ali-rasid';

const LINES = [
  {
    customer_id: FERHAT_ID,
    amount: 10_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: 'REZERVASYON',
    definition: 'Rezervasyon tahsilatı · AVANS-48729f8f',
    fiche_no: 'AVANS-48729f8f',
  },
  {
    customer_id: ROZA_ID,
    amount: 5_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: 'REZERVASYON',
    definition: 'Rezervasyon tahsilatı · AVANS-33985dd1',
    fiche_no: 'AVANS-33985dd1',
  },
  {
    customer_id: ROZA_ID,
    amount: 20_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: '',
    definition: 'Güzellik randevu kalan ödeme — apt-roza',
    fiche_no: 'BEAUTY-REMAINDER-apt-roza',
  },
  {
    customer_id: 'baska',
    amount: 40_000,
    transaction_type: 'CH_TAHSILAT',
    special_code: '',
    definition: 'Hizmet tahsilatı',
    fiche_no: 'THS-1',
  },
];

describe('cari hesap ödeme listesi — düzeltilmiş bakiye', () => {
  it('ödeme listesi ile cari listesi aynı düzeltilmiş bakiyeyi verir', () => {
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    const rows = [
      { cardType: 'customer' as const, balance: -10_000, reservationDeposit: offsets[FERHAT_ID] },
      { cardType: 'customer' as const, balance: -25_000, reservationDeposit: offsets[ROZA_ID] },
      { cardType: 'supplier' as const, balance: 50_000, reservationDeposit: offsets[ALI_ID] ?? 0 },
    ];
    for (const row of rows) {
      expect(
        cashPaymentListBalanceForDisplay(row.cardType, row.balance, row.reservationDeposit),
      ).toBe(cariListBalanceForDisplay(row.cardType, row.balance, row.reservationDeposit));
    }
    expect(sumCariListDisplayBalances(rows)).toBe(
      rows.reduce(
        (sum, row) =>
          sum + cashPaymentListBalanceForDisplay(row.cardType, row.balance, row.reservationDeposit),
        0,
      ),
    );
  });

  it('iptal peşinatı 10.000 alacak olmaz', () => {
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    expect(offsets[FERHAT_ID]).toBe(10_000);
    const display = cashPaymentListBalanceForDisplay('customer', -10_000, offsets[FERHAT_ID]);
    expect(display).toBe(0);
    expect(display).toBe(cariListBalanceForDisplay('customer', -10_000, 10_000));
    expect(cashPaymentSuggestedAmount('customer', display)).toBe(0);
    expect(cashPaymentSuggestedAmount('customer', display)).not.toBe(10_000);
  });

  it('tamamlanan roza tahsilatı geri ödeme alacağı olmaz', () => {
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    expect(offsets[ROZA_ID]).toBe(25_000);
    const fromLedger = cashPaymentListBalanceForDisplay('customer', -25_000, offsets[ROZA_ID]);
    const fromShownCredit = cashPaymentListBalanceForDisplay('customer', -20_000, 20_000);
    expect(fromLedger).toBe(0);
    expect(fromShownCredit).toBe(0);
    expect(fromLedger).toBe(cariListBalanceForDisplay('customer', -25_000, offsets[ROZA_ID]));
    expect(cashPaymentSuggestedAmount('customer', fromLedger)).toBe(0);
    expect(cashPaymentSuggestedAmount('customer', fromShownCredit)).toBe(0);
    expect(cashPaymentSuggestedAmount('customer', fromShownCredit)).not.toBe(20_000);
  });

  it('gerçek veresiye borç durur; alacak rozeti ödeme tutarı türetmez', () => {
    const display = cashPaymentListBalanceForDisplay('customer', 15_000, 20_000);
    expect(display).toBe(15_000);
    expect(display).toBe(cariListBalanceForDisplay('customer', 15_000, 20_000));
    expect(cashPaymentSuggestedAmount('customer', display)).toBe(0);
  });

  it('peşinat dışı gerçek alacak durur', () => {
    const display = cashPaymentListBalanceForDisplay('customer', -30_000, 20_000);
    expect(display).toBe(-10_000);
    expect(cashPaymentSuggestedAmount('customer', display)).toBe(10_000);
  });

  it('tedarikçi ticari alacağı durur', () => {
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    expect(offsets[ALI_ID]).toBeUndefined();
    const display = cashPaymentListBalanceForDisplay('supplier', 50_000, 0);
    expect(display).toBe(50_000);
    expect(display).toBe(cariListBalanceForDisplay('supplier', 50_000, 0));
    expect(cashPaymentSuggestedAmount('supplier', display)).toBe(50_000);
    expect(cashPaymentListBalanceForDisplay('supplier', 80_000, 50_000)).toBe(30_000);
    expect(cashPaymentListBalanceForDisplay('supplier', -10_000, 50_000)).toBe(-10_000);
  });

  it('normal hizmet tahsilatı peşinat ofsetine karışmaz', () => {
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    expect(offsets.baska).toBeUndefined();
    expect(cashPaymentListBalanceForDisplay('customer', -40_000, offsets.baska ?? 0)).toBe(-40_000);
  });

  it('kasa satırı değişmez', () => {
    const before = LINES.map((row) => ({ ...row }));
    const offsets = sumCashPaymentBalanceOffsets(LINES);
    expect(LINES).toEqual(before);
    expect(cariCashLineLedgerContrib(10_000, 'CH_TAHSILAT', 'customer')).toBe(-10_000);
    expect(cariCashLineLedgerContrib(20_000, 'CH_TAHSILAT', 'customer')).toBe(-20_000);
    expect(cariCashLineLedgerContrib(50_000, 'CH_TAHSILAT', 'supplier')).toBe(50_000);
    expect(cashPaymentListBalanceForDisplay('customer', -10_000, offsets[FERHAT_ID])).toBe(0);
    expect(LINES[0].amount).toBe(10_000);
    expect(LINES[0].transaction_type).toBe('CH_TAHSILAT');
    expect(LINES[2].amount).toBe(20_000);
    expect(LINES[2].special_code).toBe('');
  });
});
