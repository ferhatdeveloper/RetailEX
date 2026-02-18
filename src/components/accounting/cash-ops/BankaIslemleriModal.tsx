/**
 * ExRetailOS - Banka İşlemleri Modal
 * Split-pane modal: Detaylı banka hareketleri
 * Flat design matching 'Ödeme Al' style
 */

import { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Plus, Minus, Landmark, FileText, ArrowRightLeft, CreditCard } from 'lucide-react';
import { Banka, BankaIslemi } from '../../../services/api/banka';
import { formatCurrency } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { BankaIslemModal } from '@/components/accounting/cash-ops/BankaIslemModal';

interface BankaIslemleriModalProps {
    banka: Banka;
    islemler: BankaIslemi[];
    loading: boolean;
    onClose: () => void;
    onIslemClick?: () => void;
}

import { useLanguage } from '../../../contexts/LanguageContext';

export function BankaIslemleriModal({ banka, islemler, loading, onClose, onIslemClick }: BankaIslemleriModalProps) {
    const { t, tm, language } = useLanguage();
    const [selectedTur, setSelectedTur] = useState<string | null>(null);
    const [showNewIslemModal, setShowNewIslemModal] = useState(false);
    const [newIslemType, setNewIslemType] = useState<any>('BANKA_GIRIS');

    const islemTurleri = useMemo(() => [
        {
            type: 'BANKA_GIRIS' as const,
            label: tm('bankEntry'),
            icon: Plus,
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            textColor: 'text-green-800',
            activeBg: 'bg-green-100 border-green-500',
        },
        {
            type: 'BANKA_CIKIS' as const,
            label: tm('bankExit'),
            icon: Minus,
            bgColor: 'bg-red-50',
            borderColor: 'border-red-200',
            textColor: 'text-red-800',
            activeBg: 'bg-red-100 border-red-500',
        },
        {
            type: 'HAVALE' as const,
            label: tm('transfer'),
            icon: ArrowRightLeft,
            bgColor: 'bg-blue-50',
            borderColor: 'border-blue-200',
            textColor: 'text-blue-800',
            activeBg: 'bg-blue-100 border-blue-500',
        },
        {
            type: 'CH_TAHSILAT' as const,
            label: tm('collection'),
            icon: CreditCard,
            bgColor: 'bg-purple-50',
            borderColor: 'border-purple-200',
            textColor: 'text-purple-800',
            activeBg: 'bg-purple-100 border-purple-500',
        },
    ], [tm]);

    const filteredIslemler = useMemo(() => {
        if (!selectedTur) return islemler;
        return islemler.filter(islem => islem.islem_tipi === selectedTur);
    }, [islemler, selectedTur]);

    const columnHelper = createColumnHelper<BankaIslemi>();
    const columns = [
        columnHelper.accessor('islem_tarihi', {
            header: tm('date'),
            cell: info => info.getValue() ? new Date(info.getValue()).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US') : '-',
            size: 100,
        }),
        columnHelper.accessor('islem_no', {
            header: tm('transactionNo'),
            size: 120,
        }),
        columnHelper.accessor('islem_tipi', {
            header: tm('transactionType'),
            size: 100,
        }),
        columnHelper.accessor('tutar', {
            header: t.amount,
            cell: info => (
                <span className="font-bold">
                    {formatCurrency(info.getValue())} {banka.id_doviz_kodu}
                </span>
            ),
            size: 120,
        }),
        columnHelper.accessor('islem_aciklamasi', {
            header: t.description,
            size: 200,
        }),
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header - Flat Blue */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Landmark className="w-6 h-6" />
                        <div>
                            <h3 className="text-lg font-semibold leading-none">{tm('bankMovements')}</h3>
                            <p className="text-xs text-blue-100 mt-1 uppercase tracking-wider font-bold">
                                {banka.banka_kodu} / {banka.banka_adi} - {banka.iban}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Split Pane */}
                <div className="flex-1 flex overflow-hidden min-h-0 bg-gray-50 dark:bg-gray-900">
                    {/* Left Side - List */}
                    <div className="flex-1 flex flex-col border-r dark:border-gray-700 min-h-0">
                        <div className="p-4 border-b bg-white dark:bg-gray-800 flex items-center justify-between">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm tracking-wide">
                                {selectedTur ? islemTurleri.find(t => t.type === selectedTur)?.label : tm('allMovements')}
                            </h4>
                            <div className="flex items-center gap-2">
                                {selectedTur && (
                                    <button
                                        onClick={() => setSelectedTur(null)}
                                        className="text-xs text-blue-600 font-bold hover:underline"
                                    >
                                        {tm('removeFilter')}
                                    </button>
                                )}
                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                                    {filteredIslemler.length} {tm('recordsCounter')}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-4 min-h-0 text-xs">
                            {loading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : filteredIslemler.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-400">
                                    <div className="text-center">
                                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="text-sm font-medium">{tm('noTransactionsFound')}</p>
                                    </div>
                                </div>
                            ) : (
                                <DevExDataGrid
                                    data={filteredIslemler}
                                    columns={columns}
                                    enableSorting
                                    enableFiltering
                                    enablePagination
                                    pageSize={20}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right Side - Quick Actions / Categories */}
                    <div className="w-80 flex flex-col bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
                        <div className="p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm tracking-wide">{tm('makeNewTransaction')}</h4>
                        </div>
                        <div className="p-4 space-y-2 border-b dark:border-gray-700">
                            <button
                                onClick={() => { setNewIslemType('BANKA_GIRIS'); setShowNewIslemModal(true); }}
                                className="w-full flex items-center gap-3 p-3 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-xs transition-all active:scale-95"
                            >
                                <Plus className="w-4 h-4" />
                                {tm('bankEntry').toUpperCase()}
                            </button>
                            <button
                                onClick={() => { setNewIslemType('BANKA_CIKIS'); setShowNewIslemModal(true); }}
                                className="w-full flex items-center gap-3 p-3 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs transition-all active:scale-95"
                            >
                                <Minus className="w-4 h-4" />
                                {tm('bankExit').toUpperCase()}
                            </button>
                        </div>

                        <div className="p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm tracking-wide">{tm('filter')}</h4>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-medium">
                            {islemTurleri.map((islem) => {
                                const Icon = islem.icon;
                                const isActive = selectedTur === islem.type;
                                const count = islemler.filter(i => i.islem_tipi === islem.type).length;

                                return (
                                    <button
                                        key={islem.type}
                                        onClick={() => setSelectedTur(isActive ? null : islem.type)}
                                        className={`w-full text-left p-3 border transition-all ${isActive
                                            ? `${islem.activeBg} shadow-sm`
                                            : `${islem.bgColor} dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-400`
                                            } rounded flex items-center gap-3`}
                                    >
                                        <div className={`p-1.5 rounded ${isActive ? 'bg-white shadow-sm' : 'bg-white/50 dark:bg-gray-700'}`}>
                                            <Icon className={`w-4 h-4 ${islem.textColor}`} />
                                        </div>
                                        <div className="flex-1">
                                            <div className={`text-xs ${isActive ? 'font-bold text-gray-900' : 'text-gray-700 dark:text-gray-300'}`}>{islem.label}</div>
                                            <div className="text-[9px] opacity-40 uppercase font-black">{count} {tm('transactions').toUpperCase()}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    >
                        {t.close}
                    </button>
                </div>
            </div>

            {showNewIslemModal && (
                <BankaIslemModal
                    banka={banka}
                    islemTipi={newIslemType}
                    onClose={() => setShowNewIslemModal(false)}
                    onSuccess={() => {
                        setShowNewIslemModal(false);
                        onIslemClick?.(); // Trigger refresh in parent
                    }}
                />
            )}
        </div>
    );
}
