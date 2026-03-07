import React, { useState, useEffect, useMemo } from 'react';
import { CostAccountingService } from '../../../services/costAccountingService';
import { productAPI } from '../../../services/api/products';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, ArrowRightLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface InOutRow {
    productId: string;
    productCode: string;
    productName: string;
    totalIn: number;
    totalOut: number;
    netChange: number;
}

export function InOutTotalsReport() {
    const [data, setData] = useState<InOutRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    // Mock IDs
    const firmaId = '1';
    const donemId = '1';

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                // Fetch movements and products
                const [movements, products] = await Promise.all([
                    CostAccountingService.getStockMovements({ firma_id: firmaId, donem_id: donemId }),
                    productAPI.getAll()
                ]);

                // Map products for easy lookup
                const productMap = new Map(products.map(p => [p.id, p]));

                // Aggregate movements
                const aggregation = new Map<string, { in: number, out: number }>();

                movements.forEach(m => {
                    if (!aggregation.has(m.product_id)) {
                        aggregation.set(m.product_id, { in: 0, out: 0 });
                    }
                    const curr = aggregation.get(m.product_id)!;

                    if (m.movement_type === 'IN') {
                        curr.in += m.quantity;
                    } else if (m.movement_type === 'OUT') {
                        curr.out += m.quantity;
                    }
                });

                // Create rows
                const rows: InOutRow[] = [];
                aggregation.forEach((val, productId) => {
                    const product = productMap.get(productId);
                    if (product) {
                        rows.push({
                            productId,
                            productCode: product.code || '',
                            productName: product.name,
                            totalIn: val.in,
                            totalOut: val.out,
                            netChange: val.in - val.out
                        });
                    }
                });

                setData(rows);
            } catch (error) {
                console.error('Failed to load data', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const columnHelper = createColumnHelper<InOutRow>();
    const columns = useMemo<ColumnDef<InOutRow, any>[]>(() => [
        columnHelper.accessor('productCode', {
            header: tm('materialCode'),
        }),
        columnHelper.accessor('productName', {
            header: tm('materialName'),
        }),
        columnHelper.accessor('totalIn', {
            header: tm('totalIn'),
            cell: info => <span className="text-green-600 font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('totalOut', {
            header: tm('totalOut'),
            cell: info => <span className="text-red-600 font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('netChange', {
            header: tm('netChange'),
            cell: info => <span className={`font-bold ${info.getValue() >= 0 ? 'text-green-700' : 'text-red-700'}`}>{info.getValue() > 0 ? '+' : ''}{info.getValue()}</span>,
        }),
    ], []);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('inOutTotals')}</h2>
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



