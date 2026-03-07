
import React, { useState } from 'react';
import {
    LayoutDashboard, Users, Calendar, Scissors, Package,
    UserCog, BarChart3, Settings, Bell, Search, Plus,
    ArrowLeft, Box
} from 'lucide-react';
import { useBeautyStore } from './store/useBeautyStore';
import { useLanguage } from '@/contexts/LanguageContext';

// Sub-components
import { SmartScheduler } from './components/SmartScheduler';
import { ClientCRM } from './components/ClientCRM';
import { PackageManagement } from './components/PackageManagement';
import { ClinicDashboard } from './components/ClinicDashboard';
import { ServiceManagement } from './components/ServiceManagement';
import { StaffManagement } from './components/StaffManagement';
import { DeviceManagement } from './components/DeviceManagement';
import { ReportDashboard } from './components/ReportDashboard';
import './ClinicStyles.css';

interface MenuItem {
    id: string;
    icon: React.ElementType;
    label: string;
}

export default function BeautyModule() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const { loadSpecialists, loadServices, loadAppointments } = useBeautyStore();
    const { t } = useLanguage();

    React.useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        loadSpecialists();
        loadServices();
        loadAppointments(today);
    }, []);

    const menuGroups = {
        main: [
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        ],
        operations: [
            { id: 'clients', icon: Users, label: 'Müşteriler' },
            { id: 'calendar', icon: Calendar, label: 'Randevular' },
        ],
        catalog: [
            { id: 'services', icon: Scissors, label: 'Hizmetler' },
            { id: 'packages', icon: Package, label: 'Paketler' },
            { id: 'devices', icon: Box, label: 'Cihazlar' },
        ],
        management: [
            { id: 'staff', icon: UserCog, label: 'Personel' },
            { id: 'reports', icon: BarChart3, label: 'Raporlar' }
        ]
    };

    const renderMenuItem = (item: MenuItem) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;

        return (
            <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                    ? 'bg-purple-50 text-purple-600 shadow-sm font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
                <Icon size={20} className={isActive ? 'text-purple-600' : 'text-gray-500'} />
                {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
            </button>
        );
    };

    const renderMenuGroup = (title: string, items: MenuItem[]) => (
        <div key={title} className="mb-6">
            {!sidebarCollapsed && (
                <h3 className="text-[10px] uppercase tracking-widest text-gray-400 px-3 mb-2 font-bold">
                    {title}
                </h3>
            )}
            <div className="space-y-1">
                {items.map(renderMenuItem)}
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Sidebar */}
            <aside
                className={`${sidebarCollapsed ? 'w-20' : 'w-64'
                    } bg-white border-r border-gray-200 transition-all duration-300 flex flex-col z-20`}
            >
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
                    {!sidebarCollapsed && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                                <Box className="text-white w-5 h-5" />
                            </div>
                            <span className="text-gray-900 font-bold tracking-tight">ClinicERP</span>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-500"
                    >
                        {sidebarCollapsed ? <Plus size={20} className="rotate-45" /> : <ArrowLeft size={20} />}
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {renderMenuGroup('Genel', menuGroups.main)}
                    {renderMenuGroup('Operasyonlar', menuGroups.operations)}
                    {renderMenuGroup('Tanımlar', menuGroups.catalog)}
                    {renderMenuGroup('Yönetim', menuGroups.management)}
                </nav>

                <div className="border-t border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                            C
                        </div>
                        {!sidebarCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">Clinic Admin</p>
                                <p className="text-xs text-gray-500 truncate">Yönetici</p>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-bold text-gray-900 capitalize tracking-tight">
                            {activeTab.replace('-', ' ')}
                        </h2>
                        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            SİSTEM AKTİF
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative hidden lg:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Müşteri veya işlem ara..."
                                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 w-64 transition-all"
                            />
                        </div>

                        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl relative">
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>
                        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl">
                            <Settings size={20} />
                        </button>

                        <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-purple-600/20 active:scale-95 font-bold text-sm">
                            <Plus size={18} />
                            <span>YENİ RANDEVU</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto bg-gray-50">
                    {activeTab === 'dashboard' && <ClinicDashboard />}
                    {activeTab === 'calendar' && <SmartScheduler />}
                    {activeTab === 'clients' && <ClientCRM />}
                    {activeTab === 'packages' && <PackageManagement />}
                    {activeTab === 'services' && <ServiceManagement />}
                    {activeTab === 'staff' && <StaffManagement />}
                    {activeTab === 'devices' && <DeviceManagement />}
                    {activeTab === 'reports' && <ReportDashboard />}
                </main>
            </div>
        </div>
    );
}



