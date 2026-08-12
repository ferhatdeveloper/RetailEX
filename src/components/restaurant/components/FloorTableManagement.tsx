import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, Users, Check, Lock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { RestaurantService } from '../../../services/restaurant';
import { ERP_SETTINGS } from '../../../services/postgres';
import { usePermission } from '@/shared/hooks/usePermission';

async function getStoreId(): Promise<string | null> {
    try {
        const dev = localStorage.getItem('retailex_registered_device');
        if (dev) {
            const parsed = JSON.parse(dev);
            if (parsed.storeId) return parsed.storeId;
        }
    } catch { /* ignore */ }
    try {
        const { rows } = await RestaurantService.db.query(
            'SELECT id FROM public.stores WHERE firm_nr = $1 LIMIT 1',
            [ERP_SETTINGS.firmNr]
        );
        if (rows[0]) return rows[0].id;
    } catch { /* ignore */ }
    return null;
}

export function FloorTableManagement() {
    const { regions, tables, addRegion, removeRegion, addTable, removeTable } = useRestaurantStore();
    const { isAdmin } = usePermission();

    const [selectedRegionId, setSelectedRegionId] = useState<string>('');

    const [newRegionName, setNewRegionName] = useState('');
    const [regionLoading, setRegionLoading] = useState(false);
    const [regionError, setRegionError] = useState<string | null>(null);

    const [newTableNumber, setNewTableNumber] = useState('');
    const [newTableSeats, setNewTableSeats] = useState(4);
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkPrefix, setBulkPrefix] = useState('M');
    const [bulkCount, setBulkCount] = useState(5);
    const [tableLoading, setTableLoading] = useState(false);
    const [tableError, setTableError] = useState<string | null>(null);

    const [deletingRegionId, setDeletingRegionId] = useState<string | null>(null);
    const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

    const selectedRegion = regions.find(r => r.id === selectedRegionId);
    const regionTables = tables.filter(t => t.floorId === selectedRegionId);
    const regionTablesSorted = [...regionTables].sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true })
    );

    const handleAddRegion = async () => {
        if (!newRegionName.trim()) return;
        setRegionLoading(true);
        setRegionError(null);
        try {
            const storeId = await getStoreId();
            const newRegion = { id: uuidv4(), name: newRegionName.toUpperCase(), order: regions.length + 1 };
            await addRegion(newRegion, storeId ?? null);
            setNewRegionName('');
        } catch (err: any) {
            setRegionError(err?.message ?? String(err));
        } finally {
            setRegionLoading(false);
        }
    };

    const handleDeleteRegion = async (regionId: string) => {
        if (deletingRegionId !== regionId) { setDeletingRegionId(regionId); return; }
        try {
            await removeRegion(regionId);
            if (selectedRegionId === regionId)
                setSelectedRegionId(regions.find(r => r.id !== regionId)?.id ?? '');
        } catch (err: any) {
            setRegionError(err?.message ?? String(err));
        } finally {
            setDeletingRegionId(null);
        }
    };

    const handleAddTable = async () => {
        if (!selectedRegionId) return;
        setTableLoading(true);
        setTableError(null);
        try {
            if (isBulkMode) {
                const padLen = Math.max(2, String(bulkCount).length);
                for (let i = 1; i <= bulkCount; i++) {
                    const num = String(i).padStart(padLen, '0');
                    await addTable({ id: uuidv4(), number: `${bulkPrefix}-${num}`, seats: newTableSeats, floorId: selectedRegionId, isLarge: false });
                }
                setBulkPrefix('M'); setBulkCount(5);
            } else {
                if (!newTableNumber.trim()) return;
                await addTable({ id: uuidv4(), number: newTableNumber.toUpperCase(), seats: newTableSeats, floorId: selectedRegionId, isLarge: false });
                setNewTableNumber('');
            }
        } catch (err: any) {
            setTableError(err?.message ?? String(err));
        } finally {
            setTableLoading(false);
        }
    };

    const handleDeleteTable = async (tableId: string) => {
        if (deletingTableId !== tableId) { setDeletingTableId(tableId); return; }
        try {
            await removeTable(tableId);
        } catch (err: any) {
            setTableError(err?.message ?? String(err));
        } finally {
            setDeletingTableId(null);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!isAdmin() && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <Lock className="w-5 h-5 shrink-0" />
                    <span className="font-semibold">Bölge ve masa ekleme/silme yetkisi sadece yöneticilerdedir. Listeyi görüntüleyebilirsiniz.</span>
                </div>
            )}
            <div className="flex gap-5">
            {/* Left — Regions */}
            <div className="w-60 shrink-0 flex flex-col gap-3">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bölgeler</p>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                        {regions.length === 0 && (
                            <div className="px-4 py-5 text-center text-slate-400 text-xs">Henüz bölge yok</div>
                        )}
                        {regions.map(r => (
                            <div
                                key={r.id}
                                onClick={() => { setSelectedRegionId(r.id); setDeletingRegionId(null); }}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                                    selectedRegionId === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                                }`}
                            >
                                <span className={`flex-1 text-sm truncate ${
                                    selectedRegionId === r.id ? 'text-blue-700 font-semibold' : 'text-slate-700'
                                }`}>{r.name}</span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                    {tables.filter(t => t.floorId === r.id).length} masa
                                </span>
                                {isAdmin() && (
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDeleteRegion(r.id); }}
                                        className={`shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                            deletingRegionId === r.id
                                                ? 'bg-red-500 text-white'
                                                : 'text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100'
                                        }`}
                                        title={deletingRegionId === r.id ? 'Onayla' : 'Sil'}
                                    >
                                        {deletingRegionId === r.id ? <Check className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add region — sadece admin */}
                {isAdmin() && (
                <div className="space-y-1.5">
                    {regionError && (
                        <div className="flex items-start gap-1.5 text-red-500 text-[10px]">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /><span>{regionError}</span>
                        </div>
                    )}
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={newRegionName}
                            onChange={e => setNewRegionName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddRegion()}
                            placeholder="Yeni bölge adı..."
                            className="flex-1 bg-white border border-slate-200 rounded-lg h-8 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 uppercase placeholder:capitalize placeholder:font-normal"
                        />
                        <button
                            onClick={handleAddRegion}
                            disabled={regionLoading || !newRegionName.trim()}
                            className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                        >
                            {regionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* Right — Tables */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
                {/* Tables list */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            {selectedRegion
                                ? <>{selectedRegion.name} <span className="font-normal normal-case">— {regionTables.length} masa</span></>
                                : 'Masalar'}
                        </p>
                        {isAdmin() && selectedRegionId && (
                            <button
                                onClick={() => setIsBulkMode(!isBulkMode)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase transition-all border ${
                                    isBulkMode
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {isBulkMode ? 'Toplu' : 'Tekli'}
                            </button>
                        )}
                    </div>

                    <div className="p-3 min-h-[120px]">
                        {!selectedRegionId ? (
                            <div className="flex items-center justify-center py-10 text-slate-300 text-xs">
                                Soldaki listeden bir bölge seçin
                            </div>
                        ) : regionTables.length === 0 ? (
                            <div className="flex items-center justify-center py-10 text-slate-300 text-xs">
                                Bu bölgede masa yok
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8 gap-2">
                                {regionTablesSorted.map(t => (
                                    <div
                                        key={t.id}
                                        className="border border-slate-200 rounded-lg p-2 flex flex-col gap-0.5 group relative hover:border-slate-300 transition-colors"
                                    >
                                        <span className="text-xs font-semibold text-slate-700 truncate">{t.number}</span>
                                        <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                            <Users className="w-2.5 h-2.5" />{t.seats}
                                        </span>
                                        {isAdmin() && (
                                            <button
                                                onClick={() => handleDeleteTable(t.id)}
                                                className={`absolute top-1 right-1 w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                                    deletingTableId === t.id
                                                        ? 'bg-red-500 text-white'
                                                        : 'text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100'
                                                }`}
                                                title={deletingTableId === t.id ? 'Onayla' : 'Sil'}
                                            >
                                                {deletingTableId === t.id ? <Check className="w-2.5 h-2.5" /> : <Trash2 className="w-2.5 h-2.5" />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Add table form — sadece admin */}
                {isAdmin() && (
                <div className="space-y-1.5">
                    {tableError && (
                        <div className="flex items-start gap-1.5 text-red-500 text-[10px]">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /><span>{tableError}</span>
                        </div>
                    )}
                    <div className="flex items-end gap-2 flex-wrap">
                        {isBulkMode ? (
                            <>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-slate-400 font-medium">Ön Ek</span>
                                    <input type="text" value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value)}
                                        className="w-16 bg-white border border-slate-200 rounded-lg h-8 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 uppercase" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-slate-400 font-medium">Adet</span>
                                    <input type="number" value={bulkCount} min={1} onChange={e => setBulkCount(parseInt(e.target.value) || 1)}
                                        className="w-16 bg-white border border-slate-200 rounded-lg h-8 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400" />
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-slate-400 font-medium">Masa No</span>
                                <input type="text" value={newTableNumber} onChange={e => setNewTableNumber(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddTable()}
                                    placeholder="Örn: 12"
                                    className="w-24 bg-white border border-slate-200 rounded-lg h-8 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 uppercase placeholder:normal-case placeholder:font-normal" />
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-400 font-medium">Kapasite</span>
                            <input type="number" value={newTableSeats} min={1} onChange={e => setNewTableSeats(parseInt(e.target.value) || 1)}
                                className="w-16 bg-white border border-slate-200 rounded-lg h-8 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400" />
                        </div>
                        <button
                            onClick={handleAddTable}
                            disabled={tableLoading || !selectedRegionId || (!isBulkMode && !newTableNumber.trim())}
                            className="h-8 px-3 bg-slate-800 text-white rounded-lg flex items-center gap-1.5 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40 text-xs font-medium"
                        >
                            {tableLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {isBulkMode ? `${bulkCount} Masa Ekle` : 'Masa Ekle'}
                        </button>
                        {!selectedRegionId && (
                            <span className="text-[10px] text-slate-400 self-end pb-2">← Önce bölge seçin</span>
                        )}
                    </div>
                </div>
                )}
            </div>
            </div>
        </div>
    );
}
