import React, { useState, useEffect, useMemo } from 'react';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from '../../reports/shared/ReportDataGrid';
import { createColumnHelper, ColumnDef } from '@tanstack/react-table';
import { Banknote } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';

interface ValuationRow {
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: number;
    average_unit_cost: number;
    total_cost: number;
}

/**
 * Malzeme Değer Raporu — tenant-aware (rex_{firmNr}_products).
 * Ort. birim maliyet = Σ alış tutarı / Σ alış miktarı (ağırlıklı ortalama).
 * Toplam değer = eldeki miktar × ort. birim maliyet.
 * Para birimi firmanın ana_para_birimi (IQD vb.).
 */
export function MaterialValueReport() {
    const [products, setProducts] = useState<Product[]>([]);
    const [avgByProduct, setAvgByProduct] = useState<Map<string, number>>(new Map());
    const [avgByCode, setAvgByCode] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const { tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const currency = getFirmLedgerCurrency(
        selectedFirm,
        getAppDefaultCurrency() || getGlobalCurrency(),
    );

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            setLoading(true);
            try {
                const data = await productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr });
                if (cancelled) return;
                setProducts(data);
                const { fetchWeightedAverageUnitCosts } = await import(
                    '../../../services/weightedAverageUnitCost'
                );
                const maps = await fetchWeightedAverageUnitCosts({
                    firmNr: selectedFirm?.firm_nr,
                    periodNr: selectedPeriod?.nr,
                }).catch((err) => {
                    console.error('[MaterialValueReport] weighted avg failed', err);
                    return { byProductId: new Map<string, number>(), byCode: new Map<string, number>() };
                });
                if (!cancelled) {
                    setAvgByProduct(maps.byProductId);
                    setAvgByCode(maps.byCode);
                }
            } catch (err) {
                console.error('[MaterialValueReport] load failed', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, [selectedFirm?.firm_nr, selectedPeriod?.nr]);

    const rows = useMemo<ValuationRow[]>(() => {
        return products
            .filter(p => (Number(p.stock) || 0) !== 0)
            .map(p => {
                const qty = Number(p.stock) || 0;
                const id = String(p.id || '');
                const code = String(p.code || '').trim();
                let average_unit_cost =
                    (id && avgByProduct.get(id)) ||
                    (code && avgByCode.get(code)) ||
                    0;
                if (!(average_unit_cost > 0)) {
                    const pAny = p as Product & { cost?: number; purchase_price?: number };
                    average_unit_cost =
                        Number(pAny.cost || pAny.purchase_price || p.price) || 0;
                }
                const total_cost = qty * average_unit_cost;
                return {
                    product_id: p.id,
                    product_code: p.code || '',
                    product_name: p.name || '',
                    unit: p.unit || '',
                    quantity: qty,
                    average_unit_cost,
                    total_cost,
                };
            });
    }, [products, avgByProduct, avgByCode]);

    const columnHelper = createColumnHelper<ValuationRow>();
    const columns = useMemo<ColumnDef<ValuationRow, any>[]>(() => [
        columnHelper.accessor('product_code', { header: tm('materialCode') }),
        columnHelper.accessor('product_name', { header: tm('materialDescription') }),
        columnHelper.accessor('unit', { header: tm('unit'), size: 80 }),
        columnHelper.accessor('quantity', {
            header: tm('quantity'),
            cell: info => formatNumber(Number(info.getValue()) || 0, 2),
        }),
        columnHelper.accessor('average_unit_cost', {
            header: tm('avgUnitCost') || 'Ortalama Birim Maliyet',
            cell: info => formatLedgerAmount(Number(info.getValue()) || 0, currency),
        }),
        columnHelper.accessor('total_cost', {
            header: tm('totalValue') || 'Toplam Değer',
            cell: info => (
                <span className="font-bold text-blue-600">
                    {formatLedgerAmount(Number(info.getValue()) || 0, currency)}
                </span>
            ),
        }),
    ], [tm, currency]);

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-green-600" />
                    {tm('materialValueReport') || 'Malzeme Değer Raporu'}
                </h2>
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
                        data={rows}
                        columns={columns}
                        {...REPORT_GRID_DEFAULTS}
                        autoFooterSums={false}
                        footerSumColumns={[
                            {
                                columnId: 'total_cost',
                                getValue: (r) => Number(r.total_cost) || 0,
                                format: (sum) => formatLedgerAmount(sum, currency),
                            },
                        ]}
                        excelFileName={tm('materialValueReport') || 'malzeme_deger'}
                        printTitle={tm('materialValueReport') || 'Malzeme Değer Raporu'}
                        height="100%"
                    />
                )}
            </div>
        </div>
    );
}
