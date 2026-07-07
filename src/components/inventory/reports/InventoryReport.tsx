import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { salesAPI } from '../../../services/api/sales';
import { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Package, Columns3 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

export function InventoryReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [totalSalesAmount, setTotalSalesAmount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
        code: true,
        name: true,
        category: true,
        stock: true,
        unit: true,
        min_stock: true,
        brand: true,
        cost: true,
        price: true,
        total_cost: true,
        total_sales_value: true,
    });
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const currency = selectedFirm?.ana_para_birimi || 'IQD';
    const t = (key: string, fallback: string) => {
        const value = tm(key as any);
        if (!value || value === key) return fallback;
        return value;
    };

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            setLoading(true);
            try {
                const [data, summary] = await Promise.all([
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                    salesAPI.getSummary().catch(() => ({ totalRevenue: 0 }))
                ]);
                if (cancelled) return;
                setProducts(data);
                setTotalSalesAmount(Number(summary?.totalRevenue || 0));
            } catch (error) {
                console.error('Failed to load inventory', error);
            } finally {
                if (cancelled) return;
                setLoading(false);
            }
        }
        loadData();
        return () => {
            cancelled = true;
        };
    }, [selectedFirm?.firm_nr, selectedPeriod?.nr]);

    const columnHelper = createColumnHelper<Product>();
    const totals = useMemo(() => {
        const totalStockUnits = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
        const totalInventoryCostValue = products.reduce((acc, p) => acc + ((Number(p.cost) || 0) * (Number(p.stock) || 0)), 0);
        const totalInventorySalesValue = products.reduce((acc, p) => acc + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
        return {
            totalStockUnits,
            totalInventoryCostValue,
            totalInventorySalesValue
        };
    }, [products]);

    const columns = useMemo<ColumnDef<Product, any>[]>(() => [
        columnHelper.accessor('code', {
            header: tm('materialCode'),
            cell: info => info.getValue() || info.row.original.barcode || '-',
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
            header: tm('purchasePrice') || 'Alış Fiyatı',
            cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
            size: 140
        }),
        columnHelper.accessor('price', {
            header: t('salePrice', 'Satış Fiyatı'),
            cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
            size: 140
        }),
        columnHelper.accessor(row => (row.cost || 0) * (row.stock || 0), {
            id: 'total_cost',
            header: tm('totalValue') || 'Toplam Değer',
            cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
            size: 160
        }),
        columnHelper.accessor(row => (row.price || 0) * (row.stock || 0), {
            id: 'total_sales_value',
            header: t('totalSalesValue', 'Toplam Satış Değeri'),
            cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
            size: 180
        }),
    ], [tm, currency]);

    const columnLabels: Record<string, string> = {
        code: tm('materialCode') || 'Ürün Kodu',
        name: tm('materialDescription') || 'Ürün Adı',
        category: tm('category') || 'Kategori',
        stock: tm('currentStock') || 'Mevcut Stok',
        unit: tm('unit') || 'Birim',
        min_stock: tm('minStock') || 'Minimum Stok',
        brand: tm('brand') || 'Marka',
        cost: tm('purchasePrice') || 'Alış Fiyatı',
        price: t('salePrice', 'Satış Fiyatı'),
        total_cost: tm('totalValue') || 'Toplam Değer',
        total_sales_value: t('totalSalesValue', 'Toplam Satış Değeri'),
    };

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('inventoryList')}</h2>
                </div>
                <div className="flex items-center gap-2 relative">
                    <button
                        onClick={() => setShowColumnMenu((v) => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                    >
                        <Columns3 className="w-4 h-4" />
                        {tm('columns') || 'Sütunlar'}
                    </button>
                    {showColumnMenu && (
                        <div className="absolute right-0 top-11 z-30 w-60 rounded-lg border border-gray-200 bg-white shadow-xl p-3">
                            <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">{tm('columns') || 'Sütunlar'}</div>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {Object.keys(columnLabels).map((columnId) => (
                                    <label key={columnId} className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 rounded px-2 py-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={columnVisibility[columnId] !== false}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setColumnVisibility((prev) => ({ ...prev, [columnId]: checked }));
                                            }}
                                        />
                                        <span>{columnLabels[columnId]}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => exportDataGridToExcel(products, columns, tm('inventoryList') || 'envanter')}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        {tm('excel')}
                    </button>
                </div>
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
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        showColumnVisibilityToolbar={false}
                        enableExcelExport={false}
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
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{tm('totalVariety') || 'Toplam Çeşit'}</span>
                            <span className="text-lg font-black text-blue-900">{products.length}</span>
                        </div>
                        <div className="w-px h-8 bg-blue-200"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{tm('totalStockUnits') || 'Toplam Stok Adet'}</span>
                            <span className="text-lg font-black text-blue-900">
                                {totals.totalStockUnits.toLocaleString()}
                            </span>
                        </div>
                        <div className="w-px h-8 bg-blue-200"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{tm('salesTotal') || 'Satış Toplamı'}</span>
                            <span className="text-lg font-black text-blue-900">
                                {totalSalesAmount.toLocaleString()} <span className="text-xs font-bold opacity-70">{currency}</span>
                            </span>
                        </div>
                    </div>
                    <div className="bg-white px-6 py-2 rounded-xl border border-blue-200 shadow-sm flex flex-col items-end">
                        <span className="text-xs text-blue-500 font-bold uppercase">{tm('totalInventoryValue') || 'Envanter Toplam Alış Değeri'}</span>
                        <span className="text-2xl font-black text-blue-700">
                            {totals.totalInventoryCostValue.toLocaleString()} <span className="text-sm font-bold opacity-70">{currency}</span>
                        </span>
                    </div>
                    <div className="bg-white px-6 py-2 rounded-xl border border-green-200 shadow-sm flex flex-col items-end">
                        <span className="text-xs text-green-600 font-bold uppercase">{t('totalInventorySalesValue', 'Envanter Toplam Satış Değeri')}</span>
                        <span className="text-2xl font-black text-green-700">
                            {totals.totalInventorySalesValue.toLocaleString()} <span className="text-sm font-bold opacity-70">{currency}</span>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}



