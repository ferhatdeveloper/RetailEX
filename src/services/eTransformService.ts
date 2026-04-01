/**
 * e-Dönüşüm — GİB e-Fatura / e-Arşiv için servis katmanı.
 * Test: mock taşıyıcı + geliştirme imzası; üretim: entegratör veya doğrudan SOAP bağlanacak.
 */

import { v4 as uuidv4 } from 'uuid';
import { getEInvoiceResolvedConfig, type EInvoiceResolvedConfig } from '../config/eInvoice.config';
import { createGibTransport, developmentXmlSigner, type IGIBTransport } from './eInvoice';
import type { EDocument, EInvoiceData, GIBResponse } from './eInvoice/gibTypes';

export type { EDocument, EInvoiceData, GIBResponse } from './eInvoice/gibTypes';

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * UBL-TR iskelet — üretimde tam şema + XSD doğrulaması gerekir.
 */
export function generateEInvoiceXML(data: EInvoiceData, uuid: string, currencyCode: string): string {
  const ccy = escapeXml(currencyCode);

  const lines = data.items
    .map(
      (item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${ccy}">${item.amount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(item.name)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${ccy}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${ccy}">${(item.amount * item.taxRate / 100).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${ccy}">${item.amount.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${ccy}">${(item.amount * item.taxRate / 100).toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${item.taxRate}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>TAX</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>${escapeXml(data.invoiceNumber)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(data.invoiceDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${ccy}</cbc:DocumentCurrencyCode>
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${escapeXml(data.seller.taxNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(data.seller.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(data.seller.address)}</cbc:StreetName>
        <cbc:CityName>İstanbul</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(data.seller.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${escapeXml(data.buyer.taxNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(data.buyer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(data.buyer.address)}</cbc:StreetName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(data.buyer.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  ${lines}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${ccy}">${data.totalTax.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${ccy}">${data.totalAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${ccy}">${data.totalAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${ccy}">${data.grandTotal.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${ccy}">${data.grandTotal.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

export function validateXML(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!xml.includes('<?xml')) {
    errors.push('XML declaration eksik');
  }

  if (!xml.includes('xmlns')) {
    errors.push('Namespace tanımlamaları eksik');
  }

  if (!xml.includes('<cbc:UUID>')) {
    errors.push('UUID eksik');
  }

  if (!xml.includes('<cbc:ID>')) {
    errors.push('Fatura numarası eksik');
  }

  if (!xml.includes('AccountingSupplierParty')) {
    errors.push('Satıcı bilgileri eksik');
  }

  if (!xml.includes('AccountingCustomerParty')) {
    errors.push('Alıcı bilgileri eksik');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export class ETransformService {
  private resolved: EInvoiceResolvedConfig | null = null;
  private transport: IGIBTransport | null = null;

  private async ensureResolved(): Promise<EInvoiceResolvedConfig> {
    if (!this.resolved) {
      this.resolved = await getEInvoiceResolvedConfig();
      this.transport = createGibTransport(this.resolved);
    }
    return this.resolved;
  }

  /** Test veya yapılandırma değişince cache sıfırlamak için */
  resetConfigCache(): void {
    this.resolved = null;
    this.transport = null;
  }

  async createAndSendEInvoice(data: EInvoiceData): Promise<EDocument> {
    const resolved = await this.ensureResolved();
    const uuid = uuidv4();

    if (!resolved.eInvoiceFeaturesEnabled) {
      return {
        id: data.invoiceNumber,
        type: 'E-Fatura',
        uuid,
        customer: data.buyer.name,
        date: data.invoiceDate,
        amount: data.grandTotal,
        taxAmount: data.totalTax,
        status: 'Reddedildi',
        errorMessage: 'e-Fatura bu kurulumda devre dışı (yalnızca Türkiye / TR bölgesi).',
        createdAt: new Date().toISOString(),
      };
    }

    const currency = data.currencyCode ?? resolved.documentCurrency;
    const xml = generateEInvoiceXML(data, uuid, currency);

    const validation = validateXML(xml);
    if (!validation.valid) {
      return {
        id: data.invoiceNumber,
        type: 'E-Fatura',
        uuid,
        customer: data.buyer.name,
        date: data.invoiceDate,
        amount: data.grandTotal,
        taxAmount: data.totalTax,
        status: 'Reddedildi',
        errorMessage: validation.errors.join(', '),
        createdAt: new Date().toISOString(),
      };
    }

    const signedXML = await developmentXmlSigner.sign(xml);
    const tr = this.transport!;
    const response = await tr.sendEInvoice(signedXML);

    return {
      id: data.invoiceNumber,
      type: 'E-Fatura',
      uuid,
      customer: data.buyer.name,
      customerId: data.buyer.taxNumber,
      date: data.invoiceDate,
      amount: data.grandTotal,
      taxAmount: data.totalTax,
      status: response.success ? 'Gönderildi' : 'Reddedildi',
      xmlContent: signedXML,
      gibResponse: response,
      errorMessage: response.success ? undefined : response.message,
      createdAt: new Date().toISOString(),
      sentAt: response.success ? new Date().toISOString() : undefined,
    };
  }

  async checkDocumentStatus(uuid: string): Promise<GIBResponse> {
    await this.ensureResolved();
    if (!this.resolved!.eInvoiceFeaturesEnabled) {
      return {
        success: false,
        message: 'e-Fatura bu kurulumda devre dışı.',
        timestamp: new Date().toISOString(),
      };
    }
    return await this.transport!.checkStatus(uuid);
  }

  async cancelDocument(uuid: string, reason: string): Promise<GIBResponse> {
    await this.ensureResolved();
    if (!this.resolved!.eInvoiceFeaturesEnabled) {
      return {
        success: false,
        message: 'e-Fatura bu kurulumda devre dışı.',
        timestamp: new Date().toISOString(),
      };
    }
    return await this.transport!.cancelDocument(uuid, reason);
  }

  async bulkSendDocuments(documents: EInvoiceData[]): Promise<EDocument[]> {
    const results: EDocument[] = [];
    for (const doc of documents) {
      const result = await this.createAndSendEInvoice(doc);
      results.push(result);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return results;
  }

  exportToXML(document: EDocument): Blob {
    return new Blob([document.xmlContent || ''], { type: 'application/xml' });
  }

  async importFromXML(file: File): Promise<{ success: boolean; message: string }> {
    try {
      const text = await file.text();
      const validation = validateXML(text);

      if (!validation.valid) {
        return {
          success: false,
          message: `Geçersiz XML: ${validation.errors.join(', ')}`,
        };
      }

      return {
        success: true,
        message: 'XML başarıyla içe aktarıldı',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'İçe aktarma hatası',
      };
    }
  }
}

export const eTransformService = new ETransformService();
