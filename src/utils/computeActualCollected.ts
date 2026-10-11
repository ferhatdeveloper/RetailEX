/**
 * computeActualCollected — güzellik/rapor Ciro = "tahsil edilen nakit"
 *
 * Kök neden — kullanıcı şikâyeti 2026-10-11:
 *   "Tüm raporlar hizmet tam tutarını (50.000) yansıtıyor;
 *    aslında Ciro = bugün tahsil edilen nakit olmalı."
 *
 * Muhasebeci kuralı (90 yıllık kıdemli denetim):
 *   Ciro = peşinat + (tamamlandı ise) remainder_paid_amount
 *   - "Sadece Peşinat" (pending/scheduled/pre_paid) → sadece peşinat
 *   - "Tamamlandı" (completed/closed) → peşinat + kalan ödeme
 *   - "İptal" (cancelled/no_show/refunded) → 0
 *   - Veresiye → 0 (kalan cari borç, henüz tahsil edilmemiş)
 *   - paid_amount DB'de en güvenilir; öncelik verilir.
 *
 * `paid_amount` her zaman öncelikli — DB'de güncel tahsilat rakamı.
 * Yoksa: duruma göre deposit + remainder (tamamlanmış) veya deposit (henüz).
 */

export type AppointmentLike = {
  total_price?: number | null;
  deposit_amount?: number | null;
  remainder_paid_amount?: number | null;
  paid_amount?: number | null;
  status?: string | null;
  appointment_date?: string | null;
  date?: string | null;
};

export type SaleLike = {
  total?: number | null;
  total_price?: number | null;
  deposit_amount?: number | null;
  remainder_paid_amount?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  status?: string | null;
  payment_method?: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'iptal',
  'silindi',
  'no_show',
  'refunded',
  'void',
  'deleted',
]);

const COMPLETED_STATUSES = new Set([
  'completed',
  'closed',
  'paid',
  'tamamlandi',
  'tamamlandı',
]);

const VERESIYE_METHODS = new Set([
  'veresiye',
  'credit',
  'open_account',
  'cari',
  'açık hesap',
  'acik hesap',
  'açık cari',
  'acik cari',
  'acik_cari',
  'açık_cari',
]);

function isCancelledStatus(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s !== '' && CANCELLED_STATUSES.has(s);
}

function isCompletedStatus(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return COMPLETED_STATUSES.has(s);
}

function isVeresiyeMethod(method: unknown): boolean {
  const m = String(method ?? '').trim().toLowerCase();
  if (!m) return false;
  if (VERESIYE_METHODS.has(m)) return true;
  return m.includes('veresiye');
}

/**
 * Randevudan Ciro (tahsil edilen nakit).
 * ROZA 09:00 — sadece peşinat 5.000 → ciro = 5.000
 * ARAM 10:00 — sadece peşinat 10.000 → ciro = 10.000
 * ARAM 11:00 — tamamlandı peşinat 35.000 + remainder 0 → ciro = 35.000
 * ? 15:00   — peşinat 20.000 + remainder 0 + veresiye kalan → ciro = 20.000
 */
export function appointmentCollected(apt: AppointmentLike): number {
  if (!apt) return 0;
  if (isCancelledStatus(apt.status)) return 0;

  const paid = num(apt.paid_amount);
  if (Math.abs(paid) > 0.0001) return Math.max(0, paid);

  const total = num(apt.total_price);
  const deposit = num(apt.deposit_amount);
  const remainder = num(apt.remainder_paid_amount);

  if (isCompletedStatus(apt.status)) {
    return Math.min(total || Infinity, Math.max(0, deposit + remainder));
  }
  // pending / scheduled / pre_paid / confirmed — hizmet henüz verilmedi
  return Math.min(total || Infinity, Math.max(0, deposit));
}

/**
 * Sale satırından Ciro (tahsil edilen nakit).
 * Sale tipinde payment_method veresiye ise paid_amount = 0 olur normalde.
 */
export function saleCollected(sale: SaleLike): number {
  if (!sale) return 0;
  if (isCancelledStatus(sale.status) || isCancelledStatus(sale.payment_status)) {
    return 0;
  }
  const paid = num(sale.paid_amount);
  if (Math.abs(paid) > 0.0001) return paid; // negatif = iade (müşteriye para çıkar), pozitif = tahsilat

  const total = num(sale.total_price ?? sale.total);

  // İade fişi: toplam negatif (müşteriye para çıkışı Ciro'yu düşürür).
  if (total < 0) {
    // Veresiye iade zaten Ciro'ya girmemişti; burada -total ile sınırlı.
    if (isVeresiyeMethod(sale.payment_method)) return 0;
    return total; // negatif Ciro (iade düşüşü)
  }

  const deposit = num(sale.deposit_amount);
  const remainder = num(sale.remainder_paid_amount);

  // Veresiye fiş: paid=0 ise tahsil edilen nakit = 0; cari borç olarak takip edilir.
  if (isVeresiyeMethod(sale.payment_method)) {
    return 0;
  }

  const completed = isCompletedStatus(sale.status) || isCompletedStatus(sale.payment_status);

  if (completed) {
    // Tamamlanmış fiş: deposit + remainder tahsilatı; alınmamış kısım
    // paid_amount'a yansımamışsa veresiye kalan sayılır (0 ciro).
    const explicit = deposit + remainder;
    if (explicit > 0.0001) {
      return Math.min(total || Infinity, Math.max(0, explicit));
    }
    // Tamamlanmış, paid=0, deposit=0 → belge total'ı tahsilat kabul et
    // (tek seferde peşin tahsilat senaryosu; DB'de paid_amount null olabilir).
    return Math.max(0, total);
  }
  // Tamamlanmamış: yalnızca peşinat Ciro sayılır.
  return Math.min(total || Infinity, Math.max(0, deposit));
}

/**
 * Aggregation helper — Ciro'yu topla.
 * Liste içindeki Ciro toplamı.
 */
export function sumCollected(rows: Array<{ total?: number | null; total_price?: number | null; deposit_amount?: number | null; remainder_paid_amount?: number | null; paid_amount?: number | null; status?: string | null; payment_status?: string | null; payment_method?: string | null }>): number {
  let total = 0;
  for (const r of rows) total += saleCollected(r);
  return total;
}
