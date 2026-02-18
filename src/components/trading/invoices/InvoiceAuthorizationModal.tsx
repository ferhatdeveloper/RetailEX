import { X, Shield, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

interface Authorization {
  code: string;
  name: string;
  description?: string;
}

// Mock yetki kodları - gerçek uygulamada API'den gelecek
const mockAuthorizations: Authorization[] = [
  { code: 'YET1', name: 'Genel Yetki', description: 'Tüm işlemler için' },
  { code: 'YET2', name: 'Satış Yetkisi', description: 'Satış işlemleri için' },
  { code: 'YET3', name: 'İndirim Yetkisi', description: 'İndirim yapabilme yetkisi' },
  { code: 'YET4', name: 'İptal Yetkisi', description: 'İşlem iptal etme yetkisi' },
  { code: 'YET5', name: 'Yönetici Yetkisi', description: 'Tüm yetkiler' },
];

interface InvoiceAuthorizationModalProps {
  currentAuth: string;
  onSelect: (auth: string) => void;
  onClose: () => void;
}

export function InvoiceAuthorizationModal({ currentAuth, onSelect, onClose }: InvoiceAuthorizationModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAuths = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockAuthorizations;
    }
    const term = searchTerm.toLowerCase();
    return mockAuthorizations.filter(
      auth =>
        auth.code.toLowerCase().includes(term) ||
        auth.name.toLowerCase().includes(term) ||
        auth.description?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (auth: string) => {
    onSelect(auth);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl rounded-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Yetki Kodu Seç
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
              placeholder="Yetki kodu veya adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Authorization List */}
        <div className="flex-1 overflow-auto p-4">
          {filteredAuths.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Yetki bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => handleSelect('')}
                className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                  !currentAuth
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <p className="font-medium text-gray-900">Yetki Seçilmedi</p>
              </button>
              {filteredAuths.map((auth) => (
                <button
                  key={auth.code}
                  onClick={() => handleSelect(auth.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    currentAuth === auth.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{auth.name}</p>
                      <p className="text-sm text-gray-600">Kod: {auth.code}</p>
                      {auth.description && (
                        <p className="text-xs text-gray-500 mt-1">{auth.description}</p>
                      )}
                    </div>
                    {currentAuth === auth.code && (
                      <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
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



