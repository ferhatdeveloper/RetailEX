import React from 'react';
import {
    Store,
    TrendingUp,
    Users,
    AlertTriangle,
    MoreVertical,
    MapPin,
    Phone,
    ArrowRight,
    Plus,
    Loader2,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useStorePanelDashboard } from '../../hooks/useInfiniteStores';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';

export function StoreManagementDashboard() {
    const { darkMode } = useTheme();
    const { selectedFirm } = useFirmaDonem();
    const currency = getFirmLedgerCurrency(
        selectedFirm,
        getAppDefaultCurrency() || getGlobalCurrency(),
    );
    const { data, isLoading, isError } = useStorePanelDashboard();

    const stores = data?.stores ?? [];
    const chartData = data?.weeklyRevenue ?? [];
    const totalRevenue = data?.totalDailyRevenue ?? 0;
    const activeStores = data?.activeStores ?? 0;
    const totalStores = data?.totalStores ?? 0;
    const totalStaff = data?.totalStaff ?? 0;
    const criticalStock = data?.criticalStockCount ?? 0;

    const fmt = (n: number) => formatLedgerAmount(n, currency);

    return (
        <div className={`h-full flex flex-col p-6 overflow-y-auto ${darkMode ? 'bg-gray-900 text-white' : 'bg-slate-50 text-slate-900'}`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <Store className="w-8 h-8 text-blue-600" />
                        Mağaza Yönetimi
                    </h1>
                    <p className={`mt-1 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                        Tüm şubelerin performansını ve durumunu tek yerden yönetin.
                    </p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20">
                    <Plus className="w-5 h-5" />
                    <span>Yeni Mağaza Ekle</span>
                </button>
            </div>

            {isLoading && (
                <div className={`flex items-center gap-2 mb-6 text-sm ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mağaza verileri yükleniyor…
                </div>
            )}
            {isError && (
                <div className="mb-6 text-sm text-red-600">
                    Mağaza verileri alınamadı. Bağlantıyı kontrol edin.
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[
                    { title: 'Toplam Günlük Ciro', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
                    { title: 'Aktif Mağazalar', value: `${activeStores}/${totalStores}`, icon: Store, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
                    { title: 'Toplam Personel', value: String(totalStaff), icon: Users, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
                    { title: 'Kritik Stok Uyarıları', value: String(criticalStock), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
                ].map((stat, idx) => (
                    <div key={idx} className={`p-6 rounded-2xl shadow-sm border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>{stat.title}</p>
                                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                            </div>
                            <div className={`p-3 rounded-xl ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Store List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold mb-4">Mağazalarım</h2>
                    {!isLoading && stores.length === 0 ? (
                        <div className={`p-8 rounded-2xl border text-center ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-slate-200 text-slate-500'}`}>
                            Bu firmada tanımlı mağaza yok.
                        </div>
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {stores.map((store) => (
                            <div
                                key={store.id}
                                className={`group p-5 rounded-2xl border transition-all hover:shadow-md cursor-pointer ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-blue-500' : 'bg-white border-slate-200 hover:border-blue-500'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${store.status === 'open'
                                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                                            }`}>
                                            <Store className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">{store.name}</h3>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${store.status === 'open'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                }`}>
                                                {store.status === 'open' ? 'Açık' : 'Kapalı'}
                                            </span>
                                        </div>
                                    </div>
                                    <button className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${darkMode ? 'text-gray-400' : 'text-slate-400'}`}>
                                        <MoreVertical className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-2 text-sm">
                                    {store.location ? (
                                    <div className={`flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                                        <MapPin className="w-4 h-4 shrink-0" />
                                        {store.location}
                                    </div>
                                    ) : null}
                                    {store.manager ? (
                                    <div className={`flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                                        <Users className="w-4 h-4 shrink-0" />
                                        {store.manager}
                                    </div>
                                    ) : null}
                                    {store.phone ? (
                                    <div className={`flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                                        <Phone className="w-4 h-4 shrink-0" />
                                        {store.phone}
                                    </div>
                                    ) : null}
                                </div>

                                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                    <div>
                                        <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>Günlük Ciro</span>
                                        <p className="font-bold text-lg">{fmt(store.dailyRevenue)}</p>
                                    </div>
                                    <button className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors">
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    )}
                </div>

                {/* Analytics Chart */}
                <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
                    <h2 className="text-xl font-semibold mb-6">Haftalık Ciro Analizi</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e2e8f0'} vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke={darkMode ? '#9ca3af' : '#64748b'}
                                    tick={{ fill: darkMode ? '#9ca3af' : '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke={darkMode ? '#9ca3af' : '#64748b'}
                                    tick={{ fill: darkMode ? '#9ca3af' : '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => {
                                        const n = Number(value) || 0;
                                        if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
                                        return String(n);
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: darkMode ? '#1f2937' : '#fff',
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                    }}
                                    itemStyle={{ color: darkMode ? '#fff' : '#0f172a' }}
                                    formatter={(value: any) => [fmt(Number(value) || 0), 'Ciro']}
                                />
                                <Bar
                                    dataKey="revenue"
                                    fill="#3b82f6"
                                    radius={[6, 6, 0, 0]}
                                    barSize={32}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-6 space-y-4">
                        <h3 className="font-medium text-sm text-gray-500 uppercase tracking-widest">Hızlı İşlemler</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button className={`p-3 rounded-xl text-left text-sm font-medium border transition-colors ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                Satış Raporları
                            </button>
                            <button className={`p-3 rounded-xl text-left text-sm font-medium border transition-colors ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                Stok Transferi
                            </button>
                            <button className={`p-3 rounded-xl text-left text-sm font-medium border transition-colors ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                Personel Planlama
                            </button>
                            <button className={`p-3 rounded-xl text-left text-sm font-medium border transition-colors ${darkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                Bölge Ayarları
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
