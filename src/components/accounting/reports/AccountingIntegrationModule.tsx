/**
 * Accounting Software Integration Module - Muhasebe Programları Entegrasyonu
 * Logo, Mikro, Netsis, SAP entegrasyonları
 */

import { useState } from 'react';
import { Database, CheckCircle, RefreshCw, Download, Upload } from 'lucide-react';

export function AccountingIntegrationModule() {
  const [systems] = useState([
    { id: 'logo', name: 'Logo Tiger', status: 'connected', lastSync: '2 saat önce', records: 1247 },
    { id: 'mikro', name: 'Mikro', status: 'disconnected', lastSync: 'Hiç', records: 0 },
    { id: 'netsis', name: 'Netsis', status: 'disconnected', lastSync: 'Hiç', records: 0 },
    { id: 'sap', name: 'SAP B1', status: 'disconnected', lastSync: 'Hiç', records: 0 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-8 h-8 text-purple-600" />
          Muhasebe Programları Entegrasyonu
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {systems.map(sys => (
          <div key={sys.id} className="bg-white rounded-lg shadow p-6 border-2 border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{sys.name}</h3>
              {sys.status === 'connected' ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Bağlı
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                  Bağlı Değil
                </span>
              )}
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Son Senkronizasyon:</span>
                <span className="font-medium">{sys.lastSync}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Senkronize Kayıt:</span>
                <span className="font-medium">{sys.records}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {sys.status === 'connected' ? (
                <>
                  <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Senkronize Et
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Download className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  Bağlan
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Dikkat</h4>
        <p className="text-sm text-yellow-800">
          Muhasebe programı entegrasyonu için gerekli API anahtarları ve bağlantı bilgileri ayarlanmalıdır.
          Logo Tiger için test bağlantısı aktiftir.
        </p>
      </div>
    </div>
  );
}

