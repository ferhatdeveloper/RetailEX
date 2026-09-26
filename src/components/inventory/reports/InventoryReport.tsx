import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { warehouseAPI, type Warehouse } from '../../../services/warehouseAPI';
import { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Package } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import {
    fetchLayeredInventoryValuation,
    layeredCostForProduct,
    layeredAvgForProduct,
    type LayeredInventoryValuation,
} from '../../../services/layeredInventoryCost';
import { productCardUnitCost } from '../../../utils/productCardUnitCost';
import {
    fetchWeightedAverageUnitCosts,
    lookupWeightedAvgUnitCost,
} from '../../../services/weightedAverageUnitCost';

/** Envanter satırı + ambar stok klon alanları (wh_{id}) */
type InventoryRow = Product & Record<string, unknown>;

/** Az depoda tüm ambar kolonları açık; çoksa yalnızca ilk depo (Kolonlar’dan açılır) */
const WAREHOUSE_COLS_DEFAULT_VISIBLE_MAX = 5;

export function InventoryReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [valuation, setValuation] = useState<LayeredInventoryValuation | null>(null);
    const [avgByProduct, setAvgByProduct] = useState<Map<string, number>>(new Map());
    const [avgByCode, setAvgByCode] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    /** Malzeme listesi ile aynı: Özel Kod 2 varsayılan açık; diğerleri Kolonlar’dan seçilir */
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
        specialCode1: false,
        specialCode2: true,
        specialCode3: false,
        specialCode4: false,
        specialCode5: false,
        specialCode6: false,
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
                const [data, whs] = await Promise.all([
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                    warehouseAPI.getActive().catch((err) => {
                        console.error('Failed to load warehouses', err);
                        return [] as Warehouse[];
                    }),
                ]);
                if (cancelled) return;
                setProducts(data);
                setWarehouses(whs);
                // Ambar kolon görünürlüğü: az depo → hepsi açık; çok → yalnız ilk (klon alanlar)
                setColumnVisibility((prev) => {
                    const next = { ...prev };
                    const showAll = whs.length <= WAREHOUSE_COLS_DEFAULT_VISIBLE_MAX;
                    whs.forEach((w, idx) => {
                        const id = `wh_${w.id}`;
                        if (next[id] === undefined) {
                            next[id] = showAll || idx === 0;
                        }
                    });
                    return next;
                });
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
                const avgMaps = await fetchWeightedAverageUnitCosts({
                    firmNr: selectedFirm?.firm_nr,
                    periodNr: selectedPeriod?.nr,
                }).catch((err) => {
                    console.error('Failed to load weighted avg unit cost', err);
                    return { byProductId: new Map<string, number>(), byCode: new Map<string, number>() };
                });
                if (cancelled) return;
                setAvgByProduct(avgMaps.byProductId);
                setAvgByCode(avgMaps.byCode);
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

    /**
     * Malzeme Ambar Durum ile aynı: çoklu depo şeması yokken tüm stok ilk aktif depoya atanır.
     */
    const rows = useMemo<InventoryRow[]>(() => {
        return products.map((p) => {
            const total = Number(p.stock) || 0;
            const extras: Record<string, number> = {};
            warehouses.forEach((w, idx) => {
                extras[`wh_${w.id}`] = idx === 0 ? total : 0;
            });
            return { ...p, ...extras };
        });
    }, [products, warehouses]);

    const columnHelper = createColumnHelper<InventoryRow>();
    const specialCodeHeader = (n: number) => `${tm('specialCode')} ${n}`;
    const specialCodeCell = (value: unknown) =>
        value != null && String(value).trim() !== '' ? String(value).trim() : '—';

    const columns = useMemo<ColumnDef<InventoryRow, any>[]>(() => {
        const base: ColumnDef<InventoryRow, any>[] = [
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
                header: tm('totalStock') || tm('currentStock') || 'Toplam Stok',
                cell: info => (
                    <span className={`font-bold ${Number(info.getValue()) <= (info.row.original.min_stock || 0) ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatNumber(Number(info.getValue()) || 0, 2)}
                    </span>
                ),
            }),
            ...warehouses.map((w) =>
                columnHelper.accessor((row: InventoryRow) => Number(row[`wh_${w.id}`]) || 0, {
                    id: `wh_${w.id}`,
                    header: w.name || w.code || tm('warehouse') || 'Depo',
                    cell: (info) => formatNumber(Number(info.getValue()) || 0, 2),
                    size: 120,
                })
            ),
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
            columnHelper.accessor((row) => {
                const fromAvg = lookupWeightedAvgUnitCost(
                    { byProductId: avgByProduct, byCode: avgByCode },
                    row,
                );
                if (fromAvg > 0) return fromAvg;
                const layered = layeredAvgForProduct(valuation, row);
                if (layered > 0) return layered;
                return productCardUnitCost(
                    row as Product & { cost?: number; purchase_price?: number },
                );
            }, {
                id: 'unit_purchase_cost',
                header: tm('purchasePrice') || 'Alış Fiyatı',
                cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
                size: 140
            }),
            columnHelper.accessor('price', {
                header: t('salePrice', 'Satış Fiyatı'),
                cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
                size: 140
            }),
            columnHelper.accessor(row => {
                const qty = Number(row.stock) || 0;
                const layeredTotal = layeredCostForProduct(valuation, row);
                if (layeredTotal > 0) return layeredTotal;
                const fromAvg = lookupWeightedAvgUnitCost(
                    { byProductId: avgByProduct, byCode: avgByCode },
                    row,
                );
                if (fromAvg > 0) return qty * fromAvg;
                return qty * productCardUnitCost(
                    row as Product & { cost?: number; purchase_price?: number },
                );
            }, {
                id: 'total_cost',
                header: tm('totalValue') || 'Toplam Değer',
                cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
                size: 160
            }),
            columnHelper.accessor(row => (Number(row.price) || 0) * (Number(row.stock) || 0), {
                id: 'total_sales_value',
                header: t('totalSalesValue', 'Toplam Satış Değeri'),
                cell: info => `${(Number(info.getValue()) || 0).toLocaleString()} ${currency}`,
                size: 180
            }),
        ];
        return base;
    }, [tm, currency, valuation, avgByProduct, avgByCode, t, warehouses]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <div>
                        <h2 className="font-semibold text-gray-800">{tm('inventoryList')}</h2>
                        {warehouses.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                                {warehouses.length} {tm('warehouse') || 'depo'} · {products.length} {tm('material') || 'malzeme'}
                            </p>
                        )}
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
                        excelFileName={tm('inventoryList') || 'envanter'}
                        printTitle={tm('inventoryList') || 'Envanter'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
