import { describe, it, expect, beforeEach } from 'vitest';
import { mergeExpensesWithCashOuts, expenseEnteredBy } from './reportUnifiedExpenses';
import { resolveCashLineActorWrite } from './cashLineActor';
import { useAuthStore } from '../store/useAuthStore';
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

describe('expenseEnteredBy', () => {
  it('created_by boşsa son düzenleyen kimliği kullanılır', () => {
    expect(expenseEnteredBy({ created_by: '', last_edited_by: 'user-1', entered_by_name: '' })).toEqual({
      id: 'user-1',
      name: '',
    });
  });

  it('üçü de boşsa kimlik ve ad boş kalır', () => {
    expect(expenseEnteredBy({ created_by: '—', last_edited_by: '', approved_by: '-' })).toEqual({
      id: '',
      name: '',
    });
  });

  it('Kasa giriş açıklaması kasiyer adı sayılmaz', () => {
    expect(expenseEnteredBy({ created_by: '', entered_by_name: 'Kasa giriş', last_edited_by: '' })).toEqual({
      id: '',
      name: '',
    });
  });
});

function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => { mem.set(key, String(value)); },
    removeItem: (key: string) => { mem.delete(key); },
    clear: () => { mem.clear(); },
    key: (index: number) => Array.from(mem.keys())[index] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

describe('resolveCashLineActorWrite', () => {
  beforeEach(() => {
    installMemoryStorage();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('yazılı adı ve kimliği korur; kullanıcı adı kimlik olmaz', () => {
    const actor = resolveCashLineActorWrite({
      cashier: 'Ayşe',
      createdByUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(actor.cashier).toBe('Ayşe');
    expect(actor.createdByUserId).toBe('11111111-1111-4111-8111-111111111111');

    const namedOnly = resolveCashLineActorWrite({ cashier: 'admin', createdByUserId: 'admin' });
    expect(namedOnly.cashier).toBe('admin');
    expect(namedOnly.createdByUserId).toBe('');
  });

  it('bellek oturumu boşsa satış oturumundaki kullanıcı adı yazılır', () => {
    localStorage.setItem('exretail_session', JSON.stringify({
      token: 'local-session-auth',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'admin',
        full_name: 'Yönetici',
      },
    }));
    const fromSession = resolveCashLineActorWrite({ cashier: 'Kasa giriş' });
    expect(fromSession.cashier).toBe('admin');
    expect(fromSession.cashier).not.toBe('Kasa giriş');
    expect(fromSession.createdByUserId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('oturum da boşsa satış fişindeki kasiyer önbelleği yazılır; ikisi de yoksa ad boş kalır', () => {
    localStorage.setItem('retailex_pos_cashier_001_no_user', 'admin');
    expect(resolveCashLineActorWrite().cashier).toBe('admin');

    localStorage.clear();
    const empty = resolveCashLineActorWrite({ cashier: 'Kasa giriş', createdByUserId: 'Kasa giriş' });
    expect(empty.cashier).toBe('');
    expect(empty.createdByUserId).toBe('');
  });
});
