/**
 * Müşteri Yönetimi tablosu — "Bakiye" kolonu için effective balance.
 *
 * 10.10.2026 — Kullanıcı şikâyeti (ROZA):
 * Müşteri Yönetimi tablosunda bakiye -10.000 görünüyordu; ROZA senaryosu:
 *   - 10.000 hizmet + 10.000 avans (REZERVASYON) → peşin kapatıldı
 *   - veya: 50.000 hizmet + 10.000 avans + 40.000 kalan nakit → peşin kapatıldı
 *   - Net bakiye: 0
 *
 * Kök neden: `customers.balance` ledger'dan gelir ve henüz hizmet
 * verilmemiş rezervasyon avansını (CH_TAHSILAT + special_code IN
 * ('REZERVASYON','AVANS')) içermez; avans tahsilatı müşteri
 * alacağını azaltır. Bu yüzden ham `balance` ile ROZA -10.000
 * gösterilir; oysa Cari Hesap Özeti aynı cariyi 0 gösterir.
 *
 * Çözüm: Cari Hesap Özeti ile aynı semantik (3fd0690b recvAvansHariç):
 *   `effectiveBalance = balance + pendingDeposit`
 *
 * Bu pure fonksiyon Müşteri Yönetimi'ndeki "Bakiye" kolonunda
 * kullanılır; aynı zamanda bileşenin dışında da efektif bakiye
 * gerektiğinde (örn. rapor / sıralama / filtre) tek doğruluk kaynağıdır.
 */

export interface CustomerBalanceInput {
  /** `customers.balance` — ledger'dan gelen ham bakiye. */
  balance: number | null | undefined;
  /** Henüz hizmet verilmemiş rezervasyon avansı toplamı. */
  pendingDeposit: number | null | undefined;
}

/**
 * Bakiye (avans hariç) effective balance.
 *
 * - Negatif (borçlu müşteri değil; alacaklı müşteri) ise bakiye müşterinin
 *   bizden alacağı; bu yüzden avansı ekleyince düşer.
 * - Pozitif (borçlu müşteri) ise bakiye müşterinin bize borcu; avans
 *   eklendikçe azalır.
 *
 * Örnek:
 *   { balance: -10000, pendingDeposit: 10000 } → 0 (ROZA peşin kapandı)
 *   { balance: -5000, pendingDeposit: 5000 }   → 0 (ARA peşin kapandı)
 *   { balance: 100, pendingDeposit: 0 }         → 100 (avans yok, etkilenmez)
 *   { balance: -20000, pendingDeposit: 10000 } → -10000 (hizmet verildi,
 *           avans düşüldü; kalan 10.000 alacak)
 */
export function customerEffectiveBalance(input: CustomerBalanceInput): number {
  const balance = Number(input.balance ?? 0) || 0;
  const pending = Number(input.pendingDeposit ?? 0) || 0;
  return balance + pending;
}

/**
 * Ekranda "Bakiye" kolonunda anlamlı bir sayı gösterilip
 * gösterilmeyeceğini kontrol eder. Bakiye mutlak değeri
 * `MIN_BALANCE_DISPLAY` altındaysa "—" gösterilir.
 */
export const MIN_BALANCE_DISPLAY = 0.005;

export function isDisplayableBalance(effectiveBalance: number): boolean {
  return Math.abs(effectiveBalance) >= MIN_BALANCE_DISPLAY;
}