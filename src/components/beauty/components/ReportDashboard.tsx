
import React, { useEffect, useState } from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign,
    Users, Activity, Download, Calendar, ArrowUpRight,
    ArrowDownRight, PieChart, ShoppingBag, Star, Loader2
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { beautyService } from '../../../services/beautyService';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

const CATEGORY_TR: Record<string, string> = {
    laser: 'Lazer Epilasyon', hair_salon: 'Kuaför', beauty: 'Güzellik',
    botox: 'Botoks', filler: 'Dolgu', massage: 'Masaj',
    skincare: 'Cilt Bakımı', makeup: 'Makyaj', nails: 'Tırnak', spa: 'Spa', other: 'Diğer',
};

const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(n);

const pctChange = (current: number, prev: number): { pct: string; up: boolean } => {
    if (prev === 0) return { pct: current > 0 ? '+100%' : '0%', up: current > 0 };
    const diff = ((current - prev) / prev) * 100;
    return { pct: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, up: diff >= 0 };
};

type ReportStats = Awaited<ReturnType<typeof beautyService.getReportStats>>;

export function ReportDashboard() {
    const { specialists } = useBeautyStore();
    const [stats, setStats]     = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        beautyService.getReportStats()
            .then(setStats)
            .catch(e => setError(e?.message || String(e)))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center h-full gap-3 text-purple-600">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-bold">Rapor verileri yükleniyor...</span>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-red-500">
            <BarChart3 size={32} />
            <p className="text-sm font-bold">Veriler yüklenemedi</p>
            <p className="text-xs text-slate-400">{error}</p>
            <Button onClick={() => { setLoading(true); setError(null); beautyService.getReportStats().then(setStats).catch(e => setError(String(e))).finally(() => setLoading(false)); }}
                className="mt-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-4 h-9 text-xs font-bold">
                Tekrar Dene
            </Button>
        </div>
    );

    const revenueChg    = pctChange(stats!.monthlyRevenue, stats!.prevMonthRevenue);
    const txChg         = pctChange(stats!.transactionCount, stats!.prevMonthTransactions);
    const totalRevDist  = stats!.serviceDistribution.reduce((s, r) => s + r.revenue, 0) || 1;

    const kpiStats = [
        { label: 'AYLIK TOPLAM CİRO',  value: fmt(stats!.monthlyRevenue),    ...revenueChg, icon: DollarSign, color: 'purple' },
        { label: 'TOPLAM İŞLEM SAYISI', value: stats!.transactionCount.toString(), ...txChg, icon: Activity, color: 'blue' },
        { label: 'YENİ MÜŞTERİ',        value: stats!.newCustomers.toString(),   pct: '—', up: true, icon: Users, color: 'pink' },
        { label: 'ORTALAMA SEPET',       value: fmt(stats!.avgCartValue),          pct: '—', up: true, icon: ShoppingBag, color: 'orange' },
    ];

    // Pad trend to always show 6 bars
    const trendData = (() => {
        const raw = stats!.revenueTrend;
        if (raw.length === 0) return [];
        const maxRev = Math.max(...raw.map(r => r.revenue), 1);
        return raw.map(r => ({ ...r, pct: Math.round((r.revenue / maxRev) * 100) }));
    })();

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Performans Raporları</h1>
                    <p className="text-sm text-gray-500 mt-1">Klinik verilerinizi analiz edin ve büyüme stratejinizi belirleyin.</p>
                </div>
                <div className="flex gap-2">
                    <Button className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold px-5 py-2 rounded-2xl shadow-sm flex items-center gap-2 text-sm">
                        <Calendar size={16} /> Bu Ay
                    </Button>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpiStats.map((stat, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                        <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500 group-hover:scale-110 shadow-lg",
                            stat.color === 'purple' ? "bg-purple-100 text-purple-600 shadow-purple-100/50" :
                                stat.color === 'blue'   ? "bg-blue-100   text-blue-600   shadow-blue-100/50"   :
                                    stat.color === 'pink'   ? "bg-pink-100   text-pink-600   shadow-pink-100/50"   :
                                        "bg-orange-100 text-orange-600 shadow-orange-100/50"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                        <p className="text-2xl font-black text-gray-900 tracking-tight">{stat.value}</p>
                        {stat.pct !== '—' && (
                            <div className="mt-4 flex items-center gap-2">
                                <span className={cn(
                                    "flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter",
                                    stat.up ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                )}>
                                    {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {stat.pct}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">geçen aya göre</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Trend */}
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 uppercase">CİRO TRENDİ</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SON 6 AYIN KARŞILAŞTIRMASI</p>
                        </div>
                    </div>
                    {trendData.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-300 flex-col gap-2">
                            <BarChart3 size={36} />
                            <p className="text-xs font-bold">Henüz satış verisi yok</p>
                        </div>
                    ) : (
                        <div className="h-64 flex items-end justify-between gap-4 px-2">
                            {trendData.map((r, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-full relative group cursor-pointer">
                                        <div className="bg-gray-100 w-full rounded-2xl" style={{ height: '16rem' }} />
                                        <div
                                            className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-purple-600 to-indigo-500 rounded-2xl transition-all duration-700 group-hover:brightness-110"
                                            style={{ height: `${Math.max(r.pct, 4)}%` }}
                                        >
                                            <div className="opacity-0 group-hover:opacity-100 absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg font-bold pointer-events-none whitespace-nowrap">
                                                {fmt(r.revenue)}<br />{r.transactions} işlem
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{r.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Service Distribution */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 uppercase mb-1">HİZMET DAĞILIMI</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">KATEGORİ BAZLI ANALİZ</p>
                    {stats!.serviceDistribution.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-gray-300 flex-col gap-2">
                            <PieChart size={28} />
                            <p className="text-xs font-bold">Veri yok</p>
                        </div>
                    ) : (
                        <div className="flex-1 space-y-5">
                            {stats!.serviceDistribution.map((cat, i) => {
                                const COLORS = ['bg-purple-600', 'bg-blue-500', 'bg-pink-500', 'bg-orange-400', 'bg-teal-500', 'bg-indigo-400'];
                                const pct = Math.round((cat.revenue / totalRevDist) * 100);
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                                            <span>{CATEGORY_TR[cat.category] ?? cat.category}</span>
                                            <span>%{pct}</span>
                                        </div>
                                        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div className={cn("h-full rounded-full transition-all duration-700", COLORS[i % COLORS.length])} style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">{cat.count} işlem · {fmt(cat.revenue)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Staff Performance */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-900 uppercase">PERSONEL PERFORMANSI</h3>
                    <PieChart className="text-gray-300" size={24} />
                </div>
                {stats!.staffPerformance.length === 0 ? (
                    <div className="py-12 text-center text-gray-300">
                        <Users size={32} className="mx-auto mb-2" />
                        <p className="text-xs font-bold">Bu ay henüz işlem yok</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-50/50">
                                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">UZMAN</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">İŞLEM SAYISI</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">TOPLAM CİRO</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">HAKEDİŞ</th>
                                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">KOMİSYON</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {stats!.staffPerformance.map((staff, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 font-black text-sm uppercase">
                                                    {staff.name.charAt(0)}
                                                </div>
                                                <span className="font-bold text-gray-900 text-sm">{staff.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 font-bold text-gray-600 text-xs">{staff.transactions} işlem</td>
                                        <td className="px-8 py-5 font-black text-gray-900 text-sm">{fmt(staff.revenue)}</td>
                                        <td className="px-8 py-5 font-bold text-purple-600 text-sm">{fmt(staff.commission)}</td>
                                        <td className="px-8 py-5 font-bold text-gray-500 text-xs">%{staff.commission_rate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
