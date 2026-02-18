/**
 * WMS Goods Receiving - Mal Kabul İşlemleri
 * Tedarikçi seçimi, siparişe göre kabul, kalite kontrol, barkod okuma
 */

import { useState } from 'react';
import { Package, Search, Barcode, CheckCircle, X, Plus, Save } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { WMSLayout } from './WMSLayout';

interface WMSGoodsReceivingProps {
  onBack?: () => void;
}

export function WMSGoodsReceiving({ onBack }: WMSGoodsReceivingProps) {
  const { darkMode } = useTheme();
  const { currentLanguage } = useLanguage();
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [receivingType, setReceivingType] = useState<'order' | 'free'>('order');
  const [items, setItems] = useState<any[]>([]);

  return (
    <WMSLayout onBack={onBack}>
      <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`max-w-7xl mx-auto ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-6`}>
          <div className="flex items-center gap-3 mb-6">
            <Package className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Mal Kabul İşlemleri
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Goods Receiving Operations
              </p>
            </div>
          </div>

          {/* Supplier Selection */}
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Tedarikçi Seçimi
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tedarikçi ara..."
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`}
                />
              </div>
              <select
                value={receivingType}
                onChange={(e) => setReceivingType(e.target.value as 'order' | 'free')}
                className={`px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                }`}
              >
                <option value="order">Siparişe Göre</option>
                <option value="free">Serbest Kabul</option>
              </select>
            </div>
          </div>

          {/* Barcode Scanner */}
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Barkod Okuma
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Barcode className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Barkod okutun..."
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                  }`}
                  autoFocus
                />
              </div>
              <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Ekle
              </button>
            </div>
          </div>

          {/* Items List */}
          <div className={`rounded-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
              <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Kabul Edilecek Ürünler
              </h3>
            </div>
            <div className="p-4">
              {items.length === 0 ? (
                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Henüz ürün eklenmedi</p>
                  <p className="text-sm mt-2">Barkod okutarak ürün ekleyin</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Items will be listed here */}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50">
              İptal
            </button>
            <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">
              <Save className="w-5 h-5" />
              Kaydet ve Onayla
            </button>
          </div>
        </div>
      </div>
    </WMSLayout>
  );
}


