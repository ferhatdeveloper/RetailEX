/**
 * Gift Card & Voucher Module - Hediye Kartı & Voucher Yönetimi
 */

import { useState } from 'react';
import { Gift, CreditCard, Plus, CheckCircle, XCircle } from 'lucide-react';

export function GiftCardModule() {
  const [cards] = useState([
    { id: 'GC001', code: 'GIFT-2024-1234', balance: 500000, initialBalance: 500000, status: 'active', usedBy: null, createdAt: '2024-12-15' },
    { id: 'GC002', code: 'GIFT-2024-5678', balance: 250000, initialBalance: 300000, status: 'active', usedBy: 'Ahmet Yılmaz', createdAt: '2024-12-10' },
    { id: 'GC003', code: 'GIFT-2024-9012', balance: 0, initialBalance: 200000, status: 'used', usedBy: 'Ayşe Demir', createdAt: '2024-12-05' },
    { id: 'GC004', code: 'GIFT-2024-3456', balance: 1000000, initialBalance: 1000000, status: 'active', usedBy: null, createdAt: '2024-12-18' },
  ]);

  const totalActive = cards.filter(c => c.status === 'active').length;
  const totalBalance = cards.filter(c => c.status === 'active').reduce((sum, c) => sum + c.balance, 0);
  const totalSold = cards.reduce((sum, c) => sum + c.initialBalance, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="w-8 h-8 text-pink-600" />
          Hediye Kartı & Voucher
        </h1>
        <button className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Yeni Kart Oluştur
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-pink-50 rounded-lg p-4">
          <CreditCard className="w-8 h-8 text-pink-600 mb-2" />
          <p className="text-sm text-pink-700">Aktif Kartlar</p>
          <p className="text-2xl font-bold text-pink-900">{totalActive}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Toplam Bakiye</p>
          <p className="text-xl font-bold text-green-900">{(totalBalance / 1000).toFixed(0)}K IQD</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <Gift className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Toplam Satış</p>
          <p className="text-xl font-bold text-blue-900">{(totalSold / 1000).toFixed(0)}K IQD</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <XCircle className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Kullanılan</p>
          <p className="text-2xl font-bold text-purple-900">{cards.filter(c => c.status === 'used').length}</p>
        </div>
      </div>

      {/* Cards List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Hediye Kartı Listesi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kod</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Başlangıç</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kalan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kullanan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards.map(card => (
                <tr key={card.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{card.code}</td>
                  <td className="px-4 py-3">{(card.initialBalance / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-3 font-semibold text-green-600">{(card.balance / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      card.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {card.status === 'active' ? 'Aktif' : 'Kullanıldı'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{card.usedBy || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{card.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

