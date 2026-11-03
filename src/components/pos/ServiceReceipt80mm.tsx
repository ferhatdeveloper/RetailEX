import { useEffect, useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { formatNumber } from '../../utils/formatNumber';
import { ModalLayer } from '../shared/FullscreenBodyPortal';
import { PrintFirmBrand } from '../shared/PrintFirmBrand';
import { getReceiptSettings } from '../../services/receiptSettingsService';
import { resolvePrintFirmName } from '../../utils/printFirmHeader';
import { formatPrintDateTime } from '../../utils/dateLocale';

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
    const { t } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const [logoDataUrl, setLogoDataUrl] = useState('');
    const [receiptCompanyName, setReceiptCompanyName] = useState('');
    useEffect(() => {
        let cancelled = false;
        const nr = selectedFirm?.firm_nr != null ? String(selectedFirm.firm_nr) : undefined;
        void getReceiptSettings(nr)
            .then((rs) => {
                if (cancelled) return;
                setLogoDataUrl(rs.logoDataUrl || '');
                setReceiptCompanyName(rs.companyName || '');
            })
            .catch(() => {
                if (!cancelled) {
                    setLogoDataUrl('');
                    setReceiptCompanyName('');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedFirm?.firm_nr]);
    const firmName = useMemo(
        () =>
            resolvePrintFirmName({
                receiptCompanyName,
                firmaAdi: selectedFirm?.firma_adi,
                title: selectedFirm?.title,
                name: selectedFirm?.name,
            }),
        [receiptCompanyName, selectedFirm],
    );

    const handlePrint = () => {
        window.print();
    };

    const formatDate = (date: string) => formatPrintDateTime(date);

    return (
        <ModalLayer className="bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-sm max-h-[95vh] flex flex-col shadow-2xl ${darkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white'}`}>

                {/* Header */}
                <div className={`px-4 py-3 border-b flex items-center justify-between print:hidden ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                    <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {t.receipt.title}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="p-2 rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                            title={String(t.print)}
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
                    <div id="receipt-content" className="w-full max-w-[72mm] mx-auto font-mono text-[13px] leading-tight text-black font-medium">

                        {/* Store Header */}
                        <div className="text-center border-b-2 border-dashed border-black pb-1 mb-1">
                            <PrintFirmBrand firmName={firmName} logoDataUrl={logoDataUrl} nameClassName="text-[14px] font-semibold mb-0 text-black" />
                            <div className="text-[12px] text-black">{String(t.tagline)}</div>
                        </div>

                        {/* Info */}
                        <div className="text-[13px] mb-1 space-y-0">
                            <div className="flex justify-between">
                                <span>{String(t.dateLabel).toUpperCase()}:</span>
                                <span>{formatDate(data.date)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>REF NO:</span>
                                <span className="font-bold">{data.transactionId}</span>
                            </div>
                        </div>

                        <div className="border-t-2 border-dashed border-black my-1"></div>

                        {/* Transaction Details */}
                        <div className="text-center mb-1">
                            <div className="font-semibold text-[14px] mb-0 text-black">
                                {data.type === 'internal' ? String(t.balanceLoading) : String(t.serviceTopUp)}
                            </div>
                            <div className="text-[13px] font-medium text-black">{data.provider.toUpperCase()}</div>
                            <div className="text-[12px] mt-0">{String(t.transactionNumberLabel)}:</div>
                            <div className="font-mono text-base font-bold my-1">{data.target}</div>
                        </div>

                        <div className="border-t-2 border-dashed border-black my-1"></div>

                        {/* Amount */}
                        <div className="text-[13px] space-y-0 mb-1">
                            <div className="flex justify-between text-[14px] font-semibold">
                                <span>{String(t.amountLabel).toUpperCase()}:</span>
                                <span>{formatNumber(data.amount, 2, true)} {data.currency}</span>
                            </div>
                            <div className="flex justify-between text-[13px] mt-0 text-black">
                                <span>{String(t.paymentMethodLabel)}:</span>
                                <span>
                                    {data.paymentMethod === 'cash' ? String(t.paymentCash) :
                                        data.paymentMethod === 'card' ? String(t.paymentCardPOS) :
                                            data.paymentMethod.toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <div className="border-t-2 border-dashed border-black my-1"></div>

                        {/* Warning for Top-up */}
                        {data.type === 'service' && (
                            <div className="text-[12px] text-center font-semibold mb-1 border border-black p-1 space-y-0 text-black">
                                <div>{String(t.digitalProductSaleNotice)}</div>
                                <div>{String(t.noReturnPolicyNotice)}</div>
                                {(data as any).smsSent && (
                                    <div className="flex items-center justify-center gap-1 text-black pt-0 border-t border-dashed border-black mt-1">
                                        <span className="text-[12px] font-medium">✔ {String(t.smsNotificationSent)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="text-center text-[13px] text-black font-semibold mt-1">
                            <div className="mb-1 font-bold">{String(t.thanksForChoosingUs)}</div>
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
          @page { size: 80mm auto; margin: 0; }
          html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; }
          #receipt-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 72mm !important;
            max-width: 72mm !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 2mm !important;
            color: #000 !important;
            font-size: 13px !important;
            font-weight: 500;
            line-height: 1.2 !important;
          }
          #receipt-content, #receipt-content * { color: #000 !important; }
          #receipt-content .rx-firm-name { font-weight: 600 !important; }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
        </ModalLayer>
    );
}


