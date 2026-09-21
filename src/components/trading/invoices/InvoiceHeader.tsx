
import React from 'react';
import { MoreVertical, Barcode, History, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { isInvoicePurchaseSide } from '../../../utils/invoiceLineType';
import { CodeFormatFieldButton } from '../../shared/CodeFormatFieldButton';

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
    /** Yeni faturalarda düzenlenebilir; kayıtlı/düzenleme modunda verilmez → salt okunur */
    setInvoiceNo?: (val: string) => void;
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
    // Kasa seçimi — ödeme tipi değiştiğinde bağlı kasayı seçmek için
    cashRegisters?: Array<{ id: string; kasa_adi: string; kasa_kodu: string; id_doviz_kodu: string }>;
    cashRegistersLoading?: boolean;
    cashRegisterId?: string;
    cashRegisterName?: string;
    onCashRegisterChange?: (id: string, name: string) => void;
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

    // Customer History
    setSelectedCustomerHistory: (val: { id: string; name: string; uuid: string } | null) => void;
    setShowCustomerHistory: (val: boolean) => void;
    customerId?: string;

    // Styling (computed in parent or we can move logic here)
    cariBorderColor: string;
    cariTextColor: string;
    selectedCariBalance?: number | null;
    selectedCariPhone?: string | null;
    selectedCariCurrency?: string;

    // Detay tab açıklama alanı — collapsed görünümde cari alanının yanında gösterilir
    description?: string;
    setDescription?: (val: string) => void;
}

export const InvoiceHeader: React.FC<InvoiceHeaderProps> = ({
    invoiceType,
    isFormExpanded,
    setIsFormExpanded,
    invoiceNo,
    setInvoiceNo,
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
    cashRegisters = [],
    cashRegistersLoading = false,
    cashRegisterId = '',
    cashRegisterName = '',
    onCashRegisterChange,
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
    setSelectedCustomerHistory,
    setShowCustomerHistory,
    customerId,
    cariBorderColor,
    cariTextColor,
    setSupplierCode,
    selectedCariBalance,
    selectedCariPhone,
    selectedCariCurrency = 'IQD',
    description,
    setDescription,
}) => {
    const { tm } = useLanguage();
    const cashierLabel = cashierFieldLabel || tm('cashier');
    const invoiceNoEditable = typeof setInvoiceNo === 'function';
    // iade yönüne göre cari tarafı (Alış + Alış İade + Alınan Hizmet → tedarikçi)
    const isPurchaseSide = isInvoicePurchaseSide(invoiceType);
    const cariTitle = isPurchaseSide ? supplierTitle : customerTitle;
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

    const fieldLabelClass =
        'block mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide';
    const fieldInputClass =
        'w-full min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500';
    const pickerBtnClass =
        'shrink-0 px-1.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700';

    const paymentModalTriggerEl = (
        <div className="flex gap-1 min-w-0 w-full">
            <input
                type="text"
                readOnly
                value={paymentDisplayLabel}
                className={`${fieldInputClass} cursor-pointer truncate`}
                onClick={() => setShowPaymentInfoModal(true)}
            />
            <button
                type="button"
                onClick={() => setShowPaymentInfoModal(true)}
                className={pickerBtnClass}
                title={tm('paymentInfo')}
            >
                <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
            </button>
        </div>
    );

    const paymentExtraLabel =
        !primaryPaymentCodes.includes(resolvedPaymentCode as (typeof primaryPaymentCodes)[number]) &&
        paymentMethodLabel
            ? paymentMethodLabel
            : null;

    const openCariModal = () => {
        if (isPurchaseSide) {
            setShowSupplierModal(true);
        } else {
            setShowCustomerModal(true);
        }
    };

    const cariSummaryEl = (
        <div className="min-w-0">
            <label className={`${fieldLabelClass} ${cariTextColor}`}>
                {isPurchaseSide ? tm('supplier') : tm('customer')}
            </label>
            <div className="flex gap-1 min-w-0">
                <input
                    type="text"
                    value={isPurchaseSide ? supplierTitle : customerTitle}
                    readOnly
                    placeholder={`${tm('selectCurrent')}...`}
                    className={`flex-1 min-w-0 px-2 py-1.5 border-2 rounded text-sm bg-white dark:bg-gray-800 cursor-pointer font-medium hover:border-gray-400 transition-colors truncate ${cariBorderColor}`}
                    onClick={openCariModal}
                />
                <button
                    type="button"
                    onClick={openCariModal}
                    className={pickerBtnClass}
                >
                    <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                </button>
                {isPurchaseSide && (supplierCode || supplierTitle) && (
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedSupplierHistory({ id: supplierCode, name: supplierTitle });
                            setShowSupplierHistory(true);
                        }}
                        className="shrink-0 px-1.5 py-1.5 border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded transition-colors"
                        title={tm('supplierHistoryTitle')}
                    >
                        <History className="w-3.5 h-3.5" />
                    </button>
                )}
                {!isPurchaseSide && (customerCode || customerTitle) && (
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedCustomerHistory({ id: customerCode, name: customerTitle, uuid: customerId || customerCode });
                            setShowCustomerHistory(true);
                        }}
                        className="shrink-0 px-1.5 py-1.5 border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded transition-colors"
                        title={tm('customerHistoryTitle')}
                    >
                        <History className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );

    const cariMetaBadges = showCariMeta ? (
        <div className="flex flex-wrap items-center gap-2">
            {selectedCariBalance != null && (
                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 w-fit">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase tracking-tighter">{tm('balanceShort')}:</span>
                    <span className={`text-xs font-black ${(selectedCariBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(selectedCariBalance ?? 0)}{' '}
                        <span className="text-[10px] opacity-70">{selectedCariCurrency}</span>
                    </span>
                </div>
            )}
            {selectedCariPhone?.trim() ? (
                <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 w-fit">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase tracking-tighter">{tm('phoneShort')}:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{selectedCariPhone.trim()}</span>
                </div>
            ) : null}
        </div>
    ) : null;

    return (
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 px-3 py-2 mb-3">
            {/* Form Header - Collapse/Expand */}
            <button
                onClick={() => setIsFormExpanded(!isFormExpanded)}
                className="w-full flex items-center justify-between mb-2 pb-1.5 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 -mx-3 px-3 py-1.5 rounded transition-colors"
            >
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tm('invoiceInfo')}</span>
                {isFormExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}
            </button>

            {isFormExpanded ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Column 1 - Fatura Bilgileri */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs font-semibold">
                                {tm('invoiceNo')}
                            </label>
                            <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={invoiceNo}
                                readOnly={!invoiceNoEditable}
                                onChange={(e) => setInvoiceNo?.(e.target.value)}
                                title={invoiceNoEditable ? tm('invoiceNo') : undefined}
                                className={`flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono tabular-nums ${
                                    invoiceNoEditable
                                        ? 'bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500'
                                        : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                                }`}
                            />
                            {invoiceNoEditable ? (
                                <CodeFormatFieldButton
                                    entity="invoice"
                                    typeCode={invoiceType.code}
                                    onApply={(code) => setInvoiceNo?.(code)}
                                />
                            ) : null}
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('date')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={transactionDate}
                                    onChange={(e) => setTransactionDate(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowTransactionDateModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('time')}</label>
                            <input
                                type="text"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('documentNo')}</label>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('barcode')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={customerBarcode}
                                    onChange={(e) => setCustomerBarcode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                                    placeholder={tm('scanBarcodePlaceholder')}
                                />
                                <button className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <Barcode className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Column 2 - Devam */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('editDate')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowEditDateModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('specialCode')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={specialCode}
                                    onChange={(e) => setSpecialCode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => setShowSpecialCodeModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('tradingGroup')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={tradingGroup}
                                    onChange={(e) => setTradingGroup(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                                />
                                <button
                                    onClick={() => setShowTradingGroupModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('authorization')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={authorizationCode}
                                    onChange={(e) => setAuthorizationCode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                                />
                                <button
                                    onClick={() => setShowAuthorizationModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
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
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('accountCodeLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={isPurchaseSide ? supplierCode : (customerCode || '')}
                                    onChange={(e) => {
                                        if (isPurchaseSide) {
                                            if (setSupplierCode) {
                                                setSupplierCode(e.target.value);
                                            }
                                        } else {
                                            setCustomerCode(e.target.value);
                                        }
                                    }}
                                    placeholder={tm('selectOrEnterPlaceholder')}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                                />
                                <button
                                    onClick={() => {
                                        if (isPurchaseSide) {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('accountTitleLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={isPurchaseSide ? supplierTitle : customerTitle}
                                    readOnly
                                    placeholder={tm('selectShortPlaceholder')}
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 cursor-pointer"
                                    onClick={() => {
                                        if (isPurchaseSide) {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        if (isPurchaseSide) {
                                            setShowSupplierModal(true);
                                        } else {
                                            setShowCustomerModal(true);
                                        }
                                    }}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                                {isPurchaseSide && (supplierCode || supplierTitle) && (
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
                                {!isPurchaseSide && (customerCode || customerTitle) && (
                                    <button
                                        onClick={() => {
                                            setSelectedCustomerHistory({ id: customerCode, name: customerTitle, uuid: customerId || customerCode });
                                            setShowCustomerHistory(true);
                                        }}
                                        className="px-2 py-1 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                                        title={tm('customerHistoryTitle')}
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
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('paymentMethodLabel')}</label>
                            {paymentModalTriggerEl}
                            {paymentExtraLabel ? (
                                <p className="mt-1 text-[11px] text-blue-600 font-medium truncate">{paymentExtraLabel}</p>
                            ) : null}
                        </div>

                        {/* Kasa seçimi — ödeme tipine göre bağlı kasayı seç */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-gray-700 dark:text-gray-200 text-xs">{tm('cashRegisterLabel') || 'Kasa Seçimi'}</label>
                                {cashRegisterName && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                        {tm('cashRegisterPaymentTypeLabel')
                                          ? (tm('cashRegisterPaymentTypeLabel') || 'Ödeme Türü: {type}').replace('{type}', String(paymentMethod || ''))
                                          : `Ödeme Türü: ${paymentMethod || ''}`}
                                    </span>
                                )}
                            </div>
                            <select
                                aria-label={tm('cashRegisterLabel') || 'Kasa Seçimi'}
                                value={cashRegisterId}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    const found = cashRegisters.find((k) => k.id === id);
                                    onCashRegisterChange?.(id, found?.kasa_adi || '');
                                }}
                                disabled={cashRegistersLoading || cashRegisters.length === 0}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                            >
                                <option value="">
                                    {cashRegistersLoading
                                      ? (tm('loading') || 'Yükleniyor...')
                                      : (tm('selectCashRegister') || 'Kasa seçin (opsiyonel)')}
                                </option>
                                {cashRegisters.map((k) => (
                                    <option key={k.id} value={k.id}>
                                        {`${k.kasa_adi} (${k.kasa_kodu}) — ${k.id_doviz_kodu}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('warehouseField')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={warehouse}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 cursor-pointer"
                                    onClick={() => setShowWarehouseModal(true)}
                                />
                                <button
                                    onClick={() => setShowWarehouseModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('workplace')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={workplace}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 cursor-pointer"
                                    onClick={() => setShowWorkplaceModal(true)}
                                />
                                <button
                                    onClick={() => setShowWorkplaceModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{tm('salespersonLabel')}</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={salespersonCode}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 cursor-pointer"
                                    onClick={() => setShowSalespersonModal(true)}
                                />
                                <button
                                    onClick={() => setShowSalespersonModal(true)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        {showCashierField && (
                            <div>
                                <label className="block mb-1 text-gray-700 dark:text-gray-200 text-xs">{cashierLabel}</label>
                                <input
                                    type="text"
                                    value={cashierName}
                                    readOnly={cashierReadOnly}
                                    onChange={(e) => onCashierNameChange?.(e.target.value)}
                                    className={`w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm ${cashierReadOnly ? 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'bg-white dark:bg-gray-800'}`}
                                    placeholder={tm('cashierNamePlaceholder')}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5">
                        <div className="min-w-0">
                            <label className={fieldLabelClass}>{tm('paymentMethodLabel')}</label>
                            {paymentModalTriggerEl}
                            {paymentExtraLabel ? (
                                <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate">
                                    {paymentExtraLabel}
                                </p>
                            ) : null}
                        </div>

                        {cariSummaryEl}

                        {setDescription ? (
                            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                                <label className={fieldLabelClass}>{tm('description')}</label>
                                <input
                                    type="text"
                                    value={description ?? ''}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={`${tm('description')}...`}
                                    className={fieldInputClass}
                                />
                            </div>
                        ) : null}

                        <div className="min-w-0">
                            <label className={fieldLabelClass}>{tm('invoiceNo')}</label>
                            <div className="flex items-center gap-1 min-w-0">
                                <input
                                    type="text"
                                    value={invoiceNo}
                                    readOnly={!invoiceNoEditable}
                                    onChange={(e) => setInvoiceNo?.(e.target.value)}
                                    className={`flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono tabular-nums truncate ${
                                        invoiceNoEditable
                                            ? 'bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500'
                                            : 'bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                                    }`}
                                    title={invoiceNo}
                                />
                                {invoiceNoEditable ? (
                                    <CodeFormatFieldButton
                                        entity="invoice"
                                        typeCode={invoiceType.code}
                                        onApply={(code) => setInvoiceNo?.(code)}
                                    />
                                ) : null}
                            </div>
                        </div>

                        <div className="min-w-0">
                            <label className={fieldLabelClass}>{tm('date')}</label>
                            <div className="flex gap-1 min-w-0">
                                <input
                                    type="text"
                                    value={transactionDate}
                                    onChange={(e) => setTransactionDate(e.target.value)}
                                    className={`${fieldInputClass} tabular-nums`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowTransactionDateModal(true)}
                                    className={pickerBtnClass}
                                    title={tm('date')}
                                >
                                    <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                                </button>
                            </div>
                        </div>

                        <div className="min-w-0">
                            <label className={fieldLabelClass}>{tm('documentNo')}</label>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className={fieldInputClass}
                                placeholder="..."
                            />
                        </div>
                    </div>

                    {cariMetaBadges ? <div className="pt-0.5">{cariMetaBadges}</div> : null}
                </div>
            )}
        </div>
    );
};

