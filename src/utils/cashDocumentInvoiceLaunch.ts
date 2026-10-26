/**
 * Kasa İşlem Oluştur → satış / alış faturası.
 * Mevcut fişe tahsilat diyaloğu açılmaz. Tam fatura formu açılır.
 * Nakit veya kart, menüde seçilen kasaya yazılır. Açık cari kasaya yazılmaz.
 * Kayıtlı nakit fatura kasa satırı da aynı forma, fiş numarasıyla döner.
 */

import {
  paymentMethodImpliesCashRegisterOnInvoice,
  paymentMethodImpliesPaidNow,
} from './paymentMethodUtils';

export type CashDocumentMenuType = 'SATIS_FATURASI' | 'ALIS_FATURASI';

export interface CashDocumentInvoiceLaunch {
  screen: 'salesinvoice' | 'purchaseinvoice';
  posSalesReturn: {
    editData: Record<string, unknown>;
    openForm: true;
    /** Doluysa kayıtlı fiş açılır. Boşsa yeni belge taslağıdır. */
    openFicheNo?: string;
  };
}

export interface KasaPinnedRegister {
  id: string;
  code: string;
  name: string;
}

export interface KasaPinnedPaymentRow {
  method: string;
  cashRegisterId: string | null;
  cashRegisterName?: string | null;
  cashRegisterCode?: string | null;
}

export function isCashDocumentMenuType(type: string | null | undefined): type is CashDocumentMenuType {
  return type === 'SATIS_FATURASI' || type === 'ALIS_FATURASI';
}

/** Hizmet faturası mevcut fiş tahsilatında kalır. Satış ve alış yeni belge açar. */
export function cashMenuOpensExistingInvoiceSlip(type: string | null | undefined): boolean {
  return String(type || '').trim() === 'HIZMET_FATURASI';
}

export function buildCashDocumentInvoiceLaunch(input: {
  type: CashDocumentMenuType;
  registerId: string;
  registerCode?: string | null;
  registerName?: string | null;
}): CashDocumentInvoiceLaunch {
  const purchase = input.type === 'ALIS_FATURASI';
  const trcode = purchase ? 1 : 8;
  return {
    screen: purchase ? 'purchaseinvoice' : 'salesinvoice',
    posSalesReturn: {
      openForm: true,
      editData: {
        payment_method: 'NAKIT',
        cash_register_id: String(input.registerId || '').trim(),
        cash_register_code: String(input.registerCode || '').trim(),
        cash_register_name: String(input.registerName || '').trim(),
        trcode,
        invoice_type: trcode,
        source: 'kasa',
      },
    },
  };
}

export function readKasaPinnedRegister(editData: unknown): KasaPinnedRegister | null {
  if (!editData || typeof editData !== 'object') return null;
  const row = editData as Record<string, unknown>;
  if (String(row.source || '') !== 'kasa') return null;
  const id = String(row.cash_register_id || '').trim();
  if (!id) return null;
  return {
    id,
    code: String(row.cash_register_code || '').trim(),
    name: String(row.cash_register_name || '').trim(),
  };
}

/**
 * Kasa menüsünden açılan faturada nakit/kart satırı seçilen kasada kalır.
 * Açık cari satırının kasa kimliği boşalır. Başka kaynaktan gelen faturaya dokunulmaz.
 */
export function applyKasaPinToPayment<T extends KasaPinnedPaymentRow>(input: {
  editData: unknown;
  paymentMethod: unknown;
  rows: T[];
}): {
  pinned: boolean;
  registerId: string;
  registerName: string;
  registerCode: string;
  rows: T[];
} {
  const pin = readKasaPinnedRegister(input.editData);
  if (!pin) {
    return {
      pinned: false,
      registerId: '',
      registerName: '',
      registerCode: '',
      rows: input.rows,
    };
  }
  const headerCash = paymentMethodImpliesCashRegisterOnInvoice(input.paymentMethod);
  const rows = input.rows.map((row) => {
    if (paymentMethodImpliesPaidNow(row.method)) {
      return {
        ...row,
        cashRegisterId: pin.id,
        cashRegisterName: pin.name || null,
        cashRegisterCode: pin.code || null,
      };
    }
    return {
      ...row,
      cashRegisterId: null,
      cashRegisterName: null,
      cashRegisterCode: null,
    };
  });
  return {
    pinned: true,
    registerId: headerCash ? pin.id : '',
    registerName: headerCash ? pin.name : '',
    registerCode: headerCash ? pin.code : '',
    rows,
  };
}

/**
 * Fatura listesinin kasa / iade ön doldurmasından hangi trcode ile form açılacağı.
 * Satış iade 3, alış iade 6, satış 8, alış 1. Eşleşmezse form açılmaz.
 */
export function cashPrefillInvoiceCode(input: {
  defaultInvoiceTypeFilter?: string | null;
  defaultCategory?: string | null;
  prefill?: {
    editData?: Record<string, unknown> | null;
    openForm?: boolean;
    openFicheNo?: string | null;
  } | null;
}): number | null {
  const ext = input.prefill;
  if (!ext || ext.openForm === false) return null;
  const fiche = String(ext.openFicheNo || '').trim();
  if (!ext.editData && !fiche) return null;

  const filter = String(input.defaultInvoiceTypeFilter ?? '');
  const filterCode = filter === '6' ? 6 : filter === '3' ? 3 : 0;
  const hintedRaw = Number(ext.editData?.trcode ?? ext.editData?.invoice_type ?? 0);
  if (filterCode === 3 || filterCode === 6) {
    const hinted = hintedRaw || filterCode;
    if (hinted !== filterCode) return null;
    return filterCode;
  }

  if (String(ext.editData?.source || '') !== 'kasa') return null;
  if (hintedRaw !== 8 && hintedRaw !== 1) return null;
  const numericFilter = /^\d+$/.test(filter) ? Number(filter) : 0;
  if (numericFilter && numericFilter !== hintedRaw) return null;
  const category = String(input.defaultCategory || '');
  if (hintedRaw === 8 && category && category !== 'Satis') return null;
  if (hintedRaw === 1 && category && category !== 'Alis') return null;
  return hintedRaw;
}

export type SavedCashInvoiceKind = 'sale' | 'purchase';

export interface SavedCashInvoiceOpen {
  kind: SavedCashInvoiceKind;
  ficheNo: string;
  screen: 'salesinvoice' | 'purchaseinvoice';
  trcode: 1 | 8;
  category: 'Satis' | 'Alis';
}

export interface SavedCashInvoiceRow {
  transactionType?: string | null;
  description?: string | null;
  ficheNo?: string | null;
  isReservationDeposit?: boolean | null;
}

export type CashRowEditSurface = 'purchase-invoice' | 'sales-invoice' | 'cash-form';

function foldTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\u0307/g, '')
    .normalize('NFC')
    .trim();
}

function foldAscii(value: string): string {
  return foldTr(value)
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** Açıklama "Alış faturası — 00002" biçimindedir. Tire, fiş numarasının içindedir. */
function splitInvoiceCashDescription(description: string): string[] {
  const raw = String(description || '').trim();
  if (!raw) return [];
  const byDash = raw.split(/[—–]/).map((part) => part.trim()).filter(Boolean);
  if (byDash.length >= 2) return byDash;
  return raw.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
}

function invoicePrefixKind(prefix: string): SavedCashInvoiceKind | null {
  const folded = foldAscii(prefix);
  if (!folded || folded.includes('iade') || folded.includes('hizmet')) return null;
  if (folded.includes('satis fatur')) return 'sale';
  if (folded.includes('alis fatur')) return 'purchase';
  return null;
}

function cleanFicheToken(token: string): string {
  return String(token || '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim();
}

/**
 * Kaydedilmiş nakit satış veya alış faturasının kasa satırı.
 * Kasa tipi KASA_GIRIS / KASA_CIKIS kalır. Açıklamadaki fiş no belge kimliğidir.
 * Faturasız kasa fişi, cari, hizmet, iade, banka ve gider buraya düşmez.
 */
export function resolveSavedCashInvoiceOpen(input: SavedCashInvoiceRow): SavedCashInvoiceOpen | null {
  if (input.isReservationDeposit === true) return null;
  const tip = String(input.transactionType || '').trim().toUpperCase();
  if (tip !== 'KASA_GIRIS' && tip !== 'KASA_CIKIS') return null;
  const parts = splitInvoiceCashDescription(String(input.description || ''));
  if (parts.length < 2) return null;
  const kind = invoicePrefixKind(parts[0]);
  if (!kind) return null;
  if (kind === 'purchase' && tip !== 'KASA_CIKIS') return null;
  if (kind === 'sale' && tip !== 'KASA_GIRIS') return null;
  const ficheNo = cleanFicheToken(parts[1]);
  if (!ficheNo) return null;
  const purchase = kind === 'purchase';
  return {
    kind,
    ficheNo,
    screen: purchase ? 'purchaseinvoice' : 'salesinvoice',
    trcode: purchase ? 1 : 8,
    category: purchase ? 'Alis' : 'Satis',
  };
}

/** Kasa satırı düzenlenince hangi kabuk açılır. Fatura yoksa kasa formu. */
export function cashRowEditSurface(input: SavedCashInvoiceRow): CashRowEditSurface {
  const hit = resolveSavedCashInvoiceOpen(input);
  if (!hit) return 'cash-form';
  return hit.kind === 'purchase' ? 'purchase-invoice' : 'sales-invoice';
}

/**
 * Kasa listesindeki kayıtlı nakit faturayı tam belge olarak açar.
 * Yeni taslak üretmez. openFicheNo fişin kendi numarasıdır.
 */
export function buildSavedCashInvoiceLaunch(input: {
  kind: SavedCashInvoiceKind;
  ficheNo: string;
  registerId: string;
  registerCode?: string | null;
  registerName?: string | null;
}): CashDocumentInvoiceLaunch {
  const purchase = input.kind === 'purchase';
  const trcode = purchase ? 1 : 8;
  const ficheNo = String(input.ficheNo || '').trim();
  return {
    screen: purchase ? 'purchaseinvoice' : 'salesinvoice',
    posSalesReturn: {
      openForm: true,
      openFicheNo: ficheNo,
      editData: {
        payment_method: 'NAKIT',
        cash_register_id: String(input.registerId || '').trim(),
        cash_register_code: String(input.registerCode || '').trim(),
        cash_register_name: String(input.registerName || '').trim(),
        trcode,
        invoice_type: trcode,
        source: 'kasa',
        invoice_no: ficheNo,
      },
    },
  };
}

/**
 * Kayıtlı fiş araması. Satış ve alış kategoriden bulunur (perakende 7, alış 1/5).
 * İade kendi trcode filtresinde kalır.
 */
export function cashPrefillInvoiceLookup(trcode: number): {
  invoiceCategory: 'Satis' | 'Alis' | 'Iade';
  invoiceType: number;
} {
  if (trcode === 1) return { invoiceCategory: 'Alis', invoiceType: 0 };
  if (trcode === 8 || trcode === 7) return { invoiceCategory: 'Satis', invoiceType: 0 };
  return { invoiceCategory: 'Iade', invoiceType: trcode || 0 };
}
