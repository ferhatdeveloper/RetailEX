import React, { useState, useEffect, useMemo } from 'react';
import { stockMovementAPI, type StockMovement } from '../../../services/stockMovementAPI';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';

interface TxRow {
    id: string;
    document_no: string;
    movement_date: string;
    document_type: string;
    movement_type: string;
    customer_name: string;
    description: string;
}

/**
 * Hareket Dökümü — tenant-aware.
 * Tüm stok hareketlerini (ambar fişleri + faturalar) sıralı şekilde gösterir.
 */
export function TransactionBreakdownReport() {
    const [rows, setRows] = useState<TxRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<'all' | 'slip' | 'invoice'>('all');
    const { tm } = useLanguage();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const movements: StockMovement[] = await stockMovementAPI.getAll();
                const mapped: TxRow[] = movements
                    .filter(m => typeFilter === 'all' ? true : m.source_kind === typeFilter)
                    .map(m => ({
                        id: m.id,
                        document_no: m.document_no || '',
                        movement_date: m.movement_date || m.created_at,
                        document_type: m.source_kind === 'invoice'
                            ? (m.movement_type === 'in' ? tm('purchaseInvoice') || 'Alış Faturası' : tm('salesInvoice') || 'Satış Faturası')
                            : (tm('warehouseSlip') || 'Ambar Fişi'),
                        movement_type: m.movement_type || '',
                        customer_name: m.customer_name || '',
                        description: m.description || '',
                    }));
                if (!cancelled) setRows(mapped);
            } catch (err) {
                console.error('[TransactionBreakdownReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [typeFilter, tm]);

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
        columnHelper.accessor('document_no', { header: tm('documentNo') || 'Belge No' }),
        columnHelper.accessor('document_type', { header: tm('documentType') || 'Belge Tipi' }),
        columnHelper.accessor('customer_name', {
            header: tm('customerSupplier') || 'Müşteri / Cari',
            cell: info => <span className="text-gray-900 font-medium">{info.getValue() || '—'}</span>,
        }),
        columnHelper.accessor('movement_type', {
            header: tm('direction') || 'Yön',
            cell: info => {
                const v = info.getValue() as string;
                return v === 'in' ? (
                    <span className="text-green-600 font-bold">{tm('in') || 'Giriş'}</span>
                ) : v === 'out' ? (
                    <span className="text-red-600 font-bold">{tm('out') || 'Çıkış'}</span>
                ) : (
                    <span className="text-gray-500">{v}</span>
                );
            },
        }),
        columnHelper.accessor('description', { header: tm('description') || 'Açıklama' }),
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex justify-between items-center w-full flex-wrap gap-3">
                    <h1 className="text-xl font-bold text-gray-800">{tm('transactionBreakdown') || 'Hareket Dökümü'}</h1>
                    <div className="flex gap-2">
                        <div className="inline-flex items-center rounded-lg border border-gray-300 overflow-hidden">
                            {(['all', 'slip', 'invoice'] as const).map(k => (
                                <button
                                    key={k}
                                    onClick={() => setTypeFilter(k)}
                                    className={`px-3 py-1.5 text-xs ${typeFilter === k ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
                                >
                                    {k === 'all' ? (tm('all') || 'Tümü') : k === 'slip' ? (tm('warehouseSlip') || 'Ambar Fişi') : (tm('invoice') || 'Fatura')}
                                </button>
                            ))}
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600">
                            <Filter className="w-4 h-4" />
                            {tm('filter') || 'Filtre'}
                        </button>
                        <button
                            type="button"
                            onClick={() => exportDataGridToExcel(rows, columns, tm('transactionBreakdown') || 'hareket_dokumu')}
                            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600"
                        >
                            <Download className="w-4 h-4" />
                            {tm('export') || 'Aktar'}
                        </button>
                    </div>
                </div>
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
                    <DevExDataGrid data={rows} columns={columns} pageSize={50} enableExcelExport={false} />
                )}
            </div>
        </div>
    );
}
