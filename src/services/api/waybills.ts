/**
 * ExRetailOS - Waybills API Service
 * Standardized with Logo ERP TRCODEs
 */

import { invoicesAPI } from './invoices';
import { postgres, ERP_SETTINGS } from '../postgres';
import type { Invoice } from '../../core/types';

/**
 * Logo ERP Standard Waybill TRCODEs
 */
export const WAYBILL_TRCODES = {
  PURCHASE: 1,
  RETAIL_SALE_RETURN: 2,
  WHOLESALE_SALE_RETURN: 3,
  CONSIGNMENT_PURCHASE_RETURN: 4,
  CONSIGNMENT_PURCHASE: 5,
  PURCHASE_RETURN: 6,
  RETAIL_SALE: 7,
  WHOLESALE_SALE: 8,
};

export async function fetchWaybills(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: keyof typeof WAYBILL_TRCODES;
}) {
  try {
    return await invoicesAPI.getPaginated({
      page: options.page || 1,
      pageSize: options.pageSize || 1000,
      search: options.search,
      invoiceCategory: 'Irsaliye',
      invoiceType: options.type ? WAYBILL_TRCODES[options.type] : undefined
    });
  } catch (error) {
    console.error('[WaybillsAPI] fetchWaybills failed:', error);
    return { data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
  }
}

export async function createWaybill(waybill: Partial<Invoice> & { type?: keyof typeof WAYBILL_TRCODES }) {
  try {
    const trcode = waybill.type ? WAYBILL_TRCODES[waybill.type] : (waybill.invoice_type || WAYBILL_TRCODES.WHOLESALE_SALE);

    // Determine category based on trcode
    let category: Invoice['invoice_category'] = 'Irsaliye';
    if ([1, 4, 5, 6].includes(trcode)) category = 'Alis'; // Actually Alis waybill is still Irsaliye category but for Alis logic

    const invoiceData: Invoice = {
      ...waybill,
      invoice_category: 'Irsaliye',
      invoice_type: trcode,
      invoice_no: waybill.invoice_no || `IRS-${Date.now()}`,
      status: waybill.status || 'approved',
      items: waybill.items || []
    } as Invoice;

    return await invoicesAPI.create(invoiceData);
  } catch (error) {
    console.error('[WaybillsAPI] createWaybill failed:', error);
    throw error;
  }
}

export async function updateWaybill(id: string, updates: Partial<Invoice>) {
  try {
    return await invoicesAPI.update(id, updates);
  } catch (error) {
    console.error('[WaybillsAPI] updateWaybill failed:', error);
    throw error;
  }
}

export async function deleteWaybill(id: string) {
  try {
    return await invoicesAPI.delete(id);
  } catch (error) {
    console.error('[WaybillsAPI] deleteWaybill failed:', error);
    throw error;
  }
}

export async function convertWaybillToInvoice(id: string) {
  try {
    const waybill = await invoicesAPI.getById(id);
    if (!waybill) throw new Error('İrsaliye bulunamadı');

    // 2. Create new Invoice based on Waybill
    // Map Waybill TRCODE to Invoice TRCODE
    let targetTrcode = 8; // Wholesale Sales
    if (waybill.invoice_type === WAYBILL_TRCODES.PURCHASE) targetTrcode = 1;
    if (waybill.invoice_type === WAYBILL_TRCODES.RETAIL_SALE) targetTrcode = 7;

    const targetCategory = [1, 4, 5, 6].includes(waybill.invoice_type || 0) ? 'Alis' : 'Satis';

    const newInvoiceData: Invoice = {
      ...waybill,
      id: undefined,
      invoice_no: `FAT-${Date.now()}`,
      invoice_category: targetCategory,
      invoice_type: targetTrcode,
      notes: `İrsaliyeden dönüştürüldü: ${waybill.invoice_no}. ` + (waybill.notes || ''),
      created_at: new Date().toISOString(),
      status: 'unpaid'
    } as Invoice;

    const newInvoice = await invoicesAPI.create(newInvoiceData);

    // 3. Mark Waybill as Billed (Logo: Upgrading status)
    await invoicesAPI.update(id, { status: 'billed' });

    return newInvoice;
  } catch (error) {
    console.error('[WaybillsAPI] convertWaybillToInvoice failed:', error);
    throw error;
  }
}

