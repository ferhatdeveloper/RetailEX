import { describe, expect, it } from 'vitest';
import {
  aggregateCustomerAppointmentSales,
  aggregateCustomerSaleReceipts,
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

  it('35.000 hizmete 15.000 depozito dağıtılır, 50.000 brüt ikinci kez eklenmez', () => {
    const distributed = aggregateCustomerSaleReceipts([
      {
        id: 's1',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        total: 50000,
        collected: 50000,
        status: 'completed',
        items: [
          { productName: 'HAIR CUT', quantity: 1, total: 35000 },
          { productName: 'DEPOSIT', productCode: 'DEPOSIT', quantity: 1, total: 15000 },
        ],
      },
    ]);
    expect(distributed).toHaveLength(1);
    expect(distributed[0].serviceRevenue).toBe(50000);
    expect(distributed[0].depositRevenue).toBe(15000);
    expect(distributed[0].totalRevenue).toBe(50000);
    expect(distributed[0].collectedAmount).toBe(50000);
    expect(distributed[0].salesCount).toBe(1);

    const alreadyGross = aggregateCustomerSaleReceipts([
      {
        id: 's2',
        customerId: 'c2',
        customerName: 'Veli',
        date: '2026-10-19',
        total: 50000,
        ficheDeposit: 15000,
        collected: 80000,
        status: 'completed',
        items: [{ productName: 'HAIR CUT', quantity: 1, total: 50000 }],
      },
    ]);
    expect(alreadyGross[0].serviceRevenue).toBe(50000);
    expect(alreadyGross[0].depositRevenue).toBe(15000);
    expect(alreadyGross[0].totalRevenue).toBe(50000);
    expect(alreadyGross[0].collectedAmount).toBe(50000);

    const header = aggregateCustomerSaleReceipts([
      {
        id: 's3',
        customerId: 'c3',
        customerName: 'Fatma',
        date: '2026-10-19',
        total: 50000,
        serviceAmount: 35000,
        ficheDeposit: 15000,
        status: 'completed',
      },
    ]);
    expect(header[0].serviceRevenue).toBe(50000);
    expect(header[0].depositRevenue).toBe(15000);
    expect(header[0].totalRevenue).toBe(50000);
    expect(header[0].salesCount).toBe(1);

    const separateFiche = aggregateCustomerSaleReceipts([
      {
        id: 'svc',
        customerId: 'c4',
        customerName: 'Zeynep',
        date: '2026-10-19',
        total: 50000,
        saleGroupId: 'g1',
        collected: 35000,
        status: 'completed',
        items: [{ productName: 'HAIR CUT', quantity: 1, total: 35000 }],
      },
      {
        id: 'dep',
        customerId: 'c4',
        customerName: 'Zeynep',
        date: '2026-10-19',
        total: 15000,
        isDeposit: true,
        saleGroupId: 'g1',
        collected: 15000,
        status: 'completed',
        items: [{ productName: 'Depozito', quantity: 1, total: 15000 }],
      },
    ]);
    expect(separateFiche).toHaveLength(1);
    expect(separateFiche[0].salesCount).toBe(1);
    expect(separateFiche[0].serviceRevenue).toBe(50000);
    expect(separateFiche[0].depositRevenue).toBe(15000);
    expect(separateFiche[0].totalRevenue).toBe(50000);
    expect(separateFiche[0].collectedAmount).toBe(50000);

    const returned = aggregateCustomerSaleReceipts([
      {
        id: 'ret',
        customerId: 'c5',
        customerName: 'Ayşe',
        date: '2026-10-19',
        total: -50000,
        ficheDeposit: -15000,
        status: 'return',
        items: [{ productName: 'HAIR CUT', quantity: -1, total: -35000 }],
      },
    ]);
    expect(returned[0].serviceRevenue).toBe(-50000);
    expect(returned[0].totalRevenue).toBe(-50000);
    expect(returned[0].depositRevenue).toBe(-15000);
  });

  it('randevuda 35.000 + 15.000 hizmete işlenir, brüt 50.000 şişmez', () => {
    const rows = aggregateCustomerAppointmentSales([
      {
        id: 'net',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        createdAt: '2026-10-19T09:00:00.000Z',
        totalPrice: 35000,
        depositAmount: 15000,
        remainderPaid: 35000,
        status: 'completed',
      },
      {
        id: 'gross',
        customerId: 'c2',
        customerName: 'Veli',
        date: '2026-10-19',
        createdAt: '2026-10-19T11:00:00.000Z',
        totalPrice: 50000,
        depositAmount: 15000,
        remainderPaid: 35000,
        status: 'completed',
      },
    ]);
    const net = rows.find((row) => row.customerId === 'c1');
    const gross = rows.find((row) => row.customerId === 'c2');
    expect(net?.serviceRevenue).toBe(50000);
    expect(net?.depositRevenue).toBe(15000);
    expect(net?.totalRevenue).toBe(50000);
    expect(net?.collectedAmount).toBe(50000);
    expect(net?.salesCount).toBe(1);
    expect(gross?.serviceRevenue).toBe(50000);
    expect(gross?.depositRevenue).toBe(15000);
    expect(gross?.totalRevenue).toBe(50000);
    expect(gross?.salesCount).toBe(1);
  });

  it('yalnız bir hizmetin depozitosu kardeş randevuya yayılmaz', () => {
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
        remainderPaid: 15000,
        status: 'completed',
      },
      {
        id: 'b',
        customerId: 'c1',
        customerName: 'Ayşe',
        date: '2026-10-19',
        createdAt: created,
        totalPrice: 15000,
        depositAmount: 0,
        remainderPaid: 15000,
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
