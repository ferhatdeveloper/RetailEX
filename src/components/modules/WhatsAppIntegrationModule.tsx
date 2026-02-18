/**
 * WhatsApp Integration Module - WhatsApp Business API Entegrasyonu
 */

import { useState } from 'react';
import { Phone, Send, MessageSquare, Users, CheckCheck } from 'lucide-react';

export function WhatsAppIntegrationModule() {
  const [templates] = useState([
    { id: '1', name: 'Sipariş Onayı', status: 'approved', sent: 1245, delivered: 1198 },
    { id: '2', name: 'Kargo Bilgilendirme', status: 'approved', sent: 987, delivered: 945 },
    { id: '3', name: 'Kampanya Bildirimi', status: 'pending', sent: 0, delivered: 0 },
    { id: '4', name: 'Ödeme Hatırlatma', status: 'approved', sent: 456, delivered: 432 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Phone className="w-8 h-8 text-green-600" />
          WhatsApp Business Entegrasyonu
        </h1>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1">
            <CheckCheck className="w-4 h-4" />
            Bağlı
          </span>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            + Yeni Şablon
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-lg p-4">
          <Send className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Toplam Gönderim</p>
          <p className="text-2xl font-bold text-green-900">2,688</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <CheckCheck className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Teslim Edildi</p>
          <p className="text-2xl font-bold text-blue-900">2,575</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <MessageSquare className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Aktif Şablon</p>
          <p className="text-2xl font-bold text-purple-900">3</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <Users className="w-8 h-8 text-yellow-600 mb-2" />
          <p className="text-sm text-yellow-700">Teslim Oranı</p>
          <p className="text-2xl font-bold text-yellow-900">95.8%</p>
        </div>
      </div>

      {/* Templates */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Mesaj Şablonları</h2>
        </div>
        <div className="p-4 space-y-3">
          {templates.map(template => (
            <div key={template.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    template.status === 'approved' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {template.status === 'approved' ? 'Onaylı' : 'Beklemede'}
                  </span>
                </div>
                <div className="flex gap-4 text-sm text-gray-600">
                  <span>Gönderildi: {template.sent}</span>
                  <span>Teslim: {template.delivered}</span>
                  {template.sent > 0 && (
                    <span className="text-green-600">
                      Oran: %{((template.delivered / template.sent) * 100).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  Gönder
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                  Düzenle
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">ğŸ’¡ WhatsApp Business API</h4>
        <p className="text-sm text-blue-800">
          WhatsApp Business API entegrasyonu ile müşterilerinize sipariş onayı, kargo takibi, 
          kampanya bildirimleri ve daha fazlasını otomatik olarak gönderebilirsiniz.
        </p>
      </div>
    </div>
  );
}

