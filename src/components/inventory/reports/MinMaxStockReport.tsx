import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import { warehouseAPI, type Warehouse } from '../../../services/warehouseAPI';
import { postgres } from '../../../services/postgres';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

/** Min/Max satırı — ürün × depo (mümkünse depo bazlı stok). */
export interface MinMaxStockRow {
    id: string;
    code: string;
    name: string;
    warehouse_id: string;
    warehouse_name: string;
    stock: number;
    min_stock: number;
    max_stock: number | null;
}

type WarehouseBalance = {
    productId: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseNameRaw: string;
    qty: number;
};

/** Hareket / WarehouseStatus ile aynı: kod + ad; yoksa yalnız ad/kod. */
function formatWarehouseLabel(code?: unknown, name?: unknown): string {
    const c = String(code ?? '').trim();
    const n = String(name ?? '').trim();
    if (c && n) return `${c}, ${n}`;
    return n || c || '';
}

/**
 * Ambar fiş kalemlerinden ürün×depo kümülatif miktar.
 * Depo adı: stores join (warehouse_id → code/name).
 */
async function fetchWarehouseBalances(): Promise<WarehouseBalance[]> {
    try {
        const { rows } = await postgres.query<{
            product_id: string;
            warehouse_id: string;
            warehouse_code: string;
            warehouse_name_raw: string;
            qty: number;
        }>(
            `SELECT
                smi.product_id::text AS product_id,
                COALESCE(sm.warehouse_id::text, '') AS warehouse_id,
                COALESCE(NULLIF(TRIM(s.code), ''), '') AS warehouse_code,
                COALESCE(NULLIF(TRIM(s.name), ''), '') AS warehouse_name_raw,
                SUM(smi.quantity)::float8 AS qty
             FROM stock_movement_items smi
             JOIN stock_movements sm ON sm.id = smi.movement_id
             LEFT JOIN stores s ON s.id = sm.warehouse_id
             WHERE smi.product_id IS NOT NULL
             GROUP BY smi.product_id, sm.warehouse_id, s.code, s.name`
        );
        return (rows || []).map((r) => ({
            productId: String(r.product_id || ''),
            warehouseId: String(r.warehouse_id || ''),
            warehouseCode: String(r.warehouse_code || ''),
            warehouseNameRaw: String(r.warehouse_name_raw || ''),
            qty: Number(r.qty) || 0,
        }));
    } catch (err) {
        console.warn('[MinMaxStockReport] warehouse balances failed:', err);
        return [];
    }
}

function pickDefaultWarehouse(warehouses: Warehouse[]): Warehouse | null {
    if (!warehouses.length) return null;
    // Ana depo: kod/adında "merkez" geçen, yoksa listedeki ilk aktif depo
    const main = warehouses.find((w) => {
        const blob = `${w.code || ''} ${w.name || ''}`.toLocaleLowerCase('tr-TR');
        return blob.includes('merkez') || blob.includes('main') || blob.includes('ana');
    });
    return main || warehouses[0];
}

export function MinMaxStockReport() {
    const [rows, setRows] = useState<MinMaxStockRow[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<'all' | 'low' | 'out'>('all');
    const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();

    const warehouseHeader = `${tm('warehouse') || 'Depo'} / ${tm('warehouseField') || 'Ambar'}`;

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            setLoading(true);
            try {
                const [allProducts, whs, balances] = await Promise.all([
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                    warehouseAPI.getActive().catch((err) => {
                        console.error('[MinMaxStockReport] warehouses failed', err);
                        return [] as Warehouse[];
                    }),
                    fetchWarehouseBalances(),
                ]);
                if (cancelled) return;

                setWarehouses(whs);
                const defaultWh = pickDefaultWarehouse(whs);
                const defaultWhId = defaultWh?.id ? String(defaultWh.id) : '';
                const defaultWhName =
                    formatWarehouseLabel(defaultWh?.code, defaultWh?.name) || 'Merkez Ambar';

                const byProduct = new Map<string, WarehouseBalance[]>();
                for (const b of balances) {
                    if (!b.productId) continue;
                    const list = byProduct.get(b.productId) || [];
                    list.push(b);
                    byProduct.set(b.productId, list);
                }

                const built: MinMaxStockRow[] = [];
                for (const p of allProducts) {
                    const pid = String(p.id || '');
                    const code = p.code || '';
                    const name = p.name || '';
                    const minStock = Number(p.min_stock) || 0;
                    const maxStock =
                        p.max_stock != null && p.max_stock !== undefined
                            ? Number(p.max_stock)
                            : null;
                    const cardStock = Number(p.stock) || 0;
                    const whBalances = byProduct.get(pid) || [];

                    if (whBalances.length > 0) {
                        for (const b of whBalances) {
                            const whName =
                                formatWarehouseLabel(b.warehouseCode, b.warehouseNameRaw) ||
                                defaultWhName;
                            built.push({
                                id: `${pid}::${b.warehouseId || 'none'}`,
                                code,
                                name,
                                warehouse_id: b.warehouseId || defaultWhId,
                                warehouse_name: whName,
                                stock: b.qty,
                                min_stock: minStock,
                                max_stock: maxStock,
                            });
                        }
                    } else {
                        // Çoklu depo hareketi yok — kart stoğu varsayılan depoya (WarehouseStatus ile uyumlu)
                        built.push({
                            id: `${pid}::${defaultWhId || 'default'}`,
                            code,
                            name,
                            warehouse_id: defaultWhId,
                            warehouse_name: defaultWhName,
                            stock: cardStock,
                            min_stock: minStock,
                            max_stock: maxStock,
                        });
                    }
                }

                setRows(built);
            } catch (error) {
                console.error('Failed to load stock data', error);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadData();
        return () => {
            cancelled = true;
        };
    }, [selectedFirm?.firm_nr]);

    const filteredRows = useMemo(() => {
        let list = rows;
        if (warehouseFilter !== 'all') {
            list = list.filter((r) => r.warehouse_id === warehouseFilter);
        }
        if (filterType === 'low') {
            list = list.filter((r) => r.stock <= (r.min_stock || 0));
        } else if (filterType === 'out') {
            list = list.filter((r) => r.stock <= 0);
        }
        return list;
    }, [rows, filterType, warehouseFilter]);

    const columnHelper = createColumnHelper<MinMaxStockRow>();
    const columns = useMemo<ColumnDef<MinMaxStockRow, any>[]>(
        () => [
            columnHelper.accessor('code', {
                header: tm('code'),
                cell: (info) => info.getValue() || '',
            }),
            columnHelper.accessor('warehouse_name', {
                id: 'warehouse_name',
                header: warehouseHeader,
                cell: (info) => info.getValue() || '—',
            }),
            columnHelper.accessor('name', {
                header: tm('materialName'),
            }),
            columnHelper.accessor('stock', {
                header: tm('currentStock'),
                cell: (info) => {
                    const val = Number(info.getValue()) || 0;
                    const min = info.row.original.min_stock || 0;
                    const isLow = val <= min;
                    return (
                        <span className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                            {val}
                        </span>
                    );
                },
            }),
            columnHelper.accessor('min_stock', {
                header: tm('minStock'),
                cell: (info) => info.getValue() || 0,
            }),
            columnHelper.accessor('max_stock', {
                header: tm('maxStock'),
                cell: (info) => {
                    const v = info.getValue();
                    return v != null && v !== undefined ? v : '-';
                },
            }),
            columnHelper.display({
                id: 'status',
                header: tm('status'),
                cell: (info) => {
                    const stock = info.row.original.stock;
                    const min = info.row.original.min_stock || 0;
                    const max = info.row.original.max_stock;

                    if (stock === 0)
                        return (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                                {tm('depleted')}
                            </span>
                        );
                    if (stock <= min)
                        return (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                {tm('critical')}
                            </span>
                        );
                    if (max != null && stock >= max)
                        return (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {tm('overStock')}
                            </span>
                        );
                    return (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            {tm('normal')}
                        </span>
                    );
                },
            }),
        ],
        [tm, warehouseHeader]
    );

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 space-y-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{tm('minMaxStockControl')}</h1>
                    <p className="text-sm text-gray-500">
                        {tm('criticalStock')} & {tm('outOfStock')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            filterType === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {tm('all')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('low')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            filterType === 'low'
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {tm('criticalStock')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('out')}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            filterType === 'out'
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        {tm('outOfStock') || 'Tükenenler'}
                    </button>

                    {warehouses.length > 0 && (
                        <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
                            <span className="whitespace-nowrap">{warehouseHeader}:</span>
                            <select
                                value={warehouseFilter}
                                onChange={(e) => setWarehouseFilter(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">{tm('mmAllWarehouses') || 'Tüm Depolar'}</option>
                                {warehouses.map((w) => (
                                    <option key={w.id} value={String(w.id)}>
                                        {formatWarehouseLabel(w.code, w.name) || w.name || w.code}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">{tm('analyzing') || 'Analiz ediliyor...'}</p>
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={filteredRows}
                        columns={columns}
                        {...REPORT_GRID_DEFAULTS}
                        excelFileName={tm('minMaxStockControl') || 'min-max-stok'}
                        printTitle={tm('minMaxStockControl') || 'Min/Max Stok Kontrol'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
