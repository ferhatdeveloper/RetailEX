import React, { useState, useRef } from 'react';
import {
    Users,
    Clock,
    History,
    Utensils,
    Search,
    Map as MapIcon,
    LayoutGrid,
    Calendar,
    Printer,
    ArrowLeft,
    Receipt,
    Plus,
    Minus,
    X,
    LogOut,
    CheckCircle2,
    Sparkles,
    ArrowRightLeft,
    Merge,
    RotateCcw,
    Pencil,
    Trash2,
    ChevronDown,
    ChevronUp,
    ExternalLink
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../ui/utils';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Table } from '../types';
import { KrokiView } from './KrokiView';
import { useResponsive } from '@/hooks/useResponsive';
import { RestaurantService } from '../../../services/restaurant';
import { RestaurantTableOpenModal } from './RestaurantTableOpenModal';
import { RestaurantManageModal } from './RestaurantManageModal';
import { getStatusConfig, TABLE_STATUS_CONFIG } from '../utils/tableStatusConfig';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatMoneyAmount } from '../../../utils/formatMoney';

/** Serviste (mor) kartın otomatik maviye dönme süresi — masaya ürün gitmiş (ms) */
const SERVED_TO_BLUE_MS = 15 * 1000;

const ORDER_ITEM_STATUS_TR: Record<string, string> = {
    pending: 'Bekliyor',
    cooking: 'Mutfakta',
    ready: 'Hazır',
    served: 'Serviste',
    cancelled: 'İptal',
};
const servedFirstSeenAt = new Map<string, number>();

async function getStoreId(): Promise<string | null> {
    try {
        const dev = localStorage.getItem('retailex_registered_device');
        if (dev) {
            const parsed = JSON.parse(dev);
            if (parsed.storeId) return parsed.storeId;
        }
    } catch { /* ignore */ }
    // Fallback: query DB for first store matching current firm
    try {
        const { rows } = await RestaurantService.db.query(
            'SELECT id FROM public.stores WHERE firm_nr = $1 LIMIT 1',
            [(await import('../../../services/postgres')).ERP_SETTINGS.firmNr]
        );
        if (rows[0]) return rows[0].id;
    } catch { /* ignore */ }
    return null;
}

interface RestaurantFloorPlanProps {
    onSelectTable: (table: Table, covers: number) => void;
    onBack: () => void;
    /** Masa taşıma modu: kaynak masa set edilince floor üzerinde hedef seçimi */
    moveTableSource?: Table | null;
    moveTargetTableId?: string | null;
    onMoveTargetSelect?: (id: string | null) => void;
    onMoveConfirm?: (mode: 'move' | 'merge', targetId: string) => void;
    onMoveCancel?: () => void;
    /** Personel badge tıklandığında garson değişimi modalını açar */
    onRequestStaffChange?: () => void;
    /** Rezervasyonlar butonuna tıklanınca rezervasyon ekranına geçer */
    onOpenReservations?: () => void;
}

export function RestaurantFloorPlan({ onSelectTable, onBack, moveTableSource, moveTargetTableId, onMoveTargetSelect, onMoveConfirm, onMoveCancel, onRequestStaffChange, onOpenReservations }: RestaurantFloorPlanProps) {
    const [activeFloor, setActiveFloor] = useState('Tümü');
    const [activeView, setActiveView] = useState<'tables' | 'kroki' | 'orders'>('tables');
    const [searchTerm, setSearchTerm] = useState('');
    const [openModal, setOpenModal] = useState<{ table: Table; covers: number } | null>(null);
    const {
        tables,
        regions,
        addRegion,
        updateRegion,
        addTable,
        updateTable,
        removeTable,
        currentStaff,
        logout,
    } = useRestaurantStore();
    const { width } = useResponsive();
    const { isAdmin, isManager, user } = usePermission();
    const canFloorAdminTable =
        isAdmin() ||
        isManager() ||
        !!user?.roles?.some(r => {
            const n = (r.name || '').toLowerCase();
            return n === 'yönetici' || n === 'müdür' || n === 'mudur';
        });

    const [tableAdminMenu, setTableAdminMenu] = useState<Table | null>(null);
    const [tableAdminEdit, setTableAdminEdit] = useState<Table | null>(null);
    const [editTableForm, setEditTableForm] = useState({ number: '', seats: 4, floorId: '', regionName: '' });
    /** Masa yönetimi menüsünden açılan “bölge adını güncelle” modalı */
    const [regionEditFromMenu, setRegionEditFromMenu] = useState<{ floorId: string; currentName: string } | null>(null);
    const [regionEditSelectedId, setRegionEditSelectedId] = useState('');
    const [regionEditName, setRegionEditName] = useState('');
    const [regionEditSaving, setRegionEditSaving] = useState(false);
    const [regionEditError, setRegionEditError] = useState<string | null>(null);
    const [editTableSaving, setEditTableSaving] = useState(false);
    const [editTableError, setEditTableError] = useState<string | null>(null);
    /** Siparişler sekmesinde hangi masanın kalem detayı açık */
    const [ordersDetailOpen, setOrdersDetailOpen] = useState<Record<string, boolean>>({});
    /** Siparişler listesi filtresi — sadece mevcut veri üzerinde, ek yükleme yok */
    const [orderFilterStatus, setOrderFilterStatus] = useState<string>('');
    const [orderFilterWaiter, setOrderFilterWaiter] = useState<string>('');

    React.useEffect(() => {
        if (tableAdminEdit) {
            const floorId = tableAdminEdit.floorId || regions[0]?.id || '';
            const region = regions.find(r => r.id === floorId);
            setEditTableForm({
                number: tableAdminEdit.number,
                seats: tableAdminEdit.seats,
                floorId,
                regionName: region?.name ?? '',
            });
            setEditTableError(null);
        }
    }, [tableAdminEdit, regions]);

    React.useEffect(() => {
        if (regionEditFromMenu) {
            setRegionEditSelectedId(regionEditFromMenu.floorId);
            setRegionEditName(regionEditFromMenu.currentName);
            setRegionEditError(null);
        }
    }, [regionEditFromMenu]);

    const [showManageModal, setShowManageModal] = useState(false);
    const [manageType, setManageType] = useState<'region' | 'table' | null>(null);
    const [newRegionName, setNewRegionName] = useState('');
    const [newTableNumber, setNewTableNumber] = useState('');
    const [newTableSeats, setNewTableSeats] = useState(4);
    const [targetRegionId, setTargetRegionId] = useState<string>('');

    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkPrefix, setBulkPrefix] = useState('M');
    const [bulkCount, setBulkCount] = useState(5);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const cols = width >= 1024 ? 10 : width >= 768 ? 8 : width >= 640 ? 6 : 3;

    const activeFloorName = regions.find(r => r.id === activeFloor)?.name;
    const byFloor = activeFloor === 'Tümü'
        ? tables
        : tables.filter(t => t.floorId === activeFloor || t.location === activeFloor || t.location === activeFloorName);

    const floorTables = searchTerm.trim()
        ? byFloor.filter(t => t.number.toLowerCase().includes(searchTerm.toLowerCase()))
        : byFloor;

    return (
        <div className="flex flex-col h-full" style={{ backgroundColor: '#f1f3f5' }}>
            <div
                className="border-b px-6 py-4 flex items-center justify-between z-20 shrink-0 gap-8 shadow-2xl"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex items-center gap-4 flex-1">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2.5 px-6 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[12px] group shrink-0 shadow-inner"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span>Geri</span>
                    </button>

                    <div className="relative flex-1 max-w-lg group h-12 min-w-0">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 group-focus-within:text-white transition-colors pointer-events-none z-10" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            inputMode="search"
                            autoComplete="off"
                            placeholder="Masa veya sipariş ara..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onFocus={() => {
                                if ((window as any).__TAURI_INTERNALS__) {
                                    import('@tauri-apps/api/core').then(({ invoke }) => invoke('show_touch_keyboard')).catch(() => {});
                                }
                            }}
                            className="absolute inset-0 w-full h-full bg-white/20 border-2 border-white/30 rounded-2xl pl-12 pr-4 text-sm focus:ring-2 focus:ring-white/50 focus:border-white/60 focus:bg-white/25 transition-all font-semibold text-white placeholder:text-white/65 outline-none cursor-text"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {currentStaff && (
                        <button
                            onClick={onRequestStaffChange ?? logout}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/20 group"
                            title={onRequestStaffChange ? 'Garson değiştir' : 'Çıkış'}
                        >
                            <div className="flex flex-col items-end mr-1">
                                <span className="text-[10px] font-bold text-red-500/60 uppercase leading-none mb-1">Personel</span>
                                <span className="text-sm font-black text-white leading-none uppercase tracking-tighter">{currentStaff.name}</span>
                            </div>
                            <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    )}

                    <div className="flex items-center gap-1">
                        <FloorSubTab icon={<Utensils className="w-5 h-5" />} label="Masalar" active={activeView === 'tables'} activeColor="bg-white/20 text-white" onClick={() => setActiveView('tables')} />
                        <FloorSubTab icon={<MapIcon className="w-5 h-5" />} label="Kroki" active={activeView === 'kroki'} activeColor="bg-blue-400 text-white" onClick={() => setActiveView('kroki')} />
                        <FloorSubTab icon={<LayoutGrid className="w-5 h-5" />} label="Siparişler" active={activeView === 'orders'} activeColor="bg-emerald-500 text-white" onClick={() => setActiveView('orders')} />
                    </div>
                </div>
            </div>

            <div
                className="border-b flex items-center px-6 pr-4 z-10 shrink-0 overflow-x-auto no-scrollbar shadow-lg"
                style={{ backgroundColor: '#1d4ed8', borderColor: 'rgba(30,58,138,0.2)' }}
            >
                <div className="flex items-center gap-1 flex-1 py-2">
                    <button
                        onClick={() => setActiveFloor('Tümü')}
                        className={cn(
                            "flex items-center justify-center px-6 py-3 rounded-2xl text-[12px] font-black uppercase tracking-tight whitespace-nowrap outline-none transition-all min-h-[44px]",
                            activeFloor === 'Tümü'
                                ? "bg-white/20 text-white shadow-lg border border-white/10"
                                : "text-white/50 hover:text-white hover:bg-white/10"
                        )}
                    >
                        TÜMÜ
                    </button>
                    {regions.map((region) => (
                        <button
                            key={region.id}
                            onClick={() => setActiveFloor(region.id)}
                            className={cn(
                                "flex items-center justify-center px-6 py-3 rounded-2xl text-[12px] font-black uppercase tracking-tight whitespace-nowrap outline-none transition-all min-h-[44px]",
                                activeFloor === region.id
                                    ? "bg-white/20 text-white shadow-lg border border-white/10"
                                    : "text-white/50 hover:text-white hover:bg-white/10"
                            )}
                        >
                            {region.name}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 shrink-0 pl-4">
                    {isAdmin() && (
                        <>
                            <button
                                onClick={() => { setManageType('region'); setShowManageModal(true); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase text-white/90 hover:text-white transition-all rounded-xl border border-white/15"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Bölge Ekle</span>
                            </button>
                            <button
                                onClick={() => {
                                    setManageType('table');
                                    setTargetRegionId(activeFloor === 'Tümü' ? (regions[0]?.id || '') : activeFloor);
                                    setShowManageModal(true);
                                }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-[11px] font-black uppercase text-white transition-all rounded-xl border border-white/15 shadow-lg"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Masa Ekle</span>
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={() => onOpenReservations?.()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase text-white/90 hover:text-white transition-all rounded-xl border border-white/15"
                    >
                        <span>Rezervasyonlar</span>
                        <Calendar className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Masa taşıma / birleştirme — üst şeritlerin altında, her zaman görünür (sticky + kontrast) */}
            {activeView === 'tables' && moveTableSource && (
                <div
                    className="sticky top-0 z-[200] shrink-0 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b-4 border-amber-900 shadow-[0_6px_24px_rgba(0,0,0,0.25)]"
                    style={{
                        background: 'linear-gradient(135deg, #d97706 0%, #b45309 45%, #92400e 100%)',
                    }}
                >
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25 text-white ring-2 ring-white/40">
                            <RotateCcw className="w-6 h-6" />
                        </div>
                        {moveTargetTableId ? (
                            <>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
                                    <span className="font-black uppercase text-base sm:text-lg tracking-wide text-white drop-shadow-sm">
                                        Masa <span className="inline-block bg-black/30 px-2.5 py-1 rounded-lg text-white">{moveTableSource.number}</span>
                                        <ArrowRightLeft className="inline-block w-5 h-5 mx-2 align-middle text-amber-100" />
                                        Masa <span className="inline-block bg-black/30 px-2.5 py-1 rounded-lg text-white">{tables.find(t => t.id === moveTargetTableId)?.number ?? moveTargetTableId}</span>
                                    </span>
                                    <span className="text-xs font-bold text-amber-100 uppercase tracking-wider hidden sm:inline">İşlem seçin</span>
                                </div>
                                {onMoveConfirm && (
                                    <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => onMoveConfirm('move', moveTargetTableId)}
                                            className="flex items-center gap-2 px-5 py-3 bg-white text-amber-900 hover:bg-amber-50 rounded-xl font-black uppercase text-xs sm:text-sm transition-all shadow-lg border-2 border-white"
                                        >
                                            <ArrowRightLeft className="w-4 h-4 shrink-0" /> Taşı
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onMoveConfirm('merge', moveTargetTableId)}
                                            className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-black uppercase text-xs sm:text-sm transition-all shadow-lg ring-2 ring-emerald-900/40"
                                        >
                                            <Merge className="w-4 h-4 shrink-0" /> Birleştir
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <span className="font-black uppercase text-base sm:text-lg text-white drop-shadow-md tracking-wide">
                                    Masa <span className="bg-black/35 px-2.5 py-1 rounded-lg">{moveTableSource.number}</span> — hedef masayı seçin
                                </span>
                                <span className="text-sm font-bold text-amber-100">Hedef masanın kartına dokunun / tıklayın</span>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onMoveCancel}
                        className="flex items-center gap-2 px-5 py-3 bg-black/30 hover:bg-black/45 text-white rounded-xl font-black text-sm uppercase transition-all shrink-0 ring-2 ring-white/30"
                    >
                        <X className="w-5 h-5" /> İptal
                    </button>
                </div>
            )}

            {/* Content Area */}
            <main className={cn('flex-1 overflow-hidden relative', moveTableSource && activeView === 'tables' ? 'z-[1]' : 'z-0')}>
                {activeView === 'tables' && (
                    <div className="h-full overflow-auto flex flex-col" style={{ backgroundColor: '#f1f3f5' }}>
                        <div className="flex-1 p-4">
                            <div
                                className="grid gap-4 w-full"
                                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                            >
                                {floorTables.map((table) => (
                                    <TableCard
                                        key={table.id}
                                        table={table}
                                        isMoveSource={moveTableSource?.id === table.id}
                                        isMoveTarget={moveTargetTableId === table.id}
                                        moveTargetMode={!!moveTableSource}
                                        enableAdminLongPress={canFloorAdminTable && !moveTableSource}
                                        onAdminLongPress={t => setTableAdminMenu(t)}
                                        onClick={() => {
                                            if (moveTableSource) {
                                                if (table.id === moveTableSource.id) return;
                                                onMoveTargetSelect?.(table.id);
                                                return;
                                            }
                                            if (table.status === 'empty') {
                                                setOpenModal({ table, covers: table.seats });
                                            } else {
                                                onSelectTable(table, table.seats);
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                        {/* Renk Legend Bar */}
                        <div className="shrink-0 px-4 py-2 border-t border-slate-200 bg-white/80 backdrop-blur-sm flex items-center gap-3 flex-wrap">
                            {(['empty', 'occupied', 'kitchen', 'served', 'billing', 'cleaning'] as const).map(s => {
                                const c = getStatusConfig(s);
                                return (
                                    <div key={s} className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.bg }} />
                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{c.label}</span>
                                    </div>
                                );
                            })}
                            {canFloorAdminTable && (
                                <span className="text-[10px] font-bold text-slate-400 border-l border-slate-200 pl-3 ml-1">
                                    Yönetici: masada uzun bas → düzenle / sil
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {activeView === 'kroki' && (
                    <div className="h-full overflow-hidden">
                        <KrokiView activeFloor={activeFloor} />
                    </div>
                )}

                {activeView === 'orders' && (() => {
                    const q = (searchTerm || '').trim().toLowerCase();
                    const baseOrderTables = tables.filter(
                        t => t.status !== 'empty' &&
                        (activeFloor === 'Tümü' || t.floorId === activeFloor) &&
                        (!q || t.number.toLowerCase().includes(q) || (t.waiter ?? '').toLowerCase().includes(q) || (t.location ?? '').toLowerCase().includes(q))
                    );
                    const uniqueWaiters = Array.from(new Set(baseOrderTables.map(t => t.waiter).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
                    const orderTables = baseOrderTables.filter(
                        t => (!orderFilterStatus || t.status === orderFilterStatus) && (!orderFilterWaiter || t.waiter === orderFilterWaiter)
                    );
                    return (
                        <div className="h-full flex flex-col" style={{ backgroundColor: '#f1f3f5' }}>
                            <div className="shrink-0 p-4 pb-2">
                                <h3 className="text-lg font-black text-slate-700 uppercase tracking-tight mb-3 px-1">Açık siparişler</h3>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filtre</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-600">Durum:</span>
                                        <select
                                            value={orderFilterStatus}
                                            onChange={e => setOrderFilterStatus(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 min-w-[120px]"
                                        >
                                            <option value="">Tümü</option>
                                            <option value="occupied">Dolu</option>
                                            <option value="kitchen">Mutfakta</option>
                                            <option value="served">Serviste</option>
                                            <option value="billing">Hesap</option>
                                            <option value="cleaning">Temizlik</option>
                                            <option value="reserved">Rezerve</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-600">Garson:</span>
                                        <select
                                            value={orderFilterWaiter}
                                            onChange={e => setOrderFilterWaiter(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 min-w-[120px]"
                                        >
                                            <option value="">Tümü</option>
                                            {uniqueWaiters.map(w => (
                                                <option key={w} value={w}>{w}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {(orderFilterStatus || orderFilterWaiter) && (
                                        <button
                                            type="button"
                                            onClick={() => { setOrderFilterStatus(''); setOrderFilterWaiter(''); }}
                                            className="text-xs font-bold text-slate-500 hover:text-blue-600 uppercase tracking-wide"
                                        >
                                            Filtreyi temizle
                                        </button>
                                    )}
                                    <span className="text-xs font-semibold text-slate-500 ml-auto">
                                        {orderTables.length === baseOrderTables.length
                                            ? `${orderTables.length} kayıt`
                                            : `${orderTables.length} / ${baseOrderTables.length}`}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-4 pt-2">
                            {orderTables.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                    <Receipt className="w-14 h-14 text-slate-300 mb-3" />
                                    {baseOrderTables.length === 0 ? (
                                        <>
                                            <p className="text-slate-500 font-medium">Açık sipariş yok</p>
                                            <p className="text-sm text-slate-400 mt-1">Üst bölge / arama ile kontrol edin</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-slate-500 font-medium">Bu filtrelere uyan kayıt yok</p>
                                            <p className="text-sm text-slate-400 mt-1">{baseOrderTables.length} sipariş var — filtreleri değiştirin veya temizleyin</p>
                                            <button
                                                type="button"
                                                onClick={() => { setOrderFilterStatus(''); setOrderFilterWaiter(''); }}
                                                className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase touch-manipulation"
                                            >
                                                Filtreyi temizle
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {orderTables.map((table) => {
                                        const cfg = getStatusConfig(table.status);
                                        const startStr = table.startTime ? new Date(table.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
                                        const lines = (table.orders || []).filter(o => !o.isVoid);
                                        const open = !!ordersDetailOpen[table.id];
                                        return (
                                            <li key={table.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                                                        <span className="font-black text-slate-800 text-base">Masa {table.number}</span>
                                                        <span className="text-xs font-semibold text-slate-500 uppercase">{table.location ?? '—'}</span>
                                                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-white" style={{ backgroundColor: cfg.bg }}>{cfg.label}</span>
                                                        <span className="text-xs text-slate-400">{lines.length} kalem</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                                        <span className="text-sm text-slate-600">{table.waiter ?? '—'}</span>
                                                        <span className="text-sm text-slate-500">{table.seats} kişi</span>
                                                        <span className="text-sm font-bold text-slate-800">{formatMoneyAmount(table.total ?? 0)}</span>
                                                        <span className="text-sm text-slate-400">{startStr}</span>
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wide touch-manipulation"
                                                            onClick={() => setOrdersDetailOpen(s => ({ ...s, [table.id]: !s[table.id] }))}
                                                        >
                                                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            Detay
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wide touch-manipulation"
                                                            onClick={() => onSelectTable(table, table.seats)}
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                            Masaya git
                                                        </button>
                                                    </div>
                                                </div>
                                                {open && (
                                                    <div className="border-t border-slate-100 bg-slate-50/90 px-4 py-3">
                                                        {lines.length === 0 ? (
                                                            <p className="text-sm text-slate-500">Henüz ürün satırı yok (masa açık, sepet boş olabilir).</p>
                                                        ) : (
                                                            <ul className="space-y-2">
                                                                {lines.map((o) => (
                                                                    <li
                                                                        key={o.id}
                                                                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm border-b border-slate-200/80 last:border-0 pb-2 last:pb-0"
                                                                    >
                                                                        <div className="min-w-0 flex-1">
                                                                            <span className="font-semibold text-slate-800">{o.name}</span>
                                                                            {o.options && <span className="text-slate-500 text-xs ml-1">({o.options})</span>}
                                                                            {o.notes && <span className="block text-xs text-amber-700 mt-0.5">Not: {o.notes}</span>}
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2 shrink-0 text-slate-600">
                                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                                                                {ORDER_ITEM_STATUS_TR[o.status] ?? o.status}
                                                                            </span>
                                                                            <span>{o.quantity} × {formatMoneyAmount(o.price)}</span>
                                                                            <span className="font-bold text-slate-800">{formatMoneyAmount(o.quantity * o.price)}</span>
                                                                            {o.isComplementary && <span className="text-[10px] font-bold text-emerald-600 uppercase">İkram</span>}
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            </div>
                        </div>
                    );
                })()}
            </main>

            {/* Masa Aç Modalı */}
            {openModal && (
                <RestaurantTableOpenModal
                    table={openModal.table}
                    currentStaff={currentStaff?.name || 'Garson'}
                    onClose={() => setOpenModal(null)}
                    onConfirm={async (covers, reservationId) => {
                        if (reservationId) {
                            const { updateReservationStatus } = useRestaurantStore.getState();
                            await updateReservationStatus(reservationId, 'seated');
                        }

                        // Masayı aç (Adisyon oluştur)
                        try {
                            const storeTable = useRestaurantStore.getState().tables.find(t => t.id === openModal.table.id);
                            if (!storeTable || storeTable.status === 'empty') {
                                await useRestaurantStore.getState().openTable(openModal.table.id, currentStaff?.name || 'Garson');
                            }
                            onSelectTable(openModal.table, covers);
                            setOpenModal(null);
                        } catch (err: any) {
                            console.error('[RestaurantFloorPlan] Masa açılırken hata:', err);
                            alert('Masa açılırken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
                        }
                    }}
                />
            )}

            {/* Yönetici: uzun basma — masa menüsü (standart modal, z-index masa açılışı ile aynı) */}
            {tableAdminMenu && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    style={{ zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)' }}
                    onClick={() => setTableAdminMenu(null)}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden style={{ zIndex: 0 }} />
                    <div
                        className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]"
                        style={{ zIndex: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tight">Masa yönetimi</h2>
                                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                                        Masa {tableAdminMenu.number} · {tableAdminMenu.location}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setTableAdminMenu(null)}
                                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors touch-manipulation"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="grid grid-cols-1 gap-4 pt-2">
                                <button
                                    type="button"
                                    className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-slate-50 hover:bg-white active:bg-slate-100 text-slate-800 rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all active:scale-[0.97] border-2 border-slate-200 shadow-sm hover:shadow-md touch-manipulation cursor-pointer select-none"
                                    onClick={() => {
                                        setTableAdminEdit(tableAdminMenu);
                                        setTableAdminMenu(null);
                                    }}
                                >
                                    <Pencil className="w-6 h-6 opacity-70 shrink-0" />
                                    <span>Masa düzenle</span>
                                </button>
                                <button
                                    type="button"
                                    className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-slate-50 hover:bg-white active:bg-slate-100 text-slate-800 rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all active:scale-[0.97] border-2 border-slate-200 shadow-sm hover:shadow-md touch-manipulation cursor-pointer select-none"
                                    onClick={() => {
                                        if (!tableAdminMenu?.floorId) return;
                                        const r = regions.find(x => x.id === tableAdminMenu.floorId);
                                        setRegionEditFromMenu({ floorId: tableAdminMenu.floorId, currentName: r?.name ?? '' });
                                        setTableAdminMenu(null);
                                    }}
                                >
                                    <MapIcon className="w-6 h-6 opacity-70 shrink-0" />
                                    <span>Bölge adını güncelle</span>
                                </button>
                                <button
                                    type="button"
                                    className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all shadow-lg active:scale-[0.97] border border-rose-700 touch-manipulation cursor-pointer select-none"
                                    onClick={async () => {
                                        const t = tableAdminMenu;
                                        const warn =
                                            t.status !== 'empty'
                                                ? `Masa dolu veya adisyonlu görünüyor. Yine de "${t.number}" silinsin mi?`
                                                : `"${t.number}" masasını silmek istediğinize emin misiniz?`;
                                        if (!confirm(warn)) return;
                                        try {
                                            await removeTable(t.id);
                                            setTableAdminMenu(null);
                                        } catch (e: any) {
                                            alert(e?.message || 'Masa silinemedi');
                                        }
                                    }}
                                >
                                    <Trash2 className="w-6 h-6 drop-shadow-sm shrink-0" />
                                    <span>Masayı sil</span>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0">
                            <button
                                type="button"
                                className="w-full flex items-center justify-center gap-2 min-h-[56px] py-5 px-5 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 active:text-blue-600 active:bg-slate-100 font-black uppercase tracking-widest text-[13px] transition-all group touch-manipulation cursor-pointer select-none border border-slate-200"
                                onClick={() => setTableAdminMenu(null)}
                            >
                                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform shrink-0" />
                                <span>İptal</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bölge adını güncelle (masa yönetimi menüsünden açılır) */}
            {regionEditFromMenu && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    style={{ zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)' }}
                    onClick={() => !regionEditSaving && setRegionEditFromMenu(null)}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden style={{ zIndex: 0 }} />
                    <div
                        className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200"
                        style={{ zIndex: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tight">Bölge adını güncelle</h2>
                                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                                        Bölge seçin, yeni adını yazın
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !regionEditSaving && setRegionEditFromMenu(null)}
                                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors touch-manipulation"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-8 space-y-4">
                            {regionEditError && (
                                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-bold">
                                    {regionEditError}
                                </div>
                            )}
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Değiştirmek istediğiniz bölge</label>
                                <select
                                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-medium text-slate-800 bg-white appearance-none outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                                    value={regionEditSelectedId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        const r = regions.find(x => x.id === id);
                                        setRegionEditSelectedId(id);
                                        setRegionEditName(r?.name ?? '');
                                        setRegionEditError(null);
                                    }}
                                >
                                    {regions.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Yeni bölge adı</label>
                                <input
                                    className={cn(
                                        'w-full px-4 py-3 border rounded-2xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400',
                                        regionEditError ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200'
                                    )}
                                    value={regionEditName}
                                    onChange={e => {
                                        setRegionEditName(e.target.value);
                                        setRegionEditError(null);
                                    }}
                                    placeholder="Örn. Zemin kat"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-4 shrink-0">
                            <button
                                type="button"
                                disabled={regionEditSaving}
                                className="w-full flex items-center justify-center gap-2 min-h-[56px] py-5 px-5 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 active:bg-slate-100 font-black uppercase tracking-widest text-[13px] transition-all border border-slate-200 touch-manipulation cursor-pointer select-none disabled:opacity-50"
                                onClick={() => setRegionEditFromMenu(null)}
                            >
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                disabled={regionEditSaving || !regionEditSelectedId || !regionEditName.trim()}
                                className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all shadow-lg active:scale-[0.97] border border-blue-700 touch-manipulation cursor-pointer select-none disabled:opacity-50"
                                onClick={async () => {
                                    const name = regionEditName.trim();
                                    if (!name || !regionEditSelectedId) return;
                                    setRegionEditError(null);
                                    setRegionEditSaving(true);
                                    try {
                                        const storeId = await getStoreId();
                                        await updateRegion(regionEditSelectedId, { name }, storeId);
                                        setRegionEditFromMenu(null);
                                    } catch (e: any) {
                                        setRegionEditError(e?.message || 'Güncellenemedi');
                                    } finally {
                                        setRegionEditSaving(false);
                                    }
                                }}
                            >
                                {regionEditSaving ? '…' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Masa düzenleme modalı (standart modal, z-index masa açılışı ile aynı) */}
            {tableAdminEdit && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    style={{ zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)' }}
                    onClick={() => !editTableSaving && setTableAdminEdit(null)}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden style={{ zIndex: 0 }} />
                    <div
                        className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]"
                        style={{ zIndex: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tight">Masa düzenle</h2>
                                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                                        No, kişi sayısı ve bölge
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !editTableSaving && setTableAdminEdit(null)}
                                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors touch-manipulation"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            {editTableError && (
                                <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-bold">
                                    {editTableError}
                                </div>
                            )}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Masa no</label>
                                    <input
                                        className={cn(
                                            'w-full px-4 py-3 border rounded-2xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400',
                                            editTableError ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200'
                                        )}
                                        value={editTableForm.number}
                                        onChange={e => {
                                            setEditTableForm(f => ({ ...f, number: e.target.value }));
                                            setEditTableError(null);
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kişi sayısı</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={99}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                                        value={editTableForm.seats}
                                        onChange={e => setEditTableForm(f => ({ ...f, seats: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Bölge</label>
                                    <select
                                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-medium text-slate-800 bg-white appearance-none outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                                        value={editTableForm.floorId}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const r = regions.find(x => x.id === id);
                                            setEditTableForm(f => ({ ...f, floorId: id, regionName: r?.name ?? '' }));
                                        }}
                                    >
                                        {regions.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Bölge adı</label>
                                    <input
                                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
                                        value={editTableForm.regionName}
                                        onChange={e => setEditTableForm(f => ({ ...f, regionName: e.target.value }))}
                                        placeholder="Bölge adını buradan güncelleyebilirsiniz"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-4 shrink-0">
                            <button
                                type="button"
                                disabled={editTableSaving}
                                className="w-full flex items-center justify-center gap-2 min-h-[56px] py-5 px-5 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 active:bg-slate-100 font-black uppercase tracking-widest text-[13px] transition-all border border-slate-200 touch-manipulation cursor-pointer select-none disabled:opacity-50"
                                onClick={() => setTableAdminEdit(null)}
                            >
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                disabled={editTableSaving || !editTableForm.number.trim()}
                                className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all shadow-lg active:scale-[0.97] border border-blue-700 touch-manipulation cursor-pointer select-none disabled:opacity-50"
                                onClick={async () => {
                                    const newNumber = editTableForm.number.trim();
                                    if (!newNumber || !tableAdminEdit) return;
                                    const duplicate = tables.some(
                                        t => t.id !== tableAdminEdit.id && t.number.trim().toLowerCase() === newNumber.toLowerCase()
                                    );
                                    if (duplicate) {
                                        setEditTableError('Bu masa numarası zaten kullanılıyor. Farklı bir numara girin.');
                                        return;
                                    }
                                    const regionName = editTableForm.regionName.trim() || regions.find(r => r.id === editTableForm.floorId)?.name || '';
                                    setEditTableError(null);
                                    setEditTableSaving(true);
                                    try {
                                        const currentRegion = regions.find(r => r.id === editTableForm.floorId);
                                        if (regionName && currentRegion && regionName !== currentRegion.name) {
                                            const storeId = await getStoreId();
                                            await updateRegion(editTableForm.floorId, { name: regionName }, storeId);
                                        }
                                        await updateTable(
                                            {
                                                id: tableAdminEdit.id,
                                                number: newNumber,
                                                seats: editTableForm.seats,
                                                floorId: editTableForm.floorId,
                                                location: regionName,
                                            },
                                            true
                                        );
                                        setTableAdminEdit(null);
                                    } catch (e: any) {
                                        setEditTableError(e?.message || 'Kaydedilemedi');
                                    } finally {
                                        setEditTableSaving(false);
                                    }
                                }}
                            >
                                {editTableSaving ? '…' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showManageModal && manageType && isAdmin() && (
                <RestaurantManageModal
                    type={manageType}
                    regions={regions}
                    initialRegionId={targetRegionId}
                    onClose={() => { setShowManageModal(false); setManageType(null); }}
                    onSaveRegion={async (name) => {
                        const storeId = await getStoreId();
                        await addRegion({ id: uuidv4(), name, order: regions.length + 1 }, storeId ?? null);
                    }}
                    onSaveTable={async (data) => {
                        if (data.isBulk) {
                            const regionName = regions.find(r => r.id === data.regionId)?.name || '';
                            for (let i = 1; i <= (data.bulkCount || 1); i++) {
                                await addTable({
                                    id: uuidv4(),
                                    number: `${data.bulkPrefix}-${i}`,
                                    seats: data.seats,
                                    floorId: data.regionId,
                                    location: regionName
                                });
                            }
                        } else if (data.number) {
                            await addTable({
                                id: uuidv4(),
                                number: data.number,
                                seats: data.seats,
                                floorId: data.regionId,
                                location: regions.find(r => r.id === data.regionId)?.name || ''
                            });
                        }
                    }}
                />
            )}
        </div>
    );
}

const ADMIN_LONG_PRESS_MS = 650;

function TableCard({
    table,
    onClick,
    isMoveSource,
    isMoveTarget,
    moveTargetMode,
    enableAdminLongPress,
    onAdminLongPress,
}: {
    table: Table;
    onClick: () => void;
    isMoveSource?: boolean;
    isMoveTarget?: boolean;
    moveTargetMode?: boolean;
    enableAdminLongPress?: boolean;
    onAdminLongPress?: (table: Table) => void;
}) {
    const { markAsClean, kitchenOrders, markAsServed } = useRestaurantStore();
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressConsumedRef = useRef(false);

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const onCardPointerDown = (e: React.PointerEvent) => {
        if (!enableAdminLongPress || moveTargetMode || e.button !== 0) return;
        longPressConsumedRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            longPressConsumedRef.current = true;
            try {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(35);
            } catch { /* ignore */ }
            onAdminLongPress?.(table);
        }, ADMIN_LONG_PRESS_MS);
    };

    const onCardPointerEnd = () => {
        clearLongPressTimer();
    };

    const baseConfig = getStatusConfig(table.status);
    const kitchenOrder = table.status === 'kitchen' ? kitchenOrders.find(ko => ko.tableId === table.id) : null;

    // Serviste (mor) kart: bir süre sonra otomatik maviye dön
    if (table.status === 'served') {
        if (!servedFirstSeenAt.has(table.id)) servedFirstSeenAt.set(table.id, Date.now());
    } else {
        servedFirstSeenAt.delete(table.id);
    }
    const [servedElapsed, setServedElapsed] = React.useState(0);
    React.useEffect(() => {
        if (table.status !== 'served') return;
        const firstSeen = servedFirstSeenAt.get(table.id) ?? Date.now();
        const tick = () => setServedElapsed(Date.now() - firstSeen);
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [table.status, table.id]);
    const useBlueForServed = table.status === 'served' && servedElapsed >= SERVED_TO_BLUE_MS;
    const config = useBlueForServed ? TABLE_STATUS_CONFIG.occupied : baseConfig;

    // window.__tableLocks'tan aktif garson adını oku (her 1.5sn poll)
    const [activeStaff, setActiveStaff] = React.useState<string | null>(null);
    React.useEffect(() => {
        const read = () => {
            const locks: Map<string, string> | undefined = (window as any).__tableLocks;
            setActiveStaff(locks?.get(table.id) ?? null);
        };
        read();
        const iv = setInterval(read, 1500);
        return () => clearInterval(iv);
    }, [table.id]);

    const myName = useRestaurantStore.getState().currentStaff?.name;
    const isLocked = !!activeStaff && activeStaff !== myName;
    const isCleaning = table.status === 'cleaning';
    const clickable = moveTargetMode || (!isCleaning && !isLocked);

    const handleCardClick = (e: React.MouseEvent) => {
        if (longPressConsumedRef.current) {
            longPressConsumedRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (!clickable) return;
        onClick();
    };

    return (
        <div
            onClick={handleCardClick}
            onPointerDown={onCardPointerDown}
            onPointerUp={onCardPointerEnd}
            onPointerCancel={onCardPointerEnd}
            onPointerLeave={onCardPointerEnd}
            onContextMenu={e => {
                if (enableAdminLongPress && !moveTargetMode) e.preventDefault();
            }}
            style={{ backgroundColor: config.bg, touchAction: 'manipulation' }}
            className={cn(
                "relative cursor-pointer flex flex-col justify-between p-2 sm:p-3 lg:p-4 group hover:brightness-110 active:scale-[0.98] transition-all border border-white/20 rounded-xl sm:rounded-2xl lg:rounded-[2rem] aspect-square shadow-xl select-none",
                config.shadow,
                table.isLarge ? "col-span-2 !aspect-[2/1]" : "col-span-1",
                "text-white",
                !clickable && !enableAdminLongPress && "cursor-default",
                !clickable && enableAdminLongPress && "cursor-default",
                isMoveSource && "ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-200",
                isMoveTarget && "ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-200"
            )}
        >
            <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

            {/* Üst satır: toplam + timer veya mutfakta süresi */}
            <div className="flex justify-between items-start w-full pointer-events-none relative z-10">
                <div className="flex items-center gap-1 bg-black/30 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/10">
                    <History className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70" />
                    <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-tighter">
                        {table.total && table.total > 0 ? (table.total / 1000).toFixed(0) + 'k' : '0'}
                    </span>
                </div>
                {table.status === 'occupied' && table.startTime && (
                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/10 animate-pulse">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <TableTimer startTime={table.startTime} />
                    </div>
                )}
                {table.status === 'kitchen' && kitchenOrder && (
                    <div className="flex items-center gap-1 bg-white/25 backdrop-blur-md px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-white/20">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-90" />
                        <KitchenElapsed sentAt={kitchenOrder.sentAt} fallbackElapsed={kitchenOrder.elapsed} />
                    </div>
                )}
            </div>

            {/* Orta: masa numarası */}
            <div className="flex flex-col items-center justify-center flex-1 py-1 pointer-events-none relative z-10">
                <span className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tighter leading-none drop-shadow-2xl">{table.number}</span>
                <span className="text-[8px] sm:text-[9px] lg:text-[11px] font-black uppercase tracking-widest mt-1 opacity-80 italic">{table.location}</span>
                {/* Durum etiketi — ikon + kısa metin (masaya gitti / temizlendi vb.) */}
                {table.status !== 'empty' && (
                    <span
                        style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#fff' }}
                        className="mt-1 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    >
                        {table.status === 'served' && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />}
                        {table.status === 'cleaning' && <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />}
                        {table.status === 'kitchen' && <Utensils className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />}
                        {table.status === 'served' ? 'Masaya gitti' : table.status === 'cleaning' ? 'Temizlik' : config.label}
                    </span>
                )}
            </div>

            {/* Alt satır: kişi + tutar veya aksiyon butonları (Temizlendi ile aynı stil) */}
            <div className="flex justify-between items-center w-full relative z-20">
                {moveTargetMode && !isMoveSource ? (
                    <div className="w-full py-2 px-2 text-center rounded-xl bg-black/25 border border-white/20 pointer-events-none">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white/95">Hedef seçmek için karta dokunun</span>
                    </div>
                ) : isCleaning ? (
                    <button
                        onClick={e => { e.stopPropagation(); markAsClean(table.id); }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/20 hover:bg-white/35 active:scale-95 rounded-xl transition-all text-[10px] font-black uppercase border border-white/20"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Temizlendi
                    </button>
                ) : table.status === 'kitchen' && kitchenOrder ? (
                    <button
                        onClick={e => { e.stopPropagation(); markAsServed(kitchenOrder.id); }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/20 hover:bg-white/35 active:scale-95 rounded-xl transition-all text-[10px] font-black uppercase border border-white/20"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Masaya gitti
                    </button>
                ) : (
                    <>
                        <div className="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-2 bg-black/20 rounded-lg sm:rounded-2xl border border-white/5 shadow-inner pointer-events-none">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4 text-white/80" />
                            <span className="text-[10px] sm:text-xs font-black">{table.seats}</span>
                        </div>
                        {table.total && table.total > 0 && (
                            <div className="bg-white/10 backdrop-blur-xl px-2 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-2xl text-[10px] sm:text-[13px] font-black tracking-tighter border border-white/20 shadow-md pointer-events-none">
                                {table.total.toLocaleString('tr-TR')}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Aktif garson badge — sağ alt köşe */}
            {activeStaff && !isCleaning && (
                <div className={cn(
                    "absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-wide border backdrop-blur-md z-20 pointer-events-none",
                    isLocked
                        ? "bg-red-900/80 border-red-400/40 text-red-200"
                        : "bg-black/40 border-white/20 text-white/90"
                )}>
                    <Utensils className="w-2.5 h-2.5 opacity-80" />
                    <span>{activeStaff.split(' ')[0]}</span>
                </div>
            )}
        </div>
    );
}


function TableTimer({ startTime }: { startTime: string }) {
    const [elapsed, setElapsed] = React.useState('');
    React.useEffect(() => {
        const updateTimer = () => {
            const start = new Date(startTime).getTime();
            const now = new Date().getTime();
            const diff = Math.max(0, now - start);
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            if (hours > 0) setElapsed(`${hours}:${(minutes % 60).toString().padStart(2, '0')}`);
            else setElapsed(`${minutes}dk`);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [startTime]);
    return <span className="text-[9px] sm:text-[11px] font-black">{elapsed}</span>;
}

/** Mutfağa gönderildiğinden beri geçen dakika — her dakika güncellenir */
function KitchenElapsed({ sentAt, fallbackElapsed }: { sentAt?: string; fallbackElapsed?: number }) {
    const [minutes, setMinutes] = React.useState(() => {
        if (sentAt) return Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000);
        return Math.max(0, fallbackElapsed ?? 0);
    });
    React.useEffect(() => {
        if (!sentAt) return;
        const tick = () => setMinutes(Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000));
        const interval = setInterval(tick, 60000);
        tick();
        return () => clearInterval(interval);
    }, [sentAt]);
    return <span className="text-[9px] sm:text-[11px] font-black tabular-nums">{minutes} dk</span>;
}

function FloorSubTab({ icon, label, active, activeColor, onClick }: { icon: React.ReactNode, label: string, active?: boolean, activeColor?: string, onClick?: () => void }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-8 py-3 transition-all cursor-pointer group rounded-2xl my-auto",
                active ? cn("border border-white/10 shadow-lg", activeColor) : "text-white/50 hover:text-white hover:bg-white/10"
            )}
        >
            <div className="group-hover:scale-110 transition-transform">{icon}</div>
            <span className="text-[12px] font-black uppercase tracking-tight leading-none">{label}</span>
        </div>
    );
}
