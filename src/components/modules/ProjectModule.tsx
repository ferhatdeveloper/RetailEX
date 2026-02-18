import { Briefcase, Calendar, Users } from 'lucide-react';

export function ProjectModule() {
  const projects = [
    { id: 'PRJ-2025-001', name: 'E-Ticaret Entegrasyonu', client: 'Mehmet Yılmaz A.Ş.', startDate: '2025-01-15', endDate: '2025-03-31', budget: 150000, spent: 85000, progress: 60, status: 'Devam Ediyor', team: 5 },
    { id: 'PRJ-2025-002', name: 'Mağaza Yenileme', client: 'Ayşe Demir Ltd.', startDate: '2025-02-01', endDate: '2025-04-30', budget: 250000, spent: 120000, progress: 45, status: 'Devam Ediyor', team: 8 },
    { id: 'PRJ-2024-015', name: 'Stok Sistemİ Kurulumu', client: 'Ali Kaya', startDate: '2024-11-01', endDate: '2024-12-31', budget: 80000, spent: 80000, progress: 100, status: 'Tamamlandı', team: 3 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          <h2 className="text-sm">Proje Yönetimi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Proje Özeti</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Aktif Proje</span>
              </div>
              <div className="text-base text-blue-600">{projects.filter(p => p.status === 'Devam Ediyor').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Tamamlanan</span>
              </div>
              <div className="text-base text-green-600">{projects.filter(p => p.status === 'Tamamlandı').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">Toplam Bütçe</span>
              </div>
              <div className="text-base text-purple-600">{projects.reduce((s, p) => s + p.budget, 0).toLocaleString()} TL</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">Ekip Üyesi</span>
              </div>
              <div className="text-base text-orange-600">{projects.reduce((s, p) => s + p.team, 0)}</div>
            </div>
          </div>
        </div>

        {/* Proje Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Proje Listesi</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">PROJE NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">PROJE ADI</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜŞTERİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">BAŞLANGIÇ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">BİTİŞ</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">BÜTÇE</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">HARCANAN</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">İLERLEME</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">DURUM</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(project => (
                <tr key={project.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{project.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{project.name}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{project.client}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(project.startDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(project.endDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] border-r border-gray-200">{project.budget.toLocaleString()} TL</td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-orange-600 border-r border-gray-200">{project.spent.toLocaleString()} TL</td>
                  <td className="px-2 py-0.5 border-r border-gray-200">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${project.progress}%` }}></div>
                      </div>
                      <span className="text-[9px] text-gray-600 w-8">{project.progress}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      project.status === 'Tamamlandı' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {project.status}
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
