import { X, Printer } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatNumber } from '../../utils/formatNumber';

interface ServiceReceiptProps {
    data: {
        type: 'internal' | 'service';
        provider: string; // 'Fastlink', 'Korek', 'System'
        target: string; // Name or Phone
        amount: number;
        currency: string;
        transactionId: string;
        date: string;
        paymentMethod: string;
    };
    onClose: () => void;
}

export function ServiceReceipt80mm({ data, onClose }: ServiceReceiptProps) {
    const { darkMode } = useTheme();
    const { t, language } = useLanguage();

    const localeMap: Record<string, string> = { tr: 'tr-TR', en: 'en-US', ar: 'ar-IQ', ku: 'ku' };
    const dateLocale = localeMap[language] || 'tr-TR';

    const handlePrint = () => {
        window.print();
    };

    const formatDate = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString(dateLocale) + ' ' + d.toLocaleTimeString(dateLocale);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <div className={`w-full max-w-sm max-h-[95vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>

                {/* Header */}
                <div className={`px-4 py-3 border-b flex items-center justify-between print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                    <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {t.receipt}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="p-2 rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                            title={t.print}
                        >
                            <Printer className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Receipt Content */}
                <div className="flex-1 overflow-auto p-6 bg-white text-black">
                    <div id="receipt-content" className="w-full max-w-[80mm] mx-auto font-mono text-sm">

                        {/* Store Header */}
                        <div className="text-center border-b-2 border-dashed border-gray-400 pb-3 mb-3">
                            <div className="text-xl font-bold mb-1">{t.defaultCompanyName}</div>
                            <div className="text-xs text-gray-700">{t.tagline}</div>
                        </div>

                        {/* Info */}
                        <div className="text-xs mb-3 space-y-1">
                            <div className="flex justify-between">
                                <span>{t.dateLabel.toUpperCase()}:</span>
                                <span>{formatDate(data.date)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>REF NO:</span>
                                <span className="font-bold">{data.transactionId}</span>
                            </div>
                        </div>

                        <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

                        {/* Transaction Details */}
                        <div className="text-center mb-4">
                            <div className="font-bold text-lg mb-1">
                                {data.type === 'internal' ? t.balanceLoading : t.serviceTopUp}
                            </div>
                            <div className="text-sm font-semibold text-gray-700">{data.provider.toUpperCase()}</div>
                            <div className="text-xs mt-1">{t.transactionNumberLabel}:</div>
                            <div className="font-mono text-base font-bold my-1">{data.target}</div>
                        </div>

                        <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

                        {/* Amount */}
                        <div className="text-xs space-y-1 mb-3">
                            <div className="flex justify-between text-base font-bold">
                                <span>{t.amountLabel.toUpperCase()}:</span>
                                <span>{formatNumber(data.amount, 2, true)} {data.currency}</span>
                            </div>
                            <div className="flex justify-between text-xs mt-2 text-gray-600">
                                <span>{t.paymentMethodLabel}:</span>
                                <span>
                                    {data.paymentMethod === 'cash' ? t.paymentCash :
                                        data.paymentMethod === 'card' ? t.paymentCardPOS :
                                            data.paymentMethod.toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <div className="border-t-2 border-dashed border-gray-400 my-3"></div>

                        {/* Warning for Top-up */}
                        {data.type === 'service' && (
                            <div className="text-xs text-center font-bold mb-3 border border-black p-2 space-y-1">
                                <div>{t.digitalProductSaleNotice}</div>
                                <div>{t.noReturnPolicyNotice}</div>
                                {(data as any).smsSent && (
                                    <div className="flex items-center justify-center gap-1 text-green-600 pt-1 border-t border-dashed border-gray-400 mt-1">
                                        <span className="text-[10px]">✔ {t.smsNotificationSent}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="text-center text-xs text-gray-600 mt-4">
                            <div className="mb-1 font-bold">{t.thanksForChoosingUs}</div>
                        </div>

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


