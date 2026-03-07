/**
 * WMS Dispatch / Mal Çıkış Modülü
 * Sevkiyat fişleri yönetimi - PostgreSQL tabanlı
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    WMSDispatchSlip, WMSDispatchLine,
    getDispatchSlips, createDispatchSlip, addDispatchLine,
    getDispatchLines, updateDispatchSlipStatus, deleteDispatchLine,
    getActiveStores, getProductByBarcode,
} from '../../../services/wmsService';
import { useLanguage } from '../../../contexts/LanguageContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'entry';

interface Props {
    darkMode?: boolean;
    onBack?: () => void;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { tmKey: string; color: string; bg: string }> = {
    draft:     { tmKey: 'statusDraft',     color: 'text-gray-600',  bg: 'bg-gray-100' },
    picking:   { tmKey: 'statusPicking',   color: 'text-blue-700',  bg: 'bg-blue-100' },
    packed:    { tmKey: 'statusPacked',    color: 'text-amber-700', bg: 'bg-amber-100' },
    shipped:   { tmKey: 'statusShipped',   color: 'text-green-700', bg: 'bg-green-100' },
    cancelled: { tmKey: 'statusCancelled', color: 'text-red-700',   bg: 'bg-red-100' },
};

const PRIORITY_STYLE: Record<string, { tmKey: string; color: string }> = {
    normal: { tmKey: 'priorityNormal', color: 'text-gray-600' },
    high:   { tmKey: 'priorityHigh',   color: 'text-orange-600' },
    urgent: { tmKey: 'priorityUrgent', color: 'text-red-600' },
};

function StatusBadge({ status }: { status: string }) {
    const { tm } = useLanguage();
    const s = STATUS_STYLE[status] || { tmKey: status, color: 'text-gray-600', bg: 'bg-gray-100' };
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.color}`}>
            {tm(s.tmKey)}
        </span>
    );
}

function PriorityBadge({ priority }: { priority?: string }) {
    const { tm } = useLanguage();
    if (!priority || priority === 'normal') return null;
    const p = PRIORITY_STYLE[priority] || { tmKey: priority, color: 'text-gray-600' };
    const icon = priority === 'urgent' ? '🔴' : '🟠';
    return <span className={`text-xs font-bold ${p.color}`}>{icon} {tm(p.tmKey)}</span>;
}

// ─── Beep helper ─────────────────────────────────────────────────────────────

function beep(success = true) {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = success ? 880 : 300;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.4));
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + (success ? 0.12 : 0.4));
    } catch {}
}

// ─── SlipsList View ───────────────────────────────────────────────────────────

function SlipsList({
    onNew,
    onOpen,
}: {
    onNew: () => void;
    onOpen: (slip: WMSDispatchSlip) => void;
}) {
    const { tm } = useLanguage();
    const [slips, setSlips] = useState<WMSDispatchSlip[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getDispatchSlips(filter === 'all' ? undefined : filter);
            setSlips(data);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const filtered = slips.filter(s =>
        !search ||
        s.slip_no.toLowerCase().includes(search.toLowerCase()) ||
        (s.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.store_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const filters = ['all', 'draft', 'picking', 'packed', 'shipped', 'cancelled'];

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-700 text-white px-4 py-4 shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">📦 {tm('dispatchTitle')}</h1>
                        <p className="text-orange-100 text-sm mt-0.5">{tm('dispatchSubtitle')}</p>
                    </div>
                    <button
                        onClick={onNew}
                        className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
                    >
                        <span className="text-lg">+</span> {tm('newSlip')}
                    </button>
                </div>

                {/* Search */}
                <div className="mt-3">
                    <input
                        type="search"
                        placeholder={tm('searchSlipCustomerStore')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-gray-800 text-sm placeholder-gray-400 bg-white/95 outline-none"
                    />
                </div>

                {/* Status filters */}
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                    {filters.map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                filter === f
                                    ? 'bg-white text-orange-700 shadow'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                        >
                            {f === 'all' ? tm('filterAll') : tm(STATUS_STYLE[f]?.tmKey || f)}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading ? (
                    <div className="text-center py-12 text-gray-400">
                        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        {tm('loading')}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <div className="text-5xl mb-3">📭</div>
                        <p className="font-medium">{tm('noSlipsFound')}</p>
                        <p className="text-sm mt-1">{tm('createNewDispatch')}</p>
                        <button
                            onClick={onNew}
                            className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
                        >
                            + {tm('createNewSlip')}
                        </button>
                    </div>
                ) : (
                    filtered.map(slip => (
                        <button
                            key={slip.id}
                            onClick={() => onOpen(slip)}
                            className="w-full bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left hover:shadow-md hover:border-orange-200 transition-all active:scale-[0.99]"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-gray-900 text-sm">{slip.slip_no}</span>
                                        <StatusBadge status={slip.status} />
                                        <PriorityBadge priority={slip.priority} />
                                    </div>
                                    {slip.customer_name && (
                                        <p className="text-sm text-gray-600 mt-0.5">👤 {slip.customer_name}</p>
                                    )}
                                    {slip.store_name && (
                                        <p className="text-xs text-gray-400 mt-0.5">🏪 {slip.store_name}</p>
                                    )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-xs text-gray-400">{new Date(slip.created_at).toLocaleDateString('tr-TR')}</p>
                                    {slip.item_count !== undefined && (
                                        <p className="text-xs font-semibold text-orange-600 mt-1">{slip.item_count} {tm('itemsUnit')}</p>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>

            {/* Refresh */}
            <div className="p-3 border-t border-gray-200 bg-white">
                <button
                    onClick={load}
                    className="w-full py-2.5 text-sm text-gray-500 hover:text-orange-600 font-medium transition-colors"
                >
                    ↻ {tm('refresh')}
                </button>
            </div>
        </div>
    );
}

// ─── CreateView ───────────────────────────────────────────────────────────────

function CreateView({
    onCreated,
    onBack,
}: {
    onCreated: (slip: WMSDispatchSlip) => void;
    onBack: () => void;
}) {
    const [stores, setStores] = useState<{ id: string; name: string; code: string }[]>([]);
    const [storeId, setStoreId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
    const [notes, setNotes] = useState('');
    const { tm } = useLanguage();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getActiveStores().then(s => {
            setStores(s);
            if (s.length === 1) setStoreId(s[0].id);
        });
    }, []);

    const handleCreate = async () => {
        if (!storeId) { setError(tm('pleaseSelectStore')); return; }
        setSaving(true); setError('');
        try {
            const slip = await createDispatchSlip({ store_id: storeId, customer_name: customerName, priority, notes });
            onCreated(slip);
        } catch (e) {
            setError(`Fiş oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
        } finally { setSaving(false); }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-700 text-white px-4 py-4 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-all">
                        ←
                    </button>
                    <div>
                        <h1 className="text-lg font-bold">{tm('newDispatchSlip')}</h1>
                        <p className="text-orange-100 text-xs">{tm('newDispatchSlipDesc')}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                        ⚠️ {error}
                    </div>
                )}

                {/* Mağaza */}
                <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                    <h2 className="font-semibold text-gray-800">📋 {tm('slipInfo')}</h2>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">{tm('storeRequired')} *</label>
                        <select
                            value={storeId}
                            onChange={e => setStoreId(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                        >
                            <option value="">{tm('selectStore')}</option>
                            {stores.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">{tm('customerReceiver')}</label>
                        <input
                            type="text"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            placeholder={tm('customerReceiverPlaceholder')}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">{tm('priorityLabel')}</label>
                        <div className="flex gap-2">
                            {(['normal', 'high', 'urgent'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPriority(p)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                        priority === p
                                            ? p === 'urgent'
                                                ? 'bg-red-500 border-red-500 text-white'
                                                : p === 'high'
                                                    ? 'bg-orange-500 border-orange-500 text-white'
                                                    : 'bg-gray-700 border-gray-700 text-white'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {p === 'normal' ? tm('priorityNormal') : p === 'high' ? `🟠 ${tm('priorityHigh')}` : `🔴 ${tm('priorityUrgent')}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">{tm('notesLabel')}</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            placeholder={tm('optionalNotesPlaceholder')}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                        />
                    </div>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={saving || !storeId}
                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-sm shadow-md disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                    {saving ? tm('creating') : `📦 ${tm('createDispatchSlipBtn')}`}
                </button>
            </div>
        </div>
    );
}

// ─── EntryView ────────────────────────────────────────────────────────────────

function EntryView({
    slip,
    onBack,
    onStatusChange,
}: {
    slip: WMSDispatchSlip;
    onBack: () => void;
    onStatusChange: (status: WMSDispatchSlip['status']) => void;
}) {
    const { tm } = useLanguage();
    const [lines, setLines] = useState<WMSDispatchLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'scan' | 'list'>('scan');

    // Scan state
    const [barcode, setBarcode] = useState('');
    const [qty, setQty] = useState(1);
    const [location, setLocation] = useState('');
    const [scanning, setScanning] = useState(false);
    const [lastScanned, setLastScanned] = useState<{ name: string; code: string; stock: number } | null>(null);
    const [scanError, setScanError] = useState('');

    const barcodeRef = useRef<HTMLInputElement>(null);

    const loadLines = useCallback(async () => {
        setLoading(true);
        try { setLines(await getDispatchLines(slip.id)); }
        finally { setLoading(false); }
    }, [slip.id]);

    useEffect(() => { loadLines(); }, [loadLines]);
    useEffect(() => {
        if (tab === 'scan') setTimeout(() => barcodeRef.current?.focus(), 100);
    }, [tab]);

    const handleScan = async () => {
        const code = barcode.trim();
        if (!code) return;
        setScanning(true); setScanError(''); setLastScanned(null);

        try {
            const product = await getProductByBarcode(code);
            if (!product) {
                beep(false);
                setScanError(`${tm('productNotFound')}: ${code}`);
                return;
            }

            // Stock check
            if (product.stock < qty) {
                const proceed = window.confirm(
                    `⚠️ ${tm('stockWarningConfirm')}\n${product.name}\n${tm('stockLabel')}: ${product.stock} — ${qty}\n\n${tm('stockWarningConfirm')}`
                );
                if (!proceed) {
                    beep(false);
                    setBarcode('');
                    barcodeRef.current?.focus();
                    return;
                }
            }

            await addDispatchLine(slip.id, {
                product_id: product.id,
                product_name: product.name,
                product_code: product.code,
                barcode: product.barcode || code,
                ordered_qty: qty,
                picked_qty: qty,
                unit: product.unit,
                location_code: location || undefined,
            });

            beep(true);
            if (navigator.vibrate) navigator.vibrate(50);

            setLastScanned({ name: product.name, code: product.code, stock: product.stock });
            setBarcode('');
            setQty(1);
            await loadLines();
        } catch (e) {
            beep(false);
            setScanError(`Hata: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setScanning(false);
            barcodeRef.current?.focus();
        }
    };

    const handleDelete = async (lineId: string) => {
        if (!confirm(tm('confirmDeleteItem'))) return;
        await deleteDispatchLine(lineId);
        await loadLines();
    };

    const handleStatusChange = async (newStatus: WMSDispatchSlip['status']) => {
        const labelKeys: Record<string, string> = {
            picking: 'confirmStartPicking',
            packed: 'confirmMarkPacked',
            shipped: 'confirmMarkShipped',
            cancelled: 'confirmCancelSlip',
        };
        if (!confirm(tm(labelKeys[newStatus] || 'confirmCancelSlip'))) return;
        try {
            await updateDispatchSlipStatus(slip.id, newStatus);
            onStatusChange(newStatus);
        } catch (e) {
            alert(`Durum güncellenemedi: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const totalPicked = lines.reduce((s, l) => s + (l.picked_qty || 0), 0);

    const nextStatus: WMSDispatchSlip['status'] | null =
        slip.status === 'draft'    ? 'picking'  :
        slip.status === 'picking'  ? 'packed'   :
        slip.status === 'packed'   ? 'shipped'  : null;

    const statusLabelKeys: Record<string, string> = {
        picking: 'startPicking',
        packed:  'markAsPacked',
        shipped: 'markAsShipped',
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-red-700 text-white px-4 py-3 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-all">
                        ←
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">{slip.slip_no}</span>
                            <StatusBadge status={slip.status} />
                            <PriorityBadge priority={slip.priority} />
                        </div>
                        {slip.customer_name && (
                            <p className="text-orange-100 text-xs truncate">👤 {slip.customer_name}</p>
                        )}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className="text-2xl font-bold">{totalPicked.toFixed(0)}</div>
                        <div className="text-orange-200 text-xs">{tm('totalItemsLabel')}</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-3">
                    {(['scan', 'list'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                                tab === t ? 'bg-white text-orange-700' : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                        >
                            {t === 'scan' ? `📷 ${tm('scanBarcodeTab')}` : `📋 ${tm('listTab')} (${lines.length})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {tab === 'scan' ? (
                    <div className="p-4 space-y-4">
                        {/* Feedback */}
                        {lastScanned && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                                <span className="text-2xl">✅</span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-green-800 text-sm truncate">{lastScanned.name}</p>
                                    <p className="text-green-600 text-xs">
                                        {lastScanned.code} · {tm('stockLabel')}: {lastScanned.stock}
                                    </p>
                                </div>
                                <span className="text-green-700 font-bold text-lg">{qty}</span>
                            </div>
                        )}

                        {scanError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                                ❌ {scanError}
                            </div>
                        )}

                        {/* Disabled info */}
                        {slip.status === 'shipped' && (
                            <div className="bg-gray-100 rounded-xl p-3 text-center text-gray-500 text-sm">
                                {tm('slipClosedMsg')}
                            </div>
                        )}

                        {slip.status !== 'shipped' && slip.status !== 'cancelled' && (
                            <>
                                {/* Barcode input */}
                                <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                            {tm('barcodeOrProductCode')}
                                        </label>
                                        <input
                                            ref={barcodeRef}
                                            type="text"
                                            value={barcode}
                                            onChange={e => setBarcode(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                                            placeholder={tm('scanOrEnter')}
                                            className="w-full border-2 border-orange-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-orange-500 bg-orange-50"
                                            autoComplete="off"
                                        />
                                    </div>

                                    {/* Location */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                            {tm('locationOptional')}
                                        </label>
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={e => setLocation(e.target.value)}
                                            placeholder={tm('locationExampleHint')}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                                        />
                                    </div>
                                </div>

                                {/* Quantity */}
                                <div className="bg-white rounded-xl shadow-sm p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-xs font-medium text-gray-600">{tm('quantityLabel')}</label>
                                        <div className="flex gap-1">
                                            {[1, 5, 10, 25, 50].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => setQty(n)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                                        qty === n
                                                            ? 'bg-orange-500 text-white'
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setQty(q => Math.max(1, q - 1))}
                                            className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl text-xl font-bold text-gray-700 transition-all"
                                        >
                                            −
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            value={qty}
                                            onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="flex-1 text-center text-2xl font-bold text-gray-900 border-2 border-gray-200 rounded-xl py-2 focus:outline-none focus:border-orange-400"
                                        />
                                        <button
                                            onClick={() => setQty(q => q + 1)}
                                            className="w-12 h-12 bg-orange-500 hover:bg-orange-600 rounded-xl text-xl font-bold text-white transition-all"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm button */}
                                <button
                                    onClick={handleScan}
                                    disabled={scanning || !barcode.trim()}
                                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-sm shadow-md disabled:opacity-50 hover:opacity-90 transition-opacity"
                                >
                                    {scanning ? `⏳ ${tm('processing')}` : `✔ ${tm('confirmAndAdd')}`}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    /* Lines List */
                    <div className="p-4 space-y-2">
                        {loading ? (
                            <div className="text-center py-8 text-gray-400 text-sm">{tm('loading')}</div>
                        ) : lines.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <div className="text-4xl mb-2">📭</div>
                                <p className="text-sm">{tm('noItemsAdded')}</p>
                                <button
                                    onClick={() => setTab('scan')}
                                    className="mt-3 text-orange-500 text-sm font-medium"
                                >
                                    {tm('startBarcodeScan')}
                                </button>
                            </div>
                        ) : (
                            lines.map((line, idx) => (
                                <div
                                    key={line.id}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-start gap-3"
                                >
                                    <span className="text-xs text-gray-400 pt-0.5 w-6 text-center">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900 truncate">
                                            {line.product_name || line.barcode || '—'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                                            {line.product_code && <span>{line.product_code}</span>}
                                            {line.barcode && <span>• {line.barcode}</span>}
                                            {line.location_code && <span className="bg-gray-100 px-1.5 py-0.5 rounded">📍 {line.location_code}</span>}
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <span className="font-bold text-orange-700 text-lg">{line.picked_qty}</span>
                                        {line.unit && <span className="text-xs text-gray-400 ml-1">{line.unit}</span>}
                                    </div>
                                    {slip.status !== 'shipped' && slip.status !== 'cancelled' && (
                                        <button
                                            onClick={() => handleDelete(line.id)}
                                            className="text-red-400 hover:text-red-600 p-1 transition-colors"
                                        >
                                            🗑
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Bottom action bar */}
            {nextStatus && (
                <div className="p-3 border-t border-gray-200 bg-white space-y-2">
                    <button
                        onClick={() => handleStatusChange(nextStatus)}
                        className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-opacity"
                    >
                        {tm(statusLabelKeys[nextStatus])}
                    </button>
                    {slip.status !== 'cancelled' && (
                        <button
                            onClick={() => handleStatusChange('cancelled')}
                            className="w-full py-2 text-red-500 text-xs hover:text-red-700 transition-colors"
                        >
                            {tm('cancelSlipBtn')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main WMSDispatch Component ───────────────────────────────────────────────

export function WMSDispatch({ onBack }: Props) {
    const [view, setView] = useState<View>('list');
    const [activeSlip, setActiveSlip] = useState<WMSDispatchSlip | null>(null);

    if (view === 'create') {
        return (
            <CreateView
                onCreated={(slip) => {
                    setActiveSlip(slip);
                    setView('entry');
                }}
                onBack={() => setView('list')}
            />
        );
    }

    if (view === 'entry' && activeSlip) {
        return (
            <EntryView
                slip={activeSlip}
                onBack={() => {
                    setActiveSlip(null);
                    setView('list');
                }}
                onStatusChange={(status) => {
                    setActiveSlip(prev => prev ? { ...prev, status } : prev);
                }}
            />
        );
    }

    return (
        <SlipsList
            onNew={() => setView('create')}
            onOpen={(slip) => {
                setActiveSlip(slip);
                setView('entry');
            }}
        />
    );
}

export default WMSDispatch;


