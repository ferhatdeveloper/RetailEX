/**
 * Price Change Voucher Print Utility
 * Fiyat Değişim Fişi Yazdırma
 */

import type { PriceChangeVoucher } from '../services/api/priceChangeVouchers';

export interface PrintCompanyInfo {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNo?: string;
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
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.3;
          width: 80mm;
          padding: 5mm;
          background: white;
        }
        
        .center {
          text-align: center;
        }
        
        .bold {
          font-weight: bold;
        }
        
        .large {
          font-size: 14px;
        }
        
        .divider {
          border-top: 1px dashed #000;
          margin: 3mm 0;
        }
        
        .double-divider {
          border-top: 2px solid #000;
          margin: 3mm 0;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 2mm 0;
        }
        
        .item-row td {
          padding: 1mm 0;
          vertical-align: top;
          font-size: 10px;
        }
        
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
        
        .price-up {
          color: #d32f2f;
        }
        
        .price-down {
          color: #388e3c;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="center bold large">
        ${companyInfo.companyName}
      </div>
      ${companyInfo.companyAddress ? `<div class="center" style="margin-top: 2mm; font-size: 9px;">${companyInfo.companyAddress}</div>` : ''}
      ${companyInfo.companyPhone ? `<div class="center" style="font-size: 9px;">Tel: ${companyInfo.companyPhone}</div>` : ''}
      ${companyInfo.companyTaxNo ? `<div class="center" style="font-size: 9px;">Vergi No: ${companyInfo.companyTaxNo}</div>` : ''}
      
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
          <td class="item-name bold" style="font-size: 9px;">ÜRÜN</td>
          <td class="item-old-price bold" style="font-size: 9px; text-align: right;">ESKİ</td>
          <td class="item-new-price bold" style="font-size: 9px; text-align: right;">YENİ</td>
          <td class="item-diff bold" style="font-size: 9px; text-align: right;">FARK</td>
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
              <td colspan="4" style="font-size: 8px; padding-left: 2mm; color: #666;">
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
      <div class="center" style="margin-top: 3mm; font-size: 9px; color: #666;">
        ${new Date().toLocaleString('tr-TR')}
      </div>
      <div class="center" style="margin-top: 2mm; font-size: 8px; color: #999;">
        RetailOS - Fiyat Değişim Fişi
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



