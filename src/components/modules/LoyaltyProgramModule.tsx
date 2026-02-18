/**
 * Loyalty Program Module - Sadakat Programı
 * Müşteri puanları, seviyeler, ödüller
 */

import { useState } from 'react';
import { Award, Gift, TrendingUp, Users, Star } from 'lucide-react';

export function LoyaltyProgramModule() {
  const [tiers] = useState([
    { id: '1', name: 'Bronz', minPoints: 0, maxPoints: 999, members: 1245, color: 'bg-orange-100 text-orange-700', discount: 5 },
    { id: '2', name: 'Gümüş', minPoints: 1000, maxPoints: 2999, members: 456, color: 'bg-gray-100 text-gray-700', discount: 10 },
    { id: '3', name: 'Altın', minPoints: 3000, maxPoints: 9999, members: 128, color: 'bg-yellow-100 text-yellow-700', discount: 15 },
    { id: '4', name: 'Platin', minPoints: 10000, maxPoints: 999999, members: 34, color: 'bg-purple-100 text-purple-700', discount: 20 },
  ]);

  const [rewards] = useState([
    { id: '1', name: '50.000 IQD İndirim Kuponu', points: 500, claimed: 89 },
    { id: '2', name: '100.000 IQD İndirim Kuponu', points: 1000, claimed: 45 },
    { id: '3', name: 'Ücretsiz Kargo', points: 250, claimed: 156 },
    { id: '4', name: 'Ücretsiz Ürün', points: 2000, claimed: 12 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-8 h-8 text-yellow-600" />
          Sadakat Programı
        </h1>
        <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
          + Yeni Ödül Ekle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <Users className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Toplam Üye</p>
          <p className="text-2xl font-bold text-blue-900">1,863</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
          <Star className="w-8 h-8 text-yellow-600 mb-2" />
          <p className="text-sm text-yellow-700">Toplam Puan</p>
          <p className="text-2xl font-bold text-yellow-900">4.2M</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <Gift className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Kullanılan Ödül</p>
          <p className="text-2xl font-bold text-green-900">302</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <TrendingUp className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Bu Ay Puan</p>
          <p className="text-2xl font-bold text-purple-900">156K</p>
        </div>
      </div>

      {/* Tiers */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Üyelik Seviyeleri</h2>
        <div className="grid grid-cols-4 gap-4">
          {tiers.map(tier => (
            <div key={tier.id} className={`${tier.color} rounded-lg p-4`}>
              <h3 className="font-bold text-lg mb-2">{tier.name}</h3>
              <div className="space-y-1 text-sm">
                <p>{tier.minPoints.toLocaleString()} - {tier.maxPoints.toLocaleString()} puan</p>
                <p className="font-semibold">{tier.members.toLocaleString()} üye</p>
                <p className="text-xs">%{tier.discount} indirim hakkı</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Ödüller</h2>
        <div className="grid grid-cols-2 gap-4">
          {rewards.map(reward => (
            <div key={reward.id} className="bg-white rounded-lg shadow p-4 border-2 border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{reward.name}</h3>
                <Gift className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">{reward.points} puan</span>
                <span className="text-green-600 font-semibold">{reward.claimed} kez kullanıldı</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

