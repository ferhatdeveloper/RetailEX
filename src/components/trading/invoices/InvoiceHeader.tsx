
import React from 'react';
import { MoreVertical, Barcode, History, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface InvoiceType {
    code: number;
    name: string;
    category: 'Satis' | 'Alis' | 'Iade' | 'Irsaliye' | 'Siparis' | 'Teklif' | 'Hizmet';
}

interface InvoiceHeaderProps {
    invoiceType: InvoiceType;
    isFormExpanded: boolean;
    setIsFormExpanded: (expanded: boolean) => void;

    // Data Fields
    invoiceNo: string;
    transactionDate: string;
    setTransactionDate: (val: string) => void;
    time: string;
    setTime: (val: string) => void;
    documentNo: string;
    setDocumentNo: (val: string) => void;
    customerBarcode: string;
    setCustomerBarcode: (val: string) => void;
    editDate: string;
    setEditDate: (val: string) => void;
    specialCode: string;
    setSpecialCode: (val: string) => void;
    tradingGroup: string;
    setTradingGroup: (val: string) => void;
    authorizationCode: string;
    setAuthorizationCode: (val: string) => void;

    supplierCode: string;
    customerCode: string;
    setCustomerCode: (val: string) => void;
    supplierTitle: string;
    customerTitle: string;

    paymentMethod: string;
    /** Gösterim etiketi (çevrilmiş); yoksa paymentMethod ham değeri kullanılır */
    paymentMethodLabel?: string;
    warehouse: string;
    workplace: string;
    salespersonCode: string;
    cashierName?: string;
    onCashierNameChange?: (val: string) => void;
    cashierReadOnly?: boolean;
    showCashierField?: boolean;
    cashierFieldLabel?: string;
    setSupplierCode?: (val: string) => void;

    // Modal Triggers
    setShowTransactionDateModal: (val: boolean) => void;
    setShowEditDateModal: (val: boolean) => void;
    setShowSpecialCodeModal: (val: boolean) => void;
    setShowTradingGroupModal: (val: boolean) => void;
    setShowAuthorizationModal: (val: boolean) => void;
    setShowCustomerModal: (val: boolean) => void;
    setShowSupplierModal: (val: boolean) => void;
    setShowPaymentInfoModal: (val: boolean) => void;
    setShowWorkplaceModal: (val: boolean) => void;
    setShowWarehouseModal: (val: boolean) => void;
    setShowSalespersonModal: (val: boolean) => void;

    // Supplier History
    setSelectedSupplierHistory: (val: { id: string, name: string } | null) => void;
    setShowSupplierHistory: (val: boolean) => void;

    // Styling (computed in parent or we can move logic here)
    cariBorderColor: string;
    cariTextColor: string;
    selectedCariBalance?: number | null;
    selectedCariPhone?: string | null;
    selectedCariCurrency?: string;
}

export const InvoiceHeader: React.FC<InvoiceHeaderProps> = ({
    invoiceType,
    isFormExpanded,
    setIsFormExpanded,
    invoiceNo,
    transactionDate,
    setTransactionDate,
    time,
    setTime,
    documentNo,
    setDocumentNo,
    customerBarcode,
    setCustomerBarcode,
    editDate,
    setEditDate,
    specialCode,
    setSpecialCode,
    tradingGroup,
    setTradingGroup,
    authorizationCode,
    setAuthorizationCode,
    supplierCode,
    customerCode,
    setCustomerCode,
    supplierTitle,
    customerTitle,
    paymentMethod,
    paymentMethodLabel,
    warehouse,
    workplace,
    salespersonCode,
    cashierName = '',
    onCashierNameChange,
    cashierReadOnly = false,
    showCashierField = false,
    cashierFieldLabel,

    setShowTransactionDateModal,
    setShowEditDateModal,
    setShowSpecialCodeModal,
    setShowTradingGroupModal,
    setShowAuthorizationModal,
    setShowCustomerModal,
    setShowSupplierModal,
    setShowPaymentInfoModal,
    setShowWorkplaceModal,
    setShowWarehouseModal,
    setShowSalespersonModal,

    setSelectedSupplierHistory,
    setShowSupplierHistory,
    cariBorderColor,
    cariTextColor,
    setSupplierCode,
    selectedCariBalance,
    selectedCariPhone,
    selectedCariCurrency = 'IQD',
}) => {
    const { tm } = useLanguage();
    const cashierLabel = cashierFieldLabel || tm('cashier');
    const cariTitle = invoiceType.category === 'Alis' ? supplierTitle : customerTitle;
    const showCariMeta = Boolean(cariTitle?.trim());

    const primaryPaymentCodes = ['ACIK_CARI', 'NAKIT', 'KREDIKARTI'] as const;
    const resolvedPaymentCode = (() => {
        const raw = String(paymentMethod || '').trim().toUpperCase();
        if (!raw || raw === 'ACIK_CARI') return 'ACIK_CARI';
        if (primaryPaymentCodes.includes(raw as (typeof primaryPaymentCodes)[number])) return raw;
        return raw;
    })();

    const paymentDisplayLabel =
        paymentMethodLabel ||
        (resolvedPaymentCode === 'ACIK_CARI' ? tm('paymentOpenAccount') : paymentMethod);

    const paymentModalTriggerEl = (
        <div className="flex gap-1 min-w-0">
            <input
                type="text"
                readOnly
                value={paymentDisplayLabel}
                className="w-[8.5rem] sm:w-[10.5rem] px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer truncate focus:outline-none focus:ring-1 focus:ring-blue-500"
                onClick={() => setShowPaymentInfoModal(true)}
            />
            <button
                type="button"
                onClick={() => setShowPaymentInfoModal(true)}
                className="shrink-0 px-1.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
                title={tm('paymentInfo')}
            >
                <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
            </button>
        </div>
    );

    const paymentExtraLabel =
        !primaryPaymentCodes.includes(resolvedPaymentCode as (typeof primaryPaymentCodes)[number]) &&
        paymentMethodLabel
            ? paymentMethodLabel
            : null;

    const openCariModal = () => {
        if (invoiceType.category === 'Alis') {
            setShowSupplierModal(true);
        } else {
            setShowCustomerModal(true);
        }
    };

    const cariSummaryEl = (
        <div className="inline-flex items-center gap-1.5 flex-1 min-w-[10rem] max-w-sm">
            <span className={`text-[11px] font-semibold uppercase whitespace-nowrap shrink-0 ${cariTextColor}`}>
                {invoiceType.category === 'Alis' ? tm('supplier') : tm('customer')}
            </span>
            <div className="flex gap-1 min-w-0 flex-1">
                <input
                    type="text"
                    value={invoiceType.category === 'Alis' ? supplierTitle : customerTitle}
                    readOnly
                    placeholder={`${tm('selectCurrent')}...`}
                    className={`flex-1 min-w-0 px-2 py-1 border-2 rounded text-sm bg-white cursor-pointer font-medium hover:border-gray-400 transition-colors truncate ${cariBorderColor}`}
                    onClick={openCariModal}
                />
                <button
                    type="button"
                    onClick={openCariModal}
                    className="shrink-0 px-1.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                    <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                </button>
            </div>
        </div>
    );

    const cariMetaBadges = showCariMeta ? (
        <div className="flex flex-wrap items-center gap-2">
            {selectedCariBalance != null && (
                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 w-fit">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{tm('balanceShort')}:</span>
                    <span className={`text-xs font-black ${(selectedCariBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(selectedCariBalance ?? 0)}{' '}
                        <span className="text-[10px] opacity-70">{selectedCariCurrency}</span>
                    </span>
                </div>
            )}
            {selectedCariPhone?.trim() ? (
                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 w-fit">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{tm('phoneShort')}:</span>
                    <span className="text-xs font-semibold text-gray-800">{selectedCariPhone.trim()}</span>
                </div>
            ) : null}
        </div>
    ) : null;

    return (
        <div className="bg-white rounded border border-gray-200 px-3 py-2 mb-3">
            {/* Form Header - Collapse/Expand */}
            <button
                onClick={() => setIsFormExpanded(!isFormExpanded)}
                className="w-full flex items-center justify-between mb-2 pb-1.5 border-b border-gray-200 hover:bg-gray-50 -mx-3 px-3 py-1.5 rounded transition-colors"
            >
                <span className="text-sm font-medium text-gray-700">{tm('invoiceInfo')}</span>
                {isFormExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
            </button>

            {isFormExpanded ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Column 1 - Fatura Bilgileri */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('invoiceCode')}</label>
                            <input
                                type="text"
                                value={invoiceNo}
                                readOnly
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('date')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={transactionDate}
                                    onChange={(e) => setTransactionDate(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowTransactionDateModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('time')}</label>
                            <input
                                type="text"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('documentNo')}</label>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('barcode')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={customerBarcode}
                                    onChange={(e) => setCustomerBarcode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                                    placeholder={tm('scanBarcodePlaceholder')}
                                />
                                <button className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                                    <Barcode className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Column 2 - Devam */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('editDate')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowEditDateModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('specialCode')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={specialCode}
                                    onChange={(e) => setSpecialCode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowSpecialCodeModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('tradingGroup')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={tradingGroup}
                                    onChange={(e) => setTradingGroup(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                                />
                                <button
                                    onClick={() => setShowTradingGroupModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('authorization')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={authorizationCode}
                                    onChange={(e) => setAuthorizationCode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                                />
                                <button
                                    onClick={() => setShowAuthorizationModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Column 3 - Cari Hesap Bilgileri */}
                    <div className="space-y-3">
                        <div>
                            <div className={`border-2 rounded p-2 mb-3 ${cariBorderColor}`}>
                                <div className={`${cariTextColor} text-xs font-medium`}>
                                    {tm('currentAccountInfo')}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('accountCodeLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={invoiceType.category === 'Alis' ? supplierCode : (customerCode || '')}
                                    onChange={(e) => {
                                        if (invoiceType.category === 'Alis') {
                                            if (setSupplierCode) {
                                                setSupplierCode(e.target.value);
                                            }
                                        } else {
                                            setCustomerCode(e.target.value);
                                        }
                                    }}
                                    placeholder={tm('selectOrEnterPlaceholder')}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                                />
                                <button
                                    onClick={() => {
                                        if (invoiceType.category === 'Alis') {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('accountTitleLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={invoiceType.category === 'Alis' ? supplierTitle : customerTitle}
                                    readOnly
                                    placeholder={tm('selectShortPlaceholder')}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                    onClick={() => {
                                        if (invoiceType.category === 'Alis') {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        if (invoiceType.category === 'Alis') {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                                {invoiceType.category === 'Alis' && (supplierCode || supplierTitle) && (
                                    <button
                                        onClick={() => {
                                            setSelectedSupplierHistory({ id: supplierCode, name: supplierTitle });
                                            setShowSupplierHistory(true);
                                        }}
                                        className="px-2 py-1 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                                        title={tm('supplierHistoryTitle')}
                                    >
                                        <History className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {cariMetaBadges}
                        </div>
                    </div>

                    {/* Column 4 - Cari Hesap Devam */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('paymentMethodLabel')}</label>
                            {paymentModalTriggerEl}
                            {paymentExtraLabel ? (
                                <p className="mt-1 text-[11px] text-blue-600 font-medium truncate">{paymentExtraLabel}</p>
                            ) : null}
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('warehouseField')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={warehouse}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                    onClick={() => setShowWarehouseModal(true)}
                                />
                                <button
                                    onClick={() => setShowWarehouseModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('workplace')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={workplace}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                    onClick={() => setShowWorkplaceModal(true)}
                                />
                                <button
                                    onClick={() => setShowWorkplaceModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">{tm('salespersonLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={salespersonCode}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                    onClick={() => setShowSalespersonModal(true)}
                                />
                                <button
                                    onClick={() => setShowSalespersonModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        {showCashierField && (
                            <div>
                                <label className="block mb-1 text-gray-700 text-xs">{cashierLabel}</label>
                                <input
                                    type="text"
                                    value={cashierName}
                                    readOnly={cashierReadOnly}
                                    onChange={(e) => onCashierNameChange?.(e.target.value)}
                                    className={`w-full px-2 py-1 border border-gray-300 rounded text-sm ${cashierReadOnly ? 'bg-gray-50 text-gray-700' : 'bg-white'}`}
                                    placeholder={tm('cashierNamePlaceholder')}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 w-full text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1 min-w-0 order-1">
                        <div className="inline-flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">{tm('paymentMethodLabel')}</span>
                            {paymentModalTriggerEl}
                        </div>
                        {cariSummaryEl}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0 order-2 sm:ml-auto">
                        <div className="inline-flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">{tm('date')}</span>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={transactionDate}
                                    onChange={(e) => setTransactionDate(e.target.value)}
                                    className="w-[6.5rem] sm:w-[7.5rem] px-2 py-1 border border-gray-300 rounded text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowTransactionDateModal(true)}
                                    className="shrink-0 px-1.5 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                    title={tm('date')}
                                >
                                    <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div className="inline-flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">{tm('documentNo')}</span>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className="w-[5.5rem] sm:w-[7rem] px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                placeholder="..."
                            />
                        </div>
                    </div>

                    {paymentExtraLabel ? (
                        <span className="text-[10px] text-blue-600 font-medium truncate max-w-[8rem] order-3 w-full sm:w-auto">{paymentExtraLabel}</span>
                    ) : null}
                    {cariMetaBadges ? <div className="w-full basis-full order-4">{cariMetaBadges}</div> : null}
                </div>
            )}
        </div>
    );
};

