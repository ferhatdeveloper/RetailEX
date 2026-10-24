/**
 * Randevu fişindeki ödenmemiş bakiye.
 * Yalnızca fiş satırıdır: ciroyu düşürmez, peşinat ciro değildir.
 * Ödenen toplamı aşarsa kalan 0; eksi bakiye yazılmaz.
 */
const BALANCE_EPS = 1e-6;

export function receiptUnpaidBalance(total: number, paid: number): number {
  const totalN = Number(total);
  const paidN = Number(paid);
  const safeTotal = Number.isFinite(totalN) ? totalN : 0;
  const safePaid = Number.isFinite(paidN) ? Math.max(0, paidN) : 0;
  const raw = safeTotal - safePaid;
  if (!(raw > BALANCE_EPS)) return 0;
  return raw;
}

export type AppointmentReceiptPayState = 'unpaid' | 'partial' | 'paid';

/** Ödenen 0 → alınmadı. Kalan varsa kısmi. Kalan 0 ve ödenen > 0 → alındı. */
export function appointmentReceiptPayState(total: number, paid: number): AppointmentReceiptPayState {
  const paidN = Number(paid);
  const safePaid = Number.isFinite(paidN) ? Math.max(0, paidN) : 0;
  if (!(safePaid > BALANCE_EPS)) return 'unpaid';
  if (!(receiptUnpaidBalance(total, safePaid) > BALANCE_EPS)) return 'paid';
  return 'partial';
}

const APPOINTMENT_RECEIPT_BANNERS: Record<
  'tr' | 'en' | 'ar' | 'ku' | 'uz',
  Record<AppointmentReceiptPayState, string>
> = {
  tr: {
    unpaid: 'RANDEVU — Ödeme alınmadı',
    partial: 'RANDEVU — Kısmi ödeme',
    paid: 'RANDEVU — Ödeme alındı',
  },
  en: {
    unpaid: 'APPOINTMENT — Payment not taken',
    partial: 'APPOINTMENT — Partial payment',
    paid: 'APPOINTMENT — Payment received',
  },
  ar: {
    unpaid: 'موعد — لم يتم الدفع',
    partial: 'موعد — دفع جزئي',
    paid: 'موعد — تم الدفع',
  },
  ku: {
    unpaid: 'ژماون — پارە نەدراوە',
    partial: 'ژماون — پارەدانی بەشەکی',
    paid: 'ژماون — پارە دراوە',
  },
  uz: {
    unpaid: "QABUL — To'lov olinmagan",
    partial: "QABUL — Qisman to'lov",
    paid: "QABUL — To'lov olindi",
  },
};

export function appointmentReceiptBanner(lang: string, state: AppointmentReceiptPayState): string {
  const pack = APPOINTMENT_RECEIPT_BANNERS[lang as keyof typeof APPOINTMENT_RECEIPT_BANNERS]
    ?? APPOINTMENT_RECEIPT_BANNERS.tr;
  return pack[state];
}
