// System Management Module - All System Settings Modules

import { useState } from 'react';
import {
  Settings, Users, Shield, Database, Radio, HardDrive,
  Activity, Bell, Key, FileText, Cpu, Network, AlertCircle, Download,
  Upload, CheckCircle, Clock, User, Lock, Trash2, Edit, Plus, Save, X
} from 'lucide-react';

type SystemView =
  | 'userManagement'
  | 'roleAuthorization'
  | 'definitionsParameters'
  | 'dataBroadcast'
  | 'backupRestore'
  | 'logAudit'
  | 'systemHealth';

export function SystemManagementModule() {
  const [currentView, setCurrentView] = useState<SystemView>('userManagement');

  const menuItems = [
    { id: 'userManagement' as const, label: 'Kullanıcı Yönetimi', icon: Users, color: 'blue' },
    { id: 'roleAuthorization' as const, label: 'Rol & Yetkilendirme', icon: Shield, color: 'purple' },
    { id: 'definitionsParameters' as const, label: 'Tanımlar/Parametreler', icon: Settings, color: 'green' },
    { id: 'dataBroadcast' as const, label: 'Bilgi Gönder/AI Merkezi', icon: Radio, color: 'orange' },
    { id: 'backupRestore' as const, label: 'Yedekleme/Geri Yükleme', icon: HardDrive, color: 'indigo' },
    { id: 'logAudit' as const, label: 'Log/Denetim', icon: FileText, color: 'red' },
    { id: 'systemHealth' as const, label: 'Sistem Sağlığı', icon: Activity, color: 'teal' },
  ];

  return (
    <div className="h-full flex bg-gray-50">
      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {currentView === 'userManagement' && <UserManagementView />}
        {currentView === 'roleAuthorization' && <RoleAuthorizationView />}
        {currentView === 'definitionsParameters' && <DefinitionsParametersView />}
        {currentView === 'dataBroadcast' && <DataBroadcastView />}
        {currentView === 'backupRestore' && <BackupRestoreView />}
        {currentView === 'logAudit' && <LogAuditView />}
        {currentView === 'systemHealth' && <SystemHealthView />}
      </div>
    </div>
  );
}

// User Management View
function UserManagementView() {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const users = [
    { id: 1, username: 'ahmed.maliki', fullName: 'Ahmed Al-Maliki', email: 'ahmed@exretailos.iq', role: 'Yönetici', store: 'Baghdad Merkez', status: 'Aktif', lastLogin: '2025-01-18 14:30' },
    { id: 2, username: 'mohammed.hassan', fullName: 'Mohammed Hassan', email: 'mohammed@exretailos.iq', role: 'Mağaza Müdürü', store: 'Erbil Merkez', status: 'Aktif', lastLogin: '2025-01-18 13:15' },
    { id: 3, username: 'ali.sadr', fullName: 'Ali Al-Sadr', email: 'ali@exretailos.iq', role: 'Kasiyer', store: 'Basra Merkez', status: 'Aktif', lastLogin: '2025-01-18 12:00' },
    { id: 4, username: 'hussein.najjar', fullName: 'Hussein Al-Najjar', email: 'hussein@exretailos.iq', role: 'Depo Sorumlusu', store: 'Mosul Sanayi', status: 'Pasif', lastLogin: '2025-01-15 09:45' },
  ];

  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              {view === 'create' ? 'Yeni Kullanıcı Ekle' : 'Kullanıcı Düzenle'}
            </h3>
            <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                <input type="text" defaultValue={selectedUser?.username} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="ornek.kullanici" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tam Ad *</label>
                <input type="text" defaultValue={selectedUser?.fullName} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Ahmed Al-Maliki" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                <input type="email" defaultValue={selectedUser?.email} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="kullanici@exretailos.iq" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                <input type="tel" className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="+964 770 123 4567" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                <select defaultValue={selectedUser?.role} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option>Yönetici</option>
                  <option>Mağaza Müdürü</option>
                  <option>Kasiyer</option>
                  <option>Depo Sorumlusu</option>
                  <option>Muhasebe</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza *</label>
                <select defaultValue={selectedUser?.store} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option>Baghdad Merkez Mağazası</option>
                  <option>Erbil Merkez Çarşı</option>
                  <option>Basra Merkez AVM</option>
                  <option>Mosul Sanayi Mağazası</option>
                </select>
              </div>
            </div>

            {view === 'create' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Durum</label>
              <select defaultValue={selectedUser?.status || 'Aktif'} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Aktif</option>
                <option>Pasif</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setView('list')}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  alert(view === 'create' ? 'Kullanıcı eklendi!' : 'Kullanıcı güncellendi!');
                  setView('list');
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Kullanıcı Yönetimi</h3>
            <p className="text-sm text-gray-600 mt-1">{users.length} kullanıcı kayıtlı</p>
          </div>
          <button
            onClick={() => setView('create')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Yeni Kullanıcı
          </button>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Kullanıcı Adı</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Tam Ad</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">E-posta</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Rol</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Mağaza</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Durum</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Son Giriş</th>
                <th className="text-right p-3 text-sm font-medium text-gray-700">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium text-gray-800">{user.username}</td>
                  <td className="p-3 text-sm text-gray-700">{user.fullName}</td>
                  <td className="p-3 text-sm text-gray-600">{user.email}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{user.role}</span>
                  </td>
                  <td className="p-3 text-sm text-gray-700">{user.store}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs rounded ${user.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-600">{user.lastLogin}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setView('edit');
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${user.fullName} kullanıcısını silmek istediğinize emin misiniz?`)) {
                            alert('Kullanıcı silindi!');
                          }
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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

// Role Authorization View
function RoleAuthorizationView() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-600" />
          Rol ve Yetkilendirme Yönetimi
        </h3>
        <p className="text-gray-600 mb-4">Kullanıcı rollerini ve yetkilerini yönetin</p>
        <div className="text-center py-8">
          <Shield className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Rol yönetimi ekranı hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
}

// Definitions Parameters View
function DefinitionsParametersView() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-green-600" />
          Tanımlar ve Parametreler
        </h3>
        <p className="text-gray-600 mb-4">Sistem tanımları ve parametreleri</p>
        <div className="text-center py-8">
          <Settings className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Parametre yönetimi ekranı hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
}

// Data Broadcast View
function DataBroadcastView() {
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Radio className="h-5 w-5 text-orange-600" />
          Bilgi Gönder / AI Merkezi
        </h3>
        <p className="text-gray-600 mb-4">Merkezi veri yayını ve AI entegrasyonu</p>
        <div className="text-center py-8">
          <Radio className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Veri yayını ekranı hazırlanıyor...</p>
        </div>
      </div>
    </div>
  );
}

// Backup Restore View
function BackupRestoreView() {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-indigo-600" />
            Yedekleme ve Geri Yükleme
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button className="p-6 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-50 flex flex-col items-center gap-3">
              <Download className="h-8 w-8 text-blue-600" />
              <span className="font-medium text-gray-900">Yedek Al</span>
              <span className="text-sm text-gray-600">Sistem yedeğini indir</span>
            </button>
            <button className="p-6 border-2 border-dashed border-green-300 rounded-lg hover:bg-green-50 flex flex-col items-center gap-3">
              <Upload className="h-8 w-8 text-green-600" />
              <span className="font-medium text-gray-900">Geri Yükle</span>
              <span className="text-sm text-gray-600">Yedekten geri yükle</span>
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-1">Son Yedekleme</h4>
                <p className="text-sm text-blue-800">18 Ocak 2025, 02:00 - Otomatik yedekleme başarılı</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Log Audit View
function LogAuditView() {
  const logs = [
    { id: 1, user: 'Ahmed Al-Maliki', action: 'Kullanıcı Girişi', module: 'Sistem', details: 'Başarılı giriş', timestamp: '2025-01-18 14:30:15', ip: '192.168.1.100' },
    { id: 2, user: 'Mohammed Hassan', action: 'Ürün Ekleme', module: 'Stok', details: 'Yeni ürün eklendi: iPhone 15 Pro', timestamp: '2025-01-18 13:15:42', ip: '192.168.1.101' },
    { id: 3, user: 'Ali Al-Sadr', action: 'Satış', module: 'POS', details: 'Satış tamamlandı: 1,250,000 IQD', timestamp: '2025-01-18 12:00:30', ip: '192.168.1.102' },
  ];

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-red-600" />
            Log ve Denetim Kayıtları
          </h3>
          <p className="text-sm text-gray-600 mt-1">{logs.length} kayıt listeleniyor</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Zaman</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Kullanıcı</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">İşlem</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Modül</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">Detaylar</th>
                <th className="text-left p-3 text-sm font-medium text-gray-700">IP Adresi</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-700">{log.timestamp}</td>
                  <td className="p-3 text-sm font-medium text-gray-800">{log.user}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">{log.action}</span>
                  </td>
                  <td className="p-3 text-sm text-gray-700">{log.module}</td>
                  <td className="p-3 text-sm text-gray-600">{log.details}</td>
                  <td className="p-3 text-sm text-gray-500 font-mono">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// System Health View
function SystemHealthView() {
  const metrics = [
    { label: 'CPU Kullanımı', value: 35, unit: '%', status: 'good', icon: Cpu },
    { label: 'RAM Kullanımı', value: 62, unit: '%', status: 'warning', icon: Cpu },
    { label: 'Disk Kullanımı', value: 48, unit: '%', status: 'good', icon: HardDrive },
    { label: 'Network Trafiği', value: 125, unit: 'Mb/s', status: 'good', icon: Network },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-3">
                <Icon className={`h-8 w-8 ${metric.status === 'good' ? 'text-green-600' : 'text-yellow-600'
                  }`} />
                <span className={`text-2xl font-bold ${metric.status === 'good' ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                  {metric.value}{metric.unit}
                </span>
              </div>
              <p className="text-sm text-gray-600">{metric.label}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            Sistem Durumu
          </h3>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">Veritabanı Bağlantısı</span>
              </div>
              <span className="text-green-700 text-sm">Aktif</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">API Servisleri</span>
              </div>
              <span className="text-green-700 text-sm">Çalışıyor</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900">Yedekleme Sistemi</span>
              </div>
              <span className="text-green-700 text-sm">Normal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
