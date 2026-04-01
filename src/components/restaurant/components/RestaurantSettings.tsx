import React, { useState } from 'react';
import { Settings, Users, Printer, Receipt, ChevronLeft, Shield, LayoutGrid, Phone, Bike } from 'lucide-react';
import { RestaurantFoodDeliverySettings } from './RestaurantFoodDeliverySettings';
import { RestaurantPrinterSettings } from './RestaurantPrinterSettings';
import { RestaurantCallerIdSettings } from './RestaurantCallerIdSettings';
import { UserManagementModule } from '../../system/UserManagementModule';
import { RoleManagement } from '../../system/RoleManagement';
import { FloorTableManagement } from './FloorTableManagement';
import { cn } from '@/components/ui/utils';

export function RestaurantSettings({ onBack }: { onBack: () => void }) {
    const [activeTab, setActiveTab] = useState<
        'general' | 'users' | 'roles' | 'printers' | 'receipts' | 'tables' | 'callerid' | 'delivery'
    >('general');

    return (
        <div className="flex h-full bg-slate-50 w-full overflow-hidden">
            {/* Sidebar */}
            <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                    >
                        <ChevronLeft className="w-6 h-6 text-slate-500" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-slate-800">Ayarlar</h2>
                        <p className="text-xs text-slate-500">Sistem Yapılandırması</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'general'
                                ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Settings className={cn("w-5 h-5", activeTab === 'general' ? "text-blue-500" : "text-slate-400")} />
                        Genel Ayarlar
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'users'
                                ? "bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Users className={cn("w-5 h-5", activeTab === 'users' ? "text-emerald-500" : "text-slate-400")} />
                        Kullanıcılar & Personel
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'roles'
                                ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Shield className={cn("w-5 h-5", activeTab === 'roles' ? "text-indigo-500" : "text-slate-400")} />
                        Yetkilendirme & Roller
                    </button>
                    <button
                        onClick={() => setActiveTab('printers')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'printers'
                                ? "bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Printer className={cn("w-5 h-5", activeTab === 'printers' ? "text-purple-500" : "text-slate-400")} />
                        Yazıcı ve Cihazlar
                    </button>
                    <button
                        onClick={() => setActiveTab('receipts')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'receipts'
                                ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Receipt className={cn("w-5 h-5", activeTab === 'receipts' ? "text-orange-500" : "text-slate-400")} />
                        Adisyon & Fatura
                    </button>
                    <button
                        onClick={() => setActiveTab('tables')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'tables'
                                ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <LayoutGrid className={cn("w-5 h-5", activeTab === 'tables' ? "text-blue-500" : "text-slate-400")} />
                        Masa & Bölge
                    </button>
                    <button
                        onClick={() => setActiveTab('callerid')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'callerid'
                                ? "bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Phone className={cn("w-5 h-5", activeTab === 'callerid' ? "text-violet-500" : "text-slate-400")} />
                        Arayan No (Caller ID)
                    </button>
                    <button
                        onClick={() => setActiveTab('delivery')}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                            activeTab === 'delivery'
                                ? "bg-cyan-50 text-cyan-800 shadow-sm ring-1 ring-cyan-100/50"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <Bike className={cn("w-5 h-5", activeTab === 'delivery' ? "text-cyan-600" : "text-slate-400")} />
                        Paket platformları
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-slate-50 overflow-hidden flex flex-col relative">
                <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto h-full">
                        {activeTab === 'tables' && (
                            <div className="h-full">
                                <FloorTableManagement />
                            </div>
                        )}
                        {activeTab === 'general' && (
                            <div className="flex items-center justify-center h-full text-slate-400 font-medium">
                                <div className="text-center">
                                    <Settings className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>Genel Ayarlar Yapılandırılıyor...</p>
                                </div>
                            </div>
                        )}
                        {activeTab === 'users' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden h-full">
                                <UserManagementModule />
                            </div>
                        )}
                        {activeTab === 'roles' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 h-full overflow-hidden">
                                <RoleManagement />
                            </div>
                        )}
                        {activeTab === 'printers' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                                <RestaurantPrinterSettings />
                            </div>
                        )}
                        {activeTab === 'receipts' && (
                            <div className="flex items-center justify-center h-full text-slate-400 font-medium">
                                <div className="text-center">
                                    <Receipt className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <p>Adisyon Tasarımı ve Vergi Ayarları Yapılandırılıyor...</p>
                                </div>
                            </div>
                        )}
                        {activeTab === 'callerid' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                                <RestaurantCallerIdSettings />
                            </div>
                        )}
                        {activeTab === 'delivery' && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
                                <RestaurantFoodDeliverySettings />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
