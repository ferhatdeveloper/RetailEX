/**
 * Kasa İşlem Oluştur → satış / alış iade.
 * Sade tutar fişi açılmaz. Tam iade fatura belgesi açılır.
 * Nakit, menüde seçilen kasaya yazılır.
 */

export type CashReturnMenuType = 'SATIS_IADE_FATURASI' | 'ALIS_IADE_FATURASI';

export interface CashReturnInvoiceLaunch {
  screen: 'sales-invoice-return' | 'purchase-invoice-return';
  posSalesReturn: {
    editData: Record<string, unknown>;
    openForm: true;
    /** Doluysa mevcut iade belgesi açılır; yeni fiş üretilmez. */
    openFicheNo?: string;
  };
}

export function isCashReturnMenuType(type: string | null | undefined): type is CashReturnMenuType {
  return type === 'SATIS_IADE_FATURASI' || type === 'ALIS_IADE_FATURASI';
}

export function buildCashReturnInvoiceLaunch(input: {
  type: CashReturnMenuType;
  registerId: string;
  registerCode?: string | null;
  registerName?: string | null;
  /** Kasa satırındaki fatura no. Boşsa yeni iade belgesi. */
  ficheNo?: string | null;
}): CashReturnInvoiceLaunch {
  const purchase = input.type === 'ALIS_IADE_FATURASI';
  const trcode = purchase ? 6 : 3;
  const ficheNo = String(input.ficheNo || '').trim();
  return {
    screen: purchase ? 'purchase-invoice-return' : 'sales-invoice-return',
    posSalesReturn: {
      openForm: true,
      ...(ficheNo ? { openFicheNo: ficheNo } : {}),
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
