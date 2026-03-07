import React, { useState, useEffect, useMemo } from 'react';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { warehouseAPI } from '../../../services/warehouseAPI';
import { productAPI } from '../../../services/api/products';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Building2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface WarehouseStockRow {
    productCode: string;
    productName: string;
    // Dynamic columns for each warehouse
    [key: string]: any;
}

export function WarehouseStatusReport() {
    const [data, setData] = useState<WarehouseStockRow[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                // Fetch all required data
                const [warehouses, products, movements] = await Promise.all([
                    warehouseAPI.getActive(),
                    productAPI.getAll(),
                    stockMovementAPI.getAll()
                ]);

                // Helper maps
                const productMap = new Map(products.map(p => [p.id, p]));
                const warehouseMap = new Map(warehouses.map(w => [w.id, w.name]));

                // Initialize stock aggregation: ProductID -> WarehouseID -> Quantity
                const stockAggregation = new Map<string, Map<string, number>>();

                // Initialize with products and 0 stock for all warehouses
                products.forEach(p => {
                    const whStock = new Map<string, number>();
                    warehouses.forEach(w => whStock.set(w.id, 0));
                    stockAggregation.set(p.id, whStock);
                });

                const mainWarehouseName = warehouses.length > 0 ? warehouses[0].name : tm('centralWarehouse');

                const rows: WarehouseStockRow[] = products.map(p => ({
                    productCode: p.code || '',
                    productName: p.name,
                    total: p.stock,
                    wh_main: p.stock // Assigning all to first found warehouse or virtual main
                    // For other warehouses it will be undefined/0
                }));

                // Build columns dynamically
                const columnHelper = createColumnHelper<WarehouseStockRow>();
                const dynamicCols: ColumnDef<WarehouseStockRow, any>[] = [
                    columnHelper.accessor('productCode', { header: tm('materialCode') }),
                    columnHelper.accessor('productName', { header: tm('materialName') }),
                    columnHelper.accessor('total', { header: tm('totalStock'), cell: info => <span className="font-bold">{info.getValue()}</span> }),
                    // Add column for the main warehouse effectively
                    columnHelper.accessor('wh_main', {
                        header: mainWarehouseName,
                        cell: info => info.getValue() || 0
                    }),
                ];

                setData(rows);
                setColumns(dynamicCols);

            } catch (error) {
                console.error('Failed to load warehouse status', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-gray-700" />
                    <h2 className="font-semibold text-gray-800">{tm('warehouseStatus')}</h2>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm">
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
                        data={data}
                        columns={columns}
                        pageSize={50}
                    />
                )}
            </div>
        </div>
    );
}



