import React, { useState, useEffect, Suspense } from 'react';
import {
    UtensilsCrossed,
    LayoutGrid,
    ChefHat,
    History,
    Settings,
    PlusCircle,
    TrendingUp,
    Clock,
    LogOut,
    ChevronLeft,
    Users,
    ShoppingCart,
    ShoppingBag,
    Bike,
    Smartphone,
    Activity,
    Gamepad2,
    BarChart3,
    Box,
    CreditCard,
    Monitor,
    Repeat,
    PenTool,
    Smile,
    Package,
    CalendarClock,
    Coffee,
    Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';

// Sub-components (to be created)
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


// Lazy load global modules for restaurant dashboard
const CustomerManagementModule = React.lazy(() => import('../trading/contacts/CustomerManagementModule').then(m => ({ default: m.CustomerManagementModule })));
const StockModule = React.lazy(() => import('../inventory/stock/StockModule').then(m => ({ default: m.StockModule })));
const ReportsModule = React.lazy(() => import('../reports/ReportsModule').then(m => ({ default: m.ReportsModule })));
const SettingsPanel = React.lazy(() => import('../system/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const KasalarModule = React.lazy(() => import('../accounting/cash-ops/KasalarModule').then(m => ({ default: m.KasalarModule })));
const AppointmentModule = React.lazy(() => import('../modules/AppointmentModule').then(m => ({ default: m.AppointmentModule })));
const RoleManagement = React.lazy(() => import('../system/RoleManagement').then(m => ({ default: m.RoleManagement })));
const DeliveryManagement = React.lazy(() => import('./components/DeliveryManagement').then(m => ({ default: m.DeliveryManagement })));
const TakeawayManagement = React.lazy(() => import('./components/TakeawayManagement').then(m => ({ default: m.TakeawayManagement })));

import { Table, Staff } from './types';
import { RestaurantPrinterSettings } from './components/RestaurantPrinterSettings';
import { useRestaurantStore } from './store/useRestaurantStore';
import type { Product, Customer, Campaign, User as UserType, Sale } from '../../core/types';
import './restaurant-premium.css';
import { RefreshCw } from 'lucide-react';

interface RestaurantModuleProps {
    products: Product[];
    customers: Customer[];
    campaigns: Campaign[];
    currentUser: UserType;
    onSaleComplete: (sale: Sale) => void;
    onLogout?: () => void;
    onBack?: () => void;
    // POS Settings
    gridColumns?: number;
    fontSize?: number;
    fontWeight?: number;
    zoomLevel?: number;
    onZoomClick?: () => void;
    cartViewMode?: 'table' | 'cards';
    buttonColorStyle?: 'filled' | 'outline';
    wsStatus?: 'connected' | 'disconnected' | 'connecting';
    rtlMode?: boolean;
    setRtlMode?: (value: boolean) => void;
    layoutOrder?: string;
    currentStaff?: Staff | null;
    selectedCustomer?: Customer | null;
    table?: Table | null;
}

export default function RestaurantModule({
    products = [],
    customers = [],
    campaigns = [],
    currentUser,
    onSaleComplete = () => { },
    onLogout = () => { },
    gridColumns = 4,
    fontSize = 100,
    fontWeight = 400,
    zoomLevel = 100,
    onZoomClick = () => { },
    cartViewMode = 'cards',
    buttonColorStyle = 'filled',
    wsStatus = 'disconnected',
    rtlMode = false,
    setRtlMode = () => { },
    layoutOrder = 'gastro',
    currentStaff: initialStaff = null,
    selectedCustomer: initialSelectedCustomer = null
}: RestaurantModuleProps) {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'floor' | 'pos' | 'kds' | 'history' | 'recipes' | 'customers' | 'stock' | 'reports' | 'settings' | 'cash' | 'reservations' | 'management' | 'delivery' | 'takeaway'>('dashboard');
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);
    const [initialCovers, setInitialCovers] = useState(0);
    const [posMode, setPosMode] = useState<'table' | 'retail' | 'selfservice'>('table');
    const {
        tables,
        kitchenOrders,
        loadTables,
        loadMenu,
        loadRegions,
        loadRecipes,
        currentStaff: storeStaff,
        isRegisterOpen,
        workDayDate,
        isDayActive,
        openRegister,
        closeRegister,
        registerOpeningCash
    } = useRestaurantStore();

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showZReport, setShowZReport] = useState(false);
    const [zReportData, setZReportData] = useState<any>(null);

    React.useEffect(() => {
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

    const activeTablesCount = tables.filter(t => t.status !== 'empty' && t.status !== 'reserved').length;
    const emptyTablesCount = tables.filter(t => t.status === 'empty').length;

    if (activeTab === 'dashboard') {
        return (
            <div className="flex flex-col h-full bg-[#f1f3f5] overflow-hidden font-sans relative">
                {/* Top Banner (REXPOS branding) */}
                <header className="h-14 flex items-center justify-between px-6 shadow-2xl shrink-0" style={{ backgroundColor: '#2563eb', borderBottom: '1px solid rgba(96,165,250,0.4)' }}>
                    <div className="flex items-center gap-2 select-none">
                        <h1 className="text-[32px] font-black tracking-tighter flex items-center" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                            <span className="text-white drop-shadow-md">Rest</span>
                            <span className="text-red-500 italic drop-shadow-md" style={{ marginLeft: '-1px' }}>Ex</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-white/70 font-bold text-sm">
                            <Users className="w-4 h-4" /> <span>75</span>
                        </div>
                        <div className="flex items-center gap-2 font-bold text-sm" style={{ color: '#60a5fa' }}>
                            <PlusCircle className="w-4 h-4" /> <span>0 Garson Talebi</span>
                        </div>
                        <div className="flex items-center gap-2 font-bold text-sm" style={{ color: '#34d399' }}>
                            <History className="w-4 h-4" /> <span>0 Hesap Talebi</span>
                        </div>

                        {/* Work Day Control */}
                        <div className="flex items-center gap-3 ml-4">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Mali Gün</span>
                                <span className="text-sm font-bold text-white transition-all">{workDayDate || 'KAPALI'}</span>
                            </div>
                            <button
                                onClick={() => {
                                    if (!isDayActive) {
                                        setShowRegisterModal(true);
                                    } else if (confirm('Mali günü kapatmak ve Z-Raporu almak istiyor musunuz?')) {
                                        // Mock closing data for demonstration
                                        const mockData = {
                                            date: new Date().toISOString(),
                                            openedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
                                            closedAt: new Date().toISOString(),
                                            staffName: storeStaff?.name || 'Yönetici',
                                            openingCash: registerOpeningCash,
                                            salesByCategory: [
                                                { category: 'Mutfak', amount: 850000, count: 32 },
                                                { category: 'Bar', amount: 320000, count: 54 }
                                            ],
                                            paymentsByType: [
                                                { type: 'NAKİT', amount: 500000, count: 40 },
                                                { type: 'KREDI KARTI', amount: 670000, count: 46 }
                                            ],
                                            voids: [],
                                            complements: { amount: 15000, count: 2 },
                                            totalSales: 1170000,
                                            netCash: 500000
                                        };
                                        setZReportData(mockData);
                                        setShowZReport(true);
                                        closeRegister();
                                    }
                                }}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all shadow-lg active:scale-95",
                                    isDayActive
                                        ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-900/40"
                                        : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-900/40"
                                )}
                            >
                                {isDayActive ? 'GÜNÜ KAPAT' : 'GÜNÜ BAŞLAT'}
                            </button>
                        </div>

                        <div className="h-6 w-[1px]" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}></div>
                        <Clock className="w-5 h-5 text-white/40" />
                        <span className="text-xl font-black text-white/40">2026</span>
                    </div>
                </header>

                {/* Status Cards (Flat UI Aesthetic) */}
                <div className="grid grid-cols-3 gap-0 shrink-0 shadow-sm relative z-10 border-b border-slate-200">
                    <div
                        className="res-stat-card cursor-pointer group hover:brightness-105 transition-all"
                        style={{ backgroundColor: '#ef4444' }}
                        onClick={() => setActiveTab('floor')}
                    >
                        <div className="w-12 h-12 flex items-center justify-center bg-white/20 rounded-xl">
                            <UtensilsCrossed className="w-6 h-6 text-white" />
                        </div>
                        <div className="ml-5 flex flex-col">
                            <span className="res-stat-value text-white">{activeTablesCount} DOLU</span>
                            <span className="res-stat-label text-white/80">MASA DURUMU</span>
                        </div>
                    </div>
                    <div
                        className="res-stat-card cursor-pointer group hover:brightness-105 transition-all"
                        style={{ backgroundColor: '#3b82f6' }}
                        onClick={() => setActiveTab('floor')}
                    >
                        <div className="w-12 h-12 flex items-center justify-center bg-white/20 rounded-xl">
                            <LayoutGrid className="w-6 h-6 text-white" />
                        </div>
                        <div className="ml-5 flex flex-col">
                            <span className="res-stat-value text-white">{emptyTablesCount} BOŞ</span>
                            <span className="res-stat-label text-white/80">MÜSAİT MASA</span>
                        </div>
                    </div>
                    <div
                        className="res-stat-card cursor-pointer group hover:brightness-105 transition-all"
                        style={{ backgroundColor: '#8b5cf6' }}
                    >
                        <div className="w-12 h-12 flex items-center justify-center bg-white/20 rounded-xl">
                            <Clock className="w-6 h-6 text-white" />
                        </div>
                        <div className="ml-5 flex flex-col">
                            <span className="res-stat-value text-white">{isDayActive ? workDayDate : 'GÜN KAPALI'}</span>
                            <span className="res-stat-label text-white/80">MEVCUT MALİ GÜN</span>
                        </div>
                    </div>
                </div>

                {/* Dashboard Tiles Grid - Expanded to 16 Tiles */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                            <DashboardTile
                                icon={<UtensilsCrossed />}
                                label="Servis"
                                color="#ef4444"
                                onClick={() => setActiveTab('floor')}
                            />
                            <DashboardTile
                                icon={<Bike />}
                                label="Paket Servis"
                                color="#3b82f6"
                                onClick={() => setActiveTab('delivery')}
                            />
                            <DashboardTile
                                icon={<ShoppingCart />}
                                label="Perakende"
                                color="#10b981"
                                onClick={() => { setSelectedTable(null); setPosMode('retail'); setActiveTab('pos'); }}
                            />
                            <DashboardTile
                                icon={<ShoppingBag />}
                                label="Gel Al"
                                color="#f59e0b"
                                onClick={() => setActiveTab('takeaway')}
                            />

                            <DashboardTile
                                icon={<Coffee />}
                                label="Self Servis"
                                color="#8b5cf6"
                                onClick={() => { setSelectedTable(null); setPosMode('selfservice'); setActiveTab('pos'); }}
                            />
                            <DashboardTile
                                icon={<History />}
                                label="Siparişler"
                                color="#06b6d4"
                                onClick={() => setActiveTab('history')}
                            />
                            <DashboardTile
                                icon={<CalendarClock />}
                                label="Rezervasyon"
                                color="#f43f5e"
                                onClick={() => setActiveTab('reservations')}
                            />
                            <DashboardTile
                                icon={<Users />}
                                label="Müşteriler"
                                color="#1fb141"
                                onClick={() => setActiveTab('customers')}
                            />

                            <DashboardTile
                                icon={<BarChart3 />}
                                label="Raporlar"
                                color="#6366f1"
                                onClick={() => setActiveTab('reports')}
                            />
                            <DashboardTile
                                icon={<Box />}
                                label="Stok"
                                color="#64748b"
                                onClick={() => setActiveTab('stock')}
                            />
                            <DashboardTile
                                icon={<CreditCard />}
                                label="Kasa"
                                color="#fb923c"
                                onClick={() => setActiveTab('cash')}
                            />
                            <DashboardTile
                                icon={<Monitor />}
                                label="Akıllı Masa"
                                color="#0ea5e9"
                                onClick={() => setActiveTab('floor')} // Smart table links to floor for now
                            />

                            <DashboardTile
                                icon={<ChefHat />}
                                label="Mutfak Paneli"
                                color="#ec4899"
                                onClick={() => setActiveTab('kds')}
                            />
                            <DashboardTile
                                icon={<Layers />}
                                label="Reçeteler"
                                color="#475569"
                                onClick={() => setActiveTab('recipes')}
                            />
                            <DashboardTile
                                icon={<Settings />}
                                label="Ayarlar"
                                color="#0f172a"
                                onClick={() => setActiveTab('settings')}
                            />
                            <DashboardTile
                                icon={<LayoutGrid />}
                                label="Yönetim"
                                color="#d946ef"
                                onClick={() => setActiveTab('management')}
                            />
                        </div>
                    </div>
                </div>

                {/* Floating Bottom Menu Icon (Hidden on main dashboard as it has its own tiles) */}
                <div className="absolute bottom-6 left-6 w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-2xl border border-slate-200 cursor-pointer hover:bg-slate-50 z-50 transition-all hover:scale-110 active:scale-95" onClick={() => setActiveTab('settings')}>
                    <Settings className="w-7 h-7 text-slate-400" />
                </div>
            </div>
        );
    }

    // Sub-module Layouts (Floor, POS, etc.)
    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#020617]">
            {/* Main Content Area */}

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative bg-[#020617]">
                {activeTab === 'floor' && <RestaurantFloorPlan onSelectTable={handleSelectTable} onBack={() => setActiveTab('dashboard')} />}
                {activeTab === 'kds' && <KitchenDisplay onBack={() => setActiveTab('dashboard')} />}
                {activeTab === 'pos' && (
                    <RestPOS
                        products={products}
                        customers={customers}
                        campaigns={campaigns}
                        selectedCustomer={initialSelectedCustomer}
                        currentStaff={storeStaff}
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
                        <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-green-500 animate-spin" /></div>}>
                            <CustomerManagementModule sales={[]} customers={customers} setCustomers={() => { }} />
                        </Suspense>
                    </ModuleWrapper>
                )}
                {activeTab === 'stock' && (
                    <ModuleWrapper title="Stok ve Envanter" onBack={() => setActiveTab('dashboard')}>
                        <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-slate-500 animate-spin" /></div>}>
                            <StockModule products={products} setProducts={() => { }} />
                        </Suspense>
                    </ModuleWrapper>
                )}
                {activeTab === 'reports' && (
                    <ModuleWrapper title="Raporlar ve Analiz" onBack={() => setActiveTab('dashboard')}>
                        <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>}>
                            <ReportsModule sales={[]} products={products} />
                        </Suspense>
                    </ModuleWrapper>
                )}
                {activeTab === 'settings' && (
                    <div className="flex-1 min-h-0 bg-white shadow-2xl rounded-[40px] overflow-hidden border border-slate-100">
                        <RestaurantPrinterSettings />
                    </div>
                )}
                {activeTab === 'cash' && (
                    <ModuleWrapper title="Kasa ve Finans" onBack={() => setActiveTab('dashboard')}>
                        <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
                            <KasalarModule />
                        </Suspense>
                    </ModuleWrapper>
                )}
                {activeTab === 'reservations' && (
                    <RestaurantReservations onBack={() => setActiveTab('dashboard')} />
                )}
                {activeTab === 'management' && (
                    <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-purple-500 animate-spin" /></div>}>
                        <RoleManagement onBack={() => setActiveTab('dashboard')} />
                    </Suspense>
                )}
                {activeTab === 'delivery' && (
                    <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>}>
                        <DeliveryManagement onBack={() => setActiveTab('dashboard')} />
                    </Suspense>
                )}
                {activeTab === 'takeaway' && (
                    <Suspense fallback={<div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
                        <TakeawayManagement onBack={() => setActiveTab('dashboard')} />
                    </Suspense>
                )}
            </main>
        </div>
    );
}

function DashboardTile({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color?: string, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center p-6 res-dashboard-tile h-full min-h-[160px] md:min-h-[190px] group transition-all"
            style={{ borderColor: `${color} 40` } as any}
        >
            <div className="mb-6 transition-transform group-hover:scale-110 duration-300">
                {React.isValidElement(icon)
                    ? React.cloneElement(icon as React.ReactElement<any>, {
                        size: 56,
                        strokeWidth: 2,
                        color: color || "#ef4444"
                    })
                    : icon}
            </div>
            <span className="text-[11px] md:text-[13px] font-black text-slate-700 uppercase tracking-[0.1em]">{label}</span>
            {/* Flat indicator - simple solid bar on hover */}
            <div className="absolute top-0 left-0 right-0 h-1 transition-opacity opacity-0 group-hover:opacity-100" style={{ backgroundColor: color }}></div>
        </button>
    );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-200 group relative",
                active
                    ? "bg-blue-600/10 text-blue-600 shadow-inner"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
            )}
        >
            <div className={cn(
                "transition-transform",
                active ? "scale-110" : "group-hover:scale-110"
            )}>
                {React.isValidElement(icon)
                    ? React.cloneElement(icon as React.ReactElement<any>, { className: "w-7 h-7" })
                    : icon}
            </div>
            <span className="text-[10px] font-bold mt-1.5 uppercase tracking-tighter">{label}</span>
            {active && (
                <div className="absolute left-0 w-1.5 h-10 bg-blue-600 rounded-r-full"></div>
            )}
        </button>
    );
}

function StatItem({ label, value, color }: { label: string, value: string, color: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-500 tracking-widest uppercase">{label}</span>
            <span className={cn("text-lg font-black leading-none mt-0.5", color)}>{value}</span>
        </div>
    );
}

function TabButton({ icon, label, active, onClick, activeColor }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, activeColor?: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-2xl transition-all duration-300 active:scale-95 group",
                active
                    ? `${activeColor || 'bg-blue-600'} text-white shadow-xl shadow-blue-200`
                    : "bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/5"
            )}
        >
            <div className={cn("transition-transform", active ? "scale-110" : "group-hover:scale-110")}>
                {icon}
            </div>
            <span className="text-[11px] font-black uppercase tracking-tight">{label}</span>
        </button>
    );
}


