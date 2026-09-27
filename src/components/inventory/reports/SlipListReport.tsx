import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    stockMovementAPI,
    labelStockSlipDocumentType,
    type StockMovement,
} from '../../../services/stockMovementAPI';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';
import { receiptNotesForDisplay } from '../../../utils/receiptNotes';
import { useRetailexInvalidateRefresh } from '../../../hooks/useRetailexInvalidateRefresh';

interface SlipRow {
    id: string;
    documentNo: string;
    date: string;
    type: string;
    customer_name: string;
    movement_type: string;
    description: string;
}

/**
 * Fiş Listesi — belge/fiş başlığı (tarih, no, tür, cari, yön, açıklama).
 * Kalem dökümü Hareket Dökümü ekranındadır.
 */
export function SlipListReport() {
    const { tm } = useLanguage();
    const [rows, setRows] = useState<SlipRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const movements: StockMovement[] = await stockMovementAPI.getAll();
            const mapped: SlipRow[] = movements.map(m => ({
                id: m.id,
                documentNo: m.document_no || '',
                date: m.movement_date || m.created_at,
                type:
                    m.source_kind === 'invoice'
                        ? labelStockSlipDocumentType(tm, m.trcode, m.movement_type, 'invoice')
                        : tm('warehouseSlip') || 'Ambar Fişi',
                customer_name: m.customer_name || '',
                movement_type: m.movement_type || '',
                description: receiptNotesForDisplay(m.description),
            }));
            setRows(mapped);
        } catch (err) {
            console.error('[SlipListReport] load failed', err);
        } finally {
            setLoading(false);
        }
    }, [tm]);

    useEffect(() => {
        void load();
    }, [load]);

    // Soft-delete sonrası açık sekme (Fiş Listesi) yenilensin
    useRetailexInvalidateRefresh(['invoices', 'sales', 'products'], load);

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
        columnHelper.accessor('type', { header: tm('slipType') || 'Fiş Türü' }),
        columnHelper.accessor('customer_name', {
            header: tm('customerSupplier') || 'Müşteri/Tedarikçi',
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
        columnHelper.accessor('description', { header: tm('definitionDescription') || 'Açıklama' }),
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">{tm('slipList') || 'Fiş Listesi'}</h2>
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
                    <DevExDataGrid data={rows} columns={columns} {...REPORT_GRID_DEFAULTS} height="100%" />
                )}
            </div>
        </div>
    );
}
