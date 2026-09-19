import React, { useState, useEffect, useMemo } from 'react';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { productAPI } from '../../../services/api/products';
import { collapseInOutTotalsRows, type InOutTotalsRow } from '../../../utils/stockInOutTotals';
import { toSqlDateInputString, localTodayDateKey } from '../../../utils/localCalendarDate';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { ArrowRightLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';

const INCLUDE_SERVICES_KEY = 'retailex_inOutTotals_includeServices_v1';
const columnHelper = createColumnHelper<InOutTotalsRow>();

function monthStartKey(): string {
    const today = localTodayDateKey();
    const [y, m] = today.split('-');
    return `${y}-${m}-01`;
}

function loadIncludeServicesPref(): boolean {
    try {
        return localStorage.getItem(INCLUDE_SERVICES_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Giriş/Çıkış Toplamları — tenant-aware.
 * Varsayılan: yalnızca ürün/malzeme. Hizmetler (güzellik vb.) isteğe bağlı.
 */
export function InOutTotalsReport() {
    const [rows, setRows] = useState<InOutTotalsRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const currency = getFirmLedgerCurrency(
        selectedFirm,
        getAppDefaultCurrency() || getGlobalCurrency(),
    );
    const [startDate, setStartDate] = useState(monthStartKey);
    const [endDate, setEndDate] = useState(localTodayDateKey);
    const [includeServices, setIncludeServices] = useState(loadIncludeServicesPref);

    useEffect(() => {
        try {
            localStorage.setItem(INCLUDE_SERVICES_KEY, includeServices ? '1' : '0');
        } catch {
            /* ignore */
        }
    }, [includeServices]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const start = toSqlDateInputString(startDate);
                const end = toSqlDateInputString(endDate);
                const [totals, products] = await Promise.all([
                    stockMovementAPI.getInOutTotalsByDateRange({
                        startDate: start,
                        endDate: end,
                        firmNr: selectedFirm?.firm_nr,
                        periodNr: selectedPeriod?.nr,
                        includeServices,
                    }),
                    productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr }).catch(() => []),
                ]);
                const byId = new Map(products.map((p) => [String(p.id), p]));
                const byCode = new Map(
                    products.filter((p) => p.code).map((p) => [String(p.code), p]),
                );
                const serviceProductIds = new Set(
                    products
                        .filter((p) => p.isService === true || p.materialType === 'service')
                        .map((p) => String(p.id).toLowerCase()),
                );
                const filled = collapseInOutTotalsRows(
                    totals
                        .map((r) => {
                            const p = byId.get(r.productId) || byCode.get(r.productCode);
                            if (!p) return r;
                            const isService =
                                r.isService === true ||
                                p.isService === true ||
                                p.materialType === 'service';
                            return {
                                ...r,
                                productId: r.productId || p.id || r.productCode,
                                productCode: r.productCode || p.code || '',
                                productName: r.productName || p.name || '',
                                isService,
                            };
                        })
                        .filter((r) => {
                            if (includeServices) return true;
                            if (r.isService) return false;
                            if (serviceProductIds.has(String(r.productId || '').toLowerCase())) {
                                return false;
                            }
                            return true;
                        }),
                );
                if (!cancelled) setRows(filled);
            } catch (err) {
                console.error('[InOutTotalsReport] load failed', err);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [startDate, endDate, selectedFirm?.firm_nr, selectedPeriod?.nr, includeServices]);

    const columns = useMemo<ColumnDef<InOutTotalsRow, any>[]>(() => {
        const cols: ColumnDef<InOutTotalsRow, any>[] = [
            columnHelper.accessor('productCode', { header: tm('materialCode') }),
            columnHelper.accessor('productName', { header: tm('materialName') }),
        ];
        if (includeServices) {
            cols.push(
                columnHelper.accessor((r) => (r.isService ? 'service' : 'product'), {
                    id: 'lineKind',
                    header: tm('lineKind') || 'Tür',
                    cell: (info) => {
                        const v = info.getValue();
                        return v === 'service'
                            ? tm('service') || 'Hizmet'
                            : tm('product') || 'Ürün';
                    },
                }),
            );
        }
        cols.push(
            columnHelper.accessor('inQty', {
                header: tm('extractInQty') || 'Giriş miktar',
                cell: (info) => (
                    <span className="text-green-600 font-medium">
                        {formatNumber(Number(info.getValue()) || 0, 2)}
                    </span>
                ),
            }),
            columnHelper.accessor('inAmount', {
                header: tm('extractInAmount') || 'Giriş tutar',
                cell: (info) => (
                    <span className="text-green-700 font-medium">
                        {formatLedgerAmount(Number(info.getValue()) || 0, currency)}
                    </span>
                ),
            }),
            columnHelper.accessor('outQty', {
                header: tm('extractOutQty') || 'Çıkış miktar',
                cell: (info) => (
                    <span className="text-red-600 font-medium">
                        {formatNumber(Number(info.getValue()) || 0, 2)}
                    </span>
                ),
            }),
            columnHelper.accessor('outAmount', {
                header: tm('extractOutAmount') || 'Çıkış tutar',
                cell: (info) => (
                    <span className="text-red-700 font-medium">
                        {formatLedgerAmount(Number(info.getValue()) || 0, currency)}
                    </span>
                ),
            }),
        );
        return cols;
    }, [tm, currency, includeServices]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-gray-800">
                        {tm('inOutTotals') || 'Giriş Çıkış Toplamları'}
                    </h2>
                </div>
                <div className="flex gap-3 items-end flex-wrap">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {tm('startDate') || 'Başlangıç'}
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) =>
                                setStartDate(toSqlDateInputString(e.target.value) || e.target.value)
                            }
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
                            onChange={(e) =>
                                setEndDate(toSqlDateInputString(e.target.value) || e.target.value)
                            }
                            className="px-3 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <label className="flex items-center gap-2 pb-1.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={includeServices}
                            onChange={(e) => setIncludeServices(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                            {tm('includeServicesInOut') || 'Hizmetleri de göster'}
                        </span>
                    </label>
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
                        storageNamespace="report-in-out-totals"
                        excelFileName={tm('inOutTotals') || 'giris_cikis'}
                        printTitle={tm('inOutTotals') || 'Giriş Çıkış Toplamları'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
