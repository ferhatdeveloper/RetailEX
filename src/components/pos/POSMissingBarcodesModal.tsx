import React, { useMemo, useState } from 'react';
import { X, Trash2, Copy, Barcode, Plus, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

interface POSMissingBarcodesModalProps {
    onClose: () => void;
    barcodes: string[];
    onClear: () => void;
    onCreateProduct: (data: {
        barcode: string;
        name: string;
        unit: string;
        price: number;
    }) => Promise<void>;
}

export function POSMissingBarcodesModal({ onClose, barcodes, onClear, onCreateProduct }: POSMissingBarcodesModalProps) {
    const { t, tm } = useLanguage();
    const { darkMode } = useTheme();
    const [selectedBarcode, setSelectedBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [unit, setUnit] = useState('Adet');
    const [price, setPrice] = useState('');
    const [saving, setSaving] = useState(false);

    const activeBarcode = selectedBarcode || barcodes[0] || '';
    const canSave = activeBarcode.trim() && productName.trim() && Number(price) >= 0;
    const uniqueBarcodes = useMemo(() => Array.from(new Set(barcodes.map(b => String(b).trim()).filter(Boolean))), [barcodes]);

    const handleCopy = (barcode: string) => {
        navigator.clipboard.writeText(barcode);
        // You could add a small toast here if available
    };

    const startCreate = (barcode: string) => {
        setSelectedBarcode(barcode);
        setProductName(prev => prev || '');
        setUnit(prev => prev || 'Adet');
        setPrice(prev => prev || '');
    };

    const handleSave = async () => {
        if (!canSave || saving) return;
        setSaving(true);
        try {
            await onCreateProduct({
                barcode: activeBarcode.trim(),
                name: productName.trim(),
                unit: unit.trim() || 'Adet',
                price: Number(price) || 0,
            });
            setSelectedBarcode('');
            setProductName('');
            setUnit('Adet');
            setPrice('');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-4xl max-h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                {/* Header */}
                <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                            <Barcode className="w-5 h-5" />
                        </div>
                        <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {t.missingBarcodesTitle}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
                    {barcodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className={`p-4 rounded-full mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <Barcode className={`w-12 h-12 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                            </div>
                            <p className={`text-lg font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {t.noMissingBarcodes}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {uniqueBarcodes.map((barcode, index) => (
                                <div
                                    key={index}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:shadow-md ${darkMode
                                            ? 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                                            : 'bg-white border-gray-200 hover:border-blue-300'
                                        }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => startCreate(barcode)}
                                        className={`font-mono text-lg text-left ${selectedBarcode === barcode ? 'text-blue-600 font-black' : darkMode ? 'text-gray-200' : 'text-gray-700'}`}
                                    >
                                        {barcode}
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCopy(barcode)}
                                            className={`p-2 rounded-md transition-all flex items-center gap-2 ${darkMode ? 'hover:bg-gray-600 text-blue-400' : 'hover:bg-blue-50 text-blue-600'
                                                }`}
                                            title={t.copy || 'Copy'}
                                        >
                                            <Copy className="w-4 h-4" />
                                            <span className="text-sm font-medium">{t.copy || 'Kopyala'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => startCreate(barcode)}
                                            className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-700"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {tm('missingBarcodeAddAsProduct')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {activeBarcode ? (
                    <div className={`border-t p-4 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-green-50/60'}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className={`text-xs font-black uppercase tracking-wide ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{tm('missingBarcodeCreateProduct')}</p>
                                <p className={`font-mono text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{activeBarcode}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <label className="md:col-span-2">
                                <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeProductName')} *</span>
                                <input
                                    value={productName}
                                    onChange={e => setProductName(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder={tm('missingBarcodeProductName')}
                                />
                            </label>
                            <label>
                                <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeUnit')}</span>
                                <input
                                    value={unit}
                                    onChange={e => setUnit(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Adet"
                                />
                            </label>
                            <label>
                                <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeSalePrice')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="0"
                                />
                            </label>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={!canSave || saving}
                                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? tm('missingBarcodeSaving') : tm('missingBarcodeCreateButton')}
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Footer */}
                <div className={`p-4 border-t flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                    <button
                        onClick={onClear}
                        disabled={barcodes.length === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${barcodes.length === 0
                                ? 'opacity-50 cursor-not-allowed grayscale'
                                : 'text-red-600 hover:bg-red-50 active:bg-red-100'
                            }`}
                    >
                        <Trash2 className="w-4 h-4" />
                        {t.clearList}
                    </button>
                    <button
                        onClick={onClose}
                        className={`px-6 py-2 rounded-lg font-bold transition-all ${darkMode
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                            }`}
                    >
                        {t.close}
                    </button>
                </div>
            </div>
        </div>
    );
}


