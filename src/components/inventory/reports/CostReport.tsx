import React, { useState, useEffect, useMemo } from 'react';
import { invoicesAPI } from '../../../services/api/invoices';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { exportDataGridToExcel } from '../../../utils/gridExcelExport';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Download, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import { format } from 'date-fns';

interface CostRow {
    product_id: string;
    product_code: string;
    product_name: string;
    quantity_sold: number;
    revenue: number;
    cogs: number;
    profit: number;
    margin_percent: number;
}

/**
 * Maliyet ve Kar Analizi (COGS) — tenant-aware.
 * Satış faturalarındaki kalemleri ürün bazında toplayıp, ürün ortalama maliyetiyle
 * (products.cost) COGS hesaplar. FIFO katmanları henüz olmadığı için yaklaşıktır.
 */
export function CostReport() {
    const [rows, setRows] = useState<CostRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const currency = selectedFirm?.ana_para_birimi || 'IQD';

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
                const [invRes, products] = await Promise.all([
                    invoicesAPI.getPaginated({
                        pageSize: 5000,
                        startDate,
                        endDate,
                        invoiceCategory: 'Satis',
                        firmNr: selectedFirm?.firm_nr,
                        periodNr: selectedPeriod?.nr,
                    }),
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }),
                ]);
                const productByCode = new Map<string, Product>();
                const productById = new Map<string, Product>();
                products.forEach(p => {
                    if (p.code) productByCode.set(p.code, p);
                    if (p.id) productById.set(p.id, p);
                });

                const agg = new Map<string, CostRow>();
                for (const inv of invRes.data) {
                    const items: any[] = (inv as any).items || (inv as any).sale_items || [];
                    for (const it of items) {
                        const code = it.item_code || it.product_code || '';
                        const pid = it.product_id || '';
                        const p = (pid && productById.get(pid)) || (code && productByCode.get(code)) || null;
                        if (!p) continue;
                        const qty = Number(it.quantity || 0);
                        const unitPrice = Number(it.unit_price || it.unitPrice || 0);
                        const revenue = qty * unitPrice;
                        const unitCost = Number(p.cost || 0);
                        const cogs = qty * unitCost;
                        const key = p.id || p.code || code;
                        const prev = agg.get(key);
                        if (prev) {
                            prev.quantity_sold += qty;
                            prev.revenue += revenue;
                            prev.cogs += cogs;
                        } else {
                            agg.set(key, {
                                product_id: p.id || '',
                                product_code: p.code || code,
                                product_name: p.name || '',
                                quantity_sold: qty,
                                revenue,
                                cogs,
                                profit: 0,
                                margin_percent: 0,
                            });
                        }
                    }
                }
                const list = Array.from(agg.values()).map(r => {
                    const profit = r.revenue - r.cogs;
                    const margin_percent = r.revenue > 0 ? (profit / r.revenue) * 100 : 0;
                    return { ...r, profit, margin_percent };
                });
                list.sort((a, b) => b.profit - a.profit);
                if (!cancelled) setRows(list);
            } catch (err) {
                console.error('[CostReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [startDate, endDate, selectedFirm?.firm_nr, selectedPeriod?.nr]);

    const totals = useMemo(() => {
        const tot = rows.reduce(
            (acc, r) => {
                acc.revenue += r.revenue;
                acc.cogs += r.cogs;
                return acc;
            },
            { revenue: 0, cogs: 0 }
        );
        return { ...tot, profit: tot.revenue - tot.cogs };
    }, [rows]);

    const columnHelper = createColumnHelper<CostRow>();
    const columns = useMemo<ColumnDef<CostRow, any>[]>(() => [
        columnHelper.accessor('product_code', { header: tm('materialCode') }),
        columnHelper.accessor('product_name', { header: tm('materialName') }),
        columnHelper.accessor('quantity_sold', {
            header: tm('soldQuantity'),
            cell: info => formatNumber(Number(info.getValue()) || 0, 2),
        }),
        columnHelper.accessor('revenue', {
            header: tm('salesRevenue'),
            cell: info => `${formatNumber(Number(info.getValue()) || 0, 2)} ${currency}`,
        }),
        columnHelper.accessor('cogs', {
            header: tm('cogs') || 'Satılan Mal Maliyeti',
            cell: info => `${formatNumber(Number(info.getValue()) || 0, 2)} ${currency}`,
        }),
        columnHelper.accessor('profit', {
            header: tm('grossProfit') || 'Brüt Kar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                return (
                    <span className={v >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {formatNumber(v, 2)} {currency}
                    </span>
                );
            },
        }),
        columnHelper.accessor('margin_percent', {
            header: tm('profitMargin') || 'Kar Marjı',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                return (
                    <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full ${v >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(Math.abs(v), 100)}%` }}
                            ></div>
                        </div>
                        <span>{formatNumber(v, 1)}%</span>
                    </div>
                );
            },
        }),
    ], [tm, currency]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex justify-between items-start flex-wrap gap-3">
                    <div>
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-purple-600" />
                            {tm('costAndProfitAnalysis') || 'Maliyet ve Kar Analizi'}
                        </h2>
                        <div className="flex gap-4 mt-2 text-sm flex-wrap">
                            <div>
                                {tm('totalRevenue') || 'Toplam Gelir'}:{' '}
                                <span className="font-bold text-gray-900">
                                    {formatNumber(totals.revenue, 2)} {currency}
                                </span>
                            </div>
                            <div>
                                {tm('totalCost') || 'Toplam Maliyet'}:{' '}
                                <span className="font-bold text-red-600">
                                    {formatNumber(totals.cogs, 2)} {currency}
                                </span>
                            </div>
                            <div>
                                {tm('grossProfit') || 'Brüt Kar'}:{' '}
                                <span className={`font-bold ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatNumber(totals.profit, 2)} {currency}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => exportDataGridToExcel(rows, columns, tm('costAndProfitAnalysis') || 'maliyet_kar')}
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
