/** GİB / e-dönüşüm paylaşılan tipler */

export interface GIBResponse {
  success: boolean;
  message: string;
  documentId?: string;
  timestamp: string;
  envelope?: string;
}

export interface EDocument {
  id: string;
  type: 'E-Fatura' | 'E-Arşiv' | 'E-İrsaliye' | 'E-Defter' | 'E-SMM' | 'E-Müstahsil';
  uuid: string;
  customer: string;
  customerId?: string;
  date: string;
  amount: number;
  taxAmount: number;
  status: 'Taslak' | 'Beklemede' | 'Gönderildi' | 'Onaylandı' | 'Reddedildi' | 'İptal';
  xmlContent?: string;
  xmlSignature?: string;
  gibResponse?: GIBResponse;
  errorMessage?: string;
  createdAt: string;
  sentAt?: string;
  approvedAt?: string;
  /** `gib_edocument_queue.id` — indirme / yeniden gönderim için */
  queueRecordId?: string;
}

export interface EInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  seller: {
    name: string;
    taxNumber: string;
    taxOffice: string;
    address: string;
  };
  buyer: {
    name: string;
    taxNumber: string;
    taxOffice: string;
    address: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    amount: number;
  }>;
  totalAmount: number;
  totalTax: number;
  grandTotal: number;
  /** Varsayılan: bölgeye göre TRY / IQD */
  currencyCode?: string;
}
