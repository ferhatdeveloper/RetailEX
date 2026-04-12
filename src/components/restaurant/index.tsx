import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
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
    ZoomOut,
    FileText
} from 'lucide-react';

// Sub-components
import { RestaurantFloorPlan } from './components/RestaurantFloorPlan';
import { KitchenDisplay } from './components/KitchenDisplay';
import { RecipeManagement } from './components/RecipeManagement';
import { TicketHistory } from './components/TicketHistory';
import { VoidReturnReport } from './components/VoidReturnReport';
import { RestaurantProductQtyReport } from './components/RestaurantProductQtyReport';
import { RestPOS } from './components/RestPOS';
import { ModuleWrapper } from './components/ModuleWrapper';
import { POSOpenCashRegisterModal } from '../pos/POSOpenCashRegisterModal';
import { RestaurantZReport } from './components/RestaurantZReport';
import { RestaurantReservations } from './components/RestaurantReservations';
import { RestaurantSettings } from './components/RestaurantSettings';
import { DeliveryManagement } from './components/DeliveryManagement';
import { TakeawayManagement } from './components/TakeawayManagement';
import { RestaurantStaffPinModal } from './components/RestaurantStaffPinModal';
// Lazy loaded components
const CustomerManagementModule = React.lazy(() => import('../trading/contacts/CustomerManagementModule').then(m => ({ default: m.CustomerManagementModule })));
const StockModule = React.lazy(() => import('../inventory/stock/StockModule').then(m => ({ default: m.StockModule })));
const ReportsModule = React.lazy(() => import('../reports/ReportsModule').then(m => ({ default: m.ReportsModule })));
const KasalarModule = React.lazy(() => import('../accounting/cash-ops/KasalarModule').then(m => ({ default: m.KasalarModule })));
const RoleManagement = React.lazy(() => import('../system/RoleManagement').then(m => ({ default: m.RoleManagement })));

import { Table, Staff, type RestaurantCallerIdPickRequest } from './types';
import { useRestaurantStore } from './store/useRestaurantStore';
import { usePermission } from '../../shared/hooks/usePermission';
import { RestaurantService } from '../../services/restaurant';
import { useLanguage } from '../../contexts/LanguageContext';
import { moduleTranslations } from '../../locales/module-translations';
import { LanguageSelectionModal } from '../system/LanguageSelectionModal';
import type { Product, Customer, Campaign, User as UserType, Sale } from '../../core/types';
import { isMainModuleVisible } from '../../utils/mainModuleVisibility';
import { formatCurrency } from '../../utils/currency';
import './restaurant-premium.css';

interface RestaurantModuleProps {
    products: Product[];
    /** Uygulama geneli POS satışları — raporlar Yönetim ile aynı veriyi görsün */
    sales?: Sale[];
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
    sales = [],
    customers = [],
    campaigns = [],
    currentUser,
    onSaleComplete = () => { },
    onLogout = () => { },
    currentStaff: initialStaff = null,
    selectedCustomer: initialSelectedCustomer = null,
    setActiveModule
}: RestaurantModuleProps) {
    const { hasPermission, isAdmin } = usePermission();
    const { tm, language } = useLanguage();
    const dateLocale =
        language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'tr-TR';
    const formatWorkDayLabel = (wd: string | null | undefined) => {
        if (!wd) return tm('resClosedState');
        if (wd.includes('.')) return wd;
        return new Date(`${wd}T12:00:00`).toLocaleDateString(dateLocale);
    };

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
    const [activeTab, setActiveTab] = useState<'dashboard' | 'floor' | 'pos' | 'kds' | 'history' | 'voidReport' | 'productQtyReport' | 'recipes' | 'customers' | 'stock' | 'reports' | 'settings' | 'cash' | 'reservations' | 'management' | 'delivery' | 'takeaway'>('dashboard');
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);
    const [moveTableSource, setMoveTableSource] = useState<Table | null>(null);
    const [showStaffModalOnFloor, setShowStaffModalOnFloor] = useState(false);
    /** Masalar ekranına girildiğinde garson seçimi zorunlu (X yok, panele dön ile çıkış) */
    const [staffPickMandatory, setStaffPickMandatory] = useState(false);
    const [initialCovers, setInitialCovers] = useState(0);
    const [posMode, setPosMode] = useState<'table' | 'retail' | 'selfservice'>('table');
    const {
        tables,
        loadTables,
        loadMenu,
        loadRegions,
        loadRecipes,
        loadPrinterConfigFromDb,
        loadCategories,
        syncTableStatuses,
        loadKitchenOrders,
        currentStaff: storeStaff,
        setCurrentStaff,
        workDayDate,
        isDayActive,
        openRegister,
        closeRegister,
        registerOpeningCash,
    } = useRestaurantStore();
    const [callerIdPickRequest, setCallerIdPickRequest] = useState<RestaurantCallerIdPickRequest | null>(null);

    /** Otomatik gün sonu — güncel React state ile Z modalını açar */
    const runAutoCloseRef = useRef<() => Promise<void>>(async () => {});

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showZReport, setShowZReport] = useState(false);
    const [zReportData, setZReportData] = useState<any>(null);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [callerIdDeliveryPhone, setCallerIdDeliveryPhone] = useState<string | null>(null);

    const newCallerPickId = () =>
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid-${Date.now()}`;

    useEffect(() => {
        loadTables();
        loadMenu();
        loadRegions();
        loadRecipes();
        void loadPrinterConfigFromDb();
    }, []);

    useEffect(() => {
        const applyAction = (target?: string, phone?: string) => {
            if (target === 'restaurant_retail_delivery') {
                setSelectedTable(null);
                setPosMode('retail');
                setActiveTab('pos');
                if (phone?.trim()) {
                    setCallerIdDeliveryPhone(phone.trim());
                    setCallerIdPickRequest({
                        id: newCallerPickId(),
                        phone: phone.trim(),
                        action: 'pick',
                    });
                }
            }
        };
        const fromStorage = localStorage.getItem('callerid_context_action');
        if (fromStorage) {
            try {
                const parsed = JSON.parse(fromStorage) as { target?: string; phone?: string };
                applyAction(parsed?.target, parsed?.phone);
            } catch {
                // no-op
            } finally {
                localStorage.removeItem('callerid_context_action');
            }
        }
        const onCtx = (ev: Event) => {
            const custom = ev as CustomEvent<{ target?: string; phone?: string }>;
            applyAction(custom.detail?.target, custom.detail?.phone);
        };
        window.addEventListener('callerid-open-context-action', onCtx);
        return () => window.removeEventListener('callerid-open-context-action', onCtx);
    }, []);

    useEffect(() => {
        if (activeTab === 'floor') {
            if (isAdmin()) {
                setShowStaffModalOnFloor(false);
                setStaffPickMandatory(false);
                setCurrentStaff({
                    id: currentUser?.id ?? 'admin',
                    name: currentUser?.fullName || currentUser?.username || 'Admin',
                    role: 'Admin',
                    pin: '',
                    isActive: true,
                });
            } else {
                setShowStaffModalOnFloor(true);
                setStaffPickMandatory(true);
            }
        }
    }, [activeTab, isAdmin, currentUser?.id, currentUser?.fullName, currentUser?.username, setCurrentStaff]);

    // POS sekmesine geçildiğinde kategorileri yenile (Excel/ürün tarafında eklenen kategoriler görünsün)
    useEffect(() => {
        if (activeTab === 'pos') {
            loadCategories();
        }
    }, [activeTab, loadCategories]);

    // Arka planda masa durumlarını ve mutfak siparişlerini periyodik senkronize et (ağ/çoklu cihaz senkronu)
    useEffect(() => {
        const sync = () => {
            syncTableStatuses().catch(() => {});
            loadKitchenOrders().catch(() => {});
        };
        const interval = setInterval(sync, 15000);
        return () => clearInterval(interval);
    }, [syncTableStatuses, loadKitchenOrders]);

    useEffect(() => {
        runAutoCloseRef.current = async () => {
            const st = useRestaurantStore.getState();
            const activeTablesCount = st.tables.filter(t => t.status !== 'empty' && t.status !== 'reserved').length;
            const todayStr = new Date().toISOString().slice(0, 10);
            if (activeTablesCount > 0) {
                alert(tm('resAlertAutoCloseBlocked').replace('{n}', String(activeTablesCount)));
                return;
            }
            const dateStr = st.workDayDate || todayStr;
            try {
                const dbData = await RestaurantService.getZReportData(dateStr);
                const closedAt = new Date().toISOString();
                setZReportData({
                    date: closedAt,
                    openedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
                    closedAt,
                    staffName: st.currentStaff?.name || currentUser?.fullName || currentUser?.username || tm('resStaffAuto'),
                    openingCash: st.registerOpeningCash,
                    ...dbData,
                });
                setShowZReport(true);
                st.closeRegister();
                st.setWorkDayAutomation({ workDayLastAutoEndDate: todayStr });
            } catch (err: any) {
                console.error(err);
                const msg = err?.message || String(err);
                alert(msg.includes('Z-Raporu') ? msg : tm('resAlertZFailedAuto').replace('{msg}', msg));
            }
        };
    }, [currentUser?.fullName, currentUser?.username, tm]);

    useEffect(() => {
        const id = setInterval(() => {
            const s = useRestaurantStore.getState();
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (s.workDayAutoStartEnabled && !s.isDayActive && hm === s.workDayStartTime && s.workDayLastAutoStartDate !== todayStr) {
                s.openRegister(s.workDayAutoOpeningCash, tm('resOpenRegisterAutoNote'));
                s.setWorkDayAutomation({ workDayLastAutoStartDate: todayStr });
            }

            if (s.workDayAutoEndEnabled && s.isDayActive && hm === s.workDayEndTime && s.workDayLastAutoEndDate !== todayStr) {
                void runAutoCloseRef.current();
            }
        }, 20000);
        return () => clearInterval(id);
    }, [tm]);

    const handleSelectTable = (table: Table, covers: number) => {
        setSelectedTable(table);
        setInitialCovers(covers);
        setActiveTab('pos');
    };

    const handlePrintZReport = () => {
        if (!zReportData) return;
        const d = zReportData;
        const fmt = (num: number) => formatCurrency(num, 0, false);
        const esc = (s: string) =>
            String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

        const win = window.open('', '_blank', 'width=450,height=800');
        if (!win) return;

        const productRows = (d.salesByProduct || []).map((p: any) =>
            `<tr><td>${esc(p.productName)}</td><td style="text-align:right">${Number(p.quantity ?? 0).toLocaleString(dateLocale, { maximumFractionDigits: 3 })}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
        ).join('');

        const categoryRows = (d.salesByCategory || []).map((c: any) =>
            `<tr><td>${esc(String(c.category))}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">${fmt(c.amount)}</td></tr>`
        ).join('');

        const paymentRows = (d.paymentsByType || []).map((p: any) =>
            `<tr><td>${esc(String(p.type))}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`
        ).join('');

        const zTitle = `Z — ${new Date(d.date).toLocaleDateString(dateLocale)}`;
        win.document.write(`
            <html><head><title>${esc(zTitle)}</title>
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
                <h1>${esc(tm('resZPrintBrand'))}</h1>
                <hr/>
                <p>${esc(tm('resZPrintDateLabel'))}: ${new Date(d.date).toLocaleDateString(dateLocale)}</p>
                <p>${esc(tm('resZPrintStaffLabel'))}: ${esc(String(d.staffName ?? ''))}</p>
                <hr/>
                <h3>${esc(tm('resZPrintTotalSales'))}: ${fmt(d.totalSales)}</h3>
                <h3>${esc(tm('resZPrintRefund'))}: ${fmt(d.returns?.amount || 0)}</h3>
                <h3>${esc(tm('resZPrintComplement'))}: ${fmt(d.complements?.amount || 0)}</h3>
                <hr/>
                <h4 style="margin:12px 0 6px;font-size:14px">${esc(tm('resZPrintSoldProducts'))}</h4>
                <table>
                    <thead><tr><th>${esc(tm('resZPrintColProduct'))}</th><th style="text-align:right">${esc(tm('resZPrintColQty'))}</th><th style="text-align:right">${esc(tm('resZPrintColAmount'))}</th></tr></thead>
                    <tbody>${productRows || `<tr><td colspan="3" style="text-align:center;color:#666">${esc(tm('resZPrintNoRows'))}</td></tr>`}</tbody>
                </table>
                <hr/>
                <table>
                    <thead><tr><th>${esc(tm('resZPrintCategory'))}</th><th style="text-align:right">${esc(tm('resZPrintColCount'))}</th><th style="text-align:right">${esc(tm('resZPrintColAmount'))}</th></tr></thead>
                    <tbody>${categoryRows}</tbody>
                </table>
                <hr/>
                <table>
                    <thead><tr><th>${esc(tm('resZPrintPayment'))}</th><th style="text-align:right">${esc(tm('resZPrintColCount'))}</th><th style="text-align:right">${esc(tm('resZPrintColAmount'))}</th></tr></thead>
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
                            <Users className="w-4 h-4" />{' '}
                            <span>
                                {activeTablesCount + emptyTablesCount} {tm('resTablesWord')}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 font-bold text-sm text-blue-200">
                            <PlusCircle className="w-4 h-4" /> <span>{tm('resWaiterRequestZero')}</span>
                        </div>
                    </div>

                    <div className="h-6 w-[1px] bg-white/10"></div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{tm('resFiscalDayHeader')}</span>
                            <span className="text-sm font-bold text-white leading-none">{formatWorkDayLabel(workDayDate)}</span>
                        </div>

                        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/5">
                            <button
                                onClick={handleZoomOut}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
                                title={tm('resZoomOutTitle')}
                            >
                                <ZoomOut className="w-4.5 h-4.5" />
                            </button>
                            <button
                                onClick={handleZoomReset}
                                className="px-2 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white font-bold text-[10px] transition-all active:scale-95 min-w-[45px]"
                                title={tm('resZoomResetTitle')}
                            >
                                {zoomLevel}%
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
                                title={tm('resZoomInTitle')}
                            >
                                <ZoomIn className="w-4.5 h-4.5" />
                            </button>
                        </div>

                        <div className="h-6 w-[1px] bg-white/10"></div>

                        <button
                            onClick={() => setShowLanguageModal(true)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-all text-white/70 hover:text-white group"
                            title={tm('resLanguageSwitchTitle')}
                        >
                            <Languages className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                        </button>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-400/30">
                                <User className="w-4 h-4 text-blue-100" />
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <span className="text-xs font-bold text-white leading-tight">{currentUser.fullName || currentUser.username}</span>
                                <span className="text-[9px] font-medium text-blue-200 uppercase tracking-wider">{currentUser.role || tm('resRoleStaffDefault')}</span>
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
                                    <div className="res-stat-value text-white">
                                        {activeTablesCount} {tm('resStatFull')}
                                    </div>
                                    <div className="res-stat-label text-white/80">{tm('resStatTableStatus')}</div>
                                </div>
                            </div>
                            <div className="res-stat-card cursor-pointer bg-blue-500" onClick={() => setActiveTab('floor')}>
                                <LayoutGrid className="w-6 h-6 text-white" />
                                <div className="ml-5">
                                    <div className="res-stat-value text-white">
                                        {emptyTablesCount} {tm('resStatEmpty')}
                                    </div>
                                    <div className="res-stat-label text-white/80">{tm('resStatAvailableTable')}</div>
                                </div>
                            </div>
                            <div className="res-stat-card cursor-pointer" style={{ backgroundColor: isDayActive ? '#10b981' : '#8b5cf6' }}
                                onClick={async () => {
                                    if (!isDayActive) {
                                        setShowRegisterModal(true);
                                        return;
                                    }
                                    if (activeTablesCount > 0) {
                                        alert(
                                            tm('resAlertCannotCloseOpenTables').replace('{n}', String(activeTablesCount))
                                        );
                                        return;
                                    }
                                    if (!confirm(tm('resConfirmCloseDayZ'))) return;
                                    const closedAt = new Date().toISOString();
                                    const dateStr = workDayDate || new Date().toISOString().slice(0, 10);
                                    try {
                                        const dbData = await RestaurantService.getZReportData(dateStr);
                                        setZReportData({
                                            date: closedAt,
                                            openedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
                                            closedAt,
                                            staffName: storeStaff?.name || tm('resStaffManager'),
                                            openingCash: registerOpeningCash,
                                            ...dbData,
                                        });
                                        setShowZReport(true);
                                        closeRegister();
                                    } catch (err: any) {
                                        console.error(err);
                                        const msg = err?.message || String(err);
                                        alert(
                                            msg.includes('Z-Raporu')
                                                ? msg
                                                : tm('resAlertZFailedClose').replace('{msg}', msg)
                                        );
                                    }
                                }}>
                                <Clock className="w-6 h-6 text-white" />
                                <div className="ml-5">
                                    <div className="res-stat-value text-white">
                                        {isDayActive ? tm('resDayClose') : tm('resDayStart')}
                                    </div>
                                    <div className="res-stat-label text-white/80">
                                        {tm('resFiscalDayLine').replace('{date}', formatWorkDayLabel(workDayDate))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tiles Grid */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6">
                                {hasPermission('restaurant.pos', 'READ') && (
                                    <DashboardTile icon={<UtensilsCrossed />} label={tm('resTileService')} color="#ef4444" onClick={() => setActiveTab('floor')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.delivery', 'READ') && (
                                    <DashboardTile icon={<Bike />} label={tm('resTileDelivery')} color="#3b82f6" onClick={() => setActiveTab('delivery')} disabled={!isDayActive} />
                                )}
                                {hasPermission('pos', 'READ') && (
                                    <DashboardTile icon={<ShoppingCart />} label={tm('resTileRetail')} color="#10b981" onClick={() => { setSelectedTable(null); setPosMode('retail'); setActiveTab('pos'); }} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.takeaway', 'READ') && (
                                    <DashboardTile icon={<ShoppingBag />} label={tm('resTileTakeaway')} color="#f59e0b" onClick={() => setActiveTab('takeaway')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.selfservice', 'READ') && (
                                    <DashboardTile icon={<Coffee />} label={tm('resTileSelfService')} color="#8b5cf6" onClick={() => { setSelectedTable(null); setPosMode('selfservice'); setActiveTab('pos'); }} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.orders', 'READ') && (
                                    <DashboardTile icon={<History />} label={tm('resTileOrders')} color="#06b6d4" onClick={() => setActiveTab('history')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.pos', 'READ') && (
                                    <DashboardTile icon={<FileText />} label={tm('resTileVoidReturn')} color="#dc2626" onClick={() => setActiveTab('voidReport')} disabled={!isDayActive} />
                                )}
                                {(hasPermission('restaurant.reports', 'READ') || hasPermission('restaurant.pos', 'READ')) && (
                                    <DashboardTile
                                        icon={<BarChart3 />}
                                        label={tm('resProductQtyReportTitle')}
                                        color="#7c3aed"
                                        onClick={() => setActiveTab('productQtyReport')}
                                    />
                                )}
                                {hasPermission('restaurant.reservations', 'READ') && (
                                    <DashboardTile icon={<CalendarDays />} label={tm('resTileReservations')} color="#f43f5e" onClick={() => setActiveTab('reservations')} disabled={!isDayActive} />
                                )}
                                {hasPermission('contacts.customers', 'READ') && (
                                    <DashboardTile icon={<Users />} label={tm('resTileCustomers')} color="#1fb141" onClick={() => setActiveTab('customers')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.reports', 'READ') && (
                                    <DashboardTile icon={<BarChart3 />} label={tm('resTileReports')} color="#6366f1" onClick={() => setActiveTab('reports')} disabled={!isDayActive} />
                                )}
                                {hasPermission('stock', 'READ') && (
                                    <DashboardTile icon={<Box />} label={tm('resTileStock')} color="#64748b" onClick={() => setActiveTab('stock')} disabled={!isDayActive} />
                                )}
                                {hasPermission('accounting.cash', 'READ') && (
                                    <DashboardTile icon={<CreditCard />} label={tm('resTileCash')} color="#fb923c" onClick={() => setActiveTab('cash')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.smart_table', 'READ') && (
                                    <DashboardTile icon={<Monitor />} label={tm('resTileSmartTable')} color="#0ea5e9" onClick={() => setActiveTab('floor')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.kds', 'READ') && (
                                    <DashboardTile icon={<ChefHat />} label={tm('resTileKitchen')} color="#ec4899" onClick={() => setActiveTab('kds')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.recipes', 'READ') && (
                                    <DashboardTile icon={<Layers />} label={tm('resTileRecipes')} color="#475569" onClick={() => setActiveTab('recipes')} disabled={!isDayActive} />
                                )}
                                {hasPermission('restaurant.settings', 'READ') && (
                                    <DashboardTile icon={<Settings />} label={tm('resTileSettings')} color="#0f172a" onClick={() => setActiveTab('settings')} />
                                )}
                                {hasPermission('management', 'READ') && isMainModuleVisible('management') && (
                                    <DashboardTile icon={<LayoutGrid />} label={tm('resTileManagement')} color="#d946ef" onClick={() => setActiveModule?.('management')} />
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <RestaurantContent
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        products={products}
                        sales={sales}
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
                        setSelectedTable={setSelectedTable}
                        moveTableSource={moveTableSource}
                        setMoveTableSource={setMoveTableSource}
                        callerIdPickRequest={callerIdPickRequest}
                        onCallerIdPickConsumed={() => setCallerIdPickRequest(null)}
                        callerIdDeliveryPhone={callerIdDeliveryPhone}
                        onCallerIdDeliveryConsumed={() => setCallerIdDeliveryPhone(null)}
                        onRequestStaffChange={() => {
                            setStaffPickMandatory(false);
                            setShowStaffModalOnFloor(true);
                        }}
                        onAfterSendToKitchen={() => {
                            setActiveTab('floor');
                        }}
                    />
                )}
            </main>

            {/* Modals */}
            {showRegisterModal && (
                <POSOpenCashRegisterModal
                    onClose={() => setShowRegisterModal(false)}
                    currentStaff={storeStaff?.name || initialStaff?.name || tm('resStaffManager')}
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
            {showStaffModalOnFloor && (
                <RestaurantStaffPinModal
                    onClose={() => {
                        setShowStaffModalOnFloor(false);
                        setStaffPickMandatory(false);
                    }}
                    onSelect={() => {
                        setShowStaffModalOnFloor(false);
                        setStaffPickMandatory(false);
                    }}
                    skipConfirmation
                    mandatory={staffPickMandatory}
                    onNavigateBack={() => {
                        setActiveTab('dashboard');
                        setShowStaffModalOnFloor(false);
                        setStaffPickMandatory(false);
                    }}
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
    sales: Sale[];
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
    setSelectedTable: (t: Table | null) => void;
    moveTableSource: Table | null;
    setMoveTableSource: (t: Table | null) => void;
    /** Personel badge tıklanınca garson değişimi modalını açar */
    onRequestStaffChange?: () => void;
    /** Mutfak butonuna basıp sipariş gönderildikten sonra masalara dönüp garson seçim açılsın */
    onAfterSendToKitchen?: () => void;
    callerIdPickRequest: RestaurantCallerIdPickRequest | null;
    onCallerIdPickConsumed: () => void;
    callerIdDeliveryPhone?: string | null;
    onCallerIdDeliveryConsumed?: () => void;
}

function RestaurantContent({
    activeTab,
    setActiveTab,
    products,
    sales,
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
    handleSelectTable,
    setSelectedTable,
    moveTableSource,
    setMoveTableSource,
    onRequestStaffChange,
    onAfterSendToKitchen,
    callerIdPickRequest,
    onCallerIdPickConsumed,
    callerIdDeliveryPhone,
    onCallerIdDeliveryConsumed,
}: RestaurantContentProps) {
    const { language, tm: globalTm } = useLanguage();
    const tm = useCallback(
        (key: string) => moduleTranslations[key]?.[language] || globalTm(key),
        [language, globalTm]
    );
    const { tables, moveTable, mergeTables } = useRestaurantStore();
    const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);

    return (
        <div className="h-full bg-[#020617]">
            {activeTab === 'floor' && (
                <RestaurantFloorPlan
                    onSelectTable={handleSelectTable}
                    onBack={() => { setMoveTableSource(null); setMoveTargetTableId(null); setActiveTab('dashboard'); }}
                    moveTableSource={moveTableSource}
                    moveTargetTableId={moveTargetTableId}
                    onMoveTargetSelect={setMoveTargetTableId}
                    onRequestStaffChange={onRequestStaffChange}
                    onOpenReservations={() => setActiveTab('reservations')}
                    onMoveConfirm={async (mode, targetId) => {
                        try {
                            if (mode === 'move') {
                                await moveTable(moveTableSource!.id, targetId);
                            } else {
                                await mergeTables(moveTableSource!.id, targetId);
                            }
                            // Yenilemeden sonra güncel listeden hedef masayı al (closure'daki tables eski kalmasın)
                            const freshTables = useRestaurantStore.getState().tables;
                            const targetTable = freshTables.find(t => t.id === targetId);
                            setMoveTableSource(null);
                            setMoveTargetTableId(null);
                            setActiveTab('pos');
                            setSelectedTable(targetTable || moveTableSource!);
                        } catch (e: any) {
                            console.error(e);
                            alert(
                                tm('resAlertMoveTableError').replace(
                                    '{msg}',
                                    e?.message || tm('resErrorUnknown')
                                )
                            );
                        }
                    }}
                    onMoveCancel={() => { setMoveTableSource(null); setMoveTargetTableId(null); }}
                />
            )}
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
                    onRequestMoveTable={selectedTable ? () => { setMoveTableSource(selectedTable); setActiveTab('floor'); } : undefined}
                    onAfterSendToKitchen={onAfterSendToKitchen}
                    callerIdPickRequest={callerIdPickRequest}
                    onCallerIdPickConsumed={onCallerIdPickConsumed}
                    callerIdDeliveryPhone={callerIdDeliveryPhone}
                    onCallerIdDeliveryConsumed={onCallerIdDeliveryConsumed}
                />
            )}
            {activeTab === 'recipes' && <RecipeManagement onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'history' && <TicketHistory onClose={() => setActiveTab('dashboard')} />}
            {activeTab === 'voidReport' && <VoidReturnReport onBack={() => setActiveTab('dashboard')} />}
            {activeTab === 'productQtyReport' && (
                <RestaurantProductQtyReport onBack={() => setActiveTab('dashboard')} />
            )}
            {activeTab === 'customers' && (
                <ModuleWrapper title={tm('resModuleCustomersTitle')} onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><CustomerManagementModule sales={[]} customers={customers} setCustomers={() => { }} /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'stock' && (
                <ModuleWrapper title={tm('resModuleStockTitle')} onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><StockModule products={products} setProducts={() => { }} /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'reports' && (
                <ModuleWrapper title={tm('resModuleReportsTitle')} onBack={() => setActiveTab('dashboard')}>
                    <Suspense fallback={<LoadingSpinner />}><ReportsModule sales={sales} products={products} initialBusinessType="restaurant" /></Suspense>
                </ModuleWrapper>
            )}
            {activeTab === 'settings' && (
                <div className="h-full bg-white"><RestaurantSettings onBack={() => setActiveTab('dashboard')} /></div>
            )}
            {activeTab === 'cash' && (
                <ModuleWrapper title={tm('resModuleCashTitle')} onBack={() => setActiveTab('dashboard')}>
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
