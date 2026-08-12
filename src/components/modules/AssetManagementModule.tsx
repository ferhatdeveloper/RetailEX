import { Building, TrendingDown } from 'lucide-react';

export function AssetManagementModule() {
  const assets = [
    { id: 'DMR-001', name: 'Dell Bilgisayar', category: 'Elektronik', purchaseDate: '2023-01-15', cost: 15000, depreciation: 3750, currentValue: 11250, location: 'Muhasebe' },
    { id: 'DMR-002', name: 'Toyota Forklift', category: 'Araç', purchaseDate: '2022-06-10', cost: 250000, depreciation: 75000, currentValue: 175000, location: 'Depo' },
    { id: 'DMR-003', name: 'Ofis Mobilyaları', category: 'Mobilya', purchaseDate: '2023-03-20', cost: 35000, depreciation: 7000, currentValue: 28000, location: 'Ofis' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4" />
          <h2 className="text-sm">Demirbaş & Varlık Yönetimi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Varlık Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Building className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Toplam Varlık</span>
              </div>
              <div className="text-base text-blue-600">{assets.length}</div>
            </div>
            <div className="p-3">
              <span className="text-[10px] text-gray-600">Toplam Değer</span>
            </div>
            <div className="text-base text-green-600">{assets.reduce((s, a) => s + a.currentValue, 0).toLocaleString()}</div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-[10px] text-gray-600">Amortisman</span>
              </div>
              <div className="text-base text-red-600">{assets.reduce((s, a) => s + a.depreciation, 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Varlık Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Demirbaş Listesi</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">KOD</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">VARLIK ADI</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">KATEGORİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ALIŞ TARİHİ</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">MALİYET</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">AMORTİSMAN</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">NET DEĞER</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700">KONUM</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{asset.id}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{asset.name}</td>
                  <td className="px-2 py-0.5 border-r border-gray-200">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] rounded">{asset.category}</span>
                  </td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{new Date(asset.purchaseDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] border-r border-gray-200">{asset.cost.toLocaleString()}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-red-600 border-r border-gray-200">-{asset.depreciation.toLocaleString()}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-green-600 border-r border-gray-200">{asset.currentValue.toLocaleString()}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{asset.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
