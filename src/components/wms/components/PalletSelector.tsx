import React from 'react';
import { Box, Package } from 'lucide-react';

export type PalletType = 'euro' | 'epal_turpal' | 'chep' | 'plastic' | 'unqualified' | 'duseldorf' | 'big_boy';

interface PalletSelectorProps {
    selectedType: PalletType | undefined;
    onSelect: (type: PalletType) => void;
    className?: string;
}

const PALLET_OPTIONS: { id: PalletType; label: string; dimensions: string; color: string }[] = [
    { id: 'euro', label: 'Euro Pallet', dimensions: '80x120 cm', color: 'bg-blue-100 border-blue-300' },
    { id: 'epal_turpal', label: 'EPAL / Turpal', dimensions: '80x120 cm', color: 'bg-indigo-100 border-indigo-300' },
    { id: 'chep', label: 'CHEP (Blue)', dimensions: '100x120 cm', color: 'bg-blue-600 border-blue-700 text-white' }, // Distinctive blue
    { id: 'plastic', label: 'Plastik Palet', dimensions: 'Std', color: 'bg-gray-100 border-gray-300' },
    { id: 'unqualified', label: 'Vasıfsız (Ahşap)', dimensions: 'Karışık', color: 'bg-amber-100 border-amber-300' }, // 'unqualified' mapped to UI label
    { id: 'duseldorf', label: 'Düsseldorf', dimensions: '60x80 cm', color: 'bg-green-100 border-green-300' },
    { id: 'big_boy', label: 'Büyük Boy', dimensions: '120x120 cm', color: 'bg-purple-100 border-purple-300' },
];

export const PalletSelector: React.FC<PalletSelectorProps> = ({ selectedType, onSelect, className }) => {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`}>
            {PALLET_OPTIONS.map((pallet) => (
                <button
                    key={pallet.id}
                    onClick={() => onSelect(pallet.id)}
                    className={`
            relative p-3 rounded-lg border-2 transition-all duration-200 flex flex-col items-center justify-center text-center gap-2
            ${selectedType === pallet.id
                            ? 'border-blue-500 ring-2 ring-blue-200 shadow-md transform scale-105'
                            : 'border-transparent hover:border-gray-200 hover:shadow-sm'}
            ${pallet.color}
          `}
                    type="button"
                >
                    <Box className={`w-6 h-6 ${pallet.id === 'chep' ? 'text-white' : 'text-gray-700'}`} />
                    <div>
                        <div className={`font-semibold text-sm ${pallet.id === 'chep' && 'text-white'}`}>{pallet.label}</div>
                        <div className={`text-xs opacity-75 ${pallet.id === 'chep' && 'text-gray-200'}`}>{pallet.dimensions}</div>
                    </div>

                    {selectedType === pallet.id && (
                        <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                            <Package size={12} />
                        </div>
                    )}
                </button>
            ))}
        </div>
    );
};

