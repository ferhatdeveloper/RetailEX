import type { Sale, SaleItem } from '../core/types/models';
import { Capacitor } from '@capacitor/core';
import SunmiPrinter, { SunmiUtils } from './sunmiPrinter';

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

function generateReceiptHTML(sale: any, companyName: string, language: string): string {
  const dateStr = new Date(sale.date).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const labels = language === 'ar' ? {
    receiptNo: 'رقم الإيصال', date: 'التاريخ', cashier: 'أمين الصندوق',
    customer: 'العميل', product: 'المنتج', qty: 'الكمية', amount: 'المبلغ',
    subtotal: 'المجموع الفرعي', discount: 'خصم', total: 'المجموع',
    paymentMethod: 'طريقة الدفع', change: 'الباقي', thanks: 'شكرا لزيارتكم!',
    cash: 'نقدي', card: 'بطاقة'
  } : language === 'ku' ? {
    receiptNo: 'Hejmara Fîşê', date: 'Dîrok', cashier: 'Kasiyer',
    customer: 'Mişterî', product: 'Berhem', qty: 'Hêjmar', amount: 'Sûlav',
    subtotal: 'Bin-Berhev', discount: 'Daxistin', total: 'BERHEV',
    paymentMethod: 'Rêbaza Peredanê', change: 'Baxşîş', thanks: 'Sipas dikin!',
    cash: 'Neqit', card: 'Kart'
  } : language === 'en' ? {
    receiptNo: 'Receipt No', date: 'Date', cashier: 'Cashier',
    customer: 'Customer', product: 'Product', qty: 'Qty', amount: 'Amount',
    subtotal: 'Subtotal', discount: 'Discount', total: 'TOTAL',
    paymentMethod: 'Payment Method', change: 'Change', thanks: 'Thank You For Choosing Us!',
    cash: 'Cash', card: 'Card'
  } : {
    receiptNo: 'Fiş No', date: 'Tarih', cashier: 'Kasiyer',
    customer: 'Müşteri', product: 'Ürün', qty: 'Adet', amount: 'Tutar',
    subtotal: 'Ara Toplam', discount: 'İndirim', total: 'TOPLAM',
    paymentMethod: 'Ödeme Yöntemi', change: 'Para Üstü', thanks: 'Bizi Tercih Ettiğiniz İçin Teşekkür Ederiz!',
    cash: 'Nakit', card: 'Kredi Kartı'
  };

  const isRTL = language === 'ar';

  return `
    <!DOCTYPE html>
    <html dir="${isRTL ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="UTF-8">
      <style>
        @media print { @page { size: 80mm auto; margin: 0; } body { margin: 0; padding: 0; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: ${isRTL ? 'Arial, sans-serif' : "'Courier New', monospace"}; font-size: 11px; line-height: 1.3; width: 80mm; padding: 5mm; background: white; }
        .center { text-align: center; } .bold { font-weight: bold; } .large { font-size: 14px; }
        .divider { border-top: 1px dashed #000; margin: 3mm 0; } .double-divider { border-top: 2px solid #000; margin: 3mm 0; }
        table { width: 100%; border-collapse: collapse; }
        .item-row td { padding: 1mm 0; vertical-align: top; }
        .item-name { width: 55%; text-align: ${isRTL ? 'right' : 'left'}; }
        .item-qty { width: 15%; text-align: center; }
        .item-price { width: 30%; text-align: ${isRTL ? 'left' : 'right'}; }
        .info-row { display: flex; justify-content: space-between; margin: 1mm 0; }
        .barcode { text-align: center; font-size: 10px; letter-spacing: 2px; margin: 3mm 0; }
      </style>
    </head>
    <body>
      <div class="center bold large">${companyName}</div>
      <div class="double-divider"></div>
      <div class="info-row"><span>${labels.receiptNo}:</span><span class="bold">${sale.receiptNumber}</span></div>
      <div class="info-row"><span>${labels.date}:</span><span>${dateStr}</span></div>
      <div class="info-row"><span>${labels.cashier}:</span><span>${sale.cashier}</span></div>
      ${sale.customerName ? `<div class="info-row"><span>${labels.customer}:</span><span>${sale.customerName}</span></div>` : ''}
      <div class="divider"></div>
      <table>
        <thead><tr class="bold"><td class="item-name">${labels.product}</td><td class="item-qty">${labels.qty}</td><td class="item-price">${labels.amount}</td></tr></thead>
        <tbody>
          ${(sale.items as any[]).map(item => `
            <tr class="item-row">
              <td class="item-name">${item.productName}</td>
              <td class="item-qty">${item.quantity}</td>
              <td class="item-price">${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      <table>
        <tr><td>${labels.subtotal}:</td><td class="item-price" style="text-align:right">${sale.subtotal.toFixed(2)}</td></tr>
        ${sale.discount > 0 ? `<tr><td>${labels.discount}:</td><td class="item-price" style="text-align:right">-${sale.discount.toFixed(2)}</td></tr>` : ''}
        <tr class="bold large"><td>${labels.total}:</td><td class="item-price" style="text-align:right">${sale.total.toFixed(2)}</td></tr>
      </table>
      <div class="divider"></div>
      <div class="info-row"><span>${labels.paymentMethod}:</span><span class="bold">${sale.paymentMethod === 'cash' ? labels.cash : labels.card}</span></div>
      ${sale.paymentMethod === 'cash' ? `<div class="info-row"><span>${labels.change}:</span><span class="bold">${sale.change?.toFixed(2) || '0.00'}</span></div>` : ''}
      <div class="double-divider"></div>
      <div class="center" style="margin: 3mm 0; font-size: 10px;">${labels.thanks}</div>
      <div class="barcode">* ${sale.receiptNumber} *</div>
      <div class="center" style="font-size: 8px; margin-top: 3mm; color: #666;">RetailOS - Professional POS System</div>
    </body>
    </html>
  `;
}

export async function printThermalReceipt(sale: any, companyName: string = 'RetailOS', options?: { autoPrint?: boolean, language?: string }) {
  const finalLanguage = options?.language || 'tr';
  if (Capacitor.getPlatform() === 'android') {
    try { await printSunmiReceipt(sale, companyName, finalLanguage); return; }
    catch (e) { console.error('Sunmi failed', e); }
  }

  const receiptHTML = generateReceiptHTML(sale, companyName, finalLanguage);

  if (options?.autoPrint && (window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_html_silent', { html: receiptHTML, printerName: null });
      return;
    } catch (e) { 
      console.error('Tauri silent failed', e);
      // Optional: If you have a toast library like sonner, use it here.
      // For now, we'll log and continue to manual fallback
    }
  }

  // Fallback to manual print window
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (!printWindow) {
    alert(finalLanguage === 'tr' ? 'Yazdırma penceresi engellendi. Lütfen pop-up engelleyiciyi kontrol edin.' : 'Print window blocked. Please check your pop-up blocker.');
    return;
  }
  printWindow.document.write(receiptHTML);
  printWindow.document.close();
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // On some browsers, we need to wait for print dialog to close
      setTimeout(() => {
        if (!printWindow.closed) printWindow.close();
      }, 500);
    }, 500);
  };
}

export async function printReturnReceipt(returnReceipt: ReturnReceipt, companyName: string = 'RetailOS') {
  if (Capacitor.getPlatform() === 'android') {
    try { await printSunmiReturnReceipt(returnReceipt, companyName); return; }
    catch (e) { console.error('Sunmi return failed', e); }
  }
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (!printWindow) return;
  const html = `<html><body><pre>${JSON.stringify(returnReceipt, null, 2)}</pre></body></html>`;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

async function printSunmiReceipt(sale: any, companyName: string, language: string) {
  await SunmiUtils.printHeader(companyName);
  const labels = language === 'ar' ? { subtotal: 'فرعي', total: 'مجموع' } : { subtotal: 'Ara Toplam', total: 'TOPLAM' };
  await SunmiPrinter.printText({ text: `FIS: ${sale.receiptNumber}\n` });
  await SunmiUtils.printDivider();
  for (const item of sale.items as SaleItem[]) {
    await SunmiUtils.printItemRow(item.productName.substring(0, 18), item.quantity.toString(), (item.price * item.quantity).toFixed(2));
  }
  await SunmiUtils.printDivider();
  await SunmiUtils.printLabelValue(labels.subtotal, sale.subtotal.toFixed(2));
  await SunmiPrinter.printTextWithFont({ text: `${labels.total} ${sale.total.toFixed(2)}\n`, fontSize: 32 });
  await SunmiPrinter.lineWrap({ lines: 4 });
}

async function printSunmiReturnReceipt(returnReceipt: ReturnReceipt, companyName: string) {
  await SunmiUtils.printHeader(companyName);
  await SunmiPrinter.printText({ text: `IADE: ${returnReceipt.returnNumber}\n` });
  await SunmiPrinter.lineWrap({ lines: 4 });
}

export async function printTestReceipt() {
  await printThermalReceipt({ receiptNumber: 'TEST', date: new Date().toISOString(), cashier: 'Test', items: [], subtotal: 0, total: 0, paymentMethod: 'cash' });
}
