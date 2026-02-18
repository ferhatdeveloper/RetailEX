// ♻️ Recycling & Scrap Management - Geri Dönüşüm ve Hurda Yönetimi
// Handles marking items as scrap/recycling and categorizing them

import { useState } from 'react';
import {
    Recycle, Trash2, ArrowLeft, Search, Save, AlertTriangle, Scan as ScanIcon,
    CheckCircle, History, FileText
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';

interface RecyclingManagementProps {
    darkMode: boolean;
    onBack: () => void;
}

interface RecycleItem {
    id: string; // Inventory ID
    product_name: string;
    barcode: string;
    current_quantity: number;
    batch_no?: string;
    status: string;
}

const RECYCLE_CATEGORIES = [
    { id: 'cardboard', label: 'Karton / Kağıt', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    { id: 'plastic', label: 'Plastik', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { id: 'metal', label: 'Metal', color: 'bg-gray-100 text-gray-800 border-gray-200' },
    { id: 'organic', label: 'Organik Atık', color: 'bg-green-100 text-green-800 border-green-200' },
    { id: 'electronic', label: 'Elektronik (WEEE)', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { id: 'glass', label: 'Cam', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    { id: 'hazardous', label: 'Tehlikeli Atık', color: 'bg-red-100 text-red-800 border-red-200' },
];

export function RecyclingManagement({ darkMode, onBack }: RecyclingManagementProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [selectedItem, setSelectedItem] = useState<RecycleItem | null>(null);
    const [scrapQuantity, setScrapQuantity] = useState(1);
    const [selectedCategory, setSelectedCategory] = useState<string>('cardboard');
    const [notes, setNotes] = useState('');
    const [history, setHistory] = useState<any[]>([]); // Mock history

    const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
    const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
    const inputClass = darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300';

    const handleSearch = (term: string) => {
        // Mock search - in real app query wms_inventory
        console.log('Searching for:', term);

        // Simulating finding an item
        if (term.length > 3) {
            setSelectedItem({
                id: 'inv-123',
                product_name: 'Örnek Ürün (Hasarlı)',
                barcode: term,
                current_quantity: 50,
                batch_no: 'LOT-2024-001',
                status: 'available'
            });
        }
    };

    const handeSubmit = () => {
        if (!selectedItem) return;

        // Logic to update inventory (decrease stock, create scrap record)
        console.log('Processing Scrap:', {
            inventory_id: selectedItem.id,
            quantity: scrapQuantity,
            category: selectedCategory,
            notes
        });

        const newEntry = {
            id: Date.now(),
            product: selectedItem.product_name,
            quantity: scrapQuantity,
            category: RECYCLE_CATEGORIES.find(c => c.id === selectedCategory)?.label,
            date: new Date().toLocaleString()
        };

        setHistory([newEntry, ...history]);
        alert('Ürün başarıyla hurdaya/geri dönüşüme ayrıldı.');

        // Reset
        setSelectedItem(null);
        setScrapQuantity(1);
        setNotes('');
        setSearchTerm('');
    };

    return (
        <div className={`min-h-screen ${bgClass} p-6`}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={onBack}
                        className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Geri Dön
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                            <Recycle className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${textClass}`}>Geri Dönüşüm Yönetimi</h1>
                            <p className="text-gray-500">Hasarlı, günü geçmiş veya hurda ürünleri yönetin</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Action Area */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Search / Scan */}
                        <div className={`${cardClass} border rounded-xl p-6`}>
                            <h2 className={`text-lg font-semibold ${textClass} mb-4`}>Ürün Seçimi</h2>
                            <div className="flex gap-4">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Barkod veya ürün adı..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchTerm)}
                                        className={`w-full pl-10 pr-4 py-3 rounded-lg border ${inputClass}`}
                                    />
                                </div>
                                <button
                                    onClick={() => setShowScanner(true)}
                                    className="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                                >
                                    <ScanIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Selected Item Details & Form */}
                        {selectedItem && (
                            <div className={`${cardClass} border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4`}>
                                <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                                    <div>
                                        <h3 className={`text-xl font-bold ${textClass}`}>{selectedItem.product_name}</h3>
                                        <p className="text-gray-500 text-sm mt-1">Barkod: {selectedItem.barcode}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                                Mevcut Stok: {selectedItem.current_quantity}
                                            </span>
                                            {selectedItem.batch_no && (
                                                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                                                    LOT: {selectedItem.batch_no}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                        <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                                            Ayırılacak Miktar
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => setScrapQuantity(Math.max(1, scrapQuantity - 1))}
                                                className={`w-10 h-10 flex items-center justify-center rounded-lg border ${inputClass} font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-700`}
                                            >
                                                -
                                            </button>
                                            <input
                                                type="number"
                                                value={scrapQuantity}
                                                onChange={(e) => setScrapQuantity(Math.min(selectedItem.current_quantity, Math.max(1, parseInt(e.target.value) || 0)))}
                                                className={`flex-1 text-center py-2 rounded-lg border ${inputClass} font-bold text-lg`}
                                            />
                                            <button
                                                onClick={() => setScrapQuantity(Math.min(selectedItem.current_quantity, scrapQuantity + 1))}
                                                className={`w-10 h-10 flex items-center justify-center rounded-lg border ${inputClass} font-bold text-lg hover:bg-gray-100 dark:hover:bg-gray-700`}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={`block text-sm font-semibold ${textClass} mb-3`}>
                                            Atık / Geri Dönüşüm Kategorisi
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {RECYCLE_CATEGORIES.map((cat) => (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => setSelectedCategory(cat.id)}
                                                    className={`p-3 rounded-lg border text-sm font-medium transition-all text-left flex items-center gap-2
                            ${selectedCategory === cat.id
                                                            ? `ring-2 ring-offset-1 ring-blue-500 ${cat.color} ${darkMode ? 'ring-offset-gray-800' : 'ring-offset-white'}`
                                                            : `border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${textClass}`
                                                        }
                          `}
                                                >
                                                    <div className={`w-3 h-3 rounded-full ${cat.color.split(' ')[0].replace('bg-', 'bg-')}`} />
                                                    {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                        {selectedCategory === 'hazardous' && (
                                            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-lg flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" />
                                                Dikkat: Tehlikeli atık prosedürlerine uyunuz!
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                                            Açıklama / Sebep
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Örn: Nakliye sırasında hasar gördü, SKT geçti..."
                                            className={`w-full p-3 rounded-lg border ${inputClass} min-h-[100px]`}
                                        />
                                    </div>

                                    <button
                                        onClick={handeSubmit}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Trash2 className="w-6 h-6" />
                                        Hurdaya / Geri Dönüşüme Ayır
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar: History / Stats */}
                    <div className="space-y-6">
                        <div className={`${cardClass} border rounded-xl p-6`}>
                            <h3 className={`text-lg font-bold ${textClass} mb-4 flex items-center gap-2`}>
                                <History className="w-5 h-5 text-gray-500" />
                                Son İşlemler
                            </h3>

                            {history.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 text-sm">
                                    Henüz işlem kaydı yok.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((item) => (
                                        <div key={item.id} className="flex gap-3 text-sm pb-3 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                                            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg h-fit">
                                                <Recycle className="w-4 h-4 text-gray-500" />
                                            </div>
                                            <div>
                                                <div className={`font-semibold ${textClass}`}>{item.product}</div>
                                                <div className="text-gray-500 text-xs mt-0.5">
                                                    {item.quantity} Adet • {item.category}
                                                </div>
                                                <div className="text-gray-400 text-xs mt-1">{item.date}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={`${cardClass} border rounded-xl p-6`}>
                            <h3 className={`text-lg font-bold ${textClass} mb-2`}>İstatistikler</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                    <span className="text-gray-500">Bugün Ayrılan</span>
                                    <span className={`font-mono font-bold ${textClass}`}>
                                        {history.reduce((sum, h) => sum + h.quantity, 0)} ad
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-500">Çevre Katkısı</span>
                                    <span className="font-mono font-bold text-green-600">High</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <BarcodeScanner
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={(barcode) => {
                    handleSearch(barcode);
                    setShowScanner(false);
                }}
                darkMode={darkMode}
            />
        </div>
    );
}

