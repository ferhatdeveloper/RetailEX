/**
 * Bank Register Management Module - Banka Yönetimi
 * Follows the same design pattern as CashRegisterManagement
 */

import { useState, useEffect } from 'react';
import {
    Building2, Banknote, TrendingUp, AlertTriangle, Clock,
    CheckCircle, Plus, RefreshCw, Landmark
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { fetchBankalar, fetchBankaIslemleri, type Banka, type BankaIslemi } from '../../../services/api/banka';
import { BankaDefinitionModal } from '@/components/accounting/cash-ops/BankaDefinitionModal';
import { BankaIslemleriModal } from '@/components/accounting/cash-ops/BankaIslemleriModal';
import { toast } from 'sonner';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export function BankRegisterManagement() {
    const { t, tm, language } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();
    const [activeTab, setActiveTab] = useState<'registers' | 'transactions'>('registers');
    const [bankalar, setBankalar] = useState<Banka[]>([]);
    const [transactions, setTransactions] = useState<BankaIslemi[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedBanka, setSelectedBanka] = useState<Banka | null>(null);
    const [selectedBankaIslemleri, setSelectedBankaIslemleri] = useState<BankaIslemi[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        if (selectedFirm) {
            loadData();
        }
    }, [selectedFirm, selectedPeriod]);

    const loadData = async () => {
        if (!selectedFirm) return;
        setLoading(true);
        try {
            const bData = await fetchBankalar();
            setBankalar(bData);

            const tData = await fetchBankaIslemleri();
            setTransactions(tData);
        } catch (error) {
            console.error('Error loading bank data:', error);
            toast.error(t.error);
        } finally {
            setLoading(false);
        }
    };

    const handleRowDoubleClick = async (banka: Banka) => {
        setSelectedBanka(banka);
        setShowDetailModal(true);
        setLoadingDetail(true);
        try {
            const data = await fetchBankaIslemleri({ banka_id: banka.id });
            setSelectedBankaIslemleri(data);
        } catch (error) {
            toast.error(tm('errorLoadingOrders'));
        } finally {
            setLoadingDetail(false);
        }
    };

    const bankaColumnHelper = createColumnHelper<Banka>();
    const bankaColumns = [
        bankaColumnHelper.accessor('aktif', {
            header: tm('status'),
            cell: info => (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${info.getValue()
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                    }`}>
                    {info.getValue() ? tm('open') : tm('closed')}
                </span>
            ),
            size: 90
        }),
        bankaColumnHelper.accessor('banka_kodu', {
            header: tm('code'),
            cell: info => <span className="font-semibold">{info.getValue()}</span>,
            size: 120
        }),
        bankaColumnHelper.accessor('banka_adi', {
            header: tm('bankBankName'),
            size: 200
        }),
        bankaColumnHelper.accessor('iban', {
            header: tm('iban'),
            cell: info => <span className="text-xs font-mono">{info.getValue() || '-'}</span>,
            size: 200
        }),
        bankaColumnHelper.accessor('bakiye', {
            header: t.balance,
            cell: info => (
                <span className={`font-semibold ${info.getValue() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(info.getValue())} {info.row.original.id_doviz_kodu}
                </span>
            ),
            size: 150
        }),
        bankaColumnHelper.accessor('olusturma_tarihi', {
            header: tm('date'),
            cell: info => info.getValue() ? new Date(info.getValue()).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : '-',
            size: 160
        }),
    ];

    const txColumnHelper = createColumnHelper<BankaIslemi>();
    const txColumns = [
        txColumnHelper.accessor('islem_tarihi', {
            header: tm('date'),
            cell: info => info.getValue() ? new Date(info.getValue()).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : '-',
            size: 150
        }),
        txColumnHelper.accessor('islem_no', {
            header: tm('transactionNo'),
            size: 120
        }),
        txColumnHelper.accessor('islem_tipi', {
            header: tm('transactionType'),
            size: 130
        }),
        txColumnHelper.accessor('tutar', {
            header: t.amount,
            cell: info => (
                <span className="font-semibold text-blue-600">
                    {formatCurrency(info.getValue())}
                </span>
            ),
            size: 130
        }),
        txColumnHelper.accessor('islem_aciklamasi', {
            header: t.description,
            size: 250
        })
    ];

    const stats = {
        activeCount: bankalar.filter(b => b.aktif).length,
        totalBalance: bankalar.reduce((sum, b) => sum + b.bakiye, 0),
        txToday: transactions.filter(t => t.islem_tarihi && new Date(t.islem_tarihi).toDateString() === new Date().toDateString()).length,
        lastTxAmount: transactions[0]?.tutar || 0
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Landmark className="w-8 h-8 text-blue-600" />
                        {tm('bankManagement')}
                    </h1>
                    <p className="text-gray-600 mt-1">
                        {tm('bankManagementDesc')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-sm transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        {tm('newBankAccount')}
                    </button>
                    <button
                        onClick={loadData}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-all"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-blue-600 mb-1 font-semibold">{tm('activeAccounts')}</p>
                            <p className="text-2xl font-bold text-blue-900">{stats.activeCount}</p>
                        </div>
                        <Building2 className="w-8 h-8 text-blue-600" />
                    </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600 mb-1 font-semibold">{tm('totalBalance')}</p>
                            <p className="text-xl font-bold text-green-900">{formatCurrency(stats.totalBalance)} IQD</p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-purple-600 mb-1 font-semibold">{tm('todaysTransactions')}</p>
                            <p className="text-2xl font-bold text-purple-900">{stats.txToday}</p>
                        </div>
                        <Clock className="w-8 h-8 text-purple-600" />
                    </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600 mb-1 font-semibold">{tm('lastTransaction')}</p>
                            <p className="text-xl font-bold text-red-900">{formatCurrency(stats.lastTxAmount)} IQD</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('registers')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${activeTab === 'registers'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tm('bankCards')}
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${activeTab === 'transactions'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tm('allBankMovements')}
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {activeTab === 'registers' && (
                    <DevExDataGrid
                        data={bankalar}
                        columns={bankaColumns}
                        enableFiltering
                        enableSorting
                        enablePagination
                        pageSize={20}
                        onRowDoubleClick={handleRowDoubleClick}
                    />
                )}

                {activeTab === 'transactions' && (
                    <DevExDataGrid
                        data={transactions}
                        columns={txColumns}
                        enableFiltering
                        enableSorting
                        enablePagination
                        pageSize={20}
                    />
                )}
            </div>

            {/* Modals */}
            {showAddModal && (
                <BankaDefinitionModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false);
                        loadData();
                    }}
                />
            )}

            {showDetailModal && selectedBanka && (
                <BankaIslemleriModal
                    banka={selectedBanka}
                    islemler={selectedBankaIslemleri}
                    loading={loadingDetail}
                    onClose={() => setShowDetailModal(false)}
                    onIslemClick={async () => {
                        loadData();
                    }}
                />
            )}
        </div>
    );
}


