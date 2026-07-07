import React, { useState, useEffect, useMemo } from 'react';
import { stockMovementAPI, type StockMovement } from '../../../services/stockMovementAPI';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';

interface SlipRow {
    id: string;
    documentNo: string;
    date: string;
    type: string;
    movement_type: string;
    description: string;
}

/**
 * Fiş Listesi — tenant-aware.
 * Tüm fiş ve fatura başlıklarını liste olarak gösterir.
 */
export function SlipListReport() {
    const { tm } = useLanguage();
    const [rows, setRows] = useState<SlipRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const movements: StockMovement[] = await stockMovementAPI.getAll();
                const mapped: SlipRow[] = movements.map(m => ({
                    id: m.id,
                    documentNo: m.document_no || '',
                    date: m.movement_date || m.created_at,
                    type: m.source_kind === 'invoice'
                        ? (m.movement_type === 'in' ? (tm('purchaseInvoice') || 'Alış Faturası') : (tm('salesInvoice') || 'Satış Faturası'))
                        : (tm('warehouseSlip') || 'Ambar Fişi'),
                    movement_type: m.movement_type || '',
                    description: m.description || '',
                }));
                if (!cancelled) setRows(mapped);
            } catch (err) {
                console.error('[SlipListReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [tm]);

    const columnHelper = createColumnHelper<SlipRow>();
    const columns = useMemo<ColumnDef<SlipRow, any>[]>(() => [
        columnHelper.accessor('date', {
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
        columnHelper.accessor('documentNo', { header: tm('slipInvoiceNo') || 'Fiş/Fatura No' }),
        columnHelper.accessor('type', { header: tm('slipType') || 'Tip' }),
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
        columnHelper.accessor('description', { header: tm('definitionDescription') || 'Açıklama' }),
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('slipList') || 'Fiş Listesi'}</h2>
                </div>
                <button
                    type="button"
                    onClick={() => exportDataGridToExcel(rows, columns, tm('slipList') || 'fis_listesi')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    {tm('export') || 'Aktar'}
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
