import {
  TrendingUp, Banknote, ShoppingCart, Package, Users,
  FileText, UserPlus, PackagePlus,
  BarChart3, Layers, ArrowRight, TrendingUpDown, Wallet, Settings, X,
  Truck, Receipt, Target, Award, GitBranch, Calculator,
  ClipboardList, Send, FileSpreadsheet, Store, Sparkles, Zap, UserCog
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Product, Customer, Sale } from '../../core/types';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatNumber } from '../../utils/formatNumber';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../../utils/env';
import { isGibEdocumentUiEnabled } from '../../config/eInvoice.config';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { logger } from '../../services/loggingService';

const DASHBOARD_SHORTCUTS_LS = 'retailos_dashboard_shortcut_ids';

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
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  /** Çeviri nesnesi bazen geniş JSON'dan `unknown`/`{}` gelebilir; metin çocuklarında güvenli metin */
  const tLabel = (v: unknown, fallback: string) =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
  // Aktif firmanın ana para birimi — fallback olarak çeviri kodu, en sonda IQD.
  const currency = selectedFirm?.ana_para_birimi || t.currencyCode || 'IQD';
  const firmLabel =
    (selectedFirm?.firma_adi || selectedFirm?.title || selectedFirm?.name || '').trim() || '';
  const periodLabel =
    selectedPeriod != null
      ? (selectedPeriod.donem_adi || selectedPeriod.name || `Dönem ${selectedPeriod.nr}`).trim()
      : '';
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const baseActions = useMemo(() => {
    const m = t.menu;
    return [
      { id: 'newsale', icon: ShoppingCart, label: tLabel(t.posModule, 'Satış (POS)'), color: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-accent,#1FA8A0)]', category: tLabel(m.retailSales, 'Satış') },
      { id: 'salesorder', icon: ClipboardList, label: tLabel(m.salesOrder, 'Satış siparişi'), color: 'from-[var(--asin-accent,#1FA8A0)] to-[#178f88]', category: tLabel(m.orders, 'Siparişler') },
      { id: 'salesinvoice', icon: FileText, label: tLabel(m.salesInvoices, 'Satış faturaları'), color: 'from-[var(--asin-primary,#0E2433)] to-[#163A52]', category: tLabel(m.invoices, 'Faturalar') },
      { id: 'addproduct', icon: PackagePlus, label: tLabel(t.productManagement, 'Ürün yönetimi'), color: 'from-green-500 to-green-600', category: tLabel(m.materialManagement, 'Malzeme') },
      { id: 'products', icon: Package, label: tLabel(m.materials, 'Malzemeler'), color: 'from-green-400 to-green-500', category: tLabel(m.materialManagement, 'Malzeme yönetimi') },
      { id: 'stock', icon: Layers, label: tLabel(m.stockManagementPanel, 'Stok paneli'), color: 'from-green-600 to-green-700', category: tLabel(m.inventoryManagement, 'Stok işlemleri') },
      { id: 'addcustomer', icon: UserPlus, label: tLabel(t.newCustomer, 'Yeni müşteri'), color: 'from-[var(--asin-accent,#1FA8A0)] to-[#178f88]', category: tLabel(m.currentAccounts, 'Cari hesaplar') },
      { id: 'customers', icon: Users, label: tLabel(m.currentAccounts, 'Cari kartlar'), color: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-accent,#1FA8A0)]', category: tLabel(m.cards, 'Kartlar') },
      { id: 'crm', icon: Target, label: tLabel(m.customerAnalysis, 'Müşteri analizi'), color: 'from-[#163A52] to-[var(--asin-primary,#0E2433)]', category: tLabel(m.reportsAndAnalysis, 'Raporlar') },
      { id: 'finance', icon: Banknote, label: tLabel(m.cashOperations, 'Kasa işlemleri'), color: 'from-orange-500 to-orange-600', category: tLabel(m.financeManagement, 'Finans') },
      { id: 'accounting', icon: Calculator, label: tLabel(m.accountingManagement, 'Muhasebe'), color: 'from-orange-400 to-orange-500', category: tLabel(m.journalAndSlips, 'Yevmiye & fişler') },
      { id: 'budget', icon: Wallet, label: tLabel(m.incomeStatement, 'Gelir tablosu'), color: 'from-orange-600 to-orange-700', category: tLabel(m.financeManagement, 'Finans') },
      { id: 'invoices', icon: Receipt, label: tLabel(t.invoices, 'Faturalar'), color: 'from-pink-500 to-pink-600', category: tLabel(m.invoices, 'Faturalar') },
      { id: 'purchaseinvoice', icon: FileText, label: tLabel(m.purchaseInvoice, 'Alış faturası'), color: 'from-pink-400 to-pink-500', category: tLabel(m.invoices, 'Faturalar') },
      { id: 'etransform', icon: Send, label: tLabel(m.eInvoiceArchive, 'E-dönüşüm'), color: 'from-pink-600 to-pink-700', category: tLabel(m.invoices, 'Faturalar') },
      { id: 'reports', icon: BarChart3, label: tLabel(m.reportsAndAnalysis, 'Raporlar'), color: 'from-[var(--asin-primary,#0E2433)] to-[var(--asin-accent,#1FA8A0)]', category: tLabel(m.reports, 'Raporlar') },
      { id: 'dashboard', icon: TrendingUpDown, label: tLabel(t.dashboard, 'Dashboard'), color: 'from-[var(--asin-accent,#1FA8A0)] to-[#178f88]', category: tLabel(m.reportsAndAnalysis, 'Raporlar') },
      { id: 'purchase', icon: ShoppingCart, label: tLabel(t.purchasing, 'Satın alma'), color: 'from-teal-500 to-teal-600', category: tLabel(m.purchasing, 'Satın alma') },
      { id: 'suppliers', icon: Truck, label: tLabel(m.supplierCards, 'Tedarikçi kartları'), color: 'from-teal-400 to-teal-500', category: tLabel(m.cards, 'Kartlar') },
      { id: 'logistics', icon: Truck, label: tLabel(m.logisticsShipping, 'Teslimat'), color: 'from-cyan-500 to-cyan-600', category: tLabel(m.waybills, 'İrsaliyeler') },
      { id: 'production', icon: GitBranch, label: tLabel(undefined, 'Üretim'), color: 'from-amber-500 to-amber-600', category: tLabel(m.movements, 'Hareketler') },
      { id: 'quality', icon: Award, label: tLabel(undefined, 'Kalite'), color: 'from-amber-400 to-amber-500', category: tLabel(m.designCenter, 'Tasarım') },
      { id: 'hr', icon: UserCog, label: tLabel(m.userManagement, 'İnsan kaynakları'), color: 'from-rose-500 to-rose-600', category: tLabel(m.roleAndAuthorization, 'Rol & yetki') },
      { id: 'settings', icon: Settings, label: tLabel(m.generalSettings, 'Ayarlar'), color: 'from-gray-500 to-gray-600', category: tLabel(m.systemManagement, 'Sistem') },
      { id: 'integrations', icon: Zap, label: tLabel(m.integrations, 'Entegrasyonlar'), color: 'from-yellow-500 to-yellow-600', category: tLabel(m.communicationAndNotifications, 'İletişim') },
      { id: 'excel', icon: FileSpreadsheet, label: tLabel(m.excelOperations, 'Excel işlemleri'), color: 'from-emerald-500 to-emerald-600', category: tLabel(m.materialManagement, 'Malzeme') },
    ];
  }, [t]);

  // Filter actions based on menuMode + mevzuat (IQ: GİB e-belge kısayolu yok)
  const allAvailableActions = useMemo(() => {
    const gibOk =
      selectedFirm == null ? true : isGibEdocumentUiEnabled(selectedFirm.regulatory_region);
    const source = gibOk ? baseActions : baseActions.filter((a: any) => a.id !== 'etransform');
    if (menuMode === 1) {
      const hiddenIds = ['crm', 'production', 'quality', 'hr', 'settings', 'integrations', 'budget'];
      return source.filter((a: any) => !hiddenIds.includes(a.id));
    }
    return source;
  }, [menuMode, selectedFirm, baseActions]);

  // Load shortcuts: Tauri → SQLite komutları; web → localStorage
  useEffect(() => {
    const defaultIds = () =>
      ['newsale', 'addproduct', 'addcustomer', 'invoices', 'reports', 'stock'].filter(id =>
        allAvailableActions.some(a => a.id === id)
      );

    const loadShortcuts = async () => {
      try {
        setIsLoading(true);

        if (!IS_TAURI) {
          const raw = localStorage.getItem(DASHBOARD_SHORTCUTS_LS);
          if (raw) {
            try {
              const ids = JSON.parse(raw) as string[];
              const valid = ids.filter((id: string) => allAvailableActions.some((a: any) => a.id === id));
              if (valid.length) {
                setSelectedActions(valid);
                return;
              }
            } catch {
              /* ignore */
            }
          }
          const saved = localStorage.getItem('retailos_quick_actions');
          if (saved) {
            const oldShortcuts = JSON.parse(saved) as string[];
            const validOldShortcuts = oldShortcuts.filter((id: string) =>
              allAvailableActions.some((a: any) => a.id === id)
            );
            localStorage.setItem(DASHBOARD_SHORTCUTS_LS, JSON.stringify(validOldShortcuts));
            localStorage.removeItem('retailos_quick_actions');
            setSelectedActions(validOldShortcuts.length ? validOldShortcuts : defaultIds());
            return;
          }
          setSelectedActions(defaultIds());
          return;
        }

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
            const defaults = defaultIds();
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

      if (!IS_TAURI) {
        localStorage.setItem(DASHBOARD_SHORTCUTS_LS, JSON.stringify(selectedActions));
        setShowCustomizeModal(false);
        return;
      }

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
  const totalProfitToday = todaysSales.reduce((sum, s) => sum + (s.profit || 0), 0);

  // Yesterday's sales for comparison
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySales = sales.filter(s => {
    const saleDate = new Date(s.date);
    return saleDate >= yesterday && saleDate < today;
  });
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const yesterdayProfit = yesterdaySales.reduce((sum, s) => sum + (s.profit || 0), 0);

  const revenueChange = yesterdayRevenue > 0
    ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    : 0;

  const profitChange = yesterdayProfit > 0
    ? ((totalProfitToday - yesterdayProfit) / yesterdayProfit) * 100
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

  const deepInsightPanels = useMemo(
    () => [
      { id: 'profit-dashboard', title: 'Kâr sinyali', blurb: 'Ciro ve marj', Icon: TrendingUp },
      { id: 'reports', title: 'Rapor hattı', blurb: 'Satış · stok · operasyon', Icon: BarChart3 },
      { id: 'new-modules', title: 'Modül kataloğu', blurb: 'Yeni yetenekler', Icon: Sparkles },
      { id: 'accounting-mgmt', title: 'Muhasebe', blurb: 'Mizan · bilanço', Icon: Calculator },
      { id: 'product-analytics', title: 'Ürün nabzı', blurb: 'SKU performansı', Icon: Target },
      { id: 'store-management', title: 'Mağaza hattı', blurb: 'Şube operasyonu', Icon: Store },
    ],
    []
  );

  const goScreen = useCallback(
    (id: string) => {
      if (id === 'newsale') setCurrentScreen('salesinvoice');
      else if (id === 'addproduct') setCurrentScreen('products');
      else if (id === 'addcustomer') setCurrentScreen('customers');
      else setCurrentScreen(id);
    },
    [setCurrentScreen],
  );

  const paymentTotal = paymentChartData.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const dateLocale = t.locale || 'tr-TR';
  const nowLabel = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="asin-pulse">
      <header className="asin-pulse-hero">
        <div className="asin-pulse-hero-inner">
          <div>
            <h1 className="asin-pulse-brand">
              AS<span>IN</span>
            </h1>
            <p className="asin-pulse-tagline">
              Operasyon nabzı — satış, stok ve kâr tek yüzeyde.
            </p>
          </div>
          <div className="asin-pulse-meta">
            {nowLabel}
            {(firmLabel || periodLabel) ? (
              <strong>{[firmLabel, periodLabel].filter(Boolean).join(' · ')}</strong>
            ) : (
              <strong>Canlı oturum</strong>
            )}
          </div>
        </div>
      </header>

      <div className="asin-pulse-body">
        <section className="asin-pulse-span asin-pulse-strip" aria-label="Özet metrikler">
          <div className="asin-pulse-stat">
            <div className="asin-pulse-stat-label">
              Bugün
              {revenueChange !== 0 && (
                <span className={`asin-pulse-stat-delta ${revenueChange > 0 ? 'up' : 'down'}`}>
                  {revenueChange > 0 ? '↑' : '↓'}
                  {formatNumber(Math.abs(revenueChange), 1, false)}%
                </span>
              )}
            </div>
            <div className="asin-pulse-stat-value">
              {formatNumber(totalRevenue, 2, false)} {currency}
            </div>
            <div className="asin-pulse-stat-hint">
              {todaysSales.length} işlem
            </div>
          </div>
          <div className="asin-pulse-stat">
            <div className="asin-pulse-stat-label">7 gün</div>
            <div className="asin-pulse-stat-value">
              {formatNumber(weekRevenue, 2, false)} {currency}
            </div>
            <div className="asin-pulse-stat-hint">{weekSales.length} işlem</div>
          </div>
          <div className="asin-pulse-stat">
            <div className="asin-pulse-stat-label">
              Kâr
              {profitChange !== 0 && (
                <span className={`asin-pulse-stat-delta ${profitChange > 0 ? 'up' : 'down'}`}>
                  {profitChange > 0 ? '↑' : '↓'}
                  {formatNumber(Math.abs(profitChange), 1, false)}%
                </span>
              )}
            </div>
            <div className="asin-pulse-stat-value is-accent">
              {formatNumber(totalProfitToday, 2, false)} {currency}
            </div>
            <div className="asin-pulse-stat-hint">
              Marj{' '}
              {totalRevenue > 0
                ? formatNumber((totalProfitToday / totalRevenue) * 100, 1, false)
                : 0}
              %
            </div>
          </div>
          <div className="asin-pulse-stat">
            <div className="asin-pulse-stat-label">SKU</div>
            <div className="asin-pulse-stat-value">{products.length}</div>
            <div className="asin-pulse-stat-hint">
              {lowStockProducts.length > 0
                ? `${lowStockProducts.length} düşük stok`
                : 'Stok dengeli'}
            </div>
          </div>
          <div className="asin-pulse-stat">
            <div className="asin-pulse-stat-label">Cari</div>
            <div className="asin-pulse-stat-value">{customers.length}</div>
            <div className="asin-pulse-stat-hint">Kayıtlı hesap</div>
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Komutlar</h2>
            <button type="button" className="asin-pulse-link" onClick={() => setShowCustomizeModal(true)}>
              Düzenle
            </button>
          </div>
          <div className="asin-pulse-cmd">
            {isLoading ? (
              <p className="asin-pulse-empty">Yükleniyor…</p>
            ) : (
              currentQuickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.id} type="button" onClick={() => goScreen(action.id)}>
                    <Icon aria-hidden />
                    <span>{String(action.label)}</span>
                    <ArrowRight className="asin-pulse-cmd-arrow" aria-hidden />
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Derin ekranlar</h2>
          </div>
          <div className="asin-pulse-insight">
            {deepInsightPanels.map((p) => {
              const Icon = p.Icon;
              return (
                <button key={p.id} type="button" onClick={() => setCurrentScreen(p.id)}>
                  <span className="asin-pulse-insight-icon">
                    <Icon className="w-4 h-4" aria-hidden />
                  </span>
                  <span>
                    <span className="asin-pulse-insight-name">{p.title}</span>
                    <p className="asin-pulse-insight-blurb">{p.blurb}</p>
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-40" aria-hidden />
                </button>
              );
            })}
          </div>
        </section>

        <section className="asin-pulse-span asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Envanter değeri</h2>
          </div>
          <dl className="asin-pulse-finance">
            <div>
              <dt>Maliyet</dt>
              <dd>
                {formatNumber(totalStockValue, 2, false)} {currency}
              </dd>
            </div>
            <div>
              <dt>Satış değeri</dt>
              <dd>
                {formatNumber(totalStockSaleValue, 2, false)} {currency}
              </dd>
            </div>
            <div>
              <dt>Potansiyel</dt>
              <dd className="accent">
                {formatNumber(potentialProfit, 2, false)} {currency}
              </dd>
            </div>
            <div>
              <dt>Marj</dt>
              <dd className="accent">
                {totalStockValue > 0
                  ? formatNumber((potentialProfit / totalStockValue) * 100, 1, false)
                  : 0}
                %
              </dd>
            </div>
          </dl>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">7 günlük trend</h2>
          </div>
          <div className="asin-pulse-chart">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--asin-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--asin-text-muted)" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--asin-text-muted)" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{
                    background: '#0E2433',
                    border: 'none',
                    borderRadius: 0,
                    color: '#fff',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1FA8A0"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#1FA8A0' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Ödeme dağılımı</h2>
          </div>
          {paymentChartData.length === 0 ? (
            <p className="asin-pulse-empty">Henüz ödeme verisi yok</p>
          ) : (
            <div className="asin-pulse-paybars">
              {paymentChartData.map((row) => {
                const pct = paymentTotal > 0 ? (Number(row.value) / paymentTotal) * 100 : 0;
                return (
                  <div key={String(row.name)} className="asin-pulse-paybar">
                    <span>{String(row.name)}</span>
                    <div className="asin-pulse-paybar-track">
                      <div className="asin-pulse-paybar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span>{formatNumber(pct, 0, false)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Öne çıkan ürünler</h2>
          </div>
          <div className="asin-pulse-chart">
            {topProducts.length === 0 ? (
              <p className="asin-pulse-empty">Satış verisi yok</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProducts} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="var(--asin-border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--asin-text-muted)" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--asin-text-muted)"
                    style={{ fontSize: '10px' }}
                    width={88}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0E2433',
                      border: 'none',
                      borderRadius: 0,
                      color: '#fff',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" fill="#0E2433" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Kategori stok</h2>
          </div>
          <div className="asin-pulse-chart">
            {categoryChartData.length === 0 ? (
              <p className="asin-pulse-empty">Kategori yok</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="2 6" stroke="var(--asin-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--asin-text-muted)" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--asin-text-muted)" style={{ fontSize: '10px' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: '#0E2433',
                      border: 'none',
                      borderRadius: 0,
                      color: '#fff',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="#1FA8A0" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Kritik stok</h2>
            <span className="asin-pulse-stat-hint">{criticalStockProducts.length} kalem</span>
          </div>
          <div className="asin-pulse-alert-list">
            {criticalStockProducts.length > 0 ? (
              criticalStockProducts.slice(0, 10).map((product) => (
                <div key={product.id} className="asin-pulse-alert-row">
                  <div>
                    <span className="name">{product.name}</span>
                    <span className="cat">{product.category}</span>
                  </div>
                  <span className="qty crit">{product.stock}</span>
                </div>
              ))
            ) : (
              <p className="asin-pulse-empty">Kritik seviye yok</p>
            )}
          </div>
        </section>

        <section className="asin-pulse-panel">
          <div className="asin-pulse-panel-head">
            <h2 className="asin-pulse-panel-title">Düşük stok</h2>
            <span className="asin-pulse-stat-hint">{lowStockProducts.length} kalem</span>
          </div>
          <div className="asin-pulse-alert-list">
            {lowStockProducts.length > 0 ? (
              lowStockProducts.slice(0, 10).map((product) => (
                <div key={product.id} className="asin-pulse-alert-row">
                  <div>
                    <span className="name">{product.name}</span>
                    <span className="cat">{product.category}</span>
                  </div>
                  <span className="qty low">{product.stock}</span>
                </div>
              ))
            ) : (
              <p className="asin-pulse-empty">Düşük seviye yok</p>
            )}
          </div>
        </section>
      </div>

      {showCustomizeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2147483646] p-4" style={{ zIndex: 2147483646 }}>
          <div className="bg-[var(--asin-surface-raised,#fff)] w-full max-w-3xl max-h-[90vh] overflow-hidden border border-[var(--asin-border)] flex flex-col">
            <div className="asin-bg-ink px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-asin-brand text-white m-0">
                  {String(t.customizeQuickAccess ?? 'Komutları özelleştir')}
                </h3>
                <p className="text-[var(--asin-accent-muted)] text-xs mt-1 m-0 opacity-90">
                  {String(t.max8Shortcuts ?? 'En fazla 8')} ({selectedActions.length}/8)
                </p>
              </div>
              <button
                type="button"
                className="asin-tool-btn"
                onClick={() => setShowCustomizeModal(false)}
                aria-label="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-6">
                {Object.keys(groupedActions).map((category) => (
                  <div key={category}>
                    <h4 className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--asin-text-muted)] mb-2">
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {groupedActions[category].map((action: any) => {
                        const Icon = action.icon;
                        const isSelected = selectedActions.includes(action.id);
                        const isDisabled = !isSelected && selectedActions.length >= 8;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => !isDisabled && toggleAction(action.id)}
                            disabled={isDisabled}
                            className={`flex items-center gap-3 p-3 border text-left transition-colors ${
                              isSelected
                                ? 'border-[var(--asin-accent)] bg-[var(--asin-accent-muted)]'
                                : isDisabled
                                  ? 'border-[var(--asin-border)] opacity-40 cursor-not-allowed'
                                  : 'border-[var(--asin-border)] hover:border-[var(--asin-accent)]'
                            }`}
                          >
                            <span className="asin-pulse-insight-icon shrink-0">
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="flex-1 text-sm font-semibold text-[var(--asin-text)]">
                              {action.label}
                            </span>
                            <span
                              className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-[var(--asin-accent)] border-[var(--asin-accent)] text-white'
                                  : 'border-[var(--asin-border)]'
                              }`}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-[var(--asin-border)] px-5 py-3 flex items-center justify-between shrink-0 bg-[var(--asin-surface)]">
              <p className="text-sm text-[var(--asin-text-muted)] m-0">
                {selectedActions.length === 0 ? (
                  <span className="text-amber-700">{String(t.min1Shortcut ?? 'En az 1 seçin')}</span>
                ) : (
                  <span>
                    {selectedActions.length} {String(t.shortcutsSelected ?? 'seçili')}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-semibold text-[var(--asin-text-muted)]"
                  onClick={() => setShowCustomizeModal(false)}
                >
                  {t.cancel || 'İptal'}
                </button>
                <button
                  type="button"
                  className="asin-bg-accent px-5 py-2 text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                  onClick={saveQuickActions}
                  disabled={selectedActions.length === 0}
                >
                  {t.save != null ? String(t.save) : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
