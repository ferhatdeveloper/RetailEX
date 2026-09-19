import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Package } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import {
    fetchLayeredInventoryValuation,
    layeredCostForProduct,
    type LayeredInventoryValuation,
} from '../../../services/layeredInventoryCost';

export function InventoryReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [valuation, setValuation] = useState<LayeredInventoryValuation | null>(null);
    const [loading, setLoading] = useState(true);
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
                const data = await productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr });
                if (cancelled) return;
                setProducts(data);
                const layered = await fetchLayeredInventoryValuation({
                    firmNr: selectedFirm?.firm_nr,
                    periodNr: selectedPeriod?.nr,
                    onHandProducts: data,
                }).catch((err) => {
                    console.error('Failed to load layered inventory cost', err);
                    return null;
                });
                if (cancelled) return;
                setValuation(layered);
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
        columnHelper.accessor(row => layeredCostForProduct(valuation, row), {
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
    ], [tm, currency, valuation, t]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('inventoryList')}</h2>
                </div>
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
                        {...REPORT_GRID_DEFAULTS}
                        excelFileName={tm('inventoryList') || 'envanter'}
                        printTitle={tm('inventoryList') || 'Envanter'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
