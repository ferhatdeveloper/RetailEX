import React, { useState, useEffect } from 'react';
import { X, Search, RefreshCw, Package, Users, Percent } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useProductStore, useCustomerStore, useCampaignStore } from '../../store';
import { formatNumber } from '../../utils/formatNumber';

interface BroadcastDataSelectorProps {
    type: 'product' | 'customer' | 'campaign';
    isOpen: boolean;
    onClose: () => void;
    onSelect: (data: any) => void;
    theme: string;
}

export function BroadcastDataSelector({ type, isOpen, onClose, onSelect, theme }: BroadcastDataSelectorProps) {
    const [searchQuery, setSearchQuery] = useState('');

    // Product Store
    const products = useProductStore((state) => state.products);
    const loadProducts = useProductStore((state) => state.loadProducts);
    const productsLoading = useProductStore((state) => state.isLoading);

    // Customer Store
    const customers = useCustomerStore((state) => state.customers);
    const loadCustomers = useCustomerStore((state) => state.fetchCustomers);
    const customersLoading = useCustomerStore((state) => state.loading);

    // Campaign Store
    const campaigns = useCampaignStore((state) => state.campaigns);
    const loadCampaigns = useCampaignStore((state) => state.fetchCampaigns);
    const campaignsLoading = useCampaignStore((state) => state.loading);

    useEffect(() => {
        if (isOpen) {
            if (type === 'product' && products.length === 0) loadProducts();
            if (type === 'customer' && customers.length === 0) loadCustomers();
            if (type === 'campaign' && campaigns.length === 0) loadCampaigns();
        }
    }, [isOpen, type]);

    if (!isOpen) return null;

    const handleRefresh = () => {
        if (type === 'product') loadProducts();
        if (type === 'customer') loadCustomers();
        if (type === 'campaign') loadCampaigns();
    };

    const getFilteredData = () => {
        const query = searchQuery.toLowerCase();

        if (type === 'product') {
            return products.filter(p =>
                p.name.toLowerCase().includes(query) ||
                p.barcode.toLowerCase().includes(query) ||
                p.category.toLowerCase().includes(query)
            );
        }

        if (type === 'customer') {
            return customers.filter(c =>
                c.name.toLowerCase().includes(query) ||
                (c.phone && c.phone.includes(query)) ||
                (c.email && c.email.toLowerCase().includes(query))
            );
        }

        if (type === 'campaign') {
            return campaigns.filter(c =>
                c.name.toLowerCase().includes(query) ||
                c.code?.toLowerCase().includes(query)
            );
        }

        return [];
    };

    const filteredData = getFilteredData();
    const isLoading = type === 'product' ? productsLoading : type === 'customer' ? customersLoading : campaignsLoading;

    const bgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
    const textClass = theme === 'dark' ? 'text-gray-100' : 'text-gray-900';
    const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
    const hoverClass = theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`${bgClass} ${textClass} w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col`}>
                {/* Header */}
                <div className={`p-4 border-b ${borderClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${type === 'product' ? 'bg-blue-100 text-blue-600' :
                                type === 'customer' ? 'bg-green-100 text-green-600' :
                                    'bg-purple-100 text-purple-600'
                            }`}>
                            {type === 'product' && <Package className="w-5 h-5" />}
                            {type === 'customer' && <Users className="w-5 h-5" />}
                            {type === 'campaign' && <Percent className="w-5 h-5" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">
                                {type === 'product' ? 'Ürün Seç' :
                                    type === 'customer' ? 'Müşteri Seç' :
                                        'Kampanya Seç'}
                            </h3>
                            <p className="text-xs opacity-70">
                                Lütfen listeden bir kayıt seçin
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Search & Toolbar */}
                <div className={`p-4 border-b ${borderClass} flex gap-4`}>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Ara..."
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={handleRefresh}>
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 opacity-50">
                            <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                            <p>Yükleniyor...</p>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 opacity-50">
                            <p>Kayıt bulunamadı</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {filteredData.map((item: any) => (
                                <div
                                    key={item.id}
                                    onClick={() => onSelect(item)}
                                    className={`p-3 rounded-lg border ${borderClass} ${hoverClass} cursor-pointer transition-all active:scale-[0.98] group`}
                                >
                                    {type === 'product' && (
                                        <div className="flex gap-3">
                                            <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
                                                <Package className="w-5 h-5 text-gray-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="text-xs opacity-60 flex justify-between mt-1">
                                                    <span>{item.barcode}</span>
                                                    <span className="font-mono">{formatNumber(item.price, 2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {type === 'customer' && (
                                        <div className="flex gap-3">
                                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                <div className="font-bold text-gray-500">{item.name.substring(0, 2).toUpperCase()}</div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="text-xs opacity-60 mt-1">
                                                    {item.phone || item.email || 'İletişim yok'}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {type === 'campaign' && (
                                        <div className="flex gap-3">
                                            <div className="w-10 h-10 bg-purple-50 rounded-md flex items-center justify-center flex-shrink-0">
                                                <Percent className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="text-xs opacity-60 flex justify-between mt-1">
                                                    <span className="bg-purple-100 text-purple-700 px-1.5 rounded text-[10px]">
                                                        {item.status === 'active' ? 'Aktif' : 'Pasif'}
                                                    </span>
                                                    <span>{new Date(item.startDate).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={`p-3 border-t ${borderClass} text-xs opacity-50 text-center`}>
                    {filteredData.length} kayıt gösteriliyor
                </div>
            </div>
        </div>
    );
}

