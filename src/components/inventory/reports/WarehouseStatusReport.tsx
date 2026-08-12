import React, { useState, useEffect, useMemo } from 'react';
import { warehouseAPI, type Warehouse } from '../../../services/warehouseAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Building2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

interface WarehouseStockRow {
    productCode: string;
    productName: string;
    total: number;
    [warehouseId: string]: any;
}

/**
 * Malzeme Ambar Durum — tenant-aware.
 * Per-depo stok kolonu, çoklu depo şeması olmadığı için şu an tüm stoğu ilk aktif
 * depoya atar (ana depo). Çoklu depo desteği eklendiğinde sorgu güncellenmeli.
 */
export function WarehouseStatusReport() {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const [whs, prods] = await Promise.all([
                    warehouseAPI.getActive(),
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                ]);
                if (cancelled) return;
                setWarehouses(whs);
                setProducts(prods);
            } catch (err) {
                console.error('[WarehouseStatusReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [selectedFirm?.firm_nr]);

    const rows = useMemo<WarehouseStockRow[]>(() => {
        return products.map(p => {
            const total = Number(p.stock) || 0;
            const row: WarehouseStockRow = {
                productCode: p.code || '',
                productName: p.name || '',
                total,
            };
            // Çoklu depo şeması yok — tüm stok ilk depoya atanır
            warehouses.forEach((w, idx) => {
                row[`wh_${w.id}`] = idx === 0 ? total : 0;
            });
            return row;
        });
    }, [products, warehouses]);

    const columnHelper = createColumnHelper<WarehouseStockRow>();
    const columns = useMemo<ColumnDef<WarehouseStockRow, any>[]>(() => {
        const base: ColumnDef<WarehouseStockRow, any>[] = [
            columnHelper.accessor('productCode', { header: tm('materialCode') }),
            columnHelper.accessor('productName', { header: tm('materialName') }),
            columnHelper.accessor('total', {
                header: tm('totalStock') || 'Toplam Stok',
                cell: info => <span className="font-bold">{formatNumber(Number(info.getValue()) || 0, 2)}</span>,
            }),
        ];
        const whCols = warehouses.map(w =>
            columnHelper.accessor((row: WarehouseStockRow) => row[`wh_${w.id}`] ?? 0, {
                id: `wh_${w.id}`,
                header: w.name,
                cell: info => formatNumber(Number(info.getValue()) || 0, 2),
            })
        );
        return [...base, ...whCols];
    }, [tm, warehouses]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-gray-700" />
                    <div>
                        <h2 className="font-semibold text-gray-800">
                            {tm('warehouseStatus') || 'Malzeme Ambar Durum'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {warehouses.length} {tm('warehouse') || 'depo'} · {products.length} {tm('material') || 'malzeme'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => exportDataGridToExcel(rows, columns, tm('warehouseStatus') || 'ambar_durum')}
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
