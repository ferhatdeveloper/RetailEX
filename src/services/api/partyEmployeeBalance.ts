/**
 * Personel cari bakiyesi — tek işaret kaynağı.
 *
 * Pozitif bakiye = işletmenin personele ödenmemiş maaş borcu (hakkediş − ödemeler).
 * Negatif bakiye = hakkedişi aşan avans / ödeme (personel borçlu).
 *
 *   MAAS_HAKKEDIS : +tutar  (ay başı hakkediş, kasa yok)
 *   MAAS_ODEME    : −tutar  (kasa çıkışı)
 *   AVANS_ODEME   : −tutar  (kasa çıkışı)
 *   AVANS_MAHSUP  :  0      (belge; avans zaten bakiyeyi düşürdü)
 */

export function employeeLedgerBalanceDelta(transactionType: string, amount: number): number {
  const amt = Math.abs(parseFloat(String(amount ?? 0)) || 0);
  if (!amt) return 0;
  switch (String(transactionType || '').toUpperCase().trim()) {
    case 'MAAS_HAKKEDIS':
      return amt;
    case 'MAAS_ODEME':
    case 'AVANS_ODEME':
      return -amt;
    case 'AVANS_MAHSUP':
      return 0;
    default:
      return 0;
  }
}

/** Ekstre sütunları: hakkediş → Alacak, ödeme/avans → Borç. */
export function employeeStatementSides(
  transactionType: string,
  amount: number,
): { debit: number; credit: number } {
  const amt = Math.abs(parseFloat(String(amount ?? 0)) || 0);
  const t = String(transactionType || '').toUpperCase().trim();
  if (t === 'MAAS_HAKKEDIS') return { debit: 0, credit: amt };
  if (t === 'MAAS_ODEME' || t === 'AVANS_ODEME') return { debit: amt, credit: 0 };
  return { debit: 0, credit: 0 };
}

export function currentPayrollMonthRange(now = new Date()): {
  year: number;
  month: number;
  monthStart: string;
  nextMonthStart: string;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(year, month, 1);
  const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { year, month, monthStart, nextMonthStart };
}
