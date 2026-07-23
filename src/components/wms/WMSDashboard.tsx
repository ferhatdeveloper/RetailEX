/**
 * WMS Dashboard - Warehouse Management System Ana Dashboard
 * 6 kategori kartı ve hızlı istatistikler
 */

import React from 'react';
import {
  Package,
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  ClipboardCheck,
  TrendingUp,
  BarChart3,
  AlertCircle,
  Activity,
  TrendingDown
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Translations } from '../../locales/translations';
import { WMSLayout } from './WMSLayout';

interface WMSDashboardProps {
  onModuleSelect: (moduleId: string) => void;
  onBack?: () => void;
}

export function WMSDashboard({ onModuleSelect, onBack }: WMSDashboardProps) {
  const { darkMode } = useTheme();
  const { t } = useLanguage();

  const categories: Array<{
    id: string;
    titleKey: keyof Translations;
    descKey: keyof Translations;
    icon: React.ReactNode;
    color: string;
    modules: number;
  }> = [
    {
      id: 'entry',
      titleKey: 'entryOperations',
      descKey: 'goodsReceiving',
      icon: <ArrowDown className="w-8 h-8" />,
      color: 'from-green-500 to-emerald-600',
      modules: 3
    },
    {
      id: 'exit',
      titleKey: 'exitOperations',
      descKey: 'warehouseTransferWaybill',
      icon: <ArrowUp className="w-8 h-8" />,
      color: 'from-[var(--asin-accent,#1FA8A0)] to-cyan-600',
      modules: 3
    },
    {
      id: 'transfer',
      titleKey: 'warehouseTransfer',
      descKey: 'transferMovement',
      icon: <ArrowRightLeft className="w-8 h-8" />,
      color: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-primary-hover,#163A52)]',
      modules: 4
    },
    {
      id: 'counting',
      titleKey: 'stockCount',
      descKey: 'countingControl',
      icon: <ClipboardCheck className="w-8 h-8" />,
      color: 'from-orange-500 to-red-600',
      modules: 4
    },
    {
      id: 'planning',
      titleKey: 'planningOptimization',
      descKey: 'taskManagement',
      icon: <TrendingUp className="w-8 h-8" />,
      color: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-accent,#1FA8A0)]',
      modules: 6
    },
    {
      id: 'reports',
      titleKey: 'reportsAndAnalysis',
      descKey: 'reportingDesc',
      icon: <BarChart3 className="w-8 h-8" />,
      color: 'from-[var(--asin-accent,#1FA8A0)] to-cyan-600',
      modules: 10
    },
  ];

  // Mock statistics
  const stats = {
    totalStock: 125000,
    totalValue: 2500000000,
    todayMovements: 450,
    pendingTasks: 12,
    alerts: 3
  };

  return (
    <WMSLayout onBack={onBack}>
      <div className={`min-h-full p-6 ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-50 via-[var(--asin-accent-muted,#D5F0EE)]/40 to-gray-50'}`}>
        {/* Header */}
        <div className={`mb-8 p-6 rounded-2xl ${darkMode
          ? 'bg-[var(--asin-primary,#0E2433)]/80 border border-[var(--asin-accent,#1FA8A0)]/30'
          : 'bg-[var(--asin-accent-muted,#D5F0EE)]/60 border border-[var(--asin-accent,#1FA8A0)]/35'
          } backdrop-blur-sm`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-[var(--asin-primary,#0E2433)]'}`}>
                {t.wmsModule}
              </h1>
              <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t.inventoryManagement}
              </p>
            </div>
            <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-lg ${darkMode ? 'bg-[var(--asin-accent,#1FA8A0)]/15' : 'bg-[var(--asin-accent-muted,#D5F0EE)]'
              }`}>
              <Activity className={`w-5 h-5 ${darkMode ? 'text-[var(--asin-accent,#1FA8A0)]' : 'text-[var(--asin-accent,#1FA8A0)]'}`} />
              <span className={`font-semibold ${darkMode ? 'text-[var(--asin-accent-muted,#D5F0EE)]' : 'text-[var(--asin-primary,#0E2433)]'}`}>
                {t.wsConnected}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className={`group p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-xl hover:scale-105 ${darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700 hover:border-[var(--asin-accent,#1FA8A0)]'
            : 'bg-gradient-to-br from-white to-[var(--asin-accent-muted,#D5F0EE)]/50 border-gray-200 hover:border-[var(--asin-accent,#1FA8A0)]'
            }`}>
            <div className={`flex items-center justify-between mb-3`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.totalStock}
              </div>
              <Package className={`w-4 h-4 ${darkMode ? 'text-[var(--asin-accent,#1FA8A0)]' : 'text-[var(--asin-accent,#1FA8A0)]'}`} />
            </div>
            <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {stats.totalStock.toLocaleString()}
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              {t.product}
            </div>
          </div>

          <div className={`group p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-xl hover:scale-105 ${darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700 hover:border-green-500'
            : 'bg-gradient-to-br from-white to-green-50/50 border-gray-200 hover:border-green-400'
            }`}>
            <div className={`flex items-center justify-between mb-3`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.stockValue}
              </div>
              <TrendingUp className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {(stats.totalValue / 1000000).toFixed(1)}M
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              IQD
            </div>
          </div>

          <div className={`group p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-xl hover:scale-105 ${darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700 hover:border-purple-500'
            : 'bg-gradient-to-br from-white to-purple-50/50 border-gray-200 hover:border-purple-400'
            }`}>
            <div className={`flex items-center justify-between mb-3`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.historyMovements}
              </div>
              <Activity className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {stats.todayMovements}
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              {t.actionLabel}
            </div>
          </div>

          <div className={`group p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-xl hover:scale-105 ${darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700 hover:border-orange-500'
            : 'bg-gradient-to-br from-white to-orange-50/50 border-gray-200 hover:border-orange-400'
            }`}>
            <div className={`flex items-center justify-between mb-3`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.taskManagement}
              </div>
              <ClipboardCheck className={`w-4 h-4 text-orange-500`} />
            </div>
            <div className={`text-3xl font-bold mb-1 text-orange-600`}>
              {stats.pendingTasks}
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              -
            </div>
          </div>

          <div className={`group p-5 rounded-xl border-2 transition-all duration-300 hover:shadow-xl hover:scale-105 ${darkMode
            ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700 hover:border-red-500'
            : 'bg-gradient-to-br from-white to-red-50/50 border-gray-200 hover:border-red-400'
            }`}>
            <div className={`flex items-center justify-between mb-3`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t.alertCenter}
              </div>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className={`text-3xl font-bold mb-1 text-red-600 flex items-center gap-2`}>
              {stats.alerts}
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              {t.activeStatus}
            </div>
          </div>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onModuleSelect(category.id)}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${category.color} p-8 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl border-2 border-white/20 hover:border-white/40`}
            >
              <div className="relative z-10">
                <div className="mb-6 flex items-center justify-between">
                  <div className="rounded-xl bg-white/20 backdrop-blur-sm p-4 shadow-lg group-hover:bg-white/30 transition-colors">
                    {category.icon}
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-extrabold drop-shadow-lg">{category.modules}</div>
                    <div className="text-sm font-semibold opacity-90 uppercase tracking-wide">Modül</div>
                  </div>
                </div>
                <h3 className="text-2xl font-bold mb-3 drop-shadow-md">
                  {String(t[category.titleKey as keyof typeof t] ?? '') as React.ReactNode}
                </h3>
                <p className="text-sm opacity-90 mb-6 leading-relaxed">
                  {String(t[category.descKey as keyof typeof t] ?? '') as React.ReactNode}
                </p>
                <div className="flex items-center gap-3 text-sm font-semibold bg-white/20 px-4 py-2 rounded-lg group-hover:bg-white/30 transition-colors w-fit">
                  <span>{t.viewDetails}</span>
                  <ArrowRightLeft className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
              {/* Decorative background effects */}
              <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full bg-white/10 blur-3xl group-hover:bg-white/15 transition-colors" />
              <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5 blur-2xl" />
              {/* Shine effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/0 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full" />
            </button>
          ))}
        </div>

        {/* Recent Activities */}
        <div className={`p-6 rounded-2xl border-2 shadow-lg ${darkMode
          ? 'bg-gradient-to-br from-gray-800/90 to-gray-800/70 border-gray-700 backdrop-blur-sm'
          : 'bg-gradient-to-br from-white to-blue-50/30 border-gray-200 backdrop-blur-sm'
          }`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${darkMode ? 'bg-blue-900/50' : 'bg-blue-100'
                }`}>
                <Activity className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {t.historyMovements}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t.inventoryManagement}
                </p>
              </div>
            </div>
            <button className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}>
              {t.viewDetails}
            </button>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: darkMode ? '#4b5563 #374151' : '#cbd5e1 #ffffff',
          }}>
            <style>{`
              div::-webkit-scrollbar {
                width: 8px;
              }
              div::-webkit-scrollbar-track {
                background: ${darkMode ? '#374151' : '#ffffff'};
                border-radius: 4px;
              }
              div::-webkit-scrollbar-thumb {
                background: ${darkMode ? '#4b5563' : '#cbd5e1'};
                border-radius: 4px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background: ${darkMode ? '#6b7280' : '#94a3b8'};
              }
            `}</style>
            {[
              { action: 'Mal Kabul', user: 'Ahmet Yılmaz', time: '5 dakika önce', type: 'entry' },
              { action: 'Sevkiyat Hazırlık', user: 'Mehmet Demir', time: '15 dakika önce', type: 'exit' },
              { action: 'Sayım Giriş', user: 'Ayşe Kaya', time: '1 saat önce', type: 'counting' },
              { action: 'Depo Transferi', user: 'Ali Veli', time: '2 saat önce', type: 'transfer' },
              { action: 'Üretimden Giriş', user: 'Fatma Şahin', time: '3 saat önce', type: 'entry' },
            ].map((activity, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${darkMode
                  ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                  : 'bg-white/80 border-gray-200 hover:bg-white'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full shadow-lg ${activity.type === 'entry' ? 'bg-green-500' :
                    activity.type === 'exit' ? 'bg-blue-500' :
                      activity.type === 'transfer' ? 'bg-purple-500' :
                        'bg-orange-500'
                    }`} />
                  <div>
                    <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {activity.action}
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-2 mt-1`}>
                      <span>{activity.user}</span>
                      <span>•</span>
                      <span>{activity.time}</span>
                    </div>
                  </div>
                </div>
                <ArrowRightLeft className={`w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </WMSLayout>
  );
}


