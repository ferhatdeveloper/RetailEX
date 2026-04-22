
import React, { useState, useMemo, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    LayoutDashboard, Users, Calendar, Scissors, Package,
    UserCog, BarChart3, Bell, Search,
    ChevronLeft, ChevronRight, Box, Megaphone,
    Sparkles, Settings2, Globe, ClipboardList, Layers, LayoutGrid,
    Clock, LogOut, Smile, Activity, Baby, Apple, Banknote,
} from 'lucide-react';
import { useBeautyStore } from './store/useBeautyStore';
import { formatLocalYmd } from '../../utils/dateLocal';
import { useLanguage } from '../../contexts/LanguageContext';

import { SmartScheduler } from './components/SmartScheduler';
import { ClientCRM } from './components/ClientCRM';
import { ClientCustomerDetailPage } from './components/ClientCustomerDetailPage';
import { PackageManagement } from './components/PackageManagement';
import { ClinicDashboard } from './components/ClinicDashboard';
import { ServiceManagement } from './components/ServiceManagement';
import { ServiceRecipeManagement } from './components/ServiceRecipeManagement';
import { StaffManagement } from './components/StaffManagement';
import { DeviceManagement } from './components/DeviceManagement';
import { ReportsModule } from '../reports/ReportsModule';
import { ExpenseManagement } from '../accounting/reports/ExpenseManagement';
import type { Product, Sale } from '../../core/types';
import { LeadManagement } from './components/LeadManagement';
import { SatisfactionSurveyManagement } from './components/SatisfactionSurveyManagement';
import { ClinicOperationsHub } from './components/ClinicOperationsHub';
import { ClinicErpSpecialtyProvider, useClinicErpSpecialty } from './context/ClinicErpSpecialtyContext';
import { getLandingTabForSpecialty } from './clinicShellNavConfig';
import { DentalChartScreen } from './specialty/DentalChartScreen';
import { PhysioBodyScreen } from './specialty/PhysioBodyScreen';
import { ObstetricsScreen } from './specialty/ObstetricsScreen';
import { DietitianScreen } from './specialty/DietitianScreen';
import { LanguageSelectionModal } from '../system/LanguageSelectionModal';
import { FirmSelector } from '../system/FirmSelector';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../shared/RetailExFlatModal';
import './ClinicStyles.css';

function beautyShellLocale(lang: string): string {
    if (lang === 'tr') return 'tr-TR';
    if (lang === 'ar') return 'ar-SA';
    if (lang === 'ku') return 'ku-IQ';
    return 'en-US';
}

/** Ana ERP mavi çubuğu yokken — tarih/saat modalı (MainLayout ile aynı) */
function BeautyShellClockButton({ onOpen, locale }: { onOpen: () => void; locale: string }) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex items-center justify-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs tabular-nums h-8 px-2 sm:px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-200 text-slate-700 font-semibold shadow-sm shrink-0 whitespace-nowrap"
        >
            <Calendar className="w-3.5 h-3.5 shrink-0 text-violet-600" aria-hidden />
            <span className="hidden md:inline">
                {now.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span className="hidden md:inline text-violet-300" aria-hidden>•</span>
            <Clock className="w-3.5 h-3.5 shrink-0 text-violet-600" aria-hidden />
            <span>{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
        </button>
    );
}

// Sidebar constants
const SIDEBAR_W = 220;
const COLLAPSED_W = 56;

export type BeautyModuleProps = {
    /** Back office ile aynı ERP raporları (satış / ürün) */
    sales?: Sale[];
    products?: Product[];
    /** Ana kabukta (MainLayout) yönetim/backoffice — şifre veya rol ile aynı akış */
    onRequestManagementAccess?: () => void;
    /** Üst mavi çubuk gizliyken: firma/dönem, saat/tarih modalı, çıkış */
    clinicSessionBar?: {
        onLogout: () => void;
        onOpenClockModal: () => void;
    };
};

function BeautyModuleShell({ sales = [], products = [], onRequestManagementAccess, clinicSessionBar }: BeautyModuleProps) {
    const { tm, t, language } = useLanguage();
    const { specialty } = useClinicErpSpecialty();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [beautyClientDetailId, setBeautyClientDetailId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [rtlMode, setRtlMode] = useState(() => localStorage.getItem('retailos_rtl_mode') === 'true');
    const { specialists, devices, loadSpecialists, loadServices, loadAppointments, loadDevices } = useBeautyStore();
    const [showNewAptWizard, setShowNewAptWizard] = useState(false);
    const [wizardDate, setWizardDate] = useState(() => formatLocalYmd(new Date()));
    const [wizardTime, setWizardTime] = useState('09:00');
    const [wizardStaffId, setWizardStaffId] = useState('');
    const [wizardDeviceId, setWizardDeviceId] = useState('');
    /** CRM’den gelen randevu hizmeti — POS’ta sepete otomatik */
    const [wizardServiceId, setWizardServiceId] = useState('');

    const MENU_GROUPS = useMemo(() => {
        /** Diş yazılımı tipi akış: özet → randevu/hasta önce → FDI tedavi → katalog → yönetim */
        if (specialty === 'dental') {
            return [
                {
                    title: tm('bShellMenuGeneral'),
                    items: [{ id: 'dashboard', icon: LayoutDashboard, label: tm('dashboard') }],
                },
                {
                    title: tm('bShellMenuDentalOperations'),
                    items: [
                        { id: 'calendar', icon: Calendar, label: tm('bShellNavCalendar') },
                        { id: 'clients', icon: Users, label: tm('bShellNavClients') },
                    ],
                },
                {
                    title: tm('bShellMenuClinicalDental'),
                    items: [{ id: 'dental_chart', icon: Smile, label: tm('bShellNavDental') }],
                },
                {
                    title: tm('bShellMenuDefinitions'),
                    items: [
                        { id: 'services', icon: Scissors, label: tm('bShellNavServices') },
                        { id: 'packages', icon: Package, label: tm('bShellNavPackages') },
                        { id: 'devices', icon: Box, label: tm('bShellNavDevices') },
                        { id: 'service_recipes', icon: Layers, label: tm('bShellNavServiceRecipes') },
                        { id: 'surveys', icon: ClipboardList, label: tm('bSatisfactionSurveysTitle') },
                    ],
                },
                {
                    title: tm('bShellMenuManagement'),
                    items: [
                        { id: 'staff', icon: UserCog, label: tm('bShellNavStaff') },
                        { id: 'leads', icon: Megaphone, label: tm('bShellNavLeads') },
                        { id: 'expenses', icon: Banknote, label: 'Giderler' },
                        { id: 'reports', icon: BarChart3, label: tm('bShellNavReports') },
                        { id: 'clinic_ops', icon: ClipboardList, label: tm('bShellNavClinicOps') },
                    ],
                },
            ];
        }

        const clinicalItems: { id: string; icon: LucideIcon; label: string }[] = [];
        if (specialty === 'physiotherapy') {
            clinicalItems.push({ id: 'physio_body', icon: Activity, label: tm('bShellNavPhysio') });
        }
        if (specialty === 'obstetrics') {
            clinicalItems.push({ id: 'obstetrics', icon: Baby, label: tm('bShellNavObstetrics') });
        }
        if (specialty === 'dietitian') {
            clinicalItems.push({ id: 'dietitian', icon: Apple, label: tm('bShellNavDietitian') });
        }

        const groups: {
            title: string;
            items: { id: string; icon: LucideIcon; label: string }[];
        }[] = [
            {
                title: tm('bShellMenuGeneral'),
                items: [{ id: 'dashboard', icon: LayoutDashboard, label: tm('dashboard') }],
            },
            {
                title: tm('bShellMenuOperations'),
                items: [
                    { id: 'clients', icon: Users, label: tm('bShellNavClients') },
                    { id: 'calendar', icon: Calendar, label: tm('bShellNavCalendar') },
                ],
            },
        ];
        if (clinicalItems.length > 0) {
            groups.push({ title: tm('bShellMenuClinicalTools'), items: clinicalItems });
        }
        groups.push(
            {
                title: tm('bShellMenuDefinitions'),
                items: [
                    { id: 'services', icon: Scissors, label: tm('bShellNavServices') },
                    { id: 'service_recipes', icon: Layers, label: tm('bShellNavServiceRecipes') },
                    { id: 'packages', icon: Package, label: tm('bShellNavPackages') },
                    { id: 'devices', icon: Box, label: tm('bShellNavDevices') },
                    { id: 'surveys', icon: ClipboardList, label: tm('bSatisfactionSurveysTitle') },
                ],
            },
            {
                title: tm('bShellMenuManagement'),
                items: [
                    { id: 'staff', icon: UserCog, label: tm('bShellNavStaff') },
                    { id: 'leads', icon: Megaphone, label: tm('bShellNavLeads') },
                    { id: 'expenses', icon: Banknote, label: 'Giderler' },
                    { id: 'reports', icon: BarChart3, label: tm('bShellNavReports') },
                    { id: 'clinic_ops', icon: ClipboardList, label: tm('bShellNavClinicOps') },
                ],
            }
        );
        return groups;
    }, [specialty, language, tm]);

    const PAGE_TITLES = useMemo((): Record<string, string> => ({
        dashboard: tm('dashboard'),
        clients: tm('bShellNavClients'),
        calendar: tm('bShellNavCalendar'),
        services: tm('bShellNavServices'),
        service_recipes: tm('bShellNavServiceRecipes'),
        packages: tm('bShellNavPackages'),
        devices: tm('bShellNavDevices'),
        surveys: tm('bSatisfactionSurveysTitle'),
        staff: tm('bShellNavStaff'),
        leads: tm('bShellNavLeads'),
        expenses: 'Giderler',
        reports: tm('bShellNavReports'),
        clinic_ops: tm('bShellNavClinicOps'),
        dental_chart: tm('bShellNavDental'),
        physio_body: tm('bShellNavPhysio'),
        obstetrics: tm('bShellNavObstetrics'),
        dietitian: tm('bShellNavDietitian'),
    }), [language, tm]);

    React.useEffect(() => {
        const today = formatLocalYmd(new Date());
        loadSpecialists();
        loadServices();
        loadDevices();
        loadAppointments(today);
    }, [loadSpecialists, loadServices, loadDevices, loadAppointments]);

    React.useEffect(() => {
        if (activeTab !== 'clients') setBeautyClientDetailId(null);
    }, [activeTab]);

    /** Uzmanlık değişince artık geçersiz klinik sekmesinde kalma */
    React.useEffect(() => {
        const map: Record<string, string | undefined> = {
            dental_chart: 'dental',
            physio_body: 'physiotherapy',
            obstetrics: 'obstetrics',
            dietitian: 'dietitian',
        };
        const need = map[activeTab];
        if (need && specialty !== need) {
            setActiveTab('dashboard');
        }
    }, [specialty, activeTab]);

    /**
     * Klinik türü seçilince (ör. diş) ilgili çalışma ekranına geç.
     * `__init__`: ilk yüklemede localStorage’daki `dental` vb. için doğru sekmeyi aç.
     */
    const prevSpecialtyRef = React.useRef<typeof specialty | '__init__'>('__init__');
    React.useEffect(() => {
        const prev = prevSpecialtyRef.current;
        prevSpecialtyRef.current = specialty;
        if (prev === '__init__') {
            setActiveTab(getLandingTabForSpecialty(specialty));
            return;
        }
        if (prev === specialty) return;
        setActiveTab(getLandingTabForSpecialty(specialty));
    }, [specialty]);

    React.useEffect(() => {
        const prefillCallerSearch = (phone?: string) => {
            const p = phone?.trim();
            if (!p) return;
            window.dispatchEvent(new CustomEvent('beauty-callerid-prefill-search', { detail: { phone: p } }));
        };
        const applyAction = (target?: string, phone?: string) => {
            if (target === 'beauty_calendar') {
                setActiveTab('calendar');
                prefillCallerSearch(phone);
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

    /** MainLayout modüle geçtikten sonra gecikmeli tetiklenir; detail = tıklanan randevu satırı */
    React.useEffect(() => {
        const openWizard = (ev: Event) => {
            const ce = ev as CustomEvent<{
                dateYmd?: string;
                time?: string;
                staffId?: string;
                deviceId?: string;
                serviceId?: string;
            }>;
            const d = ce.detail ?? {};
            const today = formatLocalYmd(new Date());
            if (d.dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(d.dateYmd)) {
                setWizardDate(d.dateYmd);
            } else {
                setWizardDate(today);
            }
            let tt = (d.time ?? '09:00').trim();
            if (tt.length >= 5) tt = tt.slice(0, 5);
            if (!/^\d{1,2}:\d{2}$/.test(tt)) tt = '09:00';
            const tp = tt.match(/^(\d{1,2}):(\d{2})$/);
            if (tp) {
                const hh = String(Math.min(23, parseInt(tp[1], 10))).padStart(2, '0');
                const mm = String(Math.min(59, parseInt(tp[2], 10))).padStart(2, '0');
                setWizardTime(`${hh}:${mm}`);
            } else {
                setWizardTime('09:00');
            }
            setWizardStaffId(d.staffId?.trim() ? String(d.staffId) : '');
            setWizardDeviceId(d.deviceId?.trim() ? String(d.deviceId) : '');
            setWizardServiceId(d.serviceId?.trim() ? String(d.serviceId) : '');
            setActiveTab('calendar');
            setShowNewAptWizard(true);
        };
        window.addEventListener('beauty-open-new-appointment-wizard-delayed', openWizard);
        return () => window.removeEventListener('beauty-open-new-appointment-wizard-delayed', openWizard);
    }, []);

    return (
        <div className="flex h-full overflow-hidden" style={{ background: '#f7f6fb', fontFamily: 'inherit' }}>

            {/* ── SIDEBAR ─────────────────────────────────────────── */}
            <aside
                className="flex flex-col shrink-0 transition-all duration-200"
                style={{
                    width: collapsed ? COLLAPSED_W : SIDEBAR_W,
                    background: '#12082a',
                    borderRight: '1px solid #1f0f3a',
                }}
            >
                {/* Brand */}
                <div
                    className="flex items-center shrink-0 overflow-hidden"
                    style={{ height: 52, padding: collapsed ? '0 14px' : '0 16px', borderBottom: '1px solid #1f0f3a' }}
                >
                    <div
                        className="flex items-center justify-center shrink-0"
                        style={{
                            width: 28,
                            height: 28,
                            background: specialty === 'dental' ? '#0ea5e9' : '#7c3aed',
                            borderRadius: 6,
                        }}
                    >
                        {specialty === 'dental' ? <Smile size={14} color="#fff" /> : <Sparkles size={14} color="#fff" />}
                    </div>
                    {!collapsed && (
                        <div className="ml-2.5 min-w-0">
                            <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                                {specialty === 'dental' ? tm('bShellBrandTitleDental') : tm('bShellBrandTitle')}
                            </p>
                            <p style={{ color: 'rgba(167,139,250,0.5)', fontWeight: 700, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                                {specialty === 'dental' ? tm('bShellBrandSubtitleDental') : tm('bShellBrandSubtitle')}
                            </p>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed(c => !c)}
                        className="ml-auto shrink-0 flex items-center justify-center transition-colors"
                        style={{ width: 24, height: 24, borderRadius: 4, color: 'rgba(167,139,250,0.4)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,0.8)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(167,139,250,0.4)')}
                    >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: 'none' }}>
                    {MENU_GROUPS.map(group => (
                        <div key={group.title} style={{ marginBottom: 16 }}>
                            {!collapsed && (
                                <p style={{
                                    color: 'rgba(167,139,250,0.35)', fontWeight: 800,
                                    fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                                    padding: '0 16px', marginBottom: 4,
                                }}>
                                    {group.title}
                                </p>
                            )}
                            {group.items.map(item => {
                                const active = activeTab === item.id;
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        title={collapsed ? item.label : undefined}
                                        style={{
                                            display: 'flex', alignItems: 'center',
                                            width: '100%', padding: collapsed ? '7px 0' : '7px 12px',
                                            marginBottom: 1,
                                            justifyContent: collapsed ? 'center' : 'flex-start',
                                            gap: 9,
                                            background: active ? '#7c3aed' : 'transparent',
                                            borderLeft: active ? '2px solid #a78bfa' : '2px solid transparent',
                                            color: active ? '#fff' : 'rgba(196,181,253,0.65)',
                                            fontSize: 13, fontWeight: active ? 700 : 500,
                                            cursor: 'pointer', border: 'none', outline: 'none',
                                            transition: 'background 0.12s, color 0.12s',
                                        }}
                                        onMouseEnter={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = 'rgba(124,58,237,0.12)';
                                                e.currentTarget.style.color = 'rgba(221,214,254,0.9)';
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = 'rgba(196,181,253,0.65)';
                                            }
                                        }}
                                    >
                                        <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
                                        {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {onRequestManagementAccess && (
                    <div style={{ padding: '0 0 10px', flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={() => onRequestManagementAccess()}
                            title={collapsed ? t.management : undefined}
                            style={{
                                display: 'flex', alignItems: 'center',
                                width: '100%', padding: collapsed ? '7px 0' : '7px 12px',
                                marginBottom: 1,
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                gap: 9,
                                background: 'transparent',
                                borderLeft: '2px solid transparent',
                                color: 'rgba(196,181,253,0.65)',
                                fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', border: 'none', outline: 'none',
                                transition: 'background 0.12s, color 0.12s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(124,58,237,0.12)';
                                e.currentTarget.style.color = 'rgba(221,214,254,0.9)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(196,181,253,0.65)';
                            }}
                        >
                            <LayoutGrid size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                            {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.management}</span>}
                        </button>
                    </div>
                )}

                {/* User */}
                <div style={{ borderTop: '1px solid #1f0f3a', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 30, height: 30, background: '#7c3aed', borderRadius: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0,
                        }}>C</div>
                        {!collapsed && (
                            <>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ color: '#fff', fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{tm('bShellUserAdmin')}</p>
                                    <p style={{ color: 'rgba(167,139,250,0.5)', fontSize: 10, fontWeight: 600 }}>{tm('bShellRoleAdmin')}</p>
                                </div>
                                <button style={{ color: 'rgba(167,139,250,0.4)', flexShrink: 0 }}>
                                    <Settings2 size={13} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* ── MAIN ────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 overflow-hidden">

                {/* Header */}
                <header
                    className="flex items-center justify-between shrink-0"
                    style={{
                        height: 52, background: '#fff',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '0 20px',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#111827', letterSpacing: '-0.01em' }}>
                            {PAGE_TITLES[activeTab] ?? activeTab}
                        </span>
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: 10, fontWeight: 700, color: '#059669',
                            background: '#ecfdf5', border: '1px solid #a7f3d0',
                            padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                            {tm('bShellSystemActive')}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
                        {clinicSessionBar && (
                            <>
                                <FirmSelector triggerVariant="clinic" />
                                <BeautyShellClockButton
                                    onOpen={clinicSessionBar.onOpenClockModal}
                                    locale={beautyShellLocale(language)}
                                />
                                <button
                                    type="button"
                                    onClick={clinicSessionBar.onLogout}
                                    title={t.logout}
                                    aria-label={t.logout}
                                    className="flex items-center justify-center h-8 w-8 sm:w-9 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-700 shadow-sm shrink-0"
                                >
                                    <LogOut size={15} aria-hidden />
                                </button>
                            </>
                        )}
                        {/* Search */}
                        <div className="relative hidden lg:block">
                            <Search
                                size={14}
                                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
                            />
                            <input
                                type="text"
                                placeholder={tm('bShellHeaderSearch')}
                                style={{
                                    paddingLeft: 30, paddingRight: 12, height: 32,
                                    background: '#f9fafb', border: '1px solid #e5e7eb',
                                    borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#374151',
                                    width: 220, outline: 'none',
                                }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124,58,237,0.1)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Bell */}
                        <button
                            className="relative flex items-center justify-center"
                            style={{ width: 32, height: 32, borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer' }}
                        >
                            <Bell size={14} />
                            <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, background: '#ef4444', borderRadius: '50%', border: '1.5px solid #fff' }} />
                        </button>

                        {/* Language Selector */}
                        <button
                            onClick={() => setShowLanguageModal(true)}
                            className="flex items-center justify-center transition-colors"
                            style={{ width: 32, height: 32, borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                        >
                            <Globe size={14} />
                        </button>
                    </div>
                </header>

                {/* Content — min-h-0 + overflow-y-auto so long pages (e.g. Hizmetler grid) can scroll inside the shell */}
                <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {activeTab === 'dashboard' && <ClinicDashboard />}
                    {activeTab === 'calendar' && <SmartScheduler />}
                    {activeTab === 'clients' && (
                        beautyClientDetailId ? (
                            <ClientCustomerDetailPage
                                customerId={beautyClientDetailId}
                                onBack={() => setBeautyClientDetailId(null)}
                            />
                        ) : (
                            <ClientCRM onOpenCustomer={id => setBeautyClientDetailId(id)} />
                        )
                    )}
                    {activeTab === 'packages' && <PackageManagement />}
                    {activeTab === 'services' && <ServiceManagement />}
                    {activeTab === 'service_recipes' && <ServiceRecipeManagement />}
                    {activeTab === 'staff' && <StaffManagement />}
                    {activeTab === 'devices' && <DeviceManagement />}
                    {activeTab === 'surveys' && <SatisfactionSurveyManagement />}
                    {activeTab === 'leads' && <LeadManagement />}
                    {activeTab === 'expenses' && <ExpenseManagement />}
                    {activeTab === 'reports' && (
                        <div className="h-full min-h-[min(100dvh,1200px)] min-w-0">
                            <ReportsModule sales={sales} products={products} initialBusinessType="beauty" />
                        </div>
                    )}
                    {activeTab === 'clinic_ops' && <ClinicOperationsHub />}
                    {activeTab === 'dental_chart' && <DentalChartScreen />}
                    {activeTab === 'physio_body' && <PhysioBodyScreen />}
                    {activeTab === 'obstetrics' && <ObstetricsScreen />}
                    {activeTab === 'dietitian' && <DietitianScreen />}
                </main>
            </div>

            {showLanguageModal && (
                <LanguageSelectionModal
                    onClose={() => setShowLanguageModal(false)}
                    rtlMode={rtlMode}
                    setRtlMode={setRtlMode}
                />
            )}

            <RetailExFlatModal
                open={showNewAptWizard}
                onClose={() => setShowNewAptWizard(false)}
                title={tm('bNewAptWizardTitle')}
                subtitle={tm('bNewAptWizardSubtitle')}
                headerIcon={<Calendar size={20} />}
                cancelLabel={tm('cancel')}
                confirmLabel={tm('bNewAptWizardOpenPos')}
                onConfirm={() => {
                    const dateYmd = wizardDate.trim() || formatLocalYmd(new Date());
                    const timeRaw = wizardTime.trim().slice(0, 5) || '09:00';
                    const staffId = wizardStaffId.trim();
                    const deviceId = wizardDeviceId.trim();
                    const serviceId = wizardServiceId.trim();
                    setShowNewAptWizard(false);
                    setActiveTab('calendar');
                    /** SmartScheduler useEffect dinleyicisi mount olduktan sonra */
                    window.setTimeout(() => {
                        window.dispatchEvent(
                            new CustomEvent('beauty-open-new-appointment', {
                                detail: {
                                    dateYmd,
                                    time: timeRaw,
                                    staffId: staffId || undefined,
                                    deviceId: deviceId || undefined,
                                    serviceId: serviceId || undefined,
                                },
                            })
                        );
                    }, 0);
                }}
                confirmDisabled={!wizardDate.trim()}
            >
                <div className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                        <RetailExFlatFieldLabel>{tm('date')}</RetailExFlatFieldLabel>
                        <input
                            type="date"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
                            value={wizardDate}
                            onChange={e => setWizardDate(e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <RetailExFlatFieldLabel>{tm('time')}</RetailExFlatFieldLabel>
                        <input
                            type="time"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
                            value={wizardTime}
                            onChange={e => setWizardTime(e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <RetailExFlatFieldLabel>{tm('bNewAptWizardStaff')}</RetailExFlatFieldLabel>
                        <select
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 bg-white"
                            value={wizardStaffId}
                            onChange={e => setWizardStaffId(e.target.value)}
                        >
                            <option value="">—</option>
                            {specialists.filter(s => s.is_active !== false).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <RetailExFlatFieldLabel>{tm('bNewAptWizardDevice')}</RetailExFlatFieldLabel>
                        <select
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 bg-white"
                            value={wizardDeviceId}
                            onChange={e => setWizardDeviceId(e.target.value)}
                        >
                            <option value="">—</option>
                            {devices.filter(d => d.is_active !== false).map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </RetailExFlatModal>
        </div>
    );
}

export default function BeautyModule(props: BeautyModuleProps) {
    return (
        <ClinicErpSpecialtyProvider>
            <BeautyModuleShell {...props} />
        </ClinicErpSpecialtyProvider>
    );
}
