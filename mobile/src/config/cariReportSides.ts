/**
 * Borçlu / alacaklı rapor satırı.
 * Web `isCariDebtorsReportRow` / `isCariCreditorsReportRow` ile aynı işaret:
 * müşteri + bakiye = borçlu, tedarikçi + bakiye = alacaklı.
 */

export function isDebtorsReportRow(cardType: string, balance: number): boolean {
  return cardType === 'customer' && balance > 0.009;
}

export function isCreditorsReportRow(cardType: string, balance: number): boolean {
  return cardType === 'supplier' && balance > 0.009;
}
