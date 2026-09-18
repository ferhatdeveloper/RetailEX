import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Download, Printer } from 'lucide-react';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { exportReportToXlsx } from '../../../utils/reportExport';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import {
    buildReportGridColumns,
    REPORT_GRID_DEFAULTS,
} from '../../reports/shared/ReportDataGrid';

interface ExtractRow {
    id: string;
    date: string;
    trcode: number;
    movement_type: string;
    document_no: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    running_balance: number;
    warehouse_name?: string;
}

function isInbound(movType: string): boolean {
    return movType === 'in';
}

function isOutbound(movType: string): boolean {
    return movType === 'out';
}

/**
 * Malzeme Ekstresi — tenant-aware.
 * Seçili ürünün dönem içindeki tüm hareketlerini (ambar fişleri + faturalar)
 * tarih sırasıyla listeler ve kümülatif miktar bakiyesi hesaplar.
 * Para kolonları giriş/çıkış olarak ayrıdır; tek tutarda netlenmez.
 */
export function MaterialExtractReport() {
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const currency = selectedFirm?.ana_para_birimi || 'IQD';

    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [rows, setRows] = useState<ExtractRow[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const today = useMemo(() => new Date(), []);
    const monthStart = useMemo(() => {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 1);
        return d;
    }, [today]);
    const [startDate, setStartDate] = useState(format(monthStart, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

    // Ürün listesi tek seferde yüklensin
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const list = await productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr });
                if (!cancelled) setProducts(list);
            } catch (err) {
                console.error('[MaterialExtractReport] products load failed', err);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [selectedFirm?.firm_nr]);

    // Dış tıklamada dropdown kapansın
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filteredProducts = useMemo(() => {
        const q = searchText.trim().toLocaleLowerCase('tr');
        if (!q) return products.slice(0, 50);
        return products
            .filter(p =>
                (p.code || '').toLocaleLowerCase('tr').includes(q) ||
                (p.name || '').toLocaleLowerCase('tr').includes(q)
            )
            .slice(0, 50);
    }, [products, searchText]);

    const loadReport = async () => {
        if (!selectedProduct?.id) {
            return;
        }
        setLoading(true);
        try {
            const movements = await stockMovementAPI.getProductMovements(selectedProduct.id, {
                code: selectedProduct.code,
                barcode: selectedProduct.barcode,
            });
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime() + 86_400_000;
            const filtered = movements.filter((m: any) => {
                const date = new Date(m.movement?.movement_date || m.movement_date || m.created_at).getTime();
                return date >= start && date <= end;
            });
            // Tarihe göre artan sırala ve kümülatif bakiyeyi hesapla
            filtered.sort((a: any, b: any) => {
                const da = new Date(a.movement?.movement_date || a.movement_date || a.created_at).getTime();
                const db = new Date(b.movement?.movement_date || b.movement_date || b.created_at).getTime();
                return da - db;
            });
            let balance = 0;
            const mapped: ExtractRow[] = filtered.map((m: any, idx: number) => {
                const qty = Number(m.quantity) || 0;
                const unitPrice = Number(m.unit_price) || 0;
                const movType = m.movement?.movement_type || m.movement_type || '';
                if (movType === 'in') balance += qty;
                else if (movType === 'out') balance -= qty;
                return {
                    id: `${m.id || idx}`,
                    date: m.movement?.movement_date || m.movement_date || m.created_at,
                    trcode: Number(m.movement?.trcode || m.trcode || 0),
                    movement_type: movType,
                    document_no: m.movement?.document_no || m.document_no || '',
                    description: m.notes || m.description || '',
                    quantity: qty,
                    unit_price: unitPrice,
                    amount: qty * unitPrice,
                    running_balance: balance,
                    warehouse_name: m.movement?.warehouses?.name || m.warehouse_name || '',
                };
            });
            setRows(mapped);
        } catch (err) {
            console.error('[MaterialExtractReport] loadReport failed', err);
        } finally {
            setLoading(false);
        }
    };

    // Ürün veya tarih değişince otomatik yükle
    useEffect(() => {
        if (selectedProduct) loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProduct?.id, startDate, endDate]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => {
                if (isInbound(r.movement_type)) {
                    acc.totalInQty += r.quantity;
                    acc.totalInAmount += r.amount;
                } else if (isOutbound(r.movement_type)) {
                    acc.totalOutQty += r.quantity;
                    acc.totalOutAmount += r.amount;
                }
                return acc;
            },
            { totalInQty: 0, totalInAmount: 0, totalOutQty: 0, totalOutAmount: 0 }
        );
    }, [rows]);

    const labelTrcode = (trcode: number, movType: string): string => {
        if (trcode === 1) return tm('consumption') || 'Sarf';
        if (trcode === 2) return tm('productionEntry') || 'Üretim Girişi';
        if (trcode === 5) return tm('warehouseReceipt') || 'Ambar Fişi';
        if (trcode === 8) return movType === 'out' ? (tm('salesInvoice') || 'Satış Fat.') : (tm('purchaseInvoice') || 'Alış Fat.');
        return movType === 'in' ? (tm('in') || 'Giriş') : (tm('out') || 'Çıkış');
    };

    const gridRows = useMemo(() => {
        return rows.map((row) => {
            const inbound = isInbound(row.movement_type);
            const outbound = isOutbound(row.movement_type);
            return {
                ...row,
                dateLabel: row.date ? format(new Date(row.date), 'dd.MM.yyyy') : '',
                typeLabel: labelTrcode(row.trcode, row.movement_type),
                descLabel: row.description || row.warehouse_name || '',
                inQty: inbound ? row.quantity : null,
                inAmt: inbound ? row.amount : null,
                outQty: outbound ? row.quantity : null,
                outAmt: outbound ? row.amount : null,
            };
        });
    }, [rows, tm]);

    const gridColumns = useMemo(
        () =>
            buildReportGridColumns<(typeof gridRows)[number]>([
                { id: 'dateLabel', header: tm('date'), filterKind: 'date', size: 110 },
                { id: 'typeLabel', header: tm('ficheType') || 'Fiş Tipi', size: 130 },
                { id: 'document_no', header: tm('ficheNo') || 'Fiş No', size: 120 },
                { id: 'descLabel', header: tm('description') || 'Açıklama', size: 180 },
                {
                    id: 'inQty',
                    header: tm('extractInQty'),
                    align: 'right',
                    size: 110,
                    cell: (r) =>
                        r.inQty == null ? '' : (
                            <span className="font-bold text-green-700">{formatNumber(r.inQty, 2)}</span>
                        ),
                },
                {
                    id: 'inAmt',
                    header: tm('extractInAmount'),
                    align: 'right',
                    size: 120,
                    cell: (r) =>
                        r.inAmt == null ? '' : (
                            <span className="text-green-700">{formatNumber(r.inAmt, 2)}</span>
                        ),
                },
                {
                    id: 'outQty',
                    header: tm('extractOutQty'),
                    align: 'right',
                    size: 110,
                    cell: (r) =>
                        r.outQty == null ? '' : (
                            <span className="font-bold text-red-700">{formatNumber(r.outQty, 2)}</span>
                        ),
                },
                {
                    id: 'outAmt',
                    header: tm('extractOutAmount'),
                    align: 'right',
                    size: 120,
                    cell: (r) =>
                        r.outAmt == null ? '' : (
                            <span className="text-red-700">{formatNumber(r.outAmt, 2)}</span>
                        ),
                },
                {
                    id: 'unit_price',
                    header: tm('unitPrice') || 'Birim Fiyat',
                    align: 'right',
                    size: 120,
                    cell: (r) => formatNumber(r.unit_price, 2),
                },
                {
                    id: 'running_balance',
                    header: tm('runningQuantity') || 'Kümülatif Bakiye',
                    align: 'right',
                    size: 140,
                    cell: (r) => (
                        <span className="font-bold">{formatNumber(r.running_balance, 2)}</span>
                    ),
                },
            ]),
        [tm],
    );

    const exportExcel = () => {
        if (!selectedProduct || rows.length === 0) return;
        const hDate = tm('date');
        const hFicheType = tm('ficheType') || 'Fiş Tipi';
        const hFicheNo = tm('ficheNo') || 'Fiş No';
        const hDesc = tm('description') || 'Açıklama';
        const hInQty = tm('extractInQty');
        const hInAmt = tm('extractInAmount');
        const hOutQty = tm('extractOutQty');
        const hOutAmt = tm('extractOutAmount');
        const hUnit = tm('unitPrice') || 'Birim Fiyat';
        const hBal = tm('runningQuantity') || 'Kümülatif Bakiye';
        const headers = [hDate, hFicheType, hFicheNo, hDesc, hInQty, hInAmt, hOutQty, hOutAmt, hUnit, hBal];
        const exportRows = rows.map((row) => {
            const inbound = isInbound(row.movement_type);
            const outbound = isOutbound(row.movement_type);
            return {
                [hDate]: row.date ? format(new Date(row.date), 'dd.MM.yyyy') : '',
                [hFicheType]: labelTrcode(row.trcode, row.movement_type),
                [hFicheNo]: row.document_no,
                [hDesc]: row.description || row.warehouse_name || '',
                [hInQty]: inbound ? row.quantity : '',
                [hInAmt]: inbound ? row.amount : '',
                [hOutQty]: outbound ? row.quantity : '',
                [hOutAmt]: outbound ? row.amount : '',
                [hUnit]: row.unit_price,
                [hBal]: row.running_balance,
            };
        });
        const lastBalance = rows[rows.length - 1]?.running_balance ?? 0;
        exportReportToXlsx({
            fileName: `Malzeme_Ekstresi_${selectedProduct.code || 'urun'}_${startDate}_${endDate}`,
            sheetName: tm('materialExtractReport') || 'Malzeme Ekstresi',
            headers,
            rows: exportRows,
            totals: {
                [hDate]: '',
                [hFicheType]: '',
                [hFicheNo]: '',
                [hDesc]: tm('totalUppercase') || 'Toplam',
                [hInQty]: totals.totalInQty,
                [hInAmt]: totals.totalInAmount,
                [hOutQty]: totals.totalOutQty,
                [hOutAmt]: totals.totalOutAmount,
                [hUnit]: '',
                [hBal]: lastBalance,
            },
            metadata: {
                companyName: selectedFirm?.name || selectedFirm?.firma_adi || 'RetailEX',
                period: `${startDate} → ${endDate}`,
                note: `${selectedProduct.code || ''} — ${selectedProduct.name || ''} • ${currency}`,
            },
        });
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Üst Filtre Çubuğu */}
            <div className="bg-gray-100 border-b p-4 flex flex-wrap gap-4 items-end">
                <div className="relative" ref={dropdownRef}>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('materialCodeOrName') || 'Malzeme Kodu / Adı'}
                    </label>
                    <div className="flex gap-2">
                        <input
                            className="px-3 py-1.5 border rounded text-sm w-72 focus:ring-2 focus:ring-indigo-500"
                            placeholder={tm('selectMaterialPlaceholder') || 'Malzeme arayın...'}
                            value={searchText}
                            onChange={e => {
                                setSearchText(e.target.value);
                                setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                        />
                        <button
                            type="button"
                            onClick={() => setShowDropdown(s => !s)}
                            className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                    </div>
                    {showDropdown && filteredProducts.length > 0 && (
                        <div className="absolute z-20 mt-1 w-80 max-h-80 overflow-y-auto bg-white border rounded-lg shadow-lg">
                            {filteredProducts.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedProduct(p);
                                        setSearchText(`${p.code || ''} - ${p.name || ''}`);
                                        setShowDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 border-b last:border-b-0"
                                >
                                    <div className="font-mono text-xs text-gray-500">{p.code || '—'}</div>
                                    <div className="font-medium text-gray-800">{p.name}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('startDate') || 'Başlangıç'}
                    </label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('endDate') || 'Bitiş'}
                    </label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                    />
                </div>

                <button
                    onClick={loadReport}
                    disabled={!selectedProduct || loading}
                    className="px-6 py-2 bg-gray-800 text-white rounded font-bold text-sm hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (tm('loading') || 'Yükleniyor...') : (tm('prepareReport') || 'Raporu Hazırla')}
                </button>

                <div className="flex-1 flex justify-end gap-2">
                    <button className="p-2 hover:bg-gray-200 rounded border transition-colors" title={tm('print') || 'Yazdır'}>
                        <Printer className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={exportExcel}
                        disabled={!selectedProduct || rows.length === 0}
                        className="p-2 hover:bg-gray-200 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={tm('exportExcel') || tm('export') || 'Excel'}
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Rapor Başlığı */}
            <div className="p-6 pb-3 text-center">
                <h1 className="text-xl font-bold uppercase tracking-widest text-gray-800">
                    {tm('materialExtractReport') || 'Malzeme Ekstresi'}
                </h1>
                <div className="mt-2 flex justify-center gap-4 text-xs text-gray-500 flex-wrap">
                    {selectedProduct && (
                        <span className="font-semibold">
                            {selectedProduct.code} — {selectedProduct.name}
                        </span>
                    )}
                    <span>{tm('dateRangeLabel') || 'Tarih Aralığı'}: {startDate} → {endDate}</span>
                    <span>•</span>
                    <span>{currency}</span>
                </div>
            </div>

            {/* Tablo — Malzeme / Envanter Listesi ile aynı DevExDataGrid */}
            <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
                {!selectedProduct ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center max-w-md text-gray-400">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>{tm('selectMaterialHint') || 'Ekstresini görmek istediğiniz malzemeyi yukarıdan seçin.'}</p>
                        </div>
                    </div>
                ) : loading ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <div className="inline-flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            {tm('loading') || 'Yükleniyor...'}
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={gridRows}
                        columns={gridColumns}
                        {...REPORT_GRID_DEFAULTS}
                        height="100%"
                        footerLabel={tm('totalUppercase') || 'Toplam'}
                        footerSumColumns={[
                            {
                                columnId: 'inQty',
                                getValue: (r) => Number(r.inQty) || 0,
                                format: (sum) => (
                                    <span className="text-green-700">{formatNumber(sum, 2)}</span>
                                ),
                            },
                            {
                                columnId: 'inAmt',
                                getValue: (r) => Number(r.inAmt) || 0,
                                format: (sum) => (
                                    <span className="text-green-700">{formatNumber(sum, 2)} {currency}</span>
                                ),
                            },
                            {
                                columnId: 'outQty',
                                getValue: (r) => Number(r.outQty) || 0,
                                format: (sum) => (
                                    <span className="text-red-700">{formatNumber(sum, 2)}</span>
                                ),
                            },
                            {
                                columnId: 'outAmt',
                                getValue: (r) => Number(r.outAmt) || 0,
                                format: (sum) => (
                                    <span className="text-red-700">{formatNumber(sum, 2)} {currency}</span>
                                ),
                            },
                        ]}
                    />
                )}
            </div>
        </div>
    );
}
