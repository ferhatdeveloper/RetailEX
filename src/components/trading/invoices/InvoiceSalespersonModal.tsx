import { X, User, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

interface Salesperson {
  code: string;
  name: string;
  phone?: string;
  email?: string;
}

// Mock satış elemanları - gerçek uygulamada API'den gelecek
const mockSalespersons: Salesperson[] = [
  { code: 'SAT001', name: 'Ahmed Yılmaz', phone: '+964 750 123 4567', email: 'ahmed@example.com' },
  { code: 'SAT002', name: 'Mohammed Ali', phone: '+964 750 234 5678', email: 'mohammed@example.com' },
  { code: 'SAT003', name: 'Fatima Hassan', phone: '+964 750 345 6789', email: 'fatima@example.com' },
  { code: 'SAT004', name: 'Omar Kader', phone: '+964 750 456 7890', email: 'omar@example.com' },
];

interface InvoiceSalespersonModalProps {
  currentSalesperson: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function InvoiceSalespersonModal({ currentSalesperson, onSelect, onClose }: InvoiceSalespersonModalProps) {
  const { tm } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSalespersons = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockSalespersons;
    }
    const term = searchTerm.toLowerCase();
    return mockSalespersons.filter(
      person =>
        person.code.toLowerCase().includes(term) ||
        person.name.toLowerCase().includes(term) ||
        person.phone?.toLowerCase().includes(term) ||
        person.email?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('selectSalesperson')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            {tm('selectSalesperson')}
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
              placeholder={tm('searchSalespersonPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Salesperson List */}
        <PercentBodyModalScrollBody className="p-4">
          {filteredSalespersons.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{tm('salespersonNotFound')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => handleSelect('')}
                className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                  !currentSalesperson
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <p className="font-medium text-gray-900">{tm('salespersonNotSelected')}</p>
              </button>
              {filteredSalespersons.map((person) => (
                <button
                  key={person.code}
                  onClick={() => handleSelect(person.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    currentSalesperson === person.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{person.name}</p>
                      <p className="text-sm text-gray-600">{tm('code')}: {person.code}</p>
                      {(person.phone || person.email) && (
                        <div className="flex flex-col gap-1 mt-1">
                          {person.phone && (
                            <p className="text-xs text-gray-500">{tm('phoneShort')}: {person.phone}</p>
                          )}
                          {person.email && (
                            <p className="text-xs text-gray-500">{tm('emailLabel')}: {person.email}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {currentSalesperson === person.code && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center ml-3">
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



