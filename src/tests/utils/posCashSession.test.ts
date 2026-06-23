import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import {
  buildSessionCashBreakdown,
  createPosCashSession,
  filterSalesForCashSession,
} from '../../utils/posCashSession';

const mkSale = (date: string, total: number, cashier = 'Ali'): Sale =>
  ({
    id: `s-${date}-${total}`,
    date,
    total,
    cashier,
    paymentMethod: 'cash',
    status: 'completed',
    items: [],
  }) as Sale;

describe('posCashSession', () => {
  it('filters sales after session open only', () => {
    const session = createPosCashSession({
      staff: 'Ayşe',
      openingCash: 50000,
      handoverFrom: 'Ali',
      handoverAmount: 50000,
    });
    session.openedAt = '2026-06-16T14:00:00.000Z';

    const sales = [
      mkSale('2026-06-16T10:00:00.000Z', 10000, 'Ali'),
      mkSale('2026-06-16T15:00:00.000Z', 20000, 'Ayşe'),
      mkSale('2026-06-16T16:00:00.000Z', -5000, 'Ayşe'),
    ];

    const filtered = filterSalesForCashSession(sales, session);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((s) => new Date(s.date) >= new Date(session.openedAt))).toBe(true);
  });

  it('builds expected cash from opening + session cash - returns', () => {
    const breakdown = buildSessionCashBreakdown(50000, 30000, 5000, 'Ali', 50000);
    expect(breakdown.expectedCash).toBe(75000);
    expect(breakdown.handoverFrom).toBe('Ali');
  });
});
