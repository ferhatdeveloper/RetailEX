import { X, Printer, Download, Languages } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Sale } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';
import { useState, useMemo } from 'react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';

interface Receipt80mmProps {
  sale: Sale;
  paymentData: any;
  onClose: () => void;
}

export function Receipt80mm({ sale, paymentData, onClose }: Receipt80mmProps) {
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const { language: currentSystemLang, translations: allTranslations } = useLanguage();
  const [selectedLang, setSelectedLang] = useState(currentSystemLang);

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

  const handlePrint = () => {
    window.print();
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className={`w-full max-w-sm max-h-[95vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'
        }`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center justify-between print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
          <div className="flex items-center gap-2">
            <Languages className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code as any)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${selectedLang === lang.code
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-600 dark:text-blue-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              title="Yazdır"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded transition-colors bg-green-600 hover:bg-green-700 text-white"
              title="İndir"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded transition-colors ${darkMode
                ? 'hover:bg-gray-700 text-gray-400'
                : 'hover:bg-gray-100 text-gray-600'
                }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="flex-1 overflow-auto p-6 bg-white">
          <div
            id="receipt-content"
            className={`w-full max-w-[80mm] mx-auto font-mono text-sm ${isRTL ? 'text-right' : 'text-left'}`}
            style={{ width: '80mm', direction: isRTL ? 'rtl' : 'ltr' }}
          >
            {/* Store Header */}
            <div className="text-center border-b-2 border-dashed border-gray-400 pb-3 mb-3">
              <div className="text-2xl font-bold mb-1">{selectedFirm?.name || 'RetailEX'}</div>
              <div className="text-xs text-gray-700">{t.receipt.footer}</div>
              <div className="text-xs text-gray-600 mt-1">{selectedFirm?.title || ''}</div>
            </div>

            {/* Receipt Info */}
            <div className="text-xs mb-3 space-y-0.5">
              <div className="flex justify-between">
                <span>{t.receipt.receiptNo}:</span>
                <span className="font-bold">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.receipt.date}:</span>
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

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Items */}
            <div className="text-xs mb-3">
              {sale.items.map((item, index) => (
                <div key={index} className="mb-2">
                  <div className={`flex justify-between font-medium ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="flex-1 text-xs">{item.productName}</span>
                  </div>
                  {item.variant && (
                    <div className={`${isRTL ? 'mr-2' : 'ml-2'} text-gray-600 text-[10px]`}>
                      {item.variant.color && `${t.color}: ${item.variant.color}`} {item.variant.size && `${t.size}: ${item.variant.size}`}
                    </div>
                  )}
                  <div className={`flex justify-between ${isRTL ? 'mr-2' : 'ml-2'}`}>
                    <span>
                      {(() => {
                        const mult = (item as any).multiplier && (item as any).multiplier > 1 ? (item as any).multiplier : 1;
                        const unit = (item as any).unit || 'Adet';
                        const basePrice = mult > 1 ? item.price / mult : item.price;
                        return mult > 1
                          ? `${item.quantity} ${unit} (=${item.quantity * mult} Adet) x ${formatNumber(basePrice, 0, true)}`
                          : `${item.quantity} ${unit} x ${formatNumber(item.price, 0, true)}`;
                      })()} IQD
                    </span>
                    <span className="font-bold">
                      {formatNumber(item.total, 0, true)} IQD
                    </span>
                  </div>
                  {item.discount > 0 && (
                    <div className={`text-red-600 ${isRTL ? 'mr-2' : 'ml-2'} text-[10px]`}>
                      {t.receipt.discount}: %{item.discount}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Totals */}
            <div className="text-xs space-y-1 mb-3">
              <div className="flex justify-between">
                <span>{t.receipt.subtotal}:</span>
                <span>{formatNumber(sale.subtotal, 0, true)} IQD</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>{t.receipt.discount}:</span>
                  <span>-{formatNumber(sale.discount, 0, true)} IQD</span>
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
                    <div className={`text-[10px] text-gray-500 ${isRTL ? 'pr-2' : 'pl-2'}`}>
                      ({sale.campaignName})
                    </div>
                  )}
                </div>
              ) : null}

              <div className="border-t border-gray-400 my-2"></div>

              <div className="flex justify-between text-base font-bold">
                <span>{t.receipt.total}:</span>
                <span>{formatNumber(sale.total, 0, true)} IQD</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Payment Details */}
            <div className="text-xs space-y-1 mb-3">
              <div className="font-bold mb-2">{t.receipt.paymentDetails}:</div>
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

              <div className="border-t border-gray-400 my-2"></div>

              <div className="flex justify-between font-medium">
                <span>{t.receipt.paid}:</span>
                <span>{formatNumber(paymentData.totalPaid || 0, 0, true)} IQD</span>
              </div>

              {paymentData.change > 0 && (
                <div className="flex justify-between text-green-600 font-bold text-sm mt-2">
                  <span>{t.receipt.change}:</span>
                  <span>{formatNumber(paymentData.change, 0, true)} IQD</span>
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Barcode */}
            <div className="text-center my-4">
              <div className="inline-block px-4 py-2 bg-white border border-gray-300">
                <svg className="mx-auto" width="200" height="40">
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
                <div className="text-[10px] mt-1 font-sans">{sale.receiptNumber}</div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-600 mt-4">
              <div className="mb-1 flex items-center justify-center gap-1 font-bold">
                <span>*** {t.receipt.thanks} ***</span>
              </div>
              <div className="text-[10px] text-gray-500">
                {t.receipt.returnPolicy}
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-400 mt-4"></div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
            -webkit-print-color-adjust: exact;
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            direction: ${isRTL ? 'rtl' : 'ltr'};
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
