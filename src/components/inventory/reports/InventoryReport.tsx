import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Package } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function InventoryReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const data = await productAPI.getAll();
                setProducts(data);
            } catch (error) {
                console.error('Failed to load inventory', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const columnHelper = createColumnHelper<Product>();
    const columns = useMemo<ColumnDef<Product, any>[]>(() => [
        columnHelper.accessor('code', {
            header: tm('materialCode'),
            cell: info => info.getValue() || '',
        }),
        columnHelper.accessor('name', {
            header: tm('materialDescription'),
            cell: info => info.getValue() || '',
        }),
        columnHelper.accessor('category', {
            header: tm('category'),
            cell: info => info.getValue() || '',
        }),
        columnHelper.accessor('stock', {
            header: tm('currentStock'),
            cell: info => <span className={`font-bold ${info.getValue() <= (info.row.original.min_stock || 0) ? 'text-red-600' : 'text-gray-900'}`}>{info.getValue()}</span>,
        }),
        columnHelper.accessor('unit', {
            header: tm('unit'),
            cell: info => info.getValue() || '',
        }),
        columnHelper.accessor('min_stock', {
            header: tm('minStock'),
            cell: info => info.getValue() || 0,
        }),
        columnHelper.accessor('brand', {
            header: tm('brand'),
            cell: info => info.getValue() || '-',
        }),
    ], []);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('inventoryList')}</h2>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
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
                        data={products}
                        columns={columns}
                        pageSize={50}
                    />
                )}
            </div>
        </div>
    );
}

