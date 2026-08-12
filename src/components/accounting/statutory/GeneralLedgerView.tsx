import React from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';

export function GeneralLedgerView() {
    const { t } = useLanguage();
    const { darkMode } = useTheme();

    return (
        <div className="h-full flex items-center justify-center p-8">
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">{(t as any).generalLedger || 'Defter-i Kebir'}</h2>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                    Defter-i Kebir (Büyük Defter) görünümü burada olacak.
                </p>
            </div>
        </div>
    );
}

