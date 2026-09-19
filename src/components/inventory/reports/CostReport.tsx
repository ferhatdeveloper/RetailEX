import React, { useState, useEffect, useMemo } from 'react';
import { getCostProfitAnalysis, type CostProfitRow } from '../../../services/layeredInventoryCost';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { TrendingDown } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';
import { format } from 'date-fns';
import { toSqlDateInputString } from '../../../utils/localCalendarDate';

interface CostRow {
    product_id: string;
    product_code: string;
    product_name: string;
    line_kind: 'service' | 'product';
    line_kind_label: string;
    quantity_sold: number;
    revenue: number;
    cogs: number;
    profit: number;
    margin_percent: number;
    cost_source: CostProfitRow['costSource'];
}

function mapAnalysisRow(
    r: CostProfitRow,
    labels: { service: string; material: string },
): CostRow {
    const lineKind = r.lineKind === 'service' ? 'service' : 'product';
    return {
        product_id: r.productId,
        product_code: r.productCode,
        product_name: r.productName,
        line_kind: lineKind,
        line_kind_label: lineKind === 'service' ? labels.service : labels.material,
        quantity_sold: r.quantity,
        revenue: r.revenue,
        cogs: r.cogs,
        profit: r.profit,
        margin_percent: r.marginPercent,
        cost_source: r.costSource,
    };
}

/**
 * Maliyet ve Karlılık Analizi — tenant-aware.
 * Satış kalemleri sale_items JOIN sales (perakende / POS / güzellik).
 * Malzeme SMM = FIFO alış katmanı; Hizmet SMM = unit_cost → kart alış/cost_price → reçete.
 * getPaginated items:[] kullanılmaz — aksi halde tablo her zaman boş kalır.
 */
export function CostReport() {
    const [rows, setRows] = useState<CostRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const currency = getFirmLedgerCurrency(
        selectedFirm,
        getAppDefaultCurrency() || getGlobalCurrency(),
    );

    const today = useMemo(() => new Date(), []);
    const monthStart = useMemo(() => {
        const d = new Date(today);
        d.setDate(1);
        return d;
    }, [today]);
    const [startDate, setStartDate] = useState(format(monthStart, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

    const kindLabels = useMemo(
        () => ({
            service: tm('service') || 'Hizmet',
            material: tm('material') || 'Malzeme',
        }),
        [tm],
    );

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const start = toSqlDateInputString(startDate) || startDate;
                const end = toSqlDateInputString(endDate) || endDate;
                const list = await getCostProfitAnalysis({
                    startDate: start,
                    endDate: end,
                    firmNr: selectedFirm?.firm_nr,
                    periodNr: selectedPeriod?.nr,
                });
                if (!cancelled) setRows(list.map((r) => mapAnalysisRow(r, kindLabels)));
            } catch (err) {
                console.error('[CostReport] load failed', err);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [startDate, endDate, selectedFirm?.firm_nr, selectedPeriod?.nr, kindLabels]);

    const costSourceNote = useMemo(() => {
        const hasNone = rows.some((r) => r.cost_source === 'none');
        const hasLayer = rows.some((r) => r.cost_source === 'fifo_layers');
        const hasService = rows.some((r) => r.cost_source === 'service_cost');
        const hasMove = rows.some((r) => r.cost_source === 'movement_unit_cost');
        if (hasService && !hasNone) {
            return (
                tm('costProfitCogsMixedNote') ||
                'Malzeme SMM: FIFO katman. Hizmet SMM: kart cost_price / alış / reçete. Kâr = satış − SMM.'
            );
        }
        if (hasLayer && !hasNone && !hasMove && !hasService) {
            return tm('costProfitCogsLayerNote') || 'SMM: FIFO alış katmanları (kart alış kullanılmaz). Kâr = satış − SMM.';
        }
        if (hasNone) {
            return tm('costProfitCogsMissingNote') || 'SMM: katman/hareket/hizmet maliyeti yoksa 0 — gelir yine gösterilir.';
        }
        return (
            tm('costProfitCogsMixedNote') ||
            'Malzeme SMM: FIFO veya hareket birim maliyeti. Hizmet: kart/reçete. Kâr = satış − SMM.'
        );
    }, [rows, tm]);

    const columnHelper = createColumnHelper<CostRow>();
    const columns = useMemo<ColumnDef<CostRow, any>[]>(() => [
        columnHelper.accessor('line_kind_label', {
            id: 'line_kind',
            header: tm('type') || 'Tür',
        }),
        columnHelper.accessor('product_code', { header: tm('materialCode') }),
        columnHelper.accessor('product_name', { header: tm('materialName') }),
        columnHelper.accessor('quantity_sold', {
            header: tm('soldQuantity'),
            cell: info => formatNumber(Number(info.getValue()) || 0, 2),
        }),
        columnHelper.accessor('revenue', {
            header: tm('salesRevenue'),
            cell: info => formatLedgerAmount(Number(info.getValue()) || 0, currency),
        }),
        columnHelper.accessor('cogs', {
            header: tm('cogs') || 'Satılan Mal Maliyeti',
            cell: info => formatLedgerAmount(Number(info.getValue()) || 0, currency),
        }),
        columnHelper.accessor('profit', {
            header: tm('grossProfit') || 'Brüt Kar',
            cell: info => {
                const v = Number(info.getValue()) || 0;
                return (
                    <span className={v >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                        {formatLedgerAmount(v, currency)}
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
                <div>
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-purple-600" />
                        {tm('costAndProfitAnalysis') || 'Maliyet ve Kar Analizi'}
                    </h2>
                    <p className="mt-1 text-[11px] text-gray-500 max-w-3xl">{costSourceNote}</p>
                </div>
                <div className="flex gap-3 items-end flex-wrap">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {tm('startDate') || 'Başlangıç'}
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(toSqlDateInputString(e.target.value) || e.target.value)}
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
                            onChange={e => setEndDate(toSqlDateInputString(e.target.value) || e.target.value)}
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
                ) : rows.length === 0 ? (
                    <div className="h-full flex items-center justify-center px-6 text-center text-sm text-gray-500">
                        {tm('noRecordsFound') || 'Kayıt bulunamadı'}
                    </div>
                ) : (
                    <DevExDataGrid
                        data={rows}
                        columns={columns}
                        {...REPORT_GRID_DEFAULTS}
                        excelFileName={tm('costAndProfitAnalysis') || 'maliyet_kar'}
                        printTitle={tm('costAndProfitAnalysis') || 'Maliyet ve Kar Analizi'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
