import React, { useState, useEffect, useMemo } from 'react';
import { warehouseAPI, type Warehouse } from '../../../services/warehouseAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Building2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

interface WarehouseStockRow {
    productCode: string;
    productName: string;
    category: string;
    brand: string;
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
    /** Malzeme listesi / Envanter ile aynı: Özel Kod 2 varsayılan açık; diğerleri Kolonlar’dan seçilir */
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
        category: true,
        brand: true,
        specialCode1: false,
        specialCode2: true,
        specialCode3: false,
        specialCode4: false,
        specialCode5: false,
        specialCode6: false,
    });
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
        const trimOrEmpty = (v: unknown) =>
            v != null && String(v).trim() !== '' ? String(v).trim() : '';
        return products.map(p => {
            const total = Number(p.stock) || 0;
            const row: WarehouseStockRow = {
                productCode: p.code || '',
                productName: p.name || '',
                category: trimOrEmpty(p.category),
                brand: trimOrEmpty(p.brand),
                specialCode1: trimOrEmpty(p.specialCode1),
                specialCode2: trimOrEmpty(p.specialCode2),
                specialCode3: trimOrEmpty(p.specialCode3),
                specialCode4: trimOrEmpty(p.specialCode4),
                specialCode5: trimOrEmpty(p.specialCode5),
                specialCode6: trimOrEmpty(p.specialCode6),
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
    const specialCodeHeader = (n: number) => `${tm('specialCode')} ${n}`;
    const specialCodeCell = (value: unknown) =>
        value != null && String(value).trim() !== '' ? String(value).trim() : '—';

    const columns = useMemo<ColumnDef<WarehouseStockRow, any>[]>(() => {
        const base: ColumnDef<WarehouseStockRow, any>[] = [
            columnHelper.accessor('productCode', { header: tm('materialCode') }),
            columnHelper.accessor('productName', { header: tm('materialName') }),
            columnHelper.accessor('category', {
                id: 'category',
                header: tm('category'),
                cell: info => specialCodeCell(info.getValue()),
            }),
            columnHelper.accessor('brand', {
                id: 'brand',
                header: tm('brand'),
                cell: info => specialCodeCell(info.getValue()),
            }),
            columnHelper.accessor('specialCode1', {
                id: 'specialCode1',
                header: specialCodeHeader(1),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode2', {
                id: 'specialCode2',
                header: specialCodeHeader(2),
                cell: info => specialCodeCell(info.getValue()),
                size: 110,
            }),
            columnHelper.accessor('specialCode3', {
                id: 'specialCode3',
                header: specialCodeHeader(3),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode4', {
                id: 'specialCode4',
                header: specialCodeHeader(4),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode5', {
                id: 'specialCode5',
                header: specialCodeHeader(5),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
            }),
            columnHelper.accessor('specialCode6', {
                id: 'specialCode6',
                header: specialCodeHeader(6),
                cell: info => specialCodeCell(info.getValue()),
                size: 100,
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
                        excelFileName={tm('warehouseStatus') || 'malzeme-ambar-durum'}
                        printTitle={tm('warehouseStatus') || 'Malzeme Ambar Durum'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
