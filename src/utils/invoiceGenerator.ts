import type { Sale } from '../App';

export interface InvoiceData {
  invoiceNo: string;
  receiptNumber: string;
  date: string;
  customerId?: string;
  customerName: string;
  customerTaxNo?: string;
  customerAddress?: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    discount: number;
    total: number;
    taxRate: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  cashier: string;
  storeName: string;
  storeAddress: string;
  storeTaxNo: string;
  storePhone: string;
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time = String(Date.now()).slice(-6);

  return `FIS${year}${month}${day}-${time}`;
}

export function generateReceiptNumber(branchCode: string = 'MRK'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const counter = String(Date.now()).slice(-6);

  return `${branchCode}-${year}${month}${day}-${counter}`;
}

export function convertSaleToInvoice(
  sale: Sale,
  storeInfo: {
    name: string;
    address: string;
    taxNo: string;
    phone: string;
  }
): InvoiceData {
  const invoiceNo = sale.id || generateInvoiceNumber();
  const receiptNumber = sale.receiptNumber || generateReceiptNumber();

  return {
    invoiceNo,
    receiptNumber,
    date: sale.date,
    customerId: sale.customerId,
    customerName: sale.customerName || 'Bireysel Müşteri',
    items: sale.items.map(item => ({
      ...item,
      taxRate: 18 // Default tax rate, should come from product
    })),
    subtotal: sale.subtotal,
    discount: sale.discount || 0,
    tax: sale.tax || 0,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    cashier: sale.cashier,
    storeName: storeInfo.name,
    storeAddress: storeInfo.address,
    storeTaxNo: storeInfo.taxNo,
    storePhone: storeInfo.phone
  };
}

export function printInvoiceHTML(invoice: InvoiceData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fiş - ${invoice.receiptNumber}</title>
  <style>
    @media print {
      @page { margin: 0; }
      body { margin: 0.5cm; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      max-width: 80mm;
      margin: 0 auto;
      padding: 10mm;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 10px 0; }
    .double-line { border-top: 2px solid #000; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .total-row { font-size: 14px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="center bold">
    <div style="font-size: 16px;">${invoice.storeName}</div>
    <div style="font-size: 11px;">${invoice.storeAddress}</div>
    <div style="font-size: 11px;">Vergi No: ${invoice.storeTaxNo}</div>
    <div style="font-size: 11px;">Tel: ${invoice.storePhone}</div>
  </div>
  
  <div class="line"></div>
  
  <table>
    <tr>
      <td>Fiş No:</td>
      <td class="right bold">${invoice.receiptNumber}</td>
    </tr>
    <tr>
      <td>Tarih:</td>
      <td class="right">${new Date(invoice.date).toLocaleString('tr-TR')}</td>
    </tr>
    ${invoice.customerName && invoice.customerName !== 'Bireysel Müşteri' ? `
    <tr>
      <td>Müşteri:</td>
      <td class="right">${invoice.customerName}</td>
    </tr>
    ` : ''}
    <tr>
      <td>Kasiyer:</td>
      <td class="right">${invoice.cashier}</td>
    </tr>
  </table>
  
  <div class="double-line"></div>
  
  <table>
    ${invoice.items.map(item => `
      <tr>
        <td colspan="2" class="bold">${item.productName}</td>
      </tr>
      <tr>
        <td>${item.quantity} x ${item.price.toFixed(2)}</td>
        <td class="right bold">${item.total.toFixed(2)}</td>
      </tr>
    `).join('')}
  </table>
  
  <div class="line"></div>
  
  <table>
    <tr>
      <td>Ara Toplam:</td>
      <td class="right">${invoice.subtotal.toFixed(2)}</td>
    </tr>
    ${invoice.discount > 0 ? `
    <tr>
      <td>İndirim:</td>
      <td class="right">-${invoice.discount.toFixed(2)}</td>
    </tr>
    ` : ''}
    <tr>
      <td>TAX:</td>
      <td class="right">${invoice.tax.toFixed(2)}</td>
    </tr>
  </table>
  
  <div class="double-line"></div>
  
  <table class="total-row">
    <tr>
      <td>TOPLAM:</td>
      <td class="right">${invoice.total.toFixed(2)} TL</td>
    </tr>
    <tr style="font-size: 12px;">
      <td>Ödeme:</td>
      <td class="right">${invoice.paymentMethod}</td>
    </tr>
  </table>
  
  <div class="line"></div>
  
  <div class="center" style="font-size: 11px; margin-top: 10px;">
    Bizi tercih ettiğiniz için teşekkürler!
  </div>
  
  <div class="center" style="font-size: 10px; margin-top: 20px;">
    ${new Date().toLocaleString('tr-TR')}
  </div>
  
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() {
        window.close();
      }, 100);
    };
  </script>
</body>
</html>
  `;
}

export function printInvoice(invoice: InvoiceData): void {
  const html = printInvoiceHTML(invoice);
  const printWindow = window.open('', '_blank', 'width=400,height=600');

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// Electron printer support
export async function printInvoiceElectron(invoice: InvoiceData): Promise<boolean> {
  if (window.electronAPI?.printer) {
    try {
      const result = await window.electronAPI.printer.print({
        config: {
          interface: 'tcp://192.168.1.100', // Should come from settings
          type: 'EPSON',
          width: 48
        },
        storeName: invoice.storeName,
        storeAddress: invoice.storeAddress,
        storeTaxNo: invoice.storeTaxNo,
        invoiceNo: invoice.receiptNumber,
        date: invoice.date,
        customerName: invoice.customerName,
        cashierName: invoice.cashier,
        items: invoice.items,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        total: invoice.total,
        payment: {
          method: invoice.paymentMethod,
          amount: invoice.total
        }
      });

      return result.success;
    } catch (error) {
      console.error('Electron printer error:', error);
      return false;
    }
  }

  return false;
}

export function downloadInvoicePDF(invoice: InvoiceData): void {
  // For now, use print dialog
  // In future, can generate actual PDF with jsPDF or similar
  printInvoice(invoice);
}

