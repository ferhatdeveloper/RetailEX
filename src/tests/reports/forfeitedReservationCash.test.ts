/**
 * İptal edilip iade edilmeyen peşinat.
 *
 * Hizmet 25.000. İptal peşinatı 10.000 rezervasyon kutusundadır. Net 35.000.
 * Mahsup edilen 5.000 kutuda yoktur; cirodadır, ikinci kez yazılmaz.
 * İptal peşinatı satış adedi ve hizmet cirosu değildir.
 */
import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import { cashRegisterRemaining } from '../../utils/cashStatusTotals';
import {
  dailyReportScreenNetCash,
  dailySalesDetailBeforeDiscountContribution,
  dailySalesDetailDiscountContribution,
  sumDailySalesDetailCashBalance,
} from '../../utils/dailySalesDetailCashBalance';
import { dailySalesDetailKindLabel } from '../../utils/dailySalesDetailKind';
import {
  forfeitedDepositByPeriod,
  isForfeitedUnrefundedDeposit,
  sumForfeitedDepositMap,
} from '../../utils/forfeitedReservationCash';
import { localCalendarDateKey } from '../../utils/localCalendarDate';
import {
  aggregatePeriodSales,
  periodSummaryHeadline,
  periodSummaryNetRemaining,
} from '../../utils/periodSummaryNet';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';
import type { KasaIslemi } from '../../services/api/kasa';

const kindLabels = {
  service: 'Hizmet',
  product: 'Ürün',
  mixed: 'Karma',
  all: 'Tümü',
  reservation: 'Rezervasyon',
  return: 'İade',
  expense: 'Gider',
  cancelled: 'İptal',
};

const service = {
  receiptNumber: 'BEA-2026-00001',
  customerName: 'roza',
  kind: 'service',
  kindLabel: 'Hizmet',
  beforeDiscount: 25_000,
  total: 25_000,
  discount: 0,
  isAvans: false,
  isDeposit: false,
  isForfeitedDeposit: false,
};

const appliedDeposit = {
  receiptNumber: 'AVANS-33985dd1',
  customerName: 'roza',
  kindLabel: 'Rezervasyon',
  beforeDiscount: 5_000,
  total: 5_000,
  discount: 0,
  isAvans: true as const,
  isDeposit: false,
  isForfeitedDeposit: false,
  status: 'applied',
};

const forfeitedDeposit = {
  receiptNumber: 'AVANS-48729f8f',
  customerName: 'FERHAT',
  kind: 'unknown',
  kindLabel: 'İptal',
  beforeDiscount: 0,
  total: 10_000,
  discount: 0,
  isAvans: true as const,
  isDeposit: false,
  isForfeitedDeposit: true,
  status: 'kept_on_cancel',
};

const visibleRows = [service, forfeitedDeposit];
const withApplied = [service, appliedDeposit, forfeitedDeposit];

function sale(partial: Partial<Sale> & { id: string; total: number }): Sale {
  return {
    receiptNumber: partial.id,
    date: '2026-10-25T12:00:00',
    status: 'completed',
    paymentMethod: 'cash',
    subtotal: partial.total,
    discount: 0,
    cashier: 'kasa',
    items: [],
    isDeposit: false,
    payments: [{ method: 'cash', amount: Math.abs(partial.total), currency: 'IQD' }],
    ...partial,
  } as Sale;
}

describe('iptal edilip iade edilmeyen peşinat', () => {
  const ferhatAppointment = '48729f8f-1111-4111-8111-111111111111';
  const rozaAppointment = '33985dd1-2222-4222-8222-222222222222';
  const openAppointment = 'aaaaaaaa-3333-4333-8333-333333333333';
  const cancelledAvans = {
    amount: 10_000,
    status: 'open',
    notes: `Rezervasyon Tutarı · Randevu No ${ferhatAppointment}`,
    createdAt: '2026-10-25T16:29:00',
  };
  const appliedAvans = {
    amount: 5_000,
    status: 'applied',
    appliedSaleId: 'sale-roza',
    notes: `Rezervasyon Tutarı · Randevu No ${rozaAppointment}`,
    createdAt: '2026-10-25T16:00:00',
  };
  const appointments = [
    {
      id: ferhatAppointment,
      status: 'cancelled',
      depositAmount: 10_000,
      appointmentDate: '2026-10-25',
    },
    {
      id: rozaAppointment,
      status: 'completed',
      depositAmount: 5_000,
      appointmentDate: '2026-10-25',
    },
  ];

  it('günlük net 35.000, ciro 25.000, 5.000 ikinci kez yazılmaz', () => {
    const revenue = visibleRows.reduce((sum, row) => sum + dailySalesDetailBeforeDiscountContribution(row), 0);
    const discount = visibleRows.reduce((sum, row) => sum + dailySalesDetailDiscountContribution(row), 0);
    const net = dailyReportScreenNetCash(visibleRows);
    const netWithApplied = dailyReportScreenNetCash(withApplied);
    const reservationInfo = appliedDeposit.total + forfeitedDeposit.total;

    expect(isForfeitedUnrefundedDeposit({
      amount: 10_000,
      status: 'open',
      appointmentStatus: 'cancelled',
    })).toBe(true);
    expect(isForfeitedUnrefundedDeposit({
      amount: 5_000,
      status: 'applied',
      appliedSaleId: 'sale-roza',
      appointmentStatus: 'completed',
    })).toBe(false);

    expect(revenue).toBe(25_000);
    expect(discount).toBe(0);
    expect(reservationInfo).toBe(15_000);
    expect(net).toBe(35_000);
    expect(netWithApplied).toBe(35_000);
    expect(net).not.toBe(25_000);
    expect(net).not.toBe(40_000);
    expect(net).not.toBe(50_000);
    expect(dailySalesDetailBeforeDiscountContribution(forfeitedDeposit)).toBe(0);
    expect(dailySalesDetailBeforeDiscountContribution(appliedDeposit)).toBe(0);
    expect(sumDailySalesDetailCashBalance([forfeitedDeposit])).toBe(10_000);
    expect(sumDailySalesDetailCashBalance([appliedDeposit])).toBe(0);
    expect(dailySalesDetailKindLabel(forfeitedDeposit, kindLabels)).toBe('İptal');
    expect(dailySalesDetailKindLabel(forfeitedDeposit, kindLabels)).not.toBe('Hizmet');
    expect(dailySalesDetailKindLabel(service, kindLabels)).toBe('Hizmet');
  });

  it('hizmet grubu 25.000 kalır, iptal satırının 10.000 tutarı yalnız nettadır', () => {
    const groups = new Map<string, { beforeDiscount: number; discount: number; net: number; count: number }>();
    for (const row of withApplied) {
      const key = dailySalesDetailKindLabel(row, kindLabels);
      const group = groups.get(key) || { beforeDiscount: 0, discount: 0, net: 0, count: 0 };
      group.beforeDiscount += dailySalesDetailBeforeDiscountContribution(row);
      group.discount += dailySalesDetailDiscountContribution(row);
      group.net += sumDailySalesDetailCashBalance([row]);
      group.count += 1;
      groups.set(key, group);
    }
    const hizmet = groups.get('Hizmet');
    const iptal = groups.get('İptal');
    const rezervasyon = groups.get('Rezervasyon');
    expect(hizmet).toEqual({ beforeDiscount: 25_000, discount: 0, net: 25_000, count: 1 });
    expect(iptal).toEqual({ beforeDiscount: 0, discount: 0, net: 10_000, count: 1 });
    expect(rezervasyon).toEqual({ beforeDiscount: 0, discount: 0, net: 0, count: 1 });
    const grandBefore = [...groups.values()].reduce((sum, group) => sum + group.beforeDiscount, 0);
    const grandNet = [...groups.values()].reduce((sum, group) => sum + group.net, 0);
    expect(grandBefore).toBe(25_000);
    expect(grandNet).toBe(35_000);
    expect(grandNet).toBe(hizmet!.net + iptal!.net + rezervasyon!.net);
  });

  it('indirim açık cari değildir, gider bir kez düşer', () => {
    const discounted = {
      ...service,
      beforeDiscount: 25_000,
      total: 25_000,
      discount: 1_000,
    };
    const expense = {
      beforeDiscount: 0,
      total: -2_000,
      discount: 0,
      isExpense: true as const,
    };
    const rows = [discounted, forfeitedDeposit, expense];
    expect(dailySalesDetailDiscountContribution(discounted)).toBe(1_000);
    expect(dailySalesDetailDiscountContribution(forfeitedDeposit)).toBe(0);
    expect(sumDailySalesDetailCashBalance(rows)).toBe(32_000);
    expect(sumDailySalesDetailCashBalance(rows)).not.toBe(33_000);
    expect(sumDailySalesDetailCashBalance(rows)).not.toBe(36_000);
    expect(sumDailySalesDetailCashBalance(rows)).not.toBe(30_000);
  });

  it('aylık gün ve yıllık ekim net kalan 35.000, satış adedi 1', () => {
    const month = forfeitedDepositByPeriod([cancelledAvans, appliedAvans], appointments, 'monthly-days');
    const year = forfeitedDepositByPeriod([cancelledAvans, appliedAvans], appointments, 'yearly-months');
    expect(month.get('2026-10-25')).toBe(10_000);
    expect(year.get('2026-10')).toBe(10_000);
    expect(sumForfeitedDepositMap(month)).toBe(10_000);
    expect(sumForfeitedDepositMap(year)).toBe(10_000);

    const serviceSale = sale({ id: 'BEA-2026-00001', total: 25_000, date: '2026-10-25T16:29:00' });
    const cancelledDepositSale = sale({
      id: 'iptal-pesinat',
      total: 10_000,
      status: 'cancelled',
      isDeposit: true,
      date: '2026-10-25T10:00:00',
      notes: 'deposit:1',
    });
    const buckets = aggregatePeriodSales([serviceSale, cancelledDepositSale], (row) => localCalendarDateKey(row.date));
    const day = buckets.get('2026-10-25');
    expect(day?.saleCount).toBe(1);
    expect(day?.revenue).toBe(25_000);
    expect(day?.discount).toBe(0);

    const head = periodSummaryHeadline({
      revenue: day?.revenue || 0,
      returnsAmount: 0,
      returnDeduction: 0,
      expenses: 0,
      expenseEnabled: true,
      reservationDeposit: 10_000,
      forfeitedDeposit: month.get('2026-10-25') || 0,
    });
    expect(head.grossRevenue).toBe(25_000);
    expect(head.depositInfo).toBe(10_000);
    expect(head.netRevenue).toBe(35_000);
    expect(head.netRevenue).not.toBe(25_000);
    expect(head.netRevenue).not.toBe(45_000);
    expect(head.grossRevenue + head.depositInfo).toBe(head.netRevenue);

    expect(periodSummaryNetRemaining({
      revenue: 25_000,
      returnDeduction: 0,
      expenses: 2_000,
      expenseEnabled: true,
      ciroDisiTahsilat: 10_000,
      reservationDeposit: 10_000,
    })).toBe(33_000);
  });

  it('aynı randevu bir kez sayılır; açık ve iade edilmiş peşinat nete girmez', () => {
    const doubled = forfeitedDepositByPeriod(
      [cancelledAvans],
      appointments,
      'monthly-days',
    );
    expect(doubled.get('2026-10-25')).toBe(10_000);

    const keptOnly = forfeitedDepositByPeriod(
      [{
        amount: 10_000,
        status: 'kept_on_cancel',
        notes: `Rezervasyon Tutarı · Randevu No ${ferhatAppointment}`,
        createdAt: '2026-10-25T16:29:00',
      }],
      [{ id: ferhatAppointment, status: 'cancelled', depositAmount: 0, appointmentDate: '2026-10-25' }],
      'monthly-days',
    );
    expect(keptOnly.get('2026-10-25')).toBe(10_000);

    const open = forfeitedDepositByPeriod(
      [{
        amount: 7_000,
        status: 'open',
        notes: `Rezervasyon Tutarı · Randevu No ${openAppointment}`,
        createdAt: '2026-10-25T12:00:00',
      }],
      [{ id: openAppointment, status: 'scheduled', depositAmount: 7_000, appointmentDate: '2026-10-25' }],
      'monthly-days',
    );
    expect(sumForfeitedDepositMap(open)).toBe(0);

    const refunded = forfeitedDepositByPeriod(
      [{
        amount: 10_000,
        status: 'refunded',
        notes: `Rezervasyon Tutarı · Randevu No ${ferhatAppointment}`,
        createdAt: '2026-10-25T16:29:00',
        refunded: true,
      }],
      [{ id: ferhatAppointment, status: 'cancelled', depositAmount: 10_000, appointmentDate: '2026-10-25' }],
      'monthly-days',
    );
    expect(sumForfeitedDepositMap(refunded)).toBe(0);
  });

  it('kasa bakiyesi 35.000 kalır, virman gider değildir', () => {
    expect(cashRegisterRemaining({
      cash: 35_000,
      expense: 0,
      reservation: 15_000,
      ledgerBalance: 35_000,
    })).toBe(35_000);

    const virman = {
      id: 'line-virman',
      firma_id: '001',
      kasa_id: 'reg-1',
      target_register_id: 'reg-2',
      islem_tarihi: '2026-10-25',
      islem_tipi: 'VIRMAN',
      islem_aciklamasi: 'Kasa virmanı',
      islem_no: 'VRM-1',
      tutar: 10_000,
      sign: -1,
    } as KasaIslemi;
    const expenses = mergeExpensesWithCashOuts([], [virman]);
    expect(expenses).toHaveLength(0);
    expect(periodSummaryNetRemaining({
      revenue: 25_000,
      returnDeduction: 0,
      expenses: expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      expenseEnabled: true,
      ciroDisiTahsilat: 10_000,
      reservationDeposit: 10_000,
    })).toBe(35_000);
  });
});
