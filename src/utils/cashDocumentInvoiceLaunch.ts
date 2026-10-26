/**
 * Kasa İşlem Oluştur → satış / alış faturası.
 * Mevcut fişe tahsilat diyaloğu açılmaz. Tam fatura formu açılır.
 * Nakit veya kart, menüde seçilen kasaya yazılır. Açık cari kasaya yazılmaz.
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
