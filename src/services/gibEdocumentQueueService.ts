/**
 * GİB e-belge kuyruğu: satış/fatura kayıtları PostgreSQL’de tutulur; GİB yanıtı mock taşıyıcıdadır.
 */

import { postgres, ERP_SETTINGS } from './postgres';
import { invoicesAPI } from './api/invoices';
import { eTransformService } from './eTransformService';
import type { EDocument, EInvoiceData } from './eInvoice/gibTypes';
import type { Invoice } from '../core/types';

export interface GibQueueRow {
  id: string;
  firm_nr: string;
  period_nr: string;
  source_type: string;
  source_id: string;
  document_no: string | null;
  doc_type: string;
  customer_name: string | null;
  doc_date: string | null;
  amount: number;
  tax_amount: number;
  status: string;
  gib_uuid: string | null;
  payload_json: EInvoiceData | Record<string, unknown> | null;
  xml_snapshot: string | null;
  gib_response_json: unknown;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

function mapQueueToEDocument(row: GibQueueRow): EDocument {
  const type = (row.doc_type === 'E-Arşiv' ? 'E-Arşiv' : 'E-Fatura') as EDocument['type'];
  const st = row.status as EDocument['status'];
  const uuid = row.gib_uuid ? String(row.gib_uuid) : row.id;
  return {
    id: row.document_no || row.id,
    type,
    uuid,
    customer: row.customer_name || '-',
    date: row.doc_date ? String(row.doc_date).slice(0, 10) : row.created_at?.split('T')[0] || '',
    amount: Number(row.amount),
    taxAmount: Number(row.tax_amount),
    status: st,
    xmlContent: row.xml_snapshot || undefined,
    gibResponse: row.gib_response_json as EDocument['gibResponse'],
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
    sentAt: row.sent_at || undefined,
    queueRecordId: row.id,
  };
}

async function loadFirmSeller(firmNr: string): Promise<EInvoiceData['seller']> {
  const { rows } = await postgres.query(
    `SELECT name, tax_nr, tax_office, city, address FROM firms WHERE firm_nr = $1 LIMIT 1`,
    [firmNr]
  );
  const r = rows[0] as { name?: string; tax_nr?: string; tax_office?: string; city?: string; address?: string } | undefined;
  if (!r) {
    return { name: 'Firma', taxNumber: '1111111111', taxOffice: 'Merkez', address: 'İstanbul' };
  }
  return {
    name: String(r.name || 'Firma'),
    taxNumber: String(r.tax_nr || '1111111111'),
    taxOffice: String(r.tax_office || 'Merkez'),
    address: String(r.address || r.city || 'İstanbul'),
  };
}

async function loadBuyerPartner(inv: Invoice, firmNr: string): Promise<EInvoiceData['buyer']> {
  const cid = inv.customer_id;
  if (!cid) {
    return { name: inv.customer_name || inv.supplier_name || 'Alıcı', taxNumber: '0000000000', taxOffice: '—', address: 'Türkiye' };
  }
  if (inv.invoice_category === 'Alis') {
    const { rows } = await postgres.query(
      `SELECT name, tax_nr, tax_office, address FROM suppliers WHERE id = $1::uuid LIMIT 1`,
      [cid]
    );
    const r = rows[0] as { name?: string; tax_nr?: string; tax_office?: string; address?: string } | undefined;
    if (!r) {
      return { name: inv.supplier_name || 'Tedarikçi', taxNumber: '0000000000', taxOffice: '—', address: '' };
    }
    return {
      name: String(r.name),
      taxNumber: String(r.tax_nr || '0000000000'),
      taxOffice: String(r.tax_office || '—'),
      address: String(r.address || ''),
    };
  }
  const { rows } = await postgres.query(
    `SELECT name, tax_nr, tax_office, address, city FROM customers WHERE id = $1::uuid AND firm_nr = $2 LIMIT 1`,
    [cid, firmNr]
  );
  const r = rows[0] as { name?: string; tax_nr?: string; tax_office?: string; address?: string; city?: string } | undefined;
  if (!r) {
    return { name: inv.customer_name || 'Müşteri', taxNumber: '0000000000', taxOffice: '—', address: '' };
  }
  return {
    name: String(r.name),
    taxNumber: String(r.tax_nr || '0000000000'),
    taxOffice: String(r.tax_office || '—'),
    address: String([r.address, r.city].filter(Boolean).join(' ') || 'Türkiye'),
  };
}

function buildEInvoiceData(inv: Invoice, seller: EInvoiceData['seller'], buyer: EInvoiceData['buyer']): EInvoiceData {
  const items: EInvoiceData['items'] = (inv.items || []).map((it: Record<string, unknown>) => {
    const qty = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
    const net = Number(it.netAmount ?? it.total ?? qty * unitPrice);
    const vatRate = Number(it.taxRate ?? it.vat_rate ?? 20);
    return {
      name: String(it.productName ?? it.description ?? it.item_name ?? 'Kalem'),
      quantity: qty,
      unitPrice,
      taxRate: vatRate,
      amount: net,
    };
  });
  if (items.length === 0) {
    const sub = Number(inv.subtotal || inv.total_amount || 0);
    items.push({
      name: 'Satır',
      quantity: 1,
      unitPrice: sub,
      taxRate: 20,
      amount: sub,
    });
  }
  const totalAmount = Number(inv.subtotal || 0) || items.reduce((s, i) => s + i.amount, 0);
  const totalTax = Number(inv.tax || 0) || items.reduce((s, i) => s + (i.amount * i.taxRate) / 100, 0);
  const grandTotal = Number(inv.total_amount ?? inv.total ?? totalAmount + totalTax);
  const rawDate = inv.invoice_date || inv.created_at || new Date().toISOString();
  const dateStr = String(rawDate).slice(0, 10);
  const ccy = String(inv.currency || 'TRY').toUpperCase().slice(0, 10);
  return {
    invoiceNumber: String(inv.invoice_no || inv.id || 'SN'),
    invoiceDate: dateStr,
    seller,
    buyer,
    items,
    totalAmount,
    totalTax,
    grandTotal,
    currencyCode: ccy.length >= 3 ? ccy : 'TRY',
  };
}

export async function listGibQueue(): Promise<GibQueueRow[]> {
  const fn = ERP_SETTINGS.firmNr || '001';
  const pn = ERP_SETTINGS.periodNr || '01';
  const { rows } = await postgres.query(
    `SELECT * FROM public.gib_edocument_queue WHERE firm_nr = $1 AND period_nr = $2 ORDER BY created_at DESC`,
    [fn, pn]
  );
  return rows as GibQueueRow[];
}

export async function listGibQueueAsDocuments(): Promise<EDocument[]> {
  const rows = await listGibQueue();
  return rows.map(r => mapQueueToEDocument(r as GibQueueRow));
}

export async function enqueueSaleInvoice(saleId: string): Promise<{ ok: boolean; message: string }> {
  eTransformService.resetConfigCache();
  const { getEInvoiceResolvedConfig } = await import('../config/eInvoice.config');
  const cfg = await getEInvoiceResolvedConfig();
  if (!cfg.eInvoiceFeaturesEnabled) {
    return { ok: false, message: 'E-dönüşüm yalnızca TR bölgesi (firms.regulatory_region) ile açılır.' };
  }

  const inv = await invoicesAPI.getById(saleId);
  if (!inv?.id) {
    return { ok: false, message: 'Fatura bulunamadı.' };
  }

  const cat = inv.invoice_category || '';
  if (!['Satis', 'Hizmet', 'Alis'].includes(cat)) {
    return { ok: false, message: 'Bu belge türü için kuyruk henüz desteklenmiyor (satış / hizmet / alış).' };
  }

  const firmNr = String((inv as Invoice & { firma_id?: string }).firma_id || ERP_SETTINGS.firmNr);
  const periodNr = String((inv as Invoice & { donem_id?: string }).donem_id || ERP_SETTINGS.periodNr);

  const seller = await loadFirmSeller(firmNr);
  const buyer = await loadBuyerPartner(inv, firmNr);
  const payload = buildEInvoiceData(inv, seller, buyer);

  const buyerTax = payload.buyer.taxNumber.replace(/\D/g, '');
  const docType: GibQueueRow['doc_type'] =
    buyerTax.length < 10 || buyerTax === '0000000000' ? 'E-Arşiv' : 'E-Fatura';

  const docDate = (payload.invoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  await postgres.query(
    `INSERT INTO public.gib_edocument_queue (
       firm_nr, period_nr, source_type, source_id, document_no, doc_type,
       customer_name, doc_date, amount, tax_amount, status, payload_json
     ) VALUES ($1, $2, 'sales_fiche', $3::uuid, $4, $5, $6, $7::date, $8, $9, 'Taslak', $10::jsonb)
     ON CONFLICT (firm_nr, period_nr, source_type, source_id) DO UPDATE SET
       document_no = EXCLUDED.document_no,
       doc_type = EXCLUDED.doc_type,
       customer_name = EXCLUDED.customer_name,
       doc_date = EXCLUDED.doc_date,
       amount = EXCLUDED.amount,
       tax_amount = EXCLUDED.tax_amount,
       payload_json = EXCLUDED.payload_json,
       updated_at = CURRENT_TIMESTAMP`,
    [
      firmNr,
      periodNr,
      saleId,
      inv.invoice_no,
      docType,
      inv.customer_name || inv.supplier_name || buyer.name,
      docDate,
      payload.grandTotal,
      payload.totalTax,
      JSON.stringify(payload),
    ]
  );

  return { ok: true, message: 'E-Dönüşüm kuyruğuna eklendi (Taslak). Merkezden “Toplu Gönder” ile mock GİB gönderimi yapın.' };
}

export async function sendQueueDocument(queueRowId: string): Promise<EDocument | null> {
  const { rows } = await postgres.query(`SELECT * FROM public.gib_edocument_queue WHERE id = $1::uuid`, [queueRowId]);
  const row = rows[0] as GibQueueRow | undefined;
  if (!row?.payload_json) return null;

  let payload: EInvoiceData =
    typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json as EInvoiceData);

  await postgres.query(
    `UPDATE public.gib_edocument_queue SET status = 'Beklemede', updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [queueRowId]
  );

  let ed: EDocument;
  try {
    ed = await eTransformService.createAndSendEInvoice(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await postgres.query(
      `UPDATE public.gib_edocument_queue SET status = 'Reddedildi', error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      [queueRowId, msg]
    );
    return null;
  }

  const xml = ed.xmlContent ? ed.xmlContent.slice(0, 50000) : null;
  const ok = ed.status === 'Gönderildi' || ed.status === 'Onaylandı';

  await postgres.query(
    `UPDATE public.gib_edocument_queue SET
       status = $2::text,
       gib_uuid = $3::uuid,
       xml_snapshot = $4,
       gib_response_json = $5::jsonb,
       error_message = $6,
       sent_at = CASE WHEN $7::boolean THEN CURRENT_TIMESTAMP ELSE sent_at END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [
      queueRowId,
      ed.status,
      ed.uuid,
      xml,
      ed.gibResponse ? JSON.stringify(ed.gibResponse) : null,
      ed.errorMessage || null,
      ok,
    ]
  );

  return { ...ed, queueRecordId: queueRowId };
}

export async function sendAllDrafts(): Promise<EDocument[]> {
  const rows = await listGibQueue();
  const drafts = rows.filter(r => r.status === 'Taslak');
  const out: EDocument[] = [];
  for (const r of drafts) {
    const ed = await sendQueueDocument(r.id);
    if (ed) out.push(ed);
    await new Promise(res => setTimeout(res, 150));
  }
  return out;
}

export async function persistManualTestDocument(ed: EDocument, payload: EInvoiceData): Promise<void> {
  const fn = ERP_SETTINGS.firmNr || '001';
  const pn = ERP_SETTINGS.periodNr || '01';
  const sid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`;
  const xml = ed.xmlContent ? ed.xmlContent.slice(0, 50000) : null;
  await postgres.query(
    `INSERT INTO public.gib_edocument_queue (
      firm_nr, period_nr, source_type, source_id, document_no, doc_type,
      customer_name, doc_date, amount, tax_amount, status, gib_uuid,
      payload_json, xml_snapshot, gib_response_json, error_message, sent_at
    ) VALUES (
      $1, $2, 'manual_test', $3::uuid, $4, $5, $6, $7::date, $8, $9, $10, $11::uuid,
      $12::jsonb, $13, $14::jsonb, $15, CASE WHEN $16::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
    )`,
    [
      fn,
      pn,
      sid,
      ed.id,
      ed.type,
      ed.customer,
      ed.date,
      ed.amount,
      ed.taxAmount,
      ed.status,
      ed.uuid,
      JSON.stringify(payload),
      xml,
      ed.gibResponse ? JSON.stringify(ed.gibResponse) : null,
      ed.errorMessage || null,
      ed.status === 'Gönderildi' || ed.status === 'Onaylandı',
    ]
  );
}
