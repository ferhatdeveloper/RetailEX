import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Banknote } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';

interface ValuationRow {
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: number;
    average_unit_cost: number;
    total_cost: number;
}

/**
 * Malzeme Değer Raporu — tenant-aware (rex_{firmNr}_products).
 * FIFO katmanları henüz mevcut değil; ortalama maliyet (products.cost) × stok ile
 * yaklaşık değer hesaplanır. Para birimi seçili firmanın ana_para_birimi'nden alınır.
 */
export function MaterialValueReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const currency = selectedFirm?.ana_para_birimi || 'IQD';

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            setLoading(true);
            try {
                const data = await productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr });
                if (!cancelled) setProducts(data);
            } catch (err) {
                console.error('[MaterialValueReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, [selectedFirm?.firm_nr]);

    const rows = useMemo<ValuationRow[]>(() => {
        return products
            .filter(p => (p.stock || 0) > 0)
            .map(p => {
                const qty = Number(p.stock) || 0;
                const cost = Number(p.cost) || 0;
                return {
                    product_id: p.id,
                    product_code: p.code || '',
                    product_name: p.name || '',
                    unit: p.unit || '',
                    quantity: qty,
                    average_unit_cost: cost,
                    total_cost: qty * cost,
                };
            });
    }, [products]);

    const totalValue = useMemo(() => rows.reduce((acc, r) => acc + r.total_cost, 0), [rows]);

    const columnHelper = createColumnHelper<ValuationRow>();
    const columns = useMemo<ColumnDef<ValuationRow, any>[]>(() => [
        columnHelper.accessor('product_code', { header: tm('materialCode') }),
        columnHelper.accessor('product_name', { header: tm('materialDescription') }),
        columnHelper.accessor('unit', { header: tm('unit'), size: 80 }),
        columnHelper.accessor('quantity', {
            header: tm('quantity'),
            cell: info => formatNumber(Number(info.getValue()) || 0, 2),
        }),
        columnHelper.accessor('average_unit_cost', {
            header: tm('avgUnitCost') || 'Ortalama Birim Maliyet',
            cell: info => `${formatNumber(Number(info.getValue()) || 0, 2)} ${currency}`,
        }),
        columnHelper.accessor('total_cost', {
            header: tm('totalValue') || 'Toplam Değer',
            cell: info => (
                <span className="font-bold text-blue-600">
                    {formatNumber(Number(info.getValue()) || 0, 2)} {currency}
                </span>
            ),
        }),
    ], [tm, currency]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-green-600" />
                        {tm('materialValueReport') || 'Malzeme Değer Raporu'}
                    </h2>
                    <div className="text-sm text-gray-500 mt-1">
                        {tm('totalInventoryValue') || 'Toplam Envanter Değeri'}:{' '}
                        <span className="font-bold text-green-700 text-lg">
                            {formatNumber(totalValue, 2)} {currency}
                        </span>
                        <span className="ml-3 text-xs text-gray-400">
                            ({rows.length} {tm('material') || 'malzeme'})
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => exportDataGridToExcel(rows, columns, tm('materialValueReport') || 'malzeme_deger')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm"
                >
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
                    <DevExDataGrid data={rows} columns={columns} pageSize={50} enableExcelExport={false} />
                )}
            </div>
        </div>
    );
}
