import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { warehouseAPI, type Warehouse } from '../../../services/warehouseAPI';
import { productAPI } from '../../../services/api/products';
import { hardRefreshProductsAndStock } from '../../../services/hardRefreshProducts';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Building2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useRegisterDatagridRefresh } from '../../../hooks/useRegisterDatagridRefresh';
import { useRetailexInvalidateRefresh } from '../../../hooks/useRetailexInvalidateRefresh';
import {
    productCardReportFields,
    productCardCodesCamel,
    DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY,
    specialCodeColumnHeader,
    productCardGroupHeader,
} from '../../../utils/productCardReportFields';

interface WarehouseStockRow {
    productCode: string;
    productName: string;
    category: string;
    brand: string;
    group: string;
    specialCode1: string;
    specialCode2: string;
    specialCode3: string;
    specialCode4: string;
    specialCode5: string;
    specialCode6: string;
    total: number;
    [warehouseId: string]: string | number;
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
    /** Özel Kod 1 + Marka + Grup + Kategori varsayılan açık; Özel Kod 2–6 Kolonlar’dan */
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
        () => ({ ...DEFAULT_PRODUCT_CARD_COLUMN_VISIBILITY }),
    );
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();

    const loadData = useCallback(async (opts?: { recompute?: boolean }) => {
        const doRecompute = opts?.recompute === true;
        setLoading(true);
        setProducts([]);
        try {
            if (doRecompute) {
                await hardRefreshProductsAndStock({ recompute: true, emit: false });
            }
            const [whs, prods] = await Promise.all([
                warehouseAPI.getActive(),
                productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
            ]);
            setWarehouses(whs);
            setProducts(prods);
        } catch (err) {
            console.error('[WarehouseStatusReport] load failed', err);
        } finally {
            setLoading(false);
        }
    }, [selectedFirm?.firm_nr]);

    useRegisterDatagridRefresh(() => loadData({ recompute: true }));
    useRetailexInvalidateRefresh(['products', 'invoices', 'sales'], () =>
        loadData({ recompute: false }),
    );

    useEffect(() => {
        void loadData({ recompute: false });
    }, [loadData]);

    const rows = useMemo<WarehouseStockRow[]>(() => {
        const trimOrEmpty = (v: unknown) =>
            v != null && String(v).trim() !== '' ? String(v).trim() : '';
        return products.map(p => {
            const total = Number(p.stock) || 0;
            const card = productCardReportFields(p);
            const codes = productCardCodesCamel(card);
            const row: WarehouseStockRow = {
                productCode: p.code || '',
                productName: p.name || '',
                ...codes,
                category: card.category || trimOrEmpty(p.category),
                brand: card.brand || trimOrEmpty(p.brand),
                group: card.group || trimOrEmpty(p.groupCode),
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
    const specialCodeCell = (value: unknown) =>
        value != null && String(value).trim() !== '' ? String(value).trim() : '—';

    const columns = useMemo<ColumnDef<WarehouseStockRow, any>[]>(() => {
        const base: ColumnDef<WarehouseStockRow, any>[] = [
            columnHelper.accessor('productCode', { header: tm('materialCode') }),
            columnHelper.accessor('productName', { header: tm('materialName') }),
            columnHelper.accessor('specialCode1', {
                id: 'specialCode1',
                header: specialCodeColumnHeader(tm, 1),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode2', {
                id: 'specialCode2',
                header: specialCodeColumnHeader(tm, 2),
                cell: info => specialCodeCell(info.getValue()),
                size: 110,
            }),
            columnHelper.accessor('specialCode3', {
                id: 'specialCode3',
                header: specialCodeColumnHeader(tm, 3),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode4', {
                id: 'specialCode4',
                header: specialCodeColumnHeader(tm, 4),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode5', {
                id: 'specialCode5',
                header: specialCodeColumnHeader(tm, 5),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode6', {
                id: 'specialCode6',
                header: specialCodeColumnHeader(tm, 6),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('brand', {
                id: 'brand',
                header: tm('brand'),
                cell: info => specialCodeCell(info.getValue()),
            }),
            columnHelper.accessor('group', {
                id: 'group',
                header: productCardGroupHeader(tm),
                cell: info => specialCodeCell(info.getValue()),
            }),
            columnHelper.accessor('category', {
                id: 'category',
                header: tm('category'),
                cell: info => specialCodeCell(info.getValue()),
            }),
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
            <div className="p-4 border-b border-gray-200 bg-gray-50">
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
                        data={rows}
                        columns={columns}
                        {...REPORT_GRID_DEFAULTS}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        storageNamespace="report-warehouse-status-v2"
                        excelFileName={tm('warehouseStatus') || 'malzeme-ambar-durum'}
                        printTitle={tm('warehouseStatus') || 'Malzeme Ambar Durum'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
