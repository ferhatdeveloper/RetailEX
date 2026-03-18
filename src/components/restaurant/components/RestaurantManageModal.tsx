import React, { useState } from 'react';
import { X, LayoutGrid, Plus, PlusCircle, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Region } from '../types';

interface RestaurantManageModalProps {
    type: 'region' | 'table';
    regions: Region[];
    initialRegionId?: string;
    onClose: () => void;
    onSaveRegion: (name: string) => Promise<void>;
    onSaveTable: (data: {
        number: string;
        seats: number;
        regionId: string;
        isBulk: boolean;
        bulkPrefix?: string;
        bulkCount?: number
    }) => Promise<void>;
}

export function RestaurantManageModal({
    type,
    regions,
    initialRegionId,
    onClose,
    onSaveRegion,
    onSaveTable
}: RestaurantManageModalProps) {
    const [newRegionName, setNewRegionName] = useState('');
    const [newTableNumber, setNewTableNumber] = useState('');
    const [newTableSeats, setNewTableSeats] = useState(4);
    const [targetRegionId, setTargetRegionId] = useState<string>(initialRegionId || (regions[0]?.id || ''));
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkPrefix, setBulkPrefix] = useState('M');
    const [bulkCount, setBulkCount] = useState(5);
    const [loading, setLoading] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSave = async () => {
        setLoading(true);
        setSaveError(null);
        try {
            if (type === 'region') {
                if (newRegionName.trim()) {
                    await onSaveRegion(newRegionName.toUpperCase());
                }
            } else {
                await onSaveTable({
                    number: newTableNumber,
                    seats: newTableSeats,
                    regionId: targetRegionId,
                    isBulk: isBulkMode,
                    bulkPrefix,
                    bulkCount
                });
            }
            onClose();
        } catch (error: any) {
            const msg = error?.message ?? String(error);
            console.error('[RestaurantManageModal] Save error:', msg);
            setSaveError(msg || 'Kayıt sırasında hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-300"
            style={{ zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)' }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden style={{ zIndex: 0 }} />
            <div
                className="relative bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]"
                style={{ zIndex: 10 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Gradient */}
                <div className="relative z-10 bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex items-center justify-between text-white overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20">
                            <LayoutGrid className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">
                                {type === 'region' ? 'Yeni Bölge' : 'Yeni Masa'}
                            </h3>
                            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5">Yönetim ve Tanımlama</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-90"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* Session Info Bar Style for Context */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 leading-tight uppercase tracking-wider">
                            {type === 'region'
                                ? 'İşletmenize yeni bir oturum alanı veya kat ekleyin.'
                                : 'Belirlediğiniz bölgeye tekli veya toplu masa tanımlayın.'}
                        </p>
                    </div>

                    {type === 'region' ? (
                        <div className="space-y-4">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Bölge Adı</label>
                            <input
                                type="text"
                                autoFocus
                                value={newRegionName}
                                onChange={(e) => setNewRegionName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-14 px-5 font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase placeholder:font-normal placeholder:capitalize"
                                placeholder="Örn: BAHÇE"
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Masa Detayları</label>
                                <button
                                    onClick={() => setIsBulkMode(!isBulkMode)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all border shadow-sm",
                                        isBulkMode
                                            ? "bg-blue-600 text-white border-blue-600 shadow-blue-200"
                                            : "bg-white text-slate-400 border-slate-200"
                                    )}
                                >
                                    {isBulkMode ? '🔥 Toplu Mod' : 'Tekli Mod'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {isBulkMode ? (
                                    <>
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Ön Ek</span>
                                            <input
                                                type="text"
                                                value={bulkPrefix}
                                                onChange={(e) => setBulkPrefix(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-black text-slate-700 outline-none focus:border-blue-500 transition-all uppercase"
                                                placeholder="Örn: M"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Miktar</span>
                                            <input
                                                type="number"
                                                value={bulkCount}
                                                onChange={(e) => setBulkCount(parseInt(e.target.value) || 1)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-black text-slate-700 outline-none focus:border-blue-500 transition-all"
                                                min="1"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="col-span-2 space-y-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Masa Numarası</span>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={newTableNumber}
                                            onChange={(e) => setNewTableNumber(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-black text-slate-700 outline-none focus:border-blue-500 transition-all uppercase"
                                            placeholder="Örn: 24"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Kapasite</span>
                                    <input
                                        type="number"
                                        value={newTableSeats}
                                        onChange={(e) => setNewTableSeats(parseInt(e.target.value) || 1)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-black text-slate-700 outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Bölge</span>
                                    <select
                                        value={targetRegionId}
                                        onChange={(e) => setTargetRegionId(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl h-12 px-4 font-black text-slate-700 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                    >
                                        {regions.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {saveError && (
                    <div className="mx-6 mb-2 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-semibold">
                        {saveError}
                    </div>
                )}

                {/* Footer Actions — grid'in üstünde kalması için yüksek z-index */}
                <div className="relative z-20 p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-colors active:scale-95 shadow-sm"
                    >
                        İPTAL
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || (type === 'region' ? !newRegionName : (!isBulkMode && !newTableNumber))}
                        className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-3 shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <CheckCircle className="w-5 h-5" />
                        )}
                        <span>KAYDET</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
