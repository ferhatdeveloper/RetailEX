/**
 * Payment Systems Integration Module - Ödeme Sistemleri Entegrasyonu
 * İyzico, PayTR, Sanal POS entegrasyonları
 */

import { useState } from 'react';
import { CreditCard, CheckCircle, XCircle, Settings, TrendingUp } from 'lucide-react';

interface PaymentProvider {
  id: string;
  name: string;
  logo: string;
  status: 'active' | 'inactive';
  totalTransactions: number;
  totalAmount: number;
  commission: number;
}

export function PaymentSystemsModule() {
  const [providers] = useState<PaymentProvider[]>([
    { id: 'iyzico', name: 'İyzico', logo: 'ğŸ’³', status: 'active', totalTransactions: 1250, totalAmount: 45680000, commission: 2.5 },
    { id: 'paytr', name: 'PayTR', logo: '💰', status: 'active', totalTransactions: 890, totalAmount: 32150000, commission: 2.8 },
    { id: 'stripe', name: 'Stripe', logo: 'ğŸŒ', status: 'inactive', totalTransactions: 0, totalAmount: 0, commission: 2.9 },
    { id: 'payu', name: 'PayU', logo: 'ğŸ¦', status: 'inactive', totalTransactions: 0, totalAmount: 0, commission: 3.0 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="w-8 h-8 text-blue-600" />
          Ödeme Sistemleri Entegrasyonu
        </h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          + Yeni Entegrasyon
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map(provider => (
          <div key={provider.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{provider.logo}</span>
                <span className="font-semibold">{provider.name}</span>
              </div>
              {provider.status === 'active' ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">İşlem:</span>
                <span className="font-semibold">{provider.totalTransactions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tutar:</span>
                <span className="font-semibold text-green-600">{(provider.totalAmount / 1000).toFixed(0)}K</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Komisyon:</span>
                <span className="font-semibold">%{provider.commission}</span>
              </div>
            </div>
            <button className="w-full mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
              <Settings className="w-4 h-4" />
              Ayarlar
            </button>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Bu Ay Özeti
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Toplam İşlem</p>
            <p className="text-2xl font-bold text-blue-900">2,140</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Toplam Ciro</p>
            <p className="text-2xl font-bold text-green-900">77.83M IQD</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Toplam Komisyon</p>
            <p className="text-2xl font-bold text-red-900">1.95M IQD</p>
          </div>
        </div>
      </div>
    </div>
  );
}

