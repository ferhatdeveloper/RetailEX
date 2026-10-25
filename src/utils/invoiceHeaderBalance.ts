/**
 * Fatura başlığındaki cari bakiye — yalnız gösterim.
 *
 * Defter, rezervasyon tahsilatını (CH_TAHSILAT + REZERVASYON/AVANS) müşteri
 * alacağı gibi eksi bakiyeye yazar. Peşinat müşterinin alacağı değildir ve
 * açık cariye ikinci kez eklenmez. Ekranda eksi rezervasyon bakiyesi
 * sıfıra çekilir; gerçek borç tutarı büyütülmez. Kasa ve defter satırı
 * bu fonksiyonda değişmez.
 */
export function invoiceHeaderBalanceForDisplay(
  ledgerBalance: number | null | undefined,
  reservationDeposit: number | null | undefined,
): number {
  const balRaw = Number(ledgerBalance ?? 0);
  const bal = Number.isFinite(balRaw) ? balRaw : 0;
  const resRaw = Number(reservationDeposit ?? 0);
  const reservation = Number.isFinite(resRaw) ? Math.max(0, resRaw) : 0;
  if (bal >= 0 || reservation <= 0) return bal;
  const lifted = bal + reservation;
  return lifted > 0 ? 0 : lifted;
}

/** Rezervasyon peşinat satırlarının tutar toplamı (gösterim). */
export function sumReservationDepositAmounts(
  rows: Array<{ amount?: unknown; special_code?: unknown; transaction_type?: unknown }>,
): number {
  let sum = 0;
  for (const row of rows) {
    const code = String(row.special_code ?? '').trim().toUpperCase();
    if (code !== 'REZERVASYON' && code !== 'AVANS') continue;
    const tt = String(row.transaction_type ?? 'CH_TAHSILAT').trim().toUpperCase();
    if (tt !== 'CH_TAHSILAT') continue;
    const amt = Math.abs(Number(row.amount) || 0);
    if (amt > 0) sum += amt;
  }
  return sum;
}
