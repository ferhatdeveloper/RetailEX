import React from 'react';
import { X, Grid3x3 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSPageSelectorModalProps {
  currentPage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export function POSPageSelectorModal({ currentPage, onSelectPage, onClose }: POSPageSelectorModalProps) {
  const { t } = useLanguage();
  const pages = [
    { page: 0, label: '1-12' },
    { page: 1, label: '13-24' },
    { page: 2, label: '25-36' },
    { page: 3, label: '37-48' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-[400px] shadow-lg border border-gray-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3x3 className="w-5 h-5" />
            <h2 className="font-medium">{t.quickProductPageSelect}</h2>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white/20 p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - 2x2 Grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {pages.map(({ page, label }) => (
              <button
                key={page}
                onClick={() => {
                  onSelectPage(page);
                  onClose();
                }}
                className={`py-8 text-lg font-medium border-2 transition-all ${
                  currentPage === page
                    ? 'bg-blue-600 text-white border-blue-700 shadow-lg'
                    : 'bg-white text-blue-700 border-blue-400 hover:bg-blue-50 hover:border-blue-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}



