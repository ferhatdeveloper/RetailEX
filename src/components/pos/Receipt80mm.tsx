import { X, Printer, Download, Languages } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Sale, SaleItem } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import type { ReceiptSettings } from '../../services/receiptSettingsService';
import { useProductStore } from '../../store/useProductStore';
import { resolveProductNameForReceipt } from '../../utils/receiptProductName';
import { getAccountReceiptSystemPrinterName } from '../../utils/restaurantAccountReceiptPrinter';
import { printHtmlInHiddenIframe } from '../../utils/restaurantReceiptPrint';
import { receiptNotesForDisplay } from '../../utils/receiptNotes';

interface Receipt80mmProps {
  sale: Sale;
  paymentData: any;
  onClose: () => void;
  /** Ödeme ekranında seçilen dil ile önizleme göstermeden doğrudan yazdır; sonra onClose */
  printImmediately?: boolean;
  /** printImmediately ile: fiş metinleri bu dilde (tr | en | ar | ku) */
  initialPrintLanguage?: string;
  /** Üst bilgi altı kesik çizgili bant (örn. randevu — ödeme alınmadı) */
  headerBanner?: string;
}

const RECEIPT_LANGS = ['tr', 'en', 'ar', 'ku'] as const;
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

export function Receipt80mm({ sale, paymentData, onClose, printImmediately = false, initialPrintLanguage, headerBanner }: Receipt80mmProps) {
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
    return langTrans;
  }, [selectedLang, allTranslations, currentSystemLang]);

  const isRTL = selectedLang === 'ar' || selectedLang === 'ku';
  const receiptDeviceName = resolveReceiptDeviceName(sale);

  // Add null/undefined checks
  if (!sale || !paymentData) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="bg-white p-6 rounded-lg shadow-xl">
          <p className="text-red-600 font-bold mb-4">Fiş verileri yüklenemedi</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  /** Tauri Edge PDF + tarayıcı yazdır: innerHTML sarmalayıcıyı atladığı için 80mm kayboluyordu — tam fiş DOM'u kullan */
  const getReceiptPrintFragmentHtml = (): string => {
    const block = document.querySelector('.receipt-80mm') as HTMLElement | null;
    const inner = document.getElementById('receipt-content');
    if (block?.outerHTML) return block.outerHTML;
    if (inner?.outerHTML) return inner.outerHTML;
    return inner?.innerHTML ?? '';
  };

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
      const fullHtml = `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t.receipt?.title || 'Fiş'} - ${sale.receiptNumber}</title><style>
      /* 80mm termal: sayfa ve gövde aynı genişlik — Edge PDF / Sumatra ile A4’e yayılma önlenir */
      @page { size: 80mm auto; margin: 0; }
      @media print { @page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 0 !important; } }
      html, body { margin: 0; padding: 0; width: 80mm; max-width: 80mm; box-sizing: border-box; }
      body { padding: 2mm 3mm 3mm; font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: 700; color: #000; direction: ${isRTL ? 'rtl' : 'ltr'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-x: hidden; }
      .receipt-80mm, #receipt-content { width: 80mm !important; max-width: 80mm !important; box-sizing: border-box; }
      * { box-sizing: border-box; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .border-b { border-bottom: 1px solid #000; }
      .border-t { border-top: 1px solid #000; }
      .border-dashed { border-style: dashed; }
    </style></head><body>${fragment}</body></html>`;

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
              <title>${t.receipt.title} - ${sale.receiptNumber}</title>
              <style>
                @page { size: 80mm auto; margin: 0; }
                html, body { margin: 0; padding: 0; width: 80mm; max-width: 80mm; box-sizing: border-box; }
                body { padding: 2mm 3mm 3mm; font-family: 'Courier New', Courier, monospace; direction: ${isRTL ? 'rtl' : 'ltr'}; }
                .receipt-80mm, #receipt-content { width: 80mm !important; max-width: 80mm !important; box-sizing: border-box; }
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
    const locale = selectedLang === 'ar' ? 'ar-SA' : selectedLang === 'ku' ? 'ku-IQ' : 'tr-TR';
    return d.toLocaleDateString(locale) + ' ' + d.toLocaleTimeString(locale);
  };

  const languages = [
    { code: 'tr', label: 'TR', flag: '🇹🇷' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'ar', label: 'AR', flag: '🇮🇶' },
    { code: 'ku', label: 'KU', flag: '☀️' }
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-3 overflow-hidden ${printImmediately ? 'bg-black/50' : 'bg-black/80 backdrop-blur-sm'}`}
    >
      {printImmediately && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-6 py-4 shadow-xl dark:bg-gray-800">
            <span className="inline-block h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Yazdırılıyor...</span>
          </div>
        </div>
      )}
      {/*
        Tauri WebView: Tailwind min()/grid bazen yükseklik üretmez → modal içerikle uzar, scrollbar çıkmaz.
        Sabit yükseklik + flex column + flex:1;minHeight:0;overflow inline ile zorlanır.
      */}
      <div
        className={`flex flex-col rounded-2xl overflow-hidden shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'} ${printImmediately ? 'fixed left-[-9999px] top-0 opacity-0 pointer-events-none w-[min(94vw,400px)] h-[min(90vh,800px)]' : ''}`}
        style={{
          /* ~400px üst sınır: eski max-w-md (448) kadar geniş değil, dar sütun da değil */
          width: 'min(94vw, 400px)',
          maxWidth: 'min(94vw, 400px)',
          height: 'min(90vh, 800px)',
          maxHeight: 'min(90vh, 800px)',
        }}
        aria-hidden={printImmediately}
      >
        {/* Header — yazdır sırasında "Yazdırılıyor" + butonlar pasif */}
        <div className={`shrink-0 px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          } ${printImmediately ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {isPrinting ? (
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
                        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-600 dark:text-blue-400'
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
            className="receipt-80mm mx-auto font-mono origin-top max-w-[min(100%,80mm)] text-[14px] font-bold leading-snug text-gray-950 antialiased print:text-[11px] print:font-bold print:leading-tight"
            style={{ transformOrigin: 'top center', direction: isRTL ? 'rtl' : 'ltr' }}
          >
          <div
            id="receipt-content"
            className={`w-full max-w-[80mm] ${isRTL ? 'text-right' : 'text-left'}`}
            style={{ width: '80mm', maxWidth: '80mm', direction: isRTL ? 'rtl' : 'ltr' }}
          >
            {/* Store Header - fiş ayarlarından logo ve firma bilgisi */}
            <div className="text-center border-b-[3px] border-dashed border-gray-900 pb-2 mb-2 receipt-print-dark">
              {receiptSettings?.logoDataUrl && (
                <div className="flex justify-center mb-1">
                  <img src={receiptSettings.logoDataUrl} alt="" className="h-10 w-auto max-w-[60mm] object-contain" />
                </div>
              )}
              <div className="text-[1.35rem] font-black mb-0.5 text-gray-950 leading-tight print:text-lg print:font-black">
                {receiptSettings?.companyName || selectedFirm?.name || 'RetailEX'}
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
            <div className="text-[14px] mb-2 space-y-0.5 text-gray-950 font-bold print:text-[11px]">
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

            <div className="border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Ürün / Adet / Tutar — tablo: yazdırma motorlarında flex bazen tek satıra yapıştırıyordu */}
            <table className="receipt-items-table w-full table-fixed text-[12px] mb-2 font-bold text-gray-950 print:text-[11px] border-collapse">
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
                          return mult > 1 ? `${item.quantity} ${unit} × ${formatNumber(basePrice, 0, true)}` : `${item.quantity} × ${formatNumber(item.price, 0, true)}`;
                        })()}
                      </span>
                    </td>
                    <td className="py-1 text-center text-[12px] font-black tabular-nums print:text-[10px] align-top">
                      {item.quantity}
                    </td>
                    <td className="py-1 text-end font-black whitespace-nowrap text-[14px] tabular-nums print:text-[11px] align-top">
                      {formatNumber(item.total, 0, true)} IQD
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Totals */}
            <div className="text-[14px] space-y-0.5 mb-2 font-bold print:text-[11px]">
              <div className="flex justify-between">
                <span className="font-extrabold">{t.receipt.subtotal}:</span>
                <span className="font-extrabold tabular-nums">{formatNumber(sale.subtotal, 0, true)} IQD</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>{t.receipt.discount}:</span>
                  <span className="tabular-nums">-{formatNumber(sale.discount, 0, true)} IQD</span>
                </div>
              )}

              {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignId || sale.campaignName ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-orange-600">
                    <span>{t.receipt.campaign}:</span>
                    {sale.campaignDiscount && sale.campaignDiscount > 0 ? (
                      <span className="font-semibold">-{formatNumber(sale.campaignDiscount, 0, true)} IQD</span>
                    ) : (
                      <span className="font-semibold">0 IQD</span>
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
                <span className="tabular-nums">{formatNumber(sale.total, 0, true)} IQD</span>
              </div>
            </div>

            <div className="border-t-[3px] border-dashed border-gray-900 my-3"></div>

            {/* Payment Details */}
            <div className="text-[14px] space-y-0.5 mb-2 font-bold print:text-[11px]">
              <div className="font-black mb-2 text-gray-950 print:font-black">{t.receipt.paymentDetails}:</div>
              {paymentData.payments?.map((payment: any, index: number) => (
                <div key={index} className={`flex justify-between ${isRTL ? 'mr-2' : 'ml-2'}`}>
                  <span>
                    {payment.method === 'cash' ? '💵 ' + t.cash :
                      payment.method === 'card' ? '💳 ' + t.card :
                        '📱 ' + t.qrScanCode}
                    {payment.currency !== 'IQD' && ` (${payment.currency})`}
                  </span>
                  <span>
                    {payment.currency === 'IQD'
                      ? `${formatNumber(payment.amount, 0, true)} IQD`
                      : `${payment.amount} ${payment.currency}`
                    }
                  </span>
                </div>
              ))}

              <div className="border-t-2 border-gray-950 my-2"></div>

              <div className="flex justify-between font-extrabold text-gray-950">
                <span>{t.receipt.paid}:</span>
                <span className="tabular-nums font-black">{formatNumber(paymentData.totalPaid || 0, 0, true)} IQD</span>
              </div>

              {paymentData.change > 0 && (
                <div className="flex justify-between text-green-800 font-black text-base mt-2 print:text-sm print:font-black">
                  <span>{t.receipt.change}:</span>
                  <span>{formatNumber(paymentData.change, 0, true)} IQD</span>
                </div>
              )}
            </div>

            <div className="border-t-[3px] border-dashed border-gray-900 my-3"></div>

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
            <div className="text-center text-[12px] text-gray-950 mt-2 font-bold print:text-[11px] print:mt-1 print:mb-0">
              <div className="flex items-center justify-center gap-1 font-black text-gray-950 print:font-black">
                <span>*** {t.receipt.thanks} ***</span>
              </div>
            </div>

            <div className="border-t-[3px] border-dashed border-gray-900 mt-2 print:mt-1 print:mb-0"></div>
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            width: 80mm !important;
            max-width: 80mm !important;
            direction: ${isRTL ? 'rtl' : 'ltr'};
            font-size: 11px;
            font-weight: 700;
            overflow: visible;
            min-height: auto !important;
            page-break-after: avoid;
          }
          @page { size: 80mm auto; margin: 0; }
          .receipt-80mm { width: 80mm !important; max-width: 80mm !important; transform: none !important; }
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
