import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../types/beauty';
import {
  GREEN_RESERVATION_STATUS,
  greenStatusAfterPayment,
  linkedReservationIdsForGreenStatus,
  serviceSaleFullyPaysVisit,
  type ReservationGreenRow,
} from '../../utils/beautyReservationGreenStatus';

const anchor: ReservationGreenRow = {
  id: 'paid-visit',
  status: 'completed',
  saleGroupId: 'grp-1',
  customerId: 'cust-1',
  appointmentDate: '2026-12-01',
  appointmentTime: '14:00:00',
  serviceId: 'svc-laser',
};

describe('ödenmiş tamamlanmış rezervasyon yeşil olur', () => {
  it('ödenmiş ve tamamlanmış rezervasyon yeşil duruma geçer', () => {
    expect(greenStatusAfterPayment({
      fullyPaid: true,
      visitCompleted: true,
      currentStatus: 'scheduled',
    })).toBe(GREEN_RESERVATION_STATUS);
    expect(GREEN_RESERVATION_STATUS).toBe(AppointmentStatus.COMPLETED);
    expect(linkedReservationIdsForGreenStatus({
      fullyPaid: true,
      visitCompleted: true,
      anchor,
      paidServiceIds: ['svc-laser', 'svc-nctf'],
      reservations: [
        { ...anchor, id: 'paid-visit', status: 'completed' },
        {
          id: 'sibling-on-sale',
          status: 'scheduled',
          saleGroupId: 'grp-1',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '14:05:00',
          serviceId: 'svc-nctf',
        },
        {
          id: 'future-deposit',
          status: 'pre_paid',
          saleGroupId: 'grp-1',
          customerId: 'cust-1',
          appointmentDate: '2026-12-20',
          appointmentTime: '14:10:00',
          serviceId: 'svc-deposit',
          depositAmount: 25000,
        },
        {
          id: 'same-slot-old-id',
          status: 'confirmed',
          saleGroupId: 'other-group',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '14:00',
          serviceId: 'svc-laser',
        },
      ],
    })).toEqual(['sibling-on-sale', 'future-deposit', 'same-slot-old-id']);
  });

  it('ödenmemiş veya tamamlanmamış rezervasyon yeşil olmaz', () => {
    expect(greenStatusAfterPayment({
      fullyPaid: false,
      visitCompleted: true,
      currentStatus: 'scheduled',
    })).toBeNull();
    expect(greenStatusAfterPayment({
      fullyPaid: true,
      visitCompleted: false,
      currentStatus: 'pre_paid',
    })).toBeNull();
    expect(linkedReservationIdsForGreenStatus({
      fullyPaid: false,
      visitCompleted: true,
      anchor,
      reservations: [
        {
          id: 'still-open',
          status: 'scheduled',
          saleGroupId: 'grp-1',
          serviceId: 'svc-laser',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '14:00',
        },
      ],
    })).toEqual([]);
    expect(linkedReservationIdsForGreenStatus({
      fullyPaid: true,
      visitCompleted: true,
      anchor,
      paidServiceIds: ['svc-laser'],
      reservations: [
        {
          id: 'other-service',
          status: 'scheduled',
          saleGroupId: 'grp-1',
          serviceId: 'svc-unpaid',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '16:00',
        },
        {
          id: 'cancelled-row',
          status: 'cancelled',
          saleGroupId: 'grp-1',
          serviceId: 'svc-laser',
        },
      ],
    })).toEqual([]);
  });

  it('kısmi tahsilat ve peşinat fişi tam ödeme sayılmaz', () => {
    expect(serviceSaleFullyPaysVisit({
      isDeposit: false,
      paymentStatus: 'paid',
      paidAmount: 20000,
      total: 50000,
      remainingAmount: 30000,
    })).toBe(false);
    expect(serviceSaleFullyPaysVisit({
      isDeposit: true,
      paymentStatus: 'paid',
      paidAmount: 20000,
      total: 20000,
      remainingAmount: 0,
    })).toBe(false);
    expect(serviceSaleFullyPaysVisit({
      isDeposit: false,
      paymentStatus: 'paid',
      paidAmount: 50000,
      total: 50000,
      remainingAmount: 0,
    })).toBe(true);
  });

  it('fiş başka hizmetlere yazılsa da aynı gün sıfır tutarlı satır yeşil olur', () => {
    const paidAnchor: ReservationGreenRow = {
      ...anchor,
      id: 'mezo-row',
      status: 'completed',
      appointmentTime: '05:00:00',
      serviceId: 'svc-mezo',
      totalPrice: 375000,
    };
    expect(linkedReservationIdsForGreenStatus({
      fullyPaid: true,
      visitCompleted: true,
      anchor: paidAnchor,
      paidServiceIds: ['svc-salamun', 'svc-powder', 'svc-radies'],
      reservations: [
        paidAnchor,
        {
          id: 'dermapen-row',
          status: 'scheduled',
          saleGroupId: 'grp-1',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '05:05:00',
          serviceId: 'svc-dermapen',
          totalPrice: 0,
          depositAmount: 0,
        },
        {
          id: 'priced-other-service',
          status: 'in_progress',
          saleGroupId: 'grp-1',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '16:00:00',
          serviceId: 'svc-unpaid',
          totalPrice: 80000,
          depositAmount: 0,
        },
      ],
    })).toEqual(['dermapen-row']);
  });

  it('tahsilat başka randevu kimliğine yazılsa da fişteki ayrı satır yeşil olur', () => {
    const paidAnchor: ReservationGreenRow = {
      ...anchor,
      id: 'radies-row',
      status: 'in_progress',
      serviceId: 'svc-radies',
      totalPrice: 500000,
      saleGroupId: 'grp-radies',
    };
    expect(greenStatusAfterPayment({
      fullyPaid: true,
      visitCompleted: true,
      currentStatus: 'in_progress',
    })).toBe(GREEN_RESERVATION_STATUS);
    expect(linkedReservationIdsForGreenStatus({
      fullyPaid: true,
      visitCompleted: true,
      anchor: paidAnchor,
      paidServiceIds: ['svc-radies', 'svc-full'],
      reservations: [
        paidAnchor,
        {
          id: 'full-separate',
          status: 'scheduled',
          saleGroupId: 'grp-full',
          customerId: 'cust-1',
          appointmentDate: '2026-12-01',
          appointmentTime: '04:15:00',
          serviceId: 'svc-full',
          totalPrice: 100000,
        },
        {
          id: 'next-day-full',
          status: 'confirmed',
          saleGroupId: 'grp-full',
          customerId: 'cust-1',
          appointmentDate: '2026-12-02',
          appointmentTime: '04:15:00',
          serviceId: 'svc-full',
          totalPrice: 100000,
        },
      ],
    })).toEqual(['radies-row', 'full-separate']);
  });
});
