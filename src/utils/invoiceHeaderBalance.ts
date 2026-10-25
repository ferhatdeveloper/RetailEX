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

export type ReservationDepositCashRow = {
  amount?: unknown;
  special_code?: unknown;
  transaction_type?: unknown;
  notes?: unknown;
  definition?: unknown;
};

/**
 * Rezervasyon peşinat tahsilatı. Fatura başlığı, cari ekstre ve cari
 * hesap listesi aynı kimliği kullanır: CH_TAHSILAT ve özel kod
 * REZERVASYON/AVANS, ya da açıklamada "Rezervasyon tahsilatı".
 * Kasa satırının tutarı ve işlem tipi burada değişmez.
 */
export function isReservationDepositCollection(row: ReservationDepositCashRow): boolean {
  const tt = String(row.transaction_type ?? 'CH_TAHSILAT').trim().toUpperCase();
  if (tt !== 'CH_TAHSILAT') return false;
  const absAmt = Math.abs(Number(row.amount) || 0);
  if (!(absAmt > 0)) return false;
  const code = String(row.special_code ?? '').trim().toUpperCase();
  if (code === 'REZERVASYON' || code === 'AVANS') return true;
  const text = `${row.notes ?? ''} ${row.definition ?? ''}`;
  return /rezervasyon\s*tahsilat/i.test(text);
}

/** Rezervasyon peşinat satırlarının tutar toplamı (gösterim). */
export function sumReservationDepositAmounts(rows: ReservationDepositCashRow[]): number {
  let sum = 0;
  for (const row of rows) {
    if (!isReservationDepositCollection(row)) continue;
    const amt = Math.abs(Number(row.amount) || 0);
    if (amt > 0) sum += amt;
  }
  return sum;
}
