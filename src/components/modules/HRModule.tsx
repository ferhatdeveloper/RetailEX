import { UserCog, Users, Banknote } from 'lucide-react';

export function HRModule() {
  const employees = [
    { id: '1', name: 'Ahmed Al-Maliki', position: 'Mağaza Müdürü', department: 'Yönetim', salary: 25000, startDate: '2020-01-15' },
    { id: '2', name: 'Hussein Al-Najjar', position: 'Kasiyer', department: 'Satış', salary: 15000, startDate: '2021-06-01' },
    { id: '3', name: 'Layla Hassan', position: 'Stok Sorumlusu', department: 'Lojistik', salary: 18000, startDate: '2022-03-10' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <UserCog className="w-4 h-4" />
          <h2 className="text-sm">İnsan Kaynakları</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Personel Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Toplam Personel</span>
              </div>
              <div className="text-base text-gray-900">{employees.length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Aylık Bordro</span>
              </div>
              <div className="text-base text-green-600">{employees.reduce((s, e) => s + e.salary, 0).toLocaleString()}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <UserCog className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">Departman Sayısı</span>
              </div>
              <div className="text-base text-purple-600">{new Set(employees.map(e => e.department)).size}</div>
            </div>
          </div>
        </div>

        {/* Personel Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Personel Listesi</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">AD SOYAD</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">POZİSYON</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">DEPARTMAN</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">MAAŞ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700">İŞE BAŞLAMA</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{emp.name}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{emp.position}</td>
                  <td className="px-2 py-0.5 border-r border-gray-200">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] rounded">{emp.department}</span>
                  </td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-green-600 border-r border-gray-200">{emp.salary.toLocaleString()}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600">{new Date(emp.startDate).toLocaleDateString('tr-TR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
