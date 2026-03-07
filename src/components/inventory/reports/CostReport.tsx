import React, { useState, useEffect, useMemo } from 'react';
import { CostAccountingService, formatMoney, formatPercent } from '../../../services/costAccountingService';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function CostReport() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    // Mock IDs
    const firmaId = '1';
    const donemId = '1';

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const result = await CostAccountingService.calculatePeriodCOGS({
                    firma_id: firmaId,
                    donem_id: donemId
                });
                setData(result);
            } catch (error) {
                console.error('Failed to calculate COGS', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const columnHelper = createColumnHelper<any>();
    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        columnHelper.accessor('product_name', {
            header: tm('materialName'),
        }),
        columnHelper.accessor('quantity_sold', {
            header: tm('soldQuantity'),
        }),
        columnHelper.accessor('revenue', {
            header: tm('salesRevenue'),
            cell: info => formatMoney(info.getValue()),
        }),
        columnHelper.accessor('cogs', {
            header: tm('cogs'),
            cell: info => formatMoney(info.getValue()),
        }),
        columnHelper.accessor('profit', {
            header: tm('grossProfit'),
            cell: info => <span className={info.getValue() >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{formatMoney(info.getValue())}</span>,
        }),
        columnHelper.accessor('margin_percent', {
            header: tm('profitMargin'),
            cell: info => {
                const val = info.getValue();
                return <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${val >= 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.abs(val), 100)}%` }}></div>
                    </div>
                    <span>{formatPercent(val)}</span>
                </div>
            }
        }),
    ], []);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-purple-600" />
                        {tm('costAndProfitAnalysis')}
                    </h2>
                    {data && (
                        <div className="flex gap-4 mt-2 text-sm">
                            <div>{tm('totalRevenue')}: <span className="font-bold text-gray-900">{formatMoney(data.total_revenue)}</span></div>
                            <div>{tm('totalCost')}: <span className="font-bold text-red-600">{formatMoney(data.total_cogs)}</span></div>
                            <div>{tm('grossProfit')}: <span className="font-bold text-green-600">{formatMoney(data.gross_profit)}</span></div>
                        </div>
                    )}
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
                        data={data?.items || []}
                        columns={columns}
                        pageSize={50}
                    />
                )}
            </div>
        </div>
    );
}



