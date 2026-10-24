/**
 * Aynı cari, aynı gün, iki fiş → iki satır.
 * Tutarlar ayrı kalır. 465.000 giriş, 50.000 çıkış, 415.000 net değişmez.
 * Adı olmayan satır yutulmaz.
 */
import { describe, expect, it } from 'vitest';
import {
  cashFlowFicheGroupKey,
  cashFlowMovementTotals,
  foldCashFlowByFiche,
  type CashFlowFicheMovement,
} from '../../utils/cashFlowByFiche';

const DAY = '2026-10-24';

function row(partial: Partial<CashFlowFicheMovement> & Pick<CashFlowFicheMovement, 'id' | 'ficheNo' | 'amount' | 'sign'>): CashFlowFicheMovement {
  return {
    id: partial.id,
    source: partial.source ?? 'cash',
    ficheNo: partial.ficheNo,
    date: partial.date ?? DAY,
    accountName: partial.accountName ?? '',
    transactionType: partial.transactionType ?? 'KASA_GIRIS',
    amount: partial.amount,
    sign: partial.sign,
    netAmount: partial.netAmount ?? partial.amount * (partial.sign < 0 ? -1 : 1),
  };
}

describe('foldCashFlowByFiche', () => {
  it('aynı cari ve aynı gün iki fişi ayrı satırda tutar; toplamlar korunur', () => {
    const lines = [
      row({ id: '1', ficheNo: 'BEA-2026-00010', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '2', ficheNo: 'BEA-2026-00011', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '3', ficheNo: 'BEA-2026-00002', accountName: 'ROZA', amount: 100_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '4', ficheNo: 'BEA-2026-00003', accountName: 'ROZA', amount: 15_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '5', ficheNo: 'BEA-2026-00004', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '6', ficheNo: 'BEA-2026-00005', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '7', ficheNo: 'BEA-2026-00006', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '8', ficheNo: 'BEA-2026-00007', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '9', ficheNo: 'BEA-2026-00008', accountName: 'ROZA', amount: 50_000, sign: 1, transactionType: 'KASA_GIRIS' }),
      row({ id: '10', ficheNo: 'GIDER-50', accountName: '', amount: 50_000, sign: -1, transactionType: 'GIDER_PUSULASI' }),
    ];

    const folded = foldCashFlowByFiche(lines);
    const roza = folded.filter((line) => line.accountName === 'ROZA' && line.date === DAY);
    expect(roza).toHaveLength(9);
    const pair = folded.filter((line) => line.ficheNo === 'BEA-2026-00010' || line.ficheNo === 'BEA-2026-00011');
    expect(pair).toHaveLength(2);
    expect(pair.map((line) => line.amount).sort((a, b) => a - b)).toEqual([50_000, 50_000]);
    expect(pair.every((line) => line.accountName === 'ROZA')).toBe(true);

    const dayCustomerKey = `${DAY}|ROZA`;
    const collapsed = new Set(lines.filter((line) => line.sign > 0).map(() => dayCustomerKey));
    expect(collapsed.size).toBe(1);
    expect(new Set(pair.map((line) => cashFlowFicheGroupKey(line))).size).toBe(2);

    const unnamed = folded.find((line) => line.ficheNo === 'GIDER-50');
    expect(unnamed).toBeTruthy();
    expect(unnamed?.accountName).toBe('');
    expect(unnamed?.amount).toBe(50_000);

    expect(cashFlowMovementTotals(lines)).toEqual({ inflow: 465_000, outflow: 50_000, net: 415_000 });
    expect(cashFlowMovementTotals(folded)).toEqual({ inflow: 465_000, outflow: 50_000, net: 415_000 });
  });

  it('fiş no boşsa aynı cari ve aynı gün satırları birbirini yutmaz', () => {
    const folded = foldCashFlowByFiche([
      row({ id: 'a', ficheNo: '', accountName: 'ROZA', amount: 20_000, sign: 1 }),
      row({ id: 'b', ficheNo: '', accountName: 'ROZA', amount: 30_000, sign: 1 }),
    ]);
    expect(folded).toHaveLength(2);
    expect(cashFlowMovementTotals(folded).inflow).toBe(50_000);
  });

  it('aynı fişin girişini toplar, çıkışı ayrı bırakır, kopya satırı ikinci kez yazmaz', () => {
    const lines = [
      row({ id: 'p1', ficheNo: 'BEA-2026-00020', accountName: 'ROZA', amount: 40_000, sign: 1 }),
      row({ id: 'p2', ficheNo: 'BEA-2026-00020', accountName: 'ROZA', amount: 10_000, sign: 1 }),
      row({ id: 'p1', ficheNo: 'BEA-2026-00020', accountName: 'ROZA', amount: 40_000, sign: 1 }),
      row({ id: 'out', ficheNo: 'BEA-2026-00020', accountName: 'ROZA', amount: 5_000, sign: -1, transactionType: 'KASA_CIKIS' }),
    ];
    const folded = foldCashFlowByFiche(lines);
    expect(folded).toHaveLength(2);
    const inflow = folded.find((line) => line.sign > 0);
    const outflow = folded.find((line) => line.sign < 0);
    expect(inflow?.amount).toBe(50_000);
    expect(outflow?.amount).toBe(5_000);
    expect(cashFlowMovementTotals(folded)).toEqual({ inflow: 50_000, outflow: 5_000, net: 45_000 });
  });
});
