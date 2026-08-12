import { FileSpreadsheet, TrendingUp, TrendingDown } from 'lucide-react';
import { formatNumber } from '../../../utils/formatNumber';

export function AccountingModule() {
  const accounts = [
    { code: '100', name: 'Kasa', balance: 45000, type: 'Aktif' },
    { code: '102', name: 'Bankalar', balance: 125000, type: 'Aktif' },
    { code: '120', name: 'Alıcılar', balance: 85000, type: 'Aktif' },
    { code: '320', name: 'Satıcılar', balance: -65000, type: 'Pasif' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          <h2 className="text-sm">Muhasebe & Mali İşlemler</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Finansal Durum Özeti</h3>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            <div className="p-3">
              <span className="text-[10px] text-gray-600">Toplam Alacak</span>
              <div className="text-base text-green-600">255,000</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-[10px] text-gray-600">Toplam Borç</span>
              </div>
              <div className="text-base text-red-600">65,000</div>
            </div>
          </div>
        </div>

        {/* Hesap Planı Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Hesap Planı</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">HESAP KODU</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">HESAP ADI</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TİP</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700">BAKİYE</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(account => (
                <tr key={account.code} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{account.code}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{account.name}</td>
                  <td className="px-2 py-0.5 border-r border-gray-200">
                    <span className={`px-2 py-0.5 text-[9px] rounded ${account.type === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {account.type}
                    </span>
                  </td>
                  <td className={`px-2 py-0.5 text-right text-[10px] ${account.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatNumber(Math.abs(account.balance), 0, false)}
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
