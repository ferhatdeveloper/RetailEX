import { describe, expect, it } from 'vitest';
import { spreadReservationAcrossLines } from '../../utils/beautyDepositAllocation';
import {
  prePaymentReceived,
  prePaymentRemaining,
  prePaymentServiceTotal,
  spreadPrePaymentDepositRows,
  type PrePaymentDepositSource,
} from '../../utils/depositPrePaymentAllocation';

function row(partial: PrePaymentDepositSource): PrePaymentDepositSource {
  return {
    customer_id: 'cust-test',
    customer_name: 'TEST',
    appointment_date: '2026-10-20',
    status: 'scheduled',
    remainder_paid_amount: 0,
    avans_total: 20_000,
    ...partial,
  };
}

describe('spreadPrePaymentDepositRows', () => {
  it('aynı fişte 50.000 ve 60.000 hizmet 20.000 depozitoyu paylaşır', () => {
    const created = '2026-10-20T06:00:00.000Z';
    const lines = spreadPrePaymentDepositRows([
      row({
        appointment_id: 'pink',
        appointment_time: '10:00',
        created_at: '2026-10-20T06:00:01.000Z',
        total_price: 60_000,
        deposit_amount: 0,
        payment_state: 'unpaid',
      }),
      row({
        appointment_id: 'cut',
        appointment_time: '09:00',
        created_at: created,
        total_price: 50_000,
        deposit_amount: 20_000,
        payment_state: 'deposit_only',
        deposit_sale_fiche_no: 'RZV-1',
      }),
    ]);

    const byId = new Map(lines.map((line) => [line.appointment_id, line]));
    const cut = byId.get('cut')!;
    const pink = byId.get('pink')!;
    const expected = spreadReservationAcrossLines(
      [
        { unitPrice: 50_000, qty: 1 },
        { unitPrice: 60_000, qty: 1 },
      ],
      20_000,
    ).map((share) => share.depositShare);

    expect([cut.deposit_amount, pink.deposit_amount]).toEqual(expected);
    expect(expected.reduce((sum, share) => sum + share, 0)).toBe(20_000);
    expect(expected.every((share) => share > 0)).toBe(true);

    const serviceTotal = prePaymentServiceTotal(cut) + prePaymentServiceTotal(pink);
    const received = prePaymentReceived(cut) + prePaymentReceived(pink);
    const remaining = prePaymentRemaining(cut) + prePaymentRemaining(pink);
    expect(serviceTotal).toBe(110_000);
    expect(received).toBe(20_000);
    expect(remaining).toBe(90_000);
    expect(serviceTotal).not.toBe(150_000);
    expect(remaining).not.toBe(130_000);
    expect(cut.payment_state).toBe('deposit_only');
    expect(pink.payment_state).toBe('deposit_only');
    expect(cut.total_price).toBe(50_000);
    expect(pink.total_price).toBe(60_000);
  });

  it('müşteri avansı hizmet bedelinin üstüne eklenmez', () => {
    const line = row({
      appointment_id: 'cut',
      total_price: 50_000,
      deposit_amount: 9_000,
      avans_total: 20_000,
      payment_state: 'deposit_only',
    });
    expect(prePaymentServiceTotal(line)).toBe(50_000);
    expect(prePaymentRemaining(line)).toBe(41_000);
    expect(prePaymentServiceTotal(line) + (line.avans_total || 0)).not.toBe(prePaymentServiceTotal(line));
  });

  it('farklı fişin depozitosu karışmaz', () => {
    const lines = spreadPrePaymentDepositRows([
      row({
        appointment_id: 'a-cut',
        created_at: '2026-10-20T06:00:00.000Z',
        appointment_time: '09:00',
        total_price: 50_000,
        deposit_amount: 20_000,
        payment_state: 'deposit_only',
        deposit_sale_fiche_no: 'RZV-A',
      }),
      row({
        appointment_id: 'a-color',
        created_at: '2026-10-20T06:00:01.000Z',
        appointment_time: '10:00',
        total_price: 60_000,
        deposit_amount: 0,
        payment_state: 'unpaid',
      }),
      row({
        appointment_id: 'b-cut',
        created_at: '2026-10-20T06:00:02.000Z',
        appointment_time: '11:00',
        total_price: 40_000,
        deposit_amount: 10_000,
        payment_state: 'deposit_only',
        deposit_sale_fiche_no: 'RZV-B',
      }),
    ]);
    const byId = new Map(lines.map((line) => [line.appointment_id, line]));
    const aShares = (byId.get('a-cut')!.deposit_amount || 0) + (byId.get('a-color')!.deposit_amount || 0);
    expect(aShares).toBe(20_000);
    expect(byId.get('b-cut')!.deposit_amount).toBe(10_000);
    expect(byId.get('a-color')!.deposit_amount).not.toBe(0);
    expect(byId.get('a-color')!.deposit_amount).not.toBe(10_000);
  });

  it('geç kayıt ve başka müşteri pay almaz', () => {
    const lines = spreadPrePaymentDepositRows([
      row({
        appointment_id: 'cut',
        created_at: '2026-10-20T06:00:00.000Z',
        total_price: 50_000,
        deposit_amount: 20_000,
        payment_state: 'deposit_only',
      }),
      row({
        appointment_id: 'later',
        created_at: '2026-10-20T09:00:00.000Z',
        total_price: 60_000,
        deposit_amount: 0,
        payment_state: 'unpaid',
      }),
      row({
        appointment_id: 'other',
        customer_id: 'cust-2',
        customer_name: 'DİĞER',
        created_at: '2026-10-20T06:00:01.000Z',
        total_price: 60_000,
        deposit_amount: 0,
        payment_state: 'unpaid',
      }),
    ]);
    const byId = new Map(lines.map((line) => [line.appointment_id, line]));
    expect(byId.get('cut')!.deposit_amount).toBe(20_000);
    expect(byId.get('later')!.deposit_amount).toBe(0);
    expect(byId.get('later')!.payment_state).toBe('unpaid');
    expect(byId.get('other')!.deposit_amount).toBe(0);
  });

  it('iade eksi kalır ve hizmet bedelinden ikinci kez düşülmez', () => {
    const lines = spreadPrePaymentDepositRows([
      row({
        appointment_id: 'cut',
        created_at: '2026-10-20T06:00:00.000Z',
        total_price: -50_000,
        deposit_amount: -20_000,
        payment_state: 'deposit_only',
        status: 'scheduled',
      }),
      row({
        appointment_id: 'pink',
        created_at: '2026-10-20T06:00:01.000Z',
        total_price: -60_000,
        deposit_amount: 0,
        payment_state: 'unpaid',
        status: 'scheduled',
      }),
    ]);
    const shares = lines.map((line) => line.deposit_amount || 0);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(-20_000);
    expect(shares.every((share) => share < 0)).toBe(true);
    const remaining = lines.reduce((sum, line) => sum + prePaymentRemaining(line), 0);
    expect(remaining).toBe(-90_000);
    expect(lines.reduce((sum, line) => sum + prePaymentServiceTotal(line), 0)).toBe(-110_000);
  });
});
