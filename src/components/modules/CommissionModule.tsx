/**
 * Commission Management Module - Komisyon Yönetimi
 */

import { useState } from 'react';
import { Percent, Users, TrendingUp, DollarSign } from 'lucide-react';

export function CommissionModule() {
  const [employees] = useState([
    { id: '1', name: 'Sara Ahmad', role: 'Kasiyer', sales: 45680000, commission: 1141000, rate: 2.5 },
    { id: '2', name: 'Layla Ibrahim', role: 'Kasiyer', sales: 38920000, commission: 973000, rate: 2.5 },
    { id: '3', name: 'Zainab Karim', role: 'Kasiyer', sales: 52340000, commission: 1309000, rate: 2.5 },
    { id: '4', name: 'Omar Abdullah', role: 'Satış Danışmanı', sales: 67800000, commission: 2034000, rate: 3.0 },
  ]);

  const totalSales = employees.reduce((sum, e) => sum + e.sales, 0);
  const totalCommission = employees.reduce((sum, e) => sum + e.commission, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Percent className="w-8 h-8 text-green-600" />
          Komisyon Yönetimi
        </h1>
        <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          Komisyon Hesapla
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <Users className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Çalışan Sayısı</p>
          <p className="text-2xl font-bold text-blue-900">{employees.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <DollarSign className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Toplam Satış</p>
          <p className="text-xl font-bold text-green-900">{(totalSales / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <Percent className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Toplam Komisyon</p>
          <p className="text-xl font-bold text-purple-900">{(totalCommission / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <TrendingUp className="w-8 h-8 text-yellow-600 mb-2" />
          <p className="text-sm text-yellow-700">Ortalama Oran</p>
          <p className="text-2xl font-bold text-yellow-900">%2.7</p>
        </div>
      </div>

      {/* Employee Commissions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Çalışan Komisyonları (Bu Ay)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Çalışan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Satış Tutarı</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Komisyon Oranı</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Komisyon Tutarı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.role}</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">
                    {(emp.sales / 1000).toFixed(0)}K IQD
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-semibold">
                      %{emp.rate}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-600 text-lg">
                    {(emp.commission / 1000).toFixed(0)}K IQD
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-bold">TOPLAM</td>
                <td className="px-4 py-3 text-right font-bold text-blue-900">
                  {(totalSales / 1000000).toFixed(2)}M IQD
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right font-bold text-green-900 text-lg">
                  {(totalCommission / 1000).toFixed(0)}K IQD
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-green-900 mb-2">ğŸ’¡ Komisyon Hesaplama</h4>
        <p className="text-sm text-green-800">
          Komisyonlar her ay otomatik hesaplanır ve personel performansına göre farklı oranlar uygulanabilir.
        </p>
      </div>
    </div>
  );
}

