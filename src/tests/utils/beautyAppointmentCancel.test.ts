/**
 * Aynı caride iki randevu.
 * İkincisi iptal edilince birincisi tamamlandı kalır.
 * İptal peşinatı 5.000'dır, 10.000 değil.
 * Müşteri id ile UPDATE bütün satırları iptal etmez.
 */
import { describe, expect, it } from 'vitest';
import { AppointmentStatus, type BeautyAppointment } from '../../types/beauty';
import { findBeautyAppointmentsSameQueueGroup } from '../../utils/beautyQueueOrder';
import {
  applyBeautyCancel,
  BEAUTY_CANCEL_APPOINTMENT_WHERE_SQL,
  BEAUTY_CANCEL_SALES_WHERE_SQL,
  beautyCancelSqlUsesCustomer,
  beautyCancelTargets,
  cancelledDepositAmount,
  customerKeyIsCancelTarget,
  reportFicheShowsCancel,
  rowsTouchedByCustomerIdUpdate,
} from '../../utils/beautyAppointmentCancel';
import { dailySalesDetailKindLabel } from '../../utils/dailySalesDetailKind';
import {
  bindInvoiceCancellations,
  cancelledInvoiceDeposit,
  ficheIsCancelTarget,
} from '../../utils/dailySalesDetailFicheSet';

const DAY = '2026-10-25';
const CUSTOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STAFF = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function appointment(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id'>): BeautyAppointment {
  return {
    duration: 60,
    status: AppointmentStatus.SCHEDULED,
    total_price: 25_000,
    is_package_session: false,
    customer_id: CUSTOMER,
    client_id: CUSTOMER,
    customer_name: 'FERHAT',
    staff_id: STAFF,
    specialist_id: STAFF,
    appointment_date: DAY,
    date: DAY,
    deposit_amount: 5_000,
    ...partial,
  };
}

const first = appointment({
  id: '11111111-1111-4111-8111-111111111111',
  status: AppointmentStatus.COMPLETED,
  appointment_time: '09:00',
  time: '09:00',
  service_name: 'TIRNAK',
  sale_group_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  remainder_sale_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  remainder_sale_fiche_no: 'BEA-FERHAT-1',
});

const second = appointment({
  id: '22222222-2222-4222-8222-222222222222',
  status: AppointmentStatus.SCHEDULED,
  appointment_time: '14:00',
  time: '14:00',
  service_name: 'BOYA',
  sale_group_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  remainder_sale_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  remainder_sale_fiche_no: 'BEA-FERHAT-2',
});

describe('randevu iptali yalnız seçilen fiş', () => {
  it('aynı caride ikinci randevu iptal olunca birincisi tamamlandı kalır', () => {
    const queue = findBeautyAppointmentsSameQueueGroup(second, [first, second]);
    expect(queue.map((row) => row.id)).toEqual([first.id, second.id]);

    const targets = beautyCancelTargets(second, [first, second]);
    expect(targets.map((row) => row.id)).toEqual([second.id]);

    const after = applyBeautyCancel([first, second], second);
    const kept = after.find((row) => row.id === first.id);
    const cancelled = after.find((row) => row.id === second.id);
    expect(kept?.status).toBe(AppointmentStatus.COMPLETED);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelledDepositAmount(after)).toBe(5_000);
    expect(cancelledDepositAmount(after)).not.toBe(10_000);
  });

  it('müşteri id ile UPDATE bütün satırları iptal etmez', () => {
    const byCustomer = rowsTouchedByCustomerIdUpdate([first, second], CUSTOMER);
    expect(byCustomer).toEqual([first.id, second.id]);

    const byIdentity = beautyCancelTargets(second, [first, second]).map((row) => row.id);
    expect(byIdentity).toEqual([second.id]);
    expect(byIdentity).not.toEqual(byCustomer);

    expect(beautyCancelSqlUsesCustomer(BEAUTY_CANCEL_APPOINTMENT_WHERE_SQL)).toBe(false);
    expect(beautyCancelSqlUsesCustomer(BEAUTY_CANCEL_SALES_WHERE_SQL)).toBe(false);
    expect(BEAUTY_CANCEL_APPOINTMENT_WHERE_SQL).toContain('sale_group_id');
    expect(BEAUTY_CANCEL_APPOINTMENT_WHERE_SQL).toContain('remainder_sale_fiche_no');
    expect(BEAUTY_CANCEL_SALES_WHERE_SQL).toContain('linked_appointment_id');
    expect(BEAUTY_CANCEL_SALES_WHERE_SQL).not.toMatch(/customer_id/i);
  });

  it('aynı faturanın hizmet satırları birlikte iptal olur, diğer fatura durur', () => {
    const lineA = appointment({
      id: '33333333-3333-4333-8333-333333333333',
      appointment_time: '16:00',
      time: '16:00',
      service_name: 'HIGH LIGHT',
      sale_group_id: '99999999-9999-4999-8999-999999999999',
      remainder_sale_fiche_no: 'BEA-FERHAT-3',
      deposit_amount: 5_000,
    });
    const lineB = appointment({
      id: '44444444-4444-4444-8444-444444444444',
      appointment_time: '17:00',
      time: '17:00',
      service_name: 'HAND JELISH',
      sale_group_id: '99999999-9999-4999-8999-999999999999',
      remainder_sale_fiche_no: 'BEA-FERHAT-3',
      deposit_amount: 0,
    });
    const targets = beautyCancelTargets(lineB, [first, lineA, lineB]);
    expect(targets.map((row) => row.id).sort()).toEqual([lineA.id, lineB.id].sort());
    const after = applyBeautyCancel([first, lineA, lineB], lineB);
    expect(after.find((row) => row.id === first.id)?.status).toBe(AppointmentStatus.COMPLETED);
    expect(after.find((row) => row.id === lineA.id)?.status).toBe('cancelled');
    expect(after.find((row) => row.id === lineB.id)?.status).toBe('cancelled');
    expect(cancelledDepositAmount(after)).toBe(5_000);
  });

  it('satış satırı cari id ile değil bağlı fiş ile iptal olur', () => {
    const sales = [
      {
        id: 'sale-row-1',
        linkedAppointmentId: first.id,
        customerId: CUSTOMER,
        customerName: 'FERHAT',
        paymentStatus: 'paid',
        depositAmount: 5_000,
        status: 'completed',
      },
      {
        id: 'sale-row-2',
        linkedAppointmentId: second.id,
        customerId: CUSTOMER,
        customerName: 'FERHAT',
        paymentStatus: 'paid',
        depositAmount: 5_000,
        status: 'paid',
      },
    ];
    const after = applyBeautyCancel(sales, second, [first, second]);
    expect(after.find((row) => row.id === 'sale-row-1')?.paymentStatus).toBe('paid');
    expect(after.find((row) => row.id === 'sale-row-1')?.status).toBe('completed');
    expect(after.find((row) => row.id === 'sale-row-2')?.paymentStatus).toBe('cancelled');
    expect(cancelledDepositAmount(after)).toBe(5_000);
    expect(rowsTouchedByCustomerIdUpdate(sales, CUSTOMER)).toHaveLength(2);
  });

  it('rapor müşteri adı eşleşince diğer fişi İptal yazmaz', () => {
    const open = {
      id: first.id,
      receiptNumber: 'BEA-FERHAT-1',
      customerName: 'FERHAT',
      customerId: CUSTOMER,
      revenue: 25_000,
      depositAmount: 5_000,
      closed: true,
      kind: 'service' as const,
    };
    const cancelled = {
      id: second.id,
      receiptNumber: 'BEA-FERHAT-2',
      customerName: 'FERHAT',
      customerId: CUSTOMER,
      depositAmount: 5_000,
      ownCancelled: true,
      isForfeitedDeposit: true,
      status: 'cancelled',
    };
    expect(customerKeyIsCancelTarget('FERHAT', open)).toBe(true);
    expect(ficheIsCancelTarget(open, ['FERHAT', CUSTOMER, 'ferhat'])).toBe(false);
    expect(ficheIsCancelTarget(cancelled, [second.id])).toBe(true);
    const listed = bindInvoiceCancellations([open, cancelled], ['FERHAT', CUSTOMER, second.id]);
    expect(listed.find((row) => row.id === first.id)?.ownCancelled).not.toBe(true);
    expect(listed.find((row) => row.id === second.id)?.ownCancelled).toBe(true);
    expect(cancelledInvoiceDeposit(listed, second.id)).toBe(5_000);
    expect(cancelledInvoiceDeposit(listed, 'FERHAT')).toBe(0);
    expect(reportFicheShowsCancel({ ...open, status: 'completed' })).toBe(false);
    expect(reportFicheShowsCancel(cancelled)).toBe(true);
    expect(dailySalesDetailKindLabel(
      { kind: 'service', status: 'completed', customerName: 'FERHAT' } as { kind: string; status: string },
      { service: 'Hizmet', product: 'Ürün', mixed: 'Karma', all: 'Tümü', reservation: 'Rezervasyon', return: 'İade', cancelled: 'İptal' },
    )).toBe('Hizmet');
    expect(dailySalesDetailKindLabel(
      { isForfeitedDeposit: true, status: 'cancelled', customerName: 'FERHAT' },
      { service: 'Hizmet', product: 'Ürün', mixed: 'Karma', all: 'Tümü', reservation: 'Rezervasyon', return: 'İade', cancelled: 'İptal' },
    )).toBe('İptal');
  });
});
