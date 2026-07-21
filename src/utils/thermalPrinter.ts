import { getStoredWindowsPrinterNameForPrint } from './tauriPrintSettings';
import { RECEIPT_80MM_DOCUMENT_CSS, RECEIPT_80MM_VIEWPORT_FOR_HEADLESS } from './receipt80mmDocumentCss';
import { getBindingForScope } from '../services/printDesignBindingService';
import { enqueueFastReportFrxJob, enqueueFastReportTemplateJob, enqueuePrintJob, isWindowsPrinterServiceEnabled } from '../services/unifiedPrintQueueService';

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

export interface ReceiptSettingsForPrint {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  logoDataUrl?: string;
}

function generateReceiptHTML(sale: any, companyName: string, language: string, receiptSettings?: ReceiptSettingsForPrint | null): string {
  const dateStr = new Date(sale.date).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const displayName = receiptSettings?.companyName || companyName;
  const logoHtml = receiptSettings?.logoDataUrl
    ? `<div class="center" style="margin-bottom: 2mm;"><img src="${receiptSettings.logoDataUrl}" alt="" style="max-height: 12mm; width: auto; display: block; margin: 0 auto;" /></div>`
    : '';
  const companyLines = [receiptSettings?.companyAddress, receiptSettings?.companyPhone].filter(Boolean);
  const companyLinesHtml = companyLines.length
    ? `<div class="center" style="font-size: 9px; margin-bottom: 2mm;">${companyLines.join(' | ')}</div>`
    : '';

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
      ${RECEIPT_80MM_VIEWPORT_FOR_HEADLESS}
      <style>
        ${RECEIPT_80MM_DOCUMENT_CSS}
        @media print { body { margin: 0; padding: 0; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: ${isRTL ? 'Arial, sans-serif' : "'Courier New', monospace"}; font-size: 9px; line-height: 1.25; width: 100%; max-width: 100%; padding: 3mm; background: white; color: #000; font-weight: 500; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-x: hidden; }
        .center { text-align: center; } .bold { font-weight: bold; } .large { font-size: 11px; }
        .divider { border-top: 1px dashed #000; margin: 2mm 0; } .double-divider { border-top: 2px solid #000; margin: 2mm 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
        .item-row td { padding: 0.5mm 1mm; vertical-align: top; word-wrap: break-word; }
        .item-name { width: 48%; text-align: ${isRTL ? 'right' : 'left'}; font-size: 9px; word-break: break-word; }
        .item-qty { width: 12%; text-align: center; }
        .item-price { width: 40%; text-align: ${isRTL ? 'left' : 'right'}; font-weight: bold; white-space: nowrap; min-width: 0; }
        .info-row { display: flex; justify-content: space-between; margin: 0.5mm 0; }
        .barcode { text-align: center; font-size: 8px; letter-spacing: 1px; margin: 2mm 0; }
      </style>
    </head>
    <body>
      ${logoHtml}
      <div class="center bold large">${displayName}</div>
      ${companyLinesHtml}
      <div class="double-divider"></div>
      <div class="info-row"><span>${labels.receiptNo}:</span><span class="bold">${sale.receiptNumber}</span></div>
      <div class="info-row"><span>${labels.date}:</span><span>${dateStr}</span></div>
      <div class="info-row"><span>${labels.cashier}:</span><span>${sale.cashier}</span></div>
      ${sale.customerName ? `<div class="info-row"><span>${labels.customer}:</span><span>${sale.customerName}</span></div>` : ''}
      <div class="divider"></div>
      <table>
        <thead><tr class="bold"><td class="item-name">${labels.product}</td><td class="item-qty">${labels.qty}</td><td class="item-price">${labels.amount}</td></tr></thead>
        <tbody>
          ${(sale.items as any[]).map((item: any) => {
        const name = (item.productName || '').slice(0, 24);
        const total = (item.price * item.quantity);
        return `<tr class="item-row"><td class="item-name">${name}</td><td class="item-qty">${item.quantity}</td><td class="item-price">${total.toFixed(2)}</td></tr>`;
      }).join('')}
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
      <div class="center" style="margin: 3mm 0; font-size: 10px; color: #000; font-weight: 600;">${labels.thanks}</div>
      <div class="barcode" style="color: #000;">* ${sale.receiptNumber} *</div>
      <div class="center" style="font-size: 8px; margin-top: 3mm; color: #000; font-weight: 500;">RetailOS - Professional POS System</div>
    </body>
    </html>
  `;
}

function buildPosReceiptPrintData(sale: any, companyName: string, language: string, receiptSettings?: ReceiptSettingsForPrint | null) {
  return {
    sale,
    receipt: sale,
    items: Array.isArray(sale?.items) ? sale.items : [],
    storeName: receiptSettings?.companyName || companyName,
    storeAddress: receiptSettings?.companyAddress || '',
    storePhone: receiptSettings?.companyPhone || '',
    receiptNumber: sale?.receiptNumber ?? '',
    date: sale?.date ?? new Date().toISOString(),
    cashier: sale?.cashier ?? '',
    customerName: sale?.customerName ?? '',
    subtotal: sale?.subtotal ?? 0,
    discount: sale?.discount ?? 0,
    total: sale?.total ?? 0,
    paymentMethod: sale?.paymentMethod ?? '',
    change: sale?.change ?? 0,
    language,
  };
}

export async function printThermalReceipt(sale: any, companyName: string = 'RetailOS', options?: { autoPrint?: boolean, language?: string; receiptSettings?: ReceiptSettingsForPrint | null }) {
  const finalLanguage = options?.language || 'tr';
  let receiptSettings = options?.receiptSettings;
  if (receiptSettings === undefined) {
    try {
      const { getReceiptSettings } = await import('../services/receiptSettingsService');
      receiptSettings = await getReceiptSettings();
    } catch {
      receiptSettings = null;
    }
  }
  const receiptHTML = generateReceiptHTML(sale, companyName, finalLanguage, receiptSettings);

  try {
    if (await isWindowsPrinterServiceEnabled()) {
      const binding = await getBindingForScope(undefined, 'pos_receipt').catch(() => null);
      if (binding?.designId && binding.designKind === 'fastreport_frx') {
        await enqueueFastReportFrxJob({
          designId: binding.designId,
          designName: binding.designName,
          scope: 'pos_receipt',
          data: buildPosReceiptPrintData(sale, companyName, finalLanguage, receiptSettings),
          connection: 'system',
          printerName: getStoredWindowsPrinterNameForPrint(),
          refType: 'pos_sale',
          refId: sale?.id ?? sale?.receiptNumber ?? null,
          sourceSystem: 'web',
          priority: 80,
        });
        return;
      }
      if (binding?.designId && binding.designKind === 'design_center') {
        await enqueueFastReportTemplateJob({
          templateId: binding.designId,
          type: 'receipt',
          data: buildPosReceiptPrintData(sale, companyName, finalLanguage, receiptSettings),
          connection: 'system',
          printerName: getStoredWindowsPrinterNameForPrint(),
          refType: 'pos_sale',
          refId: sale?.id ?? sale?.receiptNumber ?? null,
          sourceSystem: 'web',
          priority: 80,
        });
        return;
      }
      await enqueuePrintJob({
        jobType: 'pos_receipt_80',
        connection: 'system',
        printerName: getStoredWindowsPrinterNameForPrint(),
        locale: finalLanguage,
        refType: 'pos_sale',
        refId: sale?.id ?? sale?.receiptNumber ?? null,
        payload: {
          kind: 'pos_receipt_80',
          html: receiptHTML,
          paperHint: '80mm',
          receiptNumber: sale?.receiptNumber ?? null,
        },
      });
      return;
    }
  } catch (error) {
    console.warn('[thermalPrinter] unified enqueue failed, local print fallback:', error);
  }

  if (options?.autoPrint && (window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const printerName = getStoredWindowsPrinterNameForPrint();
      await invoke('print_html_silent', { html: receiptHTML, printerName: printerName ?? null });
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
  const html = `<html><body><pre>${JSON.stringify(returnReceipt, null, 2)}</pre></body></html>`;
  try {
    if (await isWindowsPrinterServiceEnabled()) {
      await enqueuePrintJob({
        jobType: 'pos_receipt_80',
        connection: 'system',
        printerName: getStoredWindowsPrinterNameForPrint(),
        refType: 'pos_return',
        refId: returnReceipt.id || returnReceipt.returnNumber,
        payload: {
          kind: 'pos_receipt_80',
          html,
          paperHint: '80mm',
          companyName,
          receiptNumber: returnReceipt.returnNumber,
        },
      });
      return;
    }
  } catch (error) {
    console.warn('[thermalPrinter] return enqueue failed, local print fallback:', error);
  }

  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

export async function printTestReceipt() {
  await printThermalReceipt({ receiptNumber: 'TEST', date: new Date().toISOString(), cashier: 'Test', items: [], subtotal: 0, total: 0, paymentMethod: 'cash' });
}
