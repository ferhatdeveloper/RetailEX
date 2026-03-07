import React from 'react';
import { X, Trash2, Copy, Barcode } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

interface POSMissingBarcodesModalProps {
    onClose: () => void;
    barcodes: string[];
    onClear: () => void;
}

export function POSMissingBarcodesModal({ onClose, barcodes, onClear }: POSMissingBarcodesModalProps) {
    const { t } = useLanguage();
    const { darkMode } = useTheme();

    const handleCopy = (barcode: string) => {
        navigator.clipboard.writeText(barcode);
        // You could add a small toast here if available
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
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
                            {barcodes.map((barcode, index) => (
                                <div
                                    key={index}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:shadow-md ${darkMode
                                            ? 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                                            : 'bg-white border-gray-200 hover:border-blue-300'
                                        }`}
                                >
                                    <span className={`font-mono text-lg ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                                        {barcode}
                                    </span>
                                    <button
                                        onClick={() => handleCopy(barcode)}
                                        className={`p-2 rounded-md transition-all flex items-center gap-2 ${darkMode ? 'hover:bg-gray-600 text-blue-400' : 'hover:bg-blue-50 text-blue-600'
                                            }`}
                                        title={t.copy || 'Copy'}
                                    >
                                        <Copy className="w-4 h-4" />
                                        <span className="text-sm font-medium">{t.copy || 'Kopyala'}</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

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


