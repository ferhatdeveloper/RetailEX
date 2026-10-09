import React, { useState, useEffect, useMemo } from 'react';
import {
    CheckCircle, AlertCircle, RefreshCw, ArrowRightLeft,
    HelpCircle, History, Filter, FileText, WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { reconciliationService, ReconciliationResult } from '../../../services/accounting/ReconciliationService';
import { formatNumber } from '../../../utils/formatNumber';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

export function ReconciliationDashboard() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ReconciliationResult[]>([]);
    const [lastCheck, setLastCheck] = useState<Date>(new Date());

    const loadReconciliation = async () => {
        setLoading(true);
        try {
            // Assuming firm '001', period '01' for demo
            const result = await reconciliationService.reconcile('001', '01');
            setData(result);
            setLastCheck(new Date());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReconciliation();
    }, []);

    const totalDiff = data.reduce(
        (sum, item) => sum + (item.difference == null ? 0 : Math.abs(item.difference)),
        0,
    );
    const logoOfflineCount = data.filter((item) => item.logo_balance == null).length;
    const statusSeverity =
        data.length === 0
            ? 'idle'
            : logoOfflineCount === data.length
              ? 'logo_offline'
              : totalDiff === 0
                ? 'success'
                : totalDiff < 1000
                  ? 'warning'
                  : 'critical';

    type ReconGridRow = ReconciliationResult & {
        status: string;
        account_info: string;
        logo_status_label: string;
    };

    const gridRows = useMemo<ReconGridRow[]>(
        () =>
            data.map((item) => {
                const isLogoMissing = item.logo_balance == null;
                const isMatch =
                    !isLogoMissing && item.difference != null && Math.abs(item.difference) < 0.005;
                return {
                    ...item,
                    status: isLogoMissing
                        ? 'Logo Bekleniyor'
                        : isMatch
                          ? 'Tam Eşleşme'
                          : 'Uyumsuzluk',
                    account_info: `${item.account_code} • ${item.account_type.toUpperCase()}`,
                    logo_status_label: item.logo_sync_status ?? '—',
                };
            }),
        [data],
    );

    const columns = useMemo<ReportColumnTableCol<ReconGridRow>[]>(
        () => [
            {
                key: 'account_name',
                header: 'Hesap Bilgisi',
                size: 220,
                cell: (item) => (
                    <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{item.account_name}</span>
                        <span className="text-xs text-gray-500">{item.account_info}</span>
                    </div>
                ),
            },
            {
                key: 'logo_balance',
                header: 'Logo Bakiyesi',
                type: 'number',
                align: 'right',
                size: 130,
                cell: (item) =>
                    item.logo_balance == null ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 italic">
                            <WifiOff className="w-3 h-3" /> Logo bağlı değil
                        </span>
                    ) : (
                        <span className="font-mono">{formatNumber(item.logo_balance, 2, false)}</span>
                    ),
            },
            {
                key: 'rex_balance',
                header: 'RetailEX Bakiyesi',
                type: 'number',
                align: 'right',
                size: 140,
                cell: (item) => <span className="font-mono">{formatNumber(item.rex_balance, 2, false)}</span>,
            },
            {
                key: 'difference',
                header: 'Fark',
                type: 'number',
                align: 'right',
                size: 120,
                cell: (item) =>
                    item.difference == null ? (
                        <span className="text-slate-400 italic text-[11px]">—</span>
                    ) : (
                        <span
                            className={`font-mono font-bold ${
                                item.difference !== 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                        >
                            {item.difference > 0 ? '+' : ''}
                            {formatNumber(item.difference, 2, false)}
                        </span>
                    ),
            },
            {
                key: 'status',
                header: 'Durum',
                size: 140,
                cell: (item) => {
                    const cls =
                        item.status === 'Tam Eşleşme'
                            ? 'bg-green-100 text-green-700'
                            : item.status === 'Logo Bekleniyor'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-red-100 text-red-700';
                    return (
                        <span
                            className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${cls}`}
                        >
                            {item.status}
                        </span>
                    );
                },
            },
            {
                key: 'logo_status_label',
                header: 'Logo Sync',
                size: 120,
                cell: (item) => (
                    <span className="text-[11px] text-slate-500 font-mono">
                        {item.logo_status_label || '—'}
                    </span>
                ),
            },
            {
                key: 'account_code',
                header: 'İşlem',
                size: 150,
                align: 'right',
                cell: (item) => (
                    <button
                        type="button"
                        disabled={item.difference === 0 || item.difference == null}
                        onClick={async () => {
                            const res = await reconciliationService.fixDiscrepancy(item);
                            if (res.ok) {
                                toast.success(res.message);
                            } else {
                                toast.warning(res.message);
                            }
                            await loadReconciliation();
                        }}
                        className="px-3 py-1 bg-white border border-gray-200 text-indigo-600 rounded hover:bg-indigo-50 transition-colors text-xs font-medium disabled:opacity-30"
                    >
                        Düzelt & Senkron Et
                    </button>
                ),
            },
        ],
        [],
    );

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Mali Mutabakat (Reconciliation)</h1>
                        <p className="text-sm text-gray-500 mt-1">Logo ERP vs RetailEX Local Bakiyelerin Denetimi</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadReconciliation}
                            disabled={loading}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Yeniden Denetle
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div
                        className={`p-6 rounded-2xl shadow-sm border ${
                            statusSeverity === 'success'
                                ? 'bg-green-50 border-green-200'
                                : statusSeverity === 'warning'
                                  ? 'bg-yellow-50 border-yellow-200'
                                  : statusSeverity === 'logo_offline' || statusSeverity === 'idle'
                                    ? 'bg-slate-50 border-slate-200'
                                    : 'bg-red-50 border-red-200'
                        }`}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            {statusSeverity === 'success' ? (
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            ) : statusSeverity === 'logo_offline' || statusSeverity === 'idle' ? (
                                <WifiOff className="w-6 h-6 text-slate-500" />
                            ) : (
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            )}
                            <h3 className="font-semibold text-gray-900">Sistem Sağlık Durumu</h3>
                        </div>
                        <div className="text-2xl font-bold">
                            {data.length === 0
                                ? 'HESAP YOK'
                                : statusSeverity === 'success'
                                  ? 'TAM UYUMLU'
                                  : statusSeverity === 'logo_offline'
                                    ? 'LOGO BAĞLI DEĞİL'
                                    : 'MUTABAKAT GEREKİYOR'}
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                            Son Denetim: {lastCheck.toLocaleTimeString()}
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-4">
                            <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
                            <h3 className="font-semibold text-gray-900">Toplam Sapma Payı</h3>
                        </div>
                        <div
                            className={`text-2xl font-bold ${totalDiff > 0 ? 'text-red-600' : 'text-green-600'}`}
                        >
                            {formatNumber(totalDiff, 2, false)} IQD
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                            {data.length} hesap izleniyor •{' '}
                            {logoOfflineCount > 0
                                ? `${logoOfflineCount} hesap için Logo bağlantısı bekleniyor`
                                : 'Logo bağlantısı kurulu'}
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-4">
                            <History className="w-6 h-6 text-purple-600" />
                            <h3 className="font-semibold text-gray-900">İç / Dış Bakiye Kapsamı</h3>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {data.length - logoOfflineCount} / {data.length}
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                            {logoOfflineCount === 0
                                ? 'Tüm hesaplarda iç (rex) bakiye mevcut'
                                : `İç (rex): ${data.length - logoOfflineCount} • Dış (Logo) bekleniyor: ${logoOfflineCount}`}
                        </p>
                    </div>
                </div>

                {/* Reconciliation Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">Hesap Bazlı Karşılaştırma</h3>
                        <div className="flex gap-2">
                            <button className="p-2 hover:bg-gray-200 rounded-lg text-gray-500"><Filter className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <div className="p-4">
                        <ReportColumnTable
                            data={gridRows}
                            columns={columns}
                            height={520}
                            storageNamespace="accounting-reconciliation"
                        />
                    </div>
                </div>

                {/* Audit Hints */}
                <div className="bg-indigo-900 text-indigo-100 p-6 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex items-center gap-6">
                        <div className="bg-indigo-700 p-4 rounded-xl">
                            <FileText className="w-8 h-8" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold">Muhasebe Mutabakat Notu</h4>
                            <p className="opacity-80 text-sm max-w-2xl mt-1">
                                İç (RetailEX) bakiyeleri <code>rex_001_cash_registers</code>,{' '}
                                <code>rex_001_bank_registers</code>, <code>rex_001_customers</code> ve{' '}
                                <code>rex_001_suppliers</code> tablolarından gerçek zamanlı çekilir. Dış (Logo)
                                bakiyeleri, Logo ERP entegrasyonu aktifleştirildiğinde
                                <code>logo_balance</code> kolonuna yansıyacak ve fark otomatik hesaplanacak.
                                "Düzelt" butonu, Logo bağlıysa bakiyeyi rex'e senkronlar ve
                                <code>audit_logs</code>'a "Mali Düzeltme" olarak işler.
                            </p>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <CheckCircle className="w-32 h-32" />
                    </div>
                </div>
            </div>
        </div>
    );
}


