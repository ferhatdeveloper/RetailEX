/** POS / güzellik satış faturalarında raporlara dahil edilecek durumlar. */
export const COUNTABLE_SALE_INVOICE_STATUSES = ['completed', 'approved'] as const;

/** Alias'lı sales satırı için SQL parçası (ör. `s.status`). */
export const SQL_COUNTABLE_SALE_STATUS = `COALESCE(s.status, 'approved') IN ('completed', 'approved')`;

/** Alias'sız sales tablosu için SQL parçası. */
export const SQL_COUNTABLE_SALE_STATUS_PLAIN = `COALESCE(status, 'approved') IN ('completed', 'approved')`;
