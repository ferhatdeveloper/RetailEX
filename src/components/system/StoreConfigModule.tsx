// Store Configuration & Settings Module

import { useState } from 'react';
import { 
  Settings,
  Store,
  Layout,
  Palette,
  Printer,
  Wifi,
  HardDrive,
  Shield,
  Bell,
  Clock,
  DollarSign,
  Percent,
  Users,
  Package,
  Tag,
  Monitor,
  Smartphone,
  Save,
  RefreshCw,
  Copy,
  Download,
  Upload,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export function StoreConfigModule() {
  const [selectedView, setSelectedView] = useState<'general' | 'pos' | 'layout' | 'integrations' | 'advanced'>('general');
  const [selectedStore, setSelectedStore] = useState('MG00001');

  const viewTabs = [
    { id: 'general' as const, label: 'Genel Ayarlar', icon: Settings },
    { id: 'pos' as const, label: 'POS Ayarları', icon: Monitor },
    { id: 'layout' as const, label: 'Mağaza Layout', icon: Layout },
    { id: 'integrations' as const, label: 'Entegrasyonlar', icon: Wifi },
    { id: 'advanced' as const, label: 'Gelişmiş Ayarlar', icon: Shield },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl text-gray-900 flex items-center gap-2">
                <Settings className="h-6 w-6 text-blue-600" />
                Mağaza Konfigürasyon Ayarları
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Mağaza özel ayarlar, POS konfigürasyonu ve entegrasyonlar
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="MG00001">Baghdad Merkez Mağazası (MG00001) - Ahmed Al-Maliki</option>
                <option value="MG00002">Erbil Merkez Çarşı Mağazası (MG00002) - Mohammed Hassan</option>
                <option value="MG00003">Basra Merkez AVM Mağazası (MG00003) - Ali Al-Sadr</option>
                <option value="MG00004">Mosul Sanayi Mağazası (MG00004) - Hussein Al-Najjar</option>
              </select>
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Copy className="h-4 w-4" />
                <span>Ayarları Kopyala</span>
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Save className="h-4 w-4" />
                <span>Kaydet</span>
              </button>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2">
            {viewTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedView(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    selectedView === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area - SCROLLABLE */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {selectedView === 'general' && <GeneralSettings />}
          {selectedView === 'pos' && <POSSettings />}
          {selectedView === 'layout' && <LayoutSettings />}
          {selectedView === 'integrations' && <IntegrationSettings />}
          {selectedView === 'advanced' && <AdvancedSettings />}
        </div>
      </div>
    </div>
  );
}

// General Settings
function GeneralSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Store Info */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Store className="h-5 w-5 text-blue-600" />
            Mağaza Bilgileri
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza Adı</label>
              <input type="text" defaultValue="Erbil Merkez Çarşı Mağazası" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza Kodu</label>
              <input type="text" defaultValue="MG00002" className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" disabled />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
              <input type="text" defaultValue="+964 770 234 5678" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">E-posta</label>
              <input type="email" defaultValue="erbil@exretailos.iq" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Adres</label>
            <textarea rows={2} defaultValue="Erbil, Italian City 165, Kurdistan Region" className="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Açılış Saati</label>
              <input type="time" defaultValue="09:00" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kapanış Saati</label>
              <input type="time" defaultValue="21:00" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Çalışma Günü</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>7 Gün</option>
                <option>Hafta içi</option>
                <option>Özel</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell className="h-5 w-5 text-purple-600" />
            Bildirim Ayarları
          </h3>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: 'Düşük stok uyarısı', value: true },
            { label: 'Yüksek kasa tutarı uyarısı', value: true },
            { label: 'Sistem hataları', value: true },
            { label: 'Personel geç kalma', value: false },
            { label: 'Kampanya bildirimleri', value: true },
          ].map((item, index) => (
            <label key={index} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
              <input type="checkbox" defaultChecked={item.value} className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-700">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// POS Settings
function POSSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* POS Hardware */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-blue-600" />
            POS Donanım Ayarları
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Yazıcı Tipi</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Thermal Printer (80mm)</option>
                <option>Thermal Printer (58mm)</option>
                <option>Laser Printer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Yazıcı Port</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>COM1</option>
                <option>COM2</option>
                <option>USB</option>
                <option>Network</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Barkod Okuyucu</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>USB Barkod Okuyucu</option>
                <option>Seri Port</option>
                <option>Bluetooth</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kasa Çekmecesi</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Yazıcıya Bağlı</option>
                <option>Bağımsız (RJ11)</option>
                <option>Kullanılmıyor</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Müşteri Ekranı</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Var - COM Port</option>
                <option>Var - USB</option>
                <option>Yok</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Terazi Entegrasyonu</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option>Var - Seri Port</option>
                <option>Var - Network</option>
                <option>Yok</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Ödeme Yöntemleri
          </h3>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: 'Nakit', enabled: true, commission: 0 },
            { label: 'Kredi Kartı', enabled: true, commission: 2.5 },
            { label: 'Banka Kartı', enabled: true, commission: 1.5 },
            { label: 'QR Kod (Papara, Paycell vb.)', enabled: true, commission: 1.0 },
            { label: 'Havale/EFT', enabled: false, commission: 0 },
            { label: 'Çek', enabled: false, commission: 0 },
          ].map((method, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <label className="flex items-center gap-3 cursor-pointer flex-1">
                <input type="checkbox" defaultChecked={method.enabled} className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">{method.label}</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Komisyon:</span>
                <input 
                  type="number" 
                  defaultValue={method.commission} 
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                  step="0.1"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Discount Settings */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Percent className="h-5 w-5 text-orange-600" />
            İndirim Limitleri
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kasiyer İndirim Limiti</label>
              <div className="flex gap-2">
                <input type="number" defaultValue="10" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
                <span className="flex items-center px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Müdür İndirim Limiti</label>
              <div className="flex gap-2">
                <input type="number" defaultValue="25" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
                <span className="flex items-center px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm">%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Maksimum İndirim</label>
              <div className="flex gap-2">
                <input type="number" defaultValue="50" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" />
                <span className="flex items-center px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm">%</span>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input type="checkbox" defaultChecked={true} className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-700">Limit aşımında yönetici onayı iste</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Layout Settings
function LayoutSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Layout className="h-5 w-5 text-purple-600" />
            Mağaza Layout Tasarımı
          </h3>
        </div>
        <div className="p-8 text-center">
          <Palette className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Layout Tasarımcısı</h4>
          <p className="text-gray-600 mb-4">
            Mağaza içi ürün yerleşimi, kategori planlaması ve görsel tasarım modülü yakında eklenecek
          </p>
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Demo Görüntüle
          </button>
        </div>
      </div>
    </div>
  );
}

// Integration Settings
function IntegrationSettings() {
  const integrations = [
    { name: 'Logo Tiger', status: 'disconnected', icon: 'ğŸ…', description: 'Muhasebe ve stok yönetimi entegrasyonu' },
    { name: 'Talabat', status: 'disconnected', icon: 'ğŸ”', description: 'Online yemek ve market sipariş platformu' },
    { name: 'Lezoo', status: 'disconnected', icon: 'ğŸ›µ', description: 'Yemek teslimat ve sipariş platformu' },
    { name: 'Zuu', status: 'disconnected', icon: 'ğŸ“¦', description: 'E-ticaret ve alışveriş platformu' },
    { name: 'Careem', status: 'disconnected', icon: 'ğŸš—', description: 'Teslimat ve lojistik entegrasyonu' },
    { name: 'HungerStation', status: 'disconnected', icon: 'ğŸ•', description: 'Yemek sipariş ve teslimat platformu' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-blue-600" />
            Entegrasyonlar
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Irak bölgesinde kullanılan platform entegrasyonları
          </p>
        </div>
        <div className="p-6 space-y-3">
          {integrations.map((integration, index) => (
            <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <div className="font-medium text-gray-900">{integration.name}</div>
                  <div className="text-sm text-gray-600">
                    {integration.description}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Bağlı değil
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Bağlan
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Advanced Settings
function AdvancedSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Database Settings */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-600" />
            Veritabanı Ayarları
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div>
              <div className="font-medium text-gray-900">Otomatik Yedekleme</div>
              <div className="text-sm text-gray-600">Her gece 02:00'da otomatik yedek alınır</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked={true} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
              <Download className="h-4 w-4" />
              <span>Manuel Yedek Al</span>
            </button>
            <button className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              <span>Yedek Geri Yükle</span>
            </button>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />
            Güvenlik Ayarları
          </h3>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: 'İki faktörlü kimlik doğrulama (2FA)', value: true },
            { label: 'IP kısıtlaması aktif', value: false },
            { label: 'Oturum timeout (30 dakika)', value: true },
            { label: 'Şifre karmaşıklığı zorunluluğu', value: true },
            { label: 'Başarısız giriş denemesi kilitlemesi', value: true },
          ].map((item, index) => (
            <label key={index} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded cursor-pointer">
              <span className="text-sm text-gray-700">{item.label}</span>
              <input type="checkbox" defaultChecked={item.value} className="w-4 h-4 text-blue-600" />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
