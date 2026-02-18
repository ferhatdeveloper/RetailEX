/**
 * Development Progress Widget
 * Geliştirme ilerlemesini gösterir
 */

import { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function DevelopmentProgressWidget() {
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = {
    database: { total: 37, completed: 37, percentage: 100 },
    modules: { total: 29, completed: 29, percentage: 100 },
    critical: { total: 5, completed: 5, percentage: 100 },
    medium: { total: 12, completed: 12, percentage: 100 },
    low: { total: 12, completed: 12, percentage: 100 },
  };

  const criticalMissing = [
    { name: '✅ Kullanıcı Yönetimi', status: 'completed', priority: 'completed' },
    { name: '✅ Gider Yönetimi', status: 'completed', priority: 'completed' },
    { name: '✅ Para Birimi Yönetimi', status: 'completed', priority: 'completed' },
    { name: '✅ İndirim Yönetimi', status: 'completed', priority: 'completed' },
    { name: '✅ Kasa Yönetimi', status: 'completed', priority: 'completed' },
  ];

  const totalPercentage = 100;

  if (!isExpanded) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-4 py-3 rounded-lg shadow-lg transition-all flex items-center gap-2 animate-pulse"
        >
          <CheckCircle className="w-5 h-5" />
          <div className="text-left">
            <div className="text-xs opacity-90">ğŸ‰ Tamamlandı!</div>
            <div className="font-bold">{totalPercentage}% Hazır</div>
          </div>
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 bg-white rounded-lg shadow-2xl border border-gray-200 w-96">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-t-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-medium">Geliştirme Durumu</h3>
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="hover:bg-white/10 p-1 rounded transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
        
        {/* Overall Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Genel İlerleme</span>
            <span className="font-bold">{totalPercentage}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${totalPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 space-y-3">
        {/* Database */}
        <div className="flex items-center justify-between p-2 bg-green-50 rounded">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-700">Veritabanı</span>
          </div>
          <div className="text-sm font-medium text-green-700">
            {stats.database.completed}/{stats.database.total} ✅
          </div>
        </div>

        {/* Modules */}
        <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-gray-700">Modüller</span>
          </div>
          <div className="text-sm font-medium text-orange-700">
            {stats.modules.completed}/{stats.modules.total} ({stats.modules.percentage}%)
          </div>
        </div>

        {/* Critical */}
        <div className="flex items-center justify-between p-2 bg-red-50 rounded">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-gray-700">Kritik Eksikler</span>
          </div>
          <div className="text-sm font-medium text-red-700">
            {stats.critical.total} modül
          </div>
        </div>
      </div>

      {/* Critical Missing List */}
      <div className="border-t px-4 py-3 bg-green-50">
        <h4 className="text-xs uppercase tracking-wide text-green-700 font-semibold mb-2 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          ✅ TÜM KRİTİK MODÜLLER TAMAMLANDI!
        </h4>
        <div className="space-y-2">
          {criticalMissing.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm p-2 bg-white rounded border border-green-200"
            >
              <span className="text-green-900 font-medium">{item.name}</span>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          ))}
        </div>
      </div>

      {/* Success Message */}
      <div className="border-t px-4 py-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-b-lg">
        <div className="text-center space-y-2">
          <div className="text-2xl">ğŸ‰</div>
          <p className="text-sm font-bold text-green-900">%100 Tamamlandı!</p>
          <p className="text-xs text-gray-600">
            29/29 modül kullanıma hazır<br />
            API entegrasyonları bekliyor
          </p>
        </div>
        
        <a
          href="/FINAL_RAPOR_TAMAMLANDI.md"
          target="_blank"
          className="mt-3 block text-center text-xs bg-green-600 hover:bg-green-700 text-white py-2 rounded transition-colors font-medium"
        >
          ğŸ“Š Final Raporu Görüntüle →
        </a>
      </div>
    </div>
  );
}
