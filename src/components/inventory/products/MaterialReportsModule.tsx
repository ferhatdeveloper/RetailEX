import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, FileText, Download, Filter, Calendar, TrendingUp, AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { formatNumber } from '../../../utils/formatNumber';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { localTodayDateKey, toSqlDateInputString } from '../../../utils/localCalendarDate';

type ReportType = 'stock-balance' | 'purchase-sales' | 'detailed-list' | 'transfer';

interface StoreRow {
    id: string;
    code: string;
    name: string;
    is_main?: boolean;
}

interface StockBalanceRow {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    productCode: string;
    productName: string;
    quantity: number;
    costPrice: number;
    value: number;
}

interface DetailedMovementRow {
    date: string;
    warehouseName: string;
    movementType: string;
    documentNo: string;
    productCode: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    description?: string;
}

function defaultRange(): { start: string; end: string } {
    const end = localTodayDateKey();
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start, end };
}

export function MaterialReportsModule() {
    const { tm } = useLanguage();
    const { selectedFirm, selectedDonem } = useFirmaDonem();

    const [activeReport, setActiveReport] = useState<ReportType>('stock-balance');
    const [startDate, setStartDate] = useState(defaultRange().start);
    const [endDate, setEndDate] = useState(defaultRange().end);
    const [warehouseId, setWarehouseId] = useState<string>('all');

    const reports = [
        { id: 'stock-balance' as ReportType, name: 'Malzeme Depo Bakiye Raporu', icon: BarChart3 },
        { id: 'purchase-sales' as ReportType, name: 'Malzeme Alış Satış Raporu', icon: TrendingUp },
        { id: 'detailed-list' as ReportType, name: 'Ayrıntılı Malzeme Listesi', icon: FileText },
        { id: 'transfer' as ReportType, name: 'Transfer Raporu', icon: BarChart3 },
    ];

    useEffect(() => {
        if (selectedDonem?.beg_date && selectedDonem?.end_date) {
            setStartDate(toSqlDateInputString(selectedDonem.beg_date) || defaultRange().start);
            setEndDate(toSqlDateInputString(selectedDonem.end_date) || defaultRange().end);
        }
    }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-cyan-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Malzeme Raporları</h1>
                            <p className="text-sm text-gray-500">Stok ve malzeme raporlarını görüntüleyin</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Report Tabs */}
            <div className="bg-white border-b border-gray-200 px-6">
                <div className="flex gap-2 overflow-x-auto">
                    {reports.map((report) => {
                        const Icon = report.icon;
                        return (
                            <button
                                key={report.id}
                                onClick={() => setActiveReport(report.id)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
                                    activeReport === report.id
                                        ? 'border-cyan-600 text-cyan-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {report.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Tarih Aralığı:</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                        <span className="text-gray-400">→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Depo:</label>
                        <WarehouseSelector value={warehouseId} onChange={setWarehouseId} />
                    </div>
                    <button
                        type="button"
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors ml-auto"
                        title="Yakında"
                    >
                        <Filter className="w-5 h-5" />
                        Daha Fazla Filtre
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeReport === 'stock-balance' && (
                    <StockBalanceReport
                        firmNr={selectedFirm?.firm_nr}
                        warehouseId={warehouseId}
                        onDownload={undefined}
                    />
                )}
                {activeReport === 'purchase-sales' && (
                    <ReportPlaceholder
                        title="Malzeme Alış Satış Raporu"
                        description="Alış ve satış faturalarından malzeme bazında dönemsel karşılaştırma. (TODO: detaylı implementasyon)"
                    />
                )}
                {activeReport === 'detailed-list' && (
                    <DetailedMaterialListReport
                        firmNr={selectedFirm?.firm_nr}
                        warehouseId={warehouseId}
                        startDate={startDate}
                        endDate={endDate}
                    />
                )}
                {activeReport === 'transfer' && (
                    <ReportPlaceholder
                        title="Transfer Raporu"
                        description="Depolar arası transfer hareketleri (giriş/çıkış fişleri). (TODO: detaylı implementasyon)"
                    />
                )}
            </div>
        </div>
    );
}

/** Depo seçici — gerçek `stores` tablosundan liste çeker. */
function WarehouseSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [warehouses, setWarehouses] = useState<StoreRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch('/api/pg_query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sql: `SELECT id, code, name, is_main FROM stores WHERE COALESCE(is_active, true) = true ORDER BY COALESCE(is_main, false) DESC, name ASC`,
                    }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const rows: StoreRow[] = Array.isArray(data?.rows) ? data.rows : [];
                if (!cancelled) setWarehouses(rows);
            } catch (err: any) {
                if (!cancelled) setWarehouses([]);
                // Hata durumunda sessizce boş liste; fallback zaten var.
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="px-3 py-2 pr-9 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none bg-white min-w-[180px]"
                disabled={loading}
            >
                <option value="all">{loading ? 'Yükleniyor...' : 'Tüm Depolar'}</option>
                {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                    </option>
                ))}
            </select>
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
    );
}

function ReportPlaceholder({ title, description }: { title: string; description: string }) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center text-gray-500">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">{title}</p>
                <p className="text-sm mb-4">{description}</p>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    Bu rapor için gelişmiş sorgu/servis implementasyonu ayrı bir ajan tarafından tamamlanacaktır.
                </div>
            </div>
        </div>
    );
}

function StockBalanceReport({
    firmNr,
    warehouseId,
    onDownload,
}: {
    firmNr?: string | number;
    warehouseId: string;
    onDownload?: () => void;
}) {
    const [rows, setRows] = useState<StockBalanceRow[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const filterWarehouse = warehouseId !== 'all';
            // Tüm dönemlerin stok_movement_items üzerinden ambar bazlı kümülatif miktarı.
            // firmNr filtresi yok (tüm dönem); sadece seçili depo için filtre uygulanır.
            // Ürün tablosu firmNr-prefixli (`rex_${firmNr}_products`); seçili firmaya göre dinamik.
            const productsTable = `rex_${firmNr || '001'}_products`;
            const whFilter = filterWarehouse ? `AND sm.warehouse_id = $1` : '';
            const params = filterWarehouse ? [warehouseId] : [];
            const sql = `
                SELECT
                    sm.warehouse_id,
                    COALESCE(s.code, '') AS warehouse_code,
                    COALESCE(s.name, '') AS warehouse_name,
                    COALESCE(p.code, '') AS product_code,
                    COALESCE(p.name, '') AS product_name,
                    SUM(smi.quantity)::numeric AS qty,
                    COALESCE(p.cost_price, 0)::numeric AS cost_price
                FROM stock_movements sm
                JOIN stock_movement_items smi ON smi.movement_id = sm.id
                LEFT JOIN stores s ON s.id = sm.warehouse_id
                LEFT JOIN ${productsTable} p ON p.id = smi.product_id
                WHERE 1=1 ${whFilter}
                GROUP BY sm.warehouse_id, s.code, s.name, p.code, p.name, p.cost_price
                ORDER BY warehouse_name ASC, product_name ASC
                LIMIT 500
            `;
            const res = await fetch('/api/pg_query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql, params }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list: any[] = Array.isArray(data?.rows) ? data.rows : [];
            const mapped: StockBalanceRow[] = list.map((r) => {
                const qty = Number(r.qty || 0);
                const cost = Number(r.cost_price || 0);
                return {
                    warehouseId: String(r.warehouse_id || ''),
                    warehouseCode: String(r.warehouse_code || ''),
                    warehouseName: String(r.warehouse_name || ''),
                    productCode: String(r.product_code || ''),
                    productName: String(r.product_name || ''),
                    quantity: qty,
                    costPrice: cost,
                    value: qty * cost,
                };
            });
            setRows(mapped);
        } catch (err: any) {
            toast.error(err?.message || String(err));
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseId, firmNr]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => {
                acc.quantity += r.quantity;
                acc.value += r.value;
                return acc;
            },
            { quantity: 0, value: 0 },
        );
    }, [rows]);

    const exportCsv = () => {
        const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [
            ['Depo Kodu', 'Depo', 'Malzeme Kodu', 'Malzeme', 'Miktar', 'Birim Maliyet', 'Toplam Değer'].map(esc).join(';'),
            ...rows.map((r) =>
                [r.warehouseCode, r.warehouseName, r.productCode, r.productName, r.quantity, r.costPrice, r.value]
                    .map(esc)
                    .join(';'),
            ),
        ];
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'malzeme_depo_bakiye.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Malzeme Depo Bakiye Raporu</h2>
                    <p className="text-sm text-gray-500">Depo bazlı stok miktarı ve maliyet üzerinden toplam değer.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Yenile
                    </button>
                    <button
                        type="button"
                        onClick={exportCsv}
                        className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm"
                    >
                        <Download className="w-4 h-4" />
                        CSV İndir
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Toplam Satır</p>
                    <p className="mt-1 text-lg font-bold">{rows.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Toplam Miktar</p>
                    <p className="mt-1 text-lg font-bold">{formatNumber(totals.quantity, 4, false)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Toplam Değer</p>
                    <p className="mt-1 text-lg font-bold">{formatNumber(totals.value, 2, false)} IQD</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Depo</p>
                    <p className="mt-1 text-lg font-bold">{warehouseId === 'all' ? 'Tümü' : 'Seçili'}</p>
                </div>
            </div>

            <div className="overflow-auto max-h-[480px]">
                <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Depo</th>
                            <th className="px-3 py-2 text-left">Malzeme Kodu</th>
                            <th className="px-3 py-2 text-left">Malzeme</th>
                            <th className="px-3 py-2 text-right">Miktar</th>
                            <th className="px-3 py-2 text-right">Birim Maliyet</th>
                            <th className="px-3 py-2 text-right">Toplam Değer</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading && (
                            <tr>
                                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                                    Kayıt bulunamadı. Depo seçin veya hareket girin.
                                </td>
                            </tr>
                        )}
                        {rows.map((r, i) => (
                            <tr key={`${r.warehouseId}-${r.productCode}-${i}`} className="border-t border-gray-100">
                                <td className="px-3 py-2">
                                    <div className="font-medium">{r.warehouseName || '-'}</div>
                                    <div className="text-xs text-gray-500">{r.warehouseCode}</div>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">{r.productCode || '-'}</td>
                                <td className="px-3 py-2">{r.productName || '-'}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.quantity, 4, false)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(r.costPrice, 2, false)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.value, 2, false)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function DetailedMaterialListReport({
    firmNr,
    warehouseId,
    startDate,
    endDate,
}: {
    firmNr?: string | number;
    warehouseId: string;
    startDate: string;
    endDate: string;
}) {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [rows, setRows] = useState<DetailedMovementRow[]>([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const list = await productAPI.getAllForReports({ firmNr });
                if (!cancelled) setProducts(list);
            } catch (err) {
                console.error('[MaterialReportsModule] product load failed', err);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [firmNr]);

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
            .filter(
                (p) =>
                    (p.code || '').toLocaleLowerCase('tr').includes(q) ||
                    (p.name || '').toLocaleLowerCase('tr').includes(q),
            )
            .slice(0, 50);
    }, [products, searchText]);

    const loadReport = async () => {
        if (!selectedProduct?.id) {
            return;
        }
        setLoading(true);
        try {
            // Ambar fişleri + satış/alış faturaları üzerinden hareket listesi.
            // Ürün tablosu firmNr-prefixli (`rex_${firmNr}_products`); seçili firmaya göre dinamik.
            const productsTable = `rex_${firmNr || '001'}_products`;
            const whFilter = warehouseId !== 'all';
            const params: any[] = [selectedProduct.id, startDate, endDate + ' 23:59:59'];
            const wh = whFilter ? `AND sm.warehouse_id = $4` : '';
            if (whFilter) params.push(warehouseId);
            const sql = `
                SELECT
                    sm.movement_date::date AS date,
                    COALESCE(s.name, '-') AS warehouse_name,
                    COALESCE(sm.movement_type, '-') AS movement_type,
                    COALESCE(sm.document_no, '-') AS document_no,
                    COALESCE(p.code, '-') AS product_code,
                    COALESCE(p.name, '-') AS product_name,
                    COALESCE(smi.quantity, 0)::numeric AS quantity,
                    COALESCE(smi.unit_price, 0)::numeric AS unit_price,
                    (COALESCE(smi.quantity, 0) * COALESCE(smi.unit_price, 0))::numeric AS amount,
                    COALESCE(sm.description, '') AS description
                FROM stock_movements sm
                JOIN stock_movement_items smi ON smi.movement_id = sm.id
                LEFT JOIN stores s ON s.id = sm.warehouse_id
                LEFT JOIN ${productsTable} p ON p.id = smi.product_id
                WHERE smi.product_id = $1
                  AND sm.movement_date >= $2
                  AND sm.movement_date <= $3
                  ${wh}
                ORDER BY sm.movement_date DESC
                LIMIT 500
            `;
            const res = await fetch('/api/pg_query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql, params }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list: any[] = Array.isArray(data?.rows) ? data.rows : [];
            const mapped: DetailedMovementRow[] = list.map((r) => ({
                date: String(r.date || ''),
                warehouseName: String(r.warehouse_name || '-'),
                movementType: String(r.movement_type || '-'),
                documentNo: String(r.document_no || '-'),
                productCode: String(r.product_code || '-'),
                productName: String(r.product_name || '-'),
                quantity: Number(r.quantity || 0),
                unitPrice: Number(r.unit_price || 0),
                amount: Number(r.amount || 0),
                description: String(r.description || ''),
            }));
            setRows(mapped);
        } catch (err: any) {
            toast.error(err?.message || String(err));
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedProduct) void loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseId, startDate, endDate, selectedProduct?.id]);

    const exportCsv = () => {
        const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [
            ['Tarih', 'Depo', 'Hareket', 'Belge No', 'Malzeme Kodu', 'Malzeme', 'Miktar', 'Birim Fiyat', 'Tutar', 'Açıklama']
                .map(esc)
                .join(';'),
            ...rows.map((r) =>
                [r.date, r.warehouseName, r.movementType, r.documentNo, r.productCode, r.productName, r.quantity, r.unitPrice, r.amount, r.description]
                    .map(esc)
                    .join(';'),
            ),
        ];
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ayrintili_malzeme_listesi.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Ayrıntılı Malzeme Listesi</h2>
                <p className="text-sm text-gray-500">Malzeme bazlı tarih aralığında hareketler (giriş/çıkış/transfer).</p>

                <div ref={dropdownRef} className="mt-3 relative max-w-md">
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Malzeme ara..."
                            value={searchText}
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                            className="flex-1 outline-none text-sm"
                        />
                    </div>
                    {showDropdown && filteredProducts.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg">
                            {filteredProducts.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedProduct(p);
                                        setSearchText(`${p.code} — ${p.name}`);
                                        setShowDropdown(false);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-cyan-50 text-sm"
                                >
                                    <div className="font-medium">{p.name}</div>
                                    <div className="text-xs text-gray-500">{p.code}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-b border-gray-200">
                <button
                    type="button"
                    onClick={() => void loadReport()}
                    disabled={!selectedProduct}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Yenile
                </button>
                <button
                    type="button"
                    onClick={exportCsv}
                    disabled={rows.length === 0}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm disabled:opacity-50"
                >
                    <Download className="w-4 h-4" />
                    CSV İndir
                </button>
            </div>

            <div className="overflow-auto max-h-[480px]">
                <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left">Tarih</th>
                            <th className="px-3 py-2 text-left">Depo</th>
                            <th className="px-3 py-2 text-left">Hareket</th>
                            <th className="px-3 py-2 text-left">Belge No</th>
                            <th className="px-3 py-2 text-right">Miktar</th>
                            <th className="px-3 py-2 text-right">Birim Fiyat</th>
                            <th className="px-3 py-2 text-right">Tutar</th>
                            <th className="px-3 py-2 text-left">Açıklama</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading && (
                            <tr>
                                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                                    {selectedProduct
                                        ? 'Bu tarih aralığında hareket bulunamadı.'
                                        : 'Görüntülemek için yukarıdan bir malzeme seçin.'}
                                </td>
                            </tr>
                        )}
                        {rows.map((r, i) => (
                            <tr key={`${r.documentNo}-${i}`} className="border-t border-gray-100">
                                <td className="px-3 py-2">{r.date}</td>
                                <td className="px-3 py-2">{r.warehouseName}</td>
                                <td className="px-3 py-2">{r.movementType}</td>
                                <td className="px-3 py-2 font-mono text-xs">{r.documentNo}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.quantity, 4, false)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(r.unitPrice, 2, false)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.amount, 2, false)}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">{r.description || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
