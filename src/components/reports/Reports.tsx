import { useMemo, useState } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import {
  BarChart3, TrendingUp, Banknote, Package, Users,
  ShoppingCart, Calendar, Printer, Download,
  PieChart, LineChart, Activity, Percent,
  AlertCircle,
} from 'lucide-react';
import type { Sale, Product } from '../../App';
import { useLanguage } from '../../contexts/LanguageContext';

interface ReportsProps {
  sales: Sale[];
  products: Product[];
}

type ReportCategory = 'sales' | 'stock' | 'finance' | 'customer' | 'pos' | 'accounting' | 'performance' | 'all';
type TimeFilter = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export function Reports({ sales, products }: ReportsProps) {
  const { tm } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');

  const reportCategories = useMemo(
    () => [
      {
        id: 'sales' as const,
        titleKey: 'rptLegacySalesCat',
        icon: ShoppingCart,
        color: 'blue',
        reports: [
          { nameKey: 'rptLegacyDailySales', descKey: 'rptLegacyDailySalesDesc', icon: Calendar, count: tm('zRaporu') },
          { nameKey: 'rptLegacyWeeklySales', descKey: 'rptLegacyWeeklySalesDesc', icon: TrendingUp, count: tm('rptLegacy7Days') },
          { nameKey: 'rptLegacyMonthlySales', descKey: 'rptLegacyMonthlySalesDesc', icon: Calendar, count: tm('rptLegacy30Days') },
          { nameKey: 'rptLegacyByCategory', descKey: 'rptLegacyByCategoryDesc', icon: PieChart, count: (sales?.length || 0).toString() },
        ],
      },
      {
        id: 'stock' as const,
        titleKey: 'rptLegacyStockCat',
        icon: Package,
        color: 'green',
        reports: [
          { nameKey: 'rptLegacyCurrentStock', descKey: 'rptLegacyCurrentStockDesc', icon: Package, count: (products?.length || 0).toString() },
          {
            nameKey: 'rptLegacyLowStock',
            descKey: 'rptLegacyLowStockDesc',
            icon: AlertCircle,
            count: (products?.filter((p) => p.stock < 10).length || 0).toString(),
          },
        ],
      },
      {
        id: 'finance' as const,
        titleKey: 'rptLegacyFinanceCat',
        icon: Banknote,
        color: 'emerald',
        reports: [
          { nameKey: 'rptLegacyDailyCash', descKey: 'rptLegacyDailyCashDesc', icon: Banknote, count: tm('rptLegacyInstant') },
          { nameKey: 'rptLegacyPL', descKey: 'rptLegacyPLDesc', icon: TrendingUp, count: tm('rptLegacyMonthlyTag') },
        ],
      },
      {
        id: 'performance' as const,
        titleKey: 'rptLegacyPerfCat',
        icon: TrendingUp,
        color: 'pink',
        reports: [
          { nameKey: 'rptLegacyTrend', descKey: 'rptLegacyTrendDesc', icon: LineChart, count: 'Real-time' },
          { nameKey: 'rptLegacyMargin', descKey: 'rptLegacyMarginDesc', icon: Percent, count: tm('rptLegacyDetailed') },
        ],
      },
    ],
    [sales, products, tm, timeFilter],
  );

  const filteredCategories = selectedCategory === 'all'
    ? reportCategories
    : reportCategories.filter((cat) => cat.id === selectedCategory);

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100 shadow-inner">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight uppercase">{tm('rptLegacyTitle')}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">{tm('rptLegacySubtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100/80 p-1 rounded-lg border border-gray-200 mr-2">
              <button className="px-3 py-1 text-[10px] font-bold text-gray-600 hover:bg-white rounded transition-all">{tm('rptLegacyDaily')}</button>
              <button className="px-3 py-1 text-[10px] font-bold text-white bg-blue-600 rounded shadow-sm">{tm('rptLegacyMonthly')}</button>
              <button className="px-3 py-1 text-[10px] font-bold text-gray-600 hover:bg-white rounded transition-all">{tm('rptLegacyYearly')}</button>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-[11px] font-bold rounded hover:bg-gray-50 transition-all shadow-sm">
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>{tm('rptLegacyExport')}</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-bold rounded hover:bg-blue-700 transition-all shadow-md">
              <Printer className="w-3.5 h-3.5" />
              <span>{tm('rptLegacyPrint')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col pt-4">
          <div className="px-4 mb-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tm('rptLegacyModules')}</span>
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
              {tm('rptLegacyOverview')}
            </button>
            {reportCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as ReportCategory)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === cat.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-100'
                  : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <cat.icon className={`w-4 h-4 ${selectedCategory === cat.id ? 'text-blue-600' : 'text-gray-400'}`} />
                {tm(cat.titleKey).toLocaleUpperCase()}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tm('rptLegacyPeriodSales')}</span>
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
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tm('rptLegacyTotalRevenue')}</span>
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
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tm('rptLegacyStockValue')}</span>
                <Package className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                {formatNumber(products?.reduce((s, p) => s + (p.price * p.stock), 0) || 0, 0, false)}
              </h3>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tm('rptLegacyRegisteredCustomers')}</span>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">1,248</h3>
            </div>
          </div>

          <div className="space-y-8">
            {filteredCategories.map((category) => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-4 border-l-4 border-blue-600 pl-3">
                  <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest italic">{tm(category.titleKey)}</h2>
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
                          {tm(report.nameKey)}
                        </h4>
                        <p className="text-[10px] text-gray-500 line-clamp-1">{tm(report.descKey)}</p>
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
