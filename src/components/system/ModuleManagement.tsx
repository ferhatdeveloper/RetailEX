import React, { useState } from 'react';
import { Package, ToggleLeft, ToggleRight, CheckCircle, XCircle, Search, Filter, Settings } from 'lucide-react';

interface Module {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  license: 'basic' | 'professional' | 'enterprise';
  version: string;
}

export function ModuleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [modules, setModules] = useState<Module[]>([
    // POS & Satış
    { id: 'pos', name: 'POS Satış Ekranı', category: 'Satış', description: 'Hızlı satış ve ödeme sistemi', enabled: true, license: 'basic', version: '3.2.0' },
    { id: 'sales', name: 'Satış Yönetimi', category: 'Satış', description: 'Satış fişleri ve raporları', enabled: true, license: 'basic', version: '3.2.0' },
    { id: 'returns', name: 'İade İşlemleri', category: 'Satış', description: 'Ürün iade ve değişim', enabled: true, license: 'professional', version: '2.1.0' },
    
    // Stok
    { id: 'inventory', name: 'Stok Yönetimi', category: 'Stok', description: 'Ürün ve stok takibi', enabled: true, license: 'basic', version: '3.2.0' },
    { id: 'warehouse', name: 'Depo Yönetimi', category: 'Stok', description: 'Çoklu depo ve transfer', enabled: true, license: 'professional', version: '2.5.0' },
    { id: 'barcode', name: 'Barkod Sistemi', category: 'Stok', description: 'Barkod okuma ve yazdırma', enabled: true, license: 'basic', version: '3.0.0' },
    
    // Finans
    { id: 'accounting', name: 'Muhasebe Entegrasyonu', category: 'Finans', description: 'Muhasebe programlarıyla entegrasyon', enabled: false, license: 'enterprise', version: '1.0.0' },
    { id: 'payments', name: 'Ödeme Entegrasyonları', category: 'Finans', description: 'Online ödeme sistemleri', enabled: false, license: 'professional', version: '1.5.0' },
    { id: 'expense', name: 'Gider Yönetimi', category: 'Finans', description: 'Gider takibi ve onay', enabled: true, license: 'professional', version: '2.0.0' },
    
    // Müşteri
    { id: 'crm', name: 'CRM', category: 'Müşteri', description: 'Müşteri ilişkileri yönetimi', enabled: true, license: 'professional', version: '2.8.0' },
    { id: 'loyalty', name: 'Sadakat Programı', category: 'Müşteri', description: 'Puan ve ödül sistemi', enabled: false, license: 'professional', version: '1.2.0' },
    { id: 'giftcard', name: 'Hediye Kartı', category: 'Müşteri', description: 'Hediye kartı satış ve kullanım', enabled: false, license: 'professional', version: '1.0.0' },
    
    // Raporlama
    { id: 'reports', name: 'Standart Raporlar', category: 'Raporlama', description: 'Temel raporlama araçları', enabled: true, license: 'basic', version: '3.2.0' },
    { id: 'bi', name: 'İş Zekası Dashboard', category: 'Raporlama', description: 'Gelişmiş analitik', enabled: false, license: 'enterprise', version: '1.0.0' },
    { id: 'customreports', name: 'Özel Raporlar', category: 'Raporlama', description: 'Kullanıcı tanımlı raporlar', enabled: true, license: 'professional', version: '2.0.0' },
    
    // Entegrasyonlar
    { id: 'ecommerce', name: 'E-Ticaret', category: 'Entegrasyon', description: 'Online mağaza entegrasyonu', enabled: true, license: 'professional', version: '2.5.0' },
    { id: 'marketplace', name: 'Pazar Yerleri', category: 'Entegrasyon', description: 'Amazon, eBay, Trendyol entegrasyonu', enabled: false, license: 'enterprise', version: '1.0.0' },
    { id: 'whatsapp', name: 'WhatsApp İletişim', category: 'Entegrasyon', description: 'WhatsApp Business entegrasyonu', enabled: false, license: 'professional', version: '1.0.0' },
    { id: 'cargo', name: 'Kargo Entegrasyonları', category: 'Entegrasyon', description: 'Kargo firmalarıyla entegrasyon', enabled: true, license: 'professional', version: '2.0.0' },
    
    // Yönetim
    { id: 'users', name: 'Kullanıcı Yönetimi', category: 'Yönetim', description: 'Kullanıcılar ve yetkiler', enabled: true, license: 'basic', version: '3.2.0' },
    { id: 'roles', name: 'Rol ve Yetki', category: 'Yönetim', description: 'Rol bazlı erişim kontrolü', enabled: true, license: 'professional', version: '2.5.0' },
    { id: 'audit', name: 'Log ve Denetim', category: 'Yönetim', description: 'Sistem logları ve denetim', enabled: true, license: 'professional', version: '2.0.0' },
  ]);

  const toggleModule = (moduleId: string) => {
    setModules(modules.map(m => 
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const categories = ['all', ...Array.from(new Set(modules.map(m => m.category)))];

  const filteredModules = modules.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         m.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getLicenseBadge = (license: string) => {
    const colors = {
      basic: 'bg-blue-100 text-blue-700 border-blue-200',
      professional: 'bg-purple-100 text-purple-700 border-purple-200',
      enterprise: 'bg-amber-100 text-amber-700 border-amber-200'
    };
    return colors[license as keyof typeof colors] || colors.basic;
  };

  const stats = {
    total: modules.length,
    enabled: modules.filter(m => m.enabled).length,
    disabled: modules.filter(m => !m.enabled).length
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-blue-900">Modül Yönetimi</h1>
            <p className="text-sm text-slate-600">Sistem modüllerini aktif/pasif edin ve yönetin</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Toplam Modül</p>
              <p className="text-2xl text-blue-900 mt-1">{stats.total}</p>
            </div>
            <Package className="w-10 h-10 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Aktif Modüller</p>
              <p className="text-2xl text-green-600 mt-1">{stats.enabled}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Pasif Modüller</p>
              <p className="text-2xl text-slate-600 mt-1">{stats.disabled}</p>
            </div>
            <XCircle className="w-10 h-10 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-blue-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Modül ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'Tüm Kategoriler' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModules.map(module => (
          <div
            key={module.id}
            className={`bg-white rounded-lg border-2 p-5 transition-all duration-200 ${
              module.enabled 
                ? 'border-blue-300 shadow-sm' 
                : 'border-slate-200 opacity-75'
            }`}
          >
            {/* Module Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-blue-900">{module.name}</h3>
                  {module.enabled && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <p className="text-sm text-slate-600">{module.description}</p>
              </div>
            </div>

            {/* Module Details */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs px-2 py-1 rounded border ${getLicenseBadge(module.license)}`}>
                {module.license.toUpperCase()}
              </span>
              <span className="text-xs text-slate-500">v{module.version}</span>
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">
                {module.category}
              </span>
            </div>

            {/* Toggle Button */}
            <button
              onClick={() => toggleModule(module.id)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                module.enabled
                  ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {module.enabled ? (
                <>
                  <ToggleRight className="w-5 h-5" />
                  <span>Aktif</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-5 h-5" />
                  <span>Pasif - Aktif Et</span>
                </>
              )}
            </button>

            {/* Settings Button */}
            {module.enabled && (
              <button className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                <Settings className="w-4 h-4" />
                <span className="text-sm">Ayarlar</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredModules.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Aramanıza uygun modül bulunamadı</p>
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="mb-1">
              <strong>Modül Lisansları:</strong>
            </p>
            <ul className="text-blue-800 space-y-1 ml-4">
              <li>• <strong>BASIC:</strong> Temel modüller - Tüm paketlerde mevcut</li>
              <li>• <strong>PROFESSIONAL:</strong> İleri seviye özellikler - Professional ve üzeri</li>
              <li>• <strong>ENTERPRISE:</strong> Kurumsal modüller - Sadece Enterprise pakette</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

