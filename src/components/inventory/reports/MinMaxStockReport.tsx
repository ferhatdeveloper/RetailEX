import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, AlertTriangle, Filter } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function MinMaxStockReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<'all' | 'low' | 'out'>('all');
    const { tm } = useLanguage();

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const allData = await productAPI.getAll();
                let filteredData = allData;

                if (filterType === 'low') {
                    filteredData = allData.filter(p => (p.stock || 0) <= (p.min_stock || 0));
                } else if (filterType === 'out') {
                    filteredData = allData.filter(p => (p.stock || 0) === 0);
                }

                setProducts(filteredData);
            } catch (error) {
                console.error('Failed to load stock data', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [filterType]);

    const columnHelper = createColumnHelper<Product>();
    const columns = useMemo<ColumnDef<Product, any>[]>(() => [
        columnHelper.accessor('code', {
            header: tm('code'),
            cell: info => info.getValue() || '',
        }),
        columnHelper.accessor('name', {
            header: tm('materialName'),
        }),
        columnHelper.accessor('stock', { // Assuming 'stock' is the correct field, not 'stock_amount' as in the diff
            header: tm('currentStock'),
            cell: info => {
                const val = info.getValue() as number;
                const min = info.row.original.min_stock || 0;
                const isLow = val <= min;
                return <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{val}</span>
            }
        }),
        columnHelper.accessor('min_stock', {
            header: tm('minStock'),
            cell: info => info.getValue() || 0,
        }),
        columnHelper.accessor('max_stock', {
            header: tm('maxStock'),
            cell: info => info.getValue() || '-',
        }),
        columnHelper.display({
            id: 'status',
            header: tm('status'),
            cell: info => {
                const stock = info.row.original.stock; // Assuming 'stock' is the correct field, not 'stock_amount' as in the diff
                const min = info.row.original.min_stock || 0;
                const max = info.row.original.max_stock;

                if (stock === 0) return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">{tm('depleted')}</span>;
                if (stock <= min) return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">{tm('critical')}</span>;
                if (max && stock >= max) return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">{tm('overStock')}</span>;
                return <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">{tm('normal')}</span>;
            }
        })
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{tm('minMaxStockControl')}</h1>
                        <p className="text-sm text-gray-500">{tm('criticalStock')} & {tm('outOfStock')}</p>
                    </div>
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

                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        {tm('all')}
                    </button>
                    <button
                        onClick={() => setFilterType('low')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${filterType === 'low' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        {tm('criticalStock')}
                    </button>
                    <button
                        onClick={() => setFilterType('out')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${filterType === 'out' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        Tükenenler
                    </button>
                </div>

                <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                    Excel
                </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">Analiz ediliyor...</p>
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={products}
                        columns={columns}
                        pageSize={50}
                    />
                )}
            </div>
        </div>
    );
}

