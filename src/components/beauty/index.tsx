
import React, { useState } from 'react';
import {
    LayoutDashboard, Users, Calendar, Scissors, Package,
    UserCog, BarChart3, Bell, Search, Plus,
    ChevronLeft, ChevronRight, Box, Megaphone,
    Sparkles, Settings2, ShoppingBag
} from 'lucide-react';
import { useBeautyStore } from './store/useBeautyStore';

import { SmartScheduler }    from './components/SmartScheduler';
import { ClientCRM }         from './components/ClientCRM';
import { PackageManagement } from './components/PackageManagement';
import { ClinicDashboard }   from './components/ClinicDashboard';
import { ServiceManagement } from './components/ServiceManagement';
import { StaffManagement }   from './components/StaffManagement';
import { DeviceManagement }  from './components/DeviceManagement';
import { ReportDashboard }   from './components/ReportDashboard';
import { LeadManagement }    from './components/LeadManagement';
import { AppointmentPOS }    from './components/AppointmentPOS';
import './ClinicStyles.css';

const MENU_GROUPS = [
    {
        title: 'Genel',
        items: [{ id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
    },
    {
        title: 'Operasyonlar',
        items: [
            { id: 'clients',  icon: Users,        label: 'Müşteriler' },
            { id: 'calendar', icon: Calendar,      label: 'Randevular' },
            { id: 'pos',      icon: ShoppingBag,   label: 'Kasa / POS'  },
        ],
    },
    {
        title: 'Tanımlar',
        items: [
            { id: 'services', icon: Scissors, label: 'Hizmetler' },
            { id: 'packages', icon: Package,  label: 'Paketler'  },
            { id: 'devices',  icon: Box,      label: 'Cihazlar'  },
        ],
    },
    {
        title: 'Yönetim',
        items: [
            { id: 'staff',   icon: UserCog,   label: 'Personel'   },
            { id: 'leads',   icon: Megaphone, label: 'Leads & CRM' },
            { id: 'reports', icon: BarChart3, label: 'Raporlar'   },
        ],
    },
];

const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard', clients: 'Müşteriler', calendar: 'Randevular',
    pos: 'Kasa / POS', services: 'Hizmetler', packages: 'Paketler',
    devices: 'Cihazlar', staff: 'Personel', leads: 'Leads & CRM', reports: 'Raporlar',
};

// Sidebar constants
const SIDEBAR_W  = 220;
const COLLAPSED_W = 56;

export default function BeautyModule() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [collapsed,  setCollapsed] = useState(false);
    const { loadSpecialists, loadServices, loadAppointments } = useBeautyStore();

    React.useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        loadSpecialists();
        loadServices();
        loadAppointments(today);
    }, []);

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: '#f7f6fb', fontFamily: 'inherit' }}>

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
                        style={{ width: 28, height: 28, background: '#7c3aed', borderRadius: 6 }}
                    >
                        <Sparkles size={14} color="#fff" />
                    </div>
                    {!collapsed && (
                        <div className="ml-2.5 min-w-0">
                            <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.2, letterSpacing: '-0.01em' }}>ClinicERP</p>
                            <p style={{ color: 'rgba(167,139,250,0.5)', fontWeight: 700, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Beauty Suite</p>
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
                                const Icon   = item.icon;
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
                                    <p style={{ color: '#fff', fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>Clinic Admin</p>
                                    <p style={{ color: 'rgba(167,139,250,0.5)', fontSize: 10, fontWeight: 600 }}>Yönetici</p>
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
                            Sistem Aktif
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="relative hidden lg:block">
                            <Search
                                size={14}
                                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
                            />
                            <input
                                type="text"
                                placeholder="Müşteri veya işlem ara..."
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

                        {/* CTA */}
                        <button
                            onClick={() => setActiveTab('calendar')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                height: 32, padding: '0 12px',
                                background: '#7c3aed', color: '#fff',
                                fontSize: 12, fontWeight: 700,
                                border: 'none', borderRadius: 6, cursor: 'pointer',
                                letterSpacing: '0.02em',
                                transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
                        >
                            <Plus size={13} />
                            Yeni Randevu
                        </button>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-hidden">
                    {activeTab === 'dashboard' && <ClinicDashboard />}
                    {activeTab === 'calendar'  && <SmartScheduler />}
                    {activeTab === 'pos'       && <AppointmentPOS />}
                    {activeTab === 'clients'   && <ClientCRM />}
                    {activeTab === 'packages'  && <PackageManagement />}
                    {activeTab === 'services'  && <ServiceManagement />}
                    {activeTab === 'staff'     && <StaffManagement />}
                    {activeTab === 'devices'   && <DeviceManagement />}
                    {activeTab === 'leads'     && <LeadManagement />}
                    {activeTab === 'reports'   && <ReportDashboard />}
                </main>
            </div>
        </div>
    );
}
