import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { stockMovementAPI, type StockMovementLine } from '../../../services/stockMovementAPI';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { useRetailexInvalidateRefresh } from '../../../hooks/useRetailexInvalidateRefresh';

interface TxRow {
    id: string;
    movement_date: string;
    product_code: string;
    product_name: string;
    special_code: string;
    brand: string;
    category: string;
    line_kind: 'service' | 'product';
    line_kind_label: string;
    in_qty: number;
    in_amount: number;
    out_qty: number;
    out_amount: number;
    warehouse_name: string;
    unit_price: number;
    document_no: string;
    customer_name: string;
}

function lineToRow(
    line: StockMovementLine,
    labels: { service: string; material: string },
): TxRow {
    const qty = Number(line.quantity) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const isIn = line.movement_type === 'in';
    const lineKind = line.line_kind === 'service' ? 'service' : 'product';
    const inQty = isIn ? qty : 0;
    const outQty = isIn ? 0 : qty;
    return {
        id: line.id,
        movement_date: line.movement_date || line.created_at,
        product_code: line.product_code || '',
        product_name: line.product_name || '',
        special_code: line.special_code || '',
        brand: line.brand || '',
        category: line.category || '',
        line_kind: lineKind,
        line_kind_label: lineKind === 'service' ? labels.service : labels.material,
        in_qty: inQty,
        in_amount: inQty * unitPrice,
        out_qty: outQty,
        out_amount: outQty * unitPrice,
        warehouse_name: line.warehouse_name || '',
        unit_price: unitPrice,
        document_no: line.document_no || '',
        customer_name: line.customer_name || '',
    };
}

/**
 * Hareket Dökümü — kalem satırı (ürün, miktar/tutar giriş/çıkış, depo, fiyat).
 * Giriş/çıkış tutar = ilgili miktar × birim fiyat. Footer autoFooterSums ile toplanır.
 * Fiş Listesi belge başlığıdır; bu ekran aynı belgelerin stok dökümüdür.
 */
export function TransactionBreakdownReport() {
    const [rows, setRows] = useState<TxRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();

    const kindLabels = useMemo(
        () => ({
            service: tm('service') || 'Hizmet',
            material: tm('material') || 'Malzeme',
        }),
        [tm],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const lines = await stockMovementAPI.getAllLines();
            setRows(lines.map((line) => lineToRow(line, kindLabels)));
        } catch (err) {
            console.error('[TransactionBreakdownReport] load failed', err);
        } finally {
            setLoading(false);
        }
    }, [kindLabels]);

    useEffect(() => {
        void load();
    }, [load]);

    useRetailexInvalidateRefresh(['invoices', 'sales', 'products'], load);

    const columnHelper = createColumnHelper<TxRow>();
    const columns = useMemo<ColumnDef<TxRow, any>[]>(() => [
        columnHelper.accessor('movement_date', {
            header: tm('date'),
            cell: info => {
                const v = info.getValue() as string;
                try {
                    return format(new Date(v), 'dd.MM.yyyy');
                } catch {
                    return v || '';
                }
            },
        }),
        columnHelper.accessor('line_kind_label', {
            id: 'line_kind',
            header: tm('type') || 'Tür',
        }),
        columnHelper.accessor('product_code', { header: tm('materialCode') || 'Malzeme Kodu' }),
        columnHelper.accessor('product_name', { header: tm('materialName') || 'Malzeme Adı' }),
        columnHelper.accessor('special_code', { header: tm('specialCode') || 'Özel Kod' }),
        columnHelper.accessor('brand', { header: tm('brand') || 'Marka' }),
        columnHelper.accessor('category', { header: tm('category') || 'Kategori' }),
        columnHelper.accessor('in_qty', {
            header: tm('inQuantity') || 'Giriş Miktar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                if (!v) return '';
                return <span className="text-green-600 font-medium">{formatNumber(v, 2)}</span>;
            },
        }),
        columnHelper.accessor('in_amount', {
            header: tm('extractInAmount') || 'Giriş tutar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                if (!v) return '';
                return <span className="text-green-700 font-medium">{formatNumber(v, 2)}</span>;
            },
        }),
        columnHelper.accessor('out_qty', {
            header: tm('outQuantity') || 'Çıkış Miktar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                if (!v) return '';
                return <span className="text-red-600 font-medium">{formatNumber(v, 2)}</span>;
            },
        }),
        columnHelper.accessor('out_amount', {
            header: tm('extractOutAmount') || 'Çıkış tutar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                if (!v) return '';
                return <span className="text-red-700 font-medium">{formatNumber(v, 2)}</span>;
            },
        }),
        columnHelper.accessor('warehouse_name', {
            header: tm('warehouse') || 'Depo',
            cell: info => info.getValue() || '—',
        }),
        columnHelper.accessor('unit_price', {
            header: tm('unitPrice') || 'Birim Fiyat',
            cell: info => formatNumber(Number(info.getValue()) || 0, 2),
        }),
        columnHelper.accessor('document_no', { header: tm('documentNo') || 'Belge No' }),
        columnHelper.accessor('customer_name', {
            header: tm('customerSupplier') || 'Müşteri/Tedarikçi',
            cell: info => <span className="text-gray-900 font-medium">{info.getValue() || '—'}</span>,
        }),
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h1 className="text-xl font-bold text-gray-800">{tm('transactionBreakdown') || 'Hareket Dökümü'}</h1>
            </div>

            <div className="flex-1 overflow-hidden p-4">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-gray-500">{tm('loadingTransactions') || 'Hareketler yükleniyor...'}</p>
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={rows}
                        columns={columns}
                        {...REPORT_GRID_DEFAULTS}
                        storageNamespace="report-transaction-breakdown"
                        excelFileName={tm('transactionBreakdown') || 'hareket_dokumu'}
                        printTitle={tm('transactionBreakdown') || 'Hareket Dökümü'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
