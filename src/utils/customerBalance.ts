/**
 * Müşteri bakiyesi — 3 parçalı gösterim için pure helper.
 *
 * 11.10.2026 — Kullanıcı şikâyeti (Müşteriler ekranı):
 * ROZA -10.000 / ARAM -35.000 bakiyeler "henüz hizmet verilmemiş
 * rezervasyon peşinatları" gibi görünüyordu. `customers.balance`
 * ledger'dan gelir ve henüz hizmet verilmemiş rezervasyon avansını
 * içermez; bu yüzden müşteri aslında borçlu değilken bakiye eksili
 * görünür. `customerEffectiveBalance` 0 döndürür; ama kullanıcı
 * ayrıca "Avans olarak ne kadar bekliyor" bilgisini de istiyor.
 *
 * Bu helper tek doğruluk kaynağıdır:
 *   - realBalance      → müşterinin gerçek borcu/alacağı (avans Hariç)
 *                        Henüz hizmet verilmemiş avans, bakiyeye dahil değil
 *                        olduğu için effective = balance + pending.
 *   - pendingDeposit   → henüz hizmet verilmemiş rezervasyon avansı
 *   - totalSpent       → tamamlanmış hizmetlerden yapılan toplam harcama
 *
 * Semantik:
 *   ledger = -10.000 (peşinat 5.000 alındı + 5.000 kalan) ya da
 *            -10.000 (10.000 peşinat alındı, hizmet verilmedi)
 *   pendingDeposit = 10.000 (henüz harcanmamış avans)
 *   realBalance = ledger + pending = 0 (avans Hariç, hizmet verilmediyse 0)
 *                ledger = 50.000, pending = 0  → 50.000 (gerçek borç, kırmızı)
 *                ledger = -20.000, pending = 0 → -20.000 (gerçek alacak, yeşil)
 *   Bu sayede ROZA: 0 + Avans 10.000 (mavi badge); ARAM: 0 + Avans 35.000.
 */

export interface CustomerBalanceInput {
  /** `customers.balance` — ledger'dan gelen ham bakiye (avans Hariç). */
  balance?: number | null | undefined;
  /** `cash_lines.CH_TAHSILAT + special_code IN ('REZERVASYON','AVANS')` toplamı. */
  pendingDeposit?: number | null | undefined;
  /** Tamamlanmış hizmet/ürünlerden elde edilen toplam harcama. */
  totalSpent?: number | null | undefined;
}

export interface CustomerBalanceParts {
  /** Müşterinin gerçek borcu (pozitif) veya alacağı (negatif). Avans Hariç. */
  realBalance: number;
  /** Henüz hizmet verilmemiş rezervasyon avansı. */
  pendingDeposit: number;
  /** Tamamlanmış işlemlerden toplam harcama. */
  totalSpent: number;
}

const toSafeNumber = (v: number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function computeCustomerBalance(input: CustomerBalanceInput): CustomerBalanceParts {
  const balance = toSafeNumber(input.balance);
  const pending = toSafeNumber(input.pendingDeposit);
  const totalSpent = toSafeNumber(input.totalSpent);
  // `customers.balance` ledger'dan gelir ve henüz hizmet verilmemiş avansı
  // içermez (avans tahsilatı müşteri alacağını azaltır). Gerçek bakiye =
  // ledger + avans; avans zaten düşülmüş, geri ekliyoruz.
  return {
    realBalance: balance + pending,
    pendingDeposit: pending,
    totalSpent,
  };
}

/**
 * Görsel renk belirleyici — bakiye yönüne göre token sınıfı döner.
 *   > 0  : borçlu (kırmızı)
 *   < 0  : alacaklı (yeşil)
 *   = 0  : nötr (gri)
 */
export function balanceColorClass(realBalance: number): string {
  if (realBalance > 0.005) return 'text-red-600';
  if (realBalance < -0.005) return 'text-emerald-600';
  return 'text-gray-500';
}

/**
 * Randevu "Kalan" tutarı (12.10.2026 — NIHAT bug'ı).
 *
 * Bugün DB gerçeği:
 *   total_price = 50.000, deposit_amount = 20.000, remainder_paid_amount = 30.000
 *   status = 'completed' → ekranda **0** görünmeliydi, **30.000** gösteriyordu.
 *
 * Kök neden: eski hesap `total_price - deposit_amount - remainder_paid_amount`
 * formülünü durum bilgisi olmadan uyguluyordu; completed randevuda
 * remainder_paid_amount kasaya yansımışsa `kalan = 0` olmalı, ama
 * `remainder_paid_amount` henüz satış fişine uygulanmamış (applyAdvanceToSale
 * çalıştırılmamış) → aynı tutar hem avans hem satış kalanı sayılıyordu
 * (çift sayım 50k + 30k = 80k).
 *
 * Semantik:
 *   - status='completed' | 'closed'        → 0 (hizmet verildi, kalan yok)
 *   - status='cancelled' | 'canceled' | 'no_show' | 'no-show' | 'void'
 *                                          → 0 (iptal, borç yok)
 *   - aksi                                → max(0, total_price - deposit - remainder_paid)
 *
 * `remainder_paid_amount` opsiyonel; yoksa 0 sayılır.
 */
export interface AppointmentRemainderInput {
  total_price?: number | null | undefined;
  deposit_amount?: number | null | undefined;
  remainder_paid_amount?: number | null | undefined;
  status?: string | null | undefined;
}

export function computeAppointmentRemainder(
  apt: AppointmentRemainderInput,
): number {
  const status = String(apt.status ?? '').trim().toLowerCase();
  if (
    status === 'completed' ||
    status === 'closed' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'no_show' ||
    status === 'no-show' ||
    status === 'void'
  ) {
    return 0;
  }
  const total = Math.max(0, Number(apt.total_price ?? 0) || 0);
  const deposit = Math.max(0, Number(apt.deposit_amount ?? 0) || 0);
  const remainderPaid = Math.max(
    0,
    Number(apt.remainder_paid_amount ?? 0) || 0,
  );
  return Math.max(0, total - deposit - remainderPaid);
}

/** Kısa alias — randevu kalanı için UI tarafında kullanılır. */
export const computeKalan = computeAppointmentRemainder;
