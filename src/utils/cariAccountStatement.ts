/** Cari hesap ekstresi — ortak yardımcılar */

export type ExtCardType = 'customer' | 'supplier' | 'employee' | 'partner' | undefined;

/**
 * Kasa (cash_lines) satırının cari bakiyeye katkısı.
 * - CH_TAHSILAT (müşteriden tahsilat) → müşteri borcu ↓ (−amt), tedarikçi borcu ↑ (+amt).
 * - CH_ODEME (tedarikçiye/müşteriye ödeme) → müşteri alacağı ↑ (+amt), tedarikçi borcu ↓ (−amt).
 *
 * `accountBalance.ts → cariCashLineLedgerContrib` ile uyumlu; ekstre tarafında
 * "ABS + her zaman +1" kısayoluna düşmemek için işareti koruyarak kullanıyoruz.
 */
function cashLineLedgerDelta(
  amount: number,
  transactionType: string | null | undefined,
  cardType: ExtCardType,
): number {
  const tt = String(transactionType || '').trim().toUpperCase();
  if (tt !== 'CH_ODEME' && tt !== 'CH_TAHSILAT') return 0;
  const amt = Math.abs(Number(amount) || 0);
  if (!amt) return 0;
  const isSupplier = cardType === 'supplier';
  if (tt === 'CH_ODEME') return isSupplier ? -amt : amt;
  // CH_TAHSILAT
  return isSupplier ? amt : -amt;
}

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

/**
 * Fiche type etiket çevirisi için i18n key eşlemesi.
 *
 * Her anahtar `module-translations.ts` içinde tanımlı (tr/en/ar/ku).
 * `t` fonksiyonu verilmezse eski hardcoded Türkçe etiketler korunur
 * (geriye uyumluluk — test ve eski kod yolları için).
 *
 * Kullanım (component tarafı):
 *   const tm = useT('invoices', 'common');
 *   const { label, color } = ficheTypeToInfo(ft, trcode, cancelled, tm);
 */
const FICHE_TYPE_I18N_KEYS: Record<string, string> = {
  purchase_invoice: 'ficheTypePurchaseInvoice',
  return_invoice: 'ficheTypeReturnInvoice',
  waybill: 'ficheTypeWaybill',
  order: 'ficheTypeOrder',
  sales_invoice: 'ficheTypeSalesInvoice',
  CH_ODEME: 'ficheTypePaymentOut',
  CH_TAHSILAT: 'ficheTypePaymentIn',
  MAAS_HAKKEDIS: 'ficheTypeSalaryAccrual',
  MAAS_ODEME: 'ficheTypeSalaryPayment',
  AVANS_ODEME: 'ficheTypeAdvancePayment',
  AVANS_MAHSUP: 'ficheTypeAdvanceOffset',
  KAR_DAGITIMI: 'ficheTypeProfitDistribution',
  ORTAK_DAGITIM_KAR: 'ficheTypeProfitDistribution',
  ZARAR_DAGITIMI: 'ficheTypeLossDistribution',
  ORTAK_DAGITIM_ZARAR: 'ficheTypeLossDistribution',
  SERMAYE_TAHSILAT: 'ficheTypeCapitalIn',
  ORTAK_SERMAYE_TAHSILAT: 'ficheTypeCapitalIn',
  ORTAK_PARA_GIRIS: 'ficheTypeCapitalIn',
  SERMAYE_ODEME: 'ficheTypeCapitalOut',
  ORTAK_SERMAYE_ODEME: 'ficheTypeCapitalOut',
  ORTAK_PARA_CIKIS: 'ficheTypeCapitalOut',
  ORTAK_SERMAYE_CIKIS: 'ficheTypeCapitalOut',
  opening_balance: 'ficheTypeOpeningBalance',
  CANCELLED: 'ficheTypeCancelled',
  // trcode 9 = Hizmet
  HIZMET_TRCODE_9: 'ficheTypeService',
};

export type TFunction = (key: string) => string;

export function ficheTypeToInfo(
  ficheType: string,
  trcode: number,
  cancelled?: boolean,
  t?: TFunction,
) {
  // İptal: en başta, çeviri ile
  if (cancelled) {
    const label = t ? t(FICHE_TYPE_I18N_KEYS.CANCELLED) : 'Silindi';
    return { label, color: 'bg-gray-200 text-gray-600 line-through', isReturn: false };
  }
  const ft = String(ficheType || '').trim();
  const ftUpper = ft.toUpperCase();

  // Önce fiche_type anahtarı (büyük/küçük harf duyarsız eşleme için
  // büyütülmüş anahtarı ara)
  const ftKey = FICHE_TYPE_I18N_KEYS[ft];
  const ftUpperKey = FICHE_TYPE_I18N_KEYS[ftUpper];
  const key = ftKey || ftUpperKey;
  const trcodeKey = trcode === 9 ? FICHE_TYPE_I18N_KEYS.HIZMET_TRCODE_9 : undefined;

  const resolve = (k: string): string | null => (t ? (() => { try { return t(k); } catch { return null; } })() : null);

  if (ft === 'purchase_invoice') return { label: resolve(key!) || 'Alış', color: 'bg-orange-100 text-orange-700', isReturn: false };
  if (ft === 'return_invoice') return { label: resolve(key!) || 'İade', color: 'bg-red-100 text-red-700', isReturn: true };
  if (ft === 'waybill') return { label: resolve(key!) || 'İrsaliye', color: 'bg-purple-100 text-purple-700', isReturn: false };
  if (ft === 'order') return { label: resolve(key!) || 'Sipariş', color: 'bg-gray-100 text-gray-600', isReturn: false };
  // Tahsilat/ödeme: müşteri/tedarikçi açık bakiyesini düşürür (asla satış gibi borç yazılmaz)
  if (ftUpper === 'CH_ODEME') return { label: resolve(key!) || 'Ödeme', color: 'bg-green-100 text-green-700', isReturn: true };
  if (ftUpper === 'CH_TAHSILAT') return { label: resolve(key!) || 'Tahsilat', color: 'bg-teal-100 text-teal-700', isReturn: true };
  if (ftUpper === 'MAAS_HAKKEDIS') return { label: resolve(key!) || 'Hakkediş', color: 'bg-indigo-100 text-indigo-700', isReturn: false };
  if (ftUpper === 'MAAS_ODEME') return { label: resolve(key!) || 'Maaş', color: 'bg-emerald-100 text-emerald-700', isReturn: true };
  if (ftUpper === 'AVANS_ODEME') return { label: resolve(key!) || 'Avans', color: 'bg-amber-100 text-amber-700', isReturn: true };
  if (ftUpper === 'AVANS_MAHSUP') return { label: resolve(key!) || 'Mahsup', color: 'bg-slate-100 text-slate-600', isReturn: false };
  if (ftUpper === 'ORTAK_DAGITIM_KAR' || ftUpper === 'KAR_DAGITIMI') return { label: resolve(key!) || 'Kâr Dağıtım', color: 'bg-purple-100 text-purple-700', isReturn: false };
  if (ftUpper === 'ORTAK_DAGITIM_ZARAR' || ftUpper === 'ZARAR_DAGITIMI') return { label: resolve(key!) || 'Zarar Dağıtım', color: 'bg-rose-100 text-rose-700', isReturn: true };
  if (ftUpper === 'SERMAYE_TAHSILAT' || ftUpper === 'ORTAK_SERMAYE_TAHSILAT' || ftUpper === 'ORTAK_PARA_GIRIS') {
    return { label: resolve(key!) || 'Para girişi', color: 'bg-teal-100 text-teal-700', isReturn: false };
  }
  if (ftUpper === 'SERMAYE_ODEME' || ftUpper === 'ORTAK_SERMAYE_ODEME' || ftUpper === 'ORTAK_PARA_CIKIS' || ftUpper === 'ORTAK_SERMAYE_CIKIS') {
    return { label: resolve(key!) || 'Para çıkışı', color: 'bg-amber-100 text-amber-800', isReturn: true };
  }
  if (ft === 'opening_balance') return { label: resolve(key!) || 'Devir', color: 'bg-indigo-100 text-indigo-800', isReturn: false, isOpening: true };
  if (trcode === 9) return { label: resolve(trcodeKey!) || 'Hizmet', color: 'bg-indigo-100 text-indigo-700', isReturn: false };
  // Default (sales_invoice vb.): fiche_type = 'sales_invoice' ise onu kullan, yoksa "Satış"
  const salesKey = FICHE_TYPE_I18N_KEYS.sales_invoice;
  if (ft === 'sales_invoice') return { label: resolve(salesKey) || 'Satış', color: 'bg-blue-100 text-blue-700', isReturn: false };
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
  let runningBalance = 0;

  return data.map(row => {
    const amount = parseFloat(String(row.total_amount ?? 0));
    const cancelled = row.is_cancelled === true;
    const ficheType = String(row.fiche_type ?? '').trim().toUpperCase();
    const typeInfo = ficheTypeToInfo(String(row.fiche_type ?? ''), Number(row.trcode), cancelled);
    const { isReturn, isOpening } = typeInfo as { isReturn: boolean; isOpening?: boolean };
    let delta = 0;
    if (!cancelled) {
      // Kasa satırları (CH_TAHSILAT / CH_ODEME) ayrı imza ile işlenir —
      // tahsilat müşteri bakiyesini düşürür, ödeme tedarikçi bakiyesini düşürür.
      // "ABS + her zaman +1" kısayolu burada YASAK (muhasebe denetimi).
      if (ficheType === 'CH_TAHSILAT' || ficheType === 'CH_ODEME') {
        delta = cashLineLedgerDelta(amount, ficheType, cardType);
      } else if (isOpening) {
        // Açılış/devir fişi: kullanıcının girdiği yön (borç + / alacak −) korunur.
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
    // Kasa satırlarında işaret cari türüne göre doğru sütuna yazılır:
    //   müşteri CH_TAHSILAT → alacak (−delta); tedarikçi CH_ODEME → alacak (−delta).
    const isCashLine = ficheType === 'CH_TAHSILAT' || ficheType === 'CH_ODEME';
    let isBorcEntry: boolean;
    if (cancelled) {
      isBorcEntry = false;
    } else if (isOpening) {
      isBorcEntry = amount > 0;
    } else if (isCashLine) {
      // Kasa satırı: işaret cari türüyle tutarlı → müşteri CH_TAHSILAT alacak,
      // tedarikçi CH_ODEME alacak; tersi borç sütununda.
      isBorcEntry = delta > 0;
    } else {
      isBorcEntry = !isReturn;
    }
    return {
      ...row,
      borcAmount: cancelled ? 0 : (isBorcEntry ? absAmt : 0),
      alacakAmount: cancelled ? 0 : (isBorcEntry ? 0 : absAmt),
      balance: runningBalance,
    } as EkstreRow;
  });
}
