/** Cari hesap ekstresi — ortak yardımcılar */

import { splitPaymentRows } from './saleCollectedAmounts';
import { receiptNotesForDisplay } from './receiptNotes';

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

/**
 * Cari bakiye yönü — ABS kullanmadan, cardType simetrisi korunarak.
 * Müşteri/partner: + = borçlu (B), − = alacaklı (A).
 * Tedarikçi: + = alacaklı (A, bizim borcumuz), − = borçlu (B).
 * Personel: + = A, − = B (getCariBalanceDirection ile aynı).
 */
export function resolveCariBalanceSide(
  cardType: ExtCardType,
  balance: number,
): 'B' | 'A' | '' {
  if (!balance || Math.abs(balance) <= 0.009) return '';
  if (cardType === 'supplier') return balance > 0 ? 'A' : 'B';
  if (cardType === 'employee') return balance > 0 ? 'A' : 'B';
  // customer | partner | undefined → müşteri mantığı
  return balance > 0 ? 'B' : 'A';
}

/** Borçlu cariler: bizim alacağımız / onlar borçlu (side B). */
export function isCariDebtorBalance(cardType: ExtCardType, balance: number): boolean {
  return resolveCariBalanceSide(cardType, balance) === 'B';
}

/** Alacaklı cariler: bizim borcumuz / onlar alacaklı (side A). */
export function isCariCreditorBalance(cardType: ExtCardType, balance: number): boolean {
  return resolveCariBalanceSide(cardType, balance) === 'A';
}

/**
 * Borçlu cariler raporu satırı — yalnızca borçlu müşteri (buyer).
 * Partner / personel / tedarikçi (negatif bakiye dahil) bu rapora girmez.
 */
export function isCariDebtorsReportRow(cardType: ExtCardType, balance: number): boolean {
  return cardType === 'customer' && isCariDebtorBalance(cardType, balance);
}

/**
 * Alacaklı cariler raporu satırı — yalnızca alacaklı tedarikçi (seller).
 * Partner / personel / müşteri (kredi bakiyesi dahil) bu rapora girmez.
 */
export function isCariCreditorsReportRow(cardType: ExtCardType, balance: number): boolean {
  return cardType === 'supplier' && isCariCreditorBalance(cardType, balance);
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

export function defaultEkstreDateRange(cardType?: ExtCardType): { start: string; end: string } {
  // Personel: varsayılan yalnızca içinde bulunulan ay (geçmiş maaş/avans satırları karışmasın)
  if (cardType === 'employee') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, '0');
    return {
      start: `${year}-${mm}-01`,
      end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }
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

  if (ft === 'purchase_invoice') return { label: resolve(key!) || 'Alış faturası', color: 'bg-orange-100 text-orange-700', isReturn: false };
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
  if (ft === 'sales_invoice') return { label: resolve(salesKey) || 'Satış faturası', color: 'bg-blue-100 text-blue-700', isReturn: false };
  return { label: resolve(salesKey) || 'Satış', color: 'bg-blue-100 text-blue-700', isReturn: false };
}

const RAW_FICHE_TYPE_KEYS = new Set(
  [
    ...Object.keys(FICHE_TYPE_I18N_KEYS),
    ...Object.keys(FICHE_TYPE_I18N_KEYS).map((k) => k.toLowerCase()),
    'purchase_invoice',
    'sales_invoice',
    'return_invoice',
    'opening_balance',
    'service',
    'hizmet',
    'a',
  ].map((k) => k.toLowerCase()),
);

/** notes / açıklama ham fiche_type anahtarıysa (purchase_invoice) true. */
export function isRawFicheTypeKey(text: unknown): boolean {
  const s = String(text ?? '').trim();
  if (!s) return true;
  return RAW_FICHE_TYPE_KEYS.has(s.toLowerCase());
}

/** Ekstre açıklama: ham `purchase_invoice` yerine çevrilmiş etiket; UUID/teknik id gizlenir. */
export function resolveEkstreDescription(
  notes: unknown,
  ficheType: unknown,
  trcode: number,
  cancelled?: boolean,
  t?: TFunction,
): string {
  const ft = String(ficheType ?? '').trim();
  const info = ficheTypeToInfo(ft, trcode, cancelled, t);
  const n = String(notes ?? '').trim();
  if (!n || isRawFicheTypeKey(n) || n.toLowerCase() === ft.toLowerCase()) {
    return info.label;
  }
  const cleaned = receiptNotesForDisplay(n);
  if (!cleaned || isRawFicheTypeKey(cleaned) || cleaned.toLowerCase() === ft.toLowerCase()) {
    return info.label;
  }
  return cleaned;
}

export type EkstreRow = {
  /** sales tablosundaki PK (UUID). Açılış/devir fişlerini hard-delete için gerekli. */
  invoiceId?: string;
  date?: string;
  fiche_no?: string;
  fiche_type?: string;
  trcode?: number;
  is_cancelled?: boolean;
  notes?: string;
  total_amount?: number | string;
  /** Belge / kasa döviz kodu */
  currency?: string;
  /** Belge→defter kuru (sales.currency_rate / cash_lines.exchange_rate) */
  currency_rate?: number;
  borcAmount: number;
  alacakAmount: number;
  balance: number;
  /** Rezervasyon avansı (henüz hizmet verilmemiş peşinat) — bilgi amaçlı. */
  reservationDeposit?: number;
  /** Rezervasyon avansı mı? (sales.is_deposit=true / notes: parent_sale:) */
  isReservationDeposit?: boolean;
  /** AVANS → FATURA (Basit Model): cari avansı ayrı rozet (yeşil). */
  isAvans?: boolean;
  /** Avans referans no: `AVANS-<uuid-kısa>` */
  avansReferenceNo?: string;
  /** Avans kayıt UUID */
  avansId?: string;
};

/** `payment_status` iptal/iade seti (müşteri/peşin satışlar için). */
const CANCELLED_SALE_STATUSES = new Set([
  'cancelled', 'canceled', 'void', 'refunded', 'iptal', 'silindi', 'deleted',
]);

/**
 * Satır iptal sayılır mı? `is_cancelled=true` veya `status`/`payment_status`
 * iptal setinde ise true. suppliers.ts sorgusu zaten `status NOT IN
 * ('iptal',...)` filtresi uyguluyor; burada savunma amaçlı tekrar kontrol.
 */
function isRowCancelledLike(row: Record<string, unknown>): boolean {
  if (row.is_cancelled === true) return true;
  const st = String(row.status ?? '').trim().toLowerCase();
  const ps = String(row.payment_status ?? '').trim().toLowerCase();
  return CANCELLED_SALE_STATUSES.has(st) || CANCELLED_SALE_STATUSES.has(ps);
}

export function buildEkstreRows(
  data: Array<Record<string, unknown>>,
  cardType: ExtCardType,
): EkstreRow[] {
  const isSupplierAccount = cardType === 'supplier';
  let runningBalance = 0;

  /**
   * Peşin müşteri satışları + aynı tutardaki eşleşen CH_TAHSILAT'ları
   * işaretle: her ikisi de 0/0 + delta=0 yazılır (bakiyeyi şişirmez, borç
   * sütununda "50.000" görünmez). Aksi halde (aynı tutarda ayrı tahsilat
   * satırı) running balance yanlış (−50k) hesaplanır ve Borç sütununda
   * tam tutar görünür — bu Bug 13: cari hareketler detayında peşin
   * hizmette "borç" yazma hatasının kök nedeni.
   */
  const customerCashSaleKeys = new Set<string>();
  for (const row of data) {
    const cancelledLike = isRowCancelledLike(row);
    const ftLower = String(row.fiche_type ?? '').trim().toLowerCase();
    if (cancelledLike) continue;
    if (isSupplierAccount) continue;
    if (ftLower !== 'sales_invoice' && ftLower !== 'service' && ftLower !== 'hizmet') continue;
    const amount = parseFloat(String(row.total_amount ?? 0));
    if (!(amount > 0)) continue;
    const saleSplit = splitPaymentRows(
      amount,
      Array.isArray(row.payments) ? (row.payments as Array<{ method?: string; amount?: number; currency?: string }>) : null,
      row.payment_method,
    );
    if (Math.abs(saleSplit.remaining) > 1e-9) continue;
    const key = `${String(row.fiche_no ?? '').trim()}|${Math.round(Math.abs(amount) * 100) / 100}`;
    if (key) customerCashSaleKeys.add(key);
  }

  return data.map(row => {
    const amount = parseFloat(String(row.total_amount ?? 0));
    const cancelled = row.is_cancelled === true || isRowCancelledLike(row);
    const ficheType = String(row.fiche_type ?? '').trim().toUpperCase();
    const ftLower = String(row.fiche_type ?? '').trim().toLowerCase();
    const typeInfo = ficheTypeToInfo(String(row.fiche_type ?? ''), Number(row.trcode), cancelled);
    const { isReturn, isOpening } = typeInfo as { isReturn: boolean; isOpening?: boolean };
    const saleSplit = splitPaymentRows(
      amount,
      Array.isArray(row.payments) ? (row.payments as Array<{ method?: string; amount?: number; currency?: string }>) : null,
      row.payment_method,
    );
    const absAmt = Math.abs(amount);
    const isCustomerCashSale =
      !isSupplierAccount &&
      !cancelled &&
      (ftLower === 'sales_invoice' || ftLower === 'service' || ftLower === 'hizmet') &&
      Math.abs(saleSplit.remaining) <= 1e-9;
    /**
     * Peşin satışla eşleşen CH_TAHSILAT — aynı tutar + aynı gün, kasa
     * tarafında ayrıca yazılmış tahsilat. Satış borc=0 olduğu için bu
     * tahsilat da nötrlenir (delta=0), aksi halde bakiye −tutar gider.
     * Eşleşme anahtarı: cash_lines.f_amount (defter tutarı) ile aynı.
     */
    const isMatchingCashCollection =
      !cancelled &&
      !isSupplierAccount &&
      ficheType === 'CH_TAHSILAT' &&
      absAmt > 0 &&
      customerCashSaleKeys.has(`${String(row.fiche_no ?? '').trim()}|${Math.round(absAmt * 100) / 100}`);
    // AVANS → FATURA (Basit Model): cari_avans satırı. Müşteri için tahsilat
    // mantığı ile aynı (müşteri bize para verdi → bakiye alacaklanır).
    const isAvansRow = !cancelled && row.is_avans === true && absAmt > 0;
    let delta = 0;
    let borcAmount = 0;
    let alacakAmount = 0;
    if (!cancelled) {
      // Kasa satırları (CH_TAHSILAT / CH_ODEME) ayrı imza ile işlenir —
      // tahsilat müşteri bakiyesini düşürür, ödeme tedarikçi bakiyesini düşürür.
      // "ABS + her zaman +1" kısayolu burada YASAK (muhasebe denetimi).
      if (isMatchingCashCollection) {
        // Peşin satışın yanında ayrıca yazılan eşleşen tahsilat → nötr.
        delta = 0;
        borcAmount = 0;
        alacakAmount = 0;
      } else if (isAvansRow) {
        // Avans: müşteri bize para verdi (alacaklanır → borç B sütununa),
        // supplier ise tersi (bize para verdi → alacak A sütununa).
        delta = cashLineLedgerDelta(amount, 'CH_TAHSILAT', cardType);
        if (delta > 0) {
          borcAmount = absAmt;
        } else if (delta < 0) {
          alacakAmount = absAmt;
        }
      } else if (isSupplierAccount && ficheType === 'CH_ODEME') {
        // Tedarikçi bize peşin ödedi → bizim alacağımız azalır (delta −) → B (borç) sütununa.
        // Müşterinin tersi: müşteri tahsilatı B'ye, supplier ödemesi B'ye yazılır.
        delta = -absAmt;
        borcAmount = absAmt;
      } else if (isSupplierAccount && ficheType === 'CH_TAHSILAT') {
        // Tedarikçi bizden para çekti (nadir ama mümkün) → alacağımız artar (delta +) → A sütununa.
        delta = absAmt;
        alacakAmount = absAmt;
      } else if (ficheType === 'CH_TAHSILAT' || ficheType === 'CH_ODEME') {
        // Müşteri tarafı standart mantık
        delta = cashLineLedgerDelta(amount, ficheType, cardType);
        if (delta > 0) {
          borcAmount = absAmt;
        } else if (delta < 0) {
          alacakAmount = absAmt;
        }
      } else if (isOpening) {
        // Açılış/devir fişi: kullanıcının girdiği yön (borç + / alacak −) korunur.
        delta = amount;
        if (amount > 0) borcAmount = absAmt;
        else if (amount < 0) alacakAmount = absAmt;
      } else if (isCustomerCashSale) {
        // Peşin müşteri satışı: ekstrede borç yazılmaz (zaten tahsil edildi);
        // bakiyeyi şişirmez. Muhasebeci kuralı: çift yön her satırda biri 0,
        // diğeri tutar olmalı — peşin satış 0/0 yazılır.
        delta = 0;
        borcAmount = 0;
        alacakAmount = 0;
      } else if (isSupplierAccount) {
        // Tedarikçi alışı alacak artırır (A, bizim borcumuz), iade alacak azaltır.
        // Müşterinin TERS yönü — cari simetrisi gereği.
        // Borç (B) sütunu = bize peşin ödeme / alacak kaydı.
        delta = isReturn ? -absAmt : absAmt;
        if (isReturn) borcAmount = absAmt;
        else alacakAmount = absAmt;
      } else {
        // Müşteri veresiye satış: borç artar (kalan veresiye olarak).
        // Eğer satır içi `payments` verilmişse kalan = saleSplit.remaining
        // (kısmi peşinat + üst bilgi veresiye senaryoları için doğru).
        const remaining = Math.max(0, Math.abs(saleSplit.remaining));
        const docTotal = absAmt;
        const effective = remaining > 1e-9 ? remaining : docTotal;
        delta = isReturn ? -effective : effective;
        if (isReturn) alacakAmount = effective;
        else borcAmount = effective;
      }
    }
    runningBalance += delta;
    // Rezervasyon avansı (is_deposit=true / notes: parent_sale:) — borç/alacak/bakiye
    // satırını kirletmeden bilgi amaçlı tutarı taşı. Hizmet tamamlanınca ana satışa
    // mahsup edilir; burada yalnızca "Alınan Rezervasyon Tutarı" olarak gösterilir.
    const isReservationDeposit = !cancelled &&
      !isSupplierAccount &&
      (row.is_deposit === true ||
        /parent_sale:|sale_group:/.test(String(row.notes ?? ''))) &&
      absAmt > 0 &&
      (ftLower === 'sales_invoice' || ftLower === 'service' || ftLower === 'hizmet');
    return {
      ...row,
      /** sales tablosundaki PK. Açılış/devir fişlerini hard-delete için gerekli. */
      invoiceId: row.id != null ? String(row.id) : undefined,
      borcAmount,
      alacakAmount,
      balance: runningBalance,
      reservationDeposit: isReservationDeposit ? absAmt : 0,
      isReservationDeposit,
      // AVANS → FATURA (Basit Model): cari avansı ayrı rozet (yeşil). Avans
      // müşteriden tahsil edilen paradır; müşteri bakiyesini alacaklanır;
      // tedarikçi yönünde tersi. Bakiyeyi şişirmemek için yine de borç ya da
      // alacak sütununa yazılır.
      isAvans: row.is_avans === true,
      avansReferenceNo: row.avans_reference_no != null ? String(row.avans_reference_no) : undefined,
      avansId: row.avans_id != null ? String(row.avans_id) : undefined,
    } as EkstreRow;
  });
}
