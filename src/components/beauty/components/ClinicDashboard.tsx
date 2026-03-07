
import React, { useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Calendar, Users, DollarSign,
    Package, ShoppingCart, Activity, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import '../ClinicStyles.css';

export function ClinicDashboard() {
    const { appointments, services, specialists } = useBeautyStore();

    const metrics = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const todayAppointments = appointments.filter(a => a.appointment_date === today);
        const completed = todayAppointments.filter(a => a.status === 'completed').length;

        return {
            todayRevenue: todayAppointments.reduce((sum, a) => sum + (a.total_price || 0), 0),
            todayCount: todayAppointments.length,
            completedCount: completed,
            activeStaff: specialists.filter(s => s.active).length,
            monthlyRevenue: appointments.reduce((sum, a) => sum + (a.total_price || 0), 0), // Mock logic for simplicity
            monthlyTarget: 1000000,
        };
    }, [appointments, specialists]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 0
        }).format(amount);
    };

    const progressPercentage = (metrics.monthlyRevenue / metrics.monthlyTarget) * 100;

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            <header className="mb-8">
                <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Klinik Özeti</h1>
                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest mt-1">Güzellik merkezinizdeki güncel durum ve veriler.</p>
            </header>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Revenue Card */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                            <DollarSign size={28} />
                        </div>
                        <div className="flex items-center gap-1 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                            <ArrowUpRight size={14} className="text-green-600" />
                            <span className="text-xs font-black text-green-600 tracking-tighter">+12.4%</span>
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">GÜNLÜK CİRO</p>
                    <p className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(metrics.todayRevenue)}</p>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>

                {/* Appointments Card */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                            <Calendar size={28} />
                        </div>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">BUGÜN</span>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">RANDEVU SAYISI</p>
                    <p className="text-2xl font-black text-gray-900 tracking-tight">{metrics.todayCount}</p>
                    <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase">{metrics.completedCount} TAMAMLANAN</p>
                </div>

                {/* Customers Card */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center text-pink-600 shadow-sm border border-pink-100">
                            <Users size={28} />
                        </div>
                        <span className="text-xs font-black text-pink-600 bg-pink-50 px-3 py-1 rounded-full border border-pink-100">AKTİF</span>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">AKTİF PERSONEL</p>
                    <p className="text-2xl font-black text-gray-900 tracking-tight">{metrics.activeStaff}</p>
                </div>

                {/* Target Progress */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                            <Activity size={28} />
                        </div>
                        <span className="text-xs font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">%{progressPercentage.toFixed(0)}</span>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1">HEDEF DOLULUK</p>
                    <div className="mt-4">
                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-50">
                            <div
                                className="bg-gradient-to-r from-orange-500 to-pink-500 h-full rounded-full transition-all duration-1000 group-hover:brightness-110"
                                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                            ></div>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-tight">Kalan Hedef: {formatCurrency(metrics.monthlyTarget - metrics.monthlyRevenue)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Popular Services */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase">Popüler Hizmetler</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">BU AY EN ÇOK TERCİH EDİLENLER</p>
                        </div>
                        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                            <ShoppingCart size={24} />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {services.slice(0, 4).map((service, index) => (
                            <div key={index} className="group">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-black text-gray-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 uppercase">{service.name}</p>
                                            <p className="text-[10px] font-bold text-gray-400 tracking-widest">{service.category}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-black text-gray-900">{formatCurrency(service.price)}</span>
                                </div>
                                <div className="w-full bg-gray-50 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-purple-600 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${100 - (index * 20)}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performers */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase">En İyi Performans</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">CİRO BAZLI PERSONEL SIRALAMASI</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                            <Users size={24} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {specialists.slice(0, 4).map((staff, index) => (
                            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-3xl border border-gray-100 hover:bg-white hover:shadow-lg transition-all cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-purple-200">
                                        {staff.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 uppercase">{staff.name}</p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{staff.role}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-gray-900">{formatCurrency(45000 / (index + 1))}</p>
                                    <p className="text-[10px] font-bold text-green-600 uppercase">+%8 VERİM</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}


