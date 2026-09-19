/** writeCashRegisterLine düz INSERT vs createKasaIslemi — ikincisi cari kartı da günceller. */
export type InvoiceCashLineWriter = 'direct' | 'createKasaIslemi';

/** Direkt cash_lines INSERT customers.balance dokunmaz; createKasaIslemi dokunur. */
export function invoiceCashLineInsertUpdatesStoredCari(
  writer: InvoiceCashLineWriter = 'direct',
): boolean {
  return writer === 'createKasaIslemi';
}

/**
 * Karma fatura formu: CH_TAHSILAT satırından sonra saklanan cariyi bir kez düş.
 * cash_lines INSERT zaten cariyi güncellediyse (createKasaIslemi) tekrar uygulama — çift kayıt.
 */
export function shouldApplyChTahsilatCustomerBalanceAfterCashInsert(
  writer: InvoiceCashLineWriter = 'direct',
): boolean {
  return !invoiceCashLineInsertUpdatesStoredCari(writer);
}

/** Müşteri CH_TAHSILAT: açık borç azalır (−ABS). accountBalance.cariCashStoredBalanceDelta ile aynı. */
export function invoiceChTahsilatStoredDelta(amount: number): number {
  const prepaid = Math.abs(Number(amount) || 0);
  return prepaid ? -prepaid : 0;
}

/** Karma satış: belge borcu + tek CH_TAHSILAT (çift düşüş yok). */
export function invoiceMixedCustomerStoredDelta(
  documentAmount: number,
  prepaidTahsilatAmount: number,
  writer: InvoiceCashLineWriter = 'direct',
): number {
  const debt = Math.abs(Number(documentAmount) || 0);
  const tahsilatOnce = invoiceChTahsilatStoredDelta(prepaidTahsilatAmount);
  const fromInsert = invoiceCashLineInsertUpdatesStoredCari(writer) ? tahsilatOnce : 0;
  const fromApply = shouldApplyChTahsilatCustomerBalanceAfterCashInsert(writer) ? tahsilatOnce : 0;
  return debt + fromInsert + fromApply;
}
