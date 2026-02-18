import React, { useState, useEffect } from 'react';
import {
    FileText,
    CheckCircle,
    AlertCircle,
    Clock,
    RefreshCw,
    Search,
    ChevronRight,
    Filter,
    ArrowUpRight
} from 'lucide-react';
import { accountingService, ReconciliationSummary, SyncTransaction } from '../../services/AccountingService';
import { ERP_SETTINGS } from '../../services/postgres';

const ReconciliationDashboard: React.FC = () => {
    const [summary, setSummary] = useState<ReconciliationSummary>({ pending: 0, success: 0, error: 0, total: 0 });
    const [transactions, setTransactions] = useState<SyncTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<string | undefined>(undefined);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [s, t] = await Promise.all([
                accountingService.getReconciliationSummary(ERP_SETTINGS.firmNr, ERP_SETTINGS.periodNr),
                accountingService.getTransactions(ERP_SETTINGS.firmNr, ERP_SETTINGS.periodNr, filter)
            ]);
            setSummary(s);
            setTransactions(t);
        } catch (error) {
            console.error('Failed to load reconciliation data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filter, ERP_SETTINGS.firmNr, ERP_SETTINGS.periodNr]);

    const handleRetry = async (id: string, firmNr: string, periodNr: string) => {
        const success = await accountingService.retrySync(id, firmNr, periodNr);
        if (success) fetchData();
    };

    const handleRetryAll = async () => {
        await accountingService.retryAllErrors(ERP_SETTINGS.firmNr, ERP_SETTINGS.periodNr);
        fetchData();
    };

    const filteredTransactions = transactions.filter(t =>
        t.fiche_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 text-sm font-medium">Toplam İşlem</span>
                        <div className="p-2 bg-slate-50 rounded-lg"><FileText className="w-4 h-4 text-slate-400" /></div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-emerald-600 text-sm font-medium">Aktarılanlar</span>
                        <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle className="w-4 h-4 text-emerald-500" /></div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{summary.success}</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-amber-600 text-sm font-medium">Bekleyenler</span>
                        <div className="p-2 bg-amber-50 rounded-lg"><Clock className="w-4 h-4 text-amber-500" /></div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{summary.pending}</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm ring-2 ring-rose-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-rose-600 text-sm font-medium">Hatalı Olanlar</span>
                        <div className="p-2 bg-rose-50 rounded-lg"><AlertCircle className="w-4 h-4 text-rose-500" /></div>
                    </div>
                    <div className="flex items-end justify-between">
                        <div className="text-2xl font-bold text-slate-900">{summary.error}</div>
                        {summary.error > 0 && (
                            <button
                                onClick={handleRetryAll}
                                className="text-[10px] text-rose-600 font-bold hover:underline"
                            >
                                Hataları Tekrarla
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* List Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <h3 className="font-semibold text-slate-800">Muhasebe Mutabakat Listesi</h3>
                        <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                            <button
                                onClick={() => setFilter(undefined)}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${!filter ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            > Hepsi </button>
                            <button
                                onClick={() => setFilter('error')}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${filter === 'error' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            > Hatalar </button>
                            <button
                                onClick={() => setFilter('pending')}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${filter === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            > Bekleyen </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Fiş no veya müşteri..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none w-64"
                            />
                        </div>
                        <button
                            onClick={fetchData}
                            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white sticky top-0 border-b border-slate-100 text-slate-400 font-medium text-[11px] uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Tarih / Fiş No</th>
                                <th className="px-6 py-3">Müşteri</th>
                                <th className="px-6 py-3">Tutar</th>
                                <th className="px-6 py-3">Durum</th>
                                <th className="px-6 py-3">Logo Detayı</th>
                                <th className="px-6 py-3">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredTransactions.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800">{t.fiche_no}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">{new Date(t.date).toLocaleString('tr-TR')}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-700">{t.customer_name || '-'}</td>
                                    <td className="px-6 py-4 font-bold text-slate-900">{t.total_gross.toLocaleString('tr-TR')} <span className="text-[10px] text-slate-400">IQD</span></td>
                                    <td className="px-6 py-4">
                                        {t.logo_sync_status === 'success' ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold">
                                                <CheckCircle className="w-3 h-3" /> AKTARILDI
                                            </span>
                                        ) : t.logo_sync_status === 'error' ? (
                                            <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[10px] font-bold">
                                                <AlertCircle className="w-3 h-3" /> HATA
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold">
                                                <Clock className="w-3 h-3" /> BEKLİYOR
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[10px] max-w-[200px] truncate text-slate-500 italic">
                                            {t.logo_sync_error || (t.logo_sync_date ? `${new Date(t.logo_sync_date).toLocaleTimeString()}'da aktarıldı` : '-')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {t.logo_sync_status !== 'success' && (
                                            <button
                                                onClick={() => handleRetry(t.id, t.firm_nr, t.period_nr)}
                                                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                                                title="Tekrar Dene"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                        Görüntülenecek işlem bulunamadı.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReconciliationDashboard;
