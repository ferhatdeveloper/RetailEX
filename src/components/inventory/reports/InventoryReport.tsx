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
        columnHelper.accessor('cost', {
            header: 'ALIŞ FİYATI',
            cell: info => info.getValue() ? info.getValue().toLocaleString() : '0',
            size: 120
        }),
        columnHelper.accessor(row => (row.cost || 0) * (row.stock || 0), {
            id: 'total_cost',
            header: 'TOPLAM DEĞER',
            cell: info => info.getValue() ? info.getValue().toLocaleString() : '0',
            size: 140
        }),
    ], [tm]);

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

            <div className="flex-1 overflow-hidden p-4 pb-0">
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
                        height="100%"
                    />
                )}
            </div>

            {/* Özet Bar — her zaman görünür, kesilmez */}
            {!loading && (
                <div className="flex-shrink-0 mx-4 mb-4 mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center shadow-inner">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Toplam Çeşit</span>
                            <span className="text-lg font-black text-blue-900">{products.length}</span>
                        </div>
                        <div className="w-px h-8 bg-blue-200"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Toplam Stok Adet</span>
                            <span className="text-lg font-black text-blue-900">
                                {products.reduce((acc, p) => acc + (p.stock || 0), 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <div className="bg-white px-6 py-2 rounded-xl border border-blue-200 shadow-sm flex flex-col items-end">
                        <span className="text-xs text-blue-500 font-bold uppercase">Envanter Toplam Alış Değeri</span>
                        <span className="text-2xl font-black text-blue-700">
                            {products.reduce((acc, p) => acc + ((p.cost || 0) * (p.stock || 0)), 0).toLocaleString()} <span className="text-sm font-bold opacity-70">IQD</span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}



