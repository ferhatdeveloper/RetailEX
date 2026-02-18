/**
 * Restaurant & Cafe Management Module - Restoran & Cafe Yönetimi
 */

import { useState } from 'react';
import { UtensilsCrossed, Coffee, Clock, Users } from 'lucide-react';

export function RestaurantModule() {
  const [tables] = useState([
    { id: '1', number: 1, seats: 4, status: 'occupied', orderValue: 125000, duration: 45 },
    { id: '2', number: 2, seats: 2, status: 'available', orderValue: 0, duration: 0 },
    { id: '3', number: 3, seats: 6, status: 'occupied', orderValue: 280000, duration: 25 },
    { id: '4', number: 4, seats: 4, status: 'reserved', orderValue: 0, duration: 0 },
    { id: '5', number: 5, seats: 2, status: 'available', orderValue: 0, duration: 0 },
    { id: '6', number: 6, seats: 8, status: 'occupied', orderValue: 450000, duration: 60 },
  ]);

  const occupied = tables.filter(t => t.status === 'occupied').length;
  const totalRevenue = tables.reduce((sum, t) => sum + t.orderValue, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UtensilsCrossed className="w-8 h-8 text-orange-600" />
          Restoran & Cafe Yönetimi
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-lg p-4">
          <Users className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Dolu Masalar</p>
          <p className="text-2xl font-bold text-green-900">{occupied}/{tables.length}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <Coffee className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Aktif Siparişler</p>
          <p className="text-2xl font-bold text-blue-900">{occupied}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <Clock className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Ortalama Süre</p>
          <p className="text-2xl font-bold text-purple-900">43 dk</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <UtensilsCrossed className="w-8 h-8 text-yellow-600 mb-2" />
          <p className="text-sm text-yellow-700">Günlük Ciro</p>
          <p className="text-xl font-bold text-yellow-900">{(totalRevenue / 1000).toFixed(0)}K</p>
        </div>
      </div>

      {/* Tables Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Masa Durumu</h2>
        <div className="grid grid-cols-6 gap-4">
          {tables.map(table => {
            const colors = {
              available: 'bg-green-100 border-green-300 text-green-900',
              occupied: 'bg-red-100 border-red-300 text-red-900',
              reserved: 'bg-yellow-100 border-yellow-300 text-yellow-900',
            };

            return (
              <div
                key={table.id}
                className={`${colors[table.status]} border-2 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all`}
              >
                <div className="text-center mb-2">
                  <p className="text-2xl font-bold">Masa {table.number}</p>
                  <p className="text-sm">{table.seats} kişilik</p>
                </div>
                {table.status === 'occupied' && (
                  <div className="mt-3 pt-3 border-t border-red-200 text-sm">
                    <p className="font-semibold">{(table.orderValue / 1000).toFixed(0)}K IQD</p>
                    <p className="text-xs">{table.duration} dakika</p>
                  </div>
                )}
                {table.status === 'available' && (
                  <div className="mt-3 pt-3 border-t border-green-200 text-center">
                    <p className="text-xs font-semibold">Müsait</p>
                  </div>
                )}
                {table.status === 'reserved' && (
                  <div className="mt-3 pt-3 border-t border-yellow-200 text-center">
                    <p className="text-xs font-semibold">Rezerve</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

