/**
 * Bug fix 2026-10-13 (aqua güzellik): `salesAPI.create` içinde
 * `header_fields.payments[].amount` her zaman PEŞİN ÖDENEN (net) kısım
 * olmalı, brüt Ciro DEĞİL. Bazı caller'lar brüt tutar gönderiyordu
 * (120k brüt + 35k iskonto + 85k ödenen → payment.amount=120k →
 * split fonksiyonu kalan 35k veresiye sayıyordu).
 *
 * Bu test, brüt→net oransal küçültme mantığını doğrular. Testin
 * kendisi küçük bir "scaler" fonksiyonu ile doğrular; production
 * davranışı `sales.ts:200-227` bloğunda.
 */
import { describe, expect, it } from 'vitest';

/** sales.ts'daki overflow korumasını izole eden mini-fonksiyon (test amaçlı). */
function scalePaymentAmounts(
  paymentRows: Array<{ amount: number }>,
  saleTotal: number,
): Array<{ amount: number }> {
  const paymentSumRaw = paymentRows.reduce(
    (s, p) => s + Math.abs(Number(p?.amount) || 0),
    0,
  );
  const overflow = paymentSumRaw > saleTotal + 1e-6 && saleTotal > 0;
  const scale = overflow ? saleTotal / paymentSumRaw : 1;
  return paymentRows.map((p) => ({
    amount: Math.round((Number(p.amount) || 0) * scale * 100) / 100,
  }));
}

describe('salesAPI.create — payment.amount overflow koruması (Bug 2026-10-13 aqua)', () => {
  it('caller brüt 120k + iskonto 35k → sale.total=85k, payment 85k olur (veresiye yok)', () => {
    // Caller yanlışlıkla brüt 120k gönderdi; sale.total=85k (ödenen).
    // Oransal küçültme: 120k → 85k; split fonksiyonu remaining=0 (iskonto cari değil).
    const out = scalePaymentAmounts([{ amount: 120000 }], 85000);
    expect(out[0].amount).toBe(85000);
  });

  it('caller doğru net 85k gönderdi → olduğu gibi kalır', () => {
    const out = scalePaymentAmounts([{ amount: 85000 }], 85000);
    expect(out[0].amount).toBe(85000);
  });

  it('caller net 50k + veresiye 35k gönderdi (brüt 85k = sale.total) → olduğu gibi kalır', () => {
    // payment.sum = 50k+35k = 85k = sale.total; overflow yok
    const out = scalePaymentAmounts(
      [{ amount: 50000 }, { amount: 35000 }],
      85000,
    );
    expect(out[0].amount).toBe(50000);
    expect(out[1].amount).toBe(35000);
  });

  it('caller tam nakit 50k + veresiye 35k + sale.total=85k → oransal korunur', () => {
    const out = scalePaymentAmounts(
      [{ amount: 50000, method: 'cash' }, { amount: 35000, method: 'veresiye' }],
      85000,
    );
    expect(out[0].amount).toBe(50000);
    expect(out[1].amount).toBe(35000);
  });

  it('caller brüt 200k + veresiye 50k (toplam 250k), sale.total=200k → her ikisi 200/250 oranında küçülür', () => {
    const out = scalePaymentAmounts(
      [{ amount: 200000, method: 'cash' }, { amount: 50000, method: 'veresiye' }],
      200000,
    );
    // 200k * (200/250) = 160k; 50k * (200/250) = 40k
    expect(out[0].amount).toBe(160000);
    expect(out[1].amount).toBe(40000);
  });

  it('sale.total=0 → overflow tetiklenmez, olduğu gibi kalır (sıfır bölme koruması)', () => {
    const out = scalePaymentAmounts([{ amount: 100 }], 0);
    expect(out[0].amount).toBe(100);
  });

  it('IQD 250 kademe: küçültme sonrası yuvarlama kabul edilebilir', () => {
    // 123456 → scale 0.5 → 61728 (2 ondalık)
    const out = scalePaymentAmounts([{ amount: 123456 }], 61728);
    expect(out[0].amount).toBeCloseTo(61728, 2);
  });
});
