import { X, Building, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

interface Workplace {
  code: string;
  name: string;
  address?: string;
}

// Mock işyerleri - gerçek uygulamada API'den gelecek
const mockWorkplaces: Workplace[] = [
  { code: '000', name: 'Merkez', address: 'Bağdat, Irak' },
  { code: '001', name: 'Şube 1', address: 'Erbil, Irak' },
  { code: '002', name: 'Şube 2', address: 'Basra, Irak' },
  { code: '003', name: 'Şube 3', address: 'Musul, Irak' },
];

interface InvoiceWorkplaceModalProps {
  currentWorkplace: string;
  onSelect: (workplace: string) => void;
  onClose: () => void;
}

export function InvoiceWorkplaceModal({ currentWorkplace, onSelect, onClose }: InvoiceWorkplaceModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWorkplaces = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockWorkplaces;
    }
    const term = searchTerm.toLowerCase();
    return mockWorkplaces.filter(
      workplace =>
        workplace.code.toLowerCase().includes(term) ||
        workplace.name.toLowerCase().includes(term) ||
        workplace.address?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (workplace: Workplace) => {
    onSelect(`${workplace.code}, ${workplace.name}`);
    onClose();
  };

  const getCurrentCode = () => {
    if (currentWorkplace.includes(',')) {
      return currentWorkplace.split(',')[0].trim();
    }
    return currentWorkplace;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl rounded-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Building className="w-5 h-5" />
            İşyeri Seç
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="İşyeri kodu veya adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Workplace List */}
        <div className="flex-1 overflow-auto p-4">
          {filteredWorkplaces.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>İşyeri bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWorkplaces.map((workplace) => {
                const isSelected = getCurrentCode() === workplace.code;
                return (
                  <button
                    key={workplace.code}
                    onClick={() => handleSelect(workplace)}
                    className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{workplace.name}</p>
                        <p className="text-sm text-gray-600">Kod: {workplace.code}</p>
                        {workplace.address && (
                          <p className="text-xs text-gray-500 mt-1">{workplace.address}</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}


