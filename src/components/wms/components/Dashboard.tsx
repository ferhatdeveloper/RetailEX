// 🖥️ DESKTOP SIDEBAR + 📱 MOBILE OPTIMIZED Dashboard
// ExWhms tasarımı temel alınarak PostgreSQL entegrasyonu ile yenilendi

import { useState, useEffect, useCallback } from 'react';
import {
  Warehouse, Package, TrendingUp, TrendingDown, AlertCircle,
  Clock, Truck, BarChart3, ArrowUpRight, RefreshCw, ArrowDownRight,
  Loader2, Menu, X, Grid3x3, ChevronRight,
  RotateCcw, ClipboardCheck,
  MapPin, DollarSign, Star, ThumbsUp, Factory,
  Activity, Shield, CheckSquare, Users
} from 'lucide-react';
import {
  getDashboardStats, getLowStockProducts,
  WMSDashboardStats, WMSProduct
} from '../../../services/wmsService';
import { useLanguage } from '../../../contexts/LanguageContext';

interface DashboardProps {
  darkMode: boolean;
  onNavigate: (page: string) => void;
  onLogout?: () => void;
}

// ─── Inline WmsPageHeader ─────────────────────────────────────────────────────

function WmsPageHeader({
  title, subtitle, onMenuToggle, actions, darkMode: _dm,
}: {
  title: string;
  subtitle?: string;
  onMenuToggle: () => void;
  actions?: React.ReactNode;
  darkMode?: boolean;
}) {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg sticky top-0 z-50">
      <div className="px-4 py-3 sm:px-6 flex items-center justify-between min-h-[64px]">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white md:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/10">
              <Warehouse className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none tracking-tight">{title}</h1>
              {subtitle && (
                <p className="text-blue-100 text-[11px] leading-none mt-1 opacity-80 uppercase tracking-wider font-semibold">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">{actions}</div>
      </div>
    </div>
  );
}

// ─── Static module config (icons + ids, names resolved via tm() in component) ──

const MODULE_ICONS = {
  receiving:    TrendingDown,   returns:     RotateCcw,     issue:       TrendingUp,
  transfer:     Truck,          counting:    ClipboardCheck, 'stock-query': Package,
  'multi-warehouse': Warehouse, 'shelf-space': Grid3x3,    quality:     Shield,
  'vehicle-loading': Truck,     'order-splitting': Package, 'sales-velocity': BarChart3,
  'profit-loss': TrendingUp,    reports:     BarChart3,     performance: Users,
  'live-performance-tv': Activity, 'auto-reorder': RefreshCw, 'pricing-cost': DollarSign,
  'cashier-management': Users,  'live-gps-tracking-enhanced': MapPin, alerts: AlertCircle,
  tasks:        CheckSquare,    slotting:    Grid3x3,       labor:       Users, yard: MapPin,
  'outbound-ops': ThumbsUp,     'production-output': Factory, 'route-optimization': MapPin,
} as const;

// ─── Dashboard Component ──────────────────────────────────────────────────────

export function Dashboard({ darkMode, onNavigate, onLogout }: DashboardProps) {
  const { tm } = useLanguage();

  const [stats, setStats] = useState<WMSDashboardStats | null>(null);
  const [lowStock, setLowStock] = useState<WMSProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Module arrays — defined inside component so tm() works
  const activeModules = [
    { id: 'receiving',   icon: MODULE_ICONS.receiving,          nameKey: 'wmsReceiving',       color: 'text-green-500',  highlight: false },
    { id: 'returns',     icon: MODULE_ICONS.returns,            nameKey: 'wmsReturnRecycling', color: 'text-orange-500', highlight: false },
    { id: 'issue',       icon: MODULE_ICONS.issue,              nameKey: 'wmsDispatch',        color: 'text-red-500',    highlight: false },
    { id: 'transfer',    icon: MODULE_ICONS.transfer,           nameKey: 'wmsTransfer',        color: 'text-blue-500',   highlight: false },
    { id: 'counting',    icon: MODULE_ICONS.counting,           nameKey: 'wmsCount',           color: 'text-purple-500', highlight: false },
    { id: 'stock-query', icon: MODULE_ICONS['stock-query'],     nameKey: 'wmsStockQuery',      color: 'text-teal-500',   highlight: false },
  ];

  const comingSoonModules = [
    { id: 'multi-warehouse',            icon: MODULE_ICONS['multi-warehouse'],            nameKey: 'multiWarehouse',    color: 'text-blue-500',   badge: 'Q2 2025' },
    { id: 'shelf-space',                icon: MODULE_ICONS['shelf-space'],                nameKey: 'shelfSpace',        color: 'text-green-500',  badge: 'Q2 2025' },
    { id: 'quality',                    icon: MODULE_ICONS.quality,                      nameKey: 'qualityControl',    color: 'text-purple-500', badge: 'Q3 2025' },
    { id: 'vehicle-loading',            icon: MODULE_ICONS['vehicle-loading'],            nameKey: 'vehicleLoading',    color: 'text-orange-500', badge: 'Q3 2025' },
    { id: 'order-splitting',            icon: MODULE_ICONS['order-splitting'],            nameKey: 'orderSplitting',    color: 'text-teal-500',   badge: 'Q3 2025' },
    { id: 'sales-velocity',             icon: MODULE_ICONS['sales-velocity'],             nameKey: 'salesVelocity',     color: 'text-pink-500',   badge: 'Q4 2025' },
    { id: 'profit-loss',                icon: MODULE_ICONS['profit-loss'],               nameKey: 'profitLoss',        color: 'text-yellow-500', badge: 'Q4 2025' },
    { id: 'reports',                    icon: MODULE_ICONS.reports,                      nameKey: 'wmsReports',        color: 'text-indigo-500', badge: 'Q4 2025' },
    { id: 'performance',                icon: MODULE_ICONS.performance,                  nameKey: 'performanceLabel',  color: 'text-red-500',    badge: 'Q4 2025' },
    { id: 'live-performance-tv',        icon: MODULE_ICONS['live-performance-tv'],        nameKey: 'liveTV',            color: 'text-green-500',  badge: 'Q1 2026' },
    { id: 'auto-reorder',               icon: MODULE_ICONS['auto-reorder'],              nameKey: 'autoReorder',       color: 'text-blue-500',   badge: 'Q1 2026' },
    { id: 'pricing-cost',               icon: MODULE_ICONS['pricing-cost'],              nameKey: 'pricing',           color: 'text-yellow-500', badge: 'Q1 2026' },
    { id: 'cashier-management',         icon: MODULE_ICONS['cashier-management'],        nameKey: 'staffManagement',   color: 'text-purple-500', badge: 'Q1 2026' },
    { id: 'live-gps-tracking-enhanced', icon: MODULE_ICONS['live-gps-tracking-enhanced'], nameKey: 'liveLocation',    color: 'text-red-500',    badge: 'Q2 2026' },
    { id: 'alerts',                     icon: MODULE_ICONS.alerts,                       nameKey: 'alertCenter',       color: 'text-orange-500', badge: 'Q2 2026' },
    { id: 'tasks',                      icon: MODULE_ICONS.tasks,                        nameKey: 'taskManagement',    color: 'text-teal-500',   badge: 'Q2 2026' },
    { id: 'slotting',                   icon: MODULE_ICONS.slotting,                     nameKey: 'shelfOptimization', color: 'text-green-500',  badge: 'Q2 2026' },
    { id: 'labor',                      icon: MODULE_ICONS.labor,                        nameKey: 'laborForce',        color: 'text-blue-500',   badge: 'Q3 2026' },
    { id: 'yard',                       icon: MODULE_ICONS.yard,                         nameKey: 'yardManagement',    color: 'text-orange-500', badge: 'Q3 2026' },
    { id: 'outbound-ops',               icon: MODULE_ICONS['outbound-ops'],              nameKey: 'outboundOps',       color: 'text-green-500',  badge: 'Q3 2026' },
    { id: 'production-output',          icon: MODULE_ICONS['production-output'],         nameKey: 'productionOutput',  color: 'text-red-500',    badge: 'Q3 2026' },
    { id: 'route-optimization',         icon: MODULE_ICONS['route-optimization'],        nameKey: 'routeOptimization', color: 'text-blue-500',   badge: 'Q4 2026' },
  ];

  const mobileMainMenu = [
    { id: 'receiving',   icon: MODULE_ICONS.receiving,        nameKey: 'wmsReceiving',  subtitleKey: 'receivingSubtitle',   badgeKey: 'quickReceivingBadge',  bgColor: 'bg-green-500',  badgeColor: 'text-green-600' },
    { id: 'issue',       icon: MODULE_ICONS.issue,            nameKey: 'wmsDispatch',   subtitleKey: 'dispatchSubtitle',    badgeKey: 'createShipmentBadge',  bgColor: 'bg-orange-500', badgeColor: 'text-orange-600' },
    { id: 'counting',    icon: MODULE_ICONS.counting,         nameKey: 'wmsCount',      subtitleKey: 'countSubtitle',       badgeKey: 'startInventoryBadge',  bgColor: 'bg-purple-500', badgeColor: 'text-purple-600' },
    { id: 'stock-query', icon: MODULE_ICONS['stock-query'],   nameKey: 'wmsStockQuery', subtitleKey: 'stockQuerySubtitle',  badgeKey: 'realtimeStockBadge',   bgColor: 'bg-teal-500',   badgeColor: 'text-teal-600' },
    { id: 'transfer',    icon: MODULE_ICONS.transfer,         nameKey: 'wmsTransfer',   subtitleKey: 'transferSubtitle',    badgeKey: 'warehouseTransferBadge', bgColor: 'bg-blue-500', badgeColor: 'text-blue-600' },
    { id: 'reports',     icon: MODULE_ICONS.reports,          nameKey: 'wmsReports',    subtitleKey: 'reportsSubtitle',     badgeKey: 'reportsAvailableBadge', bgColor: 'bg-pink-500',  badgeColor: 'text-pink-600' },
  ];

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, ls] = await Promise.all([getDashboardStats(), getLowStockProducts()]);
      setStats(s);
      setLowStock(ls.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // Theme classes
  const bgClass      = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass    = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass    = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMuted    = darkMode ? 'text-gray-400' : 'text-gray-600';
  const sidebarClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  const totalModules  = activeModules.length + comingSoonModules.length;
  const lowStockCount = stats?.lowStockCount || 0;

  if (isLoading) {
    return (
      <div className={`min-h-screen ${bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <Loader2 className={`w-12 h-12 ${textClass} animate-spin mx-auto mb-4`} />
          <p className={textMuted}>{tm('loading')}</p>
        </div>
      </div>
    );
  }

  // ── SIDEBAR ──────────────────────────────────────────────────────────────────
  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Sidebar Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${mobile ? 'sticky top-0 z-10 ' + sidebarClass : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Grid3x3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={`text-base font-bold ${textClass}`}>{tm('wmsMenu')}</h1>
              <p className="text-xs text-gray-500">{totalModules} {tm('wmsModuleCount')}</p>
            </div>
          </div>
          {mobile && (
            <button onClick={() => setShowMobileMenu(false)} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
              <X className={`w-6 h-6 ${textClass}`} />
            </button>
          )}
        </div>
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`${darkMode ? 'bg-gray-700' : 'bg-blue-50'} rounded-lg p-2 text-center`}>
            <p className="text-lg font-bold text-blue-600">{stats?.totalProducts || 0}</p>
            <p className="text-xs text-gray-500">{tm('productLabel')}</p>
          </div>
          <div className={`${darkMode ? 'bg-gray-700' : 'bg-green-50'} rounded-lg p-2 text-center`}>
            <p className="text-lg font-bold text-green-600">{stats?.activeStores || 0}</p>
            <p className="text-xs text-gray-500">{tm('storeLabel')}</p>
          </div>
          <div className={`${darkMode ? 'bg-gray-700' : 'bg-red-50'} rounded-lg p-2 text-center`}>
            <p className="text-lg font-bold text-red-600">{lowStockCount}</p>
            <p className="text-xs text-gray-500">{tm('alertLabel')}</p>
          </div>
        </div>
      </div>

      {/* Active modules 2-column grid */}
      <nav className="flex-1 overflow-y-auto p-3 pb-6">
        <h3 className="text-xs uppercase font-semibold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
          {tm('activeModulesLabel')}
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {activeModules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); if (mobile) setShowMobileMenu(false); }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all active:scale-95 ${
                  item.highlight
                    ? 'border-2 border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span className={`text-xs font-medium ${textClass} text-center leading-tight`}>{tm(item.nameKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Coming soon */}
        <div className={`pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h3 className="text-xs uppercase font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            {tm('comingSoonLabel')}
          </h3>
          <div className="space-y-2">
            {comingSoonModules.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => alert(`${tm(item.nameKey)} — ${tm('comingSoonLabel')}`)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg opacity-70 transition-all ${
                    darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-medium ${textClass}`}>{tm(item.nameKey)}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400">
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Logout */}
      {onLogout && (
        <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
          >
            <X className="w-4 h-4" />
            <span className="text-sm font-medium">{tm('logout')}</span>
          </button>
        </div>
      )}
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className={`flex h-screen ${bgClass}`}>
      {/* 🖥️ Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col w-64 ${sidebarClass} border-r overflow-y-auto`}>
        <Sidebar />
      </aside>

      {/* 📱 Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <WmsPageHeader
          title={tm('wmsTitle')}
          subtitle={tm('wmsSubtitleFull')}
          onMenuToggle={() => setShowMobileMenu(!showMobileMenu)}
          darkMode={darkMode}
          actions={
            <>
              {/* Clock - desktop */}
              <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-white/10 backdrop-blur-sm rounded-lg">
                <Clock className="w-4 h-4 text-white" />
                <div className="text-left">
                  <p className="text-white text-xs font-semibold leading-none tabular-nums">
                    {currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-blue-100 text-[10px] leading-none mt-0.5">
                    {currentTime.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>

              {/* Quick actions */}
              <button
                onClick={() => setShowQuickActions(true)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={tm('quickActions')}
              >
                <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
              </button>

              {/* Refresh */}
              <button
                onClick={loadDashboardData}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={tm('refresh')}
              >
                <RefreshCw className="w-5 h-5 text-white" />
              </button>

              {/* Live dot */}
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" title={tm('online')} />
            </>
          }
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-6">
          <div className="p-4 md:p-6 space-y-6">

            {/* Period tabs */}
            <div className="flex items-center gap-2">
              {(['today', 'week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
                    selectedPeriod === p
                      ? 'bg-blue-600 text-white border border-blue-600'
                      : darkMode
                        ? 'border border-gray-700 text-gray-300 hover:bg-gray-800'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p === 'today' ? tm('today') : p === 'week' ? tm('week') : tm('month')}
                </button>
              ))}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Products */}
              <div className={`${cardClass} border rounded-lg p-6 hover:shadow-md transition-shadow`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs text-gray-500">{tm('stockLabel')}</span>
                </div>
                <div className="mt-4">
                  <div className={`text-3xl font-bold ${textClass} tabular-nums`}>
                    {(stats?.totalProducts || 0).toLocaleString('tr-TR')}
                  </div>
                  <div className={`text-sm ${textMuted} mt-1`}>{tm('totalProducts')}</div>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">{tm('activeRecord')}</span>
                  </div>
                </div>
              </div>

              {/* Critical Stock */}
              <div className={`${cardClass} border rounded-lg p-6 hover:shadow-md transition-shadow`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <span className="px-2 py-1 border border-red-600 text-red-600 rounded text-xs font-semibold">
                    {lowStockCount}
                  </span>
                </div>
                <div className="mt-4">
                  <div className={`text-3xl font-bold ${textClass} tabular-nums`}>
                    {lowStockCount}
                  </div>
                  <div className={`text-sm ${textMuted} mt-1`}>{tm('criticalStock')}</div>
                  {lowStockCount > 0 ? (
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-500 font-medium">{tm('needsAttention')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-sm text-green-600 font-medium">✓ {tm('stockNormal')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Count */}
              <div className={`${cardClass} border rounded-lg p-6 hover:shadow-md transition-shadow`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5 text-white" />
                  </div>
                  <span className="px-2 py-1 border border-orange-600 text-orange-600 rounded text-xs font-semibold">
                    {stats?.activeCountingSlips || 0}
                  </span>
                </div>
                <div className="mt-4">
                  <div className={`text-3xl font-bold ${textClass} tabular-nums`}>
                    {stats?.activeCountingSlips || 0}
                  </div>
                  <div className={`text-sm ${textMuted} mt-1`}>{tm('activeCountLabel')}</div>
                  <div className="text-sm text-gray-500 mt-2">
                    {stats?.pendingTransfers || 0} {tm('pendingTransfers')}
                  </div>
                </div>
              </div>

              {/* Active Stores */}
              <div className={`${cardClass} border rounded-lg p-6 hover:shadow-md transition-shadow`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                    <Warehouse className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs text-gray-500">{tm('active')}</span>
                </div>
                <div className="mt-4">
                  <div className={`text-3xl font-bold ${textClass} tabular-nums`}>
                    {stats?.activeStores || 0}
                  </div>
                  <div className={`text-sm ${textMuted} mt-1`}>{tm('activeStoreLabel')}</div>
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-sm text-green-600 font-medium">✓ {tm('online')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Critical stock alerts */}
            {lowStock.length > 0 && (
              <div className={`${cardClass} border rounded-xl overflow-hidden`}>
                <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <h3 className={`text-lg font-bold ${textClass}`}>⚠️ {tm('criticalStockAlerts')}</h3>
                </div>
                <div className="p-4 space-y-3">
                  {lowStock.map((product) => (
                    <div
                      key={product.id}
                      className={`p-4 rounded-lg border ${
                        darkMode ? 'bg-red-900/20 border-red-500/50' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className={`text-sm font-bold ${textClass}`}>{product.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {product.code} • {tm('stockLabel')}: {product.stock} / Min: {product.min_stock}
                          </p>
                        </div>
                        <button
                          onClick={() => onNavigate('stock-query')}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {tm('detail')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className={`${cardClass} border rounded-xl overflow-hidden`}>
              <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <h3 className={`text-lg font-bold ${textClass}`}>{tm('quickActions')}</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    onClick={() => onNavigate('receiving')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <TrendingDown className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsReceiving')}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('issue')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <TrendingUp className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsDispatch')}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('transfer')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <Truck className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsTransfer')}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('counting')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <BarChart3 className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsCount')}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('stock-query')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <Package className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsStockQuery')}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('reports')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <BarChart3 className="w-10 h-10" />
                    <span className="text-base font-bold">{tm('wmsReports')}</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* 📱 Mobile Menu Overlay */}
      {showMobileMenu && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setShowMobileMenu(false)} />
          <div className={`fixed top-0 left-0 w-80 h-full ${sidebarClass} shadow-2xl z-50 md:hidden overflow-y-auto`}>
            <Sidebar mobile />
          </div>
        </>
      )}

      {/* ⭐ Quick Actions Modal */}
      {showQuickActions && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowQuickActions(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50">
            <div className={`${cardClass} border rounded-2xl shadow-2xl overflow-hidden`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-yellow-500 to-orange-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Star className="w-6 h-6 text-white fill-white" />
                    <h3 className="text-xl font-bold text-white">{tm('quickActions')}</h3>
                  </div>
                  <button onClick={() => setShowQuickActions(false)} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-[70vh] overflow-y-auto space-y-3">
                {mobileMainMenu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); setShowQuickActions(false); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all active:scale-[0.98] ${
                        darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className={`w-12 h-12 ${item.bgColor} rounded-xl flex items-center justify-center`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-base font-bold ${textClass}`}>{tm(item.nameKey)}</p>
                        <p className="text-xs text-gray-500">{tm(item.subtitleKey)}</p>
                        <p className={`text-xs ${item.badgeColor} mt-1`}>📦 {tm(item.badgeKey)}</p>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${textMuted}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


