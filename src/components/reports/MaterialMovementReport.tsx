import React, { useState } from 'react';
import { Package, TrendingUp, TrendingDown, ArrowRight, Filter, Calendar } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';

interface Movement {
  id: string;
  date: string;
  productCode: string;
  productName: string;
  type: 'purchase' | 'sale' | 'transfer' | 'adjustment' | 'return';
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  warehouse: string;
  reference: string;
  note?: string;
}

export function MaterialMovementReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementType, setMovementType] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');

  // Demo data
  const movements: Movement[] = [
    {
      id: '1',
      date: '2024-12-24 10:30',
      productCode: 'PRD-001',
      productName: 'Laptop HP EliteBook',
      type: 'purchase',
      quantity: 10,
      unit: 'Adet',
      unitCost: 15000,
      totalCost: 150000,
      warehouse: 'Merkez Depo',
      reference: 'ALI-2024-001'
    },
    {
      id: '2',
      date: '2024-12-24 11:15',
      productCode: 'PRD-001',
      productName: 'Laptop HP EliteBook',
      type: 'sale',
      quantity: -3,
      unit: 'Adet',
      unitCost: 15000,
      totalCost: -45000,
      warehouse: 'Merkez Depo',
      reference: 'SAT-2024-156'
    },
    {
      id: '3',
      date: '2024-12-24 14:20',
      productCode: 'PRD-002',
      productName: 'Mouse Logitech MX',
      type: 'purchase',
      quantity: 50,
      unit: 'Adet',
      unitCost: 800,
      totalCost: 40000,
      warehouse: 'Merkez Depo',
      reference: 'ALI-2024-002'
    },
    {
      id: '4',
      date: '2024-12-24 15:45',
      productCode: 'PRD-001',
      productName: 'Laptop HP EliteBook',
      type: 'transfer',
      quantity: -5,
      unit: 'Adet',
      unitCost: 15000,
      totalCost: -75000,
      warehouse: 'Merkez Depo',
      reference: 'TRF-2024-012',
      note: 'Şube 2\'ye transfer'
    },
    {
      id: '5',
      date: '2024-12-24 16:00',
      productCode: 'PRD-001',
      productName: 'Laptop HP EliteBook',
      type: 'transfer',
      quantity: 5,
      unit: 'Adet',
      unitCost: 15000,
      totalCost: 75000,
      warehouse: 'Şube 2',
      reference: 'TRF-2024-012',
      note: 'Merkez Depo\'dan transfer'
    },
  ];

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase': return 'Alış';
      case 'sale': return 'Satış';
      case 'transfer': return 'Transfer';
      case 'adjustment': return 'Düzeltme';
      case 'return': return 'İade';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'purchase': return 'bg-green-100 text-green-700';
      case 'sale': return 'bg-blue-100 text-blue-700';
      case 'transfer': return 'bg-purple-100 text-purple-700';
      case 'adjustment': return 'bg-yellow-100 text-yellow-700';
      case 'return': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const totalInflow = movements
    .filter(m => m.quantity > 0)
    .reduce((sum, m) => sum + m.totalCost, 0);

  const totalOutflow = movements
    .filter(m => m.quantity < 0)
    .reduce((sum, m) => sum + Math.abs(m.totalCost), 0);

  const netMovement = totalInflow - totalOutflow;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Hareket Tipi
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tümü</option>
              <option value="purchase">Alış</option>
              <option value="sale">Satış</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Düzeltme</option>
              <option value="return">İade</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Package className="w-4 h-4 inline mr-1" />
              Depo
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tüm Depolar</option>
              <option value="merkez">Merkez Depo</option>
              <option value="sube1">Şube 1</option>
              <option value="sube2">Şube 2</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Giriş</p>
              <p className="text-2xl font-bold text-green-600">{formatNumber(totalInflow, 2, false)} IQD</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-red-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Çıkış</p>
              <p className="text-2xl font-bold text-red-600">{formatNumber(totalOutflow, 2, false)} IQD</p>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Hareket</p>
              <p className={`text-2xl font-bold ${netMovement >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatNumber(netMovement, 2, false)} IQD
              </p>
            </div>
            <div className={`${netMovement >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-full p-3`}>
              <ArrowRight className={`w-6 h-6 ${netMovement >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Malzeme Hareketleri
          </h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm">Tarih/Saat</th>
                <th className="px-4 py-3 text-left text-sm">Ürün</th>
                <th className="px-4 py-3 text-left text-sm">Hareket Tipi</th>
                <th className="px-4 py-3 text-right text-sm">Miktar</th>
                <th className="px-4 py-3 text-right text-sm">Birim Maliyet</th>
                <th className="px-4 py-3 text-right text-sm">Toplam</th>
                <th className="px-4 py-3 text-left text-sm">Depo</th>
                <th className="px-4 py-3 text-left text-sm">Referans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{movement.date}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{movement.productName}</p>
                      <p className="text-xs text-gray-500">{movement.productCode}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(movement.type)}`}>
                      {getTypeLabel(movement.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {movement.quantity > 0 ? '+' : ''}{movement.quantity} {movement.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">
                    {formatNumber(movement.unitCost, 2, false)} IQD
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${movement.totalCost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {movement.totalCost > 0 ? '+' : ''}{formatNumber(movement.totalCost, 2, false)} IQD
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{movement.warehouse}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{movement.reference}</p>
                    {movement.note && <p className="text-xs text-gray-500">{movement.note}</p>}
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

