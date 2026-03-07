import React, { useState } from 'react';
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
    Lock,
    Unlock,
    DollarSign
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../ui/utils';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Table } from '../types';
import { KrokiView } from './KrokiView';
import { useResponsive } from '@/hooks/useResponsive';
import { RestaurantService } from '../../../services/restaurant';
import { RestaurantZReport } from './RestaurantZReport';
import { POSOpenCashRegisterModal } from '../../pos/POSOpenCashRegisterModal';
import { RestaurantTableOpenModal } from './RestaurantTableOpenModal';
import { RestaurantManageModal } from './RestaurantManageModal';

function getStoreId(): string {
    try {
        const dev = localStorage.getItem('retailex_registered_device');
        if (dev) {
            const parsed = JSON.parse(dev);
            if (parsed.storeId) return parsed.storeId;
        }
    } catch { /* ignore */ }
    return '1'; // Default store ID if none registered
}

interface RestaurantFloorPlanProps {
    onSelectTable: (table: Table, covers: number) => void;
    onBack: () => void;
}

export function RestaurantFloorPlan({ onSelectTable, onBack }: RestaurantFloorPlanProps) {
    const [activeFloor, setActiveFloor] = useState('Tümü');
    const [activeView, setActiveView] = useState<'tables' | 'kroki' | 'orders'>('tables');
    const [searchTerm, setSearchTerm] = useState('');
    const [openModal, setOpenModal] = useState<{ table: Table; covers: number } | null>(null);
    const {
        tables,
        regions,
        addRegion,
        removeRegion,
        addTable,
        updateTable,
        mergeTables,
        transferTable,
        currentStaff,
        logout,
        isRegisterOpen,
        openRegister,
        closeRegister,
        registerOpeningCash
    } = useRestaurantStore();
    const { width } = useResponsive();
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showZReport, setShowZReport] = useState(false);
    const [zReportData, setZReportData] = useState<any>(null);

    const [showManageModal, setShowManageModal] = useState(false);
    const [manageType, setManageType] = useState<'region' | 'table' | null>(null);
    const [newRegionName, setNewRegionName] = useState('');
    const [newTableNumber, setNewTableNumber] = useState('');
    const [newTableSeats, setNewTableSeats] = useState(4);
    const [targetRegionId, setTargetRegionId] = useState<string>('');

    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkPrefix, setBulkPrefix] = useState('M');
    const [bulkCount, setBulkCount] = useState(5);

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

                    <div className="relative flex-1 max-w-lg group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                        <input
                            type="text"
                            placeholder="Masa veya sipariş ara..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-2xl h-12 pl-12 pr-4 text-sm focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all font-medium text-white placeholder:text-white/35 outline-none"
                        />
                    </div>

                    {/* Register Status Badge */}
                    <button
                        onClick={() => {
                            if (!isRegisterOpen) {
                                setShowRegisterModal(true);
                            } else if (confirm('Kasayı kapatmak ve Z-Raporu almak istediğinize emin misiniz?')) {
                                // Generate mock data for Z-Report (Real data logic will be added later)
                                const mockData = {
                                    date: new Date().toISOString(),
                                    openedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
                                    closedAt: new Date().toISOString(),
                                    staffName: currentStaff?.name || 'Garson',
                                    openingCash: registerOpeningCash,
                                    salesByCategory: [
                                        { category: 'Ana Yemekler', amount: 1250000, count: 45 },
                                        { category: 'İçecekler', amount: 450000, count: 82 },
                                        { category: 'Tatlılar', amount: 320000, count: 24 }
                                    ],
                                    paymentsByType: [
                                        { type: 'NAKİT', amount: 980000, count: 65 },
                                        { type: 'KREDI KARTI', amount: 1040000, count: 86 }
                                    ],
                                    voids: [
                                        { reason: 'Yanlış Sipariş', amount: 45000, count: 2 }
                                    ],
                                    complements: { amount: 25000, count: 3 },
                                    totalSales: 2020000,
                                    netCash: 980000
                                };
                                setZReportData(mockData);
                                setShowZReport(true);
                                closeRegister();
                            }
                        }}
                        className={cn(
                            "flex items-center gap-2.5 px-6 py-3 rounded-2xl transition-all active:scale-95 border font-black uppercase text-[12px] shrink-0 shadow-lg ml-2",
                            isRegisterOpen
                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30"
                                : "bg-rose-500/20 border-rose-500/30 text-rose-400 hover:bg-rose-500/30 animate-pulse"
                        )}
                    >
                        {isRegisterOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        <span>KASA: {isRegisterOpen ? 'AÇIK' : 'KAPALI'}</span>
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {currentStaff && (
                        <button
                            onClick={logout}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/20 group"
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
                    <button className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase text-white/90 hover:text-white transition-all rounded-xl border border-white/15">
                        <span>Rezervasyonlar</span>
                        <Calendar className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <main className="flex-1 overflow-hidden relative">
                {activeView === 'tables' && (
                    <div className="h-full overflow-auto p-4" style={{ backgroundColor: '#f1f3f5' }}>
                        <div
                            className="grid gap-4 w-full"
                            style={{
                                gridTemplateColumns: `repeat(${cols}, 1fr)`
                            }}
                        >
                            {floorTables.map((table) => (
                                <TableCard
                                    key={table.id}
                                    table={table}
                                    onClick={() => {
                                        setOpenModal({ table, covers: table.seats });
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {activeView === 'kroki' && (
                    <div className="h-full overflow-hidden">
                        <KrokiView activeFloor={activeFloor} />
                    </div>
                )}

                {activeView === 'orders' && (
                    <div className="h-full overflow-auto p-8 flex items-center justify-center" style={{ backgroundColor: '#f1f3f5' }}>
                        <div className="text-center">
                            <Receipt className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-xl font-black text-slate-400">Siparişler</h3>
                            <p className="text-sm text-slate-400 mt-1">Sipariş listesi yakında eklenecek</p>
                        </div>
                    </div>
                )}
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
                        onSelectTable(openModal.table, covers);
                        setOpenModal(null);
                    }}
                />
            )}

            {/* Management Modal */}
            {showManageModal && manageType && (
                <RestaurantManageModal
                    type={manageType}
                    regions={regions}
                    initialRegionId={targetRegionId}
                    onClose={() => { setShowManageModal(false); setManageType(null); }}
                    onSaveRegion={async (name) => {
                        const storeId = getStoreId();
                        if (storeId) {
                            await addRegion({ id: uuidv4(), name, order: regions.length + 1 }, storeId);
                        }
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

            {/* Register Opening Modal */}
            {showRegisterModal && (
                <POSOpenCashRegisterModal
                    onClose={() => setShowRegisterModal(false)}
                    onOpenRegister={(cash, note) => {
                        openRegister(cash, note);
                        setShowRegisterModal(false);
                    }}
                    currentStaff={currentStaff?.name || 'Garson'}
                />
            )}
        </div>
    );
}

function TableCard({ table, onClick }: { table: Table, onClick: () => void }) {
    const statusConfig = {
        empty: { bg: "#10b981", shadow: "shadow-emerald-500/20", label: "BOŞ" },
        occupied: { bg: "#3b82f6", shadow: "shadow-blue-500/30", label: "DOLU" },
        kitchen: { bg: "#f59e0b", shadow: "shadow-orange-500/30", label: "MUTFAK" },
        served: { bg: "#8b5cf6", shadow: "shadow-purple-500/30", label: "SERVİS" },
        billing: { bg: "#ef4444", shadow: "shadow-red-500/40", label: "HESAP" },
        reserved: { bg: "#f59e0b", shadow: "shadow-amber-500/20", label: "REZERVE" },
        cleaning: { bg: "#64748b", shadow: "shadow-slate-500/20", label: "TEMİZLİK" },
    };

    const config = statusConfig[table.status] || statusConfig.empty;
    const isLocked = table.lockedByStaffId && table.lockedByStaffId !== useRestaurantStore.getState().currentStaff?.id;

    return (
        <div
            onClick={isLocked ? undefined : onClick}
            style={{ backgroundColor: config.bg }}
            className={cn(
                "relative cursor-pointer flex flex-col justify-between p-2 sm:p-3 lg:p-4 group hover:brightness-110 active:scale-[0.98] transition-all border border-white/20 rounded-xl sm:rounded-2xl lg:rounded-[2rem] aspect-square shadow-xl",
                config.shadow,
                table.isLarge ? "col-span-2 !aspect-[2/1]" : "col-span-1",
                "text-white",
                isLocked && "cursor-not-allowed grayscale-[0.5] brightness-75"
            )}
        >
            {isLocked && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-xl sm:rounded-2xl lg:rounded-[2rem]">
                    <div className="bg-white/90 p-2 rounded-full mb-2">
                        <Users className="w-5 h-5 text-red-600" />
                    </div>
                    <span className="text-[10px] font-black uppercase text-white drop-shadow-md">MEŞGUL</span>
                    <span className="text-[8px] font-bold text-white/80">{table.lockedByStaffName?.split(' ')[0]}</span>
                </div>
            )}
            <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
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
            </div>
            <div className="flex flex-col items-center justify-center flex-1 py-1 pointer-events-none relative z-10">
                <span className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tighter leading-none drop-shadow-2xl">{table.number}</span>
                <span className="text-[8px] sm:text-[9px] lg:text-[11px] font-black uppercase tracking-widest mt-1 opacity-80 italic">{table.location}</span>
            </div>
            <div className="flex justify-between items-center w-full pointer-events-none relative z-10">
                <div className="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-2 bg-black/20 rounded-lg sm:rounded-2xl border border-white/5 shadow-inner">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 text-white/80" />
                    <span className="text-[10px] sm:text-xs font-black">{table.seats}</span>
                </div>
                {table.total && table.total > 0 && (
                    <div className="bg-white/10 backdrop-blur-xl px-2 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-2xl text-[10px] sm:text-[13px] font-black tracking-tighter border border-white/20 shadow-md">
                        {table.total.toLocaleString('tr-TR')}
                    </div>
                )}
            </div>
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
