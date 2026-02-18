
import React from 'react';
import { MoreVertical, Barcode, History, ChevronDown, ChevronRight } from 'lucide-react';

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
    warehouse: string;
    workplace: string;
    salespersonCode: string;
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
    warehouse,
    workplace,
    salespersonCode,

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
    setSupplierCode
}) => {
    return (
        <div className="bg-white rounded border border-gray-200 p-3 mb-3">
            {/* Form Header - Collapse/Expand */}
            <button
                onClick={() => setIsFormExpanded(!isFormExpanded)}
                className="w-full flex items-center justify-between mb-3 pb-2 border-b border-gray-200 hover:bg-gray-50 -mx-3 px-3 py-2 rounded transition-colors"
            >
                <span className="text-sm font-medium text-gray-700">Fatura Bilgileri</span>
                {isFormExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
            </button>

            {isFormExpanded ? (
                <div className="grid grid-cols-4 gap-3">
                    {/* Column 1 - Fatura Bilgileri */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Fatura kod</label>
                            <input
                                type="text"
                                value={invoiceNo}
                                readOnly
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Tarih</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">Saat</label>
                            <input
                                type="text"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Belge No</label>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Barkod</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={customerBarcode}
                                    onChange={(e) => setCustomerBarcode(e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                                    placeholder="Barkod okutun..."
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
                            <label className="block mb-1 text-gray-700 text-xs">Duzenleme T.</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">Ozel kod</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">Ticari Grubu</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">Yetki</label>
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
                                    Cari Hesap Bilgileri
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Kodu</label>
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
                                    placeholder="Seçin veya girin..."
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
                            <label className="block mb-1 text-gray-700 text-xs">Unvanı</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={invoiceType.category === 'Alis' ? supplierTitle : customerTitle}
                                    readOnly
                                    placeholder="Seçin..."
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
                                        title="Tedarikçi Geçmişi"
                                    >
                                        <History className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Column 4 - Cari Hesap Devam */}
                    <div className="space-y-3">
                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Ödemeler</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={paymentMethod || 'Açık Hesap (Cari)'}
                                    readOnly
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                    onClick={() => setShowPaymentInfoModal(true)}
                                />
                                <button
                                    onClick={() => setShowPaymentInfoModal(true)}
                                    className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block mb-1 text-gray-700 text-xs">Ambar</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">İşyeri</label>
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
                            <label className="block mb-1 text-gray-700 text-xs">Satış Elemanı</label>
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
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between gap-4 text-sm w-full overflow-hidden">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="whitespace-nowrap flex gap-1"><span className="font-medium text-gray-700">Fatura No:</span> <span className="text-gray-500">{invoiceNo}</span></div>
                        <div className="whitespace-nowrap flex gap-1"><span className="font-medium text-gray-700">Tarih:</span> <span className="text-gray-500">{transactionDate}</span></div>
                        <div className="whitespace-nowrap flex items-center gap-1">
                            <span className="font-medium text-gray-700">Belge No:</span>
                            <input
                                type="text"
                                value={documentNo}
                                onChange={(e) => setDocumentNo(e.target.value)}
                                className="w-24 px-1.5 py-0.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                placeholder="..."
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-1 max-w-md">
                        <span className={`font-semibold shrink-0 ${cariTextColor}`}>{invoiceType.category === 'Alis' ? 'Tedarikçi' : 'Müşteri'}:</span>
                        <div className="flex-1 flex gap-1">
                            <input
                                type="text"
                                value={invoiceType.category === 'Alis' ? supplierTitle : customerTitle}
                                readOnly
                                placeholder="Cari Seçin..."
                                className={`flex-1 px-3 py-1 border-2 rounded text-sm bg-white cursor-pointer font-medium hover:border-gray-400 transition-colors ${cariBorderColor}`}
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
