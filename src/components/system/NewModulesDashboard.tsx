import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase/client';
import {
  Sparkles,
  DollarSign,
  Zap,
  Mic,
  Database,
  Store,
  Shield,
  ChevronRight,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Scale,
  BarChart3
} from 'lucide-react';

interface NewModule {
  id: number;
  menu_type: string;
  label_tr: string;
  screen_id: string;
  icon_name: string;
  badge: string;
  section_name: string;
  created_at: string;
}

const iconMap: Record<string, React.ElementType> = {
  DollarSign,
  Zap,
  Mic,
  Database,
  Store,
  Shield,
  Sparkles,
  Scale,
  BarChart3,
};

export function NewModulesDashboard() {
  const [newModules, setNewModules] = useState<NewModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  useEffect(() => {
    loadNewModules();
  }, []);

  const loadNewModules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('v_new_modules')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      setNewModules(data || []);
    } catch (err) {
      console.error('Failed to load new modules:', err);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (iconName: string) => {
    const Icon = iconMap[iconName] || Sparkles;
    return Icon;
  };

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case 'YENİ':
        return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white';
      case 'AI':
        return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
      case 'PRO':
        return 'bg-gradient-to-r from-amber-500 to-amber-600 text-white';
      case 'BETA':
        return 'bg-gradient-to-r from-green-500 to-green-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const moduleDescriptions: Record<string, { title: string; description: string; features: string[] }> = {
    'accounting_dashboard': {
      title: 'Muhasebe Yönetimi',
      description: 'Profesyonel muhasebe ve finansal raporlama sistemi. Yevmiye fişleri, hesap planı, mali raporlar.',
      features: [
        'Çift taraflı kayıt sistemi',
        'Hesap planı yönetimi',
        'Otomatik mali raporlar',
        'Banka mutabakatı',
        'Vergi hesaplamaları'
      ]
    },
    'workflow_builder': {
      title: 'Workflow Otomasyonu',
      description: 'N8N benzeri görsel workflow oluşturucu. Sesli arama, WhatsApp, SMS otomasyonu.',
      features: [
        'Visual drag & drop builder',
        'OpenAI sesli arama entegrasyonu',
        'WhatsApp Business API',
        'Multi-language support (TR, AR, KU)',
        'AI sentiment analysis',
        'Otomatik müşteri feedback'
      ]
    },
    'voice_assistant': {
      title: 'Sesli Asistan',
      description: 'OpenAI destekli sesli komut sistemi. İşlemlerinizi sesli olarak yönetin.',
      features: [
        'Türkçe, Arapça, Kürtçe dil desteği',
        'Doğal dil işleme',
        'Sesli raporlama',
        'Hands-free çalışma',
        'Akıllı komut önerileri'
      ]
    },
    'migration_panel': {
      title: 'Database Migrations',
      description: 'IT Admin için veritabanı migration yönetim paneli.',
      features: [
        'Migration history',
        'One-click migrations',
        'Rollback desteği',
        'Schema versioning',
        'Backup & restore'
      ]
    },
    'multi_store_dashboard': {
      title: 'Mağaza Yönetimi',
      description: 'Multi-store dashboard ile tüm mağazalarınızı tek yerden yönetin.',
      features: [
        'Merkezi yönetim',
        'Store-by-store analytics',
        'Inventory sync',
        'Performance comparison',
        'Real-time monitoring'
      ]
    },
    'security_modules': {
      title: 'Güvenlik Modülleri',
      description: 'ExSecureGate entegrasyonu. Kamera, RFID, yüz tanıma, fleet tracking.',
      features: [
        'CCTV entegrasyonu',
        'RFID okuma/yazma',
        'KVKV uyumlu yüz tanıma',
        'Fleet tracking',
        'Remote support',
        'OpenCV analiz'
      ]
    },
    'scale_management': {
      title: 'Terazi & Tartılı Satış',
      description: 'Hassas terazi entegrasyonu ve etiketleme sistemi. Kuyumcu ve marketler için ideal.',
      features: [
        'Serial port (COM) desteği',
        'ZPL/TSPL etiket baskı',
        'RFID etiket yazma',
        'Real-time ağırlık takibi',
        'Gram bazlı fiyat hesaplama'
      ]
    },
    'ai_analytics': {
      title: 'AI Ürün Analitiği',
      description: 'OpenCV ile müşteri bakış takibi ve reyon ısı haritası analizi.',
      features: [
        'Gaze tracking (Bakış takibi)',
        'Reyon ısı haritası',
        'Dönüşüm oranı tahmini',
        'VIP müşteri tanıma',
        'Otomatik stok önerisi'
      ]
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const mainModules = newModules.filter(m => m.menu_type === 'main');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Yeni Eklenenler
            </h1>
            <p className="text-slate-600 mt-1">
              Bugün sisteme eklenen {mainModules.length} yeni modül
            </p>
          </div>
        </div>


      </div>

      {/* Module Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mainModules.map((module) => {
            const Icon = getIcon(module.icon_name);
            const details = moduleDescriptions[module.screen_id];

            return (
              <div
                key={module.id}
                onClick={() => setSelectedModule(module.screen_id)}
                className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-slate-200 cursor-pointer transform hover:-translate-y-1"
              >
                {/* Card Header */}
                <div className="relative h-32 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-6">
                  <div className="absolute top-4 right-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getBadgeColor(module.badge)}`}>
                      {module.badge}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{module.label_tr}</h3>
                      <p className="text-xs text-white/80 mt-1">{module.screen_id}</p>
                    </div>
                  </div>

                  {/* Decorative circles */}
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                  <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  {details && (
                    <>
                      <p className="text-slate-600 text-sm mb-4">
                        {details.description}
                      </p>

                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          Özellikler:
                        </h4>
                        <ul className="space-y-1.5">
                          {details.features.slice(0, 3).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        {details.features.length > 3 && (
                          <p className="text-xs text-slate-500 italic mt-2">
                            +{details.features.length - 3} özellik daha...
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Action Button */}
                  <button className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all group-hover:shadow-lg">
                    <span className="font-semibold">Modülü Aç</span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>



      {/* Module Detail Modal */}
      {selectedModule && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedModule(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {moduleDescriptions[selectedModule]?.title}
                </h2>
                <p className="text-slate-600 mt-2">
                  {moduleDescriptions[selectedModule]?.description}
                </p>
              </div>
              <button
                onClick={() => setSelectedModule(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Tüm Özellikler:</h3>
              <ul className="space-y-2">
                {moduleDescriptions[selectedModule]?.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => {
                  const slugToScreen: Record<string, string> = {
                    'accounting_dashboard': 'accounting-mgmt',
                    'workflow_builder': 'workflow-automation',
                    'voice_assistant': 'voice-assistant',
                    'migration_panel': 'db-migrations',
                    'multi_store_dashboard': 'store-management',
                    'security_modules': 'security-modules',
                    'scale_management': 'cashier-scale',
                    'ai_analytics': 'product-analytics'
                  };
                  const screen = slugToScreen[selectedModule];
                  if (screen) {
                    window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: screen }));
                  }
                }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold"
              >
                Modülü Başlat
              </button>
              <button
                onClick={() => setSelectedModule(null)}
                className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all font-semibold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

