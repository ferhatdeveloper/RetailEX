// ğŸ–¥ï¸ DESKTOP SIDEBAR + ğŸ“± MOBILE OPTIMIZED Dashboard - Enterprise WMS
// ExRetailOS tasarımına göre yenilenmiş WMS Dashboard

import { useState, useEffect } from 'react';
import {
  Warehouse, Package, TrendingUp, TrendingDown, AlertCircle,
  Clock, ShoppingCart, Truck, CheckCircle, Box,
  BarChart3, ArrowUpRight, RefreshCw, ArrowDownRight,
  Loader2, Bell, Settings, Menu, LogOut, X, Home, Grid3x3, ChevronRight,
  RotateCcw, Map, FileCheck, Tags, ClipboardCheck, TrendingUpDown, Layers,
  Wrench, MapPin, DollarSign, Star, Smartphone, ThumbsUp, Factory,
  PackagePlus, Activity, Shield, CheckSquare, Users, BookOpen
} from 'lucide-react';
import type { DashboardStats, Alert as AlertType } from '../types';
import { formatCurrency, formatNumber, formatPercent, formatDateTime } from '../utils';
import { WarehouseSelector } from './WarehouseSelector';
import { LanguageSelector } from './LanguageSelector';
import { projectId, publicAnonKey } from '../utils/supabase/info'; // ğŸ†• IMPORT FROM SUPABASE INFO

import { LivePerformanceTV } from './LivePerformanceTV';
import { LiveGPSTrackingEnhanced } from './LiveGPSTrackingEnhanced';

interface DashboardProps {
  darkMode: boolean;
  onNavigate: (page: string) => void;
  onLogout?: () => void;
}

export function Dashboard({ darkMode, onNavigate, onLogout }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [selectedPeriod]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // ğŸ†• REAL API CALL TO WMS BACKEND
      const warehouseId = localStorage.getItem('wms_warehouse_id') || 'default';
      const supabaseUrl = `https://${projectId}.supabase.co`;

      console.log('ğŸ”Œ Connecting to WMS API:', supabaseUrl);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/dashboard/stats?warehouse_id=${warehouseId}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          }
        }
      );

      console.log('ğŸ“¡ API Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ API Data received:', result);

        if (result.success && result.data) {
          const apiStats = result.data;

          setStats({
            totalWarehouses: 5,
            activeWarehouses: 4,
            totalProducts: 1247,
            totalStockValue: apiStats.inventory_value || 458750000,
            totalStockItems: 15847,
            todayReceiving: {
              count: apiStats.today_receiving?.count || 0,
              quantity: apiStats.today_receiving?.quantity || 0,
              value: apiStats.today_receiving?.value || 0,
            },
            todayShipping: {
              count: apiStats.today_shipping?.count || 0,
              quantity: apiStats.today_shipping?.quantity || 0,
              value: apiStats.today_shipping?.value || 0,
            },
            todayTransfers: { count: 12, quantity: 845 },
            alerts: {
              critical: apiStats.alerts?.critical || 0,
              warning: apiStats.alerts?.warning || 0,
              info: 0,
            },
            picking: { pending: 34, inProgress: 12, completed: 156 },
            stockAccuracy: 98.7,
            spaceUtilization: 76.4,
            orderFulfillmentRate: 99.2
          });
        } else {
          console.warn('⚠️ API returned no data, using fallback');
          throw new Error('No data in API response');
        }
      } else {
        console.error('❌ API request failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`API returned ${response.status}`);
      }

      // Fetch alerts
      const alertsResponse = await fetch(
        `${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/alerts?warehouse_id=${warehouseId}&limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (alertsResponse.ok) {
        const alertsResult = await alertsResponse.json();
        if (alertsResult.success && alertsResult.data) {
          setAlerts(alertsResult.data.map((a: any) => ({
            id: a.id,
            type: a.alert_type,
            severity: a.severity,
            warehouseId: a.warehouse_id,
            warehouseName: 'Baghdad Merkez',
            productCode: a.product_id || '',
            productName: a.alert_message,
            message: a.alert_message,
            quantity: a.actual_value,
            threshold: a.threshold_value,
            isResolved: a.is_resolved,
            created_at: a.created_at,
          })));
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error('❌ Error loading dashboard data:', error);
      // Fallback to demo data on error
      setStats({
        totalWarehouses: 5,
        activeWarehouses: 4,
        totalProducts: 1247,
        totalStockValue: 458750000,
        totalStockItems: 15847,
        todayReceiving: { count: 0, quantity: 0, value: 0 },
        todayShipping: { count: 0, quantity: 0, value: 0 },
        todayTransfers: { count: 0, quantity: 0 },
        alerts: { critical: 0, warning: 0, info: 0 },
        picking: { pending: 0, inProgress: 0, completed: 0 },
        stockAccuracy: 0,
        spaceUtilization: 0,
        orderFulfillmentRate: 0
      });
      setIsLoading(false);
    }
  };

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';
  const sidebarClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  // ğŸ”¥ COMPLETE MODULE LIST - 20 ACTIVE MODULES
  const activeModules = [
    // Temel İşlemler (6)
    { id: 'receiving', icon: TrendingDown, name: 'Mal Kabul', color: 'text-green-500', highlight: false },
    { id: 'returns', icon: RotateCcw, name: 'İade/Geri Dönüşüm', color: 'text-orange-500', highlight: false },
    { id: 'issue', icon: TrendingUp, name: 'Sevkiyat/Yükleme', color: 'text-purple-500', highlight: false },
    { id: 'transfer', icon: Truck, name: 'Transfer İşlemleri', color: 'text-indigo-500', highlight: false },
    { id: 'counting', icon: ClipboardCheck, name: 'Sayım Yönetimi', color: 'text-yellow-500', highlight: false },
    { id: 'stock-query', icon: Package, name: 'Stok Sorgulama', color: 'text-blue-500', highlight: false },

    // Depo Yönetimi (3)
    { id: 'multi-warehouse', icon: Warehouse, name: 'Çoklu Depo', color: 'text-violet-500', highlight: false },
    { id: 'shelf-space', icon: Grid3x3, name: 'Raf Alanı', color: 'text-purple-500', highlight: false },
    { id: 'quality', icon: Shield, name: 'Kalite Kontrol', color: 'text-teal-500', highlight: false },

    // Lojistik & Optimizasyon (2)
    { id: 'vehicle-loading', icon: Truck, name: 'Araç Yükleme', color: 'text-blue-500', highlight: false },
    { id: 'order-splitting', icon: Package, name: 'Sipariş Bölme', color: 'text-green-500', highlight: false },

    // Analiz & Raporlama (5)
    { id: 'sales-velocity', icon: BarChart3, name: 'Satış Hızı', color: 'text-orange-500', highlight: false },
    { id: 'profit-loss', icon: TrendingUp, name: 'Kar-Zarar', color: 'text-blue-500', highlight: false },
    { id: 'reports', icon: BarChart3, name: 'Raporlama', color: 'text-pink-500', highlight: false },
    { id: 'performance', icon: Users, name: 'Performans', color: 'text-amber-500', highlight: false },
    { id: 'live-performance-tv', icon: Activity, name: 'Live TV', color: 'text-red-500', highlight: false },

    // Satınalma & Fiyatlandırma (2)
    { id: 'auto-reorder', icon: RefreshCw, name: 'Otomatik Sipariş', color: 'text-cyan-500', highlight: false },
    { id: 'pricing-cost', icon: DollarSign, name: 'Fiyatlandırma', color: 'text-green-500', highlight: false },

    // Operasyonel (3)
    { id: 'cashier-management', icon: Users, name: 'Personel Yönetimi', color: 'text-purple-500', highlight: false },
    { id: 'live-gps-tracking-enhanced', icon: MapPin, name: 'Canlı Konum', color: 'text-red-500', highlight: false },
    { id: 'alerts', icon: AlertCircle, name: 'Uyarı Merkezi', color: 'text-red-500', highlight: false },
    { id: 'tasks', icon: CheckSquare, name: 'Görev Yönetimi', color: 'text-cyan-500', highlight: false },
  ];

  // Coming Soon Modules (3)
  const comingSoonModules = [
    { id: 'outbound-ops', icon: ThumbsUp, name: 'Çıkış İşlemleri', badge: 'v2.1', color: 'text-purple-500', count: undefined },
    { id: 'production-output', icon: Factory, name: 'Üretme Çıkış', badge: 'v2.1', color: 'text-orange-500' },
    { id: 'route-optimization', icon: MapPin, name: 'Rota Optimizasyonu', badge: 'v2.2', color: 'text-pink-500' },
  ];

  // Mobile Main Menu Items
  const mobileMainMenu = [
    { id: 'mobile-pos', icon: Smartphone, name: 'Mobil Satış', subtitle: 'Mobile POS', badge: 'Hızlı satış ve tahsilat', badgeColor: 'text-purple-600', bgColor: 'bg-purple-500' },
    { id: 'purchase', icon: ShoppingCart, name: 'Satınalma Yönetimi', subtitle: 'Purchase Management', badge: '1 pending orders', badgeColor: 'text-orange-600', bgColor: 'bg-orange-500' },
    { id: 'inventory-count', icon: ClipboardCheck, name: 'Sayım', subtitle: 'Inventory Count', badge: '1 active session', badgeColor: 'text-red-600', bgColor: 'bg-red-500' },
    { id: 'product-info', icon: Package, name: 'Ürün Bilgisi', subtitle: 'Product Information', badgeColor: 'text-green-600', bgColor: 'bg-green-500' },
    { id: 'sales-management', icon: DollarSign, name: 'Satış Yönetimi', subtitle: 'Sales Management', badgeColor: 'text-blue-600', bgColor: 'bg-blue-500' },
    { id: 'receiving', icon: PackagePlus, name: 'Mal Kabul', subtitle: 'Goods Receiving', badge: 'Barkod scanner ile hızlı kabul', badgeColor: 'text-green-600', bgColor: 'bg-green-600' },
    { id: 'issue', icon: TrendingUp, name: 'Mal Çıkış', subtitle: 'Goods Issue', badgeColor: 'text-orange-600', bgColor: 'bg-orange-600' },
  ];

  const totalModules = 25; // 22 aktif + 3 yakında
  const activeCount = 22; // Aktif modüller
  const incomingCount = 23;
  const alertCount = 5;

  if (isLoading) {
    return (
      <div className={`min-h-screen ${bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <Loader2 className={`w-12 h-12 ${textClass} animate-spin mx-auto mb-4`} />
          <p className={textMutedClass}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${bgClass}`}>
      {/* ğŸ–¥ï¸ DESKTOP SIDEBAR */}
      <aside className={`hidden md:flex flex-col w-64 ${sidebarClass} border-r overflow-y-auto`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Grid3x3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={`text-base font-bold ${textClass}`}>WMS Menü</h1>
              <p className="text-xs text-gray-500">{totalModules} Modül</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-blue-50'} rounded-lg p-2 text-center`}>
              <p className="text-lg font-bold text-blue-600">{activeCount}</p>
              <p className="text-xs text-gray-500">Aktif</p>
            </div>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-green-50'} rounded-lg p-2 text-center`}>
              <p className="text-lg font-bold text-green-600">{incomingCount}</p>
              <p className="text-xs text-gray-500">Gelen</p>
            </div>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-red-50'} rounded-lg p-2 text-center`}>
              <p className="text-lg font-bold text-red-600">{alertCount}</p>
              <p className="text-xs text-gray-500">Uyarı</p>
            </div>
          </div>
        </div>

        {/* Active Modules - 2 Column Grid */}
        <nav className="flex-1 p-3 pb-6">
          <h3 className="text-xs uppercase font-semibold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            AKTİF MODÜLLER
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {activeModules.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${item.highlight
                    ? 'border-2 border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                    } active:scale-95`}
                >
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className={`text-xs font-medium ${textClass} text-center leading-tight`}>
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Coming Soon Section */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              YAKINDA AKTİF OLACAKLAR
            </h3>
            <div className="space-y-2">
              {comingSoonModules.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => alert(`${item.name} yakında aktif olacak`)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
                      } opacity-70 transition-all`}
                  >
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${textClass}`}>{item.name}</p>
                      {item.count && (
                        <p className="text-xs text-gray-500">({item.count} Modül)</p>
                      )}
                    </div>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        {onLogout && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Çıkış Yap</span>
            </button>
          </div>
        )}
      </aside>

      {/* ğŸ“± MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* ğŸ¯ MODERN WMS APPBAR */}
        <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 shadow-lg sticky top-0 z-40">
          <div className="px-3 md:px-4 lg:px-6">
            <div className="flex items-center justify-between h-12 md:h-14">
              {/* LEFT - Logo & WMS Title */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Menu className="w-6 h-6 text-white" />
                </button>

                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 md:w-10 md:h-10 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg">
                    <Warehouse className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-white font-bold text-sm md:text-base leading-none">Depo Yönetim Sistemi</h1>
                    <p className="text-blue-100 text-[10px] leading-none mt-0.5">Warehouse Management System</p>
                  </div>
                </div>
              </div>

              {/* CENTER - Current Module Name (Desktop Only) */}
              <div className="flex items-center gap-2">
                <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-lg">
                  <Package className="w-4 h-4 text-white" />
                  <span className="text-white text-sm font-medium">Genel Bakış</span>
                </div>

              </div>

              {/* RIGHT - Actions */}
              <div className="flex items-center gap-2">
                {/* Language Selector */}
                <div className="hidden md:block">
                  <LanguageSelector darkMode={true} />
                </div>

                {/* Clock */}
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

                {/* Quick Actions */}
                <button
                  onClick={() => setShowQuickActions(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Hızlı İşlemler"
                >
                  <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                </button>

                {/* Refresh */}
                <button
                  onClick={loadDashboardData}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Yenile"
                >
                  <RefreshCw className="w-5 h-5 text-white" />
                </button>

                {/* Live Status */}
                <div className="w-2.5 h-2.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" title="Canlı" />
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-6">
          <div className="p-4 md:p-6 space-y-6">
            {/* Period Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedPeriod('today')}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${selectedPeriod === 'today'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Bugün
              </button>
              <button
                onClick={() => setSelectedPeriod('week')}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${selectedPeriod === 'week'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Hafta
              </button>
              <button
                onClick={() => setSelectedPeriod('month')}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${selectedPeriod === 'month'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Ay
              </button>
            </div>

            {/* KPI Cards - 4 Column */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Toplam Stok */}
              <div className={`${cardClass} border rounded-xl p-4 relative overflow-hidden`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-green-500" />
                </div>
                <p className={`text-sm ${textMutedClass} mb-1`}>Toplam Stok</p>
                <p className={`text-2xl font-bold ${textClass} mb-1`}>
                  {formatCurrency(stats?.totalStockValue || 0)}
                </p>
                <p className="text-sm text-green-500 font-medium">+12,5%</p>
              </div>

              {/* Gelen */}
              <div className={`${cardClass} border rounded-xl p-4 relative overflow-hidden`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-white" />
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700">
                    {stats?.todayReceiving.count}
                  </span>
                </div>
                <p className={`text-sm ${textMutedClass} mb-1`}>Gelen</p>
                <p className={`text-2xl font-bold ${textClass} mb-1`}>
                  {formatNumber(stats?.todayReceiving.quantity || 0)}
                </p>
                <p className="text-sm text-gray-500">{formatCurrency(stats?.todayReceiving.value || 0)}</p>
              </div>

              {/* Giden */}
              <div className={`${cardClass} border rounded-xl p-4 relative overflow-hidden`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-orange-100 text-orange-700">
                    {stats?.todayShipping.count}
                  </span>
                </div>
                <p className={`text-sm ${textMutedClass} mb-1`}>Giden</p>
                <p className={`text-2xl font-bold ${textClass} mb-1`}>
                  {formatNumber(stats?.todayShipping.quantity || 0)}
                </p>
                <p className="text-sm text-gray-500">{formatCurrency(stats?.todayShipping.value || 0)}</p>
              </div>

              {/* Uyarılar */}
              <div className={`${cardClass} border rounded-xl p-4 relative overflow-hidden`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700">
                    {stats?.alerts.critical}
                  </span>
                </div>
                <p className={`text-sm ${textMutedClass} mb-1`}>Uyarılar</p>
                <p className={`text-2xl font-bold ${textClass} mb-1`}>
                  {(stats?.alerts.critical || 0) + (stats?.alerts.warning || 0)}
                </p>
                <p className="text-sm text-gray-500">{stats?.alerts.info} bilgi</p>
              </div>
            </div>

            {/* Kritik Uyarılar */}
            {alerts.length > 0 && (
              <div className={`${cardClass} border rounded-xl overflow-hidden`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className={`text-lg font-bold ${textClass}`}>Kritik Uyarılar</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-3">
                    {alerts.slice(0, 3).map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-lg border ${darkMode ? 'bg-red-900/20 border-red-500/50' : 'bg-red-50 border-red-200'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${textClass}`}>{alert.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {alert.warehouseName} • {alert.productName}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Hızlı İşlemler */}
            <div className={`${cardClass} border rounded-xl overflow-hidden`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className={`text-lg font-bold ${textClass}`}>Hızlı İşlemler</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Mal Kabul - Yeşil */}
                  <button
                    onClick={() => onNavigate('receiving')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <TrendingDown className="w-10 h-10" />
                    <span className="text-base font-bold">Mal Kabul</span>
                  </button>

                  {/* Mal Çıkış - Turuncu */}
                  <button
                    onClick={() => onNavigate('issue')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <TrendingUp className="w-10 h-10" />
                    <span className="text-base font-bold">Mal Çıkış</span>
                  </button>

                  {/* Transfer - Mavi */}
                  <button
                    onClick={() => onNavigate('transfer')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <Truck className="w-10 h-10" />
                    <span className="text-base font-bold">Transfer</span>
                  </button>

                  {/* Sayım - Mor */}
                  <button
                    onClick={() => onNavigate('counting')}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <BarChart3 className="w-10 h-10" />
                    <span className="text-base font-bold">Sayım</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ğŸ“± MOBILE MENU OVERLAY */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className={`fixed top-0 left-0 w-80 h-full ${sidebarClass} shadow-2xl z-50 md:hidden overflow-y-auto`}>
            {/* Mobile Menu Header */}
            <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} sticky top-0 ${sidebarClass} z-10`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Grid3x3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${textClass}`}>WMS Menü</h3>
                    <p className="text-xs text-gray-500">{totalModules} Modül</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <X className={`w-6 h-6 ${textClass}`} />
                </button>
              </div>

              {/* Quick Stats in Mobile Menu */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-blue-50'} rounded-lg p-2 text-center`}>
                  <p className="text-lg font-bold text-blue-600">{activeCount}</p>
                  <p className="text-xs text-gray-500">Aktif</p>
                </div>
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-green-50'} rounded-lg p-2 text-center`}>
                  <p className="text-lg font-bold text-green-600">{incomingCount}</p>
                  <p className="text-xs text-gray-500">Gelen</p>
                </div>
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-red-50'} rounded-lg p-2 text-center`}>
                  <p className="text-lg font-bold text-red-600">{alertCount}</p>
                  <p className="text-xs text-gray-500">Uyarı</p>
                </div>
              </div>
            </div>

            {/* Mobile Menu Content */}
            <div className="p-4">
              <h3 className="text-xs uppercase font-semibold text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                AKTİF MODÜLLER
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {activeModules.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        setShowMobileMenu(false);
                      }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl ${item.highlight
                        ? 'border-2 border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                        } transition-all active:scale-95`}
                    >
                      <Icon className={`w-6 h-6 ${item.color}`} />
                      <span className={`text-xs font-medium ${textClass} text-center leading-tight`}>{item.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Coming Soon in Mobile */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  YAKINDA AKTİF OLACAKLAR
                </h3>
                <div className="space-y-2">
                  {comingSoonModules.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => alert(`${item.name} yakında aktif olacak`)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'
                          } opacity-70`}
                      >
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <div className="flex-1 text-left">
                          <p className={`text-sm font-medium ${textClass}`}>{item.name}</p>
                          {item.count && (
                            <p className="text-xs text-gray-500">({item.count} Modül)</p>
                          )}
                        </div>
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ⭐ QUICK ACTIONS MODAL - New Design */}
      {showQuickActions && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setShowQuickActions(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50">
            <div className={`${cardClass} border rounded-2xl shadow-2xl overflow-hidden`}>
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-yellow-500 to-orange-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Star className="w-6 h-6 text-white fill-white" />
                    <h3 className="text-xl font-bold text-white">Hızlı İşlemler</h3>
                  </div>
                  <button
                    onClick={() => setShowQuickActions(false)}
                    className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Content - Mobile Main Menu Style */}
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-3">
                  {mobileMainMenu.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setShowQuickActions(false);
                        }}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                          } transition-all active:scale-98`}
                      >
                        <div className={`w-12 h-12 ${item.bgColor} rounded-xl flex items-center justify-center`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-base font-bold ${textClass}`}>{item.name}</p>
                          <p className="text-xs text-gray-500">{item.subtitle}</p>
                          {item.badge && (
                            <p className={`text-xs ${item.badgeColor} mt-1`}>ğŸ“¦ {item.badge}</p>
                          )}
                        </div>
                        <ChevronRight className={`w-5 h-5 ${textMutedClass}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ğŸ¢ COMPANY INFO MODAL */}
      {showCompanyModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setShowCompanyModal(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50">
            <div className={`${cardClass} border rounded-2xl shadow-2xl overflow-hidden`}>
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Firma Bilgileri</h3>
                      <p className="text-sm text-white/70">Company Information</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCompanyModal(false)}
                    className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Firma Adı */}
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">Firma Adı</p>
                  <p className={`text-lg font-bold ${textClass}`}>Retail CO Holding A.Ş.</p>
                </div>

                {/* Dönem */}
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">Dönem</p>
                  <p className={`text-lg font-bold ${textClass}`}>2025</p>
                </div>

                {/* Vergi No */}
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">Vergi Numarası</p>
                  <p className={`text-base font-semibold ${textClass}`}>1234567890</p>
                </div>

                {/* Para Birimi */}
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">Para Birimi</p>
                  <p className={`text-base font-semibold ${textClass}`}>IQD (Iraqi Dinar)</p>
                </div>

                {/* Adres */}
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">Adres</p>
                  <p className={`text-sm ${textClass}`}>Baghdad, Iraq - Al Karrada District</p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowCompanyModal(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
