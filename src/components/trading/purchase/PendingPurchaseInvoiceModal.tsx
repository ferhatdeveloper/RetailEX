import { X, Package, TrendingUp, Banknote } from 'lucide-react';
import { usePendingPurchaseStore, type PurchaseInvoiceItem } from '../../../store/usePendingPurchaseStore';
import { formatNumber } from '../../../utils/formatNumber';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';

interface PendingPurchaseInvoiceModalProps {
    onClose: () => void;
}

export function PendingPurchaseInvoiceModal({ onClose }: PendingPurchaseInvoiceModalProps) {
    const { tm } = useLanguage();
    const pendingInvoice = usePendingPurchaseStore((state) => state.pendingInvoice);
    const removeItem = usePendingPurchaseStore((state) => state.removeItem);
    const clearInvoice = usePendingPurchaseStore((state) => state.clearInvoice);

    if (!pendingInvoice || pendingInvoice.items.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-lg shadow-2xl w-[600px] p-6">
                    <div className="text-center">
                        <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{tm('pendNoInvoice')}</h3>
                        <p className="text-gray-600 mb-4">{tm('pendNoInvoiceDesc')}</p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            {tm('close')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleSaveInvoice = async () => {
        try {
            const { postgres, ERP_SETTINGS } = await import('../../../services/postgres');
            const invoiceNo = `ALF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
            
            const totalAmount = pendingInvoice.items.reduce((sum: number, item: PurchaseInvoiceItem) =>
                sum + (item.purchasePrice * item.quantity), 0);
            
            await postgres.query(
                `INSERT INTO invoices (invoice_no, invoice_type, invoice_date, total_amount, status, notes, created_by)
                 VALUES ($1, $2, NOW(), $3, 'draft', $4, $5)`,
                [
                    invoiceNo,
                    'purchase',
                    totalAmount,
                    tm('pendAutoNote').replace('{count}', String(pendingInvoice.items.length)),
                    'system',
                ]
            );
            
            toast.success(tm('pendSavedOk').replace('{no}', invoiceNo));
            clearInvoice();
            onClose();
        } catch (err: any) {
            toast.error(tm('pendSaveFail').replace('{msg}', err?.message || String(err)));
        }
    };

    const handleClearInvoice = () => {
        if (confirm(tm('pendClearConfirm'))) {
            clearInvoice();
            toast.info(tm('pendCleared'));
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-[900px] max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Package className="w-6 h-6" />
                        <div>
                            <h2 className="text-xl font-semibold">{tm('pendTitle')}</h2>
                            <p className="text-sm text-blue-100">{tm('pendItemCount').replace('{count}', String(pendingInvoice.items.length))}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 border-b">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <Banknote className="w-4 h-4" />
                            <span className="text-xs font-medium">{tm('pendTotalCost')}</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {formatNumber(pendingInvoice.totalCost, 2, true)}
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-medium">{tm('pendTotalProfit')}</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                            {formatNumber(pendingInvoice.totalProfit, 2, true)}
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-medium">{tm('pendAvgMargin')}</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                            %{pendingInvoice.averageProfitMargin.toFixed(1)}
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="flex-1 overflow-auto p-6">
                    <table className="w-full">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr className="text-xs text-gray-600 text-left">
                                <th className="px-3 py-2">{tm('pendColProduct')}</th>
                                <th className="px-3 py-2">{tm('pendColVariant')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColQty')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColPurchase')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColSale')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColCost')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColProfit')}</th>
                                <th className="px-3 py-2 text-right">{tm('pendColMargin')}</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {pendingInvoice.items.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-sm text-gray-900">{item.productName}</div>
                                        <div className="text-xs text-gray-500">{item.productCode}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="text-sm text-gray-700">{item.variantName}</div>
                                        <div className="text-xs text-gray-500">{item.variantCode}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-sm">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-sm">{formatNumber(item.purchasePrice, 2, false)}</td>
                                    <td className="px-3 py-2 text-right text-sm">{formatNumber(item.salePrice, 2, false)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-sm text-red-600">
                                        {formatNumber(item.totalCost, 2, false)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold text-sm text-green-600">
                                        {formatNumber(item.totalProfit, 2, false)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-sm">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${item.profitMargin > 30 ? 'bg-green-100 text-green-700' :
                                                item.profitMargin > 15 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                            }`}>
                                            %{item.profitMargin.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <button
                                            onClick={() => removeItem(index)}
                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                            title={tm('pendRemove')}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t rounded-b-lg flex items-center justify-between">
                    <button
                        onClick={handleClearInvoice}
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                        {tm('pendClearInvoice')}
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 rounded transition-colors"
                        >
                            {tm('close')}
                        </button>
                        <button
                            onClick={handleSaveInvoice}
                            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
                        >
                            {tm('pendSaveInvoice')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

