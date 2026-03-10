/**
 * WMS Stock Count Module - Stok Sayım Yönetimi
 * Full inventory counting workflow: Orders → Entry → Reconciliation
 * Design inspired by ExWhms modern UI patterns
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, Plus, Scan, Package, CheckCircle, AlertCircle,
    Minus, Check, X, ClipboardList, MapPin, User, RefreshCw,
    Warehouse, Calendar, Loader2, Trash2, Eye,
    CheckCircle2, XCircle, FileText, Camera
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
    const [currentItem, setCurrentItem] = useState<any>(null);
    const [quantity, setQuantity] = useState(0);
    const [countedBy, setCountedBy] = useState(() => localStorage.getItem('wms_counter_name') || '');
    const [locationCode, setLocationCode] = useState(slip.location_code || '');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [activeSection, setActiveSection] = useState<'scan' | 'list'>('scan');
    const [showCamera, setShowCamera] = useState(false);
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
    }, [activeSection, currentItem]);

    const loadLines = async () => {
        try {
            const { lines: l } = await wmsStockCount.getSlipWithLines(slip.id);
            setLines(l);
        } catch (err) {
            console.error(err);
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

    const handleBarcodeScanned = useCallback(async (barcode: string) => {
        if (!barcode.trim()) return;
        setLoading(true);
        try {
            const product = await wmsStockCount.lookupProductByBarcode(barcode.trim());
            if (product) {
                const stock = await wmsStockCount.getProductStock(product.id);
                setCurrentItem({
                    product_id: product.id,
                    barcode: product.barcode || barcode,
                    product_name: product.name,
                    system_qty: stock,
                    location: locationCode || 'Genel',
                });
                setQuantity(0);
                beep(true);
                if (navigator.vibrate) navigator.vibrate(100);
            } else {
                // Unknown barcode - still allow manual count
                setCurrentItem({
                    product_id: null,
                    barcode: barcode.trim(),
                    product_name: `${tm('unknownBarcode')}: ${barcode}`,
                    system_qty: 0,
                    location: locationCode || 'Genel',
                });
                setQuantity(0);
                beep(false);
            }
        } catch (err) {
            console.error(err);
            beep(false);
        } finally {
            setLoading(false);
        }
    }, [locationCode]);

    const handleSaveLine = async () => {
        if (!currentItem) return;
        setSaving(true);
        try {
            await wmsStockCount.upsertLine(slip.id, {
                product_id: currentItem.product_id,
                barcode: currentItem.barcode,
                product_name: currentItem.product_name,
                location_code: locationCode || undefined,
                expected_qty: currentItem.system_qty,
                counted_qty: quantity,
                counted_by: countedBy || tm('counter'),
            });
            if (countedBy) localStorage.setItem('wms_counter_name', countedBy);
            await loadLines();
            setCurrentItem(null);
            setScannedBarcode('');
            setQuantity(0);
            setShowSuccess(true);
            beep(true);
            if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
            setTimeout(() => setShowSuccess(false), 1800);
        } catch (err) {
            console.error(err);
            alert(tm('lineSaveFailed'));
        } finally {
            setSaving(false);
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
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
    const variance = currentItem ? quantity - currentItem.system_qty : 0;

    return (
        <div className={`min-h-screen ${bgClass} flex flex-col`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">{tm('countEntryTitle')}</h1>
                        <p className="text-xs text-blue-100">{slip.fiche_no} — <CountTypeLabel type={slip.count_type} /></p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">{lines.length} {tm('itemsUnit')}</span>
                        {lines.length > 0 && (
                            <button
                                onClick={handleFinishCounting}
                                className="bg-green-500 hover:bg-green-400 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1"
                            >
                                <CheckCircle2 className="w-4 h-4" /> {tm('finishBtn')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-3">
                    {[
                        { id: 'scan', labelKey: 'barcodeInput', icon: <Scan className="w-4 h-4" /> },
                        { id: 'list', labelKey: 'listView', icon: <ClipboardList className="w-4 h-4" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSection(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === tab.id
                                ? 'bg-white text-blue-700'
                                : 'text-white/70 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            {tab.icon} {tab.id === 'list' ? `${tm(tab.labelKey)} (${lines.length})` : tm(tab.labelKey)}
                        </button>
                    ))}
                </div>
            </div>

            {activeSection === 'scan' ? (
                <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                    {/* Counter Info */}
                    {!currentItem && (
                        <div className={`${cardClass} border rounded-xl p-4 flex items-center gap-3`}>
                            <User className="w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={countedBy}
                                onChange={e => setCountedBy(e.target.value)}
                                placeholder={tm('counterPlaceholder')}
                                className={`flex-1 bg-transparent focus:outline-none text-sm ${textClass}`}
                            />
                        </div>
                    )}

                    {/* Location (for location count type) */}
                    {slip.count_type === 'location' && !currentItem && (
                        <div className={`${cardClass} border rounded-xl p-4 flex items-center gap-3`}>
                            <MapPin className="w-5 h-5 text-purple-500" />
                            <input
                                type="text"
                                value={locationCode}
                                onChange={e => setLocationCode(e.target.value.toUpperCase())}
                                placeholder={tm('locationPlaceholder')}
                                className={`flex-1 bg-transparent focus:outline-none text-sm font-mono uppercase ${textClass}`}
                            />
                        </div>
                    )}

                    {/* Scan Area */}
                    {!currentItem ? (
                        <div className={`${cardClass} border-2 border-dashed border-blue-300 rounded-2xl p-8 text-center`}>
                            <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                {loading
                                    ? <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                                    : <Scan className="w-10 h-10 text-blue-600" />
                                }
                            </div>
                            <h3 className={`text-lg font-bold ${textClass} mb-2`}>{tm('scanProductBarcode')}</h3>
                            <p className="text-sm text-gray-500 mb-4">{tm('manualEntry')}</p>
                            <div className="flex gap-2 mb-3">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={scannedBarcode}
                                    onChange={e => setScannedBarcode(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && scannedBarcode.trim()) {
                                            handleBarcodeScanned(scannedBarcode);
                                            setScannedBarcode('');
                                        }
                                    }}
                                    placeholder={tm('scannerPlaceholder')}
                                    className={`flex-1 px-4 py-3 border-2 rounded-xl text-center font-mono text-lg focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                                        }`}
                                    autoFocus
                                />
                                <button
                                    onClick={() => setShowCamera(true)}
                                    className="px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md flex items-center justify-center group"
                                    title={tm('cameraScan')}
                                >
                                    <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    const bc = prompt(`${tm('barcodeInput')}:`);
                                    if (bc) handleBarcodeScanned(bc);
                                }}
                                className="w-full py-2 border-2 border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                            >
                                {tm('manualEntry')}
                            </button>
                        </div>
                    ) : (
                        /* Product Count Card */
                        <div className={`${cardClass} border rounded-2xl p-5 shadow-lg`}>
                            {/* Product Info */}
                            <div className="text-center mb-5">
                                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Package className="w-7 h-7 text-blue-600" />
                                </div>
                                <h3 className={`text-lg font-bold ${textClass} leading-tight`}>{currentItem.product_name}</h3>
                                <p className="text-sm text-gray-500 font-mono mt-1">{currentItem.barcode}</p>
                                {locationCode && (
                                    <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" />{locationCode}
                                    </p>
                                )}
                            </div>

                            {/* System vs Counted */}
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <div className="p-3 bg-blue-50 rounded-xl text-center">
                                    <div className="text-xs text-gray-500 mb-1">{tm('systemStock')}</div>
                                    <div className="text-2xl font-bold text-blue-600">{currentItem.system_qty}</div>
                                </div>
                                <div className="p-3 bg-purple-50 rounded-xl text-center">
                                    <div className="text-xs text-gray-500 mb-1">{tm('countedQty')}</div>
                                    <div className="text-2xl font-bold text-purple-600">{quantity}</div>
                                </div>
                            </div>

                            {/* Variance Warning */}
                            {quantity > 0 && variance !== 0 && (
                                <div className={`p-3 rounded-xl mb-4 flex items-center justify-center gap-2 ${Math.abs(variance) > 5
                                    ? 'bg-red-50 border border-red-200'
                                    : 'bg-yellow-50 border border-yellow-200'
                                    }`}>
                                    <AlertCircle className={`w-4 h-4 ${Math.abs(variance) > 5 ? 'text-red-600' : 'text-yellow-600'}`} />
                                    <span className={`font-bold ${Math.abs(variance) > 5 ? 'text-red-700' : 'text-yellow-700'}`}>
                                        {tm('varianceLabel')}: {variance > 0 ? '+' : ''}{variance}
                                    </span>
                                </div>
                            )}
                            {quantity > 0 && variance === 0 && (
                                <div className="p-3 rounded-xl mb-4 bg-green-50 border border-green-200 flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    <span className="font-bold text-green-700">{tm('matchesSystem')}</span>
                                </div>
                            )}

                            {/* Quantity Controls */}
                            <div className="mb-5">
                                <label className={`block text-sm font-medium mb-2 ${textClass}`}>{tm('countedQuantity')}</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setQuantity(Math.max(0, quantity - 1))}
                                        className="w-14 h-14 bg-red-500 text-white rounded-xl flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all"
                                    >
                                        <Minus className="w-6 h-6" />
                                    </button>
                                    <input
                                        type="number"
                                        value={quantity}
                                        onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                                        className={`flex-1 py-3 text-3xl font-bold border-2 rounded-xl text-center focus:outline-none focus:border-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                                            }`}
                                    />
                                    <button
                                        onClick={() => setQuantity(quantity + 1)}
                                        className="w-14 h-14 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 active:scale-95 transition-all"
                                    >
                                        <Plus className="w-6 h-6" />
                                    </button>
                                </div>

                                {/* Quick set */}
                                <div className="grid grid-cols-5 gap-2 mt-3">
                                    {[0, 10, 25, 50, 100].map(q => (
                                        <button
                                            key={q}
                                            onClick={() => setQuantity(q)}
                                            className={`py-2 rounded-lg text-sm font-medium transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                }`}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setQuantity(currentItem.system_qty)}
                                    className="w-full mt-2 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                                >
                                    {tm('useSystemStock')} ({currentItem.system_qty})
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setCurrentItem(null); setScannedBarcode(''); setQuantity(0); }}
                                    className={`flex-1 py-3 border-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <X className="w-5 h-5" /> {tm('cancelBtn')}
                                </button>
                                <button
                                    onClick={handleSaveLine}
                                    disabled={saving}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-70"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    {saving ? tm('savingLabel') : tm('saveLabel')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Recent items mini-list */}
                    {lines.length > 0 && !currentItem && (
                        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <h4 className={`text-sm font-bold ${textClass}`}>{tm('recentCounted')}</h4>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {lines.slice(0, 5).map(line => (
                                    <div key={line.id} className={`px-4 py-3 flex items-center gap-3 border-l-4 ${line.variance === 0 ? 'border-green-500' : Math.abs(line.variance || 0) > 5 ? 'border-red-500' : 'border-yellow-500'}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate ${textClass}`}>{line.product_name || line.barcode}</div>
                                            <div className="text-xs text-gray-500 font-mono">{line.barcode}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-blue-600">{line.counted_qty}</div>
                                            {line.variance !== 0 && (
                                                <div className={`text-xs font-bold ${Math.abs(line.variance || 0) > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                                                    {(line.variance || 0) > 0 ? '+' : ''}{line.variance}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Full List View */
                <div className="flex-1 overflow-y-auto">
                    {lines.length === 0 ? (
                        <div className="p-12 text-center">
                            <Scan className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">{tm('noCountYet')}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {lines.map(line => (
                                <div key={line.id} className={`px-4 py-4 flex items-center gap-3 border-l-4 ${line.variance === 0 ? 'border-green-500' : Math.abs(line.variance || 0) > 5 ? 'border-red-500' : 'border-yellow-500'} ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-semibold truncate ${textClass}`}>{line.product_name || line.barcode}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{line.barcode}</div>
                                        {line.location_code && (
                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <MapPin className="w-3 h-3" />{line.location_code}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-gray-400 mb-0.5">Sys / {tm('countedQty')}</div>
                                        <div className="text-sm">
                                            <span className="text-gray-500">{line.expected_qty}</span>
                                            <span className="text-gray-400"> / </span>
                                            <span className="font-bold text-blue-600">{line.counted_qty}</span>
                                        </div>
                                        {line.variance !== 0 && (
                                            <div className={`text-xs font-bold mt-0.5 ${Math.abs(line.variance || 0) > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                                                {(line.variance || 0) > 0 ? '+' : ''}{line.variance}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteLine(line.id)}
                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
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

            {/* Success Toast */}
            {showSuccess && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-50 animate-bounce">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">{tm('countSaved')}</span>
                </div>
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
            await wmsStockCount.completeReconciliation(slip.id);
            onComplete();
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
                        {/* Summary Cards */}
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
                                <div className="text-2xl font-bold text-red-600">{summary.total_variance.toFixed(1)}</div>
                            </div>
                        </div>

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
                                                        </span>
                                                    </div>
                                                    {hasVariance && (
                                                        <div className={`text-xs font-bold mt-0.5 ${Math.abs(v) > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                                                            {v > 0 ? '+' : ''}{v}
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


