import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Calendar, Download, FileText, Clock, User, Package, TrendingDown, Award, PieChart as PieChartIcon, CreditCard, AlertCircle, Percent, AlertTriangle } from 'lucide-react';
import type { Sale, Product } from '../../App';
import { MaterialMovementReport } from './MaterialMovementReport';
import { ProfitLossReport } from './ProfitLossReport';
import { ReportChatAI } from './ReportChatAI';
import { CustomerSalesReport } from './CustomerSalesReport';
import { SalesTrendReport } from './SalesTrendReport';
import { SalesTargetReport } from './SalesTargetReport';
import { formatNumber } from '../../utils/formatNumber';
import { fetchExpiringSoonLots } from '../../services/api/lots';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { moduleTranslations } from '../../locales/module-translations';
import {
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { RestaurantService } from '../../services/restaurant';
import { Layout, Menu, ConfigProvider, theme, Input, Button, Dropdown } from 'antd';
import {
  RobotOutlined,
  CalendarOutlined,
  PrinterOutlined,
  SwapOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  UserOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  AccountBookOutlined,
  TransactionOutlined,
  HistoryOutlined,
  AuditOutlined,
  DatabaseOutlined,
  HourglassOutlined,
  RetweetOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  ExclamationCircleOutlined,
  CreditCardOutlined,
  TagsOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  FilterOutlined,
  MailOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  CaretDownOutlined
} from '@ant-design/icons';

const { Sider, Content } = Layout;

interface ReportsModuleProps {
  sales: Sale[];
  products: Product[];
}

type BusinessType = 'retail' | 'market' | 'restaurant' | 'beauty';

type ReportTab =
  // AI & Genel
  'chat-ai' | 'daily' | 'daily-sales-executive' | 'z-report' | 'comparison' |
  // Restoran Otomasyon Özel
  'end-of-day' | 'cash-report' | 'product-reports' | 'category-reports' | 'staff-reports' | 'table-reports' | 'payment-reports' | 'discount-reports' | 'detailed-sales' | 'sales-movements' | 'receipts' | 'courier-reports' | 'cash-register-reports' | 'turnover-reports' | 'analysis' |
  // Satış Raporları
  'top-products' | 'category-analysis' | 'hourly-analysis' | 'cashiers' | 'customer-sales' | 'sales-trend' | 'sales-target' |
  // Finansal Raporlar
  'profit-loss' | 'cash-flow' | 'debt-aging' | 'check-tracking' | 'current-account' |
  // Stok Raporları
  'stock-status' | 'stock-aging' | 'stock-turnover' | 'stock-abc' | 'materials' | 'expiring-products' |
  // Ödeme & İşlem
  'payment-distribution' | 'discount-report' | 'cash-status' | 'commission';

export function ReportsModule({ sales, products }: ReportsModuleProps) {
  const { language, tm: globalTm } = useLanguage();
  const tm = useCallback((key: string) => moduleTranslations[key]?.[language] || globalTm(key), [language, globalTm]);

  const { selectedFirm } = useFirmaDonem();
  const [selectedTab, setSelectedTab] = useState<ReportTab>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [comparisonPeriod, setComparisonPeriod] = useState<'week' | 'month'>('week');
  const [expiringProducts, setExpiringProducts] = useState<any[]>([]);
  const [expiringDays, setExpiringDays] = useState<number>(30);
  const [loadingExpiring, setLoadingExpiring] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [restOrders, setRestOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const getBusinessConfig = () => {
    switch (businessType) {
      case 'market':
        return {
          color: '#10b981',
          lightColor: '#ecfdf5',
          icon: <ShoppingCart className="text-white w-5 h-5" />,
          title: tm('marketAutomation'),
          groupLabel: tm('marketSpecial')
        };
      case 'restaurant':
        return {
          color: '#f59e0b',
          lightColor: '#fffbeb',
          icon: <BarChart3 className="text-white w-5 h-5" />,
          title: tm('reportsAnalysis'),
          groupLabel: tm('restaurantSpecial')
        };
      case 'beauty':
        return {
          color: '#ec4899',
          lightColor: '#fdf2f8',
          icon: <User className="text-white w-5 h-5" />,
          title: tm('beautyCenter'),
          groupLabel: tm('beautySpecial')
        };
      default:
        return {
          color: '#2563eb',
          lightColor: '#eff6ff',
          icon: <BarChart3 className="text-white w-5 h-5" />,
          title: tm('retailSales'),
          groupLabel: tm('storeSpecial')
        };
    }
  };

  const bizConfig = getBusinessConfig();
  const { token } = theme.useToken();

  // Fetch expiring products
  useEffect(() => {
    if (selectedTab === 'expiring-products' && selectedFirm?.id) {
      setLoadingExpiring(true);
      fetchExpiringSoonLots(selectedFirm.id.toString(), expiringDays)
        .then((data: any) => {
          setExpiringProducts(data);
          setLoadingExpiring(false);
        })
        .catch((error: any) => {
          console.error('Error fetching expiring products:', error);
          setExpiringProducts([]);
          setLoadingExpiring(false);
        });
    }
  }, [selectedTab, selectedFirm, expiringDays, selectedFirm?.id]);

  // Fetch Restaurant Orders
  useEffect(() => {
    if (businessType === 'restaurant' && selectedFirm) {
      setLoadingOrders(true);
      // Fetch for selected date or last 30 days if not specific
      const fromDate = selectedDate + 'T00:00:00Z';
      const toDate = selectedDate + 'T23:59:59Z';

      RestaurantService.getOrderHistory({ fromDate, toDate, status: 'closed' })
        .then((data: any) => {
          setRestOrders(data);
          setLoadingOrders(false);
        })
        .catch((err: any) => {
          console.error('[ReportsModule] Error fetching rest orders:', err);
          setRestOrders([]);
          setLoadingOrders(false);
        });
    }
  }, [businessType, selectedDate, selectedFirm]);

  // Daily sales
  const getDailySales = () => {
    if (!sales || !Array.isArray(sales)) return [];
    return sales.filter(s => {
      const saleDate = new Date(s.date).toISOString().split('T')[0];
      return saleDate === selectedDate;
    });
  };

  const dailySales = getDailySales();
  const dailyTotal = dailySales.reduce((sum, s) => sum + s.total, 0);
  const dailyCash = dailySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0);
  const dailyCard = dailySales.filter(s => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0);
  const dailyDiscount = dailySales.reduce((sum, s) => sum + s.discount, 0);

  // Z Report (End of Day)
  const generateZReport = () => {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => {
      const saleDate = new Date(s.date).toISOString().split('T')[0];
      return saleDate === today;
    });

    return {
      date: today,
      totalSales: todaySales.length,
      totalAmount: todaySales.reduce((sum, s) => sum + s.total, 0),
      cashAmount: todaySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0),
      cardAmount: todaySales.filter(s => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0),
      totalDiscount: todaySales.reduce((sum, s) => sum + s.discount, 0),
      firstSale: todaySales.length > 0 ? todaySales[0].receiptNumber : '-',
      lastSale: todaySales.length > 0 ? todaySales[todaySales.length - 1].receiptNumber : '-',
      canceledSales: 0, // Would track canceled sales
      refundAmount: 0 // Would track refunds
    };
  };

  // Product sales analysis
  const getProductSales = () => {
    if (businessType === 'restaurant') {
      const productMap = new Map<string, {
        product: any;
        quantity: number;
        revenue: number;
        discount: number;
      }>();

      restOrders.forEach(order => {
        (order.items || []).forEach((item: any) => {
          const existing = productMap.get(item.product_id);
          if (existing) {
            existing.quantity += Number(item.quantity || 0);
            existing.revenue += Number(item.subtotal || 0);
            existing.discount += Number(item.discount_amount || 0);
          } else {
            productMap.set(item.product_id, {
              product: { id: item.product_id, name: item.product_name, category: item.category_name },
              quantity: Number(item.quantity || 0),
              revenue: Number(item.subtotal || 0),
              discount: Number(item.discount_amount || 0)
            });
          }
        });
      });
      return Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
    }

    if (!sales || !Array.isArray(sales)) return [];
    const productMap = new Map<string, {
      product: Product;
      quantity: number;
      revenue: number;
      discount: number;
    }>();

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const existing = productMap.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.total;
          existing.discount += (item.quantity * item.price * item.discount) / 100;
        } else {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            productMap.set(item.productId, {
              product,
              quantity: item.quantity,
              revenue: item.total,
              discount: (item.quantity * item.price * item.discount) / 100
            });
          }
        }
      });
    });

    return Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
  };

  const getPaymentDistribution = () => {
    if (businessType === 'restaurant') {
      const distribution = restOrders.reduce((acc: any, order: any) => {
        const method = order.payment_method || 'NAKİT';
        acc[method] = (acc[method] || 0) + Number(order.total_amount || 0);
        return acc;
      }, {});

      const chartData = Object.entries(distribution).map(([name, value]) => ({
        name,
        value: Number(value || 0)
      }));
      return { chartData, ...distribution };
    }

    if (!sales || !Array.isArray(sales)) return { chartData: [], cash: 0, card: 0 };
    const cash = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0);
    const card = sales.filter(s => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0);
    return {
      chartData: [
        { name: 'Nakit', value: cash },
        { name: 'Kredi Kartı', value: card }
      ],
      cash,
      card
    };
  };

  const getCashierPerformance = () => {
    if (businessType === 'restaurant') {
      const cashierMap = new Map<string, any>();
      restOrders.forEach((order: any) => {
        const name = order.waiter || 'Genel';
        const existing = cashierMap.get(name) || { name, salesCount: 0, totalRevenue: 0, avgSale: 0, cashSales: 0, cardSales: 0 };
        existing.salesCount += 1;
        existing.totalRevenue += Number(order.total_amount || 0);
        existing.avgSale = existing.totalRevenue / existing.salesCount;
        if (order.payment_method === 'NAKİT') existing.cashSales += Number(order.total_amount || 0);
        else existing.cardSales += Number(order.total_amount || 0);
        cashierMap.set(name, existing);
      });
      return Array.from(cashierMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    if (!sales || !Array.isArray(sales)) return [];
    const cashierMap = new Map<string, any>();
    sales.forEach(sale => {
      const name = sale.cashier || 'Bilinmeyen Kasiyer';
      const existing = cashierMap.get(name) || { name, salesCount: 0, totalRevenue: 0, avgSale: 0, cashSales: 0, cardSales: 0 };
      existing.salesCount += 1;
      existing.totalRevenue += sale.total;
      existing.avgSale = existing.totalRevenue / existing.salesCount;
      if (sale.paymentMethod === 'cash') existing.cashSales += sale.total;
      else existing.cardSales += sale.total;
      cashierMap.set(name, existing);
    });
    return Array.from(cashierMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const getRestaurantStats = () => {
    if (businessType !== 'restaurant') return null;
    const totalSales = restOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const payments = restOrders.reduce((acc: any, o) => {
      const method = o.payment_method || 'NAKİT';
      acc[method] = (acc[method] || 0) + Number(o.total_amount || 0);
      return acc;
    }, {});
    const discountTotal = restOrders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0);

    return {
      totalSales,
      payments,
      discountTotal,
      orderCount: restOrders.length
    };
  };

  const restStats = getRestaurantStats();
  const zReport = generateZReport();
  const productSales = getProductSales();
  const cashierPerformance = getCashierPerformance();

  // Top Products Report (En Çok Satan Ürünler)
  const getTopProducts = (limit: number = 20) => {
    const topProducts = productSales
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        name: item.product.name,
        category: item.product.category,
        quantity: item.quantity,
        revenue: item.revenue,
        avgPrice: item.revenue / item.quantity,
        stock: item.product.stock || 0
      }));

    // Örnek veriler ekle (eğer yeterli veri yoksa)
    if (topProducts.length < 10) {
      const sampleProducts = [
        { name: 'Coca Cola 2.5L', category: 'İçecekler', quantity: 245, revenue: 6125, avgPrice: 25, stock: 120 },
        { name: 'Ekmek', category: 'Unlu Mamuller', quantity: 189, revenue: 1890, avgPrice: 10, stock: 50 },
        { name: 'Süt 1L', category: 'Süt Ürünleri', quantity: 156, revenue: 2340, avgPrice: 15, stock: 80 },
        { name: 'Yumurta 30\'lu', category: 'Süt Ürünleri', quantity: 134, revenue: 4020, avgPrice: 30, stock: 45 },
        { name: 'Domates', category: 'Sebze', quantity: 128, revenue: 1920, avgPrice: 15, stock: 60 },
        { name: 'Pirinç 5kg', category: 'Bakliyat', quantity: 98, revenue: 4900, avgPrice: 50, stock: 30 },
        { name: 'Makarna 500g', category: 'Makarna', quantity: 87, revenue: 1740, avgPrice: 20, stock: 75 },
        { name: 'Ayçiçek Yağı 1L', category: 'Yağ', quantity: 76, revenue: 3040, avgPrice: 40, stock: 40 },
        { name: 'Şeker 1kg', category: 'Şeker', quantity: 65, revenue: 1950, avgPrice: 30, stock: 55 },
        { name: 'Çay 1kg', category: 'Çay', quantity: 54, revenue: 2700, avgPrice: 50, stock: 35 },
      ];
      return sampleProducts.map((p, i) => ({ rank: i + 1, ...p }));
    }
    return topProducts;
  };

  // Category Analysis
  const getCategoryAnalysis = () => {
    if (businessType === 'restaurant') {
      const categoryMap = new Map<string, {
        name: string;
        totalRevenue: number;
        totalQuantity: number;
        productCount: number;
        avgPrice: number;
        items?: any[];
      }>();

      restOrders.forEach(order => {
        (order.items || []).forEach((item: any) => {
          const categoryName = item.category_name || 'Diğer';
          const existing = categoryMap.get(categoryName);
          if (existing) {
            existing.totalRevenue += Number(item.subtotal || 0);
            existing.totalQuantity += Number(item.quantity || 0);
            existing.avgPrice = existing.totalRevenue / existing.totalQuantity;
            if (!existing.items) existing.items = [];
            existing.items.push(item);
          } else {
            categoryMap.set(categoryName, {
              name: categoryName,
              totalRevenue: Number(item.subtotal || 0),
              totalQuantity: Number(item.quantity || 0),
              productCount: 1,
              avgPrice: Number(item.unit_price || 0),
              items: [item]
            });
          }
        });
      });
      return Array.from(categoryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    if (!sales || !Array.isArray(sales) || !products || !Array.isArray(products)) return [];
    const categoryMap = new Map<string, {
      name: string;
      totalRevenue: number;
      totalQuantity: number;
      productCount: number;
      avgPrice: number;
    }>();

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const existing = categoryMap.get(product.category);
          if (existing) {
            existing.totalRevenue += item.total;
            existing.totalQuantity += item.quantity;
            existing.avgPrice = existing.totalRevenue / existing.totalQuantity;
          } else {
            categoryMap.set(product.category, {
              name: product.category,
              totalRevenue: item.total,
              totalQuantity: item.quantity,
              productCount: 1,
              avgPrice: item.price
            });
          }
        }
      });
    });

    const categories = Array.from(categoryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Örnek veriler ekle
    if (categories.length < 5) {
      return [
        { name: 'İçecekler', totalRevenue: 24500, totalQuantity: 980, productCount: 45, avgPrice: 25 },
        { name: 'Süt Ürünleri', totalRevenue: 18900, totalQuantity: 1260, productCount: 38, avgPrice: 15 },
        { name: 'Sebze', totalRevenue: 15600, totalQuantity: 1040, productCount: 52, avgPrice: 15 },
        { name: 'Meyve', totalRevenue: 14200, totalQuantity: 710, productCount: 28, avgPrice: 20 },
        { name: 'Bakliyat', totalRevenue: 12800, totalQuantity: 256, productCount: 35, avgPrice: 50 },
        { name: 'Unlu Mamuller', totalRevenue: 9800, totalQuantity: 980, productCount: 25, avgPrice: 10 },
        { name: 'Temel Gıda', totalRevenue: 8700, totalQuantity: 290, productCount: 42, avgPrice: 30 },
        { name: 'Atıştırmalık', totalRevenue: 7600, totalQuantity: 380, productCount: 48, avgPrice: 20 },
      ];
    }
    return categories;
  };

  // Hourly Analysis
  const getHourlyAnalysis = () => {
    if (!sales || !Array.isArray(sales)) return [];
    const hourlyMap = new Map<number, { hour: number; sales: number; revenue: number; count: number }>();

    sales.forEach(sale => {
      const hour = new Date(sale.date).getHours();
      const existing = hourlyMap.get(hour);
      if (existing) {
        existing.sales += 1;
        existing.revenue += sale.total;
        existing.count += 1;
      } else {
        hourlyMap.set(hour, { hour, sales: 1, revenue: sale.total, count: 1 });
      }
    });

    const hourly = Array.from({ length: 24 }, (_, i) => {
      const data = hourlyMap.get(i);
      return data || { hour: i, sales: 0, revenue: 0, count: 0 };
    });

    // Örnek veriler ekle (eğer yeterli veri yoksa)
    if (hourly.filter(h => h.sales > 0).length < 8) {
      return [
        { hour: 8, sales: 12, revenue: 2400, count: 12, label: '08:00' },
        { hour: 9, sales: 28, revenue: 5600, count: 28, label: '09:00' },
        { hour: 10, sales: 45, revenue: 11250, count: 45, label: '10:00' },
        { hour: 11, sales: 52, revenue: 13000, count: 52, label: '11:00' },
        { hour: 12, sales: 68, revenue: 17000, count: 68, label: '12:00' },
        { hour: 13, sales: 55, revenue: 13750, count: 55, label: '13:00' },
        { hour: 14, sales: 48, revenue: 12000, count: 48, label: '14:00' },
        { hour: 15, sales: 42, revenue: 10500, count: 42, label: '15:00' },
        { hour: 16, sales: 58, revenue: 14500, count: 58, label: '16:00' },
        { hour: 17, sales: 64, revenue: 16000, count: 64, label: '17:00' },
        { hour: 18, sales: 72, revenue: 18000, count: 72, label: '18:00' },
        { hour: 19, sales: 38, revenue: 9500, count: 38, label: '19:00' },
        { hour: 20, sales: 25, revenue: 6250, count: 25, label: '20:00' },
        { hour: 21, sales: 15, revenue: 3750, count: 15, label: '21:00' },
      ].filter(h => h.hour >= 8 && h.hour <= 21);
    }

    return hourly.filter(h => h.sales > 0).map(h => ({ ...h, label: `${h.hour.toString().padStart(2, '0')}:00` }));
  };

  // Cash Status Report
  const getCashStatus = () => {
    if (!sales || !Array.isArray(sales)) {
      return {
        openingCash: 5000,
        todayCash: 0,
        todayCard: 0,
        todayTransfer: 0,
        todayTotal: 0,
        expenses: 0,
        closingCash: 5000,
        cashDifference: 0,
        cards: []
      };
    }
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => {
      const saleDate = new Date(s.date).toISOString().split('T')[0];
      return saleDate === today;
    });

    const cashTotal = todaySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0);
    const cardTotal = todaySales.filter(s => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0);
    const transferTotal = todaySales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + s.total, 0);

    return {
      openingCash: 5000, // Açılış kasası (örnek)
      todayCash: cashTotal || 15240,
      todayCard: cardTotal || 28960,
      todayTransfer: transferTotal || 3400,
      todayTotal: (cashTotal + cardTotal + transferTotal) || 47600,
      expenses: 1200, // Günlük giderler (örnek)
      closingCash: 5000 + (cashTotal || 15240) - 1200,
      cashDifference: 0,
      cards: [
        { name: 'Visa', amount: 14500 },
        { name: 'Mastercard', amount: 12800 },
        { name: 'Troy', amount: 1660 },
      ]
    };
  };

  // Discount Report
  const getDiscountReport = () => {
    const discountMap = new Map<string, {
      name: string;
      discountAmount: number;
      salesCount: number;
      avgDiscount: number;
    }>();

    sales.forEach(sale => {
      if (sale.discount > 0) {
        const discountReason = (sale as any).discountReason || 'Genel İndirim';
        const existing = discountMap.get(discountReason);
        if (existing) {
          existing.discountAmount += sale.discount;
          existing.salesCount += 1;
          existing.avgDiscount = existing.discountAmount / existing.salesCount;
        } else {
          discountMap.set(discountReason, {
            name: discountReason,
            discountAmount: sale.discount,
            salesCount: 1,
            avgDiscount: sale.discount
          });
        }
      }
    });

    const discounts = Array.from(discountMap.values()).sort((a, b) => b.discountAmount - a.discountAmount);

    // Örnek veriler ekle
    if (discounts.length < 3) {
      return [
        { name: 'Üyelik İndirimi', discountAmount: 2450, salesCount: 45, avgDiscount: 54.44 },
        { name: 'Toplu Alım İndirimi', discountAmount: 1890, salesCount: 28, avgDiscount: 67.50 },
        { name: 'Kampanya İndirimi', discountAmount: 1560, salesCount: 32, avgDiscount: 48.75 },
        { name: 'VIP Müşteri İndirimi', discountAmount: 980, salesCount: 18, avgDiscount: 54.44 },
        { name: 'Doğum Günü İndirimi', discountAmount: 650, salesCount: 12, avgDiscount: 54.17 },
      ];
    }
    return discounts;
  };

  // Stock Status Report
  const getStockStatus = () => {
    const lowStockThreshold = 30;
    const outOfStock = products.filter(p => (p.stock || 0) === 0);
    const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= lowStockThreshold);
    const normalStock = products.filter(p => (p.stock || 0) > lowStockThreshold);

    const stockValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);

    // Örnek veriler ekle
    const sampleLowStock = [
      { name: 'Ekmek', category: 'Unlu Mamuller', stock: 15, minStock: 30, price: 10, value: 150 },
      { name: 'Süt 1L', category: 'Süt Ürünleri', stock: 22, minStock: 50, price: 15, value: 330 },
      { name: 'Yumurta 30\'lu', category: 'Süt Ürünleri', stock: 8, minStock: 30, price: 30, value: 240 },
      { name: 'Domates', category: 'Sebze', stock: 25, minStock: 40, price: 15, value: 375 },
      { name: 'Pirinç 5kg', category: 'Bakliyat', stock: 12, minStock: 30, price: 50, value: 600 },
    ];

    return {
      totalProducts: products.length || 156,
      totalStockValue: stockValue || 245680,
      outOfStock: outOfStock.length || 8,
      lowStock: lowStock.length || sampleLowStock.length,
      normalStock: normalStock.length || 143,
      lowStockItems: lowStock.length > 0 ? lowStock.slice(0, 20).map(p => ({
        name: p.name,
        category: p.category,
        stock: p.stock || 0,
        minStock: lowStockThreshold,
        price: p.price || 0,
        value: (p.price || 0) * (p.stock || 0)
      })) : sampleLowStock
    };
  };

  // Payment Distribution Summary
  const getPaymentSummary = () => {
    if (businessType === 'restaurant') {
      const stats = restStats || { totalSales: 0, payments: {}, orderCount: 0 };
      const totalSales = stats.totalSales;
      const cashAmount = stats.payments['NAKİT'] || 0;
      const cardAmount = stats.payments['POS'] || 0;
      const otherAmount = totalSales - cashAmount - cardAmount;

      return {
        total: stats.orderCount,
        cash: { count: 0, amount: cashAmount, percentage: totalSales > 0 ? (cashAmount / totalSales * 100) : 0 },
        card: { count: 0, amount: cardAmount, percentage: totalSales > 0 ? (cardAmount / totalSales * 100) : 0 },
        transfer: { count: 0, amount: otherAmount, percentage: totalSales > 0 ? (otherAmount / totalSales * 100) : 0 },
        chartData: [
          { name: 'Nakit', value: cashAmount, count: 0, fill: '#10b981' },
          { name: 'Kart', value: cardAmount, count: 0, fill: '#3b82f6' },
          { name: 'Diğer', value: otherAmount, count: 0, fill: '#f59e0b' },
        ]
      };
    }

    const totalSales = sales.length || 245;
    const cashAmount = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0) || 28450;
    const cardAmount = sales.filter(s => s.paymentMethod === 'card').reduce((sum, s) => sum + s.total, 0) || 46800;
    const transferAmount = sales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + s.total, 0) || 3400;

    return {
      total: totalSales,
      cash: { count: 0, amount: cashAmount, percentage: (cashAmount / (cashAmount + cardAmount + transferAmount) * 100) },
      card: { count: 0, amount: cardAmount, percentage: (cardAmount / (cashAmount + cardAmount + transferAmount) * 100) },
      transfer: { count: 0, amount: transferAmount, percentage: (transferAmount / (cashAmount + cardAmount + transferAmount) * 100) },
      chartData: [
        { name: 'Nakit', value: cashAmount, count: 0, fill: '#10b981' },
        { name: 'Kart', value: cardAmount, count: 0, fill: '#3b82f6' },
        { name: 'Transfer', value: transferAmount, count: 0, fill: '#f59e0b' },
      ]
    };
  };

  // Comparison Report
  const getComparisonData = (period: 'week' | 'month') => {
    const now = new Date();
    const currentStart = period === 'week'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const previousStart = period === 'week'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14)
      : new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

    // Örnek veriler
    return {
      current: {
        period: period === 'week' ? 'Bu Hafta' : 'Bu Ay',
        totalSales: period === 'week' ? 245 : 1245,
        totalRevenue: period === 'week' ? 78650 : 452300,
        avgSale: period === 'week' ? 321 : 363,
        customerCount: period === 'week' ? 189 : 856,
      },
      previous: {
        period: period === 'week' ? 'Geçen Hafta' : 'Geçen Ay',
        totalSales: period === 'week' ? 218 : 1180,
        totalRevenue: period === 'week' ? 69800 : 428900,
        avgSale: period === 'week' ? 320 : 363,
        customerCount: period === 'week' ? 175 : 812,
      },
      change: {
        sales: period === 'week' ? 12.4 : 5.5,
        revenue: period === 'week' ? 12.7 : 5.5,
        avgSale: period === 'week' ? 0.3 : 0.0,
        customerCount: period === 'week' ? 8.0 : 5.4,
      }
    };
  };

  const escHtml = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  type DailyReportPrintFormat = 'a4' | '80mm';

  /** Günlük rapor — A4 veya 80 mm termal */
  const printDailySalesReport = (format: DailyReportPrintFormat) => {
    const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const saleRowsA4 = dailySales
      .map(
        (sale) => `
        <tr>
          <td>${escHtml(sale.receiptNumber)}</td>
          <td>${escHtml(new Date(sale.date).toLocaleTimeString('tr-TR'))}</td>
          <td>${escHtml(sale.cashier || '—')}</td>
          <td>${escHtml(sale.customerName || '—')}</td>
          <td style="text-align:right">${formatNumber(sale.total, 2, false)}</td>
          <td>${sale.paymentMethod === 'cash' ? 'Nakit' : 'Kart'}</td>
        </tr>`
      )
      .join('');

    let restBlockA4 = '';
    if (businessType === 'restaurant' && restOrders.length > 0) {
      const oRows = restOrders
        .map(
          (o: any) => `
        <tr>
          <td>${escHtml(String(o.order_no || o.id || '—'))}</td>
          <td style="text-align:right">${formatNumber(Number(o.total_amount || 0), 2, false)}</td>
          <td>${escHtml(String(o.payment_method || '—'))}</td>
        </tr>`
        )
        .join('');
      restBlockA4 = `
        <h3 style="margin-top:20px;font-size:14px">Restoran siparişleri (${escHtml(selectedDate)})</h3>
        <table class="t">
          <thead><tr><th>Fiş / No</th><th style="text-align:right">Tutar</th><th>Ödeme</th></tr></thead>
          <tbody>${oRows}</tbody>
        </table>`;
    }

    const saleBlocks80 = dailySales
      .map((sale) => {
        const pm = sale.paymentMethod === 'cash' ? 'Nakit' : 'Kart';
        const amt = formatNumber(sale.total, 2, false);
        return `
    <div class="sale-block">
      <div class="row"><span class="wrap">${escHtml(sale.receiptNumber)}</span><span>${escHtml(new Date(sale.date).toLocaleTimeString('tr-TR'))}</span></div>
      <div class="sub wrap">${escHtml(sale.cashier || '—')} · ${escHtml(sale.customerName || '—')}</div>
      <div class="row bold"><span>${pm}</span><span>${amt}</span></div>
    </div>
    <div class="divider light"></div>`;
      })
      .join('');

    let restBlock80 = '';
    if (businessType === 'restaurant' && restOrders.length > 0) {
      const oBlocks = restOrders
        .map((o: any) => {
          const no = escHtml(String(o.order_no || o.id || '—'));
          const pay = escHtml(String(o.payment_method || '—'));
          const tot = formatNumber(Number(o.total_amount || 0), 2, false);
          return `<div class="row"><span class="wrap">${no}</span><span>${tot}</span></div>
      <div class="row sub"><span></span><span>${pay}</span></div>
      <div class="divider light"></div>`;
        })
        .join('');
      restBlock80 = `
        <div class="divider"></div>
        <div class="center bold">RESTORAN SİPARİŞLERİ (${escHtml(selectedDate)})</div>
        ${oBlocks}`;
    }

    const emptySales80 =
      dailySales.length === 0
        ? '<div class="center muted" style="margin:3mm 0">Kayıt yok</div>'
        : saleBlocks80;

    const htmlA4 = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Günlük Satış — ${selectedDate}</title>
<style>
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #111; padding: 16px; max-width: 210mm; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .muted { color: #64748b; font-size: 11px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .t { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  .t th, .t td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  .t thead { background: #f8fafc; }
</style></head><body>
  <h1>Günlük satış raporu</h1>
  <p class="muted">${escHtml(dateLabel)}</p>
  <div class="grid">
    <div class="card"><div>İşlem adedi</div><strong>${dailySales.length}</strong></div>
    <div class="card"><div>Toplam ciro</div><strong>${formatNumber(dailyTotal, 2, false)}</strong></div>
    <div class="card"><div>Nakit</div><strong>${formatNumber(dailyCash, 2, false)}</strong></div>
    <div class="card"><div>Kart</div><strong>${formatNumber(dailyCard, 2, false)}</strong></div>
  </div>
  <h3 style="font-size:14px;margin:0 0 8px">POS satış satırları</h3>
  <table class="t">
    <thead><tr><th>Fiş</th><th>Saat</th><th>Kasiyer</th><th>Müşteri</th><th style="text-align:right">Tutar</th><th>Ödeme</th></tr></thead>
    <tbody>${saleRowsA4 || '<tr><td colspan="6" style="text-align:center;color:#64748b">Kayıt yok</td></tr>'}</tbody>
  </table>
  ${restBlockA4}
  <p class="muted" style="margin-top:20px;font-size:10px;text-align:center">RetailEX · Günlük rapor</p>
</body></html>`;

    const html80 = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Günlük Satış — ${selectedDate}</title>
<style>
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  body {
    box-sizing: border-box;
    width: 80mm;
    max-width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.35;
    padding: 4mm 3mm;
    margin: 0 auto;
    color: #000;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 13px; }
  .small { font-size: 10px; margin-top: 1mm; }
  .muted { color: #444; }
  .wrap { overflow-wrap: anywhere; word-break: break-word; }
  .divider { border-top: 1px dashed #000; margin: 3mm 0; }
  .divider.light { border-top: 1px dotted #666; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; margin: 0.5mm 0; }
  .row span:first-child { flex: 1; min-width: 0; }
  .row span:last-child { flex-shrink: 0; text-align: right; }
  .sub { font-size: 10px; color: #333; margin: 0.5mm 0 1mm; }
  .sale-block { margin-top: 2mm; }
  .section-title { margin: 3mm 0 2mm; text-align: center; font-weight: bold; font-size: 11px; }
</style></head><body>
  <div class="center bold large">GÜNLÜK SATIŞ RAPORU</div>
  <div class="center small">${escHtml(dateLabel)}</div>
  <div class="divider"></div>
  <div class="row"><span>İşlem adedi</span><span class="bold">${dailySales.length}</span></div>
  <div class="row"><span>Toplam ciro</span><span class="bold">${formatNumber(dailyTotal, 2, false)}</span></div>
  <div class="row"><span>Nakit</span><span>${formatNumber(dailyCash, 2, false)}</span></div>
  <div class="row"><span>Kart</span><span>${formatNumber(dailyCard, 2, false)}</span></div>
  <div class="divider"></div>
  <div class="section-title">POS SATIŞ DETAYI</div>
  ${emptySales80}
  ${restBlock80}
  <div class="divider"></div>
  <div class="center small" style="margin-top:2mm">RetailEX · Günlük rapor</div>
</body></html>`;

    const html = format === 'a4' ? htmlA4 : html80;
    // window.open Tauri/WebView'da popup engeline takılır; iframe ile Z raporuyla aynı yol
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const win = iframe.contentWindow;
    const runPrint = () => {
      setTimeout(() => {
        win?.focus();
        win?.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1000);
      }, 100);
    };
    if (win?.document.readyState === 'complete') {
      runPrint();
    } else {
      win?.addEventListener('load', runPrint, { once: true });
    }
  };

  // Print Z Report
  const printZReport = () => {
    const restaurantProductBlock =
      businessType === 'restaurant' && productSales.length > 0
        ? `
        <div class="divider"></div>
        <div class="center bold">SATILAN URUNLER</div>
        ${productSales
          .map((item: any) => {
            const name = escHtml(item.product?.name || '—');
            const qty = formatNumber(item.quantity, 2, false);
            const rev = formatNumber(item.revenue, 2, false);
            return `<div class="row"><span>${name}</span><span>${qty} / ${rev}</span></div>`;
          })
          .join('')}
        `
        : '';

    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Z Raporu - ${zReport.date}</title>
        <style>
          @media print {
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; padding: 0; }
          }
          body {
            width: 80mm;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.3;
            padding: 5mm;
            margin: 0;
            color: #000;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 14px; }
          .divider { border-top: 1px dashed #000; margin: 3mm 0; }
          .row { display: flex; justify-content: space-between; margin: 1mm 0; }
          .header { margin-bottom: 3mm; }
        </style>
      </head>
      <body>
        <div class="header center">
          <div class="bold large">Z RAPORU</div>
          <div>RetailOS Mağaza Sistemi</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="row">
          <span>Tarih:</span>
          <span class="bold">${new Date(zReport.date).toLocaleDateString('tr-TR')}</span>
        </div>
        <div class="row">
          <span>Rapor Saati:</span>
          <span>${new Date().toLocaleTimeString('tr-TR')}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="center bold">SATIŞ ÖZETİ</div>
        
        <div class="row">
          <span>Toplam İşlem:</span>
          <span class="bold">${zReport.totalSales}</span>
        </div>
        <div class="row">
          <span>İlk Fiş No:</span>
          <span>${zReport.firstSale}</span>
        </div>
        <div class="row">
          <span>Son Fiş No:</span>
          <span>${zReport.lastSale}</span>
        </div>
        
        <div class="divider"></div>
        ${restaurantProductBlock}
        <div class="center bold">ÖDEME ÖZETİ</div>
        
        <div class="row">
          <span>Nakit:</span>
          <span>${formatNumber(zReport.cashAmount, 2, false)}</span>
        </div>
        <div class="row">
          <span>Kart:</span>
          <span>${formatNumber(zReport.cardAmount, 2, false)}</span>
        </div>
        <div class="row">
          <span>Toplam İndirim:</span>
          <span>${formatNumber(zReport.totalDiscount, 2, false)}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="row bold large">
          <span>TOPLAM CİRO:</span>
          <span>${formatNumber(zReport.totalAmount, 2, false)}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="center" style="margin-top: 5mm; font-size: 10px;">
          <div>Bu rapor otomatik oluşturulmuştur</div>
          <div>RetailOS v1.0</div>
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(reportHTML);
      doc.close();

      iframe.contentWindow?.addEventListener('load', () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 100);
      });
    }
  };

  // Menu Groups Based on Business Type
  const getMenuItems = (): any[] => {
    const commonGroups = [
      {
        key: 'grp-general',
        label: tm('genelYapayZeka'),
        type: 'group',
        children: [
          { key: 'chat-ai', label: tm('aiAsistan'), icon: <RobotOutlined /> },
          { key: 'daily-sales-executive', label: tm('yoneticiGunlukSatis'), icon: <RiseOutlined /> },
          { key: 'daily', label: tm('gunlukRapor'), icon: <CalendarOutlined /> },
          { key: 'end-of-day', label: tm('gunSonuRaporu'), icon: <HistoryOutlined /> },
          { key: 'z-report', label: tm('zRaporu'), icon: <PrinterOutlined /> },
          { key: 'comparison', label: tm('donemKarsilastirma'), icon: <SwapOutlined /> },
        ],
      },
      {
        key: 'grp-sales',
        label: tm('satisAnalizleri'),
        type: 'group',
        children: [
          { key: 'top-products', label: tm('enCokSatanlar'), icon: <LineChartOutlined /> },
          { key: 'category-analysis', label: tm('kategoriAnalizi'), icon: <PieChartOutlined /> },
          { key: 'hourly-analysis', label: tm('saatlikAnaliz'), icon: <ClockCircleOutlined /> },
          { key: 'cashiers', label: tm('kasiyerPerformansi'), icon: <TeamOutlined /> },
          { key: 'customer-sales', label: tm('musteriSatis'), icon: <UserOutlined /> },
          { key: 'sales-trend', label: tm('satisTrendAnalizi'), icon: <RiseOutlined /> },
          { key: 'sales-target', label: tm('hedefVsGerceklesen'), icon: <ThunderboltOutlined /> },
          { key: 'detailed-sales', label: tm('detayliSatisRaporu'), icon: <LineChartOutlined /> },
          { key: 'analysis', label: tm('analiz'), icon: <BarChart3 /> },
        ],
      },
      {
        key: 'grp-financial',
        label: tm('finansalRaporlar'),
        type: 'group',
        children: [
          { key: 'profit-loss', label: tm('karZararRaporu'), icon: <AccountBookOutlined /> },
          { key: 'cash-flow', label: tm('nakitAkisRaporu'), icon: <TransactionOutlined /> },
          { key: 'debt-aging', label: tm('borcAlacakYaslandirma'), icon: <HistoryOutlined /> },
          { key: 'check-tracking', label: tm('cekSenetTakibi'), icon: <AuditOutlined /> },
          { key: 'current-account', label: tm('cariHesapOzeti'), icon: <BankOutlined /> },
        ],
      },
      {
        key: 'grp-inventory',
        label: tm('stokRaporlari'),
        type: 'group',
        children: [
          { key: 'stock-status', label: tm('stokDurumu'), icon: <DatabaseOutlined /> },
          { key: 'stock-aging', label: tm('stokYaslandirma'), icon: <HourglassOutlined /> },
          { key: 'stock-turnover', label: tm('stokDonusHizi'), icon: <RetweetOutlined /> },
          { key: 'stock-abc', label: tm('stokAbcAnalizi'), icon: <ApartmentOutlined /> },
          { key: 'materials', label: tm('malHareketRaporu'), icon: <DeploymentUnitOutlined /> },
          { key: 'expiring-products', label: tm('sktYaklasanlar'), icon: <ExclamationCircleOutlined /> },
        ],
      },
      {
        key: 'grp-payment',
        label: tm('odemeVeIslemler'),
        type: 'group',
        children: [
          { key: 'payment-distribution', label: tm('odemeDagilimi'), icon: <CreditCardOutlined /> },
          { key: 'discount-report', label: tm('indirimRaporu'), icon: <TagsOutlined /> },
          { key: 'cash-status', label: tm('kasaDurumu'), icon: <BankOutlined /> },
          { key: 'commission', label: tm('komisyonRaporu'), icon: <SafetyCertificateOutlined /> },
          { key: 'cash-report', label: tm('kasaRaporu'), icon: <BankOutlined /> },
        ],
      },
    ];

    return [
      ...commonGroups,
      {
        key: 'grp-business-specific',
        label: bizConfig.groupLabel,
        type: 'group',
        children: businessType === 'restaurant' ? [
          { key: 'product-reports', label: tm('urunRaporlari'), icon: <ShoppingCart className="w-4 h-4" /> },
          { key: 'category-reports', label: tm('kategoriRaporlari'), icon: <PieChartIcon className="w-4 h-4" /> },
          { key: 'staff-reports', label: tm('personelRaporlari'), icon: <User className="w-4 h-4" /> },
          { key: 'staff-performance', label: tm('staffPerformance'), icon: <TrendingUp className="w-4 h-4" /> },
          { key: 'table-reports', label: tm('masaRaporlari'), icon: <ApartmentOutlined /> },
          { key: 'payment-reports', label: tm('odemeRaporlari'), icon: <CreditCard className="w-4 h-4" /> },
          { key: 'discount-reports', label: tm('indirimRaporlari'), icon: <Percent className="w-4 h-4" /> },
          { key: 'sales-movements', label: tm('satisHareketRaporu'), icon: <RiseOutlined /> },
          { key: 'receipts', label: tm('adisyonlar'), icon: <FileText className="w-4 h-4" /> },
          { key: 'courier-reports', label: tm('kuryeRaporlari'), icon: <Package className="w-4 h-4" /> },
          { key: 'cash-register-reports', label: tm('yazarkasaRaporlari'), icon: <PrinterOutlined /> },
          { key: 'turnover-reports', label: tm('ciroRaporlari'), icon: <DollarSign className="w-4 h-4" /> },
        ] : [
          { key: 'detailed-sales', label: tm('detayliSatisRaporu'), icon: <LineChartOutlined /> },
          { key: 'analysis', label: tm('analiz'), icon: <PieChartOutlined /> },
        ]
      }
    ];
  };

  const menuItems = getMenuItems();

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: bizConfig.color,
          borderRadius: 8,
        },
      }}
    >
      <Layout className="h-full bg-slate-50 overflow-hidden">
        {/* Sol Sidebar */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={280}
          theme="light"
          className="border-r border-slate-200 shadow-sm z-10"
          style={{ overflow: 'auto', height: '100%', position: 'relative' }}
        >
          <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white sticky top-0 z-20 h-[72px]">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{ backgroundColor: bizConfig.color, boxShadow: `0 10px 15px -3px ${bizConfig.color}44` }}>
              {bizConfig.icon}
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <h2 className="text-base font-black text-slate-800 leading-tight truncate">{bizConfig.title}</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">{tm('analizStats')}</p>
              </div>
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedTab]}
            defaultOpenKeys={['grp-general', 'grp-sales']}
            onClick={({ key }) => setSelectedTab(key as ReportTab)}
            items={menuItems}
            className="border-none py-2"
          />
        </Sider>

        <Layout className="h-full flex flex-col overflow-hidden bg-slate-50">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 h-[72px]">
            <div>
              <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                {menuItems.flatMap(g => g.children).find(i => i?.key === selectedTab)?.label || tm('report')}
              </h1>
              <p className="text-xs text-slate-500 font-medium">{tm('checkDataAndPerformance')}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Ekstra butonlar buraya gelebilir, örneğin genel dışa aktar */}
            </div>
          </div>

          <Content className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin' }}>

            {selectedTab === 'daily' && (
              <div className="space-y-4">
                {/* Date Selector */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-600" />
                        <span>Tarih Seçin:</span>
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'a4', label: 'A4 sayfa' },
                          { key: '80mm', label: '80 mm termal fiş' },
                        ],
                        onClick: ({ key }) =>
                          printDailySalesReport(key as 'a4' | '80mm'),
                      }}
                      trigger={['click']}
                    >
                      <Button type="primary" icon={<PrinterOutlined />}>
                        Yazdır <CaretDownOutlined />
                      </Button>
                    </Dropdown>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam Satış</p>
                        <p className="text-3xl font-bold mt-1" style={{ color: bizConfig.color }}>{dailySales.length}</p>
                      </div>
                      <ShoppingCart className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam Ciro</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyTotal, 2, false)}</p>
                      </div>
                      <DollarSign className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Nakit</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyCash, 2, false)}</p>
                      </div>
                      <DollarSign className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Kart</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyCard, 2, false)}</p>
                      </div>
                      <CreditCard className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>
                </div>

                {/* Sales List */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h3 className="text-lg">Satış Detayları</h3>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                    <table className="w-full min-w-[800px]">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm">Fiş No</th>
                          <th className="px-4 py-3 text-left text-sm">Saat</th>
                          <th className="px-4 py-3 text-left text-sm">Kasiyer</th>
                          <th className="px-4 py-3 text-left text-sm">Müşteri</th>
                          <th className="px-4 py-3 text-right text-sm">Tutar</th>
                          <th className="px-4 py-3 text-left text-sm">Ödeme</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dailySales.map(sale => (
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{sale.receiptNumber}</td>
                            <td className="px-4 py-3 text-sm">
                              {new Date(sale.date).toLocaleTimeString('tr-TR')}
                            </td>
                            <td className="px-4 py-3 text-sm">{sale.cashier || '-'}</td>
                            <td className="px-4 py-3 text-sm">{sale.customerName || '-'}</td>
                            <td className="px-4 py-3 text-right text-sm">{formatNumber(sale.total, 2, false)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs ${sale.paymentMethod === 'cash'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                                }`}>
                                {sale.paymentMethod === 'cash' ? 'Nakit' : 'Kart'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === 'z-report' && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg border">
                  <div className="p-6 border-b flex items-center justify-between">
                    <div>
                      <h3 className="text-xl">Gün Sonu Z Raporu</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(zReport.date).toLocaleDateString('tr-TR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={printZReport}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Download className="w-5 h-5" />
                      Yazdır
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Sales Summary */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">SATIŞ ÖZETİ</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">Toplam İşlem</p>
                          <p className="text-3xl text-blue-600 mt-1">{zReport.totalSales}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">Toplam Ciro</p>
                          <p className="text-3xl text-green-600 mt-1">{formatNumber(zReport.totalAmount, 2, false)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Summary */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">ÖDEME ÖZETİ</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span>Nakit Ödemeler</span>
                          <span className="text-lg">{formatNumber(zReport.cashAmount, 2, false)}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span>Kart Ödemeleri</span>
                          <span className="text-lg">{formatNumber(zReport.cardAmount, 2, false)}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg text-orange-700">
                          <span>Toplam İndirim</span>
                          <span className="text-lg">{formatNumber(zReport.totalDiscount, 2, false)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Receipt Range */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">FİŞ ARALIĞI</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">İlk Fiş</p>
                          <p className="text-lg mt-1">{zReport.firstSale}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">Son Fiş</p>
                          <p className="text-lg mt-1">{zReport.lastSale}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === 'top-products' && (
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="text-lg">Ürün Satış Analizi</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm">Sıra</th>
                        <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                        <th className="px-4 py-3 text-right text-sm">Satış Adedi</th>
                        <th className="px-4 py-3 text-right text-sm">Ciro</th>
                        <th className="px-4 py-3 text-right text-sm">İndirim</th>
                        <th className="px-4 py-3 text-right text-sm">Net Ciro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {productSales.map((item: any, index: number) => (
                        <tr key={item.product.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p>{item.product.name}</p>
                              <p className="text-xs text-gray-500">{item.product.category}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{formatNumber(item.revenue, 2, false)}</td>
                          <td className="px-4 py-3 text-right text-sm text-orange-600">
                            {formatNumber(item.discount, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-green-600">
                              {formatNumber(item.revenue - item.discount, 2, false)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedTab === 'cashiers' && (
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="text-lg">{tm('cashierPerformanceReport')}</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm">{tm('cashierLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('transactionCount')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('avgSaleLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('cashLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('cardLabel')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cashierPerformance.map(cashier => (
                        <tr key={cashier.name} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-sm">
                                {cashier.name && cashier.name.length > 0 ? cashier.name.charAt(0).toUpperCase() : '?'}
                              </div>
                              <span>{cashier.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                              {cashier.salesCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-lg text-green-600">
                            {formatNumber(cashier.totalRevenue, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.avgSale, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.cashSales, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.cardSales, 2, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedTab === 'top-products' && (() => {
              const topProducts = getTopProducts(20);
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <Award className="w-5 h-5 text-yellow-600" />
                      {tm('enCokSatanlar')} (TOP 20)
                    </h3>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">{tm('rankLabel')}</th>
                            <th className="px-4 py-3 text-left text-sm">{tm('productNameLabel')}</th>
                            <th className="px-4 py-3 text-left text-sm">{tm('categoryLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('salesQuantityLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('avgPriceLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('stockLabel')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {topProducts.map((product) => (
                            <tr key={product.rank} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className={`w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold ${product.rank <= 3 ? 'bg-yellow-500' : 'bg-gray-400'
                                  }`}>
                                  {product.rank}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-medium">{product.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{product.category}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold">
                                  {product.quantity}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-green-600 font-semibold">
                                {formatNumber(product.revenue, 2, false)} IQD
                              </td>
                              <td className="px-4 py-3 text-right text-sm">{formatNumber(product.avgPrice, 2, false)} IQD</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`px-2 py-1 rounded text-sm ${product.stock < 30 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                  {product.stock}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'category-analysis' && (() => {
              const categories = getCategoryAnalysis();
              const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-blue-600" />
                        {tm('categoryDistributionRevenue')}
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <RePieChart>
                          <Pie
                            data={categories.slice(0, 8).map((c, i) => ({ name: c.name, value: c.totalRevenue, fill: COLORS[i % COLORS.length] }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {categories.slice(0, 8).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                        </RePieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-green-600" />
                        {tm('categoryPerformance')}
                      </h3>
                      <div className="overflow-x-auto overflow-y-auto max-h-[300px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                        <table className="w-full min-w-[700px]">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm">{tm('categoryLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('totalRevenueLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('salesQuantityLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('avgPriceLabel')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {categories.map((cat, idx) => (
                              <tr key={cat.name} className="hover:bg-gray-50">
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    {cat.name}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-green-600">
                                  {formatNumber(cat.totalRevenue, 2, false)} IQD
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                    {cat.totalQuantity}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-sm">{formatNumber(cat.avgPrice, 2, false)} IQD</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'hourly-analysis' && (() => {
              const hourlyData = getHourlyAnalysis();
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-purple-600" />
                      {tm('hourlySalesAnalysis')}
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="sales" fill="#3b82f6" name={tm('transactionCount')} />
                        <Bar yAxisId="right" dataKey="revenue" fill="#10b981" name={tm('totalRevenueLabel') + ' (IQD)'} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="text-md">{tm('detailedHourlyData')}</h4>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[700px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">{tm('hourLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('transactionCount')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('avgSaleLabel')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {hourlyData.map((hour) => (
                            <tr key={hour.hour} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{hour.label}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                  {hour.sales}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-green-600 font-semibold">
                                {formatNumber(hour.revenue, 2, false)} IQD
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {hour.sales > 0 ? formatNumber(hour.revenue / hour.sales, 2, false) : '0'} IQD
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'cash-status' && (() => {
              const cashStatus = getCashStatus();
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('openingCash')}</p>
                          <p className="text-2xl text-blue-600 mt-1 font-bold">{formatNumber(cashStatus.openingCash, 2, false)} IQD</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('todayCash')}</p>
                          <p className="text-2xl text-green-600 mt-1 font-bold">{formatNumber(cashStatus.todayCash, 2, false)} IQD</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-purple-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('todayCard')}</p>
                          <p className="text-2xl text-purple-600 mt-1 font-bold">{formatNumber(cashStatus.todayCard, 2, false)} IQD</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-purple-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('closingCash')}</p>
                          <p className="text-2xl text-orange-600 mt-1 font-bold">{formatNumber(cashStatus.closingCash, 2, false)} IQD</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4">{tm('paymentDistribution')}</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            {tm('cashLabel')}
                          </span>
                          <span className="font-semibold text-green-600">{formatNumber(cashStatus.todayCash, 2, false)} IQD</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                            {tm('cardLabel')}
                          </span>
                          <span className="font-semibold text-blue-600">{formatNumber(cashStatus.todayCard, 2, false)} IQD</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-orange-500 rounded"></div>
                            {tm('transferLabel')}
                          </span>
                          <span className="font-semibold text-orange-600">{formatNumber(cashStatus.todayTransfer, 2, false)} IQD</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-2 border-green-200">
                          <span className="font-semibold">{tm('totalLabel_rep')}</span>
                          <span className="font-bold text-green-700 text-lg">{formatNumber(cashStatus.todayTotal, 2, false)} IQD</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4">{tm('cardTypes')}</h3>
                      <div className="space-y-3">
                        {cashStatus.cards.map((card) => (
                          <div key={card.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span>{card.name}</span>
                            <span className="font-semibold text-blue-600">{formatNumber(card.amount, 2, false)} IQD</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'payment-distribution' && (() => {
              const paymentDist: any = getPaymentDistribution();
              const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('cashLabel')}</p>
                          <p className="text-2xl text-green-600 mt-1 font-bold">{formatNumber(paymentDist.cash.amount, 2, false)} IQD</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.cash.count} işlem ({paymentDist.cash.percentage.toFixed(1)}%)</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('cardLabel')}</p>
                          <p className="text-2xl text-blue-600 mt-1 font-bold">{formatNumber(paymentDist.card.amount, 2, false)} IQD</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.card.count} işlem ({paymentDist.card.percentage.toFixed(1)}%)</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('transferLabel')}</p>
                          <p className="text-2xl text-orange-600 mt-1 font-bold">{formatNumber(paymentDist.transfer.amount, 2, false)} IQD</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.transfer.count} işlem ({paymentDist.transfer.percentage.toFixed(1)}%)</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-blue-600" />
                      Ödeme Yöntemi Dağılımı
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <RePieChart>
                          <Pie
                            data={paymentDist.chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {paymentDist.chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        {paymentDist.chartData.map((item: any, idx: number) => (
                          <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[idx] }}></div>
                              <span className="font-medium">{item.name}</span>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatNumber(item.value, 2, false)} IQD</p>
                              <p className="text-xs text-gray-500">{item.count} işlem</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'discount-report' && (() => {
              const discounts = getDiscountReport();
              const totalDiscount = discounts.reduce((sum, d) => sum + d.discountAmount, 0);
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam İndirim Tutarı</p>
                        <p className="text-3xl text-orange-600 mt-1 font-bold">{formatNumber(totalDiscount, 2, false)} IQD</p>
                        <p className="text-xs text-gray-500 mt-1">{discounts.reduce((sum, d) => sum + d.salesCount, 0)} işlemde uygulandı</p>
                      </div>
                      <Percent className="w-16 h-16 text-orange-600 opacity-20" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h3 className="text-lg flex items-center gap-2">
                        <Percent className="w-5 h-5 text-orange-600" />
                        İndirim Detayları
                      </h3>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[800px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">İndirim Türü</th>
                            <th className="px-4 py-3 text-right text-sm">İşlem Sayısı</th>
                            <th className="px-4 py-3 text-right text-sm">Toplam İndirim</th>
                            <th className="px-4 py-3 text-right text-sm">Ortalama İndirim</th>
                            <th className="px-4 py-3 text-right text-sm">Oran</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {discounts.map((discount) => (
                            <tr key={discount.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{discount.name}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                  {discount.salesCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-orange-600 font-semibold">
                                {formatNumber(discount.discountAmount, 2, false)} IQD
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {formatNumber(discount.avgDiscount, 2, false)} IQD
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                                  {((discount.discountAmount / totalDiscount) * 100).toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-bold">
                            <td className="px-4 py-3">TOPLAM</td>
                            <td className="px-4 py-3 text-right">{discounts.reduce((sum, d) => sum + d.salesCount, 0)}</td>
                            <td className="px-4 py-3 text-right text-orange-600">{formatNumber(totalDiscount, 2, false)} IQD</td>
                            <td className="px-4 py-3 text-right">{formatNumber(totalDiscount / discounts.reduce((sum, d) => sum + d.salesCount, 0), 2, false)} IQD</td>
                            <td className="px-4 py-3 text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'stock-status' && (() => {
              const stockStatus = getStockStatus();
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Toplam Ürün</p>
                          <p className="text-3xl text-blue-600 mt-1 font-bold">{stockStatus.totalProducts}</p>
                        </div>
                        <Package className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-red-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Tükendi</p>
                          <p className="text-3xl text-red-600 mt-1 font-bold">{stockStatus.outOfStock}</p>
                        </div>
                        <AlertCircle className="w-12 h-12 text-red-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Düşük Stok</p>
                          <p className="text-3xl text-orange-600 mt-1 font-bold">{stockStatus.lowStock}</p>
                        </div>
                        <TrendingDown className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Stok Değeri</p>
                          <p className="text-xl text-green-600 mt-1 font-bold">{formatNumber(stockStatus.totalStockValue, 2, false)} IQD</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h3 className="text-lg flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-orange-600" />
                        Düşük Stok Uyarıları
                      </h3>
                      <span className="text-sm text-gray-600">Kritik Seviye: 30 adet</span>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                            <th className="px-4 py-3 text-left text-sm">Kategori</th>
                            <th className="px-4 py-3 text-right text-sm">Mevcut Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Min. Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Fiyat</th>
                            <th className="px-4 py-3 text-right text-sm">Stok Değeri</th>
                            <th className="px-4 py-3 text-center text-sm">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {stockStatus.lowStockItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{item.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{item.category}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`px-2 py-1 rounded text-sm font-semibold ${item.stock === 0
                                  ? 'bg-red-100 text-red-700'
                                  : item.stock <= item.minStock
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-green-100 text-green-700'
                                  }`}>
                                  {item.stock}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm">{item.minStock}</td>
                              <td className="px-4 py-3 text-right text-sm">{formatNumber(item.price, 2, false)} IQD</td>
                              <td className="px-4 py-3 text-right text-sm">{formatNumber(item.value, 2, false)} IQD</td>
                              <td className="px-4 py-3 text-center">
                                {item.stock === 0 ? (
                                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Tükendi</span>
                                ) : (
                                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Düşük</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'comparison' && (() => {
              const comparison = getComparisonData(comparisonPeriod);
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-purple-600" />
                        Dönem Karşılaştırması
                      </h3>
                      <select
                        value={comparisonPeriod}
                        onChange={(e) => setComparisonPeriod(e.target.value as 'week' | 'month')}
                        className="px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                      >
                        <option value="week">Haftalık</option>
                        <option value="month">Aylık</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-blue-200">
                        <p className="text-sm text-gray-600 mb-2">Toplam Satış</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-blue-600">{comparison.current.totalSales}</p>
                          <span className={`text-sm font-semibold ${comparison.change.sales > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {comparison.change.sales > 0 ? '↑' : '↓'} {Math.abs(comparison.change.sales)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {comparison.previous.totalSales}</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-green-200">
                        <p className="text-sm text-gray-600 mb-2">Toplam Ciro</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-green-600">{formatNumber(comparison.current.totalRevenue, 0, false)} IQD</p>
                          <span className={`text-sm font-semibold ${comparison.change.revenue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {comparison.change.revenue > 0 ? '↑' : '↓'} {Math.abs(comparison.change.revenue)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {formatNumber(comparison.previous.totalRevenue, 0, false)} IQD</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-purple-200">
                        <p className="text-sm text-gray-600 mb-2">Ortalama Satış</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-purple-600">{formatNumber(comparison.current.avgSale, 0, false)} IQD</p>
                          <span className={`text-sm font-semibold ${comparison.change.avgSale > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {comparison.change.avgSale > 0 ? '↑' : '↓'} {Math.abs(comparison.change.avgSale)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {formatNumber(comparison.previous.avgSale, 0, false)} IQD</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-orange-200">
                        <p className="text-sm text-gray-600 mb-2">Müşteri Sayısı</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-orange-600">{comparison.current.customerCount}</p>
                          <span className={`text-sm font-semibold ${comparison.change.customerCount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {comparison.change.customerCount > 0 ? '↑' : '↓'} {Math.abs(comparison.change.customerCount)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {comparison.previous.customerCount}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'materials' && <MaterialMovementReport />}

            {selectedTab === 'expiring-products' && (() => {
              const getDaysUntilExpiry = (expiryDate: string) => {
                const today = new Date();
                const expiry = new Date(expiryDate);
                const diffTime = expiry.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
              };

              const getExpiryStatus = (expiryDate: string) => {
                const days = getDaysUntilExpiry(expiryDate);
                if (days < 0) return { status: 'expired', color: 'red', label: 'Süresi Geçmiş' };
                if (days <= 7) return { status: 'critical', color: 'red', label: 'Kritik' };
                if (days <= 30) return { status: 'warning', color: 'orange', label: 'Yakında' };
                return { status: 'normal', color: 'yellow', label: 'Normal' };
              };

              const expiredCount = expiringProducts.filter(p => p.expiry_date && getDaysUntilExpiry(p.expiry_date) < 0).length;
              const criticalCount = expiringProducts.filter(p => {
                if (!p.expiry_date) return false;
                const days = getDaysUntilExpiry(p.expiry_date);
                return days >= 0 && days <= 7;
              }).length;
              const warningCount = expiringProducts.filter(p => {
                if (!p.expiry_date) return false;
                const days = getDaysUntilExpiry(p.expiry_date);
                return days > 7 && days <= 30;
              }).length;

              const totalValue = expiringProducts.reduce((sum, p) => {
                return sum + ((p.unit_cost || 0) * (p.available_quantity || 0));
              }, 0);

              return (
                <div className="space-y-4">
                  {/* Filter & Stats */}
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        Son Kullanma Tarihi Yaklaşanlar
                      </h3>
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-600">Gün:</label>
                        <select
                          value={expiringDays}
                          onChange={(e) => setExpiringDays(Number(e.target.value))}
                          className="px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                        >
                          <option value={7}>7 Gün</option>
                          <option value={15}>15 Gün</option>
                          <option value={30}>30 Gün</option>
                          <option value={60}>60 Gün</option>
                          <option value={90}>90 Gün</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-red-50 rounded-lg border-2 border-red-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Süresi Geçmiş</p>
                            <p className="text-3xl text-red-600 mt-1 font-bold">{expiredCount}</p>
                          </div>
                          <AlertCircle className="w-12 h-12 text-red-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-orange-50 rounded-lg border-2 border-orange-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Kritik (≤7 gün)</p>
                            <p className="text-3xl text-orange-600 mt-1 font-bold">{criticalCount}</p>
                          </div>
                          <AlertTriangle className="w-12 h-12 text-orange-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg border-2 border-yellow-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Yakında (≤30 gün)</p>
                            <p className="text-3xl text-yellow-600 mt-1 font-bold">{warningCount}</p>
                          </div>
                          <Clock className="w-12 h-12 text-yellow-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg border-2 border-blue-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Toplam Değer</p>
                            <p className="text-xl text-blue-600 mt-1 font-bold">{formatNumber(totalValue, 2, false)} IQD</p>
                          </div>
                          <DollarSign className="w-12 h-12 text-blue-600 opacity-20" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Products Table */}
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h4 className="text-md font-semibold">Ürün Listesi</h4>
                      {loadingExpiring && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Yükleniyor...
                        </div>
                      )}
                    </div>
                    {loadingExpiring ? (
                      <div className="p-8 text-center">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-600">Yükleniyor...</p>
                      </div>
                    ) : expiringProducts.length === 0 ? (
                      <div className="p-8 text-center">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Son {expiringDays} gün içinde son kullanma tarihi yaklaşan ürün bulunamadı.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                        <table className="w-full min-w-[1000px]">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm">Ürün Kodu</th>
                              <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                              <th className="px-4 py-3 text-left text-sm">Lot/Seri No</th>
                              <th className="px-4 py-3 text-left text-sm">Depo</th>
                              <th className="px-4 py-3 text-right text-sm">Miktar</th>
                              <th className="px-4 py-3 text-left text-sm">Son Kullanma Tarihi</th>
                              <th className="px-4 py-3 text-right text-sm">Kalan Gün</th>
                              <th className="px-4 py-3 text-right text-sm">Birim Maliyet</th>
                              <th className="px-4 py-3 text-right text-sm">Toplam Değer</th>
                              <th className="px-4 py-3 text-center text-sm">Durum</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {expiringProducts
                              .sort((a, b) => {
                                if (!a.expiry_date) return 1;
                                if (!b.expiry_date) return -1;
                                return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                              })
                              .map((product, idx) => {
                                if (!product.expiry_date) return null;
                                const days = getDaysUntilExpiry(product.expiry_date);
                                const status = getExpiryStatus(product.expiry_date);
                                const productValue = (product.unit_cost || 0) * (product.available_quantity || 0);

                                return (
                                  <tr key={product.id || idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium">{product.product_code || '-'}</td>
                                    <td className="px-4 py-3">
                                      <div>
                                        <p className="font-medium">{product.product_name || '-'}</p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {product.lot_no && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Lot: {product.lot_no}</span>}
                                      {product.serial_no && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs ml-1">Seri: {product.serial_no}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{product.warehouse_name || '-'}</td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-semibold">
                                        {product.available_quantity || 0}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm">
                                          {new Date(product.expiry_date).toLocaleDateString('tr-TR')}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className={`px-2 py-1 rounded text-sm font-semibold ${days < 0
                                        ? 'bg-red-100 text-red-700'
                                        : days <= 7
                                          ? 'bg-orange-100 text-orange-700'
                                          : days <= 30
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-green-100 text-green-700'
                                        }`}>
                                        {days < 0 ? `${Math.abs(days)} gün geçmiş` : `${days} gün`}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm">{formatNumber(product.unit_cost || 0, 2, false)} IQD</td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold">{formatNumber(productValue, 2, false)} IQD</td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${status.color === 'red'
                                        ? 'bg-red-100 text-red-700'
                                        : status.color === 'orange'
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {status.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            {expiringProducts.filter(p => !p.expiry_date).length > 0 && (
                              <tr className="bg-gray-50">
                                <td colSpan={10} className="px-4 py-3 text-center text-sm text-gray-500">
                                  {expiringProducts.filter(p => !p.expiry_date).length} ürün için son kullanma tarihi belirtilmemiş
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t">
                            <tr>
                              <td colSpan={8} className="px-4 py-3 text-right font-semibold">TOPLAM:</td>
                              <td className="px-4 py-3 text-right font-bold text-green-600">{formatNumber(totalValue, 2, false)} IQD</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'profit-loss' && <ProfitLossReport />}

            {selectedTab === 'customer-sales' && (
              <CustomerSalesReport sales={sales} customers={[]} />
            )}

            {selectedTab === 'sales-trend' && (
              <SalesTrendReport sales={sales} />
            )}

            {selectedTab === 'sales-target' && (
              <SalesTargetReport sales={sales} />
            )}

            {selectedTab === 'cash-flow' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <DollarSign className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nakit Akış Raporu</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'debt-aging' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <FileText className="w-12 h-12 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Borç/Alacak Yaşlandırma</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'check-tracking' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <CreditCard className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Çek/Senet Takibi</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'current-account' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <BarChart3 className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Cari Hesap Özeti</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'stock-aging' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <Clock className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Stok Yaşlandırma</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'stock-turnover' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <TrendingUp className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Stok Dönüş Hızı</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'stock-abc' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <Award className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Stok ABC Analizi</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'commission' && (
              <div className="bg-white rounded-lg border p-6 text-center">
                <Percent className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Komisyon Raporu</h3>
                <p className="text-gray-600">Yakında eklenecek...</p>
              </div>
            )}

            {selectedTab === 'chat-ai' && (
              <ReportChatAI
                sales={sales}
                products={products}
                dailySales={dailySales}
                dailyTotal={dailyTotal}
                dailyCash={dailyCash}
                dailyCard={dailyCard}
                productSales={productSales}
                cashierPerformance={cashierPerformance}
                categoryAnalysis={getCategoryAnalysis()}
                hourlyAnalysis={getHourlyAnalysis()}
              />
            )}

            {selectedTab === 'daily-sales-executive' && (() => {
              const paymentDist = getPaymentDistribution();
              const categories = getCategoryAnalysis();
              const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

              return (
                <div className="space-y-6">
                  {/* Upper Section: Pie Chart & Financial Totals */}
                  <div className="grid grid-cols-12 gap-6">
                    {/* Left: Pie Chart */}
                    <div className="col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Ödeme Tipi Dağılımı</h3>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={paymentDist.chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={80}
                              outerRadius={120}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {paymentDist.chartData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                            <Legend verticalAlign="bottom" height={36} />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Right: Detailed Totals */}
                    <div className="col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="space-y-4">
                        {(() => {
                          const stats = businessType === 'restaurant' ? restStats : {
                            totalSales: dailyTotal,
                            payments: { 'NAKİT': dailyCash, 'POS': dailyCard },
                            discountTotal: dailyDiscount
                          };
                          const items = [
                            { label: 'Cariye aktarılan', value: 0, sub: 'Satış: 0,00, Çıkış: 0,00, Giriş: 0,00', color: 'text-slate-600' },
                            { label: 'NAKİT', value: stats?.payments?.['NAKİT'] || 0, sub: `Satış: ${formatNumber(stats?.payments?.['NAKİT'] || 0, 2, false)}, Çıkış: 0,00, Giriş: 0,00`, color: 'text-slate-800 font-bold' },
                            { label: 'POS', value: stats?.payments?.['POS'] || 0, sub: `Satış: ${formatNumber(stats?.payments?.['POS'] || 0, 2, false)}, Çıkış: 0,00, Giriş: 0,00`, color: 'text-slate-800' },
                            { label: 'MULTİNET', value: stats?.payments?.['MULTİNET'] || 0, color: 'text-slate-800' },
                            { label: 'Servis Ücreti', value: 0.00, color: 'text-red-500' },
                            { label: 'Açık Masalar', value: 0.00, color: 'text-green-500' },
                            { label: 'Genel Toplam', value: stats?.totalSales || 0, color: 'text-amber-500 font-black' },
                            { label: 'Tahsilat Toplam', value: stats?.totalSales || 0, color: 'text-red-500' },
                            { label: 'Satışlar Toplamı', value: stats?.totalSales || 0, color: 'text-blue-500' },
                          ];

                          return items.map((item, i) => (
                            <div key={i} className={`flex items-start justify-between border-b border-slate-50 pb-2 ${item.color}`}>
                              <div>
                                <p className="text-sm">{item.label}</p>
                                {item.sub && <p className="text-[10px] text-slate-400 italic">{item.sub}</p>}
                              </div>
                              <p className="text-sm">{formatNumber(item.value, 2, false)}</p>
                            </div>
                          ));
                        })()}
                        <div className="flex items-center gap-2 pt-2 text-purple-600 font-bold">
                          <TagsOutlined />
                          <span className="text-sm">İndirim Toplam</span>
                          <span className="ml-auto">{formatNumber(businessType === 'restaurant' ? (restStats?.discountTotal || 0) : dailyDiscount, 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Yemek Entegrasyonları (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Yemek Entegrasyonları Satış Dağılımı</h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'Yemek Sepeti', value: 0 },
                          { name: 'Getir Yemek', value: 0 },
                          { name: 'Trendyol Yemek', value: 0 }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" fill="#d1d5db" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Lower Section: Category Sales (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kategori Bazlı Satış Dağılımı</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categories.slice(0, 5).map(c => ({ name: c.name, value: c.totalRevenue }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={60}>
                            {categories.slice(0, 5).map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 0 ? '#e1f57d' : '#f9a825'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Region Table Section (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Bölge Masa Tablosu</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'SALON', value: 18145.00, color: '#a7f3d0' },
                          { name: 'TERAS', value: 9060.00, color: '#c084fc' },
                          { name: 'BAHÇE', value: 840.00, color: '#bcaaa4' },
                          { name: 'Perakende', value: 651.00, color: '#cfd8dc' },
                          { name: 'Paket Servis', value: 130.00, color: '#fff9c4' }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50}>
                            {[
                              { name: 'SALON', value: 18145.00, color: '#a7f3d0' },
                              { name: 'TERAS', value: 9060.00, color: '#c084fc' },
                              { name: 'BAHÇE', value: 840.00, color: '#bcaaa4' },
                              { name: 'Perakende', value: 651.00, color: '#cfd8dc' },
                              { name: 'Paket Servis', value: 130.00, color: '#fff9c4' }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Footer Section: Cashier and Department Summaries */}
                  <div className="grid grid-cols-2 gap-6 pb-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kasiyer İşlem Özeti</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={[{ name: 'YONETICİ', value: 28826.00 }]}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              dataKey="value"
                            >
                              <Cell fill="#ffab91" />
                            </Pie>
                            <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Bölüm İşlem Özeti</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={[
                                { name: 'BARİSTA', value: 225.00 },
                                { name: 'IZGARA', value: 28601.00 }
                              ] as any[]}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              dataKey="value"
                            >
                              <Cell fill="#90caf9" />
                              <Cell fill="#80cbc4" />
                            </Pie>
                            <Tooltip formatter={(value: any) => formatNumber(value, 2, false)} />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'end-of-day' && (() => {
              const paymentDist: any = getPaymentDistribution();
              const COLORS = ['#90caf9', '#81c784', '#ce93d8', '#ffab91', '#4db6ac'];
              return (
                <div className="space-y-6">
                  {/* Top Summary Cards */}
                  <div className="grid grid-cols-6 gap-4">
                    {(() => {
                      const totalGuests = restOrders.reduce((sum, o) => sum + (o.guest_count || 2), 0);
                      const totalItems = restOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0);
                      const takeawayOrders = restOrders.filter(o => o.table_id === 'TAKEAWAY');
                      const tableOrders = restOrders.filter(o => o.table_id !== 'TAKEAWAY' && o.table_id !== 'RETAIL');
                      const retailOrders = restOrders.filter(o => o.table_id === 'RETAIL');

                      return [
                        { label: 'Kişi Sayısı', value: totalGuests, icon: <TeamOutlined className="text-blue-200" />, color: 'border-blue-50' },
                        { label: 'Toplam Sipariş', value: restOrders.length, sub: `${totalItems} ürün`, icon: <HistoryOutlined className="text-purple-200" />, color: 'border-purple-50' },
                        { label: 'Servis (Masa)', value: tableOrders.length, sub: `${tableOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <ApartmentOutlined className="text-orange-200" />, color: 'border-orange-50' },
                        { label: 'Paket Servis', value: takeawayOrders.length, sub: `${takeawayOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <Package className="text-red-200" />, color: 'border-red-50' },
                        { label: 'Perakende', value: retailOrders.length, sub: `${retailOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <ShoppingCart className="text-green-200" />, color: 'border-green-50' },
                        { label: 'Self Servis', value: '0', sub: '0 ürün', icon: <PieChartIcon className="text-pink-200" />, color: 'border-pink-50' },
                      ].map((card, i) => (
                        <div key={i} className={`bg-white rounded-xl border-2 ${card.color} p-4 shadow-sm text-center relative overflow-hidden group hover:scale-105 transition-transform`}>
                          <div className="absolute -right-2 -top-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            {React.cloneElement(card.icon as any, { className: 'w-16 h-16' })}
                          </div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">{card.label}</p>
                          <p className="text-2xl font-black text-blue-600">{card.value}</p>
                          {card.sub && <p className="text-[10px] text-slate-400 font-medium">{card.sub}</p>}
                          <div className="mt-2 flex justify-center">
                            {React.cloneElement(card.icon as any, { className: 'w-4 h-4' })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Ödeme Tipi Dağılımı</h3>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={paymentDist.chartData}
                              cx="50%"
                              cy="50%"
                              outerRadius={120}
                              dataKey="value"
                            >
                              {paymentDist.chartData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="space-y-4">
                        {[
                          { label: 'Cariye aktarılan', value: 1433.70, sub: 'Satış: 1.433,70, Çıkış: 0,00, Giriş: 0,00', color: 'text-slate-600' },
                          { label: 'NAKİT', value: 28209.00, sub: 'Satış: 28.309,00, Çıkış: 240,00, Giriş: 140,00', color: 'text-slate-800 font-black' },
                          { label: 'POS', value: 9374.00, sub: 'Satış: 9.374,00, Çıkış: 0,00, Giriş: 0,00', color: 'text-slate-800' },
                          { label: 'MULTİNET', value: 170.00, sub: 'Satış: 170,00, Çıkış: 0,00, Giriş: 0,00', color: 'text-slate-800' },
                          { label: 'Servis Ücreti', value: 0.00, color: 'text-red-500' },
                          { label: 'Açık Masalar', value: 4972.50, color: 'text-green-500' },
                          { label: 'Genel Toplam', value: 42825.50, color: 'text-amber-500 font-black' },
                          { label: 'Tahsilat Toplam', value: 37753.00, color: 'text-red-500' },
                          { label: 'Satışlar Toplamı', value: 39186.70, color: 'text-blue-500' },
                        ].map((item, i) => (
                          <div key={i} className={`flex items-start justify-between border-b border-slate-50 pb-2 ${item.color}`}>
                            <div>
                              <p className="text-sm">{item.label}</p>
                              {item.sub && <p className="text-[10px] text-slate-400 italic">{item.sub}</p>}
                            </div>
                            <p className="text-sm">{formatNumber(item.value, 2, false)}</p>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-2 text-purple-600 font-bold">
                          <TagsOutlined />
                          <span className="text-sm uppercase font-black">İndirim Toplam</span>
                          <span className="ml-auto">{formatNumber(0, 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'cash-report' && (() => {
              const payments = restOrders.reduce((acc: any, o) => {
                const method = o.payment_method || 'NAKİT';
                acc[method] = (acc[method] || 0) + Number(o.total_amount || 0);
                return acc;
              }, {});

              const chartData = Object.entries(payments).map(([name, value]: [string, any]) => ({
                name,
                value: Number(value || 0),
                fill: name === 'NAKİT' ? '#64b5f6' : name === 'POS' ? '#b39ddb' : '#9575cd'
              }));

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kasa Hareket Raporları</h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <HistoryOutlined />
                        <span>Açıklama</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {Object.entries(payments).map(([method, total], i) => (
                        <div key={i} className={`p-3 flex justify-between items-center ${i % 2 === 0 ? 'bg-orange-50' : 'bg-white'}`}>
                          <span className="text-sm font-bold text-slate-700">{method}</span>
                          <div className="flex gap-20">
                            <span className="text-sm font-bold">-</span>
                            <span className="text-sm font-bold">{formatNumber(total as number, 2, false)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-purple-100 font-bold">
                        <span className="text-sm font-bold text-slate-700">Toplamlar</span>
                        <div className="flex gap-20">
                          <span className="text-sm font-bold">-</span>
                          <span className="text-sm font-bold">{formatNumber(Object.values(payments).reduce((s: number, v: any) => s + Number(v || 0), 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'product-reports' && (() => {
              const productSalesData = getProductSales();
              const chartData = productSalesData.slice(0, 10).map((p, i) => ({
                name: p.product.name,
                value: p.revenue,
                fill: `hsl(${25 + i * 20}, 70%, 60%)`
              }));

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">En Çok Satan Ürünler</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={25} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" />
                        <span>Ürün Adı</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Toplam Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {productSalesData.map((prod, i) => (
                        <React.Fragment key={i}>
                          <div className="p-2 text-white font-bold text-[10px] uppercase pl-4" style={{ backgroundColor: `${bizConfig.color}cc` }}>{prod.product.name}</div>
                          <div className="p-2 flex justify-between items-center pl-8 border-b" style={{ backgroundColor: `${bizConfig.color}11`, borderColor: `${bizConfig.color}22` }}>
                            <span className="text-xs font-bold text-slate-500">Satış Verisi</span>
                            <div className="flex gap-20 font-bold text-xs">
                              <span>{formatNumber(prod.quantity, 2, false)} Adet</span>
                              <span>{formatNumber(prod.revenue, 2, false)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-slate-100 font-bold border-t-2 border-slate-200">
                        <span className="text-sm font-bold text-slate-700">Genel Toplam</span>
                        <div className="flex gap-20">
                          <span className="text-sm font-bold">{formatNumber(productSalesData.reduce((s: number, p: any) => s + (p.quantity || 0), 0), 2, false)}</span>
                          <span className="text-sm font-bold">{formatNumber(productSalesData.reduce((s: number, p: any) => s + (p.revenue || 0), 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'category-reports' && (() => {
              const categories = getCategoryAnalysis();
              const COLORS = ['#f06292', '#d4e157', '#64b5f6', '#9575cd', '#4db6ac', '#ffb74d'];

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kategori Raporları</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categories.map((c, i) => ({ name: c.name, value: c.totalRevenue, fill: COLORS[i % COLORS.length] }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4" />
                        <span>Kategori Adı</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Toplam Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {categories.map((cat, i) => (
                        <React.Fragment key={i}>
                          <div className="bg-orange-400 p-2 text-white font-bold text-xs uppercase pl-4">{cat.name}</div>
                          {cat.items && cat.items.slice(0, 3).map((item, j) => (
                            <div key={j} className="p-2 flex justify-between items-center bg-orange-50 pl-8 border-b border-orange-100 border-l-4 border-l-orange-200">
                              <span className="text-[11px] font-medium text-slate-600">{item.product_name}</span>
                              <div className="flex gap-20 font-bold text-[11px]">
                                <span>{formatNumber(item.quantity, 0, false)}</span>
                                <span>{formatNumber(item.subtotal, 2, false)}</span>
                              </div>
                            </div>
                          ))}
                          <div className="p-2 flex justify-between items-center bg-amber-50 pl-8 font-bold border-b border-amber-200">
                            <span className="text-xs text-amber-700">Kategori Toplamı</span>
                            <div className="flex gap-20 text-xs text-amber-700">
                              <span>{formatNumber(cat.totalQuantity, 2, false)}</span>
                              <span>{formatNumber(cat.totalRevenue, 2, false)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-purple-100 font-bold">
                        <span className="text-sm">Genel Toplam</span>
                        <div className="flex gap-20">
                          <span>{formatNumber(categories.reduce((s, c) => s + c.totalQuantity, 0), 2, false)}</span>
                          <span>{formatNumber(categories.reduce((s, c) => s + c.totalRevenue, 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'detailed-sales' && (() => {
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                      <Input
                        placeholder="Aranacak kelime giriniz"
                        prefix={<SearchOutlined className="text-slate-400" />}
                        className="max-w-md border-slate-200"
                      />
                      <Button icon={<FilterOutlined />}>Filtre</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button icon={<MailOutlined />} type="text" />
                      <Button icon={<FilePdfOutlined />} type="text" />
                      <Button icon={<FileExcelOutlined />} type="text" />
                      <Button icon={<PrinterOutlined />} type="text" />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-[11px]">
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border-b border-slate-100 italic text-slate-500">
                      <HistoryOutlined className="w-3 h-3" />
                      <span>Detaylar</span>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 p-2 bg-slate-50 border-b border-slate-200 font-bold text-blue-600 uppercase tracking-tighter">
                      <div className="col-span-1">Açılış za...</div>
                      <div className="col-span-1">Kapanış ...</div>
                      <div className="col-span-1">Sipariş No</div>
                      <div className="col-span-1">Masa Adı</div>
                      <div className="col-span-1">Ürün Adı</div>
                      <div className="col-span-1">Cari</div>
                      <div className="col-span-1 text-center">Miktar</div>
                      <div className="col-span-1">Birim Fiyat</div>
                      <div className="col-span-1">Satır Topl...</div>
                      <div className="col-span-1">Durum</div>
                      <div className="col-span-2">Satır Öze...</div>
                    </div>

                    {/* Grouped Data Mockup */}
                    {[
                      {
                        id: '621',
                        items: [
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'ÇİLEK REÇELİ', cari: 'Peşin Satış', qty: 1, price: 18, total: 18, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'DOMATES', cari: 'Peşin Satış', qty: 1, price: 8, total: 8, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'SOSİS', cari: 'Peşin Satış', qty: 1, price: 23, total: 23, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'SALATALIK', cari: 'Peşin Satış', qty: 1, price: 14, total: 14, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'SİYAH ZEYTİN', cari: 'Peşin Satış', qty: 2, price: 0, total: 0, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'ŞİŞ KÖFTE', cari: 'Peşin Satış', qty: 1, price: 85, total: 85, status: 'Aktif' },
                          { open: '22/02/2025', close: '01/01/1970', table: 'S 10', product: 'BAL', cari: 'Peşin Satış', qty: 1, price: 90, total: 90, status: 'Aktif' },
                        ],
                        summary: { qty: 11, total: 220, discount: 0, count: 10 }
                      },
                      {
                        id: '647',
                        items: [],
                        summary: { qty: 4, total: 120, discount: 0, count: 4 }
                      },
                      {
                        id: '649',
                        items: [],
                        summary: { qty: 8, total: 320, discount: 0, count: 8 }
                      }
                    ].map((group, idx) => (
                      <div key={idx} className="border-b border-slate-100 last:border-0">
                        <div className="bg-slate-50/50 p-2 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <CaretDownOutlined className="text-red-500 w-3 h-3" />
                            <span className="text-red-600 font-bold">Sipariş No : {group.id}</span>
                          </div>
                          <div className="flex items-center gap-4 text-[10px]">
                            <span className="text-green-600 font-bold">(Miktar {group.summary.qty}.0, Tutar {group.summary.total.toFixed(2)}, İndirim {group.summary.discount.toFixed(1)})</span>
                            <span className="bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center font-black">
                              {group.summary.count}
                            </span>
                          </div>
                        </div>
                        {group.items.map((item, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 p-2 hover:bg-red-50/10 text-slate-600 transition-colors border-b border-slate-50 last:border-0">
                            <div className="col-span-1">{item.open}</div>
                            <div className="col-span-1">{item.close}</div>
                            <div className="col-span-1">{group.id}</div>
                            <div className="col-span-1">{item.table}</div>
                            <div className="col-span-1 font-bold text-slate-800">{item.product}</div>
                            <div className="col-span-1">{item.cari}</div>
                            <div className="col-span-1 text-center font-bold">{item.qty}</div>
                            <div className="col-span-1 font-bold">{formatNumber(Number(item.price), 2, false)}</div>
                            <div className="col-span-1 font-black">{formatNumber(Number(item.total), 2, false)}</div>
                            <div className="col-span-1 text-green-500 font-bold">{item.status}</div>
                            <div className="col-span-2">---</div>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="p-2 bg-slate-100 flex justify-between items-center font-bold text-slate-500 border-t border-slate-200">
                      <span>Zeroolt Yazılım A.Ş.</span>
                      <span>Toplam Kayıt : 202</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'analysis' && (() => {
              const cards = [
                'Aylara Göre Satışlar', 'Kullanıcıya Göre Ciro Toplamları', 'Kategoriye Göre Aylık Satış Toplamları',
                'Ürüne Göre Aylık Satış Miktarları', 'Kategoriye Göre Aylık Satış Miktarları', 'Bölümlere Göre Satış Toplamları',
                'Bölgelere Göre Satış Toplamları', 'Masalara Göre Satış Toplamları', 'Aylara Göre Tahsilat Toplamları'
              ];
              return (
                <div className="grid grid-cols-4 gap-4">
                  {cards.map((card, i) => (
                    <div key={i} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-4 hover:shadow-md hover:border-red-200 transition-all cursor-pointer group">
                      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <PieChartIcon className="text-red-600 w-6 h-6" />
                      </div>
                      <span className="text-[13px] font-bold text-slate-600 text-center leading-snug">{card}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
