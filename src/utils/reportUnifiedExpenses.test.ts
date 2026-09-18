import { describe, it, expect } from 'vitest';
import { mergeExpensesWithCashOuts } from './reportUnifiedExpenses';
import type { Expense } from '../services/api/expenses';
import type { KasaIslemi } from '../services/api/kasa';

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'amount'>): Expense {
  return {
    category: 'rent',
    description: 'EYLUL KIRASI',
    payment_method: 'cash',
    store_id: '',
    expense_date: '2026-09-18',
    created_by: '',
    firm_nr: '001',
    ...partial,
  };
}

function cashLine(partial: Partial<KasaIslemi> & Pick<KasaIslemi, 'id' | 'tutar'>): KasaIslemi {
  return {
    firma_id: '001',
    kasa_id: 'reg-1',
    islem_tarihi: '2026-09-18',
    islem_tipi: 'GIDER_PUSULASI',
    islem_aciklamasi: 'EYLUL KIRASI',
    islem_no: `KL-001-${partial.id}`,
    ...partial,
  } as KasaIslemi;
}

describe('mergeExpensesWithCashOuts — kasa kardeş fiş', () => {
  it('aynı gün EYLUL KIRASI kasa satırını gider pusulasıyla çift saymaz (450k + 45k ≠ 495k)', () => {
    const unified = mergeExpensesWithCashOuts(
      [expense({ id: 'exp-1', amount: 450000, cash_line_id: 'line-orig' })],
      [
        cashLine({ id: 'line-orig', tutar: 450000 }),
        cashLine({ id: 'kl-sibling', tutar: 45000, islem_no: 'KL-001-1789739275914' }),
      ],
    );
    expect(unified).toHaveLength(1);
    expect(unified[0].amount).toBe(450000);
    expect(unified[0].id).toBe('exp-1');
  });

  it('bağlı cash_line_id satırını tekrar eklemez', () => {
    const unified = mergeExpensesWithCashOuts(
      [expense({ id: 'exp-1', amount: 45000, cash_line_id: 'line-orig' })],
      [cashLine({ id: 'line-orig', tutar: 45000 })],
    );
    expect(unified).toHaveLength(1);
    expect(unified[0].amount).toBe(45000);
  });

  it('aynı açıklamalı KASA_CIKIS kardeşini de atlar (450k gider + 45k çıkış ≠ 495k)', () => {
    const unified = mergeExpensesWithCashOuts(
      [expense({ id: 'exp-1', amount: 450000, cash_line_id: 'line-orig' })],
      [cashLine({ id: 'kl-sibling', tutar: 45000, islem_tipi: 'KASA_CIKIS' })],
    );
    expect(unified).toHaveLength(1);
    expect(unified[0].amount).toBe(450000);
  });

  it('maaş/cari kasa çıkışını gider pusulasıyla karıştırmaz', () => {
    const unified = mergeExpensesWithCashOuts(
      [expense({ id: 'exp-1', amount: 45000, description: 'Kira' })],
      [cashLine({ id: 'pay-1', tutar: 20000, islem_tipi: 'CH_ODEME', islem_aciklamasi: 'Tedarikçi' })],
    );
    expect(unified).toHaveLength(2);
  });
});
