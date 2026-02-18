import { X, Package, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

interface Warehouse {
  code: string;
  name: string;
  address?: string;
}

// Mock ambarlar - gerçek uygulamada API'den gelecek
const mockWarehouses: Warehouse[] = [
  { code: '000', name: 'Merkez', address: 'Ana depo' },
  { code: '001', name: 'Depo 1', address: 'Şube 1 deposu' },
  { code: '002', name: 'Depo 2', address: 'Şube 2 deposu' },
  { code: '003', name: 'Depo 3', address: 'Soğuk hava deposu' },
];

interface InvoiceWarehouseModalProps {
  currentWarehouse: string;
  onSelect: (warehouse: string) => void;
  onClose: () => void;
}

export function InvoiceWarehouseModal({ currentWarehouse, onSelect, onClose }: InvoiceWarehouseModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWarehouses = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockWarehouses;
    }
    const term = searchTerm.toLowerCase();
    return mockWarehouses.filter(
      warehouse =>
        warehouse.code.toLowerCase().includes(term) ||
        warehouse.name.toLowerCase().includes(term) ||
        warehouse.address?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (warehouse: Warehouse) => {
    onSelect(`${warehouse.code}, ${warehouse.name}`);
    onClose();
  };

  const getCurrentCode = () => {
    if (currentWarehouse.includes(',')) {
      return currentWarehouse.split(',')[0].trim();
    }
    return currentWarehouse;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl rounded-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Package className="w-5 h-5" />
            Ambar Seç
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
              placeholder="Ambar kodu veya adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Warehouse List */}
        <div className="flex-1 overflow-auto p-4">
          {filteredWarehouses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Ambar bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWarehouses.map((warehouse) => {
                const isSelected = getCurrentCode() === warehouse.code;
                return (
                  <button
                    key={warehouse.code}
                    onClick={() => handleSelect(warehouse)}
                    className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{warehouse.name}</p>
                        <p className="text-sm text-gray-600">Kod: {warehouse.code}</p>
                        {warehouse.address && (
                          <p className="text-xs text-gray-500 mt-1">{warehouse.address}</p>
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



