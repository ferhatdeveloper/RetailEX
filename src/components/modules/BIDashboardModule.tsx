/**
 * BI Dashboard & AI Analytics Module - İş Zekası ve Yapay Zeka
 */

import { useState } from 'react';
import { Brain, TrendingUp, BarChart3, PieChart, Zap } from 'lucide-react';

export function BIDashboardModule() {
  const [insights] = useState([
    { id: '1', type: 'prediction', title: 'Satış Tahmini', message: 'Önümüzdeki hafta %15 artış bekleniyor', confidence: 92 },
    { id: '2', type: 'recommendation', title: 'Stok Önerisi', message: 'Beyaz T-Shirt stoğu 3 gün içinde tükenebilir', confidence: 87 },
    { id: '3', type: 'insight', title: 'Müşteri Analizi', message: 'VIP müşterileriniz %23 daha fazla harcıyor', confidence: 95 },
    { id: '4', type: 'alert', title: 'Trend Uyarısı', message: 'Spor ayakkabı kategorisinde talep artışı', confidence: 78 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-8 h-8 text-purple-600" />
          BI Dashboard & Yapay Zeka
        </h1>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Analiz Başlat
        </button>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-600" />
          Yapay Zeka İçgörüleri
        </h2>
        <div className="space-y-3">
          {insights.map(insight => (
            <div key={insight.id} className="bg-white rounded-lg p-4 shadow border border-purple-100">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-purple-900">{insight.title}</h3>
                  <p className="text-sm text-gray-700 mt-1">{insight.message}</p>
                </div>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                  %{insight.confidence} güven
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Satış Trendi (AI Tahmini)
          </h3>
          <div className="h-64 flex items-end justify-around gap-2">
            {[65, 78, 82, 95, 88, 102, 115].map((value, idx) => (
              <div key={idx} className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg flex items-end justify-center pb-2" style={{ height: `${value}%` }}>
                <span className="text-xs text-white font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-green-600" />
            Kategori Dağılımı
          </h3>
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="w-48 h-48 rounded-full bg-gradient-to-br from-green-400 via-blue-400 to-purple-400 flex items-center justify-center mb-4">
                <div className="w-32 h-32 rounded-full bg-white flex items-center justify-center">
                  <p className="text-2xl font-bold text-gray-900">100%</p>
                </div>
              </div>
              <div className="flex justify-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span>Tekstil 45%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  <span>Ayakkabı 35%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                  <span>Aksesuar 20%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
          <TrendingUp className="w-8 h-8 mb-2 opacity-80" />
          <p className="text-sm opacity-90">Büyüme Oranı</p>
          <p className="text-3xl font-bold">+18.5%</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
          <Brain className="w-8 h-8 mb-2 opacity-80" />
          <p className="text-sm opacity-90">AI Güven Skoru</p>
          <p className="text-3xl font-bold">88/100</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
          <PieChart className="w-8 h-8 mb-2 opacity-80" />
          <p className="text-sm opacity-90">Tahmin Doğruluğu</p>
          <p className="text-3xl font-bold">92%</p>
        </div>
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-4 text-white">
          <Zap className="w-8 h-8 mb-2 opacity-80" />
          <p className="text-sm opacity-90">Otomatik Analiz</p>
          <p className="text-3xl font-bold">24/7</p>
        </div>
      </div>
    </div>
  );
}

