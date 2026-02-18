import { Wrench, Clock, CheckCircle } from 'lucide-react';

export function ServiceModule() {
  const tickets = [
    { id: 'SER-2025-001', customer: 'Mehmet Yılmaz', product: 'Dell Bilgisayar', issue: 'Ekran Sorunu', date: '2025-12-04', status: 'Devam Ediyor', priority: 'Yüksek', technician: 'Ali Teknik' },
    { id: 'SER-2025-002', customer: 'Ayşe Demir', product: 'HP Yazıcı', issue: 'Kağıt Sıkışması', date: '2025-12-03', status: 'Tamamlandı', priority: 'Orta', technician: 'Mehmet Servis' },
    { id: 'SER-2025-003', customer: 'Can Öztürk', product: 'Samsung Telefon', issue: 'Batarya Değişimi', date: '2025-12-02', status: 'Beklemede', priority: 'Düşük', technician: '-' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          <h2 className="text-sm">Servis & Bakım Yönetimi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Servis Talep Özeti</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Devam Ediyor</span>
              </div>
              <div className="text-base text-blue-600">{tickets.filter(t => t.status === 'Devam Ediyor').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="w-4 h-4 text-yellow-600" />
                <span className="text-[10px] text-gray-600">Beklemede</span>
              </div>
              <div className="text-base text-yellow-600">{tickets.filter(t => t.status === 'Beklemede').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Tamamlandı</span>
              </div>
              <div className="text-base text-green-600">{tickets.filter(t => t.status === 'Tamamlandı').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">Toplam Talep</span>
              </div>
              <div className="text-base text-purple-600">{tickets.length}</div>
            </div>
          </div>
        </div>

        {/* Servis Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Servis Talepleri</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">SERVİS NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜŞTERİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ÜRÜN</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">SORUN</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TARİH</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">ÖNCELİK</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TEKNİSYEN</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">DURUM</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{ticket.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ticket.customer}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ticket.product}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ticket.issue}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(ticket.date).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      ticket.priority === 'Yüksek' ? 'bg-red-100 text-red-700' :
                      ticket.priority === 'Orta' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ticket.technician}</td>
                  <td className="px-2 py-0.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      ticket.status === 'Tamamlandı' ? 'bg-green-100 text-green-700' :
                      ticket.status === 'Devam Ediyor' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {ticket.status}
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
