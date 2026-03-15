/**
 * WMS Stock Count Module - Stok Sayım Yönetimi
 * Full inventory counting workflow: Orders → Entry → Reconciliation
 * Design inspired by ExWhms modern UI patterns
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Plus, Scan, Package,
    Minus, ClipboardList, MapPin, User, RefreshCw,
    Warehouse, Calendar, Loader2, Trash2, Eye,
    CheckCircle2, XCircle, FileText, Camera, BarChart3, AlertTriangle
} from 'lucide-react';
import { wmsStockCount, CountingSlip, CountingLine } from '../../../services/wmsStockCount';
import { useLanguage } from '../../../contexts/LanguageContext';
import { BarcodeScanner } from '../../inventory/stock/BarcodeScanner';

interface StockCountModuleProps {
    darkMode: boolean;
    onBack: () => void;
}

type View = 'orders' | 'create' | 'entry' | 'reconciliation';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { tmKey: string; color: string }> = {
    draft: { tmKey: 'statusDraft', color: 'bg-gray-100 text-gray-700' },
    active: { tmKey: 'statusActive', color: 'bg-blue-100 text-blue-700' },
    counting: { tmKey: 'statusCounting', color: 'bg-yellow-100 text-yellow-700' },
    reconciliation: { tmKey: 'statusReconciliation', color: 'bg-purple-100 text-purple-700' },
    completed: { tmKey: 'statusCompleted', color: 'bg-green-100 text-green-700' },
    cancelled: { tmKey: 'statusCancelled', color: 'bg-red-100 text-red-700' },
};

const COUNT_TYPE_KEYS: Record<string, string> = {
    full: 'countTypeFull',
    cycle: 'countTypeCycle',
    location: 'countTypeLocation',
};

function StatusBadge({ status }: { status: CountingSlip['status'] }) {
    const { tm } = useLanguage();
    const s = STATUS_STYLE[status] || { tmKey: status, color: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{tm(s.tmKey)}</span>;
}

function CountTypeLabel({ type }: { type: string }) {
    const { tm } = useLanguage();
    return <>{tm(COUNT_TYPE_KEYS[type] || type)}</>;
}

// ─── Create Slip View ─────────────────────────────────────────────────────────

function CreateSlipView({ darkMode, onBack, onCreated }: {
    darkMode: boolean;
    onBack: () => void;
    onCreated: (slip: CountingSlip) => void;
}) {
    const [countType, setCountType] = useState<'full' | 'cycle' | 'location'>('full');
    const [locationCode, setLocationCode] = useState('');
    const [description, setDescription] = useState('');
    const [stores, setStores] = useState<{ id: string; name: string; code: string }[]>([]);
    const [selectedStore, setSelectedStore] = useState('');
    const { tm } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [loadingStores, setLoadingStores] = useState(true);

    useEffect(() => {
        wmsStockCount.getStores().then(s => {
            setStores(s);
            if (s.length > 0) setSelectedStore(s[0].id);
        }).finally(() => setLoadingStores(false));
    }, []);

    const handleCreate = async () => {
        if (!selectedStore) return;
        setLoading(true);
        try {
            const slip = await wmsStockCount.createSlip({
                store_id: selectedStore,
                count_type: countType,
                location_code: countType === 'location' ? locationCode : undefined,
                description,
            });
            onCreated(slip);
        } catch (err: any) {
            console.error('Create slip error:', err);
            const msg = err?.message || String(err);
            alert(`Sayım fişi oluşturulamadı.\n\n${msg}\n\nUygulama Tauri modunda çalışıyor mu?`);
        } finally {
            setLoading(false);
        }
    };

    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

    return (
        <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold">{tm('newCountSlip')}</h1>
                        <p className="text-xs text-blue-100">{tm('newCountSlipDesc')}</p>
                    </div>
                </div>
            </div>

            <div className="p-6 max-w-xl mx-auto space-y-6">
                {/* Count Type */}
                <div className={`${cardClass} border rounded-xl p-5`}>
                    <h3 className={`font-bold ${textClass} mb-4 flex items-center gap-2`}>
                        <ClipboardList className="w-5 h-5 text-blue-600" /> {tm('countTypeLabel')}
                    </h3>
                    <div className="space-y-3">
                        {[
                            { val: 'full', icon: <Package className="w-6 h-6 text-blue-600" />, labelKey: 'countTypeFull', descKey: 'countTypeFullDesc' },
                            { val: 'cycle', icon: <RefreshCw className="w-6 h-6 text-green-600" />, labelKey: 'countTypeCycle', descKey: 'countTypeCycleDesc' },
                            { val: 'location', icon: <MapPin className="w-6 h-6 text-purple-600" />, labelKey: 'countTypeLocation', descKey: 'countTypeLocationDesc' },
                        ].map(opt => (
                            <button
                                key={opt.val}
                                onClick={() => setCountType(opt.val as any)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${countType === opt.val
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                                    {opt.icon}
                                </div>
                                <div className="text-left">
                                    <div className={`font-bold ${textClass}`}>{tm(opt.labelKey)}</div>
                                    <div className="text-sm text-gray-500">{tm(opt.descKey)}</div>
                                </div>
                                {countType === opt.val && (
                                    <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Store Selection */}
                <div className={`${cardClass} border rounded-xl p-5`}>
                    <h3 className={`font-bold ${textClass} mb-4 flex items-center gap-2`}>
                        <Warehouse className="w-5 h-5 text-blue-600" /> {tm('warehouseStore')}
                    </h3>
                    {loadingStores ? (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> {tm('loading')}
                        </div>
                    ) : stores.length === 0 ? (
                        <p className="text-sm text-red-500">{tm('noStoresDefined')}</p>
                    ) : (
                        <select
                            value={selectedStore}
                            onChange={e => setSelectedStore(e.target.value)}
                            className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 bg-white text-gray-900'
                                }`}
                        >
                            {stores.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Location Code (if location type) */}
                {countType === 'location' && (
                    <div className={`${cardClass} border rounded-xl p-5`}>
                        <h3 className={`font-bold ${textClass} mb-3 flex items-center gap-2`}>
                            <MapPin className="w-5 h-5 text-purple-600" /> {tm('locationCodeLabel')}
                        </h3>
                        <input
                            type="text"
                            value={locationCode}
                            onChange={e => setLocationCode(e.target.value.toUpperCase())}
                            placeholder={tm('locationPlaceholder')}
                            className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none focus:border-purple-500 font-mono uppercase ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 bg-white'
                                }`}
                        />
                    </div>
                )}

                {/* Description */}
                <div className={`${cardClass} border rounded-xl p-5`}>
                    <h3 className={`font-bold ${textClass} mb-3 flex items-center gap-2`}>
                        <FileText className="w-5 h-5 text-gray-500" /> {tm('descriptionOptionalLabel')}
                    </h3>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder={tm('countDescPlaceholder')}
                        rows={3}
                        className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none focus:border-blue-500 resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 bg-white'
                            }`}
                    />
                </div>

                {/* Create Button */}
                <button
                    onClick={handleCreate}
                    disabled={loading || !selectedStore}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {loading ? tm('creating') : tm('createCountSlip')}
                </button>
            </div>
        </div>
    );
}

// ─── New Product Modal ────────────────────────────────────────────────────────

function NewProductModal({ darkMode, barcode, lineId, onCreated, onClose }: {
    darkMode: boolean;
    barcode: string;
    lineId: string;
    onCreated: () => void;
    onClose: () => void;
}) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [unit, setUnit] = useState('Adet');
    const [purchasePrice, setPurchasePrice] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!name.trim()) { setError('Ürün adı zorunlu'); return; }
        setSaving(true);
        try {
            const productId = await wmsStockCount.createProductFromBarcode({
                name: name.trim(),
                code: code.trim() || barcode,
                barcode,
                unit,
                purchase_price: parseFloat(purchasePrice) || 0,
                sale_price: parseFloat(salePrice) || 0,
            });
            if (!productId) throw new Error('Ürün oluşturulamadı');
            await wmsStockCount.updateLineProduct(lineId, productId, name.trim());
            onCreated();
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setSaving(false);
        }
    };

    const bg = darkMode ? 'bg-gray-900' : 'bg-white';
    const inp = darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900';

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
            <div className={`${bg} w-full rounded-t-2xl shadow-2xl`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <p className="text-xs text-gray-400 font-mono">{barcode}</p>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">Malzeme Kartı Oluştur</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <Package className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ürün Adı *</label>
                        <input autoFocus value={name} onChange={e => setName(e.target.value)}
                            className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inp}`}
                            placeholder="Ürün adını girin" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ürün Kodu</label>
                            <input value={code} onChange={e => setCode(e.target.value)}
                                className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inp}`}
                                placeholder={barcode} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Birim</label>
                            <select value={unit} onChange={e => setUnit(e.target.value)}
                                className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none ${inp}`}>
                                {['Adet', 'Kg', 'Lt', 'g', 'm', 'm²', 'm³', 'Koli', 'Palet', 'Paket'].map(u => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alış Fiyatı</label>
                            <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                                className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inp}`}
                                placeholder="0.00" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Satış Fiyatı</label>
                            <input type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)}
                                className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 ${inp}`}
                                placeholder="0.00" />
                        </div>
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button onClick={handleSave} disabled={saving}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-70">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {saving ? 'Kaydediliyor...' : 'Malzeme Kartı Oluştur'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Count Entry View ─────────────────────────────────────────────────────────

function CountEntryView({ darkMode, slip, onBack, onDone }: {
    darkMode: boolean;
    slip: CountingSlip;
    onBack: () => void;
    onDone: () => void;
}) {
    const { tm } = useLanguage();
    const [lines, setLines] = useState<CountingLine[]>([]);
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [scanQty, setScanQty] = useState('1');
    const [editingLine, setEditingLine] = useState<{ id: string; qty: number } | null>(null);
    const [flashLineId, setFlashLineId] = useState<string | null>(null);
    const [countedBy, setCountedBy] = useState(() => localStorage.getItem('wms_counter_name') || '');
    const [locationCode, setLocationCode] = useState(slip.location_code || '');
    const [loading, setLoading] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'scan' | 'list' | 'unknown'>('scan');
    const [showCamera, setShowCamera] = useState(false);
    const [prices, setPrices] = useState<Record<string, { purchase: number; sale: number }>>({});
    const [newProductLine, setNewProductLine] = useState<CountingLine | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadLines();
        // Mark slip as counting
        if (slip.status === 'draft' || slip.status === 'active') {
            wmsStockCount.updateSlipStatus(slip.id, 'counting').catch(console.error);
        }
    }, [slip.id]);

    useEffect(() => {
        if (inputRef.current && activeSection === 'scan') {
            inputRef.current.focus();
        }
    }, [activeSection]);

    const loadLines = async () => {
        try {
            const { lines: l } = await wmsStockCount.getSlipWithLines(slip.id);
            console.log('[loadLines] fetched', l.length, 'lines for slip', slip.id);
            setLines(l);
            // Fetch prices for known products
            const knownIds = [...new Set(l.filter(x => x.product_id).map(x => x.product_id!))];
            if (knownIds.length > 0) {
                const p = await wmsStockCount.getLinesPrices(knownIds);
                setPrices(p);
            }
        } catch (err) {
            console.error('[loadLines] ERROR:', err);
        }
    };

    const beep = (success = true) => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = success ? 1000 : 400;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.12);
        } catch { }
    };

    const handleBarcodeScanned = async (barcode: string, overrideQty?: number) => {
        if (!barcode.trim()) return;
        const qty = overrideQty ?? Math.max(1, parseInt(scanQty) || 1);
        console.log('[SCAN] start barcode=', barcode, 'qty=', qty, 'slip=', slip.id);
        setLoading(true);
        try {
            const existing = await wmsStockCount.getLineByBarcode(slip.id, barcode.trim());
            console.log('[SCAN] existing:', existing);

            if (existing) {
                // If line exists but has no product (was previously unknown), try lookup again
                let productId = existing.product_id;
                let productName = existing.product_name;
                let unit = existing.unit || 'Adet';
                let unitMultiplier = existing.unit_multiplier || 1;

                if (!productId) {
                    const found = await wmsStockCount.lookupProductByBarcode(barcode.trim());
                    console.log('[SCAN] re-lookup for existing unknown line:', found);
                    if (found) {
                        productId = found.id;
                        productName = found.name;
                        unit = found.unit || 'Adet';
                        unitMultiplier = found.unit_multiplier || 1;
                    }
                }

                const newQty = (existing.counted_qty || 0) + qty;
                await wmsStockCount.upsertLine(slip.id, {
                    product_id: productId,
                    barcode: existing.barcode,
                    product_name: productName,
                    location_code: locationCode || undefined,
                    expected_qty: existing.expected_qty,
                    counted_qty: newQty,
                    counted_by: countedBy || 'Sayıcı',
                    unit,
                    unit_multiplier: unitMultiplier,
                    base_counted_qty: newQty * unitMultiplier,
                });
                setFlashLineId(existing.id);
                setTimeout(() => setFlashLineId(null), 700);
                beep(true);
            } else {
                const product = await wmsStockCount.lookupProductByBarcode(barcode.trim());
                console.log('[SCAN] product=', product);
                const stock = product ? await wmsStockCount.getProductStock(product.id) : 0;
                const unitMultiplier = product?.unit_multiplier || 1;
                const result = await wmsStockCount.upsertLine(slip.id, {
                    product_id: product?.id || null,
                    barcode: product?.barcode || barcode.trim(),
                    product_name: product?.name || `? ${barcode}`,
                    location_code: locationCode || undefined,
                    expected_qty: stock,
                    counted_qty: qty,
                    counted_by: countedBy || 'Sayıcı',
                    unit: product?.unit || 'Adet',
                    unit_multiplier: unitMultiplier,
                    base_counted_qty: qty * unitMultiplier,
                });
                console.log('[SCAN] inserted:', result);
                beep(true);
            }
            if (countedBy) localStorage.setItem('wms_counter_name', countedBy);
            await loadLines();
            if (navigator.vibrate) navigator.vibrate(50);
            // Reset qty to 1 after scan
            setScanQty('1');
        } catch (err: any) {
            const msg = err?.message || String(err);
            console.error('[SCAN] ERROR:', msg, err);
            setScanError(msg);
            setTimeout(() => setScanError(null), 8000);
            beep(false);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const updateLineQty = async (line: CountingLine, newQty: number) => {
        if (newQty < 0) return;
        try {
            await wmsStockCount.upsertLine(slip.id, {
                product_id: line.product_id,
                barcode: line.barcode,
                product_name: line.product_name,
                location_code: line.location_code || undefined,
                expected_qty: line.expected_qty,
                counted_qty: newQty,
                counted_by: line.counted_by || countedBy || tm('counter'),
                unit: line.unit || 'Adet',
                unit_multiplier: line.unit_multiplier || 1,
                base_counted_qty: newQty * (line.unit_multiplier || 1),
            });
            await loadLines();
        } catch (err) {
            console.error(err);
        }
    };

    const handleFinishCounting = async () => {
        if (!confirm(`${lines.length} ${tm('itemsUnit')} ${tm('confirmFinalizeCount')}`)) return;
        await wmsStockCount.updateSlipStatus(slip.id, 'reconciliation');
        onDone();
    };

    const handleDeleteLine = async (lineId: string) => {
        if (!confirm(tm('confirmDeleteCountLine'))) return;
        await wmsStockCount.deleteLine(lineId);
        await loadLines();
    };

    const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
    const rowBg = darkMode ? 'bg-gray-800' : 'bg-white';
    const dividerClass = darkMode ? 'divide-gray-700' : 'divide-gray-100';
    const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';

    // Split known vs unknown
    const knownLines = lines.filter(l => l.product_id);
    const unknownLines = lines.filter(l => !l.product_id);
    // Newest first for scan tab — ALL lines (known + unknown)
    const sortedLines = [...lines].reverse();

    // Footer totals
    const totalAdet = lines.reduce((s, l) => s + (l.base_counted_qty ?? l.counted_qty ?? 0), 0);
    const totalAlisValue = lines.reduce((s, l) => {
        const p = l.product_id ? prices[l.product_id] : undefined;
        return s + (l.base_counted_qty ?? l.counted_qty ?? 0) * (p?.purchase || 0);
    }, 0);
    const totalSatisValue = lines.reduce((s, l) => {
        const p = l.product_id ? prices[l.product_id] : undefined;
        return s + (l.base_counted_qty ?? l.counted_qty ?? 0) * (p?.sale || 0);
    }, 0);
    const totalKar = totalSatisValue - totalAlisValue;
    const eksikAdet = lines.reduce((s, l) => {
        const vr = l.variance || 0;
        return s + (vr < 0 ? Math.abs(vr) : 0);
    }, 0);
    const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className={`h-full ${bgClass} flex flex-col overflow-hidden`}>
            {/* Header */}
            <div className="bg-blue-600 text-white px-4 pt-4 pb-2 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-bold leading-tight">{tm('countEntryTitle')}</h1>
                        <p className="text-xs text-blue-200 truncate">{slip.fiche_no} — <CountTypeLabel type={slip.count_type} /></p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold">{lines.length} {tm('itemsUnit')}</span>
                        {lines.length > 0 && (
                            <button
                                onClick={handleFinishCounting}
                                className="bg-green-500 hover:bg-green-400 active:scale-95 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> {tm('finishBtn')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 mt-2 border-t border-white/10">
                    {[
                        { id: 'scan', label: 'Barkod Okut', icon: <Scan className="w-3.5 h-3.5" />, count: null },
                        { id: 'list', label: 'Sayım', icon: <ClipboardList className="w-3.5 h-3.5" />, count: lines.length },
                        { id: 'unknown', label: 'Bilinmeyen', icon: <Package className="w-3.5 h-3.5" />, count: unknownLines.length },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSection(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${activeSection === tab.id
                                ? 'border-white text-white'
                                : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {tab.count !== null && tab.count > 0 && (
                                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab.id === 'unknown' ? 'bg-orange-500 text-white' : 'bg-white/20 text-white'}`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {activeSection === 'scan' ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* FLAT barcode bar — edge to edge, no radius */}
                    <div className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        {/* Main scan row */}
                        <div className={`flex items-stretch border-b ${borderClass}`}>
                            {/* Barcode input */}
                            <div className="relative flex-1">
                                {loading
                                    ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin pointer-events-none" />
                                    : <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                }
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={scannedBarcode}
                                    onChange={e => setScannedBarcode(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && scannedBarcode.trim()) {
                                            handleBarcodeScanned(scannedBarcode.trim());
                                            setScannedBarcode('');
                                        }
                                    }}
                                    placeholder="Barkod okutun veya yazın..."
                                    className={`w-full pl-9 pr-3 py-3 text-sm font-mono focus:outline-none ${darkMode ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-white text-gray-900 placeholder-gray-400'}`}
                                    autoFocus
                                />
                            </div>
                            {/* Qty separator + input */}
                            <div className={`flex items-center border-l ${borderClass} shrink-0`}>
                                <span className={`px-2 text-xs font-semibold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Adet</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={scanQty}
                                    onChange={e => setScanQty(e.target.value)}
                                    onFocus={e => e.target.select()}
                                    className={`w-14 py-3 text-center text-sm font-bold focus:outline-none ${darkMode ? 'bg-gray-800 text-blue-400' : 'bg-white text-blue-600'}`}
                                />
                            </div>
                            {/* Camera button */}
                            <button
                                onClick={() => setShowCamera(true)}
                                className={`px-3 border-l ${borderClass} flex items-center justify-center ${darkMode ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-900/60' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'} transition-colors`}
                            >
                                <Camera className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Sub-row: sayıcı + konum */}
                        <div className={`flex items-center gap-0 text-xs ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                            <div className={`flex items-center gap-1.5 flex-1 px-3 py-1.5 border-r ${borderClass}`}>
                                <User className="w-3 h-3 text-gray-400 shrink-0" />
                                <input type="text" value={countedBy} onChange={e => setCountedBy(e.target.value)}
                                    placeholder="Personel adı"
                                    className="flex-1 bg-transparent focus:outline-none text-xs text-gray-500 placeholder-gray-400" />
                            </div>
                            {slip.count_type === 'location' ? (
                                <div className="flex items-center gap-1.5 flex-1 px-3 py-1.5">
                                    <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                                    <input type="text" value={locationCode} onChange={e => setLocationCode(e.target.value.toUpperCase())}
                                        placeholder="Konum"
                                        className="flex-1 bg-transparent focus:outline-none text-xs font-mono uppercase text-gray-500 placeholder-gray-400" />
                                </div>
                            ) : (
                                <div className="px-3 py-1.5 text-gray-400">
                                    {lines.length > 0 ? `${lines.length} kalem` : 'Barkod okutun'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error banner */}
                    {scanError && (
                        <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 font-mono flex items-start gap-2">
                            <span className="shrink-0">⚠</span>
                            <span>{scanError}</span>
                        </div>
                    )}

                    {/* Scanned items list */}
                    <div className={`flex-1 overflow-y-auto divide-y ${dividerClass}`}>
                        {sortedLines.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                                <Scan className={`w-10 h-10 mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Ürün barkodunu okutun</p>
                            </div>
                        ) : (
                            sortedLines.map(line => {
                                const vr = line.variance || 0;
                                const isFlash = flashLineId === line.id;
                                const isEditing = editingLine?.id === line.id;
                                const linePrice = line.product_id ? prices[line.product_id] : undefined;
                                const baseQty = line.base_counted_qty ?? line.counted_qty ?? 0;
                                const alisVal = baseQty * (linePrice?.purchase || 0);
                                const satisVal = baseQty * (linePrice?.sale || 0);
                                return (
                                    <div
                                        key={line.id}
                                        className={`flex items-center gap-2 px-3 py-2 transition-colors ${rowBg} ${isFlash ? (darkMode ? '!bg-blue-900/40' : '!bg-blue-50') : ''}`}
                                    >
                                        {/* variance stripe */}
                                        <div className={`w-0.5 self-stretch rounded-full shrink-0 ${vr === 0 ? 'bg-green-400' : vr < 0 ? 'bg-red-400' : 'bg-yellow-400'}`} />

                                        {/* product info */}
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate leading-tight ${!line.product_id ? 'text-orange-500' : textClass}`}>
                                                {line.product_name || line.barcode}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-[11px] text-gray-400 font-mono">{line.barcode}</span>
                                                {!line.product_id && (
                                                    <span className="text-[11px] text-orange-400 font-semibold">Tanımsız</span>
                                                )}
                                                {line.unit && line.unit !== 'Adet' && (
                                                    <span className="text-[11px] text-purple-500 font-semibold">{line.unit}</span>
                                                )}
                                                {alisVal > 0 && (
                                                    <span className="text-[11px] text-gray-400">
                                                        A:{fmt(alisVal)} / S:{fmt(satisVal)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* qty controls */}
                                        <div className="flex flex-col items-center shrink-0">
                                            <div className="flex items-center gap-0.5">
                                                <button onClick={() => updateLineQty(line, (line.counted_qty || 0) - 1)}
                                                    className={`w-7 h-7 flex items-center justify-center text-gray-400 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded transition-colors`}>
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                {isEditing ? (
                                                    <input type="number" value={editingLine.qty}
                                                        onChange={e => setEditingLine({ id: line.id, qty: parseInt(e.target.value) || 0 })}
                                                        onBlur={() => { updateLineQty(line, editingLine.qty); setEditingLine(null); }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') { updateLineQty(line, editingLine.qty); setEditingLine(null); }
                                                            if (e.key === 'Escape') setEditingLine(null);
                                                        }}
                                                        className={`w-12 text-center text-sm font-bold border-b-2 border-blue-500 focus:outline-none ${darkMode ? 'bg-gray-700 text-white' : 'bg-white'}`}
                                                        autoFocus />
                                                ) : (
                                                    <button onClick={() => setEditingLine({ id: line.id, qty: line.counted_qty || 0 })}
                                                        className={`w-12 text-center text-sm font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                                        {line.counted_qty}
                                                    </button>
                                                )}
                                                <button onClick={() => updateLineQty(line, (line.counted_qty || 0) + 1)}
                                                    className={`w-7 h-7 flex items-center justify-center text-gray-400 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded transition-colors`}>
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            {(line.unit_multiplier || 1) > 1 && (
                                                <span className="text-[9px] text-orange-500 font-medium leading-none mt-0.5">
                                                    ={(line.counted_qty || 0) * (line.unit_multiplier || 1)} Adet
                                                </span>
                                            )}
                                        </div>
                                        <button onClick={() => handleDeleteLine(line.id)}
                                            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* ── STICKY FOOTER TOTALS ── */}
                    {lines.length > 0 && (
                        <div className={`shrink-0 border-t ${borderClass} ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            {/* Row 1: counts */}
                            <div className={`grid grid-cols-3 divide-x ${dividerClass} border-b ${borderClass}`}>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Kalem</div>
                                    <div className={`text-base font-black ${textClass}`}>{lines.length}</div>
                                </div>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Toplam Adet</div>
                                    <div className={`text-base font-black ${textClass}`}>{totalAdet}</div>
                                </div>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Sayım Eksiği</div>
                                    <div className={`text-base font-black ${eksikAdet > 0 ? 'text-red-500' : 'text-green-500'}`}>{eksikAdet > 0 ? `-${eksikAdet}` : '—'}</div>
                                </div>
                            </div>
                            {/* Row 2: values */}
                            <div className={`grid grid-cols-3 divide-x ${dividerClass}`}>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Alış Değeri</div>
                                    <div className={`text-sm font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>{fmt(totalAlisValue)} ₺</div>
                                </div>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Satış Değeri</div>
                                    <div className={`text-sm font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{fmt(totalSatisValue)} ₺</div>
                                </div>
                                <div className="py-2 text-center">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Kar</div>
                                    <div className={`text-sm font-bold ${totalKar >= 0 ? (darkMode ? 'text-green-400' : 'text-green-600') : 'text-red-500'}`}>
                                        {totalKar >= 0 ? '+' : ''}{fmt(totalKar)} ₺
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeSection === 'list' ? (
                /* Sayım Listesi tab — all items with prices */
                <div className={`flex-1 overflow-y-auto divide-y ${dividerClass}`}>
                    {lines.length === 0 ? (
                        <div className="p-12 text-center">
                            <Scan className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">{tm('noCountYet')}</p>
                        </div>
                    ) : (
                        lines.map(line => {
                            const vr = line.variance || 0;
                            const linePrice = line.product_id ? prices[line.product_id] : undefined;
                            const baseQty = line.base_counted_qty ?? line.counted_qty ?? 0;
                            const alisVal = baseQty * (linePrice?.purchase || 0);
                            const satisVal = baseQty * (linePrice?.sale || 0);
                            return (
                                <div key={line.id} className={`px-4 py-3 ${rowBg}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`w-1 mt-1 self-stretch rounded-full shrink-0 ${vr === 0 ? 'bg-green-400' : vr < 0 ? 'bg-red-400' : 'bg-yellow-400'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-semibold truncate ${textClass}`}>{line.product_name || line.barcode}</div>
                                            <div className="text-xs text-gray-400 font-mono">{line.barcode}</div>
                                            {line.location_code && (
                                                <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                                    <MapPin className="w-3 h-3" />{line.location_code}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs text-gray-400">Beklenen: {line.expected_qty}</div>
                                            <div className={`text-base font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                                {line.counted_qty}
                                                {line.unit && <span className="text-xs text-gray-400 ml-0.5">{line.unit}</span>}
                                            </div>
                                            {(line.unit_multiplier || 1) > 1 && (
                                                <div className="text-[10px] text-orange-500 font-medium">
                                                    ={(line.counted_qty || 0) * (line.unit_multiplier || 1)} Adet
                                                </div>
                                            )}
                                            {vr !== 0 && (
                                                <div className={`text-xs font-bold ${vr < 0 ? 'text-red-500' : 'text-yellow-500'}`}>{vr > 0 ? '+' : ''}{vr}</div>
                                            )}
                                        </div>
                                        <button onClick={() => handleDeleteLine(line.id)}
                                            className="p-1 text-gray-300 hover:text-red-500 mt-1 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {/* Price row */}
                                    {linePrice && (alisVal > 0 || satisVal > 0) && (
                                        <div className={`mt-1.5 ml-4 flex items-center gap-3 text-xs border-t pt-1.5 ${borderClass}`}>
                                            <span className={darkMode ? 'text-orange-400' : 'text-orange-600'}>
                                                Alış: {fmt(alisVal)} ₺
                                            </span>
                                            <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>
                                                Satış: {fmt(satisVal)} ₺
                                            </span>
                                            <span className={satisVal - alisVal >= 0 ? (darkMode ? 'text-green-400' : 'text-green-600') : 'text-red-500'}>
                                                Kar: {fmt(satisVal - alisVal)} ₺
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                /* Bilinmeyen tab */
                <div className={`flex-1 overflow-y-auto`}>
                    {unknownLines.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                            <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                            <p className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tüm barkodlar tanımlı</p>
                            <p className="text-xs text-gray-400 mt-1">Sistemde kayıtsız ürün yok</p>
                        </div>
                    ) : (
                        <div>
                            <div className={`px-4 py-2 border-b ${borderClass} ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                                <p className="text-xs text-orange-600 font-semibold">{unknownLines.length} adet sistemde kayıtlı olmayan barkod. Malzeme kartı oluşturarak sisteme ekleyebilirsiniz.</p>
                            </div>
                            <div className={`divide-y ${dividerClass}`}>
                                {unknownLines.map(line => (
                                    <div key={line.id} className={`flex items-center gap-3 px-4 py-3 ${rowBg}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-orange-500 font-bold uppercase tracking-wide">Tanımsız Barkod</div>
                                            <div className={`text-base font-mono font-bold mt-0.5 ${textClass}`}>{line.barcode}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                Sayılan: <span className="font-bold text-gray-600 dark:text-gray-300">{line.counted_qty} {line.unit || 'Adet'}</span>
                                                {line.counted_by && ` · ${line.counted_by}`}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setNewProductLine(line)}
                                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Kart Oluştur
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Camera Scanner Modal */}
            {showCamera && (
                <BarcodeScanner
                    onScan={(result) => {
                        handleBarcodeScanned(result.code);
                        setShowCamera(false);
                    }}
                    onClose={() => setShowCamera(false)}
                    continuous={false}
                />
            )}

            {/* New Product Modal */}
            {newProductLine && (
                <NewProductModal
                    darkMode={darkMode}
                    barcode={newProductLine.barcode || ''}
                    lineId={newProductLine.id}
                    onCreated={async () => {
                        setNewProductLine(null);
                        await loadLines();
                    }}
                    onClose={() => setNewProductLine(null)}
                />
            )}
        </div>
    );
}

// ─── Reconciliation View ──────────────────────────────────────────────────────

function ReconciliationView({ darkMode, slip, onBack, onComplete }: {
    darkMode: boolean;
    slip: CountingSlip;
    onBack: () => void;
    onComplete: () => void;
}) {
    const { tm } = useLanguage();
    const [lines, setLines] = useState<CountingLine[]>([]);
    const [summary, setSummary] = useState({ total_items: 0, items_with_variance: 0, total_variance: 0, accuracy_rate: 100 });
    const [loading, setLoading] = useState(true);
    const [completing, setCompleting] = useState(false);
    const [filter, setFilter] = useState<'all' | 'variance' | 'ok'>('all');

    useEffect(() => {
        loadData();
    }, [slip.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [{ lines: l }, s] = await Promise.all([
                wmsStockCount.getSlipWithLines(slip.id),
                wmsStockCount.getVarianceSummary(slip.id),
            ]);
            setLines(l);
            setSummary(s);
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        if (!confirm(tm('confirmCompleteCount'))) return;
        setCompleting(true);
        try {
            const result = await wmsStockCount.applyStockCount(slip.id);
            const parts: string[] = [`${result.processed} ürün işlendi`];
            if (result.surplus > 0) parts.push(`${result.surplus} fazla`);
            if (result.shortage > 0) parts.push(`${result.shortage} eksik`);
            alert(`Sayım tamamlandı. ${parts.join(', ')}.`);
            onComplete();
        } catch (err: any) {
            alert(`Sayım işleme hatası: ${err?.message || String(err)}`);
        } finally {
            setCompleting(false);
        }
    };

    const filteredLines = lines.filter(l => {
        if (filter === 'variance') return l.variance !== 0 && l.counted_qty !== undefined;
        if (filter === 'ok') return l.variance === 0;
        return true;
    });

    const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

    return (
        <div className={`min-h-screen ${bgClass}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">{tm('countReconciliation')}</h1>
                        <p className="text-xs text-purple-100">{slip.fiche_no}</p>
                    </div>
                    <button
                        onClick={handleComplete}
                        disabled={completing || loading}
                        className="bg-green-500 hover:bg-green-400 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 disabled:opacity-70"
                    >
                        {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {tm('confirmBtn')}
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                    </div>
                ) : (
                    <>
                        {/* Summary Cards — adet */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className={`${cardClass} border rounded-xl p-4 text-center`}>
                                <div className="text-xs text-gray-500 mb-1">{tm('totalProducts')}</div>
                                <div className="text-2xl font-bold text-purple-600">{summary.total_items}</div>
                            </div>
                            <div className={`${cardClass} border rounded-xl p-4 text-center`}>
                                <div className="text-xs text-gray-500 mb-1">{tm('accuracy')}</div>
                                <div className={`text-2xl font-bold ${summary.accuracy_rate >= 95 ? 'text-green-600' : summary.accuracy_rate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {summary.accuracy_rate}%
                                </div>
                            </div>
                            <div className={`${cardClass} border rounded-xl p-4 text-center`}>
                                <div className="text-xs text-gray-500 mb-1">{tm('variantItems')}</div>
                                <div className="text-2xl font-bold text-orange-600">{summary.items_with_variance}</div>
                            </div>
                            <div className={`${cardClass} border rounded-xl p-4 text-center`}>
                                <div className="text-xs text-gray-500 mb-1">{tm('absVariance')}</div>
                                <div className="text-sm font-bold">
                                    <span className="text-red-600">-{(summary.shortage_qty || 0).toFixed(0)}</span>
                                    <span className="text-gray-400 mx-1">/</span>
                                    <span className="text-green-600">+{(summary.surplus_qty || 0).toFixed(0)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Finansal Özet */}
                        {(summary.shortage_purchase_value > 0 || summary.surplus_purchase_value > 0) && (
                            <div className="grid grid-cols-3 gap-2">
                                <div className={`${cardClass} border rounded-xl p-3 text-center border-l-4 border-l-red-500`}>
                                    <div className="text-[10px] text-gray-500 mb-1">Eksik Maliyet</div>
                                    <div className="text-sm font-bold text-red-600">
                                        -{(summary.shortage_purchase_value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className="text-[10px] text-gray-400">Alış × Eksik</div>
                                </div>
                                <div className={`${cardClass} border rounded-xl p-3 text-center border-l-4 border-l-green-500`}>
                                    <div className="text-[10px] text-gray-500 mb-1">Fazla Maliyet</div>
                                    <div className="text-sm font-bold text-green-600">
                                        +{(summary.surplus_purchase_value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className="text-[10px] text-gray-400">Alış × Fazla</div>
                                </div>
                                <div className={`${cardClass} border rounded-xl p-3 text-center border-l-4 ${(summary.net_profit_impact || 0) >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                                    <div className="text-[10px] text-gray-500 mb-1">Net Etki</div>
                                    <div className={`text-sm font-bold ${(summary.net_profit_impact || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(summary.net_profit_impact || 0) >= 0 ? '+' : ''}{(summary.net_profit_impact || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className="text-[10px] text-gray-400">Fark (Maliyet)</div>
                                </div>
                            </div>
                        )}

                        {/* Accuracy Bar */}
                        <div className={`${cardClass} border rounded-xl p-4`}>
                            <div className="flex justify-between text-sm mb-2">
                                <span className={textClass}>{tm('accuracyRate')}</span>
                                <span className="font-bold text-green-600">{summary.accuracy_rate}%</span>
                            </div>
                            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${summary.accuracy_rate >= 95 ? 'bg-green-500' : summary.accuracy_rate >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${summary.accuracy_rate}%` }}
                                />
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className={`${cardClass} border rounded-xl p-1 flex gap-1`}>
                            {[
                                { id: 'all', label: `${tm('filterAll')} (${lines.length})` },
                                { id: 'variance', label: `${tm('variantItems')} (${summary.items_with_variance})` },
                                { id: 'ok', label: `${tm('matchedItems')} (${lines.length - summary.items_with_variance})` },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setFilter(tab.id as any)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${filter === tab.id
                                        ? 'bg-purple-600 text-white'
                                        : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Lines List */}
                        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
                            {filteredLines.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">{tm('noRecords')}</div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredLines.map(line => {
                                        const v = line.variance || 0;
                                        const hasVariance = v !== 0;
                                        return (
                                            <div key={line.id} className={`p-4 flex items-start gap-3 border-l-4 ${hasVariance ? Math.abs(v) > 5 ? 'border-red-500' : 'border-yellow-500' : 'border-green-500'}`}>
                                                <div className="mt-0.5">
                                                    {hasVariance
                                                        ? <AlertTriangle className={`w-5 h-5 ${Math.abs(v) > 5 ? 'text-red-500' : 'text-yellow-500'}`} />
                                                        : <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-semibold ${textClass} truncate`}>{line.product_name || line.barcode}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{line.barcode}</div>
                                                    {line.location_code && (
                                                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                            <MapPin className="w-3 h-3" />{line.location_code}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-xs text-gray-400 mb-1">Sys → {tm('countedQty')}</div>
                                                    <div className="text-sm font-medium">
                                                        <span className="text-gray-500">{line.expected_qty}</span>
                                                        <span className="text-gray-400 mx-1">→</span>
                                                        <span className={`font-bold ${hasVariance ? Math.abs(v) > 5 ? 'text-red-600' : 'text-yellow-600' : 'text-green-600'}`}>
                                                            {line.counted_qty ?? '—'}
                                                            {line.unit && line.unit !== 'Adet' && <span className="text-xs ml-0.5">{line.unit}</span>}
                                                        </span>
                                                    </div>
                                                    {hasVariance && (
                                                        <div className={`text-xs font-bold ${Math.abs(v) > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                                                            {v > 0 ? '+' : ''}{v}
                                                        </div>
                                                    )}
                                                    {/* Alış / Satış fiyatı */}
                                                    {(line.sale_price || 0) > 0 && (
                                                        <div className="text-[10px] text-gray-400 mt-0.5 space-y-0.5">
                                                            <div>Alış: {(line.purchase_price || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                                                            <div>Satış: {(line.sale_price || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                                                        </div>
                                                    )}
                                                    {/* Finansal etki */}
                                                    {hasVariance && (line.sale_price || 0) > 0 && (
                                                        <div className={`text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded ${v < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                            {v < 0 ? 'Kayıp' : 'Kazanç'}: {Math.abs(v * (line.purchase_price || line.sale_price || 0)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Orders List View ─────────────────────────────────────────────────────────

function OrdersView({ darkMode, onBack, onNewSlip, onEntry, onReconciliation }: {
    darkMode: boolean;
    onBack: () => void;
    onNewSlip: () => void;
    onEntry: (slip: CountingSlip) => void;
    onReconciliation: (slip: CountingSlip) => void;
}) {
    const { tm } = useLanguage();
    const [slips, setSlips] = useState<CountingSlip[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('');

    const loadSlips = useCallback(async () => {
        setLoading(true);
        try {
            const data = await wmsStockCount.getSlips(filterStatus || undefined);
            setSlips(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => { loadSlips(); }, [loadSlips]);

    const handleCancel = async (slip: CountingSlip) => {
        if (!confirm(`"${slip.fiche_no}" ${tm('confirmCancelCount')}`)) return;
        await wmsStockCount.cancelSlip(slip.id);
        loadSlips();
    };

    const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

    const stats = {
        draft: slips.filter(s => s.status === 'draft').length,
        active: slips.filter(s => s.status === 'active' || s.status === 'counting').length,
        reconciliation: slips.filter(s => s.status === 'reconciliation').length,
        completed: slips.filter(s => s.status === 'completed').length,
    };

    return (
        <div className={`min-h-screen ${bgClass}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">{tm('stockCountTitle')}</h1>
                        <p className="text-xs text-blue-100">{tm('stockCountSubtitle')}</p>
                    </div>
                    <button
                        onClick={onNewSlip}
                        className="bg-white text-blue-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 hover:bg-blue-50 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> {tm('newCount')}
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Stat Cards */}
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { lk: 'statusDraft', count: stats.draft, color: 'text-gray-600', bg: 'bg-gray-100' },
                        { lk: 'statusActive', count: stats.active, color: 'text-blue-600', bg: 'bg-blue-100' },
                        { lk: 'statusReconciliation', count: stats.reconciliation, color: 'text-purple-600', bg: 'bg-purple-100' },
                        { lk: 'statusCompleted', count: stats.completed, color: 'text-green-600', bg: 'bg-green-100' },
                    ].map(s => (
                        <div key={s.lk} className={`${cardClass} border rounded-xl p-3 text-center`}>
                            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{tm(s.lk)}</div>
                        </div>
                    ))}
                </div>

                {/* Filter */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {[
                        { val: '', lk: 'filterAll' },
                        { val: 'draft', lk: 'statusDraft' },
                        { val: 'counting', lk: 'statusCounting' },
                        { val: 'reconciliation', lk: 'statusReconciliation' },
                        { val: 'completed', lk: 'statusCompleted' },
                    ].map(f => (
                        <button
                            key={f.val}
                            onClick={() => setFilterStatus(f.val)}
                            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filterStatus === f.val
                                ? 'bg-blue-600 text-white'
                                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {tm(f.lk)}
                        </button>
                    ))}
                </div>

                {/* Slips List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                ) : slips.length === 0 ? (
                    <div className={`${cardClass} border rounded-2xl p-12 text-center`}>
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className={`${textClass} font-medium mb-1`}>{tm('noCountSlips')}</p>
                        <p className="text-sm text-gray-500 mb-4">{tm('startCountSession')}</p>
                        <button
                            onClick={onNewSlip}
                            className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                        >
                            {tm('createNewCount')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {slips.map(slip => (
                            <div key={slip.id} className={`${cardClass} border rounded-xl overflow-hidden shadow-sm`}>
                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-bold font-mono ${textClass}`}>{slip.fiche_no}</span>
                                                <StatusBadge status={slip.status} />
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(slip.date).toLocaleDateString('tr-TR')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Warehouse className="w-3 h-3" />
                                                    {slip.store_name || '—'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Package className="w-3 h-3" />
                                                    {slip.line_count} {tm('itemsUnit')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1 rounded-lg text-xs font-medium ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                            <CountTypeLabel type={slip.count_type} />
                                        </div>
                                    </div>

                                    {slip.description && (
                                        <p className="text-xs text-gray-500 mb-3">{slip.description}</p>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        {(slip.status === 'draft' || slip.status === 'active' || slip.status === 'counting') && (
                                            <button
                                                onClick={() => onEntry(slip)}
                                                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors"
                                            >
                                                <Scan className="w-4 h-4" /> {tm('countEntry')}
                                            </button>
                                        )}
                                        {slip.status === 'reconciliation' && (
                                            <button
                                                onClick={() => onReconciliation(slip)}
                                                className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-purple-700 transition-colors"
                                            >
                                                <BarChart3 className="w-4 h-4" /> {tm('countReconciliation')}
                                            </button>
                                        )}
                                        {slip.status === 'completed' && (
                                            <button
                                                onClick={() => onReconciliation(slip)}
                                                className="flex-1 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-gray-600 transition-colors"
                                            >
                                                <Eye className="w-4 h-4" /> {tm('viewLabel')}
                                            </button>
                                        )}
                                        {(slip.status === 'draft' || slip.status === 'active') && (
                                            <button
                                                onClick={() => handleCancel(slip)}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StockCountModule({ darkMode, onBack }: StockCountModuleProps) {
    const [view, setView] = useState<View>('orders');
    const [selectedSlip, setSelectedSlip] = useState<CountingSlip | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleCreated = (slip: CountingSlip) => {
        setSelectedSlip(slip);
        setView('entry');
    };

    const handleEntry = (slip: CountingSlip) => {
        setSelectedSlip(slip);
        setView('entry');
    };

    const handleReconciliation = (slip: CountingSlip) => {
        setSelectedSlip(slip);
        setView('reconciliation');
    };

    const backToOrders = () => {
        setView('orders');
        setSelectedSlip(null);
        setRefreshKey(k => k + 1);
    };

    switch (view) {
        case 'create':
            return (
                <CreateSlipView
                    darkMode={darkMode}
                    onBack={() => setView('orders')}
                    onCreated={handleCreated}
                />
            );
        case 'entry':
            return selectedSlip ? (
                <CountEntryView
                    darkMode={darkMode}
                    slip={selectedSlip}
                    onBack={backToOrders}
                    onDone={backToOrders}
                />
            ) : null;
        case 'reconciliation':
            return selectedSlip ? (
                <ReconciliationView
                    darkMode={darkMode}
                    slip={selectedSlip}
                    onBack={backToOrders}
                    onComplete={backToOrders}
                />
            ) : null;
        default:
            return (
                <OrdersView
                    key={refreshKey}
                    darkMode={darkMode}
                    onBack={onBack}
                    onNewSlip={() => setView('create')}
                    onEntry={handleEntry}
                    onReconciliation={handleReconciliation}
                />
            );
    }
}


