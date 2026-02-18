import React, { useState, useEffect, useMemo } from 'react';
import { CostAccountingService, StockMovement, formatMoney } from '../../../services/costAccountingService';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

import { useLanguage } from '../../../contexts/LanguageContext';

interface SlipRow {
    documentNo: string;
    date: string;
    type: string;
    itemCount: number;
    totalAmount: number;
    description: string;
}

export function SlipListReport() {
    const { tm } = useLanguage();
    const [data, setData] = useState<SlipRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Mock IDs
    const firmaId = '1';
    const donemId = '1';

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const movements = await CostAccountingService.getStockMovements({
                    firma_id: firmaId,
                    donem_id: donemId
                });

                // Group by document number
                const groups = new Map<string, SlipRow>();

                movements.forEach(m => {
                    if (!groups.has(m.document_no)) {
                        const typeVal = m.document_type === 'PURCHASE_INVOICE' ? tm('purchaseInvoice') :
                            m.document_type === 'SALES_INVOICE' ? tm('salesInvoice') : m.document_type;

                        groups.set(m.document_no, {
                            documentNo: m.document_no,
                            date: m.movement_date,
                            type: typeVal,
                            itemCount: 0,
                            totalAmount: 0,
                            description: '-' // TODO: Fetch description if available
                        });
                    }
                    const group = groups.get(m.document_no)!;
                    group.itemCount += 1;
                    group.totalAmount += m.total_cost;
                });

                const rows = Array.from(groups.values()).sort((a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );

                setData(rows);
            } catch (error) {
                console.error('Failed to load slips', error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const columnHelper = createColumnHelper<SlipRow>();
    const columns = useMemo<ColumnDef<SlipRow, any>[]>(() => [
        columnHelper.accessor('date', {
            header: tm('date'),
            cell: info => format(new Date(info.getValue()), 'dd.MM.yyyy', { locale: tr }),
        }),
        columnHelper.accessor('documentNo', {
            header: tm('slipInvoiceNo'),
        }),
        columnHelper.accessor('type', {
            header: tm('slipType'),
        }),
        columnHelper.accessor('itemCount', {
            header: tm('itemCount'),
        }),
        columnHelper.accessor('totalAmount', {
            header: tm('totalAmount'),
            cell: info => formatMoney(info.getValue()),
        }),
        columnHelper.accessor('description', {
            header: tm('definitionDescription'),
        }),
    ] as any, [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-800">{tm('slipList')}</h2>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    {tm('export')}
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

