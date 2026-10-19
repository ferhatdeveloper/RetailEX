import { describe, expect, it } from 'vitest';
import type { BeautyAppointment } from '../../types/beauty';
import { allocateBeautyVisitDeposits, spreadReservationAcrossLines } from '../../utils/beautyDepositAllocation';

function apt(partial: Partial<BeautyAppointment> & { id: string }): BeautyAppointment {
  return {
    duration: 30,
    status: 'completed',
    total_price: 0,
    is_package_session: false,
    ...partial,
  } as BeautyAppointment;
}

describe('spreadReservationAcrossLines', () => {
  it('randevu düşümü gibi 1000 e yuvarlar ve son satıra kalanı yazar', () => {
    const spread = spreadReservationAcrossLines(
      [
        { unitPrice: 20000, qty: 1 },
        { unitPrice: 15000, qty: 1 },
      ],
      5000,
    );
    expect(spread.map((s) => s.depositShare)).toEqual([3000, 2000]);
    expect(spread.map((s) => s.unitPrice)).toEqual([17000, 13000]);
  });
});

describe('allocateBeautyVisitDeposits', () => {
  it('tek hizmette depozitonun tamamını bırakır', () => {
    const map = allocateBeautyVisitDeposits([
      apt({
        id: 'a',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: '2026-10-19T09:00:00.000Z',
        total_price: 35000,
        deposit_amount: 5000,
      }),
    ]);
    expect(map.get('a')).toBe(5000);
  });

  it('aynı fişte iki hizmete depozitoyu bedel oranında böler', () => {
    const created = '2026-10-19T09:00:00.000Z';
    const map = allocateBeautyVisitDeposits([
      apt({
        id: 'svc-a',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: created,
        total_price: 20000,
        deposit_amount: 5000,
      }),
      apt({
        id: 'svc-b',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: '2026-10-19T09:00:01.000Z',
        total_price: 15000,
        deposit_amount: 0,
      }),
    ]);
    expect(map.get('svc-a')).toBe(3000);
    expect(map.get('svc-b')).toBe(2000);
    expect((map.get('svc-a') || 0) + (map.get('svc-b') || 0)).toBe(5000);
  });

  it('aynı depozito her satıra kopyalandıysa bir kez bölünür', () => {
    const created = '2026-10-19T09:00:00.000Z';
    const map = allocateBeautyVisitDeposits([
      apt({
        id: 'a',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: created,
        total_price: 20000,
        deposit_amount: 5000,
      }),
      apt({
        id: 'b',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: created,
        total_price: 15000,
        deposit_amount: 5000,
      }),
    ]);
    expect(map.get('a')).toBe(3000);
    expect(map.get('b')).toBe(2000);
  });

  it('her satırın kendi depozitosu varsa yeniden bölmez', () => {
    const created = '2026-10-19T09:00:00.000Z';
    const map = allocateBeautyVisitDeposits([
      apt({
        id: 'a',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: created,
        total_price: 20000,
        deposit_amount: 1000,
      }),
      apt({
        id: 'b',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: created,
        total_price: 20000,
        deposit_amount: 4000,
      }),
    ]);
    expect(map.get('a')).toBe(1000);
    expect(map.get('b')).toBe(4000);
  });

  it('farklı müşteriye veya geç kayda depozito taşımaz', () => {
    const map = allocateBeautyVisitDeposits([
      apt({
        id: 'a',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: '2026-10-19T09:00:00.000Z',
        total_price: 20000,
        deposit_amount: 5000,
      }),
      apt({
        id: 'other',
        customer_id: 'c2',
        appointment_date: '2026-10-19',
        created_at: '2026-10-19T09:00:00.000Z',
        total_price: 20000,
        deposit_amount: 0,
      }),
      apt({
        id: 'later',
        customer_id: 'c1',
        appointment_date: '2026-10-19',
        created_at: '2026-10-19T11:00:00.000Z',
        total_price: 20000,
        deposit_amount: 0,
      }),
    ]);
    expect(map.get('a')).toBe(5000);
    expect(map.get('other')).toBe(0);
    expect(map.get('later')).toBe(0);
  });
});
