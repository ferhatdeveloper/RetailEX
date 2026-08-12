import { X, Hash, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

interface SpecialCode {
  code: string;
  name: string;
  description?: string;
}

// Mock özel kodlar - gerçek uygulamada API'den gelecek
const mockSpecialCodes: SpecialCode[] = [
  { code: 'KOD1', name: 'Özel Kod 1', description: 'Açıklama 1' },
  { code: 'KOD2', name: 'Özel Kod 2', description: 'Açıklama 2' },
  { code: 'KOD3', name: 'Özel Kod 3', description: 'Açıklama 3' },
  { code: 'KOD4', name: 'Özel Kod 4', description: 'Açıklama 4' },
  { code: 'KOD5', name: 'Özel Kod 5', description: 'Açıklama 5' },
];

interface InvoiceSpecialCodeModalProps {
  currentCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function InvoiceSpecialCodeModal({ currentCode, onSelect, onClose }: InvoiceSpecialCodeModalProps) {
  const { tm } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [customCode, setCustomCode] = useState(currentCode);

  const filteredCodes = useMemo(() => {
    if (!searchTerm.trim()) {
      return mockSpecialCodes;
    }
    const term = searchTerm.toLowerCase();
    return mockSpecialCodes.filter(
      code =>
        code.code.toLowerCase().includes(term) ||
        code.name.toLowerCase().includes(term) ||
        code.description?.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  const handleCustomSave = () => {
    if (customCode.trim()) {
      onSelect(customCode.trim());
      onClose();
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel={tm('selectSpecialCode')}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Hash className="w-5 h-5" />
            {tm('selectSpecialCode')}
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
              placeholder={tm('searchCodeOrDescPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Custom Code Input */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {tm('enterSpecialCode')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder={tm('enterCodePlaceholder')}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCustomSave();
                }
              }}
            />
            <button
              onClick={handleCustomSave}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              {tm('save')}
            </button>
          </div>
        </div>

        {/* Code List */}
        <PercentBodyModalScrollBody className="p-4">
          {filteredCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Hash className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{tm('codeNotFound')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCodes.map((code) => (
                <button
                  key={code.code}
                  onClick={() => handleSelect(code.code)}
                  className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                    currentCode === code.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{code.name}</p>
                      <p className="text-sm text-gray-600">{tm('code')}: {code.code}</p>
                      {code.description && (
                        <p className="text-xs text-gray-500 mt-1">{code.description}</p>
                      )}
                    </div>
                    {currentCode === code.code && (
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



