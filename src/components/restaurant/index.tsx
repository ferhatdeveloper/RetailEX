import React, { useState, useEffect, Suspense } from 'react';
import {
    UtensilsCrossed,
    LayoutGrid,
    ChefHat,
    History,
    Settings,
    PlusCircle,
    Clock,
    LogOut,
    Users,
    ShoppingCart,
    ShoppingBag,
    Bike,
    BarChart3,
    Box,
    CreditCard,
    Monitor,
    Coffee,
    Layers,
    Languages,
    User,
    X,
    RefreshCw,
    CalendarDays,
    ZoomIn,
    ZoomOut
} from 'lucide-react';

// Sub-components
import { RestaurantFloorPlan } from './components/RestaurantFloorPlan';
import { KitchenDisplay } from './components/KitchenDisplay';
import { RecipeManagement } from './components/RecipeManagement';
import { TicketHistory } from './components/TicketHistory';
import { RestPOS } from './components/RestPOS';
import { ModuleWrapper } from './components/ModuleWrapper';
import { POSOpenCashRegisterModal } from '../pos/POSOpenCashRegisterModal';
import { RestaurantZReport } from './components/RestaurantZReport';
import { RestaurantReservations } from './components/RestaurantReservations';
import { RestaurantSettings } from './components/RestaurantSettings';
import { DeliveryManagement } from './components/DeliveryManagement';
import { TakeawayManagement } from './components/TakeawayManagement';

// Lazy loaded components
const CustomerManagementModule = React.lazy(() => import('../trading/contacts/CustomerManagementModule').then(m => ({ default: m.CustomerManagementModule })));
const StockModule = React.lazy(() => import('../inventory/stock/StockModule').then(m => ({ default: m.StockModule })));
const ReportsModule = React.lazy(() => import('../reports/ReportsModule').then(m => ({ default: m.ReportsModule })));
const KasalarModule = React.lazy(() => import('../accounting/cash-ops/KasalarModule').then(m => ({ default: m.KasalarModule })));
const RoleManagement = React.lazy(() => import('../system/RoleManagement').then(m => ({ default: m.RoleManagement })));

import { Table, Staff } from './types';
import { useRestaurantStore } from './store/useRestaurantStore';
import { usePermission } from '../../shared/hooks/usePermission';
import { RestaurantService } from '../../services/restaurant';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageSelectionModal } from '../system/LanguageSelectionModal';
import type { Product, Customer, Campaign, User as UserType, Sale } from '../../core/types';
import './restaurant-premium.css';

interface RestaurantModuleProps {
    products: Product[];
    customers: Customer[];
    campaigns: Campaign[];
    currentUser: UserType;
    onSaleComplete: (sale: Sale) => void;
    onLogout?: () => void;
    onBack?: () => void;
    currentStaff?: Staff | null;
    selectedCustomer?: Customer | null;
    table?: Table | null;
    setActiveModule?: (module: string) => void;
    rtlMode?: boolean;
    setRtlMode?: (value: boolean) => void;
    zoomLevel?: number;
    setZoomLevel?: (value: number) => void;
}

export default function RestaurantModule({
    zoomLevel = 100,
    setZoomLevel = () => { },
    rtlMode = false,
    setRtlMode = () => { },
    products = [],
    customers = [],
    campaigns = [],
    currentUser,
    onSaleComplete = () => { },
    onLogout = () => { },
    currentStaff: initialStaff = null,
    selectedCustomer: initialSelectedCustomer = null,
    setActiveModule
}: RestaurantModuleProps) {
    const { hasPermission } = usePermission();
    const { t } = useLanguage();

    const handleZoomIn = () => {
        if (!setZoomLevel || zoomLevel === undefined) return;
        const next = Math.min(zoomLevel + 10, 200);
        setZoomLevel(next);
        localStorage.setItem('retailos_zoom_level', next.toString());
    };

    const handleZoomOut = () => {
        if (!setZoomLevel || zoomLevel === undefined) return;
        const next = Math.max(zoomLevel - 10, 50);
        setZoomLevel(next);
        localStorage.setItem('retailos_zoom_level', next.toString());
    };

    const handleZoomReset = () => {
        if (!setZoomLevel) return;
        setZoomLevel(100);
        localStorage.setItem('retailos_zoom_level', '100');
    };
    const [activeTab, setActiveTab] = useState<'dashboard' | 'floor' | 'pos' | 'kds' | 'history' | 'recipes' | 'customers' | 'stock' | 'reports' | 'settings' | 'cash' | 'reservations' | 'management' | 'delivery' | 'takeaway'>('dashboard');
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);
    const [initialCovers, setInitialCovers] = useState(0);
    const [posMode, setPosMode] = useState<'table' | 'retail' | 'selfservice'>('table');
    const {
        tables,
        loadTables,
        loadMenu,
        loadRegions,
        loadRecipes,
        currentStaff: storeStaff,
        workDayDate,
        isDayActive,
        openRegister,
        closeRegister,
        registerOpeningCash
    } = useRestaurantStore();

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showZReport, setShowZReport] = useState(false);
    const [zReportData, setZReportData] = useState<any>(null);
    const [showLanguageModal, setShowLanguageModal] = useState(false);

    useEffect(() => {
        loadTables();
        loadMenu();
        loadRegions();
        loadRecipes();
    }, []);

    const handleSelectTable = (table: Table, covers: number) => {
        setSelectedTable(table);
        setInitialCovers(covers);
        setActiveTab('pos');
    };

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
                hr{border:0;border-top:1px dashed #000;margin:15px 0}
                table{width:100%;border-collapse:collapse;margin:10px 0}
                th{text-align:left;border-bottom:1px solid #000;padding:5px 2px}
                td{padding:5px 2px}
            </style>
            </head><body>
            <div class="ticket">
                <h1>RETAILEX ERP</h1>
                <hr/>
                <p>TARİH: ${new Date(d.date).toLocaleDateString('tr-TR')}</p>
                <p>SORUMLU: ${d.staffName}</p>
                <hr/>
                <h3>TOPLAM SATIŞ: ${fmt(d.totalSales)}</h3>
                <hr/>
                <table>
                    <thead><tr><th>Kategori</th><th style="text-align:right">Adet</th><th style="text-align:right">Tutar</th></tr></thead>
                    <tbody>${categoryRows}</tbody>
                </table>
                <hr/>
                <table>
                    <thead><tr><th>Ödeme</th><th style="text-align:right">Adet</th><th style="text-align:right">Tutar</th></tr></thead>
                    <tbody>${paymentRows}</tbody>
                </table>
            </div>
            <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
            </body></html>
        `);
        win.document.close();
    };

    const activeTablesCount = tables.filter(t => t.status !== 'empty' && t.status !== 'reserved').length;
    const emptyTablesCount = tables.filter(t => t.status === 'empty').length;

    return (
        <div className="flex flex-col h-full bg-[#f1f3f5] overflow-hidden font-sans relative">
            {/* Unified Restaurant Header */}
            <header className="h-14 flex items-center justify-between px-6 shadow-2xl shrink-0 z-50" style={{ backgroundColor: '#2563eb', borderBottom: '1px solid rgba(96,165,250,0.4)' }}>
                <div className="flex items-center gap-2 select-none">
                    <h1 className="text-[32px] font-black tracking-tighter flex items-center" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                        <span className="text-white drop-shadow-md">Rest</span>
                        <span className="text-red-500 italic drop-shadow-md" style={{ marginLeft: '-1px' }}>Ex</span>
                    </h1>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-6">
                        <div className="flex items-center gap-2 text-white/70 font-bold text-sm">
                            <Users className="w-4 h-4" /> <span>{activeTablesCount + emptyTablesCount} Masa</span>
                        </div>
                        <div className="flex items-center gap-2 font-bold text-sm text-blue-200">
                            <PlusCircle className="w-4 h-4" /> <span>Garson Talebi: 0</span>
                        </div>
                    </div>

                    <div className="h-6 w-[1px] bg-white/10"></div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Mali Gün</span>
                            <span className="text-sm font-bold text-white leading-none">{workDayDate || 'KAPALI'}</span>
                        </div>

                        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/5">
                            <button
                                onClick={handleZoomOut}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
                                title="Küçült"
                            >
                                <ZoomOut className="w-4.5 h-4.5" />
                            </button>
                            <button
                                onClick={handleZoomReset}
                                className="px-2 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white font-bold text-[10px] transition-all active:scale-95 min-w-[45px]"
                                title="Sıfırla"
                            >
                                {zoomLevel}%
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
                                title="Büyüt"
                            >
                                <ZoomIn className="w-4.5 h-4.5" />
                            </button>
                        </div>

                        <div className="h-6 w-[1px] bg-white/10"></div>

                        <button
                            onClick={() => setShowLanguageModal(true)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-all text-white/70 hover:text-white group"
                            title="Dil Değiştir"
                        >
                            <Languages className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                        </button>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-400/30">
                                <User className="w-4 h-4 text-blue-100" />
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <span className="text-xs font-bold text-white leading-tight">{currentUser.fullName || currentUser.username}</span>
                                <span className="text-[9px] font-medium text-blue-200 uppercase tracking-wider">{currentUser.role || 'GÖREVLİ'}</span>
                            </div>
                        </div>

                        <button
                            onClick={onLogout}
                            className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all text-white/70"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => {
                                if (typeof window !== 'undefined' && (window as any).electron) {
                                    (window as any).electron.close();
                                } else {
                                    window.close();
                                }
                            }}
                            className="p-2 hover:bg-white/10 rounded-lg transition-all text-white/40 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden relative">
                {activeTab === 'dashboard' ? (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* Status Cards */}
                        <div className="grid grid-cols-3 gap-0 shrink-0 shadow-sm relative z-10 border-b border-slate-200">
                            <div className="res-stat-card cursor-pointer bg-red-500" onClick={() => setActiveTab('floor')}>
                                <UtensilsCrossed className="w-6 h-6 text-white" />
                                <div className="ml-5">
                                    <div className="res-stat-value text-white">{activeTablesCount} DOLU</div>
                                    <div className="res-stat-label text-white/80">MASA DURUMU</div>
                                </div>
                            </div>
                            <div className="res-stat-card cursor-pointer bg-blue-500" onClick={() => setActiveTab('floor')}>
                                <LayoutGrid className="w-6 h-6 text-white" />
                                <div className="ml-5">
                                    <div className="res-stat-value text-white">{emptyTablesCount} BOŞ</div>
                                    <div className="res-stat-label text-white/80">MÜSAİT MASA</div>
                                </div>
                            </div>
                            <div className="res-stat-card cursor-pointer" style={{ backgroundColor: isDayActive ? '#10b981' : '#8b5cf6' }}
                                onClick={async () => {
                                    if (!isDayActive) setShowRegisterModal(true);
                                    else {
                                        if (activeTablesCount > 0) {
                                            alert(`Uyarı: Kapatılamaz! Hala açık olan ${activeTablesCount} adet masa var.`);
                                            return;
                                        }
                                        if (confirm('Mali günü kapatmak ve Z-Raporu almak istiyor musunuz?')) {
                                            const closedAt = new Date().toISOString();
                                            const dateStr = workDayDate || new Date().toISOString().slice(0, 10);
                                            try {
                                                const dbData = await RestaurantService.getZReportData(dateStr);
                                                setZReportData({
                                                    date: closedAt,
                                                    openedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
                                                    closedAt,
                                                    staffName: storeStaff?.name || 'Yönetici',
                                                    openingCash: registerOpeningCash,
                                                    ...dbData,
                                                });
                                                setShowZReport(true);
                                                closeRegister();
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }
                                    }
                                }}>
                                <Clock className="w-6 h-6 text-white" />
                                <div className="ml-5">
                                    <div className="res-stat-value text-white">{isDayActive ? 'GÜNÜ KAPAT' : 'GÜNÜ BAŞLAT'}</div>
                                    <div className="res-stat-label text-white/80">MALİ GÜN ({workDayDate || 'KAPALI'})</div>
                                </div>
                            </div>
                        </div>

                        {/* Tiles Grid */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6">
                                {hasPermission('restaurant.pos', 'READ') && (
                                    <DashboardTile icon={<UtensilsCrossed />} label="Servis" color="#ef4444" onClick={() => setActiveTab('floor')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.delivery', 'READ') && (
                                    <DashboardTile icon={<Bike />} label="Paket Servis" color="#3b82f6" onClick={() => setActiveTab('delivery')} disabled={!isDayActive} />
                                )}
                                {hasPermission('pos', 'READ') && (
                                    <DashboardTile icon={<ShoppingCart />} label="Perakende" color="#10b981" onClick={() => { setSelectedTable(null); setPosMode('retail'); setActiveTab('pos'); }} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.takeaway', 'READ') && (
                                    <DashboardTile icon={<ShoppingBag />} label="Gel Al" color="#f59e0b" onClick={() => setActiveTab('takeaway')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.selfservice', 'READ') && (
                                    <DashboardTile icon={<Coffee />} label="Self Servis" color="#8b5cf6" onClick={() => { setSelectedTable(null); setPosMode('selfservice'); setActiveTab('pos'); }} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.orders', 'READ') && (
                                    <DashboardTile icon={<History />} label="Siparişler" color="#06b6d4" onClick={() => setActiveTab('history')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.reservations', 'READ') && (
                                    <DashboardTile icon={<CalendarDays />} label="Rezervasyon" color="#f43f5e" onClick={() => setActiveTab('reservations')} disabled={!isDayActive} />
                                )}
                                {hasPermission('contacts.customers', 'READ') && (
                                    <DashboardTile icon={<Users />} label="Müşteriler" color="#1fb141" onClick={() => setActiveTab('customers')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.reports', 'READ') && (
                                    <DashboardTile icon={<BarChart3 />} label="Raporlar" color="#6366f1" onClick={() => setActiveTab('reports')} disabled={!isDayActive} />
                                )}
                                {hasPermission('stock', 'READ') && (
                                    <DashboardTile icon={<Box />} label="Stok" color="#64748b" onClick={() => setActiveTab('stock')} disabled={!isDayActive} />
                                )}
                                {hasPermission('accounting.cash', 'READ') && (
                                    <DashboardTile icon={<CreditCard />} label="Kasa" color="#fb923c" onClick={() => setActiveTab('cash')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.smart_table', 'READ') && (
                                    <DashboardTile icon={<Monitor />} label="Akıllı Masa" color="#0ea5e9" onClick={() => setActiveTab('floor')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.kds', 'READ') && (
                                    <DashboardTile icon={<ChefHat />} label="Mutfak Paneli" color="#ec4899" onClick={() => setActiveTab('kds')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.recipes', 'READ') && (
                                    <DashboardTile icon={<Layers />} label="Reçeteler" color="#475569" onClick={() => setActiveTab('recipes')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.settings', 'READ') && (
                                    <DashboardTile icon={<Settings />} label="Ayarlar" color="#0f172a" onClick={() => setActiveTab('settings')} />
                                )}
                                {hasPermission('management', 'READ') && (
                                    <DashboardTile icon={<LayoutGrid />} label="Yönetim" color="#d946ef" onClick={() => setActiveModule?.('backoffice')} />
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <RestaurantContent
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        products={products}
                        customers={customers}
                        campaigns={campaigns}
                        initialSelectedCustomer={initialSelectedCustomer}
                        currentStaff={initialStaff || storeStaff}
                        currentUser={currentUser}
                        onSaleComplete={onSaleComplete}
                        onLogout={onLogout}
                        selectedTable={selectedTable}
                        initialCovers={initialCovers}
                        posMode={posMode}
                        handleSelectTable={handleSelectTable}
                    />
                )}
            </main>

            {/* Modals */}
            {showRegisterModal && (
                <POSOpenCashRegisterModal
                    onClose={() => setShowRegisterModal(false)}
                    currentStaff={storeStaff?.name || initialStaff?.name || 'Yönetici'}
                    onOpenRegister={(amount, note) => {
                        openRegister(amount, note);
                        setShowRegisterModal(false);
                        setActiveTab('floor');
                    }}
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
            {showLanguageModal && (
                <LanguageSelectionModal
                    onClose={() => setShowLanguageModal(false)}
                    rtlMode={rtlMode}
                    setRtlMode={setRtlMode}
                />
            )}
        </div>
    );
}

// Separate component for clarity
interface RestaurantContentProps {
    activeTab: string;
    setActiveTab: (tab: any) => void;
    products: Product[];
    customers: Customer[];
    campaigns: Campaign[];
    initialSelectedCustomer: Customer | null;
    currentStaff: Staff | null;
    currentUser: UserType;
    onSaleComplete: (sale: Sale) => void;
    onLogout: () => void;
    selectedTable: Table | null;
    initialCovers: number;
    posMode: 'table' | 'retail' | 'selfservice';
    handleSelectTable: (table: Table, covers: number) => void;
}

function RestaurantContent({
    activeTab,
    setActiveTab,
    products,
    customers,
    campaigns,
    initialSelectedCustomer,
    currentStaff,
    currentUser,
    onSaleComplete,
    onLogout,
    selectedTable,
    initialCovers,
    posMode,
    handleSelectTable
}: RestaurantContentProps) {
    return (
        <div className="h-full bg-[#020617]">
            {activeTab === 'floor' && <RestaurantFloorPlan onSelectTable={handleSelectTable} onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'kds' && <KitchenDisplay onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'pos' && (
                <RestPOS
                    products={products}
                    customers={customers}
                    campaigns={campaigns}
                    selectedCustomer={initialSelectedCustomer}
                    currentStaff={currentStaff}
                    currentUser={currentUser}
                    onSaleComplete={onSaleComplete}
                    onLogout={onLogout}
                    onBack={() => setActiveTab(selectedTable ? 'floor' : 'dashboard')}
                    table={selectedTable}
                    covers={initialCovers}
                    posMode={posMode}
                />
            )}
            {activeTab === 'recipes' && <RecipeManagement onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'history' && <TicketHistory onClose={() => setActiveTab('dashboard')} />}
            {activeTab === 'customers' && (
                <ModuleWrapper title="Müşteri Yönetimi" onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><CustomerManagementModule sales={[]} customers={customers} setCustomers={() => { }} /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'stock' && (
                <ModuleWrapper title="Stok ve Envanter" onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><StockModule products={products} setProducts={() => { }} /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'reports' && (
                <ModuleWrapper title="Raporlar ve Analiz" onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><ReportsModule sales={[]} products={products} /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'settings' && (
                <div className="h-full bg-white"><RestaurantSettings onBack={() => setActiveTab('dashboard')} /></div>
            )}
            {activeTab === 'cash' && (
                <ModuleWrapper title="Kasa ve Finans" onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><KasalarModule /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'reservations' && (
                <RestaurantReservations onBack={() => setActiveTab('dashboard')} />
            )}
            {activeTab === 'management' && (
                <Suspense fallback={<LoadingSpinner />}><RoleManagement onBack={() => setActiveTab('dashboard')} /></Suspense>
            )}
            {activeTab === 'delivery' && (
                <Suspense fallback={<LoadingSpinner />}><DeliveryManagement onBack={() => setActiveTab('dashboard')} /></Suspense>
            )}
            {activeTab === 'takeaway' && (
                <Suspense fallback={<LoadingSpinner />}><TakeawayManagement onBack={() => setActiveTab('dashboard')} /></Suspense>
            )}
        </div>
    );
}

function LoadingSpinner() {
    return <div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>;
}

function DashboardTile({ icon, label, color, onClick, disabled }: any) {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            className={`flex flex-col items-center justify-center p-6 res-dashboard-tile group transition-all relative ${disabled ? 'opacity-60 grayscale cursor-not-allowed' : ''}`}
        >
            <div className={`mb-4 transition-transform ${disabled ? '' : 'group-hover:scale-110'}`}>
                {React.cloneElement(icon as any, { size: 48, color: disabled ? "#94a3b8" : (color || "#ef4444") })}
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">{label}</span>
            {!disabled && <div className="absolute top-0 left-0 right-0 h-1 transition-opacity opacity-0 group-hover:opacity-100" style={{ backgroundColor: color }}></div>}
        </button>
    );
}
