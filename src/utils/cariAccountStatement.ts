/** Cari hesap ekstresi — ortak yardımcılar */

export type ExtCardType = 'customer' | 'supplier' | 'employee' | 'partner' | undefined;

export function preferIntegerAmountDisplay(code: string): boolean {
  const c = (code || '').trim().toUpperCase();
  return c === 'IQD' || c === 'JPY' || c === 'VND' || c === 'KHR' || c === 'UZS';
}

export function getCariBalanceDirection(
  cardType: ExtCardType,
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

  if (cardType === 'employee') {
    if (balance > 0) {
      return {
        side: 'A',
        sideLabel: tm('party.employee.balanceLabel'),
        hint: tm('party.employee.balanceHintAvans'),
      };
    }
    return {
      side: 'B',
      sideLabel: tm('party.employee.balanceLabelAdvance'),
      hint: tm('party.employee.balanceHintAdvance'),
    };
  }

  if (cardType === 'partner') {
    const side: 'B' | 'A' = balance > 0 ? 'B' : 'A';
    const sideLabel = balance > 0 ? tm('party.partner.balanceLabel') : tm('party.partner.balanceLabelNegative');
    return {
      side,
      sideLabel,
      hint: balance > 0 ? tm('party.partner.balanceHintReceivable') : tm('party.partner.balanceHintPayable'),
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
  if (ftUpper === 'MAAS_HAKKEDIS') return { label: 'Hakkediş', color: 'bg-indigo-100 text-indigo-700', isReturn: false };
  if (ftUpper === 'MAAS_ODEME') return { label: 'Maaş', color: 'bg-emerald-100 text-emerald-700', isReturn: true };
  if (ftUpper === 'AVANS_ODEME') return { label: 'Avans', color: 'bg-amber-100 text-amber-700', isReturn: true };
  if (ftUpper === 'AVANS_MAHSUP') return { label: 'Mahsup', color: 'bg-slate-100 text-slate-600', isReturn: false };
  if (ftUpper === 'ORTAK_DAGITIM_KAR' || ftUpper === 'KAR_DAGITIMI') return { label: 'Kâr Dağıtım', color: 'bg-purple-100 text-purple-700', isReturn: false };
  if (ftUpper === 'ORTAK_DAGITIM_ZARAR' || ftUpper === 'ZARAR_DAGITIMI') return { label: 'Zarar Dağıtım', color: 'bg-rose-100 text-rose-700', isReturn: true };
  if (ftUpper === 'SERMAYE_TAHSILAT' || ftUpper === 'ORTAK_SERMAYE_TAHSILAT' || ftUpper === 'ORTAK_PARA_GIRIS') {
    return { label: 'Para girişi', color: 'bg-teal-100 text-teal-700', isReturn: false };
  }
  if (ftUpper === 'SERMAYE_ODEME' || ftUpper === 'ORTAK_SERMAYE_ODEME' || ftUpper === 'ORTAK_PARA_CIKIS' || ftUpper === 'ORTAK_SERMAYE_CIKIS') {
    return { label: 'Para çıkışı', color: 'bg-amber-100 text-amber-800', isReturn: true };
  }
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
  cardType: ExtCardType,
): EkstreRow[] {
  const isSupplierAccount = cardType === 'supplier';
  const isEmployeeAccount = cardType === 'employee';
  const isPartnerAccount = cardType === 'partner';
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
    // Personel/Ortağı: working'de amount her zaman + (zaten yön ayarlı);
    // borc/alacak sütunları için normal müşteri/tedarikçi mantığı kullanılır.
    // Tedarikçi alışı borç artırır (Debit), ödeme/iade borç azaltır (Credit) — müşteriyle aynı mantık.
    const isBorcEntry = isOpening ? amount > 0 : !isReturn;
    return {
      ...row,
      borcAmount: cancelled ? 0 : (isBorcEntry ? absAmt : 0),
      alacakAmount: cancelled ? 0 : (isBorcEntry ? 0 : absAmt),
      balance: runningBalance,
    } as EkstreRow;
  });
}
