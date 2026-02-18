import React from 'react';
import { Truck, Package, MapPin } from 'lucide-react';

export function LogisticsModule() {
  const shipments = [
    { id: 'SHIP-001', order: 'SO-2025001', carrier: 'Aras Kargo', tracking: 'ARK123456789', destination: 'İstanbul', status: 'Yolda', date: '2025-12-04' },
    { id: 'SHIP-002', order: 'SO-2025002', carrier: 'Yurtiçi Kargo', tracking: 'YRT987654321', destination: 'Ankara', status: 'Hazırlanıyor', date: '2025-12-04' },
    { id: 'SHIP-003', order: 'SO-2025003', carrier: 'MNG Kargo', tracking: 'MNG555666777', destination: 'İzmir', status: 'Teslim Edildi', date: '2025-12-03' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-lime-600 to-lime-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4" />
          <h2 className="text-sm">Lojistik & Sevkiyat</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Sevkiyat Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Hazırlanan</span>
              </div>
              <div className="text-base text-blue-600">{shipments.filter(s => s.status === 'Hazırlanıyor').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">Yolda</span>
              </div>
              <div className="text-base text-orange-600">{shipments.filter(s => s.status === 'Yolda').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Teslim Edildi</span>
              </div>
              <div className="text-base text-green-600">{shipments.filter(s => s.status === 'Teslim Edildi').length}</div>
            </div>
          </div>
        </div>

        {/* Sevkiyat Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Sevkiyat Takibi</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">SEVKİYAT NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">SİPARİŞ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">KARGO FİRMASI</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">TAKİP NO</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">HEDEF</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">DURUM</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(ship => (
                <tr key={ship.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{ship.id}</td>
                  <td className="px-2 py-0.5 font-mono text-[10px] border-r border-gray-200">{ship.order}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ship.carrier}</td>
                  <td className="px-2 py-0.5 font-mono text-[10px] text-blue-600 border-r border-gray-200">{ship.tracking}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{ship.destination}</td>
                  <td className="px-2 py-0.5 text-center">
                    <span className={`px-2 py-0.5 text-[9px] rounded ${
                      ship.status === 'Teslim Edildi' ? 'bg-green-100 text-green-700' :
                      ship.status === 'Yolda' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {ship.status}
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
