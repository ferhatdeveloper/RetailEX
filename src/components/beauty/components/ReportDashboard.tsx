
import React from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign,
    Users, Activity, Download, Calendar, ArrowUpRight,
    ArrowDownRight, PieChart, ShoppingBag, Star
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

export function ReportDashboard() {
    const { specialists } = useBeautyStore();

    const stats = [
        { label: 'AYLIK TOPLAM CİRO', value: '4.250.000 ₺', change: '+12.5%', trend: 'up', icon: DollarSign, color: 'purple' },
        { label: 'TOPLAM İŞLEM SAYISI', value: '1,284', change: '+5.2%', trend: 'up', icon: Activity, color: 'blue' },
        { label: 'YENİ MÜŞTERİ', value: '142', change: '-2.4%', trend: 'down', icon: Users, color: 'pink' },
        { label: 'ORTALAMA SEPET', value: '3,310 ₺', change: '+8.1%', trend: 'up', icon: ShoppingBag, color: 'orange' },
    ];

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Performans Raporları</h1>
                    <p className="text-sm text-gray-500 mt-1">Klinik verilerinizi analiz edin ve büyüme stratejinizi belirleyin.</p>
                </div>
                <div className="flex gap-2">
                    <Button className="bg-white border-gray-200 text-gray-600 hover:bg-gray-50 font-bold px-6 py-6 rounded-2xl shadow-sm transition-all flex items-center gap-2">
                        <Download size={20} />
                        <span>PDF DIŞA AKTAR</span>
                    </Button>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2">
                        <Calendar size={20} />
                        <span>TARİH ARALIĞI</span>
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                        <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500 group-hover:scale-110 shadow-lg",
                            stat.color === 'purple' ? "bg-purple-100 text-purple-600 shadow-purple-100/50" :
                                stat.color === 'blue' ? "bg-blue-100 text-blue-600 shadow-blue-100/50" :
                                    stat.color === 'pink' ? "bg-pink-100 text-pink-600 shadow-pink-100/50" :
                                        "bg-orange-100 text-orange-600 shadow-orange-100/50"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                        <p className="text-2xl font-black text-gray-900 tracking-tight">{stat.value}</p>
                        <div className="mt-4 flex items-center gap-2">
                            <span className={cn(
                                "flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter",
                                stat.trend === 'up' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                                {stat.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {stat.change}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">geçen aya göre</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section (Visual Dummies) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase">CİRO TRENDİ</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SON 6 AYIN KARŞILAŞTIRMASI</p>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">GELİR</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-gray-200 rounded-full"></div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">GİDER</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-64 flex items-end justify-between gap-4 px-2">
                        {[45, 65, 55, 85, 95, 75].map((h, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-full relative group cursor-pointer">
                                    <div
                                        className="bg-gray-100 w-full rounded-2xl transition-all group-hover:bg-purple-50"
                                        style={{ height: '16rem' }}
                                    ></div>
                                    <div
                                        className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-purple-600 to-indigo-500 rounded-2xl transition-all duration-1000 group-hover:brightness-110"
                                        style={{ height: `${h}%` }}
                                    >
                                        <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg font-bold pointer-events-none">
                                            {h * 10}k
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{['EYL', 'EKI', 'KAS', 'ARA', 'OCAK', 'SUB'][i]}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 uppercase mb-2">HİZMET DAĞILIMI</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8">KATEGORİ BAZLI ANALİZ</p>

                    <div className="flex-1 space-y-6">
                        {[
                            { label: 'LAZER EPİLASYON', val: 42, color: 'bg-purple-600' },
                            { label: 'CİLT BAKIMI', val: 28, color: 'bg-blue-500' },
                            { label: 'DOLGU & BOTOX', val: 18, color: 'bg-pink-500' },
                            { label: 'DİĞER', val: 12, color: 'bg-orange-400' }
                        ].map((cat, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                                    <span>{cat.label}</span>
                                    <span>%{cat.val}</span>
                                </div>
                                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-1000", cat.color)}
                                        style={{ width: `${cat.val}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-8 border-t border-gray-50 text-center">
                        <Button className="w-full bg-gray-50 text-gray-600 hover:bg-purple-50 hover:text-purple-600 rounded-2xl font-bold uppercase text-xs transition-all border border-gray-100 h-12">
                            DETAYLI ANALİZİ GÖR
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900 uppercase">PERSONEL PERFORMANSI</h3>
                    <PieChart className="text-gray-300" size={24} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">UZMAN</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">İŞLEM SAYISI</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">TOPLAM CİRO</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">HAKEDİŞ</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">MEMNUNİYET</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {specialists.slice(0, 5).map((staff, idx) => (
                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 font-black text-sm uppercase">
                                                {staff.name.charAt(0)}
                                            </div>
                                            <span className="font-bold text-gray-900 uppercase text-sm">{staff.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 font-bold text-gray-600 uppercase text-xs">{(idx + 1) * 24} SEANS</td>
                                    <td className="px-8 py-6 font-black text-gray-900 text-sm">{((idx + 1) * 25000).toLocaleString('tr-TR')} ₺</td>
                                    <td className="px-8 py-6 font-bold text-purple-600 text-sm">{(((idx + 1) * 25000) * (staff.commission_rate / 100)).toLocaleString('tr-TR')} ₺</td>
                                    <td className="px-8 py-6">
                                        <div className="flex gap-1 text-orange-400">
                                            {[1, 2, 3, 4, 5].map(s => <Star key={s} size={12} fill={s <= 5 ? "currentColor" : "none"} />)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}



