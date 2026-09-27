/** POS / güzellik satış faturalarında raporlara dahil edilecek durumlar. */
export const COUNTABLE_SALE_INVOICE_STATUSES = ['completed', 'approved'] as const;

/** Soft-delete / iptal sonrası `sales.status` değerleri (küçük harf). */
export const REMOVED_SALE_STATUSES = [
  'iptal',
  'silindi',
  'cancelled',
  'canceled',
  'deleted',
  'refunded',
] as const;

/** Alias'lı sales satırı için SQL parçası (ör. `s.status`). */
export const SQL_COUNTABLE_SALE_STATUS = `COALESCE(s.status, 'approved') IN ('completed', 'approved')`;

/** Alias'sız sales tablosu için SQL parçası. */
export const SQL_COUNTABLE_SALE_STATUS_PLAIN = `COALESCE(status, 'approved') IN ('completed', 'approved')`;

/**
 * Soft-delete edilmiş faturaları hariç tut (InvoicesAPI.delete → is_cancelled + status Silindi).
 * Fiş Listesi / Hareket Dökümü / malzeme ekstre ile aynı kural.
 */
export function sqlSaleNotCancelled(alias = 's'): string {
  const a = String(alias || 's').trim() || 's';
  const statusList = REMOVED_SALE_STATUSES.map((s) => `'${s}'`).join(', ');
  return (
    `COALESCE(${a}.is_cancelled, false) = false` +
    ` AND LOWER(TRIM(COALESCE(${a}.status, ''))) NOT IN (${statusList})`
  );
}

/** İstemci tarafı: soft-delete / iptal satırı mı? */
export function isRemovedSaleRow(row: {
  is_cancelled?: boolean | string | null;
  status?: string | null;
}): boolean {
  if (row.is_cancelled === true || row.is_cancelled === 'true') return true;
  const st = String(row.status ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  return (REMOVED_SALE_STATUSES as readonly string[]).includes(st);
}
