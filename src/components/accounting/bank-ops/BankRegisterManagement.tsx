/**
 * Bank Register Management Module - Banka Yönetimi
 * Modern UI for managing bank accounts and transactions
 */

import { useState, useEffect } from 'react';
import {
    Building2, DollarSign, TrendingUp, AlertTriangle, Clock,
    CheckCircle, Plus, RefreshCw, CreditCard
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { invoke } from '@tauri-apps/api/core';

interface BankRegister {
    id?: string;
    code: string;
    bank_name: string;
    branch_name?: string;
    account_no?: string;
    iban?: string;
    currency_code: string;
    balance: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

interface BankTransaction {
    id?: string;
    register_id: string;
    fiche_no?: string;
    date: string;
    amount: number;
    sign: number; // 1 for Inflow, -1 for Outflow
    is_active: boolean;
    definition?: string;
    transaction_type?: string;
    created_at?: string;
}

export function BankRegisterManagement() {
    const { t, tm, language } = useLanguage();
    const [activeTab, setActiveTab] = useState<'registers' | 'transactions'>('registers');
    const [registers, setRegisters] = useState<BankRegister[]>([]);
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const config = await invoke<any>('get_app_config');
            const firmNr = config.firm_nr || '001';

            const bankRegisters = await invoke<BankRegister[]>('get_bank_registers', {
                firmNr,
                dbPath: config.local_db,
                user: config.pg_local_user,
                pass: config.pg_local_pass
            });
            setRegisters(bankRegisters);

            const bankTxs = await invoke<BankTransaction[]>('get_bank_transactions', {
                firmNr,
                registerId: null,
                dbPath: config.local_db,
                user: config.pg_local_user,
                pass: config.pg_local_pass
            });
            setTransactions(bankTxs);
        } catch (error) {
            console.error('Error loading bank data:', error);
            toast.error(t.error || 'Veriler yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const registerColumnHelper = createColumnHelper<BankRegister>();
    const registerColumns = [
        registerColumnHelper.accessor('is_active', {
            header: tm('status').toUpperCase(),
            cell: info => (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${info.getValue()
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                    }`}>
                    {info.getValue() ? tm('active').toUpperCase() : tm('inactive').toUpperCase()}
                </span>
            ),
            size: 90
        }),
        registerColumnHelper.accessor('code', {
            header: tm('code').toUpperCase(),
            cell: info => <span className="font-semibold text-blue-600">{info.getValue()}</span>,
            size: 100
        }),
        registerColumnHelper.accessor('bank_name', {
            header: tm('bankName').toUpperCase(),
            size: 180
        }),
        registerColumnHelper.accessor('branch_name', {
            header: tm('branchName').toUpperCase(),
            cell: info => info.getValue() || '-',
            size: 150
        }),
        registerColumnHelper.accessor('account_no', {
            header: tm('accountNo').toUpperCase(),
            cell: info => info.getValue() || '-',
            size: 140
        }),
        registerColumnHelper.accessor('iban', {
            header: 'IBAN',
            cell: info => info.getValue() || '-',
            size: 200
        }),
        registerColumnHelper.accessor('balance', {
            header: tm('balance').toUpperCase(),
            cell: info => (
                <span className="font-semibold text-green-600">
                    {formatCurrency(info.getValue())} {info.row.original.currency_code}
                </span>
            ),
            size: 140
        }),
        registerColumnHelper.accessor('created_at', {
            header: tm('createdAt').toUpperCase(),
            cell: info => info.getValue() ? new Date(info.getValue()!).toLocaleString(
                language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'
            ) : '-',
            size: 160
        }),
    ];

    const txColumnHelper = createColumnHelper<BankTransaction>();
    const txColumns = [
        txColumnHelper.accessor('date', {
            header: tm('date').toUpperCase(),
            cell: info => new Date(info.getValue()).toLocaleString(
                language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'
            ),
            size: 160
        }),
        txColumnHelper.accessor('fiche_no', {
            header: tm('ficheNo').toUpperCase(),
            cell: info => info.getValue() || '-',
            size: 120
        }),
        txColumnHelper.accessor('transaction_type', {
            header: tm('type').toUpperCase(),
            cell: info => info.getValue() || '-',
            size: 150
        }),
        txColumnHelper.accessor('amount', {
            header: t.amount.toUpperCase(),
            cell: info => (
                <span className={`font-semibold ${info.row.original.sign === 1 ? 'text-green-600' : 'text-red-600'}`}>
                    {info.row.original.sign === 1 ? '+' : '-'}{formatCurrency(info.getValue())}
                </span>
            ),
            size: 130
        }),
        txColumnHelper.accessor('definition', {
            header: t.description.toUpperCase(),
            cell: info => info.getValue() || '-',
            size: 250
        })
    ];

    const stats = {
        activeCount: registers.filter(r => r.is_active).length,
        totalBalance: registers.reduce((sum, r) => sum + r.balance, 0),
        inflowToday: transactions
            .filter(t => new Date(t.date).toDateString() === new Date().toDateString() && t.sign === 1)
            .reduce((sum, t) => sum + t.amount, 0),
        outflowToday: transactions
            .filter(t => new Date(t.date).toDateString() === new Date().toDateString() && t.sign === -1)
            .reduce((sum, t) => sum + t.amount, 0)
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Building2 className="w-8 h-8 text-blue-600" />
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
                        {tm('newBankRegister')}
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
                <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-blue-600 mb-1 font-semibold">{tm('activeBanks')}</p>
                            <p className="text-2xl font-bold text-blue-900">{stats.activeCount}</p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-blue-600" />
                    </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600 mb-1 font-semibold">{tm('totalBalance')}</p>
                            <p className="text-xl font-bold text-green-900">
                                {formatCurrency(stats.totalBalance)} {tm('currencyCode')}
                            </p>
                        </div>
                        <DollarSign className="w-8 h-8 text-green-600" />
                    </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-purple-600 mb-1 font-semibold">{tm('inflowToday')}</p>
                            <p className="text-xl font-bold text-purple-900">
                                {formatCurrency(stats.inflowToday)} {tm('currencyCode')}
                            </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-purple-600" />
                    </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-600 mb-1 font-semibold">{tm('outflowToday')}</p>
                            <p className="text-xl font-bold text-red-900">
                                {formatCurrency(stats.outflowToday)} {tm('currencyCode')}
                            </p>
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
                        {tm('bankRegisters')}
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${activeTab === 'transactions'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tm('transactionHistory')}
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {activeTab === 'registers' && (
                    <DevExDataGrid
                        data={registers}
                        columns={registerColumns}
                        enableFiltering
                        enableSorting
                        enablePagination
                        pageSize={20}
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
        </div>
    );
}


