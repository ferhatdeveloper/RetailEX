import React, { useState } from 'react';
import { X, Calendar, Package, TrendingUp, Filter, Plus, AlertTriangle, CheckSquare, Square, Flame, Banknote, Clock, LayoutGrid } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';

interface HistoryItem {
    id: number;
    date: string;
    product: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
    stockStatus: 'normal' | 'low';
}

interface SupplierHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplierName: string;
    onAddItems: (items: any[]) => void;
}

type FilterType = 'all' | 'most_purchased' | 'high_value' | 'recent' | 'low_stock';

const FILTER_DEFS: Array<{
    type: FilterType;
    i18nKey: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
}> = [
    { type: 'all', i18nKey: 'supplierHistoryFilterAll', icon: LayoutGrid, colorClass: 'blue' },
    { type: 'most_purchased', i18nKey: 'supplierHistoryFilterMost', icon: Flame, colorClass: 'orange' },
    { type: 'high_value', i18nKey: 'supplierHistoryFilterHighValue', icon: Banknote, colorClass: 'purple' },
    { type: 'recent', i18nKey: 'supplierHistoryFilterRecent', icon: Clock, colorClass: 'green' },
    { type: 'low_stock', i18nKey: 'supplierHistoryFilterLowStock', icon: AlertTriangle, colorClass: 'red' },
];

export function SupplierHistoryModal({ isOpen, onClose, supplierName, onAddItems }: SupplierHistoryModalProps) {
    const { tm } = useLanguage();
    const [selectedItems, setSelectedItems] = useState<number[]>([]);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    if (!isOpen) return null;

    const historyItems: HistoryItem[] = [
        { id: 1, date: '01.01.2026', product: 'Malzeme - A Kalite', quantity: 150, unit: 'Adet', price: 125.00, total: 18750.00, stockStatus: 'normal' },
        { id: 2, date: '15.12.2025', product: 'Malzeme - B Standart', quantity: 50, unit: 'Koli', price: 450.00, total: 22500.00, stockStatus: 'low' },
        { id: 3, date: '20.11.2025', product: 'Hizmet - Nakliye', quantity: 1, unit: 'Sefer', price: 1500.00, total: 1500.00, stockStatus: 'normal' },
        { id: 4, date: '05.11.2025', product: 'Malzeme - C Yedek', quantity: 10, unit: 'Adet', price: 85.50, total: 855.00, stockStatus: 'low' },
        { id: 5, date: '10.10.2025', product: 'Malzeme - A Kalite', quantity: 200, unit: 'Adet', price: 120.00, total: 24000.00, stockStatus: 'normal' },
        { id: 6, date: '01.09.2025', product: 'Özel Ekipman', quantity: 2, unit: 'Adet', price: 15000.00, total: 30000.00, stockStatus: 'normal' },
        { id: 7, date: '02.01.2026', product: 'Sarf Malzeme X', quantity: 500, unit: 'Kutu', price: 15.00, total: 7500.00, stockStatus: 'low' },
        { id: 8, date: '28.12.2025', product: 'Yedek Parça Z', quantity: 5, unit: 'Adet', price: 2500.00, total: 12500.00, stockStatus: 'normal' },
    ];

    const getFilteredItems = () => {
        const items = [...historyItems];

        switch (activeFilter) {
            case 'most_purchased':
                return items.sort((a, b) => b.quantity - a.quantity);
            case 'high_value':
                return items.sort((a, b) => b.total - a.total);
            case 'low_stock':
                return items.filter((item) => item.stockStatus === 'low');
            case 'recent':
                return items.filter((item) => {
                    const parts = item.date.split('.');
                    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                    return d > new Date('2025-12-01');
                });
            default:
                return items;
        }
    };

    const filteredItems = getFilteredItems();

    const toggleSelection = (id: number) => {
        setSelectedItems((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === filteredItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(filteredItems.map((i) => i.id));
        }
    };

    const handleAddSelected = () => {
        const itemsToAdd = historyItems.filter((item) => selectedItems.includes(item.id));
        onAddItems(itemsToAdd);
        onClose();
        setSelectedItems([]);
    };

    const FilterBadge = ({
        type,
        i18nKey,
        icon: Icon,
        colorClass,
    }: {
        type: FilterType;
        i18nKey: string;
        icon: React.ComponentType<{ className?: string }>;
        colorClass: string;
    }) => (
        <button
            onClick={() => setActiveFilter(type === activeFilter ? 'all' : type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                activeFilter === type
                    ? `bg-${colorClass}-50 text-${colorClass}-700 border-${colorClass}-200 shadow-sm ring-1 ring-${colorClass}-200`
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
        >
            <Icon
                className={`w-3.5 h-3.5 ${activeFilter === type ? `text-${colorClass}-600` : 'text-gray-400'}`}
            />
            {tm(i18nKey)}
        </button>
    );

    return (
        <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('supplierHistoryTitle')}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold uppercase tracking-wide">
                                {tm('supplierHistoryTitle')}
                            </h3>
                            <div className="text-xs text-blue-100 opacity-90 mt-0.5">
                                {supplierName || tm('supplierHistoryNone')}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors"
                        aria-label="close"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
                {FILTER_DEFS.map((def, idx) => (
                    <React.Fragment key={def.type}>
                        <FilterBadge
                            type={def.type}
                            i18nKey={def.i18nKey}
                            icon={def.icon}
                            colorClass={def.colorClass}
                        />
                        {(def.type === 'all' || def.type === 'recent') && idx < FILTER_DEFS.length - 1 && (
                            <div className="w-px h-5 bg-slate-300 mx-1" />
                        )}
                    </React.Fragment>
                ))}
            </div>

            <PercentBodyModalScrollBody className="bg-slate-50/50 p-6">
                {isOpen && historyItems.length > 0 && (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 w-10 text-center bg-slate-50">
                                        <button
                                            onClick={toggleSelectAll}
                                            className="flex items-center justify-center text-slate-500 hover:text-blue-600 focus:outline-none"
                                            aria-label="select-all"
                                        >
                                            {selectedItems.length > 0 && selectedItems.length === filteredItems.length ? (
                                                <CheckSquare className="w-4 h-4 text-blue-600" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="py-3 px-4 w-32 bg-slate-50">{tm('colDate')}</th>
                                    <th className="py-3 px-4 bg-slate-50">{tm('rprColProduct')}</th>
                                    <th className="py-3 px-4 text-right w-24 bg-slate-50">{tm('rprColQuantity')}</th>
                                    <th className="py-3 px-4 text-right w-32 bg-slate-50">{tm('rprColUnitPrice')}</th>
                                    <th className="py-3 px-4 text-right w-36 bg-slate-50">{tm('rprColInvoiceTotal')}</th>
                                    <th className="py-3 px-4 text-center w-32 bg-slate-50">{tm('colStatus')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs bg-white">
                                {filteredItems.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedItems.includes(item.id) ? 'bg-blue-50/60' : ''}`}
                                        onClick={() => toggleSelection(item.id)}
                                    >
                                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => toggleSelection(item.id)}
                                                className="flex items-center justify-center focus:outline-none"
                                                aria-label="select-row"
                                            >
                                                {selectedItems.includes(item.id) ? (
                                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-slate-600 font-mono flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            {item.date}
                                        </td>
                                        <td className="py-3 px-4 font-medium text-slate-800">
                                            <div className="flex items-center gap-2">
                                                <Package className="w-4 h-4 text-blue-400" />
                                                {item.product}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-600 font-bold">
                                            {formatNumber(item.quantity, 2, false)}{' '}
                                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                                                {item.unit}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                                            {formatNumber(item.price, 2, false)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                                            {formatNumber(item.total, 2, false)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {item.stockStatus === 'low' && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    {tm('stockStatusLow')}
                                                </span>
                                            )}
                                            {item.stockStatus === 'normal' && (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium text-slate-400 bg-slate-100">
                                                    {tm('stockStatusNormal')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PercentBodyModalScrollBody>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
                <button
                    onClick={onClose}
                    className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] py-3 transition-all"
                >
                    {tm('cancel')}
                </button>
                <button
                    onClick={handleAddSelected}
                    disabled={selectedItems.length === 0}
                    className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] py-3 transition-all flex items-center justify-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {tm('historyAddSelectedCount').replace('{n}', String(selectedItems.length))}
                </button>
            </div>
        </PercentBodyModal>
    );
}
