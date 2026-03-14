import React, { useState, useEffect } from 'react';
import {
    X, Package, TrendingUp, Edit3, Barcode, History,
    ShoppingCart, Info, ArrowRightLeft, Printer, Trash2,
    ChevronRight, Box, Tag, Layers, Settings, FileText,
    AlertCircle, DollarSign, Warehouse, Clock, Search, RefreshCw, Download, Upload, Plus, Edit,
    MapPin, Building2, Calendar, Filter
} from 'lucide-react';
import { Product, ProductVariant } from '../../../core/types';
import { productAPI } from '../../../services/api/products';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { ProductFormPage } from './ProductFormPage';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';

interface ProductOperationHubProps {
    product: Product;
    onClose: () => void;
    onSave: (product: Product) => void;
    initialTab?: HubTab;
    darkMode?: boolean;
}

export type HubTab = 'overview' | 'edit' | 'movements' | 'inventory' | 'labels' | 'history';

export function ProductOperationHub({ product, onClose, onSave, initialTab = 'overview', darkMode = false }: ProductOperationHubProps) {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
    const [movements, setMovements] = useState<any[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(false);
    const [rateHistory, setRateHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    
    // Filter states
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');

    // Load movements when overview or movements tab is active
    useEffect(() => {
        if (activeTab === 'movements' || activeTab === 'overview') {
            loadMovements();
        }
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab, product.id]);

    const loadHistory = async () => {
        try {
            setLoadingHistory(true);
            const data = await productAPI.getExchangeRateHistory(product.id);
            setRateHistory(data);
        } catch (error) {
            console.error('Failed to load rate history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const loadMovements = async () => {
        try {
            setLoadingMovements(true);
            const data = await stockMovementAPI.getProductMovements(product.id);
            setMovements(data);
        } catch (error) {
            console.error('Failed to load movements:', error);
            toast.error('Hareketler yüklenemedi');
        } finally {
            setLoadingMovements(false);
        }
    };

    const tabs = [
        { id: 'overview', label: 'Genel Bakış', icon: Info },
        { id: 'edit', label: 'Kartı Düzenle', icon: Edit3 },
        { id: 'movements', label: 'Hareketler', icon: TrendingUp },
        { id: 'inventory', label: 'Envanter', icon: Warehouse },
        { id: 'labels', label: 'Barkod', icon: Barcode },
        { id: 'history', label: 'Geçmiş', icon: History },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                                        <Box className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mevcut Stok</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.stock || 0}</span>
                                    <span className="text-[10px] text-gray-400 font-medium">{product.unit || 'Adet'}</span>
                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-green-100 text-green-600 rounded-md">
                                        <DollarSign className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Satış Fiyatı</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.price ? product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '0,00'}</span>

                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-md">
                                        <ArrowRightLeft className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Maliyet</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.cost ? product.cost.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '0,00'}</span>

                                </div>
                            </div>

                            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border p-3 rounded-lg shadow-sm`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md">
                                        <Tag className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Barkod</span>
                                </div>
                                <div className="truncate">
                                    <span className={`text-sm font-mono font-bold ${darkMode ? 'text-white' : 'text-gray-900'} `}>{product.barcode || '---'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Main Content Grid: Product Info, Recent Movements, Branch Stocks */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Left Column: Product Details + Recent Movements */}
                            <div className="space-y-4">
                                {/* Product Details */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase">Ürün Bilgileri</h3>
                                        <button onClick={() => setActiveTab('edit')} className="text-blue-600 text-[10px] font-bold hover:underline">DÜZENLE</button>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-6">
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Ürün Adı</span>
                                            <span className="text-sm font-medium">{product.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Stok Kodu</span>
                                            <span className="text-sm font-mono font-medium">{product.code}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Kategori</span>
                                            <span className="text-sm font-medium">{product.category || '---'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Marka</span>
                                            <span className="text-sm font-medium">{product.brand || '---'}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">TAX Oranı</span>
                                            <span className="text-sm font-medium">%{product.taxRate || 0}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Birim</span>
                                            <span className="text-sm font-medium">{product.unit || 'ADET'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent Movements */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-xs font-bold text-gray-700 uppercase">Son Hareketler</h3>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('movements')}
                                            className="text-blue-600 text-[10px] font-bold hover:underline"
                                        >
                                            TÜMÜ
                                        </button>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                        {loadingMovements ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : movements.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400">
                                                <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                <p className="text-xs">Henüz hareket yok</p>
                                            </div>
                                        ) : (
                                            movements.slice(0, 5).map((item) => (
                                                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-bold ${item.movement?.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                                                                }`}>
                                                                {item.movement?.movement_type === 'in' ? 'Giriş' : 'Çıkış'}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">
                                                                {new Date(item.movement?.movement_date || item.created_at).toLocaleDateString('tr-TR')}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-600 truncate">{item.movement?.document_no || 'Manuel'}</p>
                                                    </div>
                                                    <span className={`text-sm font-bold ${item.movement?.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                        {item.movement?.movement_type === 'in' ? '+' : '-'}{item.quantity}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Product Image + Branch Stocks */}
                            <div className="space-y-4">
                                {/* Product Image */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase">Ürün Görseli</h3>
                                    </div>
                                    <div className="p-4 flex items-center justify-center min-h-[160px] bg-gray-50">
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                className="max-h-40 max-w-full object-contain rounded shadow-sm"
                                                onError={(e) => {
                                                    // Fallback if image fails to load
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.parentElement!.innerHTML = '<div class="flex flex-col items-center text-gray-300"><svg class="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg><span class="text-[10px] font-bold">GÖRSEL YOK</span></div>';
                                                }}
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center text-gray-300">
                                                <Package className="w-12 h-12 mb-1" />
                                                <span className="text-[10px] font-bold">GÖRSEL YOK</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Branch Stock Status */}
                                <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border rounded-lg overflow-hidden`}>
                                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-xs font-bold text-gray-700 uppercase">Şube Stok Durumu</h3>
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                        {/* Main Warehouse Stock */}
                                        <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                            <div className="flex-1">
                                                <p className="text-xs font-medium text-gray-700">Ana Depo</p>
                                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                                                    <span>Toplam: {product.stock || 0}</span>
                                                    <span>Rezerve: 0</span>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-bold ${(product.stock || 0) > 0 ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {product.stock || 0} adet
                                            </span>
                                        </div>

                                        {/* Info message for multi-warehouse */}
                                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <div className="flex items-start gap-2">
                                                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-medium text-blue-900">Çoklu Depo Özelliği</p>
                                                    <p className="text-[10px] text-blue-700 mt-1">
                                                        Birden fazla depo tanımlandığında, tüm depoların stok durumu burada görünecektir.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'edit':
                return (
                    <div className="h-full relative overflow-hidden">
                        <ProductFormPage
                            productId={product.id}
                            onSave={onSave}
                            onClose={() => setActiveTab('overview')}
                        />
                    </div>
                );
            case 'movements':
                return (
                    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
                        <div className="px-4 py-2 border-b flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600" />
                                    Stok Hareketleri
                                </h2>
                                
                                {/* Filters */}
                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                    <Calendar className="w-3 h-3 text-gray-400" />
                                    <input 
                                        type="date" 
                                        value={filterStartDate}
                                        onChange={(e) => setFilterStartDate(e.target.value)}
                                        className="text-[10px] font-bold outline-none border-none p-0 w-24"
                                    />
                                    <span className="text-gray-300">-</span>
                                    <input 
                                        type="date" 
                                        value={filterEndDate}
                                        onChange={(e) => setFilterEndDate(e.target.value)}
                                        className="text-[10px] font-bold outline-none border-none p-0 w-24"
                                    />
                                </div>

                                <select 
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value as any)}
                                    className="text-[10px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none"
                                >
                                    <option value="all">TÜMÜ</option>
                                    <option value="in">GİRİŞ ( + )</option>
                                    <option value="out">ÇIKIŞ ( - )</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                {(filterStartDate || filterEndDate || filterType !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setFilterStartDate('');
                                            setFilterEndDate('');
                                            setFilterType('all');
                                        }}
                                        className="text-[10px] font-bold text-red-600 hover:text-red-700 underline"
                                    >
                                        FİLTRELERİ TEMİZLE
                                    </button>
                                )}
                                <button
                                    onClick={loadMovements}
                                    className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                                    title="Yenile"
                                >
                                    <ArrowRightLeft className={`w-3 h-3 ${loadingMovements ? 'animate-spin' : ''} `} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto">
                            {loadingMovements ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-2">
                                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[10px] font-bold text-gray-400">YÜKLENİYOR...</p>
                                </div>
                            ) : movements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 text-center">
                                    <Layers className="w-10 h-10 mb-2 opacity-20" />
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider">Hareket Bulunamadı</h3>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-gray-100 border-b border-gray-200 z-10">
                                            <tr>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter">Tarih</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter">İşlem / Belge No</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter">Tip</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter">Depo</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter">Döviz / Kur</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter text-right">Kar (Brt)</th>
                                                <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-tighter text-right">Miktar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {movements
                                                .filter(item => {
                                                    const m = item.movement;
                                                    const date = new Date(m?.movement_date || item.created_at);
                                                    
                                                    // Type filter
                                                    if (filterType !== 'all' && m?.movement_type !== filterType) return false;
                                                    
                                                    // Date filter
                                                    if (filterStartDate) {
                                                        const start = new Date(filterStartDate);
                                                        start.setHours(0, 0, 0, 0);
                                                        if (date < start) return false;
                                                    }
                                                    if (filterEndDate) {
                                                        const end = new Date(filterEndDate);
                                                        end.setHours(23, 59, 59, 999);
                                                        if (date > end) return false;
                                                    }
                                                    
                                                    return true;
                                                })
                                                .map((item) => (
                                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                                                        <span className="font-medium">{new Date(item.movement?.movement_date || item.created_at).toLocaleDateString('tr-TR')}</span>
                                                        <span className="block text-[9px] opacity-60">
                                                            {new Date(item.movement?.movement_date || item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className="font-bold text-gray-800 block text-[11px]">{item.movement?.document_no || 'MANUEL'}</span>
                                                        <span className="text-[9px] text-gray-400 truncate max-w-[120px] block">{item.notes || '---'}</span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${item.movement?.movement_type === 'in'
                                                            ? 'bg-green-100 text-green-700'
                                                            : item.movement?.movement_type === 'out'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                            } `}>
                                                            {item.movement?.movement_type === 'in' ? 'Giriş' : item.movement?.movement_type === 'out' ? 'Çıkış' : 'Düzeltme'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-600 text-[11px]">
                                                        {item.movement?.warehouses?.name || 'Ana Depo'}
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-600 text-[11px] font-mono">
                                                        {item.currency || 'IQD'} / {item.currency_rate?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <span className={`text-[11px] font-bold ${item.gross_profit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                                            {item.gross_profit > 0 ? item.gross_profit.toLocaleString('tr-TR') : '---'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <span className={`text-[11px] font-bold ${item.movement?.movement_type === 'in' ? 'text-green-600' : 'text-red-600'
                                                            } `}>
                                                            {item.movement?.movement_type === 'in' ? '+' : '-'}{item.quantity}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'history':
                return (
                    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
                        <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-50/50">
                            <h2 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-2">
                                <History className="w-4 h-4 text-blue-600" />
                                Değişim Geçmişi (Kur)
                            </h2>
                            <button
                                onClick={loadHistory}
                                className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                                title="Yenile"
                            >
                                <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''} `} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {loadingHistory ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-2">
                                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-[10px] font-bold text-gray-400">YÜKLENİYOR...</p>
                                </div>
                            ) : rateHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 text-center">
                                    <Clock className="w-10 h-10 mb-2 opacity-20" />
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider">Geçmiş Bulunamadı</h3>
                                    <p className="text-[10px] mt-1">Özel kur değişikliği yapıldığında burada listelenecektir.</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-2xl mx-auto">
                                    {rateHistory.map((item, idx) => (
                                        <div key={item.id} className="relative pl-8 pb-4">
                                            {/* Timeline Line */}
                                            {idx !== rateHistory.length - 1 && (
                                                <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-100"></div>
                                            )}
                                            
                                            {/* Timeline Dot */}
                                            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center z-10">
                                                <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                                            </div>

                                            <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-3 hover:border-blue-200 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-blue-600 uppercase">KUR GÜNCELLEMESİ</span>
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(item.change_date).toLocaleString('tr-TR')}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1">
                                                        <span className="text-[9px] text-gray-400 block uppercase font-bold">Eski Kur</span>
                                                        <span className="text-sm font-mono font-bold text-gray-500 line-through">
                                                            {parseFloat(item.old_rate || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    
                                                    <ArrowRightLeft className="w-4 h-4 text-gray-300" />

                                                    <div className="flex-1">
                                                        <span className="text-[9px] text-gray-400 block uppercase font-bold">Yeni Kur</span>
                                                        <span className="text-sm font-mono font-bold text-green-600">
                                                            {parseFloat(item.new_rate || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                                                        <Info className="w-2 h-2 text-gray-500" />
                                                    </div>
                                                    <span className="text-[10px] text-gray-500 font-medium">
                                                        Düzenleyen: <span className="font-bold text-gray-700">{item.changed_by || 'Sistem'}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-gray-300 animate-pulse">
                        <Settings className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Yakında Eklenecek</p>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-gray-900/50 backdrop-blur-lg"
                onClick={onClose}
            />

            {/* Modal Container - Full Width Content Only */}
            <div className={`relative w-full max-w-6xl h-[85vh] bg-white/95 backdrop-blur-lg rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 select-none`}>
                {/* Header with Product Info */}
                <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                            <Package className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="font-bold text-lg truncate" title={product.name}>{product.name}</h2>
                            <div className="flex items-center gap-3 text-blue-100">
                                <p className="text-xs font-mono font-bold">{product.code}</p>
                                <span className="text-xs">•</span>
                                <p className="text-xs font-bold">{tabs.find(t => t.id === activeTab)?.label}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        title="Kapat"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-gray-50/30">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

