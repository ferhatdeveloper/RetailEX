import type { Sale } from '../App';

/**
 * İade Fişi Tipi
 */
export interface ReturnReceipt {
  id: string;
  returnNumber: string;
  originalReceiptNumber: string;
  date: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    returnReason?: string;
    variant?: {
      size?: string;
      color?: string;
    };
  }>;
  subtotal: number;
  total: number;
  refundMethod: 'cash' | 'card' | 'original';
  cashier: string;
  customerName?: string;
  returnReason?: string;
}

/**
 * 80mm termal yazıcı için fiş yazdırma fonksiyonu
 * Web tarayıcısının print API'sini kullanarak özel formatlanmış fiş yazdırır
 */
export function printThermalReceipt(sale: any, companyName: string = 'RetailOS') {
  // Yeni pencere oluştur
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  
  if (!printWindow) {
    alert('Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kontrol edin.');
    return;
  }

  // Fiş HTML içeriği
  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Fiş - ${sale.receiptNumber}</title>
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
        }
        
        .item-row td {
          padding: 1mm 0;
          vertical-align: top;
        }
        
        .item-name {
          width: 60%;
        }
        
        .item-qty {
          width: 15%;
          text-align: center;
        }
        
        .item-price {
          width: 25%;
          text-align: right;
        }
        
        .total-row {
          padding-top: 2mm;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
        }
        
        .barcode {
          text-align: center;
          font-size: 10px;
          letter-spacing: 2px;
          margin: 3mm 0;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="center bold large">
        ${companyName}
      </div>
      <div class="center" style="margin-top: 2mm; font-size: 9px;">
        Tel: 0850 XXX XX XX
      </div>
      
      <div class="double-divider"></div>
      
      <!-- Receipt Info -->
      <div class="info-row">
        <span>Fiş No:</span>
        <span class="bold">${sale.receiptNumber}</span>
      </div>
      <div class="info-row">
        <span>Tarih:</span>
        <span>${new Date(sale.date).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</span>
      </div>
      <div class="info-row">
        <span>Kasiyer:</span>
        <span>${sale.cashier}</span>
      </div>
      ${sale.customerName ? `
      <div class="info-row">
        <span>Müşteri:</span>
        <span>${sale.customerName}</span>
      </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <!-- Items -->
      <table>
        <thead>
          <tr class="bold">
            <td class="item-name">Ürün</td>
            <td class="item-qty">Adet</td>
            <td class="item-price">Tutar</td>
          </tr>
        </thead>
        <tbody>
          ${sale.items.map(item => {
            const itemTotal = item.price * item.quantity;
            const variantInfo = item.variant ? [item.variant.color, item.variant.size].filter(Boolean).join(' / ') : '';
            return `
              <tr class="item-row">
                <td class="item-name">
                  ${item.productName}
                  ${variantInfo ? `<br><span style="font-size: 9px;">${variantInfo}</span>` : ''}
                </td>
                <td class="item-qty">${item.quantity}</td>
                <td class="item-price">${itemTotal.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <div class="divider"></div>
      
      <!-- Totals -->
      <table>
        <tr class="total-row">
          <td>Ara Toplam:</td>
          <td class="item-price">${sale.subtotal.toFixed(2)}</td>
        </tr>
        ${sale.discount > 0 ? `
        <tr class="total-row">
          <td>İndirim:</td>
          <td class="item-price">-${sale.discount.toFixed(2)}</td>
        </tr>
        ${sale.discountReason ? `
        <tr>
          <td colspan="2" style="font-size: 9px; padding-left: 3mm;">
            (${sale.discountReason})
          </td>
        </tr>
        ` : ''}
        ` : ''}
        <tr class="total-row bold large">
          <td>TOPLAM:</td>
          <td class="item-price">${sale.total.toFixed(2)}</td>
        </tr>
      </table>
      
      <div class="divider"></div>
      
      <!-- Payment Info -->
      <div class="info-row">
        <span>Ödeme Yöntemi:</span>
        <span class="bold">${
          sale.paymentMethod === 'cash' ? 'Nakit' : 
          sale.paymentMethod === 'card' ? 'Kredi Kartı' : 
          'Karışık'
        }</span>
      </div>
      ${sale.paymentMethod === 'cash' && sale.cashAmount ? `
      <div class="info-row">
        <span>Nakit:</span>
        <span>${sale.cashAmount.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span>Para Üstü:</span>
        <span class="bold">${sale.change?.toFixed(2) || '0.00'}</span>
      </div>
      ` : ''}
      
      <div class="double-divider"></div>
      
      <!-- Footer -->
      <div class="center" style="margin: 3mm 0; font-size: 10px;">
        Bizi Tercih Ettiğiniz İçin Teşekkür Ederiz!
      </div>
      
      <div class="barcode">
        * ${sale.receiptNumber} *
      </div>
      
      <div class="center" style="font-size: 8px; margin-top: 3mm; color: #666;">
        RetailOS - Profesyonel Satış Yönetimi
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(receiptHTML);
  printWindow.document.close();
  
  // Yazdırma
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      
      // Yazdırma tamamlandıktan sonra pencereyi kapat
      printWindow.onafterprint = () => {
        printWindow.close();
      };
    }, 250);
  };
}

/**
 * 80mm termal yazıcı için İADE FİŞİ yazdırma fonksiyonu
 * @param returnReceipt İade fişi bilgileri
 * @param companyName Firma adı (opsiyonel)
 */
export function printReturnReceipt(returnReceipt: ReturnReceipt, companyName: string = 'RetailOS') {
  // Yeni pencere oluştur
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  
  if (!printWindow) {
    alert('Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kontrol edin.');
    return;
  }

  // İade Fişi HTML içeriği
  const receiptHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>İade Fişi - ${returnReceipt.returnNumber}</title>
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
        }
        
        .item-row td {
          padding: 1mm 0;
          vertical-align: top;
        }
        
        .item-name {
          width: 60%;
        }
        
        .item-qty {
          width: 15%;
          text-align: center;
        }
        
        .item-price {
          width: 25%;
          text-align: right;
        }
        
        .total-row {
          padding-top: 2mm;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
        }
        
        .barcode {
          text-align: center;
          font-size: 10px;
          letter-spacing: 2px;
          margin: 3mm 0;
        }
        
        .return-header {
          background-color: #f0f0f0;
          padding: 2mm;
          margin: 2mm 0;
          border: 1px solid #000;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="center bold large">
        ${companyName}
      </div>
      <div class="center" style="margin-top: 2mm; font-size: 9px;">
        Tel: 0850 XXX XX XX
      </div>
      
      <div class="double-divider"></div>
      
      <!-- İADE BAŞLIĞI -->
      <div class="return-header center bold large">
        *** İADE FİŞİ ***
      </div>
      
      <!-- Return Info -->
      <div class="info-row">
        <span>İade No:</span>
        <span class="bold">${returnReceipt.returnNumber}</span>
      </div>
      <div class="info-row">
        <span>Orijinal Fiş:</span>
        <span class="bold">${returnReceipt.originalReceiptNumber}</span>
      </div>
      <div class="info-row">
        <span>Tarih:</span>
        <span>${new Date(returnReceipt.date).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</span>
      </div>
      <div class="info-row">
        <span>Kasiyer:</span>
        <span>${returnReceipt.cashier}</span>
      </div>
      ${returnReceipt.customerName ? `
      <div class="info-row">
        <span>Müşteri:</span>
        <span>${returnReceipt.customerName}</span>
      </div>
      ` : ''}
      ${returnReceipt.returnReason ? `
      <div class="info-row" style="margin-top: 2mm;">
        <span class="bold">İade Nedeni:</span>
      </div>
      <div style="font-size: 9px; margin-top: 1mm; padding-left: 2mm;">
        ${returnReceipt.returnReason}
      </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <!-- Items -->
      <table>
        <thead>
          <tr class="bold">
            <td class="item-name">Ürün</td>
            <td class="item-qty">Adet</td>
            <td class="item-price">Tutar</td>
          </tr>
        </thead>
        <tbody>
          ${returnReceipt.items.map(item => {
            const itemTotal = item.total;
            const variantInfo = item.variant ? [item.variant.color, item.variant.size].filter(Boolean).join(' / ') : '';
            return `
              <tr class="item-row">
                <td class="item-name">
                  ${item.productName}
                  ${variantInfo ? `<br><span style="font-size: 9px;">${variantInfo}</span>` : ''}
                  ${item.returnReason ? `<br><span style="font-size: 8px; font-style: italic;">(${item.returnReason})</span>` : ''}
                </td>
                <td class="item-qty">${item.quantity}</td>
                <td class="item-price">${itemTotal.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <div class="divider"></div>
      
      <!-- Totals -->
      <table>
        <tr class="total-row">
          <td>Ara Toplam:</td>
          <td class="item-price">${returnReceipt.subtotal.toFixed(2)}</td>
        </tr>
        <tr class="total-row bold large">
          <td>İADE TOPLAMI:</td>
          <td class="item-price">${returnReceipt.total.toFixed(2)}</td>
        </tr>
      </table>
      
      <div class="divider"></div>
      
      <!-- Refund Info -->
      <div class="info-row">
        <span>İade Yöntemi:</span>
        <span class="bold">${
          returnReceipt.refundMethod === 'cash' ? 'Nakit' : 
          returnReceipt.refundMethod === 'card' ? 'Kredi Kartı' : 
          'Orijinal Ödeme Yöntemi'
        }</span>
      </div>
      
      <div class="double-divider"></div>
      
      <!-- Footer -->
      <div class="center" style="margin: 3mm 0; font-size: 10px;">
        İade işleminiz tamamlanmıştır.
      </div>
      <div class="center" style="font-size: 9px; color: #666;">
        İade onayı müşteri ve yetkili tarafından verilmiştir.
      </div>
      
      <div class="barcode">
        * ${returnReceipt.returnNumber} *
      </div>
      
      <div class="center" style="font-size: 8px; margin-top: 3mm; color: #666;">
        RetailOS - Profesyonel Satış Yönetimi
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(receiptHTML);
  printWindow.document.close();
  
  // Yazdırma
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      
      // Yazdırma tamamlandıktan sonra pencereyi kapat
      printWindow.onafterprint = () => {
        printWindow.close();
      };
    }, 250);
  };
}

/**
 * Test için örnek fiş yazdırma
 */
export function printTestReceipt() {
  const testSale: Sale = {
    id: 'TEST-001',
    receiptNumber: 'FIS-2025-TEST',
    date: new Date().toISOString(),
    items: [
      {
        productId: '1',
        productName: 'Test Ürün 1',
        quantity: 2,
        price: 100.00,
        color: 'Mavi',
        size: 'L'
      },
      {
        productId: '2',
        productName: 'Test Ürün 2',
        quantity: 1,
        price: 50.00
      }
    ],
    subtotal: 250.00,
    discount: 25.00,
    discountReason: 'Kampanya İndirimi',
    total: 225.00,
    paymentMethod: 'cash',
    cashAmount: 250.00,
    change: 25.00,
    cashier: 'Kasiyer 1',
    customerName: 'Test Müşteri'
  };
  
  printThermalReceipt(testSale);
}
