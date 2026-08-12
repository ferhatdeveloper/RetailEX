import { Award, CheckCircle } from 'lucide-react';

export function QualityModule() {
  const inspections = [
    { id: 'KK-2025-001', product: 'Süt Ürünleri', batch: 'LOT-12345', date: '2025-12-04', inspector: 'Ahmet Yılmaz', result: 'Geçti', score: 98 },
    { id: 'KK-2025-002', product: 'Fırın Ürünleri', batch: 'LOT-12346', date: '2025-12-03', inspector: 'Mehmet Kaya', result: 'Geçti', score: 95 },
    { id: 'KK-2025-003', product: 'Sebze-Meyve', batch: 'LOT-12347', date: '2025-12-02', inspector: 'Ayşe Demir', result: 'Kaldı', score: 65 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4" />
          <h2 className="text-sm">Kalite Kontrol</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Kalite Test Özeti</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Geçti</span>
              </div>
              <div className="text-base text-green-600">{inspections.filter(i => i.result === 'Geçti').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-red-600" />
                <span className="text-[10px] text-gray-600">Kaldı</span>
              </div>
              <div className="text-base text-red-600">{inspections.filter(i => i.result === 'Kaldı').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Ortalama Skor</span>
              </div>
              <div className="text-base text-blue-600">
                {(inspections.reduce((s, i) => s + i.score, 0) / inspections.length).toFixed(0)}
              </div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">Toplam Test</span>
              </div>
              <div className="text-base text-purple-600">{inspections.length}</div>
            </div>
          </div>
        </div>

        {/* Kalite Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Kalite Test Kayıtları</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TEST NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ÜRÜN</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">PARTİ NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TARİH</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜFETTİŞ</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">SKOR</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">SONUÇ</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map(insp => (
                <tr key={insp.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{insp.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{insp.product}</td>
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{insp.batch}</td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(insp.date).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{insp.inspector}</td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      insp.score >= 90 ? 'bg-green-100 text-green-700' :
                      insp.score >= 70 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {insp.score}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      insp.result === 'Geçti' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {insp.result}
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
