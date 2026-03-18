/**
 * e-Dönüşüm Service
 * GİB (Gelir İdaresi Başkanlığı) entegrasyonu
 * Pattern: Service Layer Pattern
 */

import { v4 as uuidv4 } from 'uuid';

// Types
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
}

export interface GIBResponse {
  success: boolean;
  message: string;
  documentId?: string;
  timestamp: string;
  envelope?: string;
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
}

/**
 * XML Builder Pattern
 * UBL-TR 2.1 standardına uygun XML oluşturur
 */
class XMLBuilder {
  private xml: string = '';

  constructor() {
    this.xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  }

  addNamespace(prefix: string, uri: string): this {
    this.xml += `xmlns:${prefix}="${uri}" `;
    return this;
  }

  openTag(tag: string, attributes?: Record<string, string>): this {
    let attrStr = '';
    if (attributes) {
      attrStr = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
    }
    this.xml += `<${tag}${attrStr ? ' ' + attrStr : ''}>`;
    return this;
  }

  closeTag(tag: string): this {
    this.xml += `</${tag}>`;
    return this;
  }

  addElement(tag: string, value: string | number): this {
    this.xml += `<${tag}>${this.escapeXml(String(value))}</${tag}>`;
    return this;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  build(): string {
    return this.xml;
  }
}

/**
 * e-Fatura XML Generator (UBL-TR 2.1)
 */
export function generateEInvoiceXML(data: EInvoiceData, uuid: string): string {
  const builder = new XMLBuilder();

  builder.xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>${data.invoiceNumber}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${data.invoiceDate}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>IQD</cbc:DocumentCurrencyCode>
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${data.seller.taxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${data.seller.name}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${data.seller.address}</cbc:StreetName>
        <cbc:CityName>İstanbul</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${data.seller.taxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${data.buyer.taxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${data.buyer.name}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${data.buyer.address}</cbc:StreetName>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${data.buyer.taxOffice}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  
  ${data.items.map((item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="IQD">${item.amount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${item.name}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="IQD">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="IQD">${(item.amount * item.taxRate / 100).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="IQD">${item.amount.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="IQD">${(item.amount * item.taxRate / 100).toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${item.taxRate}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>TAX</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </cac:InvoiceLine>
  `).join('')}
  
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="IQD">${data.totalTax.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="IQD">${data.totalAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="IQD">${data.totalAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="IQD">${data.grandTotal.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="IQD">${data.grandTotal.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

  return builder.xml;
}

/**
 * XML Validation
 * UBL-TR schema validation
 */
export function validateXML(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation
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

  // More advanced validation would require XSD schema
  // For production, use a proper XML validator library

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * XML Signing (Simplified - Production'da gerçek sertifika kullanılmalı)
 * Pattern: Strategy Pattern
 */
export interface SignatureStrategy {
  sign(xml: string, certificate: any): Promise<string>;
}

class XMLDSigStrategy implements SignatureStrategy {
  async sign(xml: string, certificate: any): Promise<string> {
    // TODO: Gerçek dijital imza eklenmeli
    // xml-crypto veya node-forge kullanılabilir
    
    const signature = `
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <ds:Reference URI="">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>MOCK_DIGEST_VALUE</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue>MOCK_SIGNATURE_VALUE</ds:SignatureValue>
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>MOCK_CERTIFICATE</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </ds:Signature>`;

    // Insert signature before closing tag
    const closingTag = xml.lastIndexOf('</Invoice>');
    return xml.slice(0, closingTag) + signature + xml.slice(closingTag);
  }
}

export const xmlSigner = new XMLDSigStrategy();

/**
 * GİB API Service
 * Pattern: Adapter Pattern
 */
export class GIBAPIService {
  private baseUrl: string;
  private apiKey: string;
  private testMode: boolean;

  constructor(testMode = true) {
    this.testMode = testMode;
    this.baseUrl = testMode 
      ? 'https://efaturatest.gib.gov.tr' 
      : 'https://efatura.gib.gov.tr';
    this.apiKey = testMode ? 'TEST_API_KEY' : process.env.GIB_API_KEY || '';
  }

  /**
   * Send e-Invoice to GİB
   */
  async sendEInvoice(xml: string): Promise<GIBResponse> {
    try {
      // Test mode - simulate success
      if (this.testMode) {
        await this.delay(1000); // Simulate network delay
        
        return {
          success: true,
          message: 'E-Fatura başarıyla gönderildi (TEST)',
          documentId: uuidv4(),
          timestamp: new Date().toISOString(),
          envelope: 'MOCK_ENVELOPE_ID'
        };
      }

      // Production mode
      const response = await fetch(`${this.baseUrl}/earsiv-services/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: xml
      });

      if (!response.ok) {
        throw new Error(`GİB API Error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        message: 'E-Fatura başarıyla gönderildi',
        documentId: data.documentId,
        timestamp: new Date().toISOString(),
        envelope: data.envelopeId
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Bilinmeyen hata',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check document status
   */
  async checkStatus(uuid: string): Promise<GIBResponse> {
    try {
      if (this.testMode) {
        await this.delay(500);
        
        const statuses = ['Onaylandı', 'Beklemede', 'Reddedildi'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        return {
          success: randomStatus !== 'Reddedildi',
          message: randomStatus,
          documentId: uuid,
          timestamp: new Date().toISOString()
        };
      }

      const response = await fetch(`${this.baseUrl}/earsiv-services/status/${uuid}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      const data = await response.json();
      
      return {
        success: data.status === 'APPROVED',
        message: data.statusMessage,
        documentId: uuid,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Durum sorgulanamadı',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cancel document
   */
  async cancelDocument(uuid: string, reason: string): Promise<GIBResponse> {
    try {
      if (this.testMode) {
        await this.delay(800);
        
        return {
          success: true,
          message: 'Belge başarıyla iptal edildi (TEST)',
          documentId: uuid,
          timestamp: new Date().toISOString()
        };
      }

      const response = await fetch(`${this.baseUrl}/earsiv-services/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ uuid, reason })
      });

      const data = await response.json();
      
      return {
        success: data.success,
        message: data.message,
        documentId: uuid,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'İptal işlemi başarısız',
        timestamp: new Date().toISOString()
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * e-Transform Service Facade
 * Pattern: Facade Pattern
 */
export class ETransformService {
  private gibAPI: GIBAPIService;

  constructor(testMode = true) {
    this.gibAPI = new GIBAPIService(testMode);
  }

  /**
   * Create and send e-Invoice
   */
  async createAndSendEInvoice(data: EInvoiceData): Promise<EDocument> {
    const uuid = uuidv4();
    const xml = generateEInvoiceXML(data, uuid);

    // Validate XML
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
        createdAt: new Date().toISOString()
      };
    }

    // Sign XML
    const signedXML = await xmlSigner.sign(xml, null);

    // Send to GİB
    const response = await this.gibAPI.sendEInvoice(signedXML);

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
      sentAt: response.success ? new Date().toISOString() : undefined
    };
  }

  /**
   * Check document status
   */
  async checkDocumentStatus(uuid: string): Promise<GIBResponse> {
    return await this.gibAPI.checkStatus(uuid);
  }

  /**
   * Cancel document
   */
  async cancelDocument(uuid: string, reason: string): Promise<GIBResponse> {
    return await this.gibAPI.cancelDocument(uuid, reason);
  }

  /**
   * Bulk send documents
   */
  async bulkSendDocuments(documents: EInvoiceData[]): Promise<EDocument[]> {
    const results: EDocument[] = [];

    for (const doc of documents) {
      const result = await this.createAndSendEInvoice(doc);
      results.push(result);
      
      // Rate limiting - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }

  /**
   * Export to XML file
   */
  exportToXML(document: EDocument): Blob {
    const blob = new Blob([document.xmlContent || ''], { type: 'application/xml' });
    return blob;
  }

  /**
   * Import from XML file
   */
  async importFromXML(file: File): Promise<{ success: boolean; message: string }> {
    try {
      const text = await file.text();
      const validation = validateXML(text);

      if (!validation.valid) {
        return {
          success: false,
          message: `Geçersiz XML: ${validation.errors.join(', ')}`
        };
      }

      return {
        success: true,
        message: 'XML başarıyla içe aktarıldı'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'İçe aktarma hatası'
      };
    }
  }
}

// Singleton instance
export const eTransformService = new ETransformService(true); // Test mode

// Export types for use in components
export type { EInvoiceData, EDocument, GIBResponse };

