/**
 * Inter-Store Transfers View - Mağazalar Arası Transfer Görünümü
 */

import { Store, ArrowRightLeft, Package, TrendingUp } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';

export function InterStoreTransfersView() {
  const { darkMode } = useTheme();
  const stores = [
    { id: '1', name: 'Merkez Mağaza', sent: 45, received: 28, balance: 17 },
    { id: '2', name: 'Şube 1', sent: 12, received: 34, balance: -22 },
    { id: '3', name: 'Şube 2', sent: 28, received: 19, balance: 9 },
    { id: '4', name: 'Şube 3', sent: 8, received: 22, balance: -14 },
  ];

  return (
    <div className={`p-6 space-y-6 min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <Store className="w-8 h-8 text-blue-600" />
          Mağazalar Arası Transfer Özeti
        </h1>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
          <ArrowRightLeft className="w-8 h-8 text-blue-600 mb-2" />
          <p className={`text-sm ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>Toplam Transfer</p>
          <p className={`text-2xl ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>93</p>
        </div>
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
          <Package className="w-8 h-8 text-green-600 mb-2" />
          <p className={`text-sm ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Transfer Edilen Ürün</p>
          <p className={`text-2xl ${darkMode ? 'text-green-300' : 'text-green-900'}`}>847</p>
        </div>
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
          <Store className="w-8 h-8 text-purple-600 mb-2" />
          <p className={`text-sm ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>Aktif Mağaza</p>
          <p className={`text-2xl ${darkMode ? 'text-purple-300' : 'text-purple-900'}`}>4</p>
        </div>
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}>
          <TrendingUp className="w-8 h-8 text-yellow-600 mb-2" />
          <p className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>Bu Ay</p>
          <p className={`text-2xl ${darkMode ? 'text-yellow-300' : 'text-yellow-900'}`}>+18%</p>
        </div>
      </div>

      <div className={`rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={darkMode ? 'text-white' : 'text-gray-900'}>Mağaza Transfer İstatistikleri</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`border-b ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Mağaza</th>
                <th className={`px-4 py-3 text-right text-xs uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Gönderilen</th>
                <th className={`px-4 py-3 text-right text-xs uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Alınan</th>
                <th className={`px-4 py-3 text-right text-xs uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Net Transfer</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
              {stores.map(store => (
                <tr key={store.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                  <td className={`px-4 py-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{store.name}</td>
                  <td className="px-4 py-3 text-right text-red-600">{store.sent}</td>
                  <td className="px-4 py-3 text-right text-green-600">{store.received}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={store.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {store.balance >= 0 ? '+' : ''}{store.balance}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default InterStoreTransfersView;
