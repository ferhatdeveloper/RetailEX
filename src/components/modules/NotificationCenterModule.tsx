/**
 * Notification Center Module - Bildirim Merkezi
 */

import { useState } from 'react';
import { Bell, Mail, Smartphone, CheckCircle, AlertCircle, Info } from 'lucide-react';

export function NotificationCenterModule() {
  const [notifications] = useState([
    { id: '1', type: 'success', title: 'Satış Tamamlandı', message: '5 ürün satışı başarıyla tamamlandı', time: '5 dk önce', read: false },
    { id: '2', type: 'warning', title: 'Düşük Stok Uyarısı', message: 'Beyaz T-Shirt stok seviyesi kritik', time: '15 dk önce', read: false },
    { id: '3', type: 'info', title: 'Yeni Kampanya', message: 'Bahar indirimleri başladı', time: '1 saat önce', read: true },
    { id: '4', type: 'error', title: 'Ödeme Hatası', message: 'Kart ödemesi başarısız oldu', time: '2 saat önce', read: true },
    { id: '5', type: 'success', title: 'Stok Girişi', message: '250 ürün depoya giriş yapıldı', time: '3 saat önce', read: true },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch(type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getColor = (type: string) => {
    switch(type) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'error': return 'bg-red-50 border-red-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-8 h-8 text-blue-600" />
          Bildirim Merkezi
          {unreadCount > 0 && (
            <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm">
              {unreadCount} yeni
            </span>
          )}
        </h1>
        <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          Tümünü Okundu İşaretle
        </button>
      </div>

      {/* Notification Channels */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-6 h-6 text-blue-600" />
            <span className="font-semibold">Push Bildirimleri</span>
          </div>
          <p className="text-sm text-gray-600">Anında bildirim al</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" className="rounded" defaultChecked />
            <span className="text-sm">Aktif</span>
          </label>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-2 border-green-200">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="w-6 h-6 text-green-600" />
            <span className="font-semibold">E-posta Bildirimleri</span>
          </div>
          <p className="text-sm text-gray-600">Önemli bildirimleri e-posta ile al</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" className="rounded" defaultChecked />
            <span className="text-sm">Aktif</span>
          </label>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="w-6 h-6 text-purple-600" />
            <span className="font-semibold">SMS Bildirimleri</span>
          </div>
          <p className="text-sm text-gray-600">Kritik durumlarda SMS gönder</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" className="rounded" />
            <span className="text-sm">Pasif</span>
          </label>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Son Bildirimler</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {notifications.map(notif => (
            <div key={notif.id} className={`p-4 ${!notif.read ? 'bg-blue-50' : ''} hover:bg-gray-50 transition-colors`}>
              <div className="flex items-start gap-3">
                {getIcon(notif.type)}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className={`font-semibold ${!notif.read ? 'text-blue-900' : ''}`}>
                      {notif.title}
                    </h3>
                    <span className="text-xs text-gray-500">{notif.time}</span>
                  </div>
                  <p className="text-sm text-gray-600">{notif.message}</p>
                </div>
                {!notif.read && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

