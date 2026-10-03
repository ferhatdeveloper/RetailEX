/**
 * Kasa bakiyesi hesaplama yardımcıları.
 *
 * Arka plan: `cash_registers.balance` snapshot alanı yalnızca `fn_auto_cash_line_on_sale`
 * ile gelen KASA_GIRIS kayıtlarında güncelleniyor. Manuel çıkışlar (GIDER_PUSULASI,
 * MAAS_ODEME, CH_ODEME, ORTAK_SERMAYE_ODEME, AVANS_ODEME vb.) yansımıyor — büyük
 * rapor sapmalarına yol açıyor.
 *
 * Gerçek kasa bakiyesi her zaman `cash_lines` üzerinden,
 *   bakiye = Σ |tutar| × sign(islem_tipi)
 * formülüyle hesaplanmalıdır.
 */

import { computeKasaIslemiSign, type KasaIslemi } from '../services/api/kasa';

/**
 * Kasa bakiyesini cash_lines üzerinden hesaplar (snapshot değil).
 * `tutar` mutlak değerdir; işaret `computeKasaIslemiSign` ile türetilir.
 *
 * @param cashLines - cash_lines satırları (KasaIslemi[] — fetchKasaIslemleri çıktısı)
 * @returns toplam bakiye (negatif olabilir)
 */
export function computeCashBalance(cashLines: ReadonlyArray<KasaIslemi>): number {
  if (!Array.isArray(cashLines) || cashLines.length === 0) return 0;
  let total = 0;
  for (const cl of cashLines) {
    const amt = Math.abs(Number(cl?.tutar) || 0);
    if (!amt) continue;
    total += amt * computeKasaIslemiSign(cl.islem_tipi);
  }
  return total;
}

/**
 * Tek bir kasa için bakiye — yalnızca `kasa_id` eşleşen satırları toplar.
 * Birden fazla kasa tanımlıysa (merkez + alt kasalar) her birinin gerçek
 * bakiyesini ayrı ayrı döndürür; snapshot `k.bakiye` alanı yerine kullanılır.
 *
 * @param registerId - Kasa UUID
 * @param cashLines - cash_lines satırları
 * @returns söz konusu kasa için bakiye
 */
export function computeCashBalanceForRegister(
  registerId: string | null | undefined,
  cashLines: ReadonlyArray<KasaIslemi>,
): number {
  if (!registerId) return 0;
  if (!Array.isArray(cashLines) || cashLines.length === 0) return 0;
  let total = 0;
  for (const cl of cashLines) {
    if (String(cl?.kasa_id || '') !== String(registerId)) continue;
    const amt = Math.abs(Number(cl?.tutar) || 0);
    if (!amt) continue;
    total += amt * computeKasaIslemiSign(cl.islem_tipi);
  }
  return total;
}