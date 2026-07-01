import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Copy, Barcode, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { POS_MODAL_OVERLAY, POS_MODAL_SHELL, POS_MODAL_HEADER } from './posUiConstants';
import { playBarcodeNotFoundBeep } from '../../utils/posFeedbackSounds';

interface POSMissingBarcodesModalProps {
    onClose: () => void;
    barcodes: string[];
    highlightBarcode?: string | null;
    onClear: () => void;
    onCreateProduct: (data: {
        barcode: string;
        name: string;
        unit: string;
        price: number;
    }) => Promise<void>;
}

export function POSMissingBarcodesModal({ onClose, barcodes, highlightBarcode, onClear, onCreateProduct }: POSMissingBarcodesModalProps) {
    const { t, tm } = useLanguage();
    const { darkMode } = useTheme();
    const [selectedBarcode, setSelectedBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [unit, setUnit] = useState('Adet');
    const [price, setPrice] = useState('');
    const [saving, setSaving] = useState(false);

    const uniqueBarcodes = useMemo(() => Array.from(new Set(barcodes.map(b => String(b).trim()).filter(Boolean))), [barcodes]);
    const activeBarcode = selectedBarcode || highlightBarcode || uniqueBarcodes[0] || '';

    const canSave = activeBarcode.trim() && productName.trim() && Number(price) >= 0;

    useEffect(() => {
        if (highlightBarcode) {
            playBarcodeNotFoundBeep();
        }
    }, [highlightBarcode]);

    const handleCopy = (barcode: string) => {
        void navigator.clipboard.writeText(barcode);
    };

    const startCreate = (barcode: string) => {
        setSelectedBarcode(barcode);
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
        <div className={POS_MODAL_OVERLAY} role="dialog" aria-modal="true">
            <div className={POS_MODAL_SHELL(darkMode)}>
                <div className={POS_MODAL_HEADER}>
                    <h3 className="text-base text-white flex items-center gap-2">
                        <Barcode className="w-5 h-5" />
                        {t.missingBarcodesTitle}
                    </h3>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
                    {highlightBarcode ? (
                        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-amber-600 bg-amber-950/30 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                            {t.posUnknownBarcodeAlert.replace('{barcode}', highlightBarcode)}
                        </div>
                    ) : null}

                    {barcodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Barcode className={`w-12 h-12 mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                            <p className={`text-lg font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {t.noMissingBarcodes}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {uniqueBarcodes.map((barcode, index) => (
                                <div
                                    key={index}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                        highlightBarcode === barcode || selectedBarcode === barcode
                                            ? darkMode
                                                ? 'bg-blue-900/30 border-blue-500'
                                                : 'bg-blue-50 border-blue-400'
                                            : darkMode
                                                ? 'bg-gray-800 border-gray-600'
                                                : 'bg-white border-gray-200'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => startCreate(barcode)}
                                        className={`font-mono text-lg text-left ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}
                                    >
                                        {barcode}
                                    </button>
                                    <button
                                        onClick={() => handleCopy(barcode)}
                                        className={`p-2 rounded-md flex items-center gap-1 text-sm ${darkMode ? 'text-blue-300 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                                    >
                                        <Copy className="w-4 h-4" />
                                        {t.copy || 'Kopyala'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeBarcode ? (
                        <div className={`mt-4 rounded-lg border p-4 ${darkMode ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'}`}>
                            <p className={`text-xs font-bold uppercase mb-3 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                {tm('missingBarcodeCreateProduct')} — <span className="font-mono">{activeBarcode}</span>
                            </p>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                <label className="md:col-span-2">
                                    <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeProductName')} *</span>
                                    <input
                                        value={productName}
                                        onChange={e => setProductName(e.target.value)}
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-900 border-gray-600 text-white' : 'border-gray-300'}`}
                                    />
                                </label>
                                <label>
                                    <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeUnit')}</span>
                                    <input
                                        value={unit}
                                        onChange={e => setUnit(e.target.value)}
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-900 border-gray-600 text-white' : 'border-gray-300'}`}
                                    />
                                </label>
                                <label>
                                    <span className={`mb-1 block text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{tm('missingBarcodeSalePrice')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={price}
                                        onChange={e => setPrice(e.target.value)}
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-900 border-gray-600 text-white' : 'border-gray-300'}`}
                                    />
                                </label>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className={`px-4 py-3 border-t flex items-center justify-between gap-2 shrink-0 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                    <button
                        onClick={onClear}
                        disabled={barcodes.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                        <Trash2 className="w-4 h-4" />
                        {t.clearList}
                    </button>
                    <div className="flex gap-2">
                        {activeBarcode && productName.trim() ? (
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={!canSave || saving}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? tm('missingBarcodeSaving') : tm('missingBarcodeCreateButton')}
                            </button>
                        ) : null}
                        <button
                            onClick={onClose}
                            className="px-6 py-2 rounded-lg text-sm font-bold bg-gray-200 text-gray-700 hover:bg-gray-300"
                        >
                            {t.close}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
