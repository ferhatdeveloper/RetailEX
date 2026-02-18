/**
 * Professional Print System
 * Supports thermal 58mm/80mm, A4 invoices, QR codes, and logo customization
 */

import { logger } from './logger';
import type { Sale, Product } from '../core/types';

export interface PrintConfig {
  printerType: 'thermal-58mm' | 'thermal-80mm' | 'a4' | 'pdf';
  showLogo: boolean;
  logoUrl?: string;
  showQRCode: boolean;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyTaxNo: string;
  footerText?: string;
  copies: number;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  cashier: string;
  customer?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    discount?: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  receivedAmount?: number;
  change?: number;
}

/**
 * Generate thermal receipt HTML (58mm or 80mm)
 */
export function generateThermalReceipt(
  data: ReceiptData,
  config: PrintConfig
): string {
  const width = config.printerType === 'thermal-58mm' ? '58mm' : '80mm';
  const fontSize = config.printerType === 'thermal-58mm' ? '10px' : '12px';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: ${width} auto;
            margin: 0;
          }
        }
        body {
          font-family: 'Courier New', monospace;
          font-size: ${fontSize};
          width: ${width};
          margin: 0;
          padding: 5mm;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider {
          border-top: 1px dashed #000;
          margin: 5px 0;
        }
        .logo {
          max-width: 100%;
          height: auto;
          margin-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        .item-row td {
          padding: 2px 0;
        }
        .total-row {
          font-weight: bold;
          border-top: 2px solid #000;
          padding-top: 5px;
        }
        .qr-code {
          margin: 10px auto;
          display: block;
        }
      </style>
    </head>
    <body>
      ${config.showLogo && config.logoUrl ? `
        <div class="center">
          <img src="${config.logoUrl}" class="logo" alt="Logo" />
        </div>
      ` : ''}
      
      <div class="center bold">${config.companyName}</div>
      <div class="center">${config.companyAddress}</div>
      <div class="center">${config.companyPhone}</div>
      <div class="center">Vergi No: ${config.companyTaxNo}</div>
      
      <div class="divider"></div>
      
      <div class="center bold">SATIŞ FİŞİ</div>
      <div>Fiş No: ${data.receiptNumber}</div>
      <div>Tarih: ${new Date(data.date).toLocaleString('tr-TR')}</div>
      <div>Kasiyer: ${data.cashier}</div>
      ${data.customer ? `<div>Müşteri: ${data.customer}</div>` : ''}
      
      <div class="divider"></div>
      
      <table>
        ${data.items.map(item => `
          <tr class="item-row">
            <td colspan="3">${item.name}</td>
          </tr>
          <tr class="item-row">
            <td>${item.quantity} x ${item.price.toFixed(2)}</td>
            <td style="text-align: right;">
              ${item.discount ? `-%${item.discount}` : ''}
            </td>
            <td style="text-align: right;">${item.total.toFixed(2)} TL</td>
          </tr>
        `).join('')}
      </table>
      
      <div class="divider"></div>
      
      <table>
        <tr>
          <td>Ara Toplam:</td>
          <td style="text-align: right;">${data.subtotal.toFixed(2)} TL</td>
        </tr>
        ${data.discount > 0 ? `
          <tr>
            <td>İndirim:</td>
            <td style="text-align: right;">-${data.discount.toFixed(2)} TL</td>
          </tr>
        ` : ''}
        ${data.tax > 0 ? `
          <tr>
            <td>TAX:</td>
            <td style="text-align: right;">${data.tax.toFixed(2)} TL</td>
          </tr>
        ` : ''}
        <tr class="total-row">
          <td>TOPLAM:</td>
          <td style="text-align: right;">${data.total.toFixed(2)} TL</td>
        </tr>
      </table>
      
      <div class="divider"></div>
      
      <div>Ödeme: ${data.paymentMethod}</div>
      ${data.receivedAmount ? `
        <div>Alınan: ${data.receivedAmount.toFixed(2)} TL</div>
        <div>Para Üstü: ${(data.change || 0).toFixed(2)} TL</div>
      ` : ''}
      
      ${config.showQRCode ? `
        <div class="center">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.receiptNumber)}" 
               class="qr-code" 
               width="100" 
               height="100" 
               alt="QR Code" />
        </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <div class="center">${config.footerText || 'Teşekkür ederiz!'}</div>
      <div class="center">www.retailos.com</div>
    </body>
    </html>
  `;
}

/**
 * Generate A4 invoice HTML
 */
export function generateA4Invoice(
  data: ReceiptData,
  config: PrintConfig
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 12pt;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 30px;
          border-bottom: 3px solid #333;
          padding-bottom: 20px;
        }
        .logo {
          max-width: 200px;
          height: auto;
        }
        .company-info {
          text-align: right;
        }
        .invoice-title {
          font-size: 24pt;
          font-weight: bold;
          color: #333;
          margin: 20px 0;
        }
        .invoice-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
        .detail-box {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th {
          background: #f5f5f5;
          padding: 12px;
          text-align: left;
          border-bottom: 2px solid #333;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #ddd;
        }
        .text-right {
          text-align: right;
        }
        .totals {
          margin-top: 30px;
          float: right;
          width: 300px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 15px;
        }
        .grand-total {
          font-size: 16pt;
          font-weight: bold;
          background: #f5f5f5;
          border-top: 2px solid #333;
          margin-top: 10px;
        }
        .footer {
          clear: both;
          margin-top: 100px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 10pt;
          color: #666;
        }
        .qr-code {
          position: absolute;
          bottom: 100px;
          left: 50px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${config.showLogo && config.logoUrl ? `
            <img src="${config.logoUrl}" class="logo" alt="Company Logo" />
          ` : `
            <h2>${config.companyName}</h2>
          `}
          <div>${config.companyAddress}</div>
          <div>Tel: ${config.companyPhone}</div>
          <div>Vergi No: ${config.companyTaxNo}</div>
        </div>
        <div class="company-info">
          <div class="invoice-title">FATURA</div>
          <div><strong>Fiş No:</strong> ${data.receiptNumber}</div>
          <div><strong>Tarih:</strong> ${new Date(data.date).toLocaleDateString('tr-TR')}</div>
        </div>
      </div>

      <div class="invoice-details">
        <div class="detail-box">
          <h3>Müşteri Bilgileri</h3>
          <div>${data.customer || 'Perakende Müşteri'}</div>
        </div>
        <div class="detail-box">
          <h3>Ödeme Bilgileri</h3>
          <div><strong>Ödeme Yöntemi:</strong> ${data.paymentMethod}</div>
          <div><strong>Kasiyer:</strong> ${data.cashier}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Ürün Adı</th>
            <th class="text-right">Miktar</th>
            <th class="text-right">Birim Fiyat</th>
            <th class="text-right">İndirim</th>
            <th class="text-right">Toplam</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${item.price.toFixed(2)} TL</td>
              <td class="text-right">${item.discount ? `%${item.discount}` : '-'}</td>
              <td class="text-right">${item.total.toFixed(2)} TL</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Ara Toplam:</span>
          <span>${data.subtotal.toFixed(2)} TL</span>
        </div>
        ${data.discount > 0 ? `
          <div class="total-row">
            <span>İndirim:</span>
            <span>-${data.discount.toFixed(2)} TL</span>
          </div>
        ` : ''}
        ${data.tax > 0 ? `
          <div class="total-row">
            <span>TAX (%18):</span>
            <span>${data.tax.toFixed(2)} TL</span>
          </div>
        ` : ''}
        <div class="total-row grand-total">
          <span>GENEL TOPLAM:</span>
          <span>${data.total.toFixed(2)} TL</span>
        </div>
      </div>

      ${config.showQRCode ? `
        <div class="qr-code">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.receiptNumber)}" 
               width="120" 
               height="120" 
               alt="QR Code" />
          <div style="text-align: center; font-size: 8pt; margin-top: 5px;">
            ${data.receiptNumber}
          </div>
        </div>
      ` : ''}

      <div class="footer">
        <div>${config.footerText || 'Bizi tercih ettiğiniz için teşekkür ederiz.'}</div>
        <div style="margin-top: 10px;">RetailOS - Professional Retail Management System</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Print receipt
 */
export async function printReceipt(
  data: ReceiptData,
  config: PrintConfig
): Promise<void> {
  try {
    logger.log('print', 'Generating receipt', { type: config.printerType });

    let html: string;

    if (config.printerType === 'a4') {
      html = generateA4Invoice(data, config);
    } else {
      html = generateThermalReceipt(data, config);
    }

    // Open print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Popup blocked. Please allow popups for printing.');
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Print multiple copies
    for (let i = 0; i < config.copies; i++) {
      printWindow.print();
      if (i < config.copies - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Close after a delay
    setTimeout(() => printWindow.close(), 2000);

    logger.log('print', 'Receipt printed successfully', { copies: config.copies });
  } catch (error) {
    logger.error('print', 'Print failed', error);
    throw error;
  }
}

/**
 * Save receipt as PDF
 */
export async function saveReceiptAsPDF(
  data: ReceiptData,
  config: PrintConfig
): Promise<void> {
  try {
    logger.log('print', 'Generating PDF');

    const html = generateA4Invoice(data, config);

    // Open in new window for save as PDF
    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) {
      throw new Error('Popup blocked. Please allow popups to save PDF.');
    }

    pdfWindow.document.write(html);
    pdfWindow.document.close();

    // User can use browser's "Save as PDF" feature
    setTimeout(() => {
      pdfWindow.print();
    }, 500);

    logger.log('print', 'PDF generation initiated');
  } catch (error) {
    logger.error('print', 'PDF generation failed', error);
    throw error;
  }
}

