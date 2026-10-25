/**
 * Günlük rapor Satış Detayları — Ödeme kolonu, avans satırı.
 *
 * Eski hücre: "Rezervasyon Tutarı (5.000 IQD)" / "Reservation Amount (5.000 IQD)".
 * Yeni hücre: yalnızca etiket. Parantez ve içindeki tutar eklenmez.
 * Net kolon, dip toplam ve kart formülleri bu metne bağlı değildir.
 */

/** Açık veya iptal avans satırının ödeme rozeti. Tutar eklemez. */
export function dailyAvansPaymentLabel(label: string | undefined | null): string {
  const text = String(label ?? '').trim();
  return text || 'Rezervasyon Tutarı';
}
