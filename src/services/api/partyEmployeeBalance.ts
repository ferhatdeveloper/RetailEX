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

/** YYYY-MM-DD (veya ISO timestamp) → gün kısmı; geçersizse null. */
export function normalizeHireDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const day = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}

/** Alias — hire / termination aynı normalizasyon. */
export const normalizeIsoDate = normalizeHireDate;

/**
 * Hakkediş ayı, işe giriş tarihinden önce mi?
 * Örn. hire=2026-09-01 → 2026-08 hakkedişi yazılmaz; 2026-09 yazılır.
 */
export function isPayrollMonthBeforeHire(
  monthStart: string,
  nextMonthStart: string,
  hireDate: unknown,
): boolean {
  const hire = normalizeHireDate(hireDate);
  if (!hire) return false;
  // Ay tamamen işe girişten önce bitiyorsa (nextMonthStart <= hire) atla
  return nextMonthStart <= hire;
}

/**
 * Hakkediş ayı, işten çıkıştan tamamen sonra mı?
 * Örn. termination=2026-09-11 → 2026-10 hakkedişi yazılmaz; 2026-09 yazılabilir (oranlı).
 */
export function isPayrollMonthAfterTermination(
  monthStart: string,
  terminationDate: unknown,
): boolean {
  const term = normalizeIsoDate(terminationDate);
  if (!term) return false;
  return monthStart > term;
}

/** Ay içindeki gün sayısı (YYYY-MM-DD ay başı). */
export function daysInPayrollMonth(monthStart: string): number {
  const y = parseInt(monthStart.slice(0, 4), 10);
  const m = parseInt(monthStart.slice(5, 7), 10);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * İşe giriş / çıkışa göre ay içi çalışılan gün (dahil).
 * termination yoksa ay sonuna kadar; hire yoksa ay başından.
 */
export function payrollWorkedDaysInMonth(
  monthStart: string,
  nextMonthStart: string,
  hireDate: unknown,
  terminationDate: unknown,
): number {
  const dim = daysInPayrollMonth(monthStart);
  const lastDay = `${monthStart.slice(0, 8)}${String(dim).padStart(2, '0')}`;
  const hire = normalizeIsoDate(hireDate);
  const term = normalizeIsoDate(terminationDate);
  let from = monthStart;
  let to = lastDay;
  if (hire && hire > from) from = hire;
  if (term && term < to) to = term;
  if (to < from) return 0;
  if (isPayrollMonthAfterTermination(monthStart, term)) return 0;
  if (isPayrollMonthBeforeHire(monthStart, nextMonthStart, hire)) return 0;
  const t0 = Date.parse(`${from}T12:00:00Z`);
  const t1 = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return dim;
  return Math.floor((t1 - t0) / 86400000) + 1;
}

/** Tam maaş × (çalışılan gün / ay günü); IQD için tam sayıya yuvarla. */
export function prorateSalaryForMonth(
  salaryBase: number,
  monthStart: string,
  nextMonthStart: string,
  hireDate: unknown,
  terminationDate: unknown,
): number {
  const base = Math.abs(Number(salaryBase) || 0);
  if (!base) return 0;
  const dim = daysInPayrollMonth(monthStart);
  const worked = payrollWorkedDaysInMonth(monthStart, nextMonthStart, hireDate, terminationDate);
  if (worked <= 0) return 0;
  if (worked >= dim) return Math.round(base);
  return Math.round((base * worked) / dim);
}
