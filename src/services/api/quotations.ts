/**
 * ExRetailOS - Quotations API Service
 * Replaced Supabase with direct PostgreSQL via InvoicesAPI
 */

import { invoicesAPI } from './invoices';
import { postgres, ERP_SETTINGS } from '../postgres';
import type { Invoice } from '../../core/types';

export async function fetchQuotations(firmaId: string, donemId: string, tip?: string) {
  try {
    const result = await invoicesAPI.getPaginated({
      page: 1,
      pageSize: 1000,
      invoiceCategory: 'Teklif',
    });
    return result.data || [];
  } catch (error) {
    console.error('fetchQuotations failed:', error);
    return [];
  }
}

export async function createQuotation(quotation: any) {
  try {
    const invoiceData: Invoice = {
      ...quotation,
      invoice_category: 'Teklif',
      invoice_no: quotation.invoice_no || `TEK-${Date.now()}`,
      customer_id: quotation.customer_id,
      items: quotation.items || []
    };
    return await invoicesAPI.create(invoiceData);
  } catch (error) {
    console.error('createQuotation failed:', error);
    throw error;
  }
}

export async function updateQuotation(id: string, updates: any) {
  try {
    return await invoicesAPI.update(id, updates);
  } catch (error) {
    console.error('updateQuotation failed:', error);
    throw error;
  }
}

export async function deleteQuotation(id: string) {
  try {
    await postgres.query('DELETE FROM invoices WHERE id = $1 AND firm_nr = $2', [id, ERP_SETTINGS.firmNr]);
    return { success: true };
  } catch (error) {
    console.error('deleteQuotation failed:', error);
    throw error;
  }
}

export async function sendQuotation(id: string, method: 'EMAIL' | 'SMS', recipients: string[]) {
  // Placeholder for sending functionality
  console.log(`[QuotationsAPI] Sending quotation ${id} via ${method} to`, recipients);
  return { success: true, message: 'Quotation sent successfully (Mock)' };
}

export async function acceptQuotation(id: string, onayNotu?: string) {
  try {
    // Update status to 'approved'
    // If notes provided, append to notes?
    // For now just update status.
    return await invoicesAPI.update(id, { status: 'approved', notes: onayNotu ? `Onay Notu: ${onayNotu}` : undefined });
  } catch (error) {
    console.error('acceptQuotation failed:', error);
    throw error;
  }
}

export async function convertQuotation(id: string, convertTo: 'FATURA' | 'SIPARIS') {
  try {
    const quotation = await invoicesAPI.getById(id);
    if (!quotation) throw new Error('Quotation not found');

    const targetCategory = convertTo === 'FATURA' ? 'Satis' : 'Siparis';
    const prefix = convertTo === 'FATURA' ? 'FAT' : 'SIP';

    const newDocumentData: Invoice = {
      ...quotation,
      id: undefined,
      invoice_no: `${prefix}-${Date.now()}`,
      invoice_category: targetCategory,
      notes: `Converted from Quotation: ${quotation.invoice_no}. ` + (quotation.notes || ''),
      created_at: new Date().toISOString(),
      status: 'unpaid' // or 'pending' for order
    };

    const newDoc = await invoicesAPI.create(newDocumentData);

    // Mark Quotation as Converted
    await invoicesAPI.update(id, { status: 'converted' });

    return newDoc;
  } catch (error) {
    console.error('convertQuotation failed:', error);
    throw error;
  }
}


