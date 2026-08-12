/**
 * WMS Mal Kabul Merkezi - Goods Receiving Module
 * PostgreSQL integrated, ExWhms design language
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
    ArrowLeft, Plus, Scan, Package, Check, Loader2,
    Truck, Calendar, Search, Filter, CheckCircle2, XCircle,
    Trash2, ChevronRight, FileText, MapPin, Hash, User,
    ClipboardList, AlertCircle, RefreshCw, Edit3,
} from 'lucide-react';
import {
    getReceivingSlips, createReceivingSlip, addReceivingLine,
    getReceivingLines, deleteReceivingLine, updateReceivingSlipStatus,
    getActiveStores, getProductByBarcode,
    WMSReceivingSlip, WMSReceivingLine,
} from '../../../services/wmsService';

interface Props { darkMode: boolean; onBack: () => void; }

type View = 'list' | 'create' | 'entry' | 'detail';

// ─── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ s }: { s: WMSReceivingSlip['status'] }) {
    const { tm } = useLanguage();
    const map: Record<string, string> = {
        draft: 'bg-gray-100 text-gray-700',
        open: 'bg-blue-100 text-blue-700',
        completed: 'bg-green-100 text-green-700',
        cancelled: 'bg-red-100 text-red-700',
    };
    const labelKeys: Record<string, string> = { draft: 'statusDraft', open: 'statusOpen', completed: 'statusCompleted', cancelled: 'statusCancelled' };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${map[s] || map.draft}`}>{tm(labelKeys[s] || 'statusDraft')}</span>;
}

// ─── Create View ──────────────────────────────────────────────────────────────

function CreateView({ darkMode, onBack, onCreated }: {
    darkMode: boolean; onBack: () => void;
    onCreated: (slip: WMSReceivingSlip) => void;
}) {
    const [stores, setStores] = useState<{ id: string; name: string; code: string }[]>([]);
    const [selectedStore, setSelectedStore] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingStores, setLoadingStores] = useState(true);
    const { tm } = useLanguage();

    useEffect(() => {
        getActiveStores().then(s => {
            setStores(s);
            if (s.length > 0) setSelectedStore(s[0].id);
        }).finally(() => setLoadingStores(false));
    }, []);

    const handleCreate = async () => {
        if (!selectedStore) return alert(tm('pleaseSelectWarehouse'));
        setLoading(true);
        try {
            const slip = await createReceivingSlip({ store_id: selectedStore, supplier_name: supplierName, notes });
            onCreated(slip);
        } catch (err: any) {
            alert(`${tm('slipCreationFailed')}: ${err?.message || err}`);
        } finally { setLoading(false); }
    };

    const c = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const t = darkMode ? 'text-gray-100' : 'text-gray-900';
    const inp = darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 bg-white';

    return (
        <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="bg-gradient-to-r from-emerald-600 to-green-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-lg font-bold">{tm('newReceivingSlip')}</h1>
                        <p className="text-xs text-green-100">{tm('receivingSlipDesc')}</p>
                    </div>
                </div>
            </div>

            <div className="p-4 max-w-xl mx-auto space-y-4">
                {/* Store */}
                <div className={`${c} border rounded-xl p-4`}>
                    <label className={`block text-xs font-bold ${t} mb-2 flex items-center gap-1.5`}>
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {tm('receivingWarehouse')}
                    </label>
                    {loadingStores ? <div className="text-sm text-gray-400">{tm('loading')}</div> : (
                        <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inp}`}>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                    )}
                </div>

                {/* Supplier */}
                <div className={`${c} border rounded-xl p-4`}>
                    <label className={`block text-xs font-bold ${t} mb-2 flex items-center gap-1.5`}>
                        <Truck className="w-3.5 h-3.5 text-emerald-600" /> {tm('supplierNameLabel')}
                    </label>
                    <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)}
                        placeholder={tm('supplierNamePlaceholder')}
                        className={`w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inp}`} />
                </div>

                {/* Notes */}
                <div className={`${c} border rounded-xl p-4`}>
                    <label className={`block text-xs font-bold ${t} mb-2 flex items-center gap-1.5`}>
                        <FileText className="w-3.5 h-3.5 text-gray-400" /> {tm('descriptionOptional')}
                    </label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                        placeholder={tm('shipmentDescPlaceholder')}
                        className={`w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${inp}`} />
                </div>

                <button onClick={handleCreate} disabled={loading || !selectedStore}
                    className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60 hover:shadow-lg active:scale-[0.98] transition-all">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {loading ? tm('savingInProgress') : tm('createReceivingSlip')}
                </button>
            </div>
        </div>
    );
}

// ─── Entry View (scanning items into a slip) ──────────────────────────────────

function EntryView({ darkMode, slip, onBack, onDone }: {
    darkMode: boolean; slip: WMSReceivingSlip;
    onBack: () => void; onDone: () => void;
}) {
    const [lines, setLines] = useState<WMSReceivingLine[]>([]);
    const [barcode, setBarcode] = useState('');
    const [currentItem, setCurrentItem] = useState<any>(null);
    const [qty, setQty] = useState(1);
    const [lotNo, setLotNo] = useState('');
    const [location, setLocation] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'scan' | 'list'>('scan');
    const inputRef = useRef<HTMLInputElement>(null);
    const { tm } = useLanguage();

    useEffect(() => { loadLines(); }, [slip.id]);
    useEffect(() => { if (inputRef.current && activeTab === 'scan') inputRef.current.focus(); }, [activeTab, currentItem]);

    const loadLines = async () => {
        const l = await getReceivingLines(slip.id);
        setLines(l);
    };

    const beep = (ok = true) => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.value = ok ? 1000 : 400;
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc.start(); osc.stop(ctx.currentTime + 0.12);
        } catch {}
    };

    const handleScan = useCallback(async (code: string) => {
        if (!code.trim()) return;
        setLoading(true);
        try {
            const p = await getProductByBarcode(code.trim());
            if (p) {
                setCurrentItem({ product_id: p.id, barcode: p.barcode || code, product_name: p.name, product_code: p.code, unit: p.unit });
                setQty(1);
                beep(true);
                if (navigator.vibrate) navigator.vibrate(100);
            } else {
                setCurrentItem({ product_id: null, barcode: code.trim(), product_name: `${tm('unknownProduct')}: ${code}`, unit: tm('unitCount') });
                setQty(1);
                beep(false);
            }
        } catch (err) { console.error(err); beep(false); }
        finally { setLoading(false); }
    }, []);

    const handleSave = async () => {
        if (!currentItem) return;
        setSaving(true);
        try {
            await addReceivingLine(slip.id, {
                product_id: currentItem.product_id, barcode: currentItem.barcode,
                product_name: currentItem.product_name, product_code: currentItem.product_code,
                ordered_qty: qty, received_qty: qty,
                unit: currentItem.unit, lot_number: lotNo || undefined, location_code: location || undefined,
            });
            await loadLines();
            setCurrentItem(null); setBarcode(''); setQty(1); setLotNo('');
            setShowSuccess(true);
            beep(true);
            if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
            setTimeout(() => setShowSuccess(false), 1800);
        } catch (err: any) { alert(`${tm('lineSaveFailed')}: ${err?.message}`); }
        finally { setSaving(false); }
    };

    const handleFinish = async () => {
        if (!confirm(`${lines.length} ürün kabul edildi. Fişi tamamlamak istiyor musunuz?`)) return;
        await updateReceivingSlipStatus(slip.id, 'completed');
        onDone();
    };

    const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const tclass = darkMode ? 'text-gray-100' : 'text-gray-900';
    const inp = darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300 bg-white';

    return (
        <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} flex flex-col`}>
            <div className="bg-gradient-to-r from-emerald-600 to-green-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">{tm('productEntry')}</h1>
                        <p className="text-xs text-green-100">{slip.slip_no}{slip.supplier_name ? ` — ${slip.supplier_name}` : ''}</p>
                    </div>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">{lines.length} ürün</span>
                    {lines.length > 0 && (
                        <button onClick={handleFinish} className="bg-white text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Tamamla
                        </button>
                    )}
                </div>
                <div className="flex gap-1 mt-3">
                    {[{ id: 'scan', label: tm('barcodeInput') }, { id: 'list', label: `${tm('listView')} (${lines.length})` }].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-emerald-700' : 'text-white/70 hover:bg-white/10'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'scan' ? (
                <div className="flex-1 p-4 space-y-4">
                    {/* Location field */}
                    <div className={`${card} border rounded-xl p-3 flex items-center gap-2`}>
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input type="text" value={location} onChange={e => setLocation(e.target.value.toUpperCase())}
                            placeholder={tm('shelfLocationExample')}
                            className={`flex-1 bg-transparent focus:outline-none text-sm font-mono uppercase ${tclass}`} />
                    </div>

                    {!currentItem ? (
                        <div className={`${card} border-2 border-dashed border-emerald-300 rounded-2xl p-8 text-center`}>
                            <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                {loading ? <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" /> : <Scan className="w-10 h-10 text-emerald-600" />}
                            </div>
                            <h3 className={`text-lg font-bold ${tclass} mb-1`}>{tm('scanProductBarcode')}</h3>
                            <p className="text-sm text-gray-500 mb-4">{tm('manualEntry')}</p>
                            <input ref={inputRef} type="text" value={barcode} onChange={e => setBarcode(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && barcode.trim()) { handleScan(barcode); setBarcode(''); } }}
                                placeholder={tm('scannerPlaceholder')}
                                className={`w-full px-4 py-3 border-2 rounded-xl text-center font-mono text-lg focus:outline-none focus:border-emerald-500 ${inp}`}
                                autoFocus />
                        </div>
                    ) : (
                        <div className={`${card} border rounded-2xl p-5 shadow-lg`}>
                            <div className="text-center mb-4">
                                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Package className="w-7 h-7 text-emerald-600" />
                                </div>
                                <h3 className={`text-lg font-bold ${tclass}`}>{currentItem.product_name}</h3>
                                <p className="text-sm text-gray-500 font-mono mt-0.5">{currentItem.barcode}</p>
                            </div>

                            {/* Lot No */}
                            <div className={`flex items-center gap-2 p-3 rounded-xl mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                                <Hash className="w-4 h-4 text-gray-400" />
                                <input type="text" value={lotNo} onChange={e => setLotNo(e.target.value)}
                                    placeholder={tm('lotSerialOptional')}
                                    className="flex-1 bg-transparent focus:outline-none text-sm" />
                            </div>

                            {/* Quantity */}
                            <label className={`block text-sm font-bold ${tclass} mb-2`}>{tm('acceptedQty')}</label>
                            <div className="flex items-center gap-3 mb-4">
                                <button onClick={() => setQty(Math.max(0, qty - 1))}
                                    className="w-12 h-12 bg-red-500 text-white rounded-xl flex items-center justify-center text-xl font-bold hover:bg-red-600 active:scale-95">−</button>
                                <input type="number" value={qty} onChange={e => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                                    className={`flex-1 py-3 text-3xl font-bold border-2 rounded-xl text-center focus:outline-none focus:border-emerald-500 ${inp}`} />
                                <button onClick={() => setQty(qty + 1)}
                                    className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center text-xl font-bold hover:bg-emerald-600 active:scale-95">+</button>
                            </div>
                            <div className="grid grid-cols-5 gap-2 mb-4">
                                {[1, 5, 10, 25, 50].map(q => (
                                    <button key={q} onClick={() => setQty(q)}
                                        className={`py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                        {q}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => { setCurrentItem(null); setBarcode(''); setQty(1); }}
                                    className={`flex-1 py-3 border-2 rounded-xl font-bold flex items-center justify-center gap-2 ${darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 hover:bg-gray-50'}`}>
                                    <XCircle className="w-5 h-5" /> {tm('cancel')}
                                </button>
                                <button onClick={handleSave} disabled={saving}
                                    className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70 hover:shadow-lg active:scale-[0.98] transition-all">
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                    {saving ? tm('savingInProgress') : tm('acceptItem')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Recent items */}
                    {lines.length > 0 && !currentItem && (
                        <div className={`${card} border rounded-xl overflow-hidden`}>
                            <div className={`px-4 py-2.5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'} text-xs font-bold ${tclass}`}>{tm('recentlyAccepted')}</div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {lines.slice(0, 5).map(l => (
                                    <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate ${tclass}`}>{l.product_name || l.barcode}</div>
                                            <div className="text-xs text-gray-500 font-mono">{l.barcode}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-emerald-600">{l.received_qty}</div>
                                            {l.unit && <div className="text-xs text-gray-400">{l.unit}</div>}
                                        </div>
                                        <button onClick={async () => { await deleteReceivingLine(l.id); loadLines(); }}
                                            className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Full list */
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                    {lines.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>Henüz ürün girilmedi</p>
                        </div>
                    ) : lines.map(l => (
                        <div key={l.id} className={`px-4 py-3 flex items-center gap-3 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm font-semibold truncate ${tclass}`}>{l.product_name || l.barcode}</div>
                                <div className="text-xs text-gray-500 font-mono">{l.barcode}</div>
                                {l.lot_number && <div className="text-xs text-purple-500">Lot: {l.lot_number}</div>}
                                {l.location_code && <div className="text-xs text-teal-500"><MapPin className="w-3 h-3 inline" /> {l.location_code}</div>}
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold text-emerald-600">{l.received_qty}</div>
                                {l.unit && <div className="text-xs text-gray-400">{l.unit}</div>}
                            </div>
                            <button onClick={async () => { await deleteReceivingLine(l.id); loadLines(); }}
                                className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {showSuccess && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-50 animate-bounce">
                    <CheckCircle2 className="w-5 h-5" /> <span className="font-bold">{tm('receivingSlipAccepted')}</span>
                </div>
            )}
        </div>
    );
}

// ─── Slips List View ──────────────────────────────────────────────────────────

function SlipsList({ darkMode, onBack, onNew, onEntry, onDetail }: {
    darkMode: boolean; onBack: () => void;
    onNew: () => void; onEntry: (s: WMSReceivingSlip) => void;
    onDetail: (s: WMSReceivingSlip) => void;
}) {
    const [slips, setSlips] = useState<WMSReceivingSlip[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [search, setSearch] = useState('');
    const { tm } = useLanguage();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getReceivingSlips(filterStatus);
            setSlips(data);
        } finally { setLoading(false); }
    }, [filterStatus]);

    useEffect(() => { load(); }, [load]);

    const filtered = slips.filter(s =>
        search === '' ||
        s.slip_no.toLowerCase().includes(search.toLowerCase()) ||
        (s.supplier_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const stats = {
        draft: slips.filter(s => s.status === 'draft').length,
        open: slips.filter(s => s.status === 'open').length,
        completed: slips.filter(s => s.status === 'completed').length,
    };

    const card = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const tclass = darkMode ? 'text-gray-100' : 'text-gray-900';

    return (
        <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="bg-gradient-to-r from-emerald-600 to-green-700 text-white p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">{tm('receivingTitle')}</h1>
                        <p className="text-xs text-green-100">{tm('receivingSubtitle')}</p>
                    </div>
                    <button onClick={load} className="p-2 hover:bg-white/10 rounded-lg"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
                    <button onClick={onNew} className="bg-white text-emerald-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5 hover:bg-emerald-50">
                        <Plus className="w-4 h-4" /> {tm('newReceiving')}
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { labelKey: 'statusDraft', count: stats.draft, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
                        { labelKey: 'statusOpen', count: stats.open, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                        { labelKey: 'statusCompleted', count: stats.completed, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
                    ].map(s => (
                        <div key={s.labelKey} className={`border rounded-xl p-3 text-center ${s.bg}`}>
                            <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                            <div className="text-xs text-gray-500">{tm(s.labelKey)}</div>
                        </div>
                    ))}
                </div>

                {/* Search & Filter */}
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder={tm('searchSlipOrSupplier')}
                            className={`w-full pl-9 pr-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'}`} />
                    </div>
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {[{ v: 'all', lk: 'filterAll' }, { v: 'draft', lk: 'statusDraft' }, { v: 'open', lk: 'statusOpen' }, { v: 'completed', lk: 'statusCompleted' }, { v: 'cancelled', lk: 'statusCancelled' }].map(f => (
                        <button key={f.v} onClick={() => setFilterStatus(f.v)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterStatus === f.v ? 'bg-emerald-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {tm(f.lk)}
                        </button>
                    ))}
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
                ) : filtered.length === 0 ? (
                    <div className={`${card} border rounded-2xl p-12 text-center`}>
                        <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className={`${tclass} font-medium mb-1`}>{tm('noReceivingSlips')}</p>
                        <p className="text-sm text-gray-500 mb-4">{tm('startNewShipment')}</p>
                        <button onClick={onNew} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700">+ {tm('newReceiving')}</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(slip => (
                            <div key={slip.id} className={`${card} border rounded-xl overflow-hidden shadow-sm`}>
                                <div className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold font-mono ${tclass}`}>{slip.slip_no}</span>
                                                {<StatusBadge s={slip.status} />}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(slip.date).toLocaleDateString('tr-TR')}</span>
                                                {slip.supplier_name && <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{slip.supplier_name}</span>}
                                                <span className="flex items-center gap-1"><Package className="w-3 h-3" />{slip.item_count ?? 0} {tm('itemsUnit')}</span>
                                            </div>
                                        </div>
                                        {slip.store_name && (
                                            <span className={`text-xs px-2 py-1 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                {slip.store_name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {(slip.status === 'draft' || slip.status === 'open') && (
                                            <button onClick={() => onEntry(slip)}
                                                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-700">
                                                <Scan className="w-4 h-4" /> {tm('productEntry')}
                                            </button>
                                        )}
                                        <button onClick={() => onDetail(slip)}
                                            className={`py-2 px-3 rounded-lg text-sm font-medium flex items-center gap-1 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
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

export function WMSReceiving({ darkMode, onBack }: Props) {
    const [view, setView] = useState<View>('list');
    const [selectedSlip, setSelectedSlip] = useState<WMSReceivingSlip | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const backToList = () => { setView('list'); setSelectedSlip(null); setRefreshKey(k => k + 1); };

    switch (view) {
        case 'create':
            return <CreateView darkMode={darkMode} onBack={() => setView('list')}
                onCreated={slip => { setSelectedSlip(slip); setView('entry'); }} />;
        case 'entry':
            return selectedSlip ? <EntryView darkMode={darkMode} slip={selectedSlip} onBack={backToList} onDone={backToList} /> : null;
        default:
            return <SlipsList key={refreshKey} darkMode={darkMode} onBack={onBack}
                onNew={() => setView('create')}
                onEntry={slip => { setSelectedSlip(slip); setView('entry'); }}
                onDetail={slip => { setSelectedSlip(slip); setView('entry'); }} />;
    }
}


