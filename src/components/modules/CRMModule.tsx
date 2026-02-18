import { Target, TrendingUp, Users } from 'lucide-react';
import type { Customer } from '../App';

interface CRMModuleProps {
  customers: Customer[];
}

export function CRMModule({ customers }: CRMModuleProps) {
  const opportunities = [
    { id: '1', customer: 'Mohammed Hassan', title: 'Toplu Alım Fırsatı', value: 50000, stage: 'Teklif', probability: 70, closeDate: '2025-12-15' },
    { id: '2', customer: 'Layla Hassan', title: 'Yıllık Anlaşma', value: 120000, stage: 'Müzakere', probability: 85, closeDate: '2025-12-20' },
    { id: '3', customer: 'Ali Al-Obeidi', title: 'Yeni Ürün Tanıtımı', value: 25000, stage: 'Keşif', probability: 40, closeDate: '2026-01-10' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-pink-600 to-pink-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4" />
          <h2 className="text-sm">CRM & Müşteri İlişkileri</h2>
          <span className="text-pink-100 text-[10px] ml-2">• Satış fırsatları ve müşteri aktiviteleri</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">CRM Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Toplam Fırsat</span>
              </div>
              <div className="text-base text-gray-900">{opportunities.length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Potansiyel Gelir</span>
              </div>
              <div className="text-base text-green-600">{opportunities.reduce((s, o) => s + o.value, 0).toLocaleString()} IQD</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">Aktif Müşteri</span>
              </div>
              <div className="text-base text-gray-900">{customers.length}</div>
            </div>
          </div>
        </div>

        {/* Tablo - Minimal */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Satış Fırsatları</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">MÜŞTERİ</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">FIRSAT</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">DEĞER</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">AŞAMA</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">OLASLIK</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700">KAPANIŞ</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map(opp => (
                <tr key={opp.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{opp.customer}</td>
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{opp.title}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] text-green-600 border-r border-gray-200">{opp.value.toLocaleString()} IQD</td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] rounded">{opp.stage}</span>
                  </td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className={`px-2 py-0.5 text-[9px] rounded ${opp.probability >= 70 ? 'bg-green-100 text-green-700' :
                        opp.probability >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                      }`}>
                      %{opp.probability}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-[10px] text-gray-600">{new Date(opp.closeDate).toLocaleDateString('tr-TR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
