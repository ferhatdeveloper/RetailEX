import { useState } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import {
  BarChart3, TrendingUp, Banknote, Package, Users,
  ShoppingCart, Calendar, FileText, Printer, Download,
  PieChart, LineChart, Activity, Target, Percent,
  Clock, Award, TrendingDown, RefreshCw, Archive,
  CheckCircle, XCircle, AlertCircle, Zap, FileSpreadsheet,
  Plus, Calculator
} from 'lucide-react';
import type { Sale, Product } from '../../App';
import { exportService, chartDataService } from '../../services/exportService';
import { toast } from 'sonner';

interface ReportsProps {
  sales: Sale[];
  products: Product[];
}

type ReportCategory = 'sales' | 'stock' | 'finance' | 'customer' | 'pos' | 'accounting' | 'performance' | 'all';
type TimeFilter = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export function Reports({ sales, products }: ReportsProps) {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');

  const reportCategories = [
    {
      id: 'sales',
      title: 'Satış Raporları',
      icon: ShoppingCart,
      color: 'blue',
      reports: [
        { name: 'Günlük Satış Raporu', desc: 'Günlük satış özeti ve detayları', icon: Calendar, count: 'Z Raporu' },
        { name: 'Haftalık Satış Raporu', desc: 'Haftalık satış trend analizi', icon: TrendingUp, count: '7 Gün' },
        { name: 'Aylık Satış Raporu', desc: 'Aylık satış performansı', icon: Calendar, count: '30 Gün' },
        { name: 'Kategoriye Göre Satış', desc: 'Ürün kategorileri bazında satış', icon: PieChart, count: (sales?.length || 0).toString() },
      ]
    },
    {
      id: 'stock',
      title: 'Stok & Envanter Raporları',
      icon: Package,
      color: 'green',
      reports: [
        { name: 'Güncel Stok Durumu', desc: 'Tüm ürünlerin anlık stok durumu', icon: Package, count: (products?.length || 0).toString() },
        { name: 'Düşük Stok Uyarısı', desc: 'Kritik seviyedeki ürünler', icon: AlertCircle, count: (products?.filter(p => p.stock < 10).length || 0).toString() },
      ]
    },
    {
      id: 'finance',
      title: 'Finans & Muhasebe Raporları',
      icon: Banknote,
      color: 'emerald',
      reports: [
        { name: 'Günlük Kasa Raporu', desc: 'Kasadaki nakit durumu', icon: Banknote, count: 'Anlık' },
        { name: 'Kar-Zarar Tablosu', desc: 'Gelir-gider analizi', icon: TrendingUp, count: 'Aylık' },
      ]
    },
    {
      id: 'performance',
      title: 'Performans & Analiz',
      icon: TrendingUp,
      color: 'pink',
      reports: [
        { name: 'Satış Trendi', desc: 'Satış eğilim analizi', icon: LineChart, count: 'Real-time' },
        { name: 'Kar Marjı Analizi', desc: 'Ürün bazlı kar marjları', icon: Percent, count: 'Detaylı' },
      ]
    }
  ];

  const filteredCategories = selectedCategory === 'all'
    ? reportCategories
    : reportCategories.filter(cat => cat.id === selectedCategory);

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* Corporate Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100 shadow-inner">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight uppercase">İş Analitiği ve Karar Destek</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Kurumsal Veri Yönetimi • Real-time Monitoring</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100/80 p-1 rounded-lg border border-gray-200 mr-2">
              <button className="px-3 py-1 text-[10px] font-bold text-gray-600 hover:bg-white rounded transition-all">GÜNLÜK</button>
              <button className="px-3 py-1 text-[10px] font-bold text-white bg-blue-600 rounded shadow-sm">AYLIK</button>
              <button className="px-3 py-1 text-[10px] font-bold text-gray-600 hover:bg-white rounded transition-all">YILLIK</button>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-[11px] font-bold rounded hover:bg-gray-50 transition-all shadow-sm">
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>DIŞA AKTAR</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-bold rounded hover:bg-blue-700 transition-all shadow-md">
              <Printer className="w-3.5 h-3.5" />
              <span>YAZDIR</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col pt-4">
          <div className="px-4 mb-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Analiz Modülleri</span>
          </div>
          <nav className="flex-1 px-2 space-y-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === 'all'
                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              <Activity className="w-4 h-4" />
              GENEL BAKIŞ
            </button>
            {reportCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as ReportCategory)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === cat.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-100'
                  : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <cat.icon className={`w-4 h-4 ${selectedCategory === cat.id ? 'text-blue-600' : 'text-gray-400'}`} />
                {cat.title.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Periyot Satış</span>
                <ShoppingCart className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{sales?.length || 0}</span>
                <span className="text-[10px] font-bold text-green-600 flex items-center">
                  <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> %4.2
                </span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Toplam Ciro</span>
                <Banknote className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">
                  {formatNumber(sales?.reduce((s, x) => s + x.total, 0) || 0, 0, false)}
                </span>
                <span className="text-[10px] font-bold text-green-600 flex items-center">
                  <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> %12.1
                </span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stok Değeri</span>
                <Package className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                {formatNumber(products?.reduce((s, p) => s + (p.price * p.stock), 0) || 0, 0, false)}
              </h3>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kayıtlı Müşteri</span>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">1,248</h3>
            </div>
          </div>

          {/* Report Grid */}
          <div className="space-y-8">
            {filteredCategories.map((category) => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-4 border-l-4 border-blue-600 pl-3">
                  <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest italic">{category.title}</h2>
                  <div className="h-px bg-gray-200 flex-1 ml-4 overflow-hidden"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.reports.map((report, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between h-32"
                    >
                      <div className="flex justify-between items-start">
                        <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                          <report.icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
                        </div>
                        {report.count && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase tracking-tighter">
                            {report.count}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-[11px] font-bold text-gray-900 uppercase tracking-wide mb-1 transition-colors group-hover:text-blue-700">
                          {report.name}
                        </h4>
                        <p className="text-[10px] text-gray-500 line-clamp-1">{report.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
