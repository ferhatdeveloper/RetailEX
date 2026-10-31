/**
 * Gider pusulası fiş numarası.
 * Belge no ayrıdır. Numara kasa tutarını, işareti ve kuru değiştirmez.
 */

export const EXPENSE_FICHE_WIDTH = 6;

export const EXPENSE_ENTRY_CASH_LABEL = 'Kasa';

/** Giriş formu sırası. Fiş no ve tarih en üstte, yan yana. */
export const EXPENSE_ENTRY_FIELD_ORDER = [
  'ficheNo',
  'date',
  'category',
  'description',
  'documentNo',
  'cashRegister',
  'amount',
  'paymentMethod',
  'notes',
  'attachment',
] as const;

export type ExpenseEntryField = (typeof EXPENSE_ENTRY_FIELD_ORDER)[number];

export function expenseEntryDocumentAndCashBeforeAmount(
  order: readonly string[] = EXPENSE_ENTRY_FIELD_ORDER,
): boolean {
  const at = (key: string) => order.indexOf(key);
  const documentNo = at('documentNo');
  const cashRegister = at('cashRegister');
  const amount = at('amount');
  const paymentMethod = at('paymentMethod');
  return (
    documentNo >= 0
    && cashRegister >= 0
    && amount >= 0
    && paymentMethod >= 0
    && documentNo < amount
    && cashRegister < amount
    && documentNo < paymentMethod
    && cashRegister < paymentMethod
    && EXPENSE_ENTRY_CASH_LABEL === 'Kasa'
  );
}

export function formatExpenseFicheNo(serial: number): string {
  const n = Math.floor(Math.abs(Number(serial) || 0));
  return String(n).padStart(EXPENSE_FICHE_WIDTH, '0');
}

/** Yalnızca pozitif tam sayı fiş sırası. Metin belge no sayılmaz. */
export function expenseFicheSerial(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function formatStoredExpenseFiche(value: unknown): string {
  const serial = expenseFicheSerial(value);
  return serial == null ? '' : formatExpenseFicheNo(serial);
}

/**
 * Firma gider fişlerinin sonraki numarası.
 * Kayıt yoksa 000001. Dolu sıra varsa max+1. Numarasız eski satırlar yeniden numaralanmaz.
 */
export function nextExpenseFicheNo(existing: readonly unknown[]): string {
  let max = 0;
  for (const item of existing) {
    const raw = item != null && typeof item === 'object' && 'fiche_no' in (item as object)
      ? (item as { fiche_no?: unknown }).fiche_no
      : item;
    const serial = expenseFicheSerial(raw);
    if (serial != null && serial > max) max = serial;
  }
  return formatExpenseFicheNo(max + 1);
}

export function formatCashRegisterLabel(code?: string | null, name?: string | null): string {
  const tillCode = String(code ?? '').trim();
  const tillName = String(name ?? '').trim();
  if (tillCode && tillName) return `${tillCode} - ${tillName}`;
  return tillCode || tillName || '';
}

/**
 * Gider tablosundaki fiş no çakışması.
 * Kasa satırı çakışması burada değildir; ikinci kasa satırı açılmaz.
 */
export function isExpenseFicheConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const named = error as { name?: string; expenseSaved?: boolean; message?: string; code?: string };
  if (named.name === 'ExpenseSaveError' || named.expenseSaved === true) return false;
  const lower = String(named.message || '').toLowerCase();
  if (lower.includes('cash_line') || lower.includes('cash_lines')) return false;
  if (!lower.includes('expenses_fiche_no')) return false;
  const code = String(named.code || '');
  return code === '23505' || lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505');
}
