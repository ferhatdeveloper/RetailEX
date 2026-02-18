/**
 * WMS Layout - Warehouse Management System Ana Layout
 * Tüm WMS modülleri için ortak layout komponenti
 */

import { ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  Package,
  Menu,
  X,
  Home,
  ChevronRight,
  Settings,
  Languages
} from 'lucide-react';
import { useState } from 'react';
import { LanguageSelectionModal } from '../system/LanguageSelectionModal';

interface WMSLayoutProps {
  children: ReactNode;
  currentModule?: string;
  onModuleChange?: (module: string) => void;
  onBack?: () => void;
}

interface WMSMenuItem {
  id: string;
  label: string;
  labelEn: string;
  labelAr: string;
  icon: ReactNode;
  category: string;
}

export function WMSLayout({
  children,
  currentModule,
  onModuleChange,
  onBack
}: WMSLayoutProps) {
  const { darkMode } = useTheme();
  const { language: currentLanguage } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [rtlMode, setRtlMode] = useState(() => {
    return localStorage.getItem('retailos_rtl_mode') === 'true';
  });

  const menuItems: WMSMenuItem[] = [
    // Giriş İşlemleri
    { id: 'goods-receiving', label: 'Mal Kabul', labelEn: 'Goods Receiving', labelAr: 'استلام البضائع', icon: <Package />, category: 'entry' },
    { id: 'return-receiving', label: 'İade Kabul', labelEn: 'Return Receiving', labelAr: 'استلام المرتجعات', icon: <Package />, category: 'entry' },
    { id: 'production-receiving', label: 'Üretimden Giriş', labelEn: 'Production Receiving', labelAr: 'استلام الإنتاج', icon: <Package />, category: 'entry' },

    // Çıkış İşlemleri
    { id: 'shipment-prep', label: 'Sevkiyat Hazırlık', labelEn: 'Shipment Prep', labelAr: 'تحضير الشحنة', icon: <Package />, category: 'exit' },
    { id: 'shipment', label: 'Sevkiyat/Yükleme', labelEn: 'Shipment', labelAr: 'الشحن', icon: <Package />, category: 'exit' },
    { id: 'production-issue', label: 'Üretime Çıkış', labelEn: 'Production Issue', labelAr: 'إصدار الإنتاج', icon: <Package />, category: 'exit' },

    // Transfer & Hareket
    { id: 'warehouse-transfer', label: 'Depo Transferi', labelEn: 'Warehouse Transfer', labelAr: 'نقل المستودع', icon: <Package />, category: 'transfer' },
    { id: 'location-transfer', label: 'Raf Transferi', labelEn: 'Location Transfer', labelAr: 'نقل الموقع', icon: <Package />, category: 'transfer' },
    { id: 'lot-transfer', label: 'Lot/Seri Transfer', labelEn: 'Lot Transfer', labelAr: 'نقل الدفعة', icon: <Package />, category: 'transfer' },
    { id: 'consignment', label: 'Konsinyasyon', labelEn: 'Consignment', labelAr: 'الوكالة', icon: <Package />, category: 'transfer' },

    // Sayım & Kontrol
    { id: 'stock-count', label: 'Sayım Emirleri', labelEn: 'Stock Count', labelAr: 'عد المخزون', icon: <Package />, category: 'counting' },
    { id: 'count-entry', label: 'Sayım Giriş', labelEn: 'Count Entry', labelAr: 'إدخال العد', icon: <Package />, category: 'counting' },
    { id: 'count-reconciliation', label: 'Sayım Mutabakat', labelEn: 'Count Reconciliation', labelAr: 'التسوية', icon: <Package />, category: 'counting' },

    // Planlama & Optimizasyon
    { id: 'capacity-planning', label: 'Kapasite Planlama', labelEn: 'Capacity Planning', labelAr: 'تخطيط السعة', icon: <Package />, category: 'planning' },
    { id: 'layout-optimization', label: 'Yerleşim Optimizasyonu', labelEn: 'Layout Optimization', labelAr: 'تحسين التخطيط', icon: <Package />, category: 'planning' },
    { id: 'task-management', label: 'İş Emri Yönetimi', labelEn: 'Task Management', labelAr: 'إدارة المهام', icon: <Package />, category: 'planning' },
    { id: 'route-optimization', label: 'Rota Optimizasyonu', labelEn: 'Route Optimization', labelAr: 'تحسين المسار', icon: <Package />, category: 'planning' },
    { id: 'labor-tracking', label: 'Personel Performans', labelEn: 'Labor Tracking', labelAr: 'تتبع العمالة', icon: <Package />, category: 'planning' },
    { id: 'equipment-maintenance', label: 'Ekipman Bakım', labelEn: 'Equipment Maintenance', labelAr: 'صيانة المعدات', icon: <Package />, category: 'planning' },

    // Raporlama & Analiz
    { id: 'stock-status-report', label: 'Stok Durum Raporu', labelEn: 'Stock Status Report', labelAr: 'تقرير حالة المخزون', icon: <Package />, category: 'reports' },
    { id: 'movement-report', label: 'Hareket Raporu', labelEn: 'Movement Report', labelAr: 'تقرير الحركة', icon: <Package />, category: 'reports' },
    { id: 'abc-analysis', label: 'ABC Analizi', labelEn: 'ABC Analysis', labelAr: 'تحليل ABC', icon: <Package />, category: 'reports' },
    { id: 'lot-traceability', label: 'Lot İzlenebilirlik', labelEn: 'Lot Traceability', labelAr: 'تتبع الدفعة', icon: <Package />, category: 'reports' },
    { id: 'aging-analysis', label: 'Yaşlandırma Analizi', labelEn: 'Aging Analysis', labelAr: 'تحليل التقادم', icon: <Package />, category: 'reports' },
    { id: 'fefo-report', label: 'FEFO Raporu', labelEn: 'FEFO Report', labelAr: 'تقرير FEFO', icon: <Package />, category: 'reports' },
    { id: 'occupancy-report', label: 'Doluluk Analizi', labelEn: 'Occupancy Report', labelAr: 'تقرير الإشغال', icon: <Package />, category: 'reports' },
    { id: 'performance-dashboard', label: 'Performans Dashboard', labelEn: 'Performance Dashboard', labelAr: 'لوحة الأداء', icon: <Package />, category: 'reports' },
    { id: 'cost-analysis', label: 'Maliyet Analizi', labelEn: 'Cost Analysis', labelAr: 'تحليل التكلفة', icon: <Package />, category: 'reports' },
    { id: 'alert-center', label: 'Uyarı Merkezi', labelEn: 'Alert Center', labelAr: 'مركز التنبيهات', icon: <Package />, category: 'reports' },
  ];

  const getLabel = (item: WMSMenuItem) => {
    if (currentLanguage === 'tr') return item.label;
    if (currentLanguage === 'ar') return item.labelAr;
    return item.labelEn;
  };

  const categories = [
    { id: 'entry', label: 'Giriş İşlemleri', labelEn: 'Entry Operations', labelAr: 'عمليات الدخول' },
    { id: 'exit', label: 'Çıkış İşlemleri', labelEn: 'Exit Operations', labelAr: 'عمليات الخروج' },
    { id: 'transfer', label: 'Transfer & Hareket', labelEn: 'Transfer & Movement', labelAr: 'النقل والحركة' },
    { id: 'counting', label: 'Sayım & Kontrol', labelEn: 'Counting & Control', labelAr: 'العد والتحكم' },
    { id: 'planning', label: 'Planlama & Optimizasyon', labelEn: 'Planning & Optimization', labelAr: 'التخطيط والتحسين' },
    { id: 'reports', label: 'Raporlama & Analiz', labelEn: 'Reporting & Analysis', labelAr: 'التقارير والتحليل' },
  ];

  const getCategoryLabel = (category: typeof categories[0]) => {
    if (currentLanguage === 'tr') return category.label;
    if (currentLanguage === 'ar') return category.labelAr;
    return category.labelEn;
  };

  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'
        } transition-all duration-300 ${darkMode ? 'bg-gray-800 border-r border-gray-700' : 'bg-white border-r border-gray-200'
        } flex flex-col`}>
        {/* Sidebar Header */}
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'
          } flex items-center justify-between`}>
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                WMS
              </h2>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-lg hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700' : ''
              }`}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Sidebar Menu */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: darkMode ? '#4b5563 #1f2937' : '#cbd5e1 #ffffff',
          }}
        >
          <style>{`
            div::-webkit-scrollbar {
              width: 8px;
            }
            div::-webkit-scrollbar-track {
              background: ${darkMode ? '#1f2937' : '#ffffff'};
            }
            div::-webkit-scrollbar-thumb {
              background: ${darkMode ? '#4b5563' : '#cbd5e1'};
              border-radius: 4px;
            }
            div::-webkit-scrollbar-thumb:hover {
              background: ${darkMode ? '#6b7280' : '#94a3b8'};
            }
          `}</style>
          {onBack && (
            <button
              onClick={onBack}
              className={`w-full p-3 flex items-center gap-3 hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-white' : 'text-gray-700'
                } transition-colors`}
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
              {sidebarOpen && <span>Geri</span>}
            </button>
          )}

          {categories.map((category) => {
            const categoryItems = menuItems.filter(item => item.category === category.id);
            if (categoryItems.length === 0) return null;

            return (
              <div key={category.id} className="mb-4">
                {sidebarOpen && (
                  <div className={`px-4 py-2 text-xs font-semibold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                    {getCategoryLabel(category)}
                  </div>
                )}
                {categoryItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onModuleChange?.(item.id)}
                    className={`w-full p-3 flex items-center gap-3 transition-colors ${currentModule === item.id
                      ? darkMode
                        ? 'bg-blue-900 text-white'
                        : 'bg-blue-50 text-blue-700'
                      : darkMode
                        ? 'hover:bg-gray-700 text-gray-300'
                        : 'hover:bg-gray-50 text-gray-700'
                      }`}
                  >
                    <div className="w-5 h-5">{item.icon}</div>
                    {sidebarOpen && <span className="text-sm">{getLabel(item)}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'
          } space-y-2`}>
          <button
            onClick={() => setShowLanguageModal(true)}
            className={`w-full p-3 flex items-center gap-3 rounded-lg hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-white' : 'text-gray-700'
              } transition-colors`}
          >
            <Languages className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Dil Seçimi</span>}
          </button>
          <button
            className={`w-full p-3 flex items-center gap-3 rounded-lg hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-white' : 'text-gray-700'
              } transition-colors`}
          >
            <Settings className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Ayarlar</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: darkMode ? '#4b5563 #1f2937' : '#cbd5e1 #f9fafb',
        }}
      >
        <style>{`
          div::-webkit-scrollbar {
            width: 10px;
          }
          div::-webkit-scrollbar-track {
            background: ${darkMode ? '#1f2937' : '#f9fafb'};
          }
          div::-webkit-scrollbar-thumb {
            background: ${darkMode ? '#4b5563' : '#cbd5e1'};
            border-radius: 5px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: ${darkMode ? '#6b7280' : '#94a3b8'};
          }
        `}</style>
        {children}
      </div>

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <LanguageSelectionModal
          onClose={() => setShowLanguageModal(false)}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode}
        />
      )}
    </div>
  );
}


