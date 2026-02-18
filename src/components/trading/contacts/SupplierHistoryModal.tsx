import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Package, TrendingUp, Filter, Plus, AlertTriangle, CheckSquare, Square, Flame, Banknote, Clock, LayoutGrid } from 'lucide-react';

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

export function SupplierHistoryModal({ isOpen, onClose, supplierName, onAddItems }: SupplierHistoryModalProps) {
    const [selectedItems, setSelectedItems] = useState<number[]>([]);
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    if (!isOpen) return null;

    // Expanded Mock Data
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
        let items = [...historyItems];

        switch (activeFilter) {
            case 'most_purchased':
                return items.sort((a, b) => b.quantity - a.quantity);
            case 'high_value':
                return items.sort((a, b) => b.total - a.total);
            case 'low_stock':
                return items.filter(item => item.stockStatus === 'low');
            case 'recent':
                // Simple check for year 2026 or late 2025 for demo
                return items.filter(item => {
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
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === filteredItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(filteredItems.map(i => i.id));
        }
    };

    const handleAddSelected = () => {
        // Find original items to ensure we have correct data regardless of sort
        const itemsToAdd = historyItems.filter(item => selectedItems.includes(item.id));
        onAddItems(itemsToAdd);
        onClose();
        setSelectedItems([]);
    };

    const FilterBadge = ({ type, label, icon: Icon, colorClass }: { type: FilterType, label: string, icon: any, colorClass: string }) => (
        <button
            onClick={() => setActiveFilter(type === activeFilter ? 'all' : type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${activeFilter === type
                ? `bg-${colorClass}-50 text-${colorClass}-700 border-${colorClass}-200 shadow-sm ring-1 ring-${colorClass}-200`
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
        >
            <Icon className={`w-3.5 h-3.5 ${activeFilter === type ? `text-${colorClass}-600` : 'text-gray-400'}`} />
            {label}
        </button>
    );

    return createPortal(
        <div className="fixed inset-0 z-[10001] flex flex-col bg-white">
            <div className="flex-1 flex flex-col overflow-hidden w-full h-full">
                {/* Header */}
                <div className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white flex-shrink-0 shadow-md z-20">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-1.5 rounded-lg">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wide">Tedarikçi Geçmişi</h3>
                            <div className="text-[11px] text-blue-100 opacity-90">{supplierName || 'Seçilen Tedarikçi'}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedItems.length > 0 && (
                            <button
                                onClick={handleAddSelected}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-bold transition-colors shadow-sm animate-in fade-in mr-2"
                            >
                                <Plus className="w-4 h-4" />
                                {selectedItems.length} Seçileni Ekle
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm z-10">
                    <FilterBadge type="all" label="Tümü" icon={LayoutGrid} colorClass="blue" />
                    <div className="w-px h-5 bg-gray-300 mx-1"></div>
                    <FilterBadge type="most_purchased" label="Sık Alınanlar" icon={Flame} colorClass="orange" />
                    <FilterBadge type="high_value" label="Yüksek Tutar" icon={Banknote} colorClass="purple" />
                    <FilterBadge type="recent" label="Son Alımlar" icon={Clock} colorClass="green" />
                    <div className="w-px h-5 bg-gray-300 mx-1"></div>
                    <FilterBadge type="low_stock" label="Stoğu Azalanlar" icon={AlertTriangle} colorClass="red" />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-gray-50/50 p-4">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-700 text-[11px] font-bold uppercase sticky top-0 z-10 shadow-sm border-b border-gray-200">
                                <tr>
                                    <th className="py-3 px-4 w-10 text-center bg-gray-50">
                                        <button onClick={toggleSelectAll} className="flex items-center justify-center text-gray-500 hover:text-blue-600 focus:outline-none">
                                            {selectedItems.length > 0 && selectedItems.length === filteredItems.length ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                                        </button>
                                    </th>
                                    <th className="py-3 px-4 w-32 bg-gray-50">Tarih</th>
                                    <th className="py-3 px-4 bg-gray-50">Ürün / Hizmet</th>
                                    <th className="py-3 px-4 text-right w-24 bg-gray-50">Miktar</th>
                                    <th className="py-3 px-4 text-right w-32 bg-gray-50">Birim Fiyat</th>
                                    <th className="py-3 px-4 text-right w-36 bg-gray-50">Toplam</th>
                                    <th className="py-3 px-4 text-center w-32 bg-gray-50">Durum</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs bg-white">
                                {filteredItems.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedItems.includes(item.id) ? 'bg-blue-50/60' : ''}`}
                                        onClick={() => toggleSelection(item.id)}
                                    >
                                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => toggleSelection(item.id)} className="flex items-center justify-center focus:outline-none">
                                                {selectedItems.includes(item.id)
                                                    ? <CheckSquare className="w-4 h-4 text-blue-600" />
                                                    : <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                                                }
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 font-mono flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            {item.date}
                                        </td>
                                        <td className="py-3 px-4 font-medium text-gray-800">
                                            <div className="flex items-center gap-2">
                                                <Package className="w-4 h-4 text-blue-400" />
                                                {item.product}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-600 font-bold">
                                            {item.quantity} <span className="text-[10px] font-normal text-gray-400 ml-0.5">{item.unit}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-gray-700">
                                            {item.price.toFixed(2)} ₺
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                                            {item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {item.stockStatus === 'low' && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Kritik
                                                </span>
                                            )}
                                            {item.stockStatus === 'normal' && (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium text-gray-400 bg-gray-100">
                                                    Normal
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

