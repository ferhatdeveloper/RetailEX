import { describe, expect, it } from 'vitest';
import {
  aggregateCustomerAppointmentSales,
  resolveCustomerServiceAmount,
} from '../../utils/customerSalesDeposit';
import { reservationCashByCashier } from '../../utils/reservationVeresiyeOffset';

describe('müşteri satış depozito dağıtımı', () => {
  it('brüt hizmetin içindeki rezervasyonu ciroya ikinci kez eklemez', () => {
    const priced = resolveCustomerServiceAmount(50000, 15000, 35000);
    expect(priced.service).toBe(50000);
    expect(priced.depositInfo).toBe(15000);
  });

  it('fiyat kalan tutarsa depozitoyu bir kez ekler', () => {
    const priced = resolveCustomerServiceAmount(35000, 15000, 35000);
    expect(priced.service).toBe(50000);
    expect(priced.depositInfo).toBe(15000);
  });

  it('kapanan randevuda avans bilgi kolonunda kalır, ciro 50.000 olur', () => {
    const rows = aggregateCustomerAppointmentSales([
      {
        id: 'apt-1',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        createdAt: '2026-10-19T09:00:00.000Z',
        totalPrice: 50000,
        depositAmount: 0,
        remainderPaid: 35000,
        linkedAvans: 15000,
        status: 'completed',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].serviceRevenue).toBe(50000);
    expect(rows[0].depositRevenue).toBe(15000);
    expect(rows[0].totalRevenue).toBe(50000);
    expect(rows[0].collectedAmount).toBe(50000);
    expect(rows[0].salesCount).toBe(1);
  });

  it('aynı depozito iki hizmete kopyalandıysa bir kez bölünür', () => {
    const created = '2026-10-19T09:00:00.000Z';
    const rows = aggregateCustomerAppointmentSales([
      {
        id: 'a',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        createdAt: created,
        totalPrice: 20000,
        depositAmount: 5000,
        remainderPaid: 17000,
        status: 'completed',
      },
      {
        id: 'b',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        createdAt: created,
        totalPrice: 15000,
        depositAmount: 5000,
        remainderPaid: 13000,
        status: 'completed',
      },
    ]);
    expect(rows[0].depositRevenue).toBe(5000);
    expect(rows[0].serviceRevenue).toBe(35000);
    expect(rows[0].totalRevenue).toBe(35000);
    expect(rows[0].salesCount).toBe(2);
  });
});

describe('kasiyer rezervasyon nakdi', () => {
  it('tek kasiyerde 15.000 rezervasyon nakde eklenir, ciroya değil', () => {
    const shares = reservationCashByCashier({
      cashierNames: ['admin'],
      avans: [{ amount: 15000, method: 'cash', appliedSaleId: 's1', status: 'applied' }],
      saleCashierById: new Map([['s1', 'admin']]),
      appliedCashBySaleId: new Map(),
      topUp: { cash: 15000, card: 0 },
    });
    expect(shares.get('admin')).toEqual({ cash: 15000, card: 0 });
  });

  it('satış kırılımına işlenmiş avansı ikinci kez yazmaz', () => {
    const shares = reservationCashByCashier({
      cashierNames: ['admin'],
      avans: [{ amount: 15000, method: 'cash', appliedSaleId: 's1', status: 'applied' }],
      saleCashierById: new Map([['s1', 'admin']]),
      appliedCashBySaleId: new Map([['s1', 15000]]),
      topUp: { cash: 0, card: 0 },
    });
    expect(shares.get('admin')).toBeUndefined();
  });
});
