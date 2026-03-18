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
    Lock,
    Unlock,
    DollarSign,
    CheckCircle2,
    Sparkles,
    ArrowRightLeft,
    Merge,
    RotateCcw
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
import { getStatusConfig, TABLE_STATUS_CONFIG } from '../utils/tableStatusConfig';

/** Serviste (mor) kartın otomatik maviye dönme süresi — masaya ürün gitmiş (ms) */
const SERVED_TO_BLUE_MS = 15 * 1000;
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
}

export function RestaurantFloorPlan({ onSelectTable, onBack, moveTableSource, moveTargetTableId, onMoveTargetSelect, onMoveConfirm, onMoveCancel, onRequestStaffChange }: RestaurantFloorPlanProps) {
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
        moveTable,
        currentStaff,
        logout,
        isRegisterOpen,
        openRegister,
        closeRegister,
        registerOpeningCash,
        workDayDate,
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
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handlePrintZReport = () => {
        if (!zReportData) return;
        const d = zReportData;
        const fmt = (num: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'IQD' }).format(num);

        const win = window.open('', '_blank', 'width=450,height=800');
        if (!win) return;

        const categoryRows = (d.salesByCategory || []).map((c: any) =>
            `<tr><td>${c.category}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">${fmt(c.amount)}</td></tr>`
        ).join('');

        const paymentRows = (d.paymentsByType || []).map((p: any) =>
            `<tr><td>${p.type}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
        ).join('');

        const voidRows = (d.voids || []).map((v: any) =>
            `<tr><td>${v.reason}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${fmt(v.amount)}</td></tr>`
        ).join('');

        win.document.write(`
            <html><head><title>Z-Raporu - ${new Date(d.date).toLocaleDateString('tr-TR')}</title>
            <style>
                body{font-family:'Courier New',Courier,monospace;margin:0;padding:30px;font-size:13px;color:#000;background:#fff}
                .ticket{max-width:400px;margin:0 auto}
                h1{text-align:center;margin:0;font-size:22px;font-weight:900;letter-spacing:-1px}
                h2{text-align:center;margin:5px 0;font-size:16px;border-bottom:2px solid #000;padding-bottom:10px;text-transform:uppercase}
                hr{border:0;border-top:1px dashed #000;margin:15px 0}
                table{width:100%;border-collapse:collapse;margin:10px 0}
                th{text-align:left;border-bottom:1px solid #000;padding:5px 2px;font-weight:900;text-transform:uppercase;font-size:11px}
                td{padding:5px 2px}
                .summary-box{margin:20px 0;padding:15px;border:1px solid #000;background:#f9f9f9}
                .summary-item{display:flex;justify-content:space-between;margin-bottom:5px;font-weight:900;font-size:15px}
                .footer{text-align:center;font-size:11px;margin-top:40px;border-top:1px solid #eee;padding-top:20px}
                .label{font-weight:bold;color:#666;width:100px;display:inline-block}
            </style>
            </head><body>
            <div class="ticket">
                <h1>RETAILEX ERP</h1>
                <h2>Z-RAPORU ÖZETİ</h2>
                
                <p><span class="label">TARİH:</span> ${new Date(d.date).toLocaleDateString('tr-TR')}</p>
                <p><span class="label">AÇILIŞ:</span> ${new Date(d.openedAt).toLocaleString('tr-TR')}</p>
                <p><span class="label">KAPANIŞ:</span> ${new Date(d.closedAt).toLocaleString('tr-TR')}</p>
                <p><span class="label">SORUMLU:</span> ${d.staffName}</p>
                
                <hr/>
                
                <div class="summary-box">
                    <div style="display:flex; justify-content:space-between"><span>TOPLAM SATIŞ:</span> <span>${fmt(d.totalSales)}</span></div>
                    <div style="display:flex; justify-content:space-between; margin-top:5px"><span>NET NAKİT:</span> <span>${fmt(d.netCash)}</span></div>
                </div>
                
                <hr/>
                
                <h3 style="font-size:13px;text-transform:uppercase;margin-bottom:5px">Kategori Bazlı Satışlar</h3>
                <table>
                    <thead><tr><th>Kategori</th><th style="text-align:right">Adet</th><th style="text-align:right">Tutar</th></tr></thead>
                    <tbody>${categoryRows}</tbody>
                </table>
                
                <hr/>
                
                <h3 style="font-size:13px;text-transform:uppercase;margin-bottom:5px">Ödeme Tipleri</h3>
                <table>
                    <thead><tr><th>Tip</th><th style="text-align:right">İşlem</th><th style="text-align:right">Tutar</th></tr></thead>
                    <tbody>${paymentRows}</tbody>
                </table>
                
                <hr/>
                
                <h3 style="font-size:13px;text-transform:uppercase;margin-bottom:5px">İptaller (Voids)</h3>
                <table>
                    <thead><tr><th>Neden</th><th style="text-align:right">Adet</th><th style="text-align:right">Tutar</th></tr></thead>
                    <tbody>${voidRows || '<tr><td colspan="3" style="text-align:center">- İptal Yok -</td></tr>'}</tbody>
                </table>
                
                <hr/>
                
                <p style="font-weight:bold">İKRAMLAR: ${d.complements.count} Ürün (${fmt(d.complements.amount)})</p>
                
                <div class="footer">
                    <p>RetailEX AI-Native Platform</p>
                    <p>Baskı Tarihi: ${new Date().toLocaleString('tr-TR')}</p>
                </div>
            </div>
            <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
            </body></html>
        `);
        win.document.close();
    };

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

                    {/* Register Status Badge */}
                    <button
                        onClick={async () => {
                            if (!isRegisterOpen) {
                                setShowRegisterModal(true);
                            } else if (confirm('Kasayı kapatmak ve Z-Raporu almak istediğinize emin misiniz?')) {
                                const closedAt = new Date().toISOString();
                                const dateStr = workDayDate || new Date().toISOString().slice(0, 10);
                                try {
                                    const dbData = await RestaurantService.getZReportData(dateStr);
                                    setZReportData({
                                        date: closedAt,
                                        openedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
                                        closedAt,
                                        staffName: currentStaff?.name || 'Garson',
                                        openingCash: registerOpeningCash,
                                        ...dbData,
                                    });
                                } catch (err) {
                                    console.error('[Z-Report] getZReportData failed:', err);
                                    setZReportData({
                                        date: closedAt, openedAt: closedAt, closedAt,
                                        staffName: currentStaff?.name || 'Garson',
                                        openingCash: registerOpeningCash,
                                        totalSales: 0, netCash: 0,
                                        salesByCategory: [], paymentsByType: [],
                                        voids: [], complements: { amount: 0, count: 0 },
                                    });
                                }
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
            <main className="flex-1 overflow-hidden relative z-0">
                {activeView === 'tables' && (
                    <div className="h-full overflow-auto flex flex-col" style={{ backgroundColor: '#f1f3f5' }}>
                        {/* Masa taşıma üst bar — kaynak seçiliyken; hedef seçilince Taşı/Birleştir/İptal burada */}
                        {moveTableSource && (
                            <div className="shrink-0 px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-amber-500/95 text-white border-b border-amber-600/50 shadow-lg">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <RotateCcw className="w-5 h-5 shrink-0" />
                                    {moveTargetTableId ? (
                                        <>
                                            <span className="font-black uppercase text-sm tracking-wide">
                                                Masa <span className="bg-white/20 px-2 py-0.5 rounded-lg">{moveTableSource.number}</span>
                                                <ArrowRightLeft className="inline-block w-4 h-4 mx-1.5 align-middle text-amber-200" />
                                                Masa <span className="bg-white/20 px-2 py-0.5 rounded-lg">{tables.find(t => t.id === moveTargetTableId)?.number ?? moveTargetTableId}</span>
                                            </span>
                                            {onMoveConfirm && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => onMoveConfirm('move', moveTargetTableId)}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-white text-amber-600 hover:bg-amber-50 rounded-xl font-black uppercase text-[11px] transition-all shadow"
                                                    >
                                                        <ArrowRightLeft className="w-3.5 h-3.5" /> Taşı
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onMoveConfirm('merge', moveTargetTableId)}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[11px] transition-all"
                                                    >
                                                        <Merge className="w-3.5 h-3.5" /> Birleştir
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <span className="font-black uppercase text-sm tracking-wide">
                                            Masa <span className="bg-white/20 px-2 py-0.5 rounded-lg">{moveTableSource.number}</span> taşınıyor — hedef masayı seçin
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={onMoveCancel}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-black text-[12px] uppercase transition-all shrink-0"
                                >
                                    <X className="w-4 h-4" /> İptal
                                </button>
                            </div>
                        )}
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
                                        moveTargetTableId={moveTableSource && table.id !== moveTableSource.id ? table.id : undefined}
                                        onMoveTargetSelect={onMoveTargetSelect}
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

            {/* Management Modal */}
            {showManageModal && manageType && (
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

            {showZReport && zReportData && (
                <RestaurantZReport
                    data={zReportData}
                    onClose={() => {
                        setShowZReport(false);
                        setZReportData(null);
                    }}
                    onPrint={handlePrintZReport}
                />
            )}
        </div>
    );
}

function TableCard({ table, onClick, isMoveSource, isMoveTarget, moveTargetMode, moveTargetTableId, onMoveTargetSelect }: { table: Table; onClick: () => void; isMoveSource?: boolean; isMoveTarget?: boolean; moveTargetMode?: boolean; moveTargetTableId?: string; onMoveTargetSelect?: (id: string) => void }) {
    const { markAsClean, kitchenOrders, markAsServed } = useRestaurantStore();
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

    return (
        <div
            onClick={clickable ? onClick : undefined}
            style={{ backgroundColor: config.bg }}
            className={cn(
                "relative cursor-pointer flex flex-col justify-between p-2 sm:p-3 lg:p-4 group hover:brightness-110 active:scale-[0.98] transition-all border border-white/20 rounded-xl sm:rounded-2xl lg:rounded-[2rem] aspect-square shadow-xl",
                config.shadow,
                table.isLarge ? "col-span-2 !aspect-[2/1]" : "col-span-1",
                "text-white",
                !clickable && "cursor-default",
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
                {moveTargetMode && !isMoveSource && moveTargetTableId && onMoveTargetSelect ? (
                    <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white active:scale-95 rounded-xl sm:rounded-2xl transition-all text-xs sm:text-[13px] font-black uppercase border-2 border-amber-400 shadow-lg shadow-amber-900/30 hover:shadow-amber-800/40 pointer-events-auto cursor-pointer touch-manipulation"
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onMoveTargetSelect(moveTargetTableId);
                        }}
                    >
                        <ArrowRightLeft className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 pointer-events-none" />
                        <span className="pointer-events-none">Taşı</span>
                    </button>
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
