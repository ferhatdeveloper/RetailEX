import React, { useState, useEffect, useMemo } from 'react';
import {
    X, Package, TrendingUp, Edit3, Barcode, History,
    ShoppingCart, Info, ArrowRightLeft, Printer, Trash2,
    ChevronRight, Box, Tag, Layers, Settings, FileText,
    AlertCircle, Banknote, Warehouse, Clock, Search, RefreshCw, Download, Upload, Plus, Edit,
    MapPin, Building2, Calendar, Filter
} from 'lucide-react';
import { Product, ProductVariant } from '../../../core/types';
import { productAPI } from '../../../services/api/products';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { ProductFormPage } from './ProductFormPage';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import { formatShortDate, formatTimeShort } from '../../../utils/dateLocale';
import type { Language } from '../../../locales/module-translations';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatNumber } from '../../../utils/formatNumber';
import { getAppDefaultCurrency } from '../../../services/postgres';

function formatNumberOrDash(n: unknown, locale: string, empty: string): string {
    if (n === null || n === undefined || n === '') return empty;
    const x = typeof n === 'number' ? n : parseFloat(String(n));
    return Number.isFinite(x) ? x.toLocaleString(locale, { maximumFractionDigits: 4 }) : empty;
}

/** yyyy-mm-dd, tr gg.aa.yyyy, en mm/dd/yyyy, ar/ku yyyy-mm-dd veya gg/aa/yyyy */
function pohInputToIso(raw: string, language: Language): string {
    const s = raw.trim();
    if (!s) return '';
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parts = s.split(/[./-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 3) return '';
    let y: string;
    let m: string;
    let d: string;
    if (parts[0].length === 4) {
        [y, m, d] = parts;
    } else if (language === 'en') {
        [m, d, y] = parts;
    } else {
        [d, m, y] = parts;
    }
    if (y.length === 2) y = `20${y}`;
    if (y.length !== 4) return '';
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    const yi = Number(y);
    const mi = Number(mm);
    const di = Number(dd);
    const dt = new Date(yi, mi - 1, di);
    if (dt.getFullYear() !== yi || dt.getMonth() !== mi - 1 || dt.getDate() !== di) return '';
    return `${y}-${mm}-${dd}`;
}

function pohParseFilterDate(raw: string, language: Language, endOfDay: boolean): Date | null {
    const iso = pohInputToIso(raw, language);
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
}

function movementTypeLabel(mt: string | undefined, tm: (k: string) => string): string {
    if (mt === 'in') return tm('invMovTypeIn');
    if (mt === 'out') return tm('invMovTypeOut');
    if (mt === 'price_change') return tm('reportsPlMovPriceChange');
    return tm('pohTypeAdjust');
}

type PohMovementGridRow = {
    id: string;
    dateLabel: string;
    timeLabel: string;
    documentNo: string;
    partner: string;
    typeLabel: string;
    typeTone: string;
    movementType: string;
    warehouse: string;
    fxLabel: string;
    unit: string;
    unitPrice: number;
    amount: number;
    signedQty: number;
    grossProfit: number | null;
    isPriceChange: boolean;
    purchasePrice: number;
    salePrice: number;
};

const pohMovCol = createColumnHelper<PohMovementGridRow>();

function resolveMovementUnitPrice(item: any, mt: string): number {
    const up = Number(item.unit_price ?? 0) || 0;
    const cp = Number(item.cost_price ?? item.unit_cost ?? 0) || 0;
    if (mt === 'in') return cp || up;
    if (mt === 'out') return up || cp;
    return up || cp;
}

interface ProductOperationHubProps {
    product: Product;
    onClose: () => void;
    onSave: (product: Product) => void;
    initialTab?: HubTab;
    darkMode?: boolean;
}

export type HubTab = 'overview' | 'edit' | 'movements' | 'inventory' | 'labels' | 'history';

export function ProductOperationHub({ product, onClose, onSave, initialTab = 'overview', darkMode = false }: ProductOperationHubProps) {
    const { language, tm } = useLanguage();
    const localeCode = tm('localeCode');
    const emptyDash = tm('pohEmpty');
    const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
    const [movements, setMovements] = useState<any[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(false);
    const [rateHistory, setRateHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    
    // Filter states
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'price_change'>('all');
    const amountCurrency = getAppDefaultCurrency() || 'IQD';
    const productUnit = String(product.unit || tm('unitPiece') || 'Adet');

    // Load movements when overview or movements tab is active
    useEffect(() => {
        if (activeTab === 'movements' || activeTab === 'overview') {
            loadMovements();
        }
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab, product.id]);

    const filteredMovementRows = useMemo((): PohMovementGridRow[] => {
        return (movements || [])
            .filter((item) => {
                const m = item.movement;
                const date = new Date(m?.movement_date || item.created_at);
                if (filterType !== 'all' && m?.movement_type !== filterType) return false;
                if (filterStartDate) {
                    const start = pohParseFilterDate(filterStartDate, language, false);
                    if (start && date < start) return false;
                }
                if (filterEndDate) {
                    const end = pohParseFilterDate(filterEndDate, language, true);
                    if (end && date > end) return false;
                }
                return true;
            })
            .map((item, idx) => {
                const mt = String(item.movement?.movement_type || '');
                const isPrice = mt === 'price_change';
                const qtyAbs = Math.abs(Number(item.quantity) || 0);
                const signedQty = mt === 'in' ? qtyAbs : mt === 'out' ? -qtyAbs : 0;
                const unitPrice = resolveMovementUnitPrice(item, mt);
                const totalFromApi = Math.abs(Number(item.total_amount ?? item.net_amount) || 0);
                const amountAbs = isPrice ? 0 : totalFromApi || qtyAbs * unitPrice;
                const gp = Number(item.gross_profit);
                const unit = String(item.unit_name || item.unit || productUnit || 'Adet');
                return {
                    id: String(item.id || `${idx}`),
                    dateLabel: formatShortDate(item.movement?.movement_date || item.created_at, localeCode, {
                        fallback: emptyDash,
                    }),
                    timeLabel: formatTimeShort(item.movement?.movement_date || item.created_at, localeCode, {
                        fallback: emptyDash,
                    }),
                    documentNo: String(item.movement?.document_no || tm('manual')),
                    partner: String(item.notes || emptyDash),
                    typeLabel: movementTypeLabel(mt, tm),
                    typeTone:
                        mt === 'in'
                            ? 'bg-green-100 text-green-700'
                            : mt === 'out'
                              ? 'bg-red-100 text-red-700'
                              : mt === 'price_change'
                                ? 'bg-violet-100 text-violet-800'
                                : 'bg-blue-100 text-blue-700',
                    movementType: mt,
                    warehouse: String(item.movement?.warehouses?.name || tm('pohMainWarehouse')),
                    fxLabel: `${item.currency || amountCurrency} / ${
                        item.currency_rate != null
                            ? Number(item.currency_rate).toLocaleString(localeCode, { minimumFractionDigits: 2 })
                            : emptyDash
                    }`,
                    unit,
                    unitPrice,
                    amount: mt === 'out' ? -amountAbs : amountAbs,
                    signedQty,
                    grossProfit: Number.isFinite(gp) && Math.abs(gp) > 0.0000001 ? gp : null,
                    isPriceChange: isPrice,
                    purchasePrice: Number(item.cost_price) || 0,
                    salePrice: Number(item.unit_price) || 0,
                };
            });
    }, [
        movements,
        filterType,
        filterStartDate,
        filterEndDate,
        language,
        localeCode,
        emptyDash,
        tm,
        amountCurrency,
        productUnit,
    ]);

    const movementTotals = useMemo(() => {
        let inQty = 0;
        let outQty = 0;
        let inAmt = 0;
        let outAmt = 0;
        const byUnit = new Map<
            string,
            { unit: string; inQty: number; outQty: number; inAmt: number; outAmt: number }
        >();
        for (const r of filteredMovementRows) {
            if (r.isPriceChange) continue;
            const u = r.unit || productUnit || 'Adet';
            let bucket = byUnit.get(u);
            if (!bucket) {
                bucket = { unit: u, inQty: 0, outQty: 0, inAmt: 0, outAmt: 0 };
                byUnit.set(u, bucket);
            }
            if (r.signedQty > 0) {
                inQty += r.signedQty;
                inAmt += Math.abs(r.amount);
                bucket.inQty += r.signedQty;
                bucket.inAmt += Math.abs(r.amount);
            } else if (r.signedQty < 0) {
                outQty += Math.abs(r.signedQty);
                outAmt += Math.abs(r.amount);
                bucket.outQty += Math.abs(r.signedQty);
                bucket.outAmt += Math.abs(r.amount);
            }
        }
        return {
            inQty,
            outQty,
            inAmt,
            outAmt,
            netQty: inQty - outQty,
            byUnit: Array.from(byUnit.values()),
        };
    }, [filteredMovementRows, productUnit]);

    const movementColumns = useMemo(
        () => [
            pohMovCol.accessor('dateLabel', {
                id: 'dateLabel',
                header: tm('reportsPlMovColDate'),
                size: 110,
                cell: ({ row }) => (
                    <div>
                        <span className="font-medium">{row.original.dateLabel}</span>
                        <span className="block text-[9px] opacity-60">{row.original.timeLabel}</span>
                    </div>
                ),
            }),
            pohMovCol.accessor('documentNo', {
                id: 'documentNo',
                header: tm('pohColDoc'),
                size: 140,
                cell: ({ row }) => (
                    <div>
                        <span className="font-bold text-gray-800 block text-[11px]">{row.original.documentNo}</span>
                        <span className="text-[9px] text-gray-400 truncate max-w-[140px] block">
                            {row.original.partner}
                        </span>
                    </div>
                ),
            }),
            pohMovCol.accessor('typeLabel', {
                id: 'typeLabel',
                header: tm('invThType'),
                size: 100,
                cell: ({ row }) => (
                    <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${row.original.typeTone}`}
                    >
                        {row.original.typeLabel}
                    </span>
                ),
            }),
            pohMovCol.accessor('warehouse', {
                id: 'warehouse',
                header: tm('warehouse'),
                size: 120,
            }),
            pohMovCol.accessor('unit', {
                id: 'unit',
                header: tm('unit'),
                size: 70,
            }),
            pohMovCol.accessor('unitPrice', {
                id: 'unitPrice',
                header: tm('unitPrice'),
                size: 110,
                meta: { filterKind: 'number', align: 'right' },
                cell: ({ row }) => {
                    const r = row.original;
                    if (r.isPriceChange) {
                        return (
                            <div className="text-[10px] font-bold text-violet-700 leading-tight text-right">
                                <div>
                                    {tm('purchase')} {formatNumber(r.purchasePrice, 2, false)}
                                </div>
                                <div>
                                    {tm('salePrice')} {formatNumber(r.salePrice, 2, false)}
                                </div>
                            </div>
                        );
                    }
                    return (
                        <span className="tabular-nums">
                            {r.unitPrice ? formatNumber(r.unitPrice, 2, false) : emptyDash}
                        </span>
                    );
                },
            }),
            pohMovCol.accessor('amount', {
                id: 'amount',
                header: tm('amount'),
                size: 120,
                meta: { filterKind: 'number', align: 'right' },
                cell: ({ row }) => {
                    const r = row.original;
                    if (r.isPriceChange) return <span className="text-gray-400">{emptyDash}</span>;
                    return (
                        <span
                            className={`font-semibold tabular-nums ${
                                r.amount < 0 ? 'text-red-600' : r.amount > 0 ? 'text-green-700' : 'text-gray-500'
                            }`}
                        >
                            {formatNumber(r.amount, 2, false)}
                        </span>
                    );
                },
            }),
            pohMovCol.accessor('fxLabel', {
                id: 'fxLabel',
                header: tm('pohColFx'),
                size: 100,
            }),
            pohMovCol.accessor('grossProfit', {
                id: 'grossProfit',
                header: tm('reportsPlMovColProfit'),
                size: 100,
                meta: { filterKind: 'number', align: 'right' },
                cell: ({ row }) => {
                    const gp = row.original.grossProfit;
                    return (
                        <span className={`text-[11px] font-bold ${gp != null && gp > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {gp != null ? formatNumber(gp, 2, false) : emptyDash}
                        </span>
                    );
                },
            }),
            pohMovCol.accessor('signedQty', {
                id: 'signedQty',
                header: tm('reportsPlMovColQty'),
                size: 100,
                meta: { filterKind: 'number', align: 'right' },
                cell: ({ row }) => {
                    const r = row.original;
                    if (r.isPriceChange) {
                        return <span className="text-violet-600 text-[10px] font-bold">{tm('pohFilterPrice')}</span>;
                    }
                    return (
                        <span
                            className={`text-[11px] font-bold tabular-nums ${
                                r.signedQty > 0 ? 'text-green-600' : r.signedQty < 0 ? 'text-red-600' : 'text-gray-500'
                            }`}
                        >
                            {r.signedQty > 0 ? '+' : ''}
                            {formatNumber(r.signedQty, 3, false)} {r.unit}
                        </span>
                    );
                },
            }),
        ],
        [tm, emptyDash]
    );

    const loadHistory = async () => {
        try {
            setLoadingHistory(true);
            const data = await productAPI.getExchangeRateHistory(product.id);
            setRateHistory(data);
        } catch (error) {
            console.error('Failed to load rate history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const loadMovements = async () => {
        try {
            setLoadingMovements(true);
            const data = await stockMovementAPI.getProductMovements(product.id, {
                code: product.code,
                barcode: product.barcode,
            });
            setMovements(data);
        } catch (error) {
            console.error('Failed to load movements:', error);
            toast.error(tm('reportsPlMovLoadError'));
        } finally {
            setLoadingMovements(false);
        }
    };

    const tabs = [
        { id: 'overview', label: tm('pohTabOverview'), icon: Info },
        { id: 'edit', label: tm('pohTabEdit'), icon: Edit3 },
        { id: 'movements', label: tm('pohTabMovements'), icon: TrendingUp },
        { id: 'inventory', label: tm('pohTabInventory'), icon: Warehouse },
        { id: 'labels', label: tm('pohTabLabels'), icon: Barcode },
        { id: 'history', label: tm('pohTabHistory'), icon: History },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                                        <Box className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mevcut Stok</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.stock || 0}</span>
                                    <span className="text-[10px] text-gray-400 font-medium">{product.unit || 'Adet'}</span>
                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-green-100 text-green-600 rounded-md">
                                        <Banknote className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Satış Fiyatı</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.price ? product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '0,00'}</span>

                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-md">
                                        <ArrowRightLeft className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Maliyet</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.cost ? product.cost.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '0,00'}</span>

                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md">
                                        <Tag className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Barkod</span>
                                </div>
                                <div className="truncate">
                                    <span className={`text-sm font-mono font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.barcode || '---'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Main Content Grid: Product Info, Recent Movements, Branch Stocks */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Left Column: Product Details + Recent Movements */}
                            <div className="space-y-4">
                                {/* Product Details */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase">Ürün Bilgileri</h3>
                                        <button onClick={() => setActiveTab('edit')} className="text-blue-600 text-[10px] font-bold hover:underline">DÜZENLE</button>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-6">
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Ürün Adı</span>
                                            <span className="text-sm font-medium">{product.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Stok Kodu</span>
                                            <span className="text-sm font-mono font-medium">{product.code}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Kategori</span>
                                            <span className="text-sm font-medium">{product.category || '---'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Marka</span>
                                            <span className="text-sm font-medium">{product.brand || '---'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">TAX Oranı</span>
                                            <span className="text-sm font-medium">%{product.taxRate || 0}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Birim</span>
                                            <span className="text-sm font-medium">{product.unit || 'ADET'}</span>
                                        </div>
                                        <div className="col-span-2 pt-2 mt-1 border-t border-gray-100">
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">
                                                {tm('specialCode')} 2
                                            </span>
                                            <span className={`text-sm font-mono font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {product.specialCode2?.trim() || '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Movements */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-xs font-bold text-gray-700 uppercase">{tm('pohRecentMovements')}</h3>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('movements')}
                                            className="text-blue-600 text-[10px] font-bold hover:underline"
                                        >
                                            {tm('pohFilterAll')}
                                        </button>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                        {loadingMovements ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : movements.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400">
                                                <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                <p className="text-xs">{tm('pohNoMovementsYet')}</p>
                                            </div>
                                        ) : (
                                            movements.slice(0, 5).map((item) => {
                                                const mt = item.movement?.movement_type;
                                                const isPrice = mt === 'price_change';
                                                return (
                                                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-bold ${
                                                                isPrice ? 'text-violet-600' : item.movement?.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                                                                }`}>
                                                                {movementTypeLabel(item.movement?.movement_type, tm)}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">
                                                                {formatShortDate(item.movement?.movement_date || item.created_at, localeCode, { fallback: emptyDash })}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-600 truncate">{item.movement?.document_no || tm('manual')}</p>
                                                        {isPrice && (item.notes || item.unit_price != null) ? (
                                                            <p className="text-[10px] text-violet-700 truncate max-w-[200px]">
                                                                {item.notes || `${tm('purchase')} ${formatNumberOrDash(item.cost_price, localeCode, emptyDash)} · ${tm('salePrice')} ${formatNumberOrDash(item.unit_price, localeCode, emptyDash)}`}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <span className={`text-sm font-bold ${
                                                        isPrice ? 'text-violet-600' : item.movement?.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                        {isPrice ? (
                                                            <>{tm('purchase')}:{formatNumberOrDash(item.cost_price, localeCode, emptyDash)} {tm('salePrice')}:{formatNumberOrDash(item.unit_price, localeCode, emptyDash)}</>
                                                        ) : (
                                                            <>{item.movement?.movement_type === 'in' ? '+' : '-'}{item.quantity}</>
                                                        )}
                                                    </span>
                                                </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Product Image + Branch Stocks */}
                            <div className="space-y-4">
                                {/* Product Image */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase">Ürün Görseli</h3>
                                    </div>
                                    <div className="p-4 flex items-center justify-center min-h-[160px] bg-gray-50">
                                        {(product.image_url_cdn || product.image_url) ? (
                                            <img
                                                src={product.image_url_cdn || product.image_url}
                                                alt={product.name}
                                                className="max-h-40 max-w-full object-contain rounded shadow-sm"
                                                onError={(e) => {
                                                    // Fallback if image fails to load
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.parentElement!.innerHTML = '<div class="flex flex-col items-center text-gray-300"><svg class="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg><span class="text-[10px] font-bold">GÖRSEL YOK</span></div>';
                                                }}
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center text-gray-300">
                                                <Package className="w-12 h-12 mb-1" />
                                                <span className="text-[10px] font-bold">GÖRSEL YOK</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Branch Stock Status */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-xs font-bold text-gray-700 uppercase">Şube Stok Durumu</h3>
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                        {/* Main Warehouse Stock */}
                                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                            <div className="flex-1">
                                                <p className="text-xs font-medium text-gray-700">Ana Depo</p>
                                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                                                    <span>Toplam: {product.stock || 0}</span>
                                                    <span>Rezerve: 0</span>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-bold ${(product.stock || 0) > 0 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {product.stock || 0} adet
                                            </span>
                                        </div>

                                        {/* Info message for multi-warehouse */}
                                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <div className="flex items-start gap-2">
                                                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-medium text-blue-900">Çoklu Depo Özelliği</p>
                                                    <p className="text-[10px] text-blue-700 mt-1">
                                                        Birden fazla depo tanımlandığında, tüm depoların stok durumu burada görünecektir.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'edit':
                return (
                    <div className="h-full relative overflow-hidden">
                        <ProductFormPage
                            productId={product.id}
                            onSave={onSave}
                            onClose={() => setActiveTab('overview')}
                        />
                    </div>
                );
            case 'movements':
                return (
                    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
                        <div className="px-4 py-2 border-b flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600" />
                                    {tm('stockMovements')}
                                </h2>
                                
                                {/* Filters */}
                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                    <Calendar className="w-3 h-3 text-gray-400" />
                                    <input 
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        lang={localeCode}
                                        placeholder={tm('pohDatePlaceholder')}
                                        title={tm('pohDatePlaceholder')}
                                        aria-label={tm('reportsPlMovColDate')}
                                        value={filterStartDate}
                                        onChange={(e) => setFilterStartDate(e.target.value)}
                                        className="text-[10px] font-bold outline-none border-none p-0 w-28 bg-transparent"
                                    />
                                    <span className="text-gray-300">-</span>
                                    <input 
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        lang={localeCode}
                                        placeholder={tm('pohDatePlaceholder')}
                                        title={tm('pohDatePlaceholder')}
                                        aria-label={tm('reportsPlMovColDate')}
                                        value={filterEndDate}
                                        onChange={(e) => setFilterEndDate(e.target.value)}
                                        className="text-[10px] font-bold outline-none border-none p-0 w-28 bg-transparent"
                                    />
                                </div>

                                <select 
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value as 'all' | 'in' | 'out' | 'price_change')}
                                    className="text-[10px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none"
                                >
                                    <option value="all">{tm('pohFilterAll')}</option>
                                    <option value="in">{tm('pohFilterIn')}</option>
                                    <option value="out">{tm('pohFilterOut')}</option>
                                    <option value="price_change">{tm('pohFilterPrice')}</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                {(filterStartDate || filterEndDate || filterType !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setFilterStartDate('');
                                            setFilterEndDate('');
                                            setFilterType('all');
                                        }}
                                        className="text-[10px] font-bold text-red-600 hover:text-red-700 underline"
                                    >
                                        {tm('pohClearFilters')}
                                    </button>
                                )}
                                <button
                                    onClick={loadMovements}
                                    className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                                    title={tm('refresh')}
                                >
                                    <ArrowRightLeft className={`w-3 h-3 ${loadingMovements ? 'animate-spin' : ''} `} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                            {loadingMovements ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-2">
                                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[10px] font-bold text-gray-400">{tm('reportsPlMovLoading')}</p>
                                </div>
                            ) : movements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 text-center">
                                    <Layers className="w-10 h-10 mb-2 opacity-20" />
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider">{tm('pohNoMovements')}</h3>
                                </div>
                            ) : filteredMovementRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 text-center">
                                    <Filter className="w-10 h-10 mb-2 opacity-20" />
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider">{tm('pohNoMovements')}</h3>
                                </div>
                            ) : (
                                <>
                                    {movementTotals.byUnit.length > 0 && (
                                        <div className="shrink-0 px-4 py-2 border-b bg-slate-50/80 flex flex-wrap gap-2">
                                            {movementTotals.byUnit.map((b) => (
                                                <div
                                                    key={b.unit}
                                                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px]"
                                                >
                                                    <span className="font-bold text-slate-700 uppercase tracking-wide">
                                                        {tm('unit')}: {b.unit}
                                                    </span>
                                                    <span className="text-green-700 font-semibold">
                                                        {tm('pohFilterIn')}: +{formatNumber(b.inQty, 3, false)}{' '}
                                                        {b.unit} · {formatNumber(b.inAmt, 2, false)} {amountCurrency}
                                                    </span>
                                                    <span className="text-red-600 font-semibold">
                                                        {tm('pohFilterOut')}: −{formatNumber(b.outQty, 3, false)}{' '}
                                                        {b.unit} · {formatNumber(b.outAmt, 2, false)} {amountCurrency}
                                                    </span>
                                                    <span className="text-slate-600 font-bold">
                                                        {tm('pohMovNet')}:{' '}
                                                        {formatNumber(b.inQty - b.outQty, 3, false)} {b.unit}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex-1 min-h-0 p-2">
                                        <DevExDataGrid
                                            data={filteredMovementRows}
                                            columns={movementColumns}
                                            pageSize={50}
                                            enableFiltering
                                            enablePagination
                                            density="compact"
                                            height="100%"
                                            storageNamespace="productOperationHubMovements"
                                            autoFooterSums={false}
                                            footerLabel={tm('total')}
                                            footerCurrency={amountCurrency}
                                            footerSumColumns={[
                                                {
                                                    columnId: 'amount',
                                                    getValue: (r) => (r.isPriceChange ? 0 : Number(r.amount) || 0),
                                                    format: (sum) => (
                                                        <span
                                                            className={`tabular-nums font-bold ${
                                                                sum < 0 ? 'text-red-600' : 'text-green-700'
                                                            }`}
                                                        >
                                                            {formatNumber(sum, 2, false)} {amountCurrency}
                                                        </span>
                                                    ),
                                                },
                                                {
                                                    columnId: 'signedQty',
                                                    getValue: (r) => (r.isPriceChange ? 0 : Number(r.signedQty) || 0),
                                                    format: (sum) => (
                                                        <span
                                                            className={`tabular-nums font-bold ${
                                                                sum < 0 ? 'text-red-600' : 'text-green-700'
                                                            }`}
                                                        >
                                                            {sum > 0 ? '+' : ''}
                                                            {formatNumber(sum, 3, false)}
                                                        </span>
                                                    ),
                                                },
                                                {
                                                    columnId: 'grossProfit',
                                                    getValue: (r) => Number(r.grossProfit) || 0,
                                                    format: (sum) => (
                                                        <span
                                                            className={`tabular-nums font-bold ${
                                                                sum > 0 ? 'text-green-600' : 'text-gray-500'
                                                            }`}
                                                        >
                                                            {formatNumber(sum, 2, false)}
                                                        </span>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            case 'history':
                return (
                    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
                        <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-50/50">
                            <h2 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-600" />
                                Değişim Geçmişi (Kur)
                            </h2>
                            <button
                                onClick={loadHistory}
                                className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                                title="Yenile"
                            >
                                <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''} `} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {loadingHistory ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-2">
                                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[10px] font-bold text-gray-400">YÜKLENİYOR...</p>
                                </div>
                            ) : rateHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 text-center">
                                    <Clock className="w-10 h-10 mb-2 opacity-20" />
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider">Geçmiş Bulunamadı</h3>
                                    <p className="text-[10px] mt-1">Özel kur değişikliği yapıldığında burada listelenecektir.</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-2xl mx-auto">
                                    {rateHistory.map((item, idx) => (
                                        <div key={item.id} className="relative pl-8 pb-4">
                                            {/* Timeline Line */}
                                            {idx !== rateHistory.length - 1 && (
                                                <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-100"></div>
                                            )}
                                            
                                            {/* Timeline Dot */}
                                            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center z-10">
                                                <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                            </div>

                                            <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-3 hover:border-blue-200 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-blue-600 uppercase">KUR GÜNCELLEMESİ</span>
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(item.change_date).toLocaleString('tr-TR')}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1">
                                                        <span className="text-[9px] text-gray-400 block uppercase font-bold">Eski Kur</span>
                                                        <span className="text-sm font-mono font-bold text-gray-500 line-through">
                                                            {parseFloat(item.old_rate || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    
                                                    <ArrowRightLeft className="w-4 h-4 text-gray-300" />

                                                    <div className="flex-1">
                                                        <span className="text-[9px] text-gray-400 block uppercase font-bold">Yeni Kur</span>
                                                        <span className="text-sm font-mono font-bold text-green-600">
                                                            {parseFloat(item.new_rate || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                                                        <Info className="w-2 h-2 text-gray-500" />
                                                    </div>
                                                    <span className="text-[10px] text-gray-500 font-medium">
                                                        Düzenleyen: <span className="font-bold text-gray-700">{item.changed_by || 'Sistem'}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 animate-pulse">
                        <Settings className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Yakında Eklenecek</p>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-[25200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-gray-900/50 backdrop-blur-lg"
                onClick={onClose}
            />

            {/* Modal Container - Full Width Content Only */}
            <div className={`relative w-full max-w-6xl h-[85vh] bg-white/95 backdrop-blur-lg rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 select-none`}>
                {/* Header with Product Info */}
                <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="font-bold text-lg truncate" title={product.name}>{product.name}</h2>
                            <div className="flex items-center gap-3 text-blue-100">
                                <p className="text-xs font-mono font-bold">{product.code}</p>
                                <span className="text-xs">•</span>
                                <p className="text-xs font-bold">{tabs.find(t => t.id === activeTab)?.label}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        title={tm('close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div
                    className={`flex-1 min-h-0 bg-gray-50/30 ${
                        activeTab === 'movements' ? 'overflow-hidden' : 'overflow-y-auto'
                    }`}
                >
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

