
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical, Barcode, History, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { isInvoicePurchaseSide } from '../../../utils/invoiceLineType';
import { CodeFormatFieldButton } from '../../shared/CodeFormatFieldButton';
import type { InvoiceCariItem } from './InvoiceCariSelectModal';

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
    setCustomerTitle?: (val: string) => void;
    setSupplierTitle?: (val: string) => void;
    /** Yazarak cari seçmek için öneri listesi */
    cariItems?: InvoiceCariItem[];
    onSelectCari?: (item: InvoiceCariItem) => void;

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
    setCustomerTitle,
    setSupplierTitle,
    cariItems = [],
    onSelectCari,
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

    /**
     * Collapsed — 2 satır × 4 kolon (hizalı, okunaklı):
     * 1: Fatura No | Cari kod | Ödeme | Açıklama
     * 2: Tarih | Cari unvan | Belge No | Bakiye
     */
    const compactStackStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        width: 'min(100%, 72rem)',
        maxWidth: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1,
        overflow: 'visible',
    };
    const compactRow4Style: React.CSSProperties = {
        display: 'grid',
        /* Fatura/Tarih biraz dar; Ödeme/Unvan/Açıklama/Bakiye daha geniş */
        gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr) minmax(0, 1.15fr) minmax(0, 1.25fr)',
        gap: '0.45rem',
        width: '100%',
        alignItems: 'stretch',
        boxSizing: 'border-box',
        overflow: 'visible',
        position: 'relative',
    };
    const compactCellStyle: React.CSSProperties = {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
    };
    const compactCellClass = 'min-w-0';
    /** Tek yükseklik + birleşik etiket+input+(...) — kısa etiket; input görünür kalsın */
    const fieldInputClass =
        'min-w-0 h-8 px-2 border border-gray-300 dark:border-gray-600 text-sm leading-none bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500';
    const inputGroupClass = 'flex items-stretch w-full min-w-0 h-8';
    /** 4 kolonda kısa etiket okunur kalsın */
    const COMPACT_LABEL_WIDTH = '6.25rem';
    const inputGroupLabelStyle: React.CSSProperties = {
        width: COMPACT_LABEL_WIDTH,
        minWidth: COMPACT_LABEL_WIDTH,
        maxWidth: COMPACT_LABEL_WIDTH,
        boxSizing: 'border-box',
    };
    const inputGroupLabelClass =
        'shrink-0 inline-flex items-center justify-start px-2 h-8 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l bg-slate-50 dark:bg-gray-700/80 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300 truncate overflow-hidden';
    const inputGroupFieldClass = `${fieldInputClass} flex-1 rounded-none border-r-0`;
    const inputGroupFieldStartClass = `${fieldInputClass} flex-1 rounded-l rounded-r-none border-r-0`;
    const inputGroupBtnClass =
        'shrink-0 inline-flex items-center justify-center w-8 h-8 border border-gray-300 dark:border-gray-600 rounded-r rounded-l-none bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700';
    const inputGroupBtnMidClass =
        'shrink-0 inline-flex items-center justify-center w-8 h-8 border border-r-0 border-gray-300 dark:border-gray-600 rounded-none bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700';
    /** Butonsuz alanlarda sağ kolonu hizalı tut (⋮ ile aynı 2rem) */
    const inputGroupTrailSpacerStyle: React.CSSProperties = {
        width: '2rem',
        minWidth: '2rem',
        height: '2rem',
        boxSizing: 'border-box',
        border: '1px solid transparent',
        flexShrink: 0,
    };

    const paymentModalTriggerEl = (
        <div className={inputGroupClass}>
            <input
                type="text"
                readOnly
                value={paymentDisplayLabel}
                className={`${inputGroupFieldStartClass} cursor-pointer truncate`}
                onClick={() => setShowPaymentInfoModal(true)}
            />
            <button
                type="button"
                onClick={() => setShowPaymentInfoModal(true)}
                className={inputGroupBtnClass}
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

    const showCariHistory =
        (isPurchaseSide && Boolean(supplierCode || supplierTitle)) ||
        (!isPurchaseSide && Boolean(customerCode || customerTitle));

    const cariCodeValue = isPurchaseSide ? supplierCode : customerCode || '';
    const cariTitleValue = isPurchaseSide ? supplierTitle : customerTitle;

    type CariSuggestField = 'code' | 'title' | null;
    const [cariSuggestField, setCariSuggestField] = useState<CariSuggestField>(null);
    const [cariSuggestQuery, setCariSuggestQuery] = useState('');
    const cariSuggestRef = useRef<HTMLDivElement | null>(null);

    const cariSuggestions = useMemo(() => {
        const term = cariSuggestQuery.trim().toLocaleLowerCase('tr-TR');
        if (!term || term.length < 1) return cariItems.slice(0, 12);
        return cariItems
            .filter((item) => {
                const code = (item.code || '').toLocaleLowerCase('tr-TR');
                const name = (item.name || '').toLocaleLowerCase('tr-TR');
                const phone = (item.phone || '').toLocaleLowerCase('tr-TR');
                return code.includes(term) || name.includes(term) || phone.includes(term);
            })
            .slice(0, 12);
    }, [cariItems, cariSuggestQuery]);

    useEffect(() => {
        if (!cariSuggestField) return;
        const onDoc = (e: MouseEvent) => {
            if (!cariSuggestRef.current) return;
            if (!cariSuggestRef.current.contains(e.target as Node)) {
                setCariSuggestField(null);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [cariSuggestField]);

    const pickCari = (item: InvoiceCariItem) => {
        onSelectCari?.(item);
        setCariSuggestField(null);
        setCariSuggestQuery('');
    };

    const onCariCodeChange = (raw: string) => {
        if (isPurchaseSide) setSupplierCode?.(raw);
        else setCustomerCode(raw);
        setCariSuggestQuery(raw);
        setCariSuggestField('code');
    };

    const onCariTitleChange = (raw: string) => {
        if (isPurchaseSide) setSupplierTitle?.(raw);
        else setCustomerTitle?.(raw);
        setCariSuggestQuery(raw);
        setCariSuggestField('title');
    };

    const renderCariSuggestList = (field: 'code' | 'title') => {
        if (cariSuggestField !== field || !onSelectCari) return null;
        const panelStyle: React.CSSProperties = {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 2px)',
            zIndex: 80,
            maxHeight: '13rem',
            overflowY: 'auto',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.18)',
        };
        if (cariSuggestions.length === 0) {
            return (
                <div style={{ ...panelStyle, padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#64748b' }} role="listbox">
                    {tm('noRecordFound')}
                </div>
            );
        }
        return (
            <div style={panelStyle} role="listbox">
                {cariSuggestions.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="option"
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm border-b border-gray-100 last:border-0 hover:bg-emerald-50"
                        style={{ backgroundColor: '#ffffff' }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            pickCari(item);
                        }}
                    >
                        <span className="font-mono text-xs text-gray-500 shrink-0 w-20 truncate">{item.code || '—'}</span>
                        <span className="font-medium text-gray-900 truncate">{item.name}</span>
                    </button>
                ))}
            </div>
        );
    };

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

    /** Kompakt satırda açıklama altı — boş hücre bırakma */
    const compactBalanceCell = (
        <div className={inputGroupClass}>
            <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('balanceShort')}>
                {tm('balanceShort')}
            </span>
            {showCariMeta && selectedCariBalance != null ? (
                <div
                    className={`${inputGroupFieldClass} flex items-center font-semibold tabular-nums ${
                        (selectedCariBalance || 0) >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-red-600'
                    }`}
                    title={`${tm('balanceShort')}: ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(selectedCariBalance ?? 0)} ${selectedCariCurrency}`}
                >
                    {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(selectedCariBalance ?? 0)}{' '}
                    <span className="ml-1 text-[10px] font-medium opacity-70">{selectedCariCurrency}</span>
                </div>
            ) : (
                <div className={`${inputGroupFieldClass} flex items-center text-gray-400 dark:text-gray-500`}>
                    {tm('balanceEmptyPlaceholder')}
                </div>
            )}
            <span style={inputGroupTrailSpacerStyle} aria-hidden />
        </div>
    );

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
                <div ref={cariSuggestRef}>
                    {/*
                      1: Fatura No | Cari kod | Ödeme | Açıklama
                      2: Tarih | Cari unvan | Belge No | Bakiye
                    */}
                    <div style={compactStackStyle}>
                        <div style={{ ...compactRow4Style, zIndex: cariSuggestField === 'code' ? 45 : undefined }}>
                            <div className={compactCellClass} style={compactCellStyle}>
                                <div className={inputGroupClass}>
                                    <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('invoiceNo')}>
                                        {tm('invoiceNo')}
                                    </span>
                                    <input
                                        type="text"
                                        value={invoiceNo}
                                        readOnly={!invoiceNoEditable}
                                        onChange={(e) => setInvoiceNo?.(e.target.value)}
                                        className={`min-w-0 h-8 px-2 border border-gray-300 dark:border-gray-600 text-sm leading-none font-mono tabular-nums truncate ${
                                            invoiceNoEditable
                                                ? 'flex-1 rounded-none border-r-0 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500'
                                                : 'flex-1 rounded-none border-r-0 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                                        }`}
                                        title={invoiceNo}
                                    />
                                    {invoiceNoEditable ? (
                                        <CodeFormatFieldButton
                                            entity="invoice"
                                            typeCode={invoiceType.code}
                                            onApply={(code) => setInvoiceNo?.(code)}
                                            className="!rounded-l-none !rounded-r !w-8 !h-8 !min-h-0 !p-0 inline-flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                                        />
                                    ) : (
                                        <span style={inputGroupTrailSpacerStyle} aria-hidden />
                                    )}
                                </div>
                            </div>

                            <div
                                className={compactCellClass}
                                style={{
                                    ...compactCellStyle,
                                    zIndex: cariSuggestField === 'code' ? 40 : undefined,
                                }}
                            >
                                <div className={inputGroupClass}>
                                    <span className={`${inputGroupLabelClass} ${cariTextColor}`} style={inputGroupLabelStyle} title={tm('cariAccountCodeLabel')}>
                                        {tm('cariCodeCompactLabel')}
                                    </span>
                                    <input
                                        type="text"
                                        value={cariCodeValue}
                                        onChange={(e) => onCariCodeChange(e.target.value)}
                                        onFocus={() => {
                                            setCariSuggestQuery(cariCodeValue);
                                            setCariSuggestField('code');
                                        }}
                                        placeholder={tm('selectShortPlaceholder')}
                                        className={`${inputGroupFieldClass} font-mono truncate`}
                                        autoComplete="off"
                                    />
                                    <button
                                        type="button"
                                        onClick={openCariModal}
                                        className={inputGroupBtnClass}
                                        title={tm('cariAccountCodeLabel')}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                </div>
                                {renderCariSuggestList('code')}
                            </div>

                            <div className={compactCellClass} style={compactCellStyle}>
                                <div className={inputGroupClass}>
                                    <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('paymentMethodLabel')}>
                                        {tm('paymentCompactLabel')}
                                    </span>
                                    <input
                                        type="text"
                                        readOnly
                                        value={paymentDisplayLabel}
                                        className={`${inputGroupFieldClass} cursor-pointer truncate`}
                                        onClick={() => setShowPaymentInfoModal(true)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentInfoModal(true)}
                                        className={inputGroupBtnClass}
                                        title={tm('paymentInfo')}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                </div>
                                {paymentExtraLabel ? (
                                    <p className="mt-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate pl-1">
                                        {paymentExtraLabel}
                                    </p>
                                ) : null}
                            </div>

                            <div className={compactCellClass} style={compactCellStyle}>
                                <div className={inputGroupClass}>
                                    <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('description')}>
                                        {tm('description')}
                                    </span>
                                    <input
                                        type="text"
                                        value={description ?? ''}
                                        onChange={(e) => setDescription?.(e.target.value)}
                                        readOnly={!setDescription}
                                        placeholder={`${tm('description')}...`}
                                        className={`${inputGroupFieldClass}`}
                                    />
                                    <span style={inputGroupTrailSpacerStyle} aria-hidden />
                                </div>
                            </div>
                        </div>

                        <div style={{ ...compactRow4Style, zIndex: cariSuggestField === 'title' ? 45 : undefined }}>
                            <div className={compactCellClass} style={compactCellStyle}>
                                <div className={inputGroupClass}>
                                    <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('date')}>
                                        {tm('date')}
                                    </span>
                                    <input
                                        type="text"
                                        value={transactionDate}
                                        onChange={(e) => setTransactionDate(e.target.value)}
                                        className={`${inputGroupFieldClass} tabular-nums`}
                                        title={transactionDate}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowTransactionDateModal(true)}
                                        className={inputGroupBtnClass}
                                        title={tm('date')}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                </div>
                            </div>

                            <div
                                className={compactCellClass}
                                style={{
                                    ...compactCellStyle,
                                    zIndex: cariSuggestField === 'title' ? 40 : undefined,
                                }}
                            >
                                <div className={inputGroupClass}>
                                    <span className={`${inputGroupLabelClass} ${cariTextColor}`} style={inputGroupLabelStyle} title={tm('cariAccountTitleLabel')}>
                                        {tm('cariTitleCompactLabel')}
                                    </span>
                                    <input
                                        type="text"
                                        value={cariTitleValue}
                                        onChange={(e) => onCariTitleChange(e.target.value)}
                                        onFocus={() => {
                                            setCariSuggestQuery(cariTitleValue);
                                            setCariSuggestField('title');
                                        }}
                                        placeholder={tm('selectShortPlaceholder')}
                                        className={`${inputGroupFieldClass} font-medium truncate`}
                                        autoComplete="off"
                                        title={cariTitleValue}
                                    />
                                    <button
                                        type="button"
                                        onClick={openCariModal}
                                        className={showCariHistory ? inputGroupBtnMidClass : inputGroupBtnClass}
                                        title={tm('cariAccountTitleLabel')}
                                    >
                                        <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                                    </button>
                                    {showCariHistory && isPurchaseSide ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedSupplierHistory({ id: supplierCode, name: supplierTitle });
                                                setShowSupplierHistory(true);
                                            }}
                                            className={`${inputGroupBtnClass} border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60`}
                                            title={tm('supplierHistoryTitle')}
                                        >
                                            <History className="w-3.5 h-3.5" />
                                        </button>
                                    ) : null}
                                    {showCariHistory && !isPurchaseSide ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedCustomerHistory({
                                                    id: customerCode,
                                                    name: customerTitle,
                                                    uuid: customerId || customerCode,
                                                });
                                                setShowCustomerHistory(true);
                                            }}
                                            className={`${inputGroupBtnClass} border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60`}
                                            title={tm('customerHistoryTitle')}
                                        >
                                            <History className="w-3.5 h-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                                {renderCariSuggestList('title')}
                            </div>

                            <div className={compactCellClass} style={compactCellStyle}>
                                <div className={inputGroupClass}>
                                    <span className={inputGroupLabelClass} style={inputGroupLabelStyle} title={tm('documentNo')}>
                                        {tm('documentNo')}
                                    </span>
                                    <input
                                        type="text"
                                        value={documentNo}
                                        onChange={(e) => setDocumentNo(e.target.value)}
                                        className={`${inputGroupFieldClass}`}
                                        placeholder="..."
                                    />
                                    <span style={inputGroupTrailSpacerStyle} aria-hidden />
                                </div>
                            </div>

                            <div className={compactCellClass} style={compactCellStyle}>
                                {compactBalanceCell}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

