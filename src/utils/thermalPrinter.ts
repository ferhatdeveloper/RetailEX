import { getStoredWindowsPrinterNameForPrint } from './tauriPrintSettings';
import { RECEIPT_80MM_DOCUMENT_CSS, RECEIPT_80MM_VIEWPORT_FOR_HEADLESS } from './receipt80mmDocumentCss';
import { getBindingForScope } from '../services/printDesignBindingService';
import { enqueueFastReportFrxJob, enqueueFastReportTemplateJob, enqueuePrintJob, isWindowsPrinterServiceEnabled } from '../services/unifiedPrintQueueService';
import { getPrintString, resolvePrintLocale, type PrintStringKey } from '../locales/printKeys';
import { buildCenteredFirmHeaderHtml, resolvePrintFirmName } from './printFirmHeader';

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

  const displayName =
    resolvePrintFirmName({
      receiptCompanyName: receiptSettings?.companyName,
      title: companyName,
      name: companyName,
    }) || String(receiptSettings?.companyName || companyName || '').trim();
  const firmHeaderHtml = buildCenteredFirmHeaderHtml({
    firmName: displayName,
    logoDataUrl: receiptSettings?.logoDataUrl,
    nameStyle: 'text-align:center;font-weight:600;font-size:14px;color:#000;line-height:1.15',
  });
  const companyLines = [receiptSettings?.companyAddress, receiptSettings?.companyPhone].filter(Boolean);
  const companyLinesHtml = companyLines.length
    ? `<div class="center" style="font-size: 12px; color: #000; font-weight: 500; margin-bottom: 1mm;">${companyLines.join(' | ')}</div>`
    : '';

  const locale = resolvePrintLocale(language);
  const t = (key: PrintStringKey): string => getPrintString(locale, key);
  const labels = language === 'ar' ? {
    receiptNo: t('invoiceNo'), date: t('date'), cashier: 'أمين الصندوق',
    customer: t('customer'), product: t('itemName'), qty: t('itemCount'), amount: t('lineTotal'),
    subtotal: t('subtotal'), discount: t('discount'), total: t('total'),
    paymentMethod: 'طريقة الدفع', change: t('change'), thanks: t('thankYou'),
    cash: 'نقدي', card: 'بطاقة'
  } : language === 'ku' ? {
    receiptNo: t('invoiceNo'), date: t('date'), cashier: 'Kasiyer',
    customer: t('customer'), product: t('itemName'), qty: t('itemCount'), amount: t('lineTotal'),
    subtotal: t('subtotal'), discount: t('discount'), total: t('total'),
    paymentMethod: 'Rêbaza Peredanê', change: t('change'), thanks: t('thankYou'),
    cash: 'Neqit', card: 'Kart'
  } : language === 'en' ? {
    receiptNo: t('invoiceNo'), date: t('date'), cashier: 'Cashier',
    customer: t('customer'), product: t('itemName'), qty: t('itemCount'), amount: t('lineTotal'),
    subtotal: t('subtotal'), discount: t('discount'), total: t('total'),
    paymentMethod: 'Payment Method', change: t('change'), thanks: t('thankYou'),
    cash: 'Cash', card: 'Card'
  } : {
    receiptNo: t('invoiceNo'), date: t('date'), cashier: 'Kasiyer',
    customer: t('customer'), product: t('itemName'), qty: t('itemCount'), amount: t('lineTotal'),
    subtotal: t('subtotal'), discount: t('discount'), total: t('total'),
    paymentMethod: 'Ödeme Yöntemi', change: t('change'), thanks: t('thankYou'),
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
        * { box-sizing: border-box; }
        body { font-family: ${isRTL ? 'Arial, sans-serif' : "'Courier New', monospace"}; background: #fff; }
        .center { text-align: center; } .bold { font-weight: 600; } .large { font-size: 14px; font-weight: 600; }
        .divider { border-top: 1px dashed #000; margin: 1.5mm 0; } .double-divider { border-top: 2px solid #000; margin: 1.5mm 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
        .item-row td { padding: 0 1mm; vertical-align: top; word-wrap: break-word; }
        .item-name { width: 48%; text-align: ${isRTL ? 'right' : 'left'}; font-size: 13px; word-break: break-word; color: #000; }
        .item-qty { width: 12%; text-align: center; }
        .item-price { width: 40%; text-align: ${isRTL ? 'left' : 'right'}; font-weight: 600; white-space: nowrap; min-width: 0; }
        .info-row { display: flex; justify-content: space-between; margin: 0; line-height: 1.2; }
        .barcode { text-align: center; font-size: 12px; letter-spacing: 1px; margin: 1mm 0; color: #000; }
      </style>
    </head>
    <body>
      ${firmHeaderHtml}
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
      <div class="center" style="margin: 1mm 0; font-size: 13px; color: #000; font-weight: 600;">${labels.thanks}</div>
      <div class="barcode" style="color: #000;">* ${sale.receiptNumber} *</div>
      <div class="center" style="font-size: 12px; margin-top: 1mm; color: #000; font-weight: 500;">RetailOS - Professional POS System</div>
    </body>
    </html>
  `;
}

function buildPosReceiptPrintData(sale: any, companyName: string, language: string, receiptSettings?: ReceiptSettingsForPrint | null) {
  return {
    sale,
    receipt: sale,
    items: Array.isArray(sale?.items) ? sale.items : [],
    storeName:
      resolvePrintFirmName({
        receiptCompanyName: receiptSettings?.companyName,
        title: companyName,
        name: companyName,
      }) || String(receiptSettings?.companyName || companyName || '').trim(),
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
  const { resolveSystemPrinterName } = await import('./resolveSystemPrinterName');
  const printerName = await resolveSystemPrinterName(getStoredWindowsPrinterNameForPrint());

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
          printerName,
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
          printerName,
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
        printerName,
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
  const { loadCenteredFirmHeader } = await import('./printFirmHeader');
  const header = await loadCenteredFirmHeader({
    firm: { receiptCompanyName: companyName, title: companyName, name: companyName },
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>İade fişi</title><style>${RECEIPT_80MM_DOCUMENT_CSS}.center{text-align:center} pre{margin:0;font-size:13px;line-height:1.2;color:#000;white-space:pre-wrap}</style></head><body>${header.html}<pre>${JSON.stringify(returnReceipt, null, 2)}</pre></body></html>`;
  try {
    if (await isWindowsPrinterServiceEnabled()) {
      await enqueuePrintJob({
        jobType: 'pos_receipt_80',
        connection: 'system',
        printerName: await (async () => {
          const { resolveSystemPrinterName } = await import('./resolveSystemPrinterName');
          return resolveSystemPrinterName(getStoredWindowsPrinterNameForPrint());
        })(),
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
