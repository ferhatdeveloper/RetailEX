// Reports Module - Enterprise WMS
// TODO: Bu modül için aşağıdaki raporlar sırayla implemente edilecek:
//   1. Stok Hareket Raporu (B2 ile zaten ProductProfitabilityReport/MaterialMovementReport içinde)
//   2. Kâr-Zarar Raporu (ProfitLossReports.tsx'e bak — gerçek SQL bağlandı, hâlâ WMS'e ayrı bir hub gerekebilir)
//   3. Ambar Bazlı Stok Özet Raporu
//   4. Sayım Farkı (Sayım Fazlası / Eksiği) Raporu
//   5. Tedarikçi Alış Performans Raporu
// Şimdilik açıkça "Yakında" placeholder'ı gösteriliyor — müşteriye yanlış veri gösterilmiyor.

import { ArrowLeft, FileText } from 'lucide-react';

interface ReportsProps {
  darkMode: boolean;
  onNavigate: (page: string) => void;
}

export default function Reports({ darkMode, onNavigate }: ReportsProps) {
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-teal-50'}`}>
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b shadow-sm`}>
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => onNavigate('dashboard')} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
              <ArrowLeft className={`w-5 h-5 ${textClass}`} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={`text-xl ${textClass}`}>Raporlar</h1>
                <p className={`text-xs ${textMutedClass}`}>Detaylı analiz ve raporlama</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className={`${cardClass} border rounded-xl p-12 text-center`}>
          <FileText className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
          <h3 className={`text-lg ${textClass} mb-2`}>WMS Raporlar Modülü</h3>
          <p className={`${textMutedClass} mb-3`}>Yakında — aşağıdaki raporlar sırayla eklenecek.</p>
          <ul className={`text-xs ${textMutedClass} space-y-1 inline-block text-left`}>
            <li>• Stok Hareket Özeti</li>
            <li>• Ambar Bazlı Stok Raporu</li>
            <li>• Sayım Fazlası / Eksiği Raporu</li>
            <li>• Tedarikçi Alış Performansı</li>
          </ul>
          <p className={`text-xs text-amber-600 mt-4 font-semibold`}>TODO: Her rapor için ayrı SQL sorgusu ve UI bileşeni eklenecek.</p>
        </div>
      </div>
    </div>
  );
}

