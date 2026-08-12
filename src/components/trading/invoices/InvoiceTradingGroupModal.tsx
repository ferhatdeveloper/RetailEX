import { X, Building2, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

interface TradingGroup {
  code: string;
  name: string;
  description?: string;
}

// Mock ticari gruplar - gerçek uygulamada API'den gelecek
const mockTradingGroups: TradingGroup[] = [
  { code: 'GRUP1', name: 'Toptan Satış Grubu', description: 'Toptan müşteriler için' },
  { code: 'GRUP2', name: 'Perakende Grubu', description: 'Perakende müşteriler için' },
  { code: 'GRUP3', name: 'Kurumsal Grubu', description: 'Kurumsal müşteriler için' },
  { code: 'GRUP4', name: 'Hızlı Tüketim Grubu', description: 'FMCG müşterileri için' },
  { code: 'GRUP5', name: 'Teknoloji Grubu', description: 'Teknoloji sektörü müşterileri' },
];

interface InvoiceTradingGroupModalProps {
  currentGroup: string;
  onSelect: (group: string) => void;
  onClose: () => void;
}

export function InvoiceTradingGroupModal({ currentGroup, onSelect, onClose }: InvoiceTradingGroupModalProps) {
  const { tm } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockTradingGroups;
    }
    const term = searchTerm.toLowerCase();
    return mockTradingGroups.filter(
      group =>
        group.code.toLowerCase().includes(term) ||
        group.name.toLowerCase().includes(term) ||
        group.description?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (group: string) => {
    onSelect(group);
    onClose();
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('selectTradingGroup')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {tm('selectTradingGroup')}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tm('searchGroupPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Group List */}
        <PercentBodyModalScrollBody className="p-4">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{tm('groupNotFound')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => handleSelect('')}
                className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                  !currentGroup
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <p className="font-medium text-gray-900">{tm('groupNotSelected')}</p>
              </button>
              {filteredGroups.map((group) => (
                <button
                  key={group.code}
                  onClick={() => handleSelect(group.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    currentGroup === group.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{group.name}</p>
                      <p className="text-sm text-gray-600">{tm('code')}: {group.code}</p>
                      {group.description && (
                        <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                      )}
                    </div>
                    {currentGroup === group.code && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </PercentBodyModalScrollBody>

        <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            {tm('cancel')}
          </button>
        </div>
    </PercentBodyModal>
  );
}



