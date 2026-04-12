import React, { useState, useEffect, useMemo } from 'react';
import { CostAccountingService, StockValuation, formatMoney } from '../../../services/costAccountingService';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Banknote } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export function MaterialValueReport() {
    const [data, setData] = useState<StockValuation[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { tm } = useLanguage();

    // Assuming default firma/donem IDs if not available in user context (customize as needed)
    // In a real scenario these should come from the user's active session/period
    const firmaId = '1';
    const donemId = '1';

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const result = await CostAccountingService.getStockValuation({
                    firma_id: firmaId,
                    donem_id: donemId
                });
                setData(result);
            } catch (error) {
                console.error('Failed to load valuation', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const totalValue = useMemo(() => data.reduce((acc, curr) => acc + curr.total_cost, 0), [data]);

    const columnHelper = createColumnHelper<StockValuation>();
    const columns = useMemo<ColumnDef<StockValuation, any>[]>(() => [
        columnHelper.accessor('product_code', {
            header: tm('materialCode'),
        }),
        columnHelper.accessor('product_name', {
            header: tm('materialDescription'),
        }),
        columnHelper.accessor('total_quantity', {
            header: tm('quantity'),
        }),
        columnHelper.accessor('average_unit_cost', {
            header: tm('avgUnitCost'),
            cell: info => formatMoney(info.getValue() as number),
        }),
        columnHelper.accessor('total_cost', {
            header: tm('totalValue'),
            cell: info => <span className="font-bold text-blue-600">{formatMoney(info.getValue() as number)}</span>,
        }),
    ], []);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-green-600" />
                        {tm('materialValueReport')}
                    </h2>
                    <div className="text-sm text-gray-500 mt-1">
                        {tm('totalInventoryValue')}: <span className="font-bold text-green-700 text-lg">{formatMoney(totalValue)}</span>
                    </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    {tm('excel')}
                </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">{tm('loading')}</p>
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



