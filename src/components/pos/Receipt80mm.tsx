import { X, Printer, Download, Languages } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Sale } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { useState, useMemo, useEffect } from 'react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import type { ReceiptSettings } from '../../services/receiptSettingsService';

interface Receipt80mmProps {
  sale: Sale;
  paymentData: any;
  onClose: () => void;
}

export function Receipt80mm({ sale, paymentData, onClose }: Receipt80mmProps) {
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const { language: currentSystemLang, translations: allTranslations, t: tUi } = useLanguage();
  const [selectedLang, setSelectedLang] = useState(currentSystemLang);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

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

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const receiptContent = document.getElementById('receipt-content');
      if (!receiptContent) {
        window.print();
        setTimeout(() => setIsPrinting(false), 1500);
        return;
      }
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t.receipt?.title || 'Fiş'} - ${sale.receiptNumber}</title><style>
      /* 80mm auto: içerik yüksekliği kadar sayfa — alt boş kağıt azalır */
      @page { size: 80mm auto; margin: 0; }
      @media print { @page { size: 80mm auto; margin: 0; } }
      body { margin: 0; padding: 8mm; font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: 600; color: #000; direction: ${isRTL ? 'rtl' : 'ltr'}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .border-b { border-bottom: 1px solid #000; }
      .border-t { border-top: 1px solid #000; }
      .border-dashed { border-style: dashed; }
    </style></head><body>${receiptContent.innerHTML}</body></html>`;

      if (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || (window as any).__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('print_html_silent', { html: fullHtml, printerName: null });
          setIsPrinting(false);
          return;
        } catch (e) {
          console.warn('Tauri Edge/Sumatra yazdırma başarısız, WebView yazdırma penceresine geçiliyor:', e);
        }
      }
      const onAfterPrint = () => {
        window.onafterprint = null;
        setIsPrinting(false);
      };
      if (typeof window.onafterprint !== 'undefined') {
        window.onafterprint = onAfterPrint;
      }
      window.print();
      if (typeof window.onafterprint === 'undefined') setTimeout(onAfterPrint, 1500);
    } catch {
      setIsPrinting(false);
    }
  };

  const handleDownload = () => {
    const receiptContent = document.getElementById('receipt-content');
    if (receiptContent) {
      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${t.receipt.title} - ${sale.receiptNumber}</title>
              <style>
                @page { size: 80mm auto; margin: 0; }
                body { margin: 0; padding: 10mm; font-family: 'Courier New', Courier, monospace; direction: ${isRTL ? 'rtl' : 'ltr'}; }
                * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
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
              ${receiptContent.innerHTML}
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-3 overflow-hidden">
      {/*
        Tauri WebView: Tailwind min()/grid bazen yükseklik üretmez → modal içerikle uzar, scrollbar çıkmaz.
        Sabit yükseklik + flex column + flex:1;minHeight:0;overflow inline ile zorlanır.
      */}
      <div
        className={`flex flex-col rounded-2xl overflow-hidden shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
        style={{
          /* ~400px üst sınır: eski max-w-md (448) kadar geniş değil, dar sütun da değil */
          width: 'min(94vw, 400px)',
          maxWidth: 'min(94vw, 400px)',
          height: 'min(90vh, 800px)',
          maxHeight: 'min(90vh, 800px)',
        }}
      >
        {/* Header — yazdır sırasında "Yazdırılıyor" + butonlar pasif */}
        <div className={`shrink-0 px-3 sm:px-4 py-3 border-b flex items-center justify-between gap-2 print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
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
            className="receipt-80mm mx-auto font-mono origin-top max-w-[min(100%,80mm)] text-[13px] font-semibold leading-snug text-gray-950 antialiased print:text-[10px] print:font-medium print:leading-tight"
            style={{ transformOrigin: 'top center', direction: isRTL ? 'rtl' : 'ltr' }}
          >
          <div
            id="receipt-content"
            className={`w-full max-w-[80mm] ${isRTL ? 'text-right' : 'text-left'}`}
            style={{ width: '80mm', maxWidth: '80mm', direction: isRTL ? 'rtl' : 'ltr' }}
          >
            {/* Store Header - fiş ayarlarından logo ve firma bilgisi */}
            <div className="text-center border-b-2 border-dashed border-gray-800 pb-2 mb-2 receipt-print-dark">
              {receiptSettings?.logoDataUrl && (
                <div className="flex justify-center mb-1">
                  <img src={receiptSettings.logoDataUrl} alt="" className="h-10 w-auto max-w-[60mm] object-contain" />
                </div>
              )}
              <div className="text-xl font-extrabold mb-0.5 text-gray-900 leading-tight print:text-lg print:font-bold">
                {receiptSettings?.companyName || selectedFirm?.name || 'RetailEX'}
              </div>
              {(receiptSettings?.companyAddress || receiptSettings?.companyPhone) && (
                <div className="text-[12px] font-semibold text-gray-900 space-y-0 leading-tight mt-0.5 print:text-[9px] print:font-medium">
                  {receiptSettings.companyAddress && <div className="break-words">{receiptSettings.companyAddress}</div>}
                  {receiptSettings.companyPhone && <div>{receiptSettings.companyPhone}</div>}
                </div>
              )}
              {!receiptSettings?.companyAddress && !receiptSettings?.companyPhone && (
                <div className="text-[12px] font-semibold text-gray-900 print:text-[9px]">{t.receipt.footer}</div>
              )}
              <div className="text-[12px] font-semibold text-gray-900 mt-0.5 print:text-[9px]">{receiptSettings?.companyName ? (selectedFirm?.title || '') : (selectedFirm?.title || '')}</div>
            </div>

            {/* Receipt Info - yazdırmada koyu */}
            <div className="text-[13px] mb-2 space-y-0.5 text-gray-900 font-semibold print:text-[10px]">
              <div className="flex justify-between">
                <span className="font-bold">{t.receipt.receiptNo}:</span>
                <span className="font-extrabold">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">{t.receipt.date}:</span>
                <span>{formatDate(sale.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.receipt.cashier}:</span>
                <span>{sale.cashier}</span>
              </div>
              {sale.customerName && sale.customerName !== 'Perakende Müşteri' && (
                <div className="flex justify-between">
                  <span>{t.receipt.customer}:</span>
                  <span>{sale.customerName}</span>
                </div>
              )}
              {sale.table && (
                <div className="flex justify-between">
                  <span>{t.receipt.table}:</span>
                  <span className="font-bold">{sale.table}</span>
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-gray-800 my-3"></div>

            {/* Ürün / Adet / Tutar — sütunlar 80mm içinde kırpılmaz */}
            <div className="text-[11px] mb-1 font-extrabold text-gray-900 flex gap-1 border-b-2 border-gray-900 pb-1 print:text-[9px] print:font-bold print:border-gray-800">
              <span className="min-w-0 flex-1">{(t.receipt as any).productLabel ?? (selectedLang === 'en' ? 'Item' : 'Ürün')}</span>
              <span className="w-9 shrink-0 text-center">{((t.receipt as any).qtyLabel ?? (selectedLang === 'en' ? 'Qty' : 'Adet'))}</span>
              <span className="w-[4.75rem] shrink-0 text-end tabular-nums">{((t.receipt as any).amountLabel ?? (selectedLang === 'en' ? 'Amt' : 'Tutar'))}</span>
            </div>
            <div className="text-[13px] mb-2 w-full font-semibold print:text-[10px] print:font-medium">
              {sale.items.map((item, index) => (
                <div key={index} className="flex gap-1 mb-1 items-start border-b border-gray-200 pb-0.5 text-gray-900">
                  <div className={`min-w-0 flex-1 ${isRTL ? 'text-right' : 'text-left'}`} style={{ wordBreak: 'break-word' }}>
                    <span className="font-bold break-words block" style={{ wordBreak: 'break-word' }}>{(item.productName || '').slice(0, 28)}</span>
                    {item.variant && (item.variant.color || item.variant.size) && (
                      <div className="text-[11px] font-bold text-gray-700 print:text-[9px] print:font-medium">{(item.variant as any).color} {(item.variant as any).size}</div>
                    )}
                    <span className="text-[11px] font-bold text-gray-700 block print:text-[9px] print:font-medium">
                      {(() => {
                        const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
                        const unit = (item as any).unit || 'Adet';
                        const basePrice = mult > 1 ? item.price / mult : item.price;
                        return mult > 1 ? `${item.quantity} ${unit} × ${formatNumber(basePrice, 0, true)}` : `${item.quantity} × ${formatNumber(item.price, 0, true)}`;
                      })()}
                    </span>
                  </div>
                  <span className="w-9 shrink-0 text-center text-[12px] font-extrabold text-gray-900 pt-0.5 tabular-nums print:text-[9px] print:font-bold">{item.quantity}</span>
                  <span className="w-[4.75rem] shrink-0 text-end font-extrabold whitespace-nowrap text-[13px] tabular-nums pt-0.5 print:text-[10px] print:font-bold">
                    {formatNumber(item.total, 0, true)} IQD
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-800 my-3"></div>

            {/* Totals */}
            <div className="text-[13px] space-y-0.5 mb-2 font-semibold print:text-[10px]">
              <div className="flex justify-between">
                <span className="font-bold">{t.receipt.subtotal}:</span>
                <span className="font-bold tabular-nums">{formatNumber(sale.subtotal, 0, true)} IQD</span>
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

              <div className="border-t border-gray-800 my-2"></div>

              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-1 print:text-sm print:font-bold">
                <span>{t.receipt.total}:</span>
                <span className="tabular-nums">{formatNumber(sale.total, 0, true)} IQD</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-800 my-3"></div>

            {/* Payment Details */}
            <div className="text-[13px] space-y-0.5 mb-2 font-semibold print:text-[10px]">
              <div className="font-extrabold mb-2 text-gray-900 print:font-bold">{t.receipt.paymentDetails}:</div>
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

              <div className="border-t border-gray-800 my-2"></div>

              <div className="flex justify-between font-bold text-gray-900">
                <span>{t.receipt.paid}:</span>
                <span className="tabular-nums">{formatNumber(paymentData.totalPaid || 0, 0, true)} IQD</span>
              </div>

              {paymentData.change > 0 && (
                <div className="flex justify-between text-green-700 font-extrabold text-base mt-2 print:text-sm print:font-bold">
                  <span>{t.receipt.change}:</span>
                  <span>{formatNumber(paymentData.change, 0, true)} IQD</span>
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-gray-800 my-3"></div>

            {/* Barcode */}
            <div className="text-center my-2">
              <div className="inline-block px-2 py-1 bg-white border border-gray-300">
                <svg className="mx-auto" width="160" height="32">
                  {[...Array(20)].map((_, i) => (
                    <rect
                      key={i}
                      x={i * 10}
                      y="0"
                      width={6}
                      height="40"
                      fill="black"
                    />
                  ))}
                </svg>
                <div className="text-[12px] mt-1 font-sans font-extrabold text-gray-900 print:text-[10px] print:font-bold">{sale.receiptNumber}</div>
              </div>
            </div>

            {/* Footer — iade uyarısı yazdırılmıyor; alt boşluk minimum */}
            <div className="text-center text-[12px] text-gray-900 mt-2 font-semibold print:text-[9px] print:mt-1 print:mb-0">
              <div className="flex items-center justify-center gap-1 font-extrabold text-gray-900 print:font-bold">
                <span>*** {t.receipt.thanks} ***</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-800 mt-2 print:mt-1 print:mb-0"></div>
          </div>
          </div>
        </div>

        {/* Tek yazdırma noktası: WebView ikinci önizleme / çift diyalog riskini azaltır */}
        <div
          className={`print:hidden shrink-0 relative z-10 px-3 sm:px-4 py-3 border-t flex flex-col sm:flex-row gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
            }`}
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
            font-weight: 600;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
            max-width: 80mm !important;
            direction: ${isRTL ? 'rtl' : 'ltr'};
            font-size: 10px;
            font-weight: 600;
            overflow: visible;
            min-height: auto !important;
            page-break-after: avoid;
          }
          @page { size: 80mm auto; margin: 0; }
          .receipt-80mm { width: 80mm !important; max-width: 80mm !important; transform: none !important; }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
