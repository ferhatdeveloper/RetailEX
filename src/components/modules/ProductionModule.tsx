import { Briefcase, GitBranch } from 'lucide-react';

export function ProductionModule() {
  const orders = [
    { id: 'UR-2025-0001', product: 'Özel Paket A', quantity: 100, status: 'Üretimde', startDate: '2025-12-01', endDate: '2025-12-10', progress: 65 },
    { id: 'UR-2025-0002', product: 'Karma Ürün B', quantity: 50, status: 'Beklemede', startDate: '2025-12-05', endDate: '2025-12-15', progress: 0 },
    { id: 'UR-2025-0003', product: 'Montaj C', quantity: 200, status: 'Tamamlandı', startDate: '2025-11-20', endDate: '2025-11-30', progress: 100 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          <h2 className="text-sm">Üretim Yönetimi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Üretim Emir Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Aktif Emir</span>
              </div>
              <div className="text-base text-blue-600">{orders.filter(o => o.status === 'Üretimde').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Tamamlanan</span>
              </div>
              <div className="text-base text-green-600">{orders.filter(o => o.status === 'Tamamlandı').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-4 h-4 text-yellow-600" />
                <span className="text-[10px] text-gray-600">Bekleyen</span>
              </div>
              <div className="text-base text-yellow-600">{orders.filter(o => o.status === 'Beklemede').length}</div>
            </div>
          </div>
        </div>

        {/* Üretim Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Üretim Emirleri</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">EMİR NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ÜRÜN</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">MİKTAR</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">BAŞLANGIÇ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">BİTİŞ</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">İLERLEME</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">DURUM</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{order.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{order.product}</td>
                  <td className="px-2 py-0.5 text-center text-[10px] border-r border-gray-200">{order.quantity}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(order.startDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(order.endDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 border-r border-gray-200">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${order.progress}%` }}></div>
                      </div>
                      <span className="text-[9px] text-gray-600 w-8">{order.progress}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      order.status === 'Tamamlandı' ? 'bg-green-100 text-green-700' :
                      order.status === 'Üretimde' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {order.status}
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
