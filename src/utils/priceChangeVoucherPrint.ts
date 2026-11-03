/**
 * Price Change Voucher Print Utility
 * Fiyat Değişim Fişi Yazdırma
 */

import type { PriceChangeVoucher } from '../services/api/priceChangeVouchers';
import { RECEIPT_80MM_DOCUMENT_CSS } from './receipt80mmDocumentCss';
import { buildCenteredFirmHeaderHtml } from './printFirmHeader';

export interface PrintCompanyInfo {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNo?: string;
  logoDataUrl?: string | null;
}

/**
 * Print price change voucher
 */
export async function printPriceChangeVoucher(
  voucher: PriceChangeVoucher,
  companyInfo: PrintCompanyInfo
): Promise<void> {
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  
  if (!printWindow) {
    throw new Error('Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kontrol edin.');
  }

  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Fiyat Değişim Fişi - ${voucher.voucher_no}</title>
      <style>
        ${RECEIPT_80MM_DOCUMENT_CSS}
        * { box-sizing: border-box; }
        .center { text-align: center; }
        .bold { font-weight: 600; }
        .large { font-size: 14px; font-weight: 600; }
        .divider { border-top: 1px dashed #000; margin: 1.5mm 0; }
        .double-divider { border-top: 2px solid #000; margin: 1.5mm 0; }
        table { width: 100%; border-collapse: collapse; margin: 1mm 0; }
        .item-row td { padding: 0; vertical-align: top; font-size: 13px; color: #000; }
        
        .item-name {
          width: 40%;
        }
        
        .item-old-price {
          width: 20%;
          text-align: right;
        }
        
        .item-new-price {
          width: 20%;
          text-align: right;
          font-weight: bold;
        }
        
        .item-diff {
          width: 20%;
          text-align: right;
        }
        
        .price-up,
        .price-down {
          color: #000;
          font-weight: 600;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
          font-size: 13px;
          color: #000;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      ${buildCenteredFirmHeaderHtml({
        firmName: companyInfo.companyName,
        logoDataUrl: companyInfo.logoDataUrl,
        nameStyle: 'text-align:center;font-weight:600;font-size:14px;color:#000',
      })}
      ${companyInfo.companyAddress ? `<div class="center" style="margin-top: 1mm; font-size: 12px; color: #000;">${companyInfo.companyAddress}</div>` : ''}
      ${companyInfo.companyPhone ? `<div class="center" style="font-size: 12px; color: #000;">Tel: ${companyInfo.companyPhone}</div>` : ''}
      ${companyInfo.companyTaxNo ? `<div class="center" style="font-size: 12px; color: #000;">Vergi No: ${companyInfo.companyTaxNo}</div>` : ''}
      
      <div class="double-divider"></div>
      
      <!-- Voucher Info -->
      <div class="center bold" style="margin-bottom: 2mm;">
        FİYAT DEĞİŞİM FİŞİ
      </div>
      
      <div class="info-row">
        <span>Fiş No:</span>
        <span class="bold">${voucher.voucher_no}</span>
      </div>
      <div class="info-row">
        <span>Fatura No:</span>
        <span>${voucher.invoice_no}</span>
      </div>
      <div class="info-row">
        <span>Tarih:</span>
        <span>${new Date(voucher.date).toLocaleString('tr-TR')}</span>
      </div>
      
      <div class="divider"></div>
      
      <!-- Items Header -->
      <table>
        <tr style="border-bottom: 1px dashed #000;">
          <td class="item-name bold" style="font-size: 12px; color: #000;">ÜRÜN</td>
          <td class="item-old-price bold" style="font-size: 12px; color: #000; text-align: right;">ESKİ</td>
          <td class="item-new-price bold" style="font-size: 12px; color: #000; text-align: right;">YENİ</td>
          <td class="item-diff bold" style="font-size: 12px; color: #000; text-align: right;">FARK</td>
        </tr>
      </table>
      
      <!-- Items -->
      <table>
        ${voucher.items.map(item => {
          const diffClass = item.difference > 0 ? 'price-up' : item.difference < 0 ? 'price-down' : '';
          const diffSign = item.difference > 0 ? '+' : '';
          return `
            <tr class="item-row">
              <td class="item-name">${item.name.substring(0, 15)}${item.name.length > 15 ? '...' : ''}</td>
              <td class="item-old-price">${item.oldPrice.toFixed(0)}</td>
              <td class="item-new-price">${item.newPrice.toFixed(0)}</td>
              <td class="item-diff ${diffClass}">${diffSign}${item.difference.toFixed(0)}</td>
            </tr>
            <tr>
              <td colspan="4" style="font-size: 12px; padding-left: 1mm; color: #000;">
                ${item.code} | ${diffSign}${item.differencePercent.toFixed(1)}%
              </td>
            </tr>
          `;
        }).join('')}
      </table>
      
      <div class="divider"></div>
      
      <!-- Summary -->
      <div class="info-row">
        <span class="bold">Toplam Ürün:</span>
        <span class="bold">${voucher.items.length}</span>
      </div>
      
      <div class="double-divider"></div>
      
      <!-- Footer -->
      <div class="center" style="margin-top: 1mm; font-size: 12px; color: #000;">
        ${new Date().toLocaleString('tr-TR')}
      </div>
      <div class="center" style="margin-top: 1mm; font-size: 12px; color: #000;">
        EXFIN - Fiyat Değişim Fişi
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(receiptHTML);
  printWindow.document.close();

  // Wait for content to load
  await new Promise(resolve => setTimeout(resolve, 500));

  // Print
  printWindow.print();

  // Close after a delay
  setTimeout(() => printWindow.close(), 2000);
}



