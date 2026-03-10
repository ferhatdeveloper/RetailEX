import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Users,
  AlertTriangle, Clock, Zap, FileText, UserPlus, PackagePlus,
  BarChart3, Layers, ArrowRight, TrendingUpDown, Wallet, Settings, X,
  Truck, Receipt, Building, Target, Wrench, Calendar, Globe, RefreshCw,
  CreditCard, Shield, Database, Percent, Award, GitBranch, Calculator,
  ClipboardList, Send, Mail, Phone, Smartphone, Bell, Download, Tag, UserCog,
  FileSpreadsheet
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Product, Customer, Sale } from '../../core/types';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import { invoke } from '@tauri-apps/api/core';
import { useLanguage } from '../../contexts/LanguageContext';
import { logger } from '../../services/loggingService';

interface DashboardShortcut {
  id?: number;
  user_id: string;
  shortcut_id: string;
  label: string;
  icon: string;
  color: string;
  category: string;
  sort_order: number;
}

interface DashboardModuleProps {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  setCurrentScreen: (screen: string) => void;
  menuMode?: number;
}

export function DashboardModule({ products, customers, sales, setCurrentScreen, menuMode = 0 }: DashboardModuleProps) {
  const { t } = useLanguage();
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tüm mevcut modüller
  const baseActions = [
    // Satış & POS
    { id: 'newsale', icon: ShoppingCart, label: t.newSale, color: 'from-blue-500 to-blue-600', category: t.salesOperations },
    { id: 'salesorder', icon: ClipboardList, label: t.salesOrders, color: 'from-blue-400 to-blue-500', category: t.salesOperations },
    { id: 'salesinvoice', icon: FileText, label: t.salesInvoices, color: 'from-blue-600 to-blue-700', category: t.salesOperations },

    // Ürün & Stok
    { id: 'addproduct', icon: PackagePlus, label: t.addProduct, color: 'from-green-500 to-green-600', category: t.stockWarehouse },
    { id: 'products', icon: Package, label: t.productManagement, color: 'from-green-400 to-green-500', category: t.stockWarehouse },
    { id: 'stock', icon: Layers, label: t.stockManagement, color: 'from-green-600 to-green-700', category: t.stockWarehouse },

    // Müşteri & CRM
    { id: 'addcustomer', icon: UserPlus, label: t.addCustomer, color: 'from-purple-500 to-purple-600', category: t.customerCards },
    { id: 'customers', icon: Users, label: t.customerManagement, color: 'from-purple-400 to-purple-500', category: t.customerCards },
    { id: 'crm', icon: Target, label: t.crmModule, color: 'from-purple-600 to-purple-700', category: t.customerCards },

    // Finans & Muhasebe
    { id: 'finance', icon: DollarSign, label: t.cashBank, color: 'from-orange-500 to-orange-600', category: t.financeAccounting },
    { id: 'accounting', icon: Calculator, label: t.accounting, color: 'from-orange-400 to-orange-500', category: t.financeAccounting },
    { id: 'budget', icon: Wallet, label: t.budget, color: 'from-orange-600 to-orange-700', category: t.financeAccounting },

    // Faturalar
    { id: 'invoices', icon: Receipt, label: t.invoices, color: 'from-pink-500 to-pink-600', category: t.invoice },
    { id: 'purchaseinvoice', icon: FileText, label: t.purchaseInvoices, color: 'from-pink-400 to-pink-500', category: t.invoice },
    { id: 'etransform', icon: Send, label: t.eInvoiceArchive, color: 'from-pink-600 to-pink-700', category: t.invoice },

    // Raporlar
    { id: 'reports', icon: BarChart3, label: t.reportsAnalysis, color: 'from-indigo-500 to-indigo-600', category: t.reportsAnalysis },
    { id: 'dashboard', icon: TrendingUpDown, label: t.dashboard, color: 'from-indigo-400 to-indigo-500', category: t.reportsAnalysis },

    // Satın Alma & Tedarik
    { id: 'purchase', icon: ShoppingCart, label: t.purchasing, color: 'from-teal-500 to-teal-600', category: t.purchasing },
    { id: 'suppliers', icon: Truck, label: t.supplierCards, color: 'from-teal-400 to-teal-500', category: t.purchasing },

    // Lojistik
    { id: 'logistics', icon: Truck, label: t.logistics, color: 'from-cyan-500 to-cyan-600', category: t.logistics },

    // Üretim
    { id: 'production', icon: GitBranch, label: t.production, color: 'from-amber-500 to-amber-600', category: t.production },
    { id: 'quality', icon: Award, label: t.qualityControl, color: 'from-amber-400 to-amber-500', category: t.production },

    // İnsan Kaynakları
    { id: 'hr', icon: UserCog, label: t.humanResources, color: 'from-rose-500 to-rose-600', category: t.humanResources },

    // Diğer
    { id: 'settings', icon: Settings, label: t.settings, color: 'from-gray-500 to-gray-600', category: t.systemSettings },
    { id: 'integrations', icon: Zap, label: t.integrations, color: 'from-yellow-500 to-yellow-600', category: t.systemSettings },
    { id: 'excel', icon: FileSpreadsheet, label: t.excelImportExport || 'Excel İçe/Dışa Aktar', color: 'from-emerald-500 to-emerald-600', category: t.systemSettings },
  ];

  // Filter actions based on menuMode
  const allAvailableActions = useMemo(() => {
    if (menuMode === 1) {
      // Hide specific categories or IDs in simplified mode
      const hiddenIds = ['crm', 'logistics', 'production', 'quality', 'hr', 'settings', 'integrations', 'budget'];
      const hiddenCategories = ['Lojistik', 'Üretim', 'İK', 'Sistem'];
      return baseActions.filter((a: any) =>
        !hiddenIds.includes(a.id) &&
        !hiddenCategories.includes(a.category)
      );
    }
    return baseActions;
  }, [menuMode]);

  // Load shortcuts from database with localStorage migration
  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        setIsLoading(true);
        const shortcuts = await invoke<DashboardShortcut[]>('get_dashboard_shortcuts', {
          userId: 'default'
        });

        if (shortcuts.length === 0) {
          // Check for localStorage migration
          const saved = localStorage.getItem('retailos_quick_actions');
          if (saved) {
            console.log('Migrating shortcuts from localStorage to database...');
            const oldShortcuts = JSON.parse(saved) as string[];
            const validOldShortcuts = oldShortcuts.filter((id: string) => allAvailableActions.some((a: any) => a.id === id));

            const newShortcuts: DashboardShortcut[] = validOldShortcuts.map((id, index) => {
              const action = allAvailableActions.find(a => a.id === id);
              if (!action) return null;
              return {
                user_id: 'default',
                shortcut_id: id,
                label: action.label,
                icon: (action.icon as any).name || id,
                color: action.color,
                category: action.category,
                sort_order: index
              };
            }).filter(s => s !== null) as DashboardShortcut[];

            await invoke('save_dashboard_shortcuts', {
              userId: 'default',
              shortcuts: newShortcuts
            });
            localStorage.removeItem('retailos_quick_actions');
            setSelectedActions(validOldShortcuts);
          } else {
            // Set defaults
            const defaults = ['newsale', 'addproduct', 'addcustomer', 'invoices', 'reports', 'stock'].filter(id =>
              allAvailableActions.some(a => a.id === id)
            );
            const defaultShortcuts: DashboardShortcut[] = defaults.map((id, index) => {
              const action = allAvailableActions.find(a => a.id === id);
              if (!action) return null;
              return {
                user_id: 'default',
                shortcut_id: id,
                label: action.label,
                icon: (action.icon as any).name || id,
                color: action.color,
                category: action.category,
                sort_order: index
              };
            }).filter(s => s !== null) as DashboardShortcut[];

            await invoke('save_dashboard_shortcuts', {
              userId: 'default',
              shortcuts: defaultShortcuts
            });
            setSelectedActions(defaults);
          }
        } else {
          // Load from database - filter out any that are no longer available in current mode
          const shortcutIds = shortcuts
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(s => s.shortcut_id)
            .filter((id: string) => allAvailableActions.some((a: any) => a.id === id));
          setSelectedActions(shortcutIds);
        }
      } catch (error) {
        console.error('Failed to load shortcuts:', error);
        // Fallback to mode-appropriate defaults on error
        const defaults = ['newsale', 'addproduct', 'addcustomer', 'invoices', 'reports', 'stock'].filter(id =>
          allAvailableActions.some(a => a.id === id)
        );
        setSelectedActions(defaults);
      } finally {
        setIsLoading(false);
      }
    };
    loadShortcuts();
  }, [allAvailableActions]); // Reload when available actions change (e.g. menu mode change)

  // Save shortcuts to database
  const saveQuickActions = async () => {
    try {
      const shortcuts: DashboardShortcut[] = selectedActions.map((id, index) => {
        const action = allAvailableActions.find(a => a.id === id);
        if (!action) return null;
        return {
          user_id: 'default',
          shortcut_id: id,
          label: action.label,
          icon: (action.icon as any).name || id,
          color: action.color,
          category: action.category,
          sort_order: index
        };
      }).filter(s => s !== null) as DashboardShortcut[];

      await invoke('save_dashboard_shortcuts', {
        userId: 'default',
        shortcuts
      });
      setShowCustomizeModal(false);
    } catch (error) {
      logger.crudError('DashboardModule', 'saveShortcuts', error);
      alert(t.shortcutsSaveError || 'Kısayollar kaydedilemedi. Lütfen tekrar deneyin.');
    }
  };

  // Toggle action selection
  const toggleAction = (actionId: string) => {
    if (selectedActions.includes(actionId)) {
      setSelectedActions(selectedActions.filter(id => id !== actionId));
    } else {
      if (selectedActions.length < 8) {
        setSelectedActions([...selectedActions, actionId]);
      }
    }
  };

  const currentQuickActions = useMemo(() => {
    return selectedActions.map((id: string) => allAvailableActions.find((a: any) => a.id === id)).filter(Boolean) as typeof allAvailableActions;
  }, [selectedActions, allAvailableActions]);

  // Group actions by category
  const groupedActions = useMemo(() => {
    return allAvailableActions.reduce((acc: any, action: any) => {
      if (!acc[action.category]) {
        acc[action.category] = [];
      }
      acc[action.category].push(action);
      return acc;
    }, {} as Record<string, typeof allAvailableActions>);
  }, [allAvailableActions]);

  // Today's sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysSales = sales.filter(s => new Date(s.date) >= today);
  const totalRevenue = todaysSales.reduce((sum, s) => sum + s.total, 0);

  // Yesterday's sales for comparison
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySales = sales.filter(s => {
    const saleDate = new Date(s.date);
    return saleDate >= yesterday && saleDate < today;
  });
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);

  const revenueChange = yesterdayRevenue > 0
    ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : 0;

  // This week's data
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);
  const weekRevenue = weekSales.reduce((sum, s) => sum + s.total, 0);

  // Stock value
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
  const totalStockSaleValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const potentialProfit = totalStockSaleValue - totalStockValue;

  // Low stock products
  const lowStockProducts = products.filter(p => p.stock < 30);
  const criticalStockProducts = products.filter(p => p.stock < 10);

  // Top selling products (by revenue)
  const productSales = sales.reduce((acc, sale) => {
    sale.items.forEach((item: any) => {
      if (!acc[item.productId]) {
        acc[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0
        };
      }
      acc[item.productId].quantity += item.quantity;
      acc[item.productId].revenue += item.total;
    });
    return acc;
  }, {} as Record<string, { name: string; quantity: number; revenue: number }>);

  const topProducts = Object.values(productSales)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5);

  // Sales by payment method
  const paymentData = sales.reduce((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
    return acc;
  }, {} as Record<string, number>);

  const paymentChartData = Object.entries(paymentData).map(([name, value]) => ({
    name,
    value
  }));

  // Sales trend (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    return {
      date: date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      revenue: 0,
      count: 0
    };
  });

  sales.forEach(sale => {
    const saleDate = new Date(sale.date);
    const dayIndex = last7Days.findIndex(day => {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - (6 - last7Days.indexOf(day)));
      return saleDate.toDateString() === checkDate.toDateString();
    });
    if (dayIndex !== -1) {
      last7Days[dayIndex].revenue += sale.total;
      last7Days[dayIndex].count += 1;
    }
  });

  // Category distribution
  const categoryData = products.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = {
        name: product.category,
        value: 0,
        count: 0
      };
    }
    acc[product.category].value += product.stock * product.price;
    acc[product.category].count += product.stock;
    return acc;
  }, {} as Record<string, { name: string; value: number; count: number }>);

  const categoryChartData = Object.values(categoryData);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100 scrollbar-thin scrollbar-thumb-gray-300">
      {/* Modern Minimal Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg text-white">{t.dashboard || 'Dashboard'}</h2>
            <p className="text-blue-100 text-[10px] mt-0.5">{t.welcomeDashboard || 'Hoş geldiniz, işletme performansınızı takip edin'}</p>
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-[10px]">{new Date().toLocaleDateString(t.locale || 'tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p className="text-blue-200 text-[9px] mt-0.5">{new Date().toLocaleTimeString(t.locale || 'tr-TR')}</p>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Quick Actions - Hızlı Kısayollar */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm text-gray-800">{t.quickAccess || 'Hızlı Erişim'}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {currentQuickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => {
                    if (action.id === 'newsale') setCurrentScreen('salesinvoice');
                    else if (action.id === 'addproduct') setCurrentScreen('products');
                    else if (action.id === 'addcustomer') setCurrentScreen('customers');
                    else setCurrentScreen(action.id);
                  }}
                  className={`group bg-gradient-to-br ${action.color} rounded-lg p-2 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center group-hover:bg-white/30 transition-all">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-center">{action.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-right mt-1">
            <button
              className="text-[10px] text-blue-500 hover:text-blue-600 font-medium"
              onClick={() => setShowCustomizeModal(true)}
            >
              {t.editQuickAccess || 'Hızlı Erişimleri Düzenle'}
            </button>
          </div>
        </div>

        {/* Kurumsal Özet Panel - Modern KPI Cards yerine */}
        <div className="bg-white border border-gray-300 rounded">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">{t.dailySummary || 'Günlük Özet'}</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">{t.todaysSales || 'Bugünkü Satış'}</span>
                {revenueChange !== 0 && (
                  <span className={`text-[9px] ${revenueChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {revenueChange > 0 ? '↑' : '↓'} {formatNumber(Math.abs(revenueChange), 1, false)}%
                  </span>
                )}
              </div>
              <div className="text-base text-gray-900">{formatNumber(totalRevenue, 2, false)} {t.currencyCode || 'IQD'}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{todaysSales.length} {t.transaction || 'işlem'}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">{t.weeklySales || 'Haftalık Satış'}</span>
              </div>
              <div className="text-base text-gray-900">{formatNumber(weekRevenue, 2, false)} {t.currencyCode || 'IQD'}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{weekSales.length} {t.transaction || 'işlem'}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">{t.totalProductsDashboard || 'Toplam Ürün'}</span>
                {lowStockProducts.length > 0 && (
                  <span className="text-[9px] text-red-600">
                    ⚠ {lowStockProducts.length}
                  </span>
                )}
              </div>
              <div className="text-base text-gray-900">{products.length}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{t.stockManagement || 'Stok'}: {formatNumber(totalStockSaleValue, 0, false)} {t.currencyCode || 'IQD'}</div>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">{t.activeCustomers || 'Aktif Müşteri'}</span>
              </div>
              <div className="text-base text-gray-900">{customers.length}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{t.registeredCustomers || 'Kayıtlı müşteri'}</div>
            </div>
          </div>
        </div>

        {/* Finansal Özet - Kurumsal Tablo */}
        <div className="bg-white border border-gray-300 rounded">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              <h3 className="text-[11px] text-gray-700">{t.financialSummary || 'Finansal Özet'}</h3>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.stockValueCost || 'Stok Değeri (Maliyet)'}</div>
              <div className="text-sm text-gray-900">{formatNumber(totalStockValue, 2, false)} {t.currencyCode || 'IQD'}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.stockValueSales || 'Stok Değeri (Satış)'}</div>
              <div className="text-sm text-gray-900">{formatNumber(totalStockSaleValue, 2, false)} {t.currencyCode || 'IQD'}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.potentialProfit || 'Potansiyel Kar'}</div>
              <div className="text-sm text-green-600">{formatNumber(potentialProfit, 2, false)} {t.currencyCode || 'IQD'}</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] text-gray-600 mb-1">{t.profitMarginDashboard || 'Kar Marjı'}</div>
              <div className="text-sm text-blue-600">
                {totalStockValue > 0 ? formatNumber((potentialProfit / totalStockValue) * 100, 1, false) : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Sales Trend */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-blue-100">
              <h3 className="text-sm text-gray-800">{t.last7DaysSalesTrend || 'Son 7 Gün Satış Trendi'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.dailySalesPerformance || 'Günlük satış performansı'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={last7Days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-green-50 to-green-100">
              <h3 className="text-sm text-gray-800">{t.paymentMethodsChart || 'Ödeme Yöntemleri'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.customerPaymentPreferences || 'Müşteri ödeme tercihleri'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${formatNumber((percent * 100), 0, false)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top Products */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-purple-100">
              <h3 className="text-sm text-gray-800">{t.topSellingProductsInfo || 'En Çok Satan Ürünler'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.rankingByRevenue || 'Ciro bazında sıralama'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProducts} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis type="category" dataKey="name" stroke="#6B7280" style={{ fontSize: '10px' }} width={80} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#10B981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-orange-100">
              <h3 className="text-sm text-gray-800">{t.categoryBasedStock || 'Kategori Bazlı Stok'}</h3>
              <p className="text-[10px] text-gray-600 mt-0.5">{t.inventoryDistribution || 'Envanter dağılımı'}</p>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '10px' }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Alerts & Stock Warnings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Critical Stock Alerts */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-red-50 to-red-100">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="text-sm text-gray-800">{t.criticalStockAlerts || 'Kritik Stok Uyarıları'}</h3>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">{criticalStockProducts.length} {t.productsAtCriticalLevel || 'ürün kritik seviyede'}</p>
            </div>
            <div className="p-3 max-h-64 overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              {criticalStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {criticalStockProducts.slice(0, 10).map(product => (
                    <div key={product.id} className="flex items-center justify-between p-2 bg-red-50 rounded hover:bg-red-100 transition-colors">
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-800">{product.name}</p>
                        <p className="text-[9px] text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-red-600">{t.remainingQty || 'Kalan:'} {product.stock}</p>
                        <p className="text-[9px] text-red-500">{t.urgentOrder || 'Acil sipariş!'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Package className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-[11px] text-gray-500">{t.noCriticalStock || 'Kritik stok seviyesinde ürün yok'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Warnings */}
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gradient-to-r from-yellow-50 to-yellow-100">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-yellow-600" />
                <h3 className="text-sm text-gray-800">{t.lowStockWarningsItem || 'Düşük Stok Uyarıları'}</h3>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5">{lowStockProducts.length} {t.productsAtLowLevel || 'ürün düşük seviyede'}</p>
            </div>
            <div className="p-3 max-h-64 overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              {lowStockProducts.length > 0 ? (
                <div className="space-y-2">
                  {lowStockProducts.slice(0, 10).map(product => (
                    <div key={product.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded hover:bg-yellow-100 transition-colors">
                      <div className="flex-1">
                        <p className="text-[11px] text-gray-800">{product.name}</p>
                        <p className="text-[9px] text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-yellow-600">{t.remainingQty || 'Kalan:'} {product.stock}</p>
                        <p className="text-[9px] text-yellow-500">{t.orderRecommended || 'Sipariş önerilir'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Package className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-[11px] text-gray-500">{t.noLowStockInfo || 'Düşük stok seviyesinde ürün yok'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customize Quick Actions Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl text-white">{t.customizeQuickAccess || 'Hızlı Erişimleri Özelleştir'}</h3>
                <p className="text-blue-100 text-sm mt-1">{t.max8Shortcuts || 'En fazla 8 kısayol seçebilirsiniz'} ({selectedActions.length}/8)</p>
              </div>
              <button
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                onClick={() => setShowCustomizeModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              <div className="space-y-6">
                {Object.keys(groupedActions).map(category => (
                  <div key={category}>
                    <h4 className="text-sm text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <div className="w-8 h-0.5 bg-gradient-to-r from-blue-500 to-transparent"></div>
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedActions[category].map((action: any) => {
                        const Icon = action.icon;
                        const isSelected = selectedActions.includes(action.id);
                        const isDisabled = !isSelected && selectedActions.length >= 8;

                        return (
                          <button
                            key={action.id}
                            onClick={() => !isDisabled && toggleAction(action.id)}
                            disabled={isDisabled}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${isSelected
                              ? `border-blue-500 bg-blue-50 shadow-md`
                              : isDisabled
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                              }`}
                          >
                            {/* Icon */}
                            <div className={`w-12 h-12 bg-gradient-to-br ${action.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <Icon className="w-5 h-5 text-white" />
                              </div>
                            </div>

                            {/* Label */}
                            <div className="flex-1 text-left">
                              <p className={`text-sm ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                {action.label}
                              </p>
                            </div>

                            {/* Checkbox */}
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-300'
                              }`}>
                              {isSelected && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {selectedActions.length === 0 ? (
                  <span className="text-red-600">{t.min1Shortcut || 'En az 1 kısayol seçmelisiniz'}</span>
                ) : (
                  <span>{selectedActions.length} {t.shortcutsSelected || 'kısayol seçildi'}</span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                  onClick={() => {
                    setShowCustomizeModal(false);
                    // Reset to saved state
                    const saved = localStorage.getItem('retailos_quick_actions');
                    if (saved) {
                      setSelectedActions(JSON.parse(saved));
                    }
                  }}
                >
                  {t.cancel || 'İptal'}
                </button>
                <button
                  className={`px-6 py-2 rounded-lg transition-all ${selectedActions.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg'
                    }`}
                  onClick={saveQuickActions}
                  disabled={selectedActions.length === 0}
                >
                  {t.save || 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
