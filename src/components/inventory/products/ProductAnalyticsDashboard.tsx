import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
    BarChart3,
    TrendingUp,
    Eye,
    Map as MapIcon,
    Users,
    ChevronLeft,
    Calendar,
    Layers,
    Search
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    AreaChart,
    Area
} from 'recharts';

interface ProductStats {
    product_id: string;
    product_name: string;
    total_views: number;
    avg_duration: number;
    interest_score: number;
    vip_views: number;
    conversions: number;
}

export function ProductAnalyticsDashboard({ onBack }: { onBack: () => void }) {
    const [stats, setStats] = useState<ProductStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedZone, setSelectedZone] = useState('ALL');

    const mockData: ProductStats[] = [
        { product_id: '1', product_name: 'Pırlanta Yüzük', total_views: 1420, avg_duration: 18.5, interest_score: 92, vip_views: 45, conversions: 12 },
        { product_id: '2', product_name: 'Altın Künye', total_views: 980, avg_duration: 12.2, interest_score: 78, vip_views: 22, conversions: 18 },
        { product_id: '3', product_name: '22 Ayar Bilezik', total_views: 2150, avg_duration: 25.4, interest_score: 96, vip_views: 84, conversions: 42 },
        { product_id: '4', product_name: 'Saat G-Shock', total_views: 640, avg_duration: 8.1, interest_score: 64, vip_views: 5, conversions: 9 },
        { product_id: '5', product_name: 'Gümüş Set', total_views: 320, avg_duration: 5.4, interest_score: 42, vip_views: 12, conversions: 4 },
    ];

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // In real app: const data = await invoke('get_product_analytics_summary');
            setStats(mockData);
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2.5 hover:bg-slate-50 rounded-xl border border-slate-200 transition-all text-slate-600"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <BarChart3 className="w-7 h-7 text-indigo-600" />
                            Ürün Analitiği & AI Dashboard
                        </h2>
                        <p className="text-sm text-slate-500 font-medium">OpenCV Gaze Tracking & Müşteri İlgi Analizi</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Bugün</button>
                        <button className="px-4 py-1.5 text-sm font-bold bg-white text-indigo-600 shadow-sm rounded-lg">7 Gün</button>
                        <button className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">30 Gün</button>
                    </div>
                    <button className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                        <Calendar className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <KpiCard
                        title="Toplam Görüntüleme"
                        value="5,510"
                        trend="+12.5%"
                        icon={<Eye className="w-6 h-6" />}
                        color="indigo"
                    />
                    <KpiCard
                        title="Ort. İlgi Skoru"
                        value="74.2"
                        trend="+2.1"
                        icon={<TrendingUp className="w-6 h-6" />}
                        color="emerald"
                    />
                    <KpiCard
                        title="VIP Etkileşimi"
                        value="168"
                        trend="+34%"
                        icon={<Users className="w-6 h-6" />}
                        color="amber"
                    />
                    <KpiCard
                        title="Dönüşüm Oranı"
                        value="4.8%"
                        trend="-0.3%"
                        icon={<Layers className="w-6 h-6" />}
                        color="rose"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Chart */}
                    <div className="lg:col-span-8 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">Ürün Bazlı İlgi Analizi</h3>
                                <p className="text-sm text-slate-400 font-medium">En çok dikkat çeken ürünler ve dwell-time oranları</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">İlgi Skoru</span>
                                </div>
                            </div>
                        </div>

                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="product_name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800">
                                                        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">{payload[0].payload.product_name}</p>
                                                        <p className="text-xl font-black">{payload[0].value} <span className="text-xs text-slate-400">Puan</span></p>
                                                        <div className="mt-2 text-[10px] text-slate-400 font-bold">
                                                            Bakış Süresi: {payload[0].payload.avg_duration}sn
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="interest_score" radius={[10, 10, 10, 10]} barSize={40}>
                                        {stats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.interest_score > 90 ? '#4f46e5' : '#818cf8'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Side List */}
                    <div className="lg:col-span-4 flex flex-col gap-8">
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex-1">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6">Sıcak Bölgeler (Hot Zones)</h3>
                            <div className="space-y-4">
                                <ZoneProgress label="VİTRİN-A (Kuyum)" progress={92} color="indigo" />
                                <ZoneProgress label="VİTRİN-B (Teknoloji)" progress={65} color="emerald" />
                                <ZoneProgress label="GİRİŞ_HOLÜ" progress={45} color="amber" />
                                <ZoneProgress label="TEK_KASA_ÖNÜ" progress={78} color="rose" />
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
                                <button className="text-indigo-600 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:gap-3 transition-all">
                                    Detaylı Isı Haritasını Aç
                                    <MapIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="bg-indigo-900 rounded-3xl p-8 shadow-xl shadow-indigo-100 relative overflow-hidden group">
                            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                <TrendingUp className="w-40 h-40 text-white" />
                            </div>
                            <h4 className="text-indigo-300 text-[10px] font-black uppercase tracking-[0.2em] mb-2">AI Tahmini</h4>
                            <p className="text-white text-lg font-bold leading-tight relative z-10">
                                Önümüzdeki 24 saatte <span className="text-indigo-300">"22 Ayar Bilezik"</span> satışlarında %15 artış bekleniyor.
                            </p>
                            <button className="mt-5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-4 py-2 rounded-lg border border-white/20 transition-all uppercase tracking-widest">Aksiyon Al</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ title, value, trend, icon, color }: any) {
    const colors: any = {
        indigo: "bg-indigo-600 shadow-indigo-100 text-indigo-100",
        emerald: "bg-emerald-600 shadow-emerald-100 text-emerald-100",
        amber: "bg-amber-500 shadow-amber-100 text-amber-100",
        rose: "bg-rose-600 shadow-rose-100 text-rose-100",
    };

    return (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:translate-y-[-4px] transition-all duration-300 group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${colors[color]} group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
                <div className={`text-xs font-black p-1 px-2 rounded-lg ${trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {trend}
                </div>
            </div>
            <div>
                <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{title}</h4>
                <div className="text-3xl font-black text-slate-800 font-mono tracking-tight">{value}</div>
            </div>
        </div>
    );
}

function ZoneProgress({ label, progress, color }: any) {
    const colors: any = {
        indigo: "bg-indigo-600",
        emerald: "bg-emerald-500",
        amber: "bg-amber-400",
        rose: "bg-rose-500",
    };

    return (
        <div>
            <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-black text-slate-700 tracking-tight">{label}</span>
                <span className="text-xs font-mono font-bold text-slate-400">{progress}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${colors[color]} rounded-full transition-all duration-1000`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

