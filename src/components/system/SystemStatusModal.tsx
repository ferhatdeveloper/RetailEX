import { X, CheckCircle2, AlertCircle, XCircle, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useTheme } from '../../contexts/ThemeContext';

interface SystemStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SystemStatusModal({ open, onOpenChange }: SystemStatusModalProps) {
  const [expandedSection, setExpandedSection] = useState<string>('general');
  const { darkMode } = useTheme();

  // Sistem durumu verileri
  const systemStatus = {
    generalProgress: 100,
    database: { completed: 37, total: 37 },
    modules: { completed: 29, total: 29, percentage: 100 },
    criticalIssues: 0,
    criticalModulesComplete: true,
    managementModules: [
      { id: 'user', name: 'Kullanıcı Yönetimi', completed: true },
      { id: 'expense', name: 'Gider Yönetimi', completed: true },
      { id: 'currency', name: 'Para Birimi Yönetimi', completed: true },
      { id: 'discount', name: 'İndirim Yönetimi', completed: true },
      { id: 'cash', name: 'Kasa Yönetimi', completed: true },
    ]
  };

  const allModules = [
    'Dashboard', 'Hızlı Satış (POS)', 'Ürün Yönetimi', 'Stok Takip', 'Müşteri Yönetimi',
    'Tedarikçi Yönetimi', 'Satış Faturaları', 'Alış Faturaları', 'İade İşlemleri',
    'Kampanya Yönetimi', 'Fiyat Yönetimi', 'Barkod Yönetimi', 'Kategori Yönetimi',
    'Marka Yönetimi', 'Birim Yönetimi', 'Depo Yönetimi', 'Transfer İşlemleri',
    'Sayım İşlemleri', 'Raporlama Merkezi', 'Finansal Raporlar', 'Satış Raporları',
    'Stok Raporları', 'Kasa Yönetimi', 'Ödeme Yönetimi', 'Personel Yönetimi',
    'Kullanıcı Yönetimi', 'Yetki Yönetimi', 'Ayarlar', 'AI Asistan'
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white rounded-lg w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-bold">Geliştirme Durumu</h3>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white hover:text-gray-200 p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Genel İlerleme */}
          <div className="p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
            <button
              onClick={() => setExpandedSection(expandedSection === 'general' ? '' : 'general')}
              className="w-full flex items-center justify-between"
            >
              <span className="font-medium">Genel İlerleme</span>
              <span className="text-2xl font-bold">{systemStatus.generalProgress}%</span>
            </button>
            <div className="mt-3 bg-white/20 rounded-full h-3 overflow-hidden">
              <div
                className="bg-white h-full transition-all duration-500"
                style={{ width: `${systemStatus.generalProgress}%` }}
              />
            </div>
          </div>

          {/* Veritabanı */}
          <div className="p-4 border-b border-gray-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Veritabanı</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-green-700">
                  {systemStatus.database.completed}/{systemStatus.database.total}
                </span>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>

          {/* Modüller */}
          <div className="p-4 border-b border-gray-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Modüller</span>
              </div>
              <div className="text-green-700 font-bold">
                {systemStatus.modules.completed}/{systemStatus.modules.total} ({systemStatus.modules.percentage}%)
              </div>
            </div>
          </div>

          {/* Kritik Eksikler */}
          <div className="p-4 border-b border-gray-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Kritik Eksikler</span>
              </div>
              <span className="font-bold text-green-700">{systemStatus.criticalIssues} modül</span>
            </div>
          </div>

          {/* TÜM KRİTİK MODÜLLER TAMAMLANDI */}
          {systemStatus.criticalModulesComplete && (
            <div className="p-4 border-b border-gray-200 bg-green-100">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-bold">✓ TÜM KRİTİK MODÜLLER TAMAMLANDI!</span>
              </div>
            </div>
          )}

          {/* Yönetim Modülleri Checklist */}
          <div className="p-4 bg-green-50 border-b border-gray-200">
            {systemStatus.managementModules.map((module) => (
              <div key={module.id} className="flex items-center gap-2 py-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-gray-800">{module.name}</span>
                <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
              </div>
            ))}
          </div>

          {/* %100 Tamamlandı Celebration */}
          <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-b border-gray-200">
            <div className="text-center">
              <div className="text-6xl mb-3">ğŸ‰</div>
              <h4 className="text-xl font-bold text-green-700 mb-2">%100 Tamamlandı!</h4>
              <p className="text-sm text-green-600 mb-1">
                {systemStatus.modules.completed}/{systemStatus.modules.total} modül kullanıma hazır
              </p>
              <p className="text-xs text-green-600">
                API entegrasyonları bekliyor
              </p>
            </div>
          </div>

          {/* Tüm Modüller Listesi */}
          <div className="p-4">
            <button
              onClick={() => setExpandedSection(expandedSection === 'modules' ? '' : 'modules')}
              className="w-full flex items-center justify-between text-left font-medium text-gray-700 mb-3"
            >
              <span>Tamamlanan Modüller ({allModules.length})</span>
              <span>{expandedSection === 'modules' ? '▼' : '▶'}</span>
            </button>
            
            {expandedSection === 'modules' && (
              <div className="grid grid-cols-1 gap-1.5">
                {allModules.map((module, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-gray-700 bg-green-50 px-3 py-2 rounded"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>{module}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Final Rapor Button */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-lg font-medium hover:from-green-700 hover:to-green-800 transition-all flex items-center justify-center gap-2"
          >
            <TrendingUp className="w-5 h-5" />
            Final Raporu Görüntüle →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
