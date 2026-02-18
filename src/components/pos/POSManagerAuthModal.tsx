import { X, Shield } from 'lucide-react';
import { useState } from 'react';

interface POSManagerAuthModalProps {
  onClose: () => void;
  onAuthorized: () => void;
}

export function POSManagerAuthModal({ onClose, onAuthorized }: POSManagerAuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleNumberClick = (num: string) => {
    setPassword(prev => prev + num);
    setError('');
  };

  const handleDelete = () => {
    setPassword(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPassword('');
    setError('');
  };

  const handleSubmit = () => {
    // Basit şifre kontrolü - gerçek uygulamada API ile kontrol edilmeli
    if (password === '1234' || password === 'admin') {
      onAuthorized();
    } else {
      setError('Hatalı şifre!');
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-between">
          <h3 className="text-base text-white flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Yönetici Onayı Gerekli
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/10 p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-orange-50 border border-orange-200 p-3 mb-4">
            <p className="text-sm text-orange-800">
              Bu işlem için yönetici yetkisi gerekiyor. Lütfen yönetici şifresini girin.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-2">Yönetici Şifresi:</label>
            <input
              type="password"
              value={password}
              readOnly
              placeholder="Şifre girin..."
              className="w-full px-3 py-3 text-center text-lg border border-gray-300 focus:outline-none focus:border-blue-600 bg-blue-50"
            />
          </div>

          {/* NumPad */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleNumberClick(num.toString())}
                className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 py-4 text-lg transition-colors"
                type="button"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 py-4 text-sm transition-colors"
              type="button"
            >
              Temizle
            </button>
            <button
              onClick={() => handleNumberClick('0')}
              className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 py-4 text-lg transition-colors"
              type="button"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 py-4 text-sm transition-colors"
              type="button"
            >
              ←
            </button>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={password.length === 0}
              className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Onayla
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-500 text-center">
            Varsayılan şifre: 1234
          </div>
        </div>
      </div>
    </div>
  );
}
