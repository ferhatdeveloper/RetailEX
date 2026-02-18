import { X, CreditCard, Wallet, Banknote, Building2 } from 'lucide-react';
import { useState } from 'react';

interface PaymentMethod {
  code: string;
  name: string;
  icon: typeof CreditCard;
}

const paymentMethods: PaymentMethod[] = [
  { code: 'NAKIT', name: 'Nakit', icon: Banknote },
  { code: 'KREDIKARTI', name: 'Kredi Kartı', icon: CreditCard },
  { code: 'HAVAL', name: 'Havale/EFT', icon: Building2 },
  { code: 'CEK', name: 'Çek', icon: Wallet },
  { code: 'SENET', name: 'Senet', icon: CreditCard },
];

interface InvoicePaymentInfoModalProps {
  currentPaymentMethod: string;
  onSelect: (method: string) => void;
  onClose: () => void;
}

export function InvoicePaymentInfoModal({ currentPaymentMethod, onSelect, onClose }: InvoicePaymentInfoModalProps) {
  const [selectedMethod, setSelectedMethod] = useState(currentPaymentMethod || '');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    // Eğer hiçbir şey seçili değilse, boş string gönder (açık hesap/cari olarak işlem görecek)
    onSelect(selectedMethod || '');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md shadow-2xl rounded-lg">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Ödeme Bilgileri
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ödeme Şekli
            </label>
            <div className="mb-2 text-xs text-gray-500">
              Seçili değilse açık hesap (cari) olarak işlem görür
            </div>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.code}
                    onClick={() => setSelectedMethod(method.code)}
                    className={`px-4 py-3 border-2 rounded-lg text-left transition-all flex items-center gap-2 ${
                      selectedMethod === method.code
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">{method.name}</span>
                    {selectedMethod === method.code && (
                      <div className="ml-auto w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notlar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ödeme ile ilgili notlar..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}


