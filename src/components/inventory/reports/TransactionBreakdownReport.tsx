import React, { useState, useEffect, useMemo } from 'react';
import { CostAccountingService, StockMovement, formatMoney } from '../../../services/costAccountingService';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, List, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useLanguage } from '../../../contexts/LanguageContext';

export function TransactionBreakdownReport() {
    const [data, setData] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    // Mock IDs
    const firmaId = '1';
    const donemId = '1';

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const result = await CostAccountingService.getStockMovements({
                    firma_id: firmaId,
                    donem_id: donemId
                });
                // Sort by date desc
                result.sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime());
                setData(result);
            } catch (error) {
                console.error('Failed to load transactions', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const columnHelper = createColumnHelper<StockMovement>();
    const columns = useMemo<ColumnDef<StockMovement, any>[]>(() => [
        columnHelper.accessor('movement_date', {
            header: tm('date'),
            cell: info => format(new Date(info.getValue()), 'dd.MM.yyyy', { locale: tr }),
        }),
        columnHelper.accessor('document_no', {
            header: tm('documentNo'),
        }),
        columnHelper.accessor('document_type', {
            header: tm('documentType'),
            cell: info => {
                const val = info.getValue() as string;
                return val === 'PURCHASE_INVOICE' ? tm('purchaseInvoice') :
                    val === 'SALES_INVOICE' ? tm('salesInvoice') : val;
            }
        }),
        columnHelper.accessor('product_code', {
            header: tm('materialCode'),
        }),
        columnHelper.accessor('product_name', {
            header: tm('materialName'),
        }),
        columnHelper.accessor('movement_type', {
            header: tm('direction'),
            cell: info => info.getValue() === 'IN' ?
                <span className="text-green-600 font-bold">{tm('in')}</span> :
                <span className="text-red-600 font-bold">{tm('out')}</span>,
        }),
        columnHelper.accessor('quantity', {
            header: tm('quantity'),
        }),
        columnHelper.accessor('unit_cost', {
            header: tm('unitCost'),
            cell: info => formatMoney(info.getValue()),
        }),
        columnHelper.accessor('total_cost', {
            header: tm('totalAmount'),
            cell: info => formatMoney(info.getValue()),
        }),
    ] as any, [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex justify-between items-center w-full">
                    <h1 className="text-2xl font-bold text-gray-800">{tm('transactionBreakdown')}</h1>
                    <div className="flex gap-2">
                        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600">
                            <Filter className="w-4 h-4" />
                            {tm('filter')}
                        </button>
                        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600">
                            <Download className="w-4 h-4" />
                            {tm('export')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">{tm('loadingTransactions')}</p>
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={data}
                        columns={columns}
                        pageSize={50}
                    />
                )}
            </div>
        </div>
    );
}



