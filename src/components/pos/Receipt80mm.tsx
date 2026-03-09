import { X, Printer, Download } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Sale } from '../../core/types';
import { formatNumber } from '../../utils/formatNumber';

interface Receipt80mmProps {
  sale: Sale;
  paymentData: any;
  onClose: () => void;
}

export function Receipt80mm({ sale, paymentData, onClose }: Receipt80mmProps) {
  const { darkMode } = useTheme();
  const { t } = useLanguage();

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
    // Create a simple download/save functionality
    const receiptContent = document.getElementById('receipt-content');
    if (receiptContent) {
      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Fiş - ${sale.receiptNumber}</title>
              <style>
                @page { size: 80mm auto; margin: 0; }
                body { margin: 0; padding: 10mm; font-family: monospace; }
                * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
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
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className={`w-full max-w-sm max-h-[95vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'
        }`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center justify-between print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
          <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Ödeme Fişi
          </h3>
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
            className="w-full max-w-[80mm] mx-auto font-mono text-sm"
            style={{ width: '80mm' }}
          >
            {/* Store Header */}
            <div className="text-center border-b-2 border-dashed border-gray-400 pb-3 mb-3">
              <div className="text-2xl font-bold mb-1">ExRetailOS</div>
              <div className="text-xs text-gray-700">Profesyonel Satış Yönetim Sistemi</div>
              <div className="text-xs text-gray-600 mt-1">Bağdat, Irak</div>
            </div>

            {/* Receipt Info */}
            <div className="text-xs mb-3 space-y-0.5">
              <div className="flex justify-between">
                <span>FİŞ NO:</span>
                <span className="font-bold">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>TARİH:</span>
                <span>{formatDate(sale.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>KASİYER:</span>
                <span>{sale.cashier}</span>
              </div>
              {sale.customerName && sale.customerName !== 'Perakende Müşteri' && (
                <div className="flex justify-between">
                  <span>MÜŞTERİ:</span>
                  <span>{sale.customerName}</span>
                </div>
              )}
              {sale.table && (
                <div className="flex justify-between">
                  <span>MASA:</span>
                  <span className="font-bold">{sale.table}</span>
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Items */}
            <div className="text-xs mb-3">
              {sale.items.map((item, index) => (
                <div key={index} className="mb-2">
                  <div className="flex justify-between font-medium">
                    <span className="flex-1">{item.productName}</span>
                  </div>
                  {item.variant && (
                    <div className="text-gray-600 ml-2 text-[10px]">
                      {item.variant.name}
                    </div>
                  )}
                  <div className="flex justify-between ml-2">
                    <span>
                      {item.quantity} x {formatNumber(item.price, 2, true)} IQD
                    </span>
                    <span className="font-medium">
                      {formatNumber(item.total, 2, true)} IQD
                    </span>
                  </div>
                  {item.discount > 0 && (
                    <div className="text-red-600 ml-2 text-[10px]">
                      İndirim: %{item.discount}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Totals */}
            <div className="text-xs space-y-1 mb-3">
              <div className="flex justify-between">
                <span>ARA TOPLAM:</span>
                <span>{formatNumber(sale.subtotal, 2, true)} IQD</span>
              </div>

              {sale.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>İNDİRİM:</span>
                  <span>-{formatNumber(sale.discount, 2, true)} IQD</span>
                </div>
              )}

              {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignId || sale.campaignName ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-orange-600">
                    <span>KAMPANYA:</span>
                    {sale.campaignDiscount && sale.campaignDiscount > 0 ? (
                      <span className="font-semibold">-{formatNumber(sale.campaignDiscount, 2, true)} IQD</span>
                    ) : (
                      <span className="font-semibold">0,00 IQD</span>
                    )}
                  </div>
                  {sale.campaignName && (
                    <div className="text-[10px] text-gray-500 pl-2">
                      ({sale.campaignName})
                    </div>
                  )}
                </div>
              ) : null}

              <div className="border-t border-gray-400 my-2"></div>

              <div className="flex justify-between text-base font-bold">
                <span>TOPLAM:</span>
                <span>{formatNumber(sale.total, 2, true)} IQD</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Payment Details */}
            <div className="text-xs space-y-1 mb-3">
              <div className="font-bold mb-2">ÖDEME DETAYLARI:</div>
              {paymentData.payments?.map((payment: any, index: number) => (
                <div key={index} className="flex justify-between ml-2">
                  <span>
                    {payment.method === 'cash' ? '💵 Nakit' :
                      payment.method === 'card' ? '💳 Kart' :
                        '📱 QR Ödeme'}
                    {payment.currency !== 'IQD' && ` (${payment.currency})`}
                  </span>
                  <span>
                    {payment.currency === 'IQD'
                      ? `${formatNumber(payment.amount, 2, true)} IQD`
                      : `${payment.amount} ${payment.currency}`
                    }
                  </span>
                </div>
              ))}

              <div className="border-t border-gray-400 my-2"></div>

              <div className="flex justify-between font-medium">
                <span>ÖDENEN:</span>
                <span>{formatNumber(paymentData.totalPaid || 0, 2, true)} IQD</span>
              </div>

              {paymentData.change > 0 && (
                <div className="flex justify-between text-green-600 font-bold text-sm mt-2">
                  <span>PARA ÜSTÜ:</span>
                  <span>{formatNumber(paymentData.change, 2, true)} IQD</span>
                </div>
              )}
            </div>

            <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

            {/* Barcode */}
            <div className="text-center my-4">
              <div className="inline-block px-4 py-2 bg-white border border-gray-300">
                <svg className="mx-auto" width="200" height="40">
                  {/* Simple barcode representation */}
                  {[...Array(20)].map((_, i) => (
                    <rect
                      key={i}
                      x={i * 10}
                      y="0"
                      width={Math.random() > 0.5 ? 6 : 3}
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
              <div className="mb-1 flex items-center justify-center gap-1">
                <span>*** Bizi Tercih Ettiğiniz İçin Teşekkürler ***</span>
              </div>
              <div className="text-[10px] text-gray-500">
                Bu fiş iade ve değişim işlemlerinde gereklidir.
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
          }
          #receipt-content, #receipt-content * {
            visibility: visible;
          }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
