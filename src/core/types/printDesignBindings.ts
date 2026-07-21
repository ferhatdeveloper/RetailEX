import type { TemplateUsageScope } from './templates';

export type PrintDesignScope =
  | TemplateUsageScope
  | 'kitchen_ticket'
  | 'account_receipt'
  | 'cash_voucher';

export type PrintDesignKind = 'fastreport_frx' | 'design_center' | 'builtin';

export type PrintDesignBinding = {
  id?: string;
  firmNr: string;
  scope: PrintDesignScope;
  designKind: PrintDesignKind;
  designId: string | null;
  designName: string | null;
  isActive: boolean;
  updatedAt?: string | null;
};

export type PrintDesignOption = {
  id: string;
  name: string;
  designKind: PrintDesignKind;
  sourceLabel: string;
};

export const PRINT_DESIGN_SCOPES: { scope: PrintDesignScope; label: string; group: string }[] = [
  { scope: 'pos_receipt', label: 'POS Fişi', group: 'POS' },
  { scope: 'invoice_sales', label: 'Satış Faturası', group: 'Fatura' },
  { scope: 'invoice_purchase', label: 'Alış Faturası', group: 'Fatura' },
  { scope: 'invoice_return', label: 'İade Faturası', group: 'Fatura' },
  { scope: 'invoice_waybill', label: 'İrsaliye', group: 'Fatura' },
  { scope: 'invoice_service', label: 'Hizmet Faturası', group: 'Fatura' },
  { scope: 'invoice_order', label: 'Sipariş Belgesi', group: 'Fatura' },
  { scope: 'invoice_quote', label: 'Teklif Belgesi', group: 'Fatura' },
  { scope: 'product_bulk_label', label: 'Toplu Ürün Etiketi', group: 'Etiket' },
  { scope: 'shelf_label', label: 'Raf Etiketi', group: 'Etiket' },
  { scope: 'warehouse_label', label: 'Depo Etiketi', group: 'Etiket' },
  { scope: 'kitchen_ticket', label: 'Mutfak Fişi', group: 'Restoran' },
  { scope: 'account_receipt', label: 'Hesap / Adisyon Fişi', group: 'Restoran' },
  { scope: 'cash_voucher', label: 'Kasa Fişi', group: 'Kasa' },
];
