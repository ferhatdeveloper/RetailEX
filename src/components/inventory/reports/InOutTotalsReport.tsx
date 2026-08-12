import React, { useState, useEffect, useMemo } from 'react';
import { invoicesAPI } from '../../../services/api/invoices';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, ArrowRightLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { format } from 'date-fns';
import { formatNumber } from '../../../utils/formatNumber';

interface InOutRow {
    productId: string;
    productCode: string;
    productName: string;
    totalIn: number;
    totalOut: number;
    netChange: number;
}

/**
 * Giriş/Çıkış Toplamları — tenant-aware.
 * Hem satış/alış faturalarındaki kalemleri hem de ambar fişi kalemlerini
 * (stock_movement_items) tarayıp ürün başına toplam in/out hesabı yapar.
 */
export function InOutTotalsReport() {
    const [rows, setRows] = useState<InOutRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const today = useMemo(() => new Date(), []);
    const monthStart = useMemo(() => {
        const d = new Date(today);
        d.setDate(1);
        return d;
    }, [today]);
    const [startDate, setStartDate] = useState(format(monthStart, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const [products, invRes, slipMovements] = await Promise.all([
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                    // Hem satış hem alış faturaları
                    Promise.all([
                        invoicesAPI.getPaginated({ pageSize: 5000, startDate, endDate, invoiceCategory: 'Satis', firmNr: selectedFirm?.firm_nr, periodNr: selectedPeriod?.nr }),
                        invoicesAPI.getPaginated({ pageSize: 5000, startDate, endDate, invoiceCategory: 'Alis', firmNr: selectedFirm?.firm_nr, periodNr: selectedPeriod?.nr }),
                    ]),
                    stockMovementAPI.getAll(),
                ]);

                const productByCode = new Map<string, Product>();
                const productById = new Map<string, Product>();
                products.forEach(p => {
                    if (p.code) productByCode.set(p.code, p);
                    if (p.id) productById.set(p.id, p);
                });

                const agg = new Map<string, InOutRow>();
                const addQty = (key: string, code: string, name: string, qty: number, isIn: boolean) => {
                    const r = agg.get(key) || {
                        productId: key,
                        productCode: code,
                        productName: name,
                        totalIn: 0,
                        totalOut: 0,
                        netChange: 0,
                    };
                    if (isIn) r.totalIn += qty;
                    else r.totalOut += qty;
                    r.netChange = r.totalIn - r.totalOut;
                    agg.set(key, r);
                };

                const allInvoices = invRes.flatMap(r => r.data);
                for (const inv of allInvoices) {
                    const cat = String(
                        (inv as any).invoiceCategory ||
                        (inv as any).invoice_category ||
                        (inv as any).fiche_type ||
                        ''
                    ).toLowerCase();
                    const isIn = cat.includes('purchase') || cat.includes('alis');
                    const items: any[] = (inv as any).items || (inv as any).sale_items || [];
                    for (const it of items) {
                        const code = it.item_code || it.product_code || '';
                        const pid = it.product_id || '';
                        const p = (pid && productById.get(pid)) || (code && productByCode.get(code)) || null;
                        if (!p) continue;
                        const qty = Number(it.quantity || 0);
                        addQty(p.id || code, p.code || code, p.name || '', qty, isIn);
                    }
                }

                // Ambar fişlerinin items'ı için her birini ayrı sorgulamak pahalı.
                // Bu yüzden sadece tarih aralığındakileri filtreliyoruz; items'i opsiyonel olarak gelirse alıyoruz.
                const start = new Date(startDate).getTime();
                const end = new Date(endDate).getTime() + 86_400_000;
                for (const m of slipMovements) {
                    if (m.source_kind !== 'slip') continue;
                    const md = new Date(m.movement_date || m.created_at).getTime();
                    if (md < start || md > end) continue;
                    const items: any[] = (m as any).stock_movement_items || [];
                    const isIn = m.movement_type === 'in';
                    for (const it of items) {
                        const code = it.product_code || '';
                        const pid = it.product_id || '';
                        const p = (pid && productById.get(pid)) || (code && productByCode.get(code)) || null;
                        if (!p) continue;
                        const qty = Number(it.quantity || 0);
                        addQty(p.id || code, p.code || code, p.name || '', qty, isIn);
                    }
                }

                const list = Array.from(agg.values()).sort(
                    (a, b) => Math.abs(b.netChange) - Math.abs(a.netChange)
                );
                if (!cancelled) setRows(list);
            } catch (err) {
                console.error('[InOutTotalsReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [startDate, endDate, selectedFirm?.firm_nr, selectedPeriod?.nr]);

    const columnHelper = createColumnHelper<InOutRow>();
    const columns = useMemo<ColumnDef<InOutRow, any>[]>(() => [
        columnHelper.accessor('productCode', { header: tm('materialCode') }),
        columnHelper.accessor('productName', { header: tm('materialName') }),
        columnHelper.accessor('totalIn', {
            header: tm('totalIn') || 'Toplam Giriş',
            cell: info => <span className="text-green-600 font-medium">{formatNumber(Number(info.getValue()) || 0, 2)}</span>,
        }),
        columnHelper.accessor('totalOut', {
            header: tm('totalOut') || 'Toplam Çıkış',
            cell: info => <span className="text-red-600 font-medium">{formatNumber(Number(info.getValue()) || 0, 2)}</span>,
        }),
        columnHelper.accessor('netChange', {
            header: tm('netChange') || 'Net Değişim',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                return (
                    <span className={`font-bold ${v >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {v > 0 ? '+' : ''}
                        {formatNumber(v, 2)}
                    </span>
                );
            },
        }),
    ], [tm]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                        <h2 className="font-semibold text-gray-800">
                            {tm('inOutTotals') || 'Giriş Çıkış Toplamları'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => exportDataGridToExcel(rows, columns, tm('inOutTotals') || 'giris_cikis')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        {tm('excel')}
                    </button>
                </div>
                <div className="flex gap-3 items-end flex-wrap">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {tm('startDate') || 'Başlangıç'}
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="px-3 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {tm('endDate') || 'Bitiş'}
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="px-3 py-1.5 border rounded text-sm"
                        />
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
                    <DevExDataGrid data={rows} columns={columns} pageSize={50} enableExcelExport={false} />
                )}
            </div>
        </div>
    );
}
