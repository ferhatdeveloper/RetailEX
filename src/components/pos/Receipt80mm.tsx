import { X, Printer, Download, Languages } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Sale, SaleItem } from '../../core/types';
import { formatCurrency, formatMoneyWithCode, getGlobalCurrency, getCurrencyDecimalPlaces } from '../../utils/currency';
import { formatNumber } from '../../utils/formatNumber';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { isPosReceiptPrintFormat, type PosReceiptPrintFormat, type ReceiptSettings } from '../../services/receiptSettingsService';
import type { PrintDesignScope } from '../../core/types/printDesignBindings';
import { getBindingForScope } from '../../services/printDesignBindingService';
import { enqueueFastReportFrxJob, enqueueFastReportTemplateJob, isWindowsPrinterServiceEnabled } from '../../services/unifiedPrintQueueService';
import { useProductStore } from '../../store/useProductStore';
import { resolveProductNameForReceipt } from '../../utils/receiptProductName';
import { getAccountReceiptSystemPrinterName } from '../../utils/restaurantAccountReceiptPrinter';
import { printHtmlInHiddenIframe } from '../../utils/restaurantReceiptPrint';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';
import { RECEIPT_80MM_DOCUMENT_CSS, RECEIPT_80MM_VIEWPORT_FOR_HEADLESS } from '../../utils/receipt80mmDocumentCss';
import { RECEIPT_A4_DOCUMENT_CSS } from '../../utils/receiptA4DocumentCss';
import { RECEIPT_A5_DOCUMENT_CSS } from '../../utils/receiptA5DocumentCss';
import { ReceiptStandardDocument } from './ReceiptStandardDocument';

interface Receipt80mmProps {
  sale: Sale;
  paymentData: any;
  onClose: () => void;
  /** Ödeme ekranında seçilen dil ile önizleme göstermeden doğrudan yazdır; sonra onClose */
  printImmediately?: boolean;
  /** printImmediately ile: fiş metinleri bu dilde (tr | en | ar | ku) */
  initialPrintLanguage?: string;
  /** POS ödeme ekranından gelen kağıt formatı */
  printPaperFormat?: PosReceiptPrintFormat;
  /** Üst bilgi altı kesik çizgili bant (örn. randevu — ödeme alınmadı) */
  headerBanner?: string;
}

const RECEIPT_LANGS = ['tr', 'en', 'ar', 'ku', 'uz'] as const;
type ReceiptLang = (typeof RECEIPT_LANGS)[number];

function isReceiptLang(s: string | undefined): s is ReceiptLang {
  return !!s && (RECEIPT_LANGS as readonly string[]).includes(s);
}

function resolveReceiptDeviceName(sale: Sale): string {
  const beautyDevice = typeof (sale as any).beautyDeviceName === 'string' ? (sale as any).beautyDeviceName.trim() : '';
  if (beautyDevice) return beautyDevice;
  const rawDevice =
    (typeof (sale as any).deviceName === 'string' && (sale as any).deviceName.trim())
    || (typeof (sale as any).device_name === 'string' && (sale as any).device_name.trim())
    || (typeof (sale as any).deviceId === 'string' && (sale as any).deviceId.trim())
    || (typeof (sale as any).device_id === 'string' && (sale as any).device_id.trim())
    || (typeof sale.storeId === 'string' && sale.storeId.trim());
  return rawDevice || '';
}

export function Receipt80mm({
  sale,
  paymentData,
  onClose,
  printImmediately = false,
  initialPrintLanguage,
  printPaperFormat,
  headerBanner
}: Receipt80mmProps) {
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const { language: currentSystemLang, translations: allTranslations, t: tUi } = useLanguage();
  const [selectedLang, setSelectedLang] = useState<ReceiptLang>(() =>
    isReceiptLang(initialPrintLanguage) ? initialPrintLanguage : (currentSystemLang as ReceiptLang)
  );
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const silentPrintStartedRef = useRef(false);

  const receiptFirmNr = useMemo(() => {
    const f = selectedFirm;
    if (!f) return undefined;
    const raw = f.firm_nr ?? f.firma_kodu ?? (f.nr != null ? String(f.nr) : '');
    const s = String(raw).trim().padStart(3, '0').slice(0, 10);
    return s || undefined;
  }, [selectedFirm]);

  useEffect(() => {
    let cancelled = false;
    import('../../services/receiptSettingsService').then(({ getReceiptSettings }) =>
      getReceiptSettings(receiptFirmNr).then((s) => { if (!cancelled) setReceiptSettings(s); })
    ).catch(() => { if (!cancelled) setReceiptSettings({}); });
    return () => { cancelled = true; };
  }, [receiptFirmNr]);

  const defaultReceiptLangAppliedRef = useRef(false);
  /** Ayarlardaki varsayılan fiş dili — parent `initialPrintLanguage` vermediyse bir kez uygulanır */
  useEffect(() => {
    if (printImmediately || defaultReceiptLangAppliedRef.current) return;
    if (isReceiptLang(initialPrintLanguage)) {
      defaultReceiptLangAppliedRef.current = true;
      return;
    }
    const def = receiptSettings?.defaultReceiptLanguage;
    if (isReceiptLang(def)) {
      setSelectedLang(def);
      defaultReceiptLangAppliedRef.current = true;
    }
  }, [receiptSettings?.defaultReceiptLanguage, printImmediately, initialPrintLanguage]);

  const products = useProductStore((s) => s.products);
  const lineProductName = useCallback(
    (item: SaleItem) => {
      const p = products.find((x) => x.id === item.productId);
      const resolved = resolveProductNameForReceipt(
        p ?? { id: item.productId, name: item.productName },
        selectedLang,
        receiptSettings ?? {}
      );
      return (resolved || item.productName || '').slice(0, 28);
    },
    [products, selectedLang, receiptSettings]
  );

  // Get active translations for the selected receipt language
  const t = useMemo(() => {
    const langTrans = (allTranslations as any)[selectedLang] || allTranslations[currentSystemLang];
    // Safety fallback for missing receipt translations
    if (!langTrans.receipt) {
      langTrans.receipt = (allTranslations as any)['tr'].receipt;
    }
    // Uygulama UI dilinde henüz tam `uz` paketi yok — fiş etiketlerini Özbekçe doldur
    if (selectedLang === 'uz') {
      return {
        ...langTrans,
        receipt: {
          ...((allTranslations as any).tr?.receipt || {}),
          title: 'SOTUV CHEKI',
          receiptNo: 'CHEK №',
          date: 'SANA',
          cashier: 'KASSIR',
          customer: 'MIJOZ',
          table: 'STOL',
          device: 'QURILMA',
          staff: 'XODIM',
          operation: 'XIZMAT',
          treatmentDegreeLabel: 'Daraja',
          treatmentShotsLabel: 'Zarba',
          noteLabel: 'IZOH',
          productLabel: 'Mahsulot',
          qtyLabel: 'Soni',
          amountLabel: 'Summa',
          unitPriceLabel: 'Birlik narxi',
          subtotal: 'ORALIQ JAMI',
          discount: 'CHEGIRMA',
          campaign: 'AKSIYA',
          total: 'JAMI',
          paymentDetails: "TO'LOV TAFSILOTLARI",
          paid: "TO'LANGAN",
          change: 'QAYTIM',
          thanks: 'Bizni tanlaganingiz uchun rahmat',
          returnPolicy: "Bu chek qaytarish va almashtirish uchun kerak.",
          footer: 'Professional ERP yechimlari',
          autoPrintReceipt: 'Chekni avtomatik chop etish',
        },
        cash: 'Naqd',
        card: 'Karta',
      };
    }
    return langTrans;
  }, [selectedLang, allTranslations, currentSystemLang]);

  const isRTL = selectedLang === 'ar' || selectedLang === 'ku';
  const receiptDeviceName = resolveReceiptDeviceName(sale);
  const baseCurrency = useMemo(
    () => (selectedFirm?.ana_para_birimi?.trim().toUpperCase() || getGlobalCurrency()),
    [selectedFirm?.ana_para_birimi]
  );
  const moneyDecimals = getCurrencyDecimalPlaces(baseCurrency);
  const fmtMoney = useCallback((amount: number) => formatCurrency(amount), [baseCurrency]);
  const resolvedPaperFormat: PosReceiptPrintFormat =
    isPosReceiptPrintFormat(printPaperFormat) ? printPaperFormat : '80mm';
  const isThermalFormat = resolvedPaperFormat === '80mm';
  const isA5Format = resolvedPaperFormat === 'A5';
  const isA4Format = resolvedPaperFormat === 'A4';
  const receiptVariantClassName = isA4Format ? 'receipt-a4' : isA5Format ? 'receipt-a5' : 'receipt-80mm';
  const receiptWidthMm = resolvedPaperFormat === 'A4' ? 210 : resolvedPaperFormat === 'A5' ? 148 : 80;
  const printPageSize = isThermalFormat ? '80mm auto' : `${resolvedPaperFormat} portrait`;
  const isStandardFormat = isA4Format || isA5Format;
  const printPageMargin = isThermalFormat ? '0' : isA4Format ? '12mm' : isA5Format ? '10mm' : '6mm';
  const documentBaseCss = isThermalFormat
    ? RECEIPT_80MM_DOCUMENT_CSS
    : isA4Format
      ? RECEIPT_A4_DOCUMENT_CSS
      : isA5Format
        ? RECEIPT_A5_DOCUMENT_CSS
        : '';
  const viewportMeta = isThermalFormat ? RECEIPT_80MM_VIEWPORT_FOR_HEADLESS : '';
  const previewModalWidth = isThermalFormat
    ? 'min(94vw, 400px)'
    : resolvedPaperFormat === 'A5'
      ? 'min(96vw, 820px)'
      : 'min(97vw, 1100px)';
  const previewModalHeight = isThermalFormat ? 'min(90vh, 800px)' : 'min(92vh, 920px)';
  const logoMaxWidth = isThermalFormat ? '60mm' : resolvedPaperFormat === 'A5' ? '100mm' : '130mm';
  const receiptVariantCss = `
      .receipt-a4 #receipt-content {
        width: 100% !important;
        max-width: 100% !important;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }
      .receipt-a5 #receipt-content {
        width: 100% !important;
        max-width: 100% !important;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }

      .receipt-a4 .receipt-divider {
        border-top-style: solid !important;
        border-top-width: 2px !important;
        border-top-color: #1e3a8a !important;
        opacity: 0.75;
      }
      .receipt-a4 [data-section="header"] {
        border-bottom-style: solid !important;
        border-bottom-width: 2px !important;
        border-bottom-color: #1d4ed8 !important;
        margin-bottom: 4mm !important;
        padding-bottom: 3.5mm !important;
      }
      .receipt-a4 [data-section="meta"],
      .receipt-a4 [data-section="totals"],
      .receipt-a4 [data-section="payments"] {
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 3mm 3.2mm;
        margin-bottom: 3.5mm;
        background: #f8fafc;
      }
      .receipt-a4 [data-section="items"] thead tr {
        border-bottom: 2px solid #1e3a8a !important;
      }
      .receipt-a4 [data-section="items"] tbody tr {
        border-bottom: 1px solid #cbd5e1 !important;
      }
      .receipt-a4 [data-section="footer"] {
        margin-top: 3mm !important;
        font-size: 12px !important;
      }

      .receipt-a5 #receipt-content {
        font-family: "SF Pro Text", "Segoe UI", Arial, sans-serif;
        background: #ffffff;
        border: 2px solid #0f172a;
        border-radius: 12px;
        padding: 6mm;
      }
      .receipt-a5 .receipt-divider {
        border-top-style: solid !important;
        border-top-width: 1px !important;
        border-top-color: #334155 !important;
        opacity: 0.85;
      }
      .receipt-a5 [data-section="header"] {
        border-bottom-style: solid !important;
        border-bottom-width: 1px !important;
        border-bottom-color: #334155 !important;
        margin-bottom: 3mm !important;
      }
      .receipt-a5 [data-section="meta"] {
        font-size: 12px !important;
        line-height: 1.35 !important;
      }
      .receipt-a5 [data-section="items"] {
        font-size: 11px !important;
      }
      .receipt-a5 [data-section="items"] thead tr {
        border-bottom: 1px solid #0f172a !important;
      }
      .receipt-a5 [data-section="items"] tbody tr {
        border-bottom: 1px dashed #64748b !important;
      }
      .receipt-a5 [data-section="totals"] {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 2.5mm;
      }
      .receipt-a5 [data-section="payments"] {
        font-size: 11px !important;
        margin-top: 2.5mm !important;
      }
      .receipt-a5 [data-section="footer"] {
        font-size: 11px !important;
      }
  `;

  // Add null/undefined checks
  if (!sale || !paymentData) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="bg-white p-6 rounded-lg shadow-xl">
          <p className="text-red-600 font-bold mb-4">Fiş verileri yüklenemedi</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--asin-accent,#1FA8A0)] text-white rounded hover:bg-[#178f88]"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  /** Tauri Edge PDF + tarayıcı yazdır: innerHTML sarmalayıcıyı atladığı için 80mm kayboluyordu — tam fiş DOM'u kullan */
  const getReceiptPrintFragmentHtml = (): string => {
    const block = document.querySelector(`.${receiptVariantClassName}`) as HTMLElement | null;
    const inner = document.getElementById('receipt-content');
    if (block?.outerHTML) return block.outerHTML;
    if (inner?.outerHTML) return inner.outerHTML;
    return inner?.innerHTML ?? '';
  };

  const buildBoundReceiptData = () => ({
    sale,
    receipt: sale,
    paymentData,
    payments: paymentData?.payments ?? [],
    items: sale.items,
    receiptNumber: sale.receiptNumber,
    date: sale.date,
    cashier: sale.cashier,
    customerName: sale.customerName,
    table: sale.table,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    totalPaid: paymentData?.totalPaid ?? 0,
    change: paymentData?.change ?? 0,
    currencyCode: baseCurrency,
    language: selectedLang,
    firmTitle: selectedFirm?.title || selectedFirm?.name || '',
  });

  const runPrint = async (onFinished?: () => void) => {
    setIsPrinting(true);
    try {
      let fragment = getReceiptPrintFragmentHtml();
      if (!fragment?.trim()) {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        fragment = getReceiptPrintFragmentHtml();
      }
      if (!fragment?.trim()) {
        setIsPrinting(false);
        onFinished?.();
        return;
      }
      const fullHtml = `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">${viewportMeta}<title>${t.receipt?.title || 'Fiş'} - ${sale.receiptNumber}</title><style>
      ${documentBaseCss}
      @page { size: ${printPageSize}; margin: ${printPageMargin}; }
      body { padding: ${isThermalFormat ? '2mm 3mm 3mm' : '6mm'}; font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: 700; color: #000; direction: ${isRTL ? 'rtl' : 'ltr'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-x: hidden; }
      .receipt-80mm, .receipt-a5, .receipt-a4, #receipt-content { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
      ${receiptVariantCss}
      * { box-sizing: border-box; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .border-b { border-bottom: 1px solid #000; }
      .border-t { border-top: 1px solid #000; }
      .border-dashed { border-style: dashed; }
    </style></head><body>${fragment}</body></html>`;

      try {
        if (await isWindowsPrinterServiceEnabled()) {
          const scope: PrintDesignScope = headerBanner || sale.table ? 'account_receipt' : 'pos_receipt';
          const binding = await getBindingForScope(selectedFirm?.firm_nr, scope).catch(() => null);
          if (binding?.designId && binding.designKind === 'fastreport_frx') {
            await enqueueFastReportFrxJob({
              designId: binding.designId,
              designName: binding.designName,
              scope,
              data: buildBoundReceiptData(),
              connection: 'system',
              printerName: getAccountReceiptSystemPrinterName(),
              refType: scope,
              refId: sale.id ?? sale.receiptNumber ?? null,
              sourceSystem: 'web',
              priority: 80,
            });
            setIsPrinting(false);
            onFinished?.();
            return;
          }
          if (binding?.designId && binding.designKind === 'design_center') {
            await enqueueFastReportTemplateJob({
              templateId: binding.designId,
              type: 'receipt',
              data: buildBoundReceiptData(),
              connection: 'system',
              printerName: getAccountReceiptSystemPrinterName(),
              refType: scope,
              refId: sale.id ?? sale.receiptNumber ?? null,
              sourceSystem: 'web',
              priority: 80,
            });
            setIsPrinting(false);
            onFinished?.();
            return;
          }
        }
      } catch (e) {
        console.warn('[Receipt80mm] binding enqueue failed, local print fallback:', e);
      }

      if (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || (window as any).__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const printerName = getAccountReceiptSystemPrinterName();
          await invoke('print_html_silent', { html: fullHtml, printerName: printerName ?? null });
          setIsPrinting(false);
          onFinished?.();
          return;
        } catch (e) {
          console.warn('Tauri Edge/Sumatra yazdırma başarısız, WebView yazdırma penceresine geçiliyor:', e);
        }
      }
      /* Ana pencerede window.print(): SPA print stilleri yüzünden boş önizleme — tam HTML iframe’de yazdır */
      try {
        await printHtmlInHiddenIframe(fullHtml);
      } catch (e) {
        console.warn('[Receipt80mm] iframe print:', e);
        const onAfterPrint = () => {
          window.onafterprint = null;
          setIsPrinting(false);
          onFinished?.();
        };
        if (typeof window.onafterprint !== 'undefined') {
          window.onafterprint = onAfterPrint;
        }
        window.print();
        if (typeof window.onafterprint === 'undefined') setTimeout(onAfterPrint, 1500);
        return;
      }
      setIsPrinting(false);
      onFinished?.();
    } catch {
      setIsPrinting(false);
      onFinished?.();
    }
  };

  const handlePrint = () => void runPrint();

  useEffect(() => {
    if (!printImmediately) return;
    if (receiptSettings === null) return;
    if (silentPrintStartedRef.current) return;
    silentPrintStartedRef.current = true;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        void runPrint(() => {
          if (!cancelled) onClose();
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tek seferlik sessiz yazdır; sale/receipt değişiminde yeniden tetiklenme
  }, [printImmediately, receiptSettings]);

  const handleDownload = () => {
    const fragment = getReceiptPrintFragmentHtml();
    if (fragment) {
      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
              <meta charset="utf-8" />
              ${viewportMeta}
              <title>${t.receipt.title} - ${sale.receiptNumber}</title>
              <style>
                ${documentBaseCss}
                @page { size: ${printPageSize}; margin: ${printPageMargin}; }
                body { padding: ${isThermalFormat ? '2mm 3mm 3mm' : '6mm'}; font-family: 'Courier New', Courier, monospace; direction: ${isRTL ? 'rtl' : 'ltr'}; }
                .receipt-80mm, .receipt-a5, .receipt-a4, #receipt-content { width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
                ${receiptVariantCss}
                * { print-color-adjust: exact; -webkit-print-color-adjust: exact; box-sizing: border-box; }
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .border-b { border-bottom: 1px solid #ccc; }
                .border-t { border-top: 1px solid #ccc; }
                .border-dashed { border-style: dashed; }
              </style>
            </head>
            <body>
              ${fragment}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const locale =
      selectedLang === 'ar'
        ? 'ar-SA'
        : selectedLang === 'ku'
          ? 'ku-IQ'
          : selectedLang === 'en'
            ? 'en-GB'
            : selectedLang === 'uz'
              ? 'uz-UZ'
              : 'tr-TR';
    return d.toLocaleDateString(locale) + ' ' + d.toLocaleTimeString(locale);
  };

  const languages = [
    { code: 'tr', label: 'TR', flag: '🇹🇷' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'ar', label: 'AR', flag: '🇮🇶' },
    { code: 'ku', label: 'KU', flag: '☀️' },
    { code: 'uz', label: 'UZ', flag: '🇺🇿' },
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-3 overflow-hidden ${printImmediately ? 'bg-black/50' : 'bg-black/80 backdrop-blur-sm'}`}
    >
      {printImmediately && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl dark:bg-gray-800">
            <span className="inline-block h-8 w-8 border-[3px] border-[var(--asin-accent,#1FA8A0)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Yazdırılıyor...</span>
          </div>
        </div>
      )}
      {/*
        Tauri WebView: Tailwind min()/grid bazen yükseklik üretmez → modal içerikle uzar, scrollbar çıkmaz.
        Sabit yükseklik + flex column + flex:1;minHeight:0;overflow inline ile zorlanır.
      */}
      <div
        className={`flex flex-col rounded-2xl overflow-hidden shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'} ${printImmediately ? `fixed left-[-9999px] top-0 opacity-0 pointer-events-none ${isA4Format ? 'w-[210mm]' : isA5Format ? 'w-[148mm]' : 'w-[min(94vw,400px)]'} h-[min(90vh,800px)]` : ''}`}
        style={{
          width: previewModalWidth,
          maxWidth: previewModalWidth,
          height: previewModalHeight,
          maxHeight: previewModalHeight,
        }}
        aria-hidden={printImmediately}
      >
        {/* Header — yazdır sırasında "Yazdırılıyor" + butonlar pasif */}
        <div className={`shrink-0 px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          } ${printImmediately ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {isPrinting ? (
              <span className="text-sm font-bold text-[var(--asin-accent,#1FA8A0)] dark:text-[var(--asin-accent-muted,#D5F0EE)] flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-[var(--asin-accent,#1FA8A0)] border-t-transparent rounded-full animate-spin" />
                Yazdırılıyor...
              </span>
            ) : (
              <>
                <Languages className={`w-7 h-7 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setSelectedLang(lang.code as any)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedLang === lang.code
                        ? 'bg-white text-[var(--asin-accent,#1FA8A0)] shadow-sm dark:bg-gray-600 dark:text-[var(--asin-accent-muted,#D5F0EE)]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={isPrinting}
              className="p-2.5 rounded-xl transition-colors bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="İndir"
            >
              <Download className="w-6 h-6" />
            </button>
            <button
              onClick={onClose}
              disabled={isPrinting}
              className={`p-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${darkMode
                ? 'hover:bg-gray-700 text-gray-400'
                : 'hover:bg-gray-100 text-gray-600'
                }`}
              title={tUi.closeWithoutPrinting}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Orta: kalan yükseklik = flex-1 + minHeight 0; overflow scroll WebView’da inline şart */}
        <div
          className="receipt-modal-scroll min-h-0 flex-1 bg-slate-50 py-3 px-2 sm:px-3 overscroll-y-contain touch-pan-y"
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowX: 'hidden',
            overflowY: 'scroll',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            className={`${receiptVariantClassName} mx-auto origin-top text-gray-950 antialiased ${isThermalFormat ? 'font-mono text-[14px] font-bold leading-snug print:text-[11px] print:font-bold print:leading-tight' : isA4Format ? 'font-sans text-[13px] font-semibold leading-relaxed print:text-[12px] print:leading-snug' : 'font-sans text-[12px] font-semibold leading-snug print:text-[11px] print:leading-tight'}`}
            style={{ transformOrigin: 'top center', direction: isRTL ? 'rtl' : 'ltr' }}
          >
          <div
            id="receipt-content"
            className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}
            style={{
              width: isStandardFormat ? '100%' : `${receiptWidthMm}mm`,
              maxWidth: isStandardFormat ? '100%' : `${receiptWidthMm}mm`,
              direction: isRTL ? 'rtl' : 'ltr',
            }}
          >
            {isStandardFormat ? (
              <ReceiptStandardDocument
                sale={sale}
                paymentData={paymentData}
                receiptSettings={receiptSettings}
                firmTitle={selectedFirm?.title || selectedFirm?.name || ''}
                translations={{ receipt: t.receipt as Record<string, string | undefined>, cash: t.cash, card: t.card, qrScanCode: t.qrScanCode }}
                fmtMoney={fmtMoney}
                baseCurrency={baseCurrency}
                moneyDecimals={moneyDecimals}
                lineProductName={lineProductName}
                receiptDeviceName={receiptDeviceName}
                headerBanner={headerBanner}
                isRTL={isRTL}
                formatDate={formatDate}
                paperFormat={isA5Format ? 'A5' : 'A4'}
              />
            ) : (
            <>
            {/* Store Header - fiş ayarlarından logo ve firma bilgisi */}
            <div data-section="header" className="text-center border-b-[3px] border-dashed border-gray-900 pb-2 mb-2 receipt-print-dark">
              {receiptSettings?.logoDataUrl && (
                <div className="flex justify-center mb-1">
                  <img src={receiptSettings.logoDataUrl} alt="" className="h-10 w-auto object-contain" style={{ maxWidth: logoMaxWidth }} />
                </div>
              )}
              <div className="text-[1.35rem] font-black mb-0.5 text-gray-950 leading-tight print:text-lg print:font-black">
                {receiptSettings?.companyName || selectedFirm?.name || 'Asin'}
              </div>
              {(receiptSettings?.companyAddress || receiptSettings?.companyPhone) && (
                <div className="text-[12px] font-bold text-gray-900 space-y-0 leading-tight mt-0.5 print:text-[10px] print:font-bold">
                  {receiptSettings.companyAddress && <div className="break-words">{receiptSettings.companyAddress}</div>}
                  {receiptSettings.companyPhone && <div>{receiptSettings.companyPhone}</div>}
                </div>
              )}
              {!receiptSettings?.companyAddress && !receiptSettings?.companyPhone && (
                <div className="text-[12px] font-bold text-gray-900 print:text-[10px] print:font-bold">{t.receipt.footer}</div>
              )}
              <div className="text-[12px] font-bold text-gray-900 mt-0.5 print:text-[10px] print:font-bold">{receiptSettings?.companyName ? (selectedFirm?.title || '') : (selectedFirm?.title || '')}</div>
            </div>

            {headerBanner?.trim() && (
              <div className="text-center border-[3px] border-dashed border-gray-900 rounded-md px-2 py-2 mb-2 text-[12px] font-black tracking-wide text-gray-950 print:text-[11px] print:font-black receipt-print-dark">
                {headerBanner.trim()}
              </div>
            )}

            {/* Receipt Info - yazdırmada koyu */}
            <div data-section="meta" className="text-[14px] mb-2 space-y-0.5 text-gray-950 font-bold print:text-[11px]">
              <div className="flex justify-between">
                <span className="font-extrabold">{t.receipt.receiptNo}:</span>
                <span className="font-black">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-extrabold">{t.receipt.date}:</span>
                <span className="font-bold">{formatDate(sale.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-extrabold">{t.receipt.cashier}:</span>
                <span className="font-bold">{sale.cashier}</span>
              </div>
              {sale.customerName && sale.customerName !== 'Perakende Müşteri' && (
                <div className="flex justify-between">
                  <span className="font-extrabold">{t.receipt.customer}:</span>
                  <span className="font-bold">{sale.customerName}</span>
                </div>
              )}
              {sale.table && (
                <div className="flex justify-between">
                  <span>{t.receipt.table}:</span>
                  <span className="font-bold">{sale.table}</span>
                </div>
              )}
              {receiptDeviceName && (
                <div className="flex justify-between gap-2">
                  <span className="font-extrabold shrink-0">{t.receipt.device}:</span>
                  <span className="font-bold text-end break-words min-w-0">{receiptDeviceName}</span>
                </div>
              )}
              {(() => {
                const deg = (sale.beautyTreatmentDegree ?? '').trim();
                const shots = (sale.beautyTreatmentShots ?? '').trim();
                const hasBeautyLine = sale.items.some((i) => !!(i as SaleItem).beautyStaffName?.trim());
                const show =
                  !!receiptDeviceName || hasBeautyLine || !!deg || !!shots;
                if (!show) return null;
                return (
                  <div className="flex justify-between gap-3 mt-1 text-[13px] font-extrabold text-gray-950 print:text-[11px]">
                    <span className="min-w-0 flex-1">
                      {t.receipt.treatmentDegreeLabel}:{' '}
                      <span className="inline-block min-w-[4.5rem] border-b border-dotted border-gray-900 align-bottom tabular-nums">
                        {deg || '\u00a0'}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      {t.receipt.treatmentShotsLabel}:{' '}
                      <span className="inline-block min-w-[3.5rem] border-b border-dotted border-gray-900 align-bottom tabular-nums">
                        {shots || '\u00a0'}
                      </span>
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const noteText = receiptNotesForDisplay(sale.notes);
                if (!noteText) return null;
                return (
                  <div
                    className={`mt-2 pt-2 border-t border-dashed border-gray-500 text-[12px] text-gray-950 print:text-[10px] ${isRTL ? 'text-right' : 'text-left'}`}
                  >
                    <div className="font-extrabold mb-1 print:font-black">{t.receipt.noteLabel}</div>
                    <div className="font-bold whitespace-pre-wrap break-words leading-snug print:font-semibold">{noteText}</div>
                  </div>
                );
              })()}
            </div>

            <div className="receipt-divider border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Ürün / Adet / Tutar — tablo: yazdırma motorlarında flex bazen tek satıra yapıştırıyordu */}
            <table data-section="items" className="receipt-items-table w-full table-fixed text-[12px] mb-2 font-bold text-gray-950 print:text-[11px] border-collapse">
              <colgroup>
                <col style={{ width: '58%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead>
                <tr className="border-b-[3px] border-black">
                  <th className={`py-1 pr-1 font-black text-left ${isRTL ? 'text-right' : 'text-left'}`}>
                    {(t.receipt as any).productLabel ?? (selectedLang === 'en' ? 'Item' : 'Ürün')}
                  </th>
                  <th className="py-1 text-center font-black w-9">
                    {(t.receipt as any).qtyLabel ?? (selectedLang === 'en' ? 'Qty' : 'Adet')}
                  </th>
                  <th className={`py-1 pl-1 font-black text-right tabular-nums ${isRTL ? 'text-left' : 'text-right'}`}>
                    {(t.receipt as any).amountLabel ?? (selectedLang === 'en' ? 'Amt' : 'Tutar')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, index) => (
                  <tr key={index} className="border-b-2 border-gray-500 align-top">
                    <td className={`py-1 pr-1 ${isRTL ? 'text-right' : 'text-left'}`} style={{ wordBreak: 'break-word' }}>
                      {(() => {
                        const si = item as SaleItem;
                        const beautyCtx = !!(si.beautyStaffName?.trim() || receiptDeviceName);
                        if (beautyCtx) {
                          return (
                            <>
                              <div className="break-words" style={{ wordBreak: 'break-word' }}>
                                <span className="text-[10px] font-black text-gray-600">{t.receipt.operation}: </span>
                                <span className="font-extrabold break-words align-top">{lineProductName(item)}</span>
                              </div>
                              {si.beautyStaffName?.trim() ? (
                                <div className="text-[11px] font-extrabold text-gray-900 mt-0.5 print:text-[10px] print:font-bold">
                                  {t.receipt.staff}: {si.beautyStaffName.trim()}
                                </div>
                              ) : null}
                            </>
                          );
                        }
                        return (
                          <span className="font-extrabold break-words block" style={{ wordBreak: 'break-word' }}>
                            {lineProductName(item)}
                          </span>
                        );
                      })()}
                      {item.variant && (item.variant.color || item.variant.size) && (
                        <div className="text-[11px] font-extrabold text-gray-800 print:text-[10px] print:font-bold">
                          {(item.variant as any).color} {(item.variant as any).size}
                        </div>
                      )}
                      <span className="text-[11px] font-extrabold text-gray-800 block print:text-[10px] print:font-bold">
                        {(() => {
                          const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
                          const unit = (item as any).unit || 'Adet';
                          const basePrice = mult > 1 ? item.price / mult : item.price;
                          return mult > 1 ? `${item.quantity} ${unit} × ${formatNumber(basePrice, moneyDecimals, moneyDecimals > 0)}` : `${item.quantity} × ${formatNumber(item.price, moneyDecimals, moneyDecimals > 0)}`;
                        })()}
                      </span>
                    </td>
                    <td className="py-1 text-center text-[12px] font-black tabular-nums print:text-[10px] align-top">
                      {item.quantity}
                    </td>
                    <td className="py-1 text-end font-black whitespace-nowrap text-[14px] tabular-nums print:text-[11px] align-top">
                      {fmtMoney(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="receipt-divider border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Totals */}
            <div data-section="totals" className="text-[14px] space-y-0.5 mb-2 font-bold print:text-[11px]">
              <div className="flex justify-between">
                <span className="font-extrabold">{t.receipt.subtotal}:</span>
                <span className="font-extrabold tabular-nums">{fmtMoney(sale.subtotal)}</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>{t.receipt.discount}:</span>
                  <span className="tabular-nums">-{fmtMoney(sale.discount)}</span>
                </div>
              )}

              {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignId || sale.campaignName ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-orange-600">
                    <span>{t.receipt.campaign}:</span>
                    {sale.campaignDiscount && sale.campaignDiscount > 0 ? (
                      <span className="font-semibold">-{fmtMoney(sale.campaignDiscount)}</span>
                    ) : (
                      <span className="font-semibold">{fmtMoney(0)}</span>
                    )}
                  </div>
                  {sale.campaignName && (
                    <div className={`text-[12px] font-bold text-gray-800 ${isRTL ? 'pr-2' : 'pl-2'} print:text-[10px] print:font-semibold`}>
                      ({sale.campaignName})
                    </div>
                  )}
                </div>
              ) : null}

              <div className="border-t-2 border-gray-950 my-2"></div>

              <div className="flex justify-between text-[1.05rem] font-black text-gray-950 pt-1 print:text-base print:font-black">
                <span>{t.receipt.total}:</span>
                <span className="tabular-nums">{fmtMoney(sale.total)}</span>
              </div>
            </div>

            <div className="receipt-divider border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Payment Details */}
            <div data-section="payments" className="text-[14px] space-y-0.5 mb-2 font-bold print:text-[11px]">
              <div className="font-black mb-2 text-gray-950 print:font-black">{t.receipt.paymentDetails}:</div>
              {paymentData.payments?.map((payment: any, index: number) => (
                <div key={index} className={`flex justify-between ${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <span>
                    {payment.method === 'cash' ? '💵 ' + t.cash :
                      payment.method === 'card' ? '💳 ' + t.card :
                        '📱 ' + t.qrScanCode}
                    {payment.currency !== baseCurrency && ` (${payment.currency})`}
                  </span>
                  <span>
                    {payment.currency === baseCurrency || !payment.currency
                      ? fmtMoney(payment.amount)
                      : formatMoneyWithCode(payment.amount, payment.currency)
                    }
                  </span>
                </div>
              ))}

              <div className="border-t-2 border-gray-950 my-2"></div>

              <div className="flex justify-between font-extrabold text-gray-950">
                <span>{t.receipt.paid}:</span>
                <span className="tabular-nums font-black">{fmtMoney(paymentData.totalPaid || 0)}</span>
              </div>

              {paymentData.change > 0 && (
                <div className="flex justify-between text-green-800 font-black text-base mt-2 print:text-sm print:font-black">
                  <span>{t.receipt.change}:</span>
                  <span>{fmtMoney(paymentData.change)}</span>
                </div>
              )}
            </div>

            <div className="receipt-divider border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Barcode */}
            <div className="text-center my-2">
              <div className="inline-block px-2 py-1 bg-white border-2 border-gray-600">
                <svg className="mx-auto" width="160" height="36" viewBox="0 0 160 36">
                  {[...Array(20)].map((_, i) => (
                    <rect
                      key={i}
                      x={i * 8}
                      y="0"
                      width={7}
                      height="36"
                      fill="black"
                    />
                  ))}
                </svg>
                <div className="text-[12px] mt-1 font-sans font-black text-gray-950 print:text-[11px] print:font-black">{sale.receiptNumber}</div>
              </div>
            </div>

            {/* Footer — iade uyarısı yazdırılmıyor; alt boşluk minimum */}
            <div data-section="footer" className="text-center text-[12px] text-gray-950 mt-2 font-bold print:text-[11px] print:mt-1 print:mb-0">
              <div className="flex items-center justify-center gap-1 font-black text-gray-950 print:font-black">
                <span>*** {t.receipt.thanks} ***</span>
              </div>
            </div>

            <div className="receipt-divider border-t-[3px] border-dashed border-gray-900 mt-2 print:mt-1 print:mb-0"></div>
            </>
            )}
          </div>
          </div>
        </div>

        {/* Tek yazdırma noktası: WebView ikinci önizleme / çift diyalog riskini azaltır */}
        <div
          className={`print:hidden shrink-0 relative z-10 px-3 sm:px-4 py-3 border-t flex flex-col sm:flex-row gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          } ${printImmediately ? 'hidden' : ''}`}
        >
          <button
            type="button"
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPrinting ? (
              <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Printer className="w-5 h-5 shrink-0" />
            )}
            {tUi.printReceiptLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPrinting}
            className={`flex-1 px-4 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 ${darkMode
              ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
              : 'border-gray-300 text-gray-800 hover:bg-gray-100'
              }`}
          >
            {tUi.closeWithoutPrinting}
          </button>
        </div>
      </div>

      <style>{`
        /* Önizleme: sağda belirgin scrollbar (kaydırma alanı modal içinde kalır) */
        .receipt-modal-scroll {
          scrollbar-width: thin;
          scrollbar-color: #64748b #e2e8f0;
        }
        .receipt-modal-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .receipt-modal-scroll::-webkit-scrollbar-track {
          background: #e2e8f0;
          border-radius: 6px;
        }
        .receipt-modal-scroll::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 6px;
        }
        .receipt-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        ${receiptVariantCss}
        @media print {
          body * {
            visibility: hidden;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
            color: #000 !important;
            font-weight: 700;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            direction: ${isRTL ? 'rtl' : 'ltr'};
            font-size: 11px;
            font-weight: 700;
            overflow: visible;
            min-height: auto !important;
            page-break-after: avoid;
          }
          @page { size: ${printPageSize}; margin: ${printPageMargin}; }
          .receipt-80mm, .receipt-a5, .receipt-a4 { width: 100% !important; max-width: 100% !important; transform: none !important; }
          #receipt-content .receipt-items-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
