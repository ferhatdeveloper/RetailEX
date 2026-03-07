import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Search, ClipboardList, Package, Calculator } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { stockCountAPI, StockCount, StockCountItem } from '../../../services/stockCountAPI';
import { postgres, ERP_SETTINGS } from '../../../services/postgres';
import { toast } from 'sonner';

interface StockCountFormProps {
    onClose: () => void;
    onSave: () => void;
}

interface Warehouse {
    id: string;
    name: string;
}

interface Product {
    id: string;
    code: string;
    name: string;
    unit: string;
    quantity?: number; // Current stock
}

export function StockCountForm({ onClose, onSave }: StockCountFormProps) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // Form States
    const [ficheNo, setFicheNo] = useState(`SYM${Date.now().toString().slice(-6)}`);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<any[]>([]);

    // Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [showProductSearch, setShowProductSearch] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            // Load Warehouses
            const { rows: whRows } = await postgres.query('SELECT id, name FROM stores ORDER BY name');
            setWarehouses(whRows);
            if (whRows.length > 0) setSelectedWarehouse(whRows[0].id);

            // Load Products for search
            const { rows: pRows } = await postgres.query(`SELECT id, code, name, unit FROM rex_${ERP_SETTINGS.firmNr}_products ORDER BY name LIMIT 500`);
            setProducts(pRows);
        } catch (error) {
            console.error('Error loading form data:', error);
            toast.error('Veriler yüklenirken hata oluştu');
        }
    };

    const handleAddItem = (product: Product) => {
        if (items.some(item => item.product_id === product.id)) {
            toast.error('Bu ürün zaten listede');
            return;
        }

        const newItem = {
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            unit: product.unit,
            expected_quantity: 0, // In real app, we'd fetch current stock for this WH
            counted_quantity: 0,
            notes: ''
        };

        setItems([...items, newItem]);
        setShowProductSearch(false);
        setSearchQuery('');
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (items.length === 0) {
            toast.error('En az bir ürün eklemelisiniz');
            return;
        }

        try {
            setLoading(true);
            await stockCountAPI.create({
                count_no: ficheNo,
                warehouse_id: selectedWarehouse,
                count_date: date,
                status: 'draft',
                notes: notes
            }, items);

            toast.success('Sayım fişi kaydedildi');
            onSave();
            onClose();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Kaydedilirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!searchQuery) return [];
        const q = searchQuery.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q)
        ).slice(0, 10);
    }, [searchQuery, products]);

    return (
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="bg-pink-600 text-white px-6 py-4 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-2 rounded-lg">
                        <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Yeni Sayım Fişi Oluştur</h1>
                        <p className="text-pink-100 text-xs">Stok envanterini güncellemek için sayım yapın</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 bg-white text-pink-700 px-6 py-2 rounded-lg font-bold hover:bg-pink-50 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-5 h-5" />
                        Kaydet
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Form Body */}
                <div className="p-6 grid grid-cols-4 gap-6 bg-gray-50 border-b">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Fiş No</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg outline-none focus:border-pink-500 transition-all font-mono"
                            value={ficheNo}
                            onChange={e => setFicheNo(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Tarih</label>
                        <input
                            type="date"
                            className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg outline-none focus:border-pink-500 transition-all"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Depo</label>
                        <select
                            className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg outline-none focus:border-pink-500 transition-all"
                            value={selectedWarehouse}
                            onChange={e => setSelectedWarehouse(e.target.value)}
                        >
                            {warehouses.map(wh => (
                                <option key={wh.id} value={wh.id}>{wh.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Açıklama</label>
                        <input
                            type="text"
                            placeholder="Opsiyonel notlar..."
                            className="w-full bg-white border border-gray-200 px-3 py-2 rounded-lg outline-none focus:border-pink-500 transition-all"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* Items Section */}
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="relative w-96">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Ürün ara (Kodu veya Adı)..."
                                className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all shadow-sm"
                                value={searchQuery}
                                onChange={e => {
                                    setSearchQuery(e.target.value);
                                    setShowProductSearch(true);
                                }}
                                onFocus={() => setShowProductSearch(true)}
                            />

                            {/* Product Search Results */}
                            {showProductSearch && filteredProducts.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    {filteredProducts.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleAddItem(p)}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-pink-50 transition-colors border-b last:border-0"
                                        >
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                                                <Package className="w-6 h-6" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-gray-900">{p.name}</div>
                                                <div className="text-xs font-mono text-gray-500">{p.code}</div>
                                            </div>
                                            <div className="ml-auto">
                                                <Plus className="w-5 h-5 text-pink-500" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span>Toplam Satır: {items.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto border border-gray-100 rounded-xl bg-white shadow-sm">
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 bg-gray-50 z-10 border-b">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-20">No</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ürün Bilgisi</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Beklenen</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Sayılan</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Fark</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Açıklama</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-32 text-center text-gray-400">
                                            <Calculator className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                            <p className="text-lg">Sayım yapmak için ürün arayın ve listeye ekleyin</p>
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item, idx) => {
                                        const diff = (item.counted_quantity || 0) - (item.expected_quantity || 0);
                                        return (
                                            <tr key={item.product_id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-mono text-gray-400">{idx + 1}</td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-900">{item.product_name}</div>
                                                    <div className="text-xs font-mono text-gray-500">{item.product_code}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-gray-50 border border-gray-100 px-2 py-1.5 rounded text-center font-bold text-gray-700 outline-none"
                                                        value={item.expected_quantity}
                                                        onChange={e => updateItem(idx, 'expected_quantity', parseFloat(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        autoFocus
                                                        className="w-full bg-pink-50 border border-pink-100 px-2 py-1.5 rounded text-center font-bold text-pink-700 outline-none focus:ring-2 focus:ring-pink-500/20"
                                                        value={item.counted_quantity}
                                                        onChange={e => updateItem(idx, 'counted_quantity', parseFloat(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${diff === 0 ? 'bg-gray-100 text-gray-600' :
                                                            diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {diff > 0 ? '+' : ''}{diff}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="text"
                                                        placeholder="Not..."
                                                        className="w-full border-b border-transparent hover:border-gray-200 focus:border-pink-500 outline-none py-1 text-sm bg-transparent"
                                                        value={item.notes}
                                                        onChange={e => updateItem(idx, 'notes', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => removeItem(idx)}
                                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}


