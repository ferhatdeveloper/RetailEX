/** Cari hesap ekstresi — ortak yardımcılar */

export function preferIntegerAmountDisplay(code: string): boolean {
  const c = (code || '').trim().toUpperCase();
  return c === 'IQD' || c === 'JPY' || c === 'VND' || c === 'KHR' || c === 'UZS';
}

export function getCariBalanceDirection(
  cardType: 'customer' | 'supplier' | undefined,
  balance: number,
  tm: (key: string) => string,
): { side: 'B' | 'A' | ''; sideLabel: string; hint: string } {
  if (!balance) return { side: '', sideLabel: '', hint: '' };

  if (cardType === 'supplier') {
    const side: 'B' | 'A' = balance > 0 ? 'A' : 'B';
    const sideLabel = balance > 0 ? tm('balanceSideCreditor') : tm('balanceSideDebtor');
    return {
      side,
      sideLabel,
      hint: balance > 0 ? tm('balanceHintSupplierPayable') : tm('balanceHintSupplierReceivable'),
    };
  }

  const side: 'B' | 'A' = balance > 0 ? 'B' : 'A';
  const sideLabel = balance > 0 ? tm('balanceSideDebtor') : tm('balanceSideCreditor');
  return {
    side,
    sideLabel,
    hint: balance > 0 ? tm('balanceHintCustomerReceivable') : tm('balanceHintCustomerPayable'),
  };
}

export function defaultEkstreDateRange(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function ficheTypeToInfo(ficheType: string, trcode: number, cancelled?: boolean) {
  if (cancelled) return { label: 'Silindi', color: 'bg-gray-200 text-gray-600 line-through', isReturn: false };
  const ft = String(ficheType || '').trim();
  const ftUpper = ft.toUpperCase();
  if (ft === 'purchase_invoice') return { label: 'Alış', color: 'bg-orange-100 text-orange-700', isReturn: false };
  if (ft === 'return_invoice') return { label: 'İade', color: 'bg-red-100 text-red-700', isReturn: true };
  if (ft === 'waybill') return { label: 'İrsaliye', color: 'bg-purple-100 text-purple-700', isReturn: false };
  if (ft === 'order') return { label: 'Sipariş', color: 'bg-gray-100 text-gray-600', isReturn: false };
  // Tahsilat/ödeme: müşteri/tedarikçi açık bakiyesini düşürür (asla satış gibi borç yazılmaz)
  if (ftUpper === 'CH_ODEME') return { label: 'Ödeme', color: 'bg-green-100 text-green-700', isReturn: true };
  if (ftUpper === 'CH_TAHSILAT') return { label: 'Tahsilat', color: 'bg-teal-100 text-teal-700', isReturn: true };
  if (ft === 'opening_balance') return { label: 'Devir', color: 'bg-indigo-100 text-indigo-800', isReturn: false, isOpening: true };
  if (trcode === 9) return { label: 'Hizmet', color: 'bg-indigo-100 text-indigo-700', isReturn: false };
  return { label: 'Satış', color: 'bg-blue-100 text-blue-700', isReturn: false };
}

export type EkstreRow = {
  date?: string;
  fiche_no?: string;
  fiche_type?: string;
  trcode?: number;
  is_cancelled?: boolean;
  notes?: string;
  total_amount?: number | string;
  borcAmount: number;
  alacakAmount: number;
  balance: number;
};

export function buildEkstreRows(
  data: Array<Record<string, unknown>>,
  cardType: 'customer' | 'supplier' | undefined,
): EkstreRow[] {
  const isSupplierAccount = cardType === 'supplier';
  let runningBalance = 0;

  return data.map(row => {
    const amount = parseFloat(String(row.total_amount ?? 0));
    const cancelled = row.is_cancelled === true;
    const typeInfo = ficheTypeToInfo(String(row.fiche_type ?? ''), Number(row.trcode), cancelled);
    const { isReturn, isOpening } = typeInfo as { isReturn: boolean; isOpening?: boolean };
    let delta = 0;
    if (!cancelled) {
      if (isOpening) {
        delta = amount;
      } else if (isSupplierAccount) {
        delta = isReturn ? -Math.abs(amount) : Math.abs(amount);
      } else {
        delta = isReturn ? -Math.abs(amount) : Math.abs(amount);
      }
    }
    runningBalance += delta;
    const absAmt = Math.abs(amount);
    const isBorcEntry = isOpening ? amount > 0 : isSupplierAccount ? isReturn : !isReturn;
    return {
      ...row,
      borcAmount: cancelled ? 0 : (isBorcEntry ? absAmt : 0),
      alacakAmount: cancelled ? 0 : (isBorcEntry ? 0 : absAmt),
      balance: runningBalance,
    } as EkstreRow;
  });
}
