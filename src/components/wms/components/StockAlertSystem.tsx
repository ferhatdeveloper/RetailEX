// 🚨 AKILLI STOK UYARI & SEVKİYAT ÖNERİ SİSTEMİ
// AI-Powered Branch Stock Monitoring & Auto Replenishment Suggestions

import { useState, useEffect } from 'react';
import {
  AlertTriangle, TrendingDown, Truck, Package, Store,
  ArrowRight, CheckCircle, XCircle, Clock, RefreshCw,
  BarChart3, Target, Zap, Bell, Filter, Search,
  Calendar, MapPin, Box, Send, Eye, ChevronRight,
  AlertCircle, Activity, TrendingUp
} from 'lucide-react';
import { formatCurrency, formatNumber, formatDateTime } from '../utils';

interface BranchStock {
  branchId: string;
  branchName: string;
  branchCity: string;
  productId: string;
  productCode: string;
  productName: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
  lastReplenishment: string;
  trend: 'increasing' | 'stable' | 'decreasing' | 'critical';
}

interface ReplenishmentSuggestion {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  branchId: string;
  branchName: string;
  branchCity: string;
  productId: string;
  productCode: string;
  productName: string;
  currentStock: number;
  suggestedQuantity: number;
  estimatedCost: number;
  daysUntilStockout: number;
  reason: string;
  warehouseStock: number;
  autoApproved: boolean;
  created_at: string;
}

interface StockAlertSystemProps {
  darkMode: boolean;
  onNavigate?: (page: string, data?: any) => void;
}

export function StockAlertSystem({ darkMode, onNavigate }: StockAlertSystemProps) {
  const [branchStocks, setBranchStocks] = useState<BranchStock[]>([]);
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-blue-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  useEffect(() => {
    loadStockAlerts();

    if (autoRefresh) {
      const interval = setInterval(loadStockAlerts, 30000); // 30 saniyede bir
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadStockAlerts = async () => {
    setIsLoading(true);
    try {
      // TODO: API'den gerçek veri çekilecek
      setTimeout(() => {
        // Mock data - Gerçek veriler Supabase'den gelecek
        const mockBranchStocks: BranchStock[] = [
          {
            branchId: 'BR001',
            branchName: 'Karrada Şubesi',
            branchCity: 'Baghdad',
            productId: 'PRD001',
            productCode: 'IPHONE15-BLK',
            productName: 'iPhone 15 Pro Max 256GB Black',
            currentStock: 3,
            minStock: 10,
            maxStock: 50,
            avgDailySales: 2.5,
            daysUntilStockout: 1.2,
            lastReplenishment: '2024-01-20',
            trend: 'critical'
          },
          {
            branchId: 'BR002',
            branchName: 'Mansour Şubesi',
            branchCity: 'Baghdad',
            productId: 'PRD002',
            productCode: 'SAM-S24-WHT',
            productName: 'Samsung Galaxy S24 Ultra White',
            currentStock: 8,
            minStock: 15,
            maxStock: 40,
            avgDailySales: 1.8,
            daysUntilStockout: 4.4,
            lastReplenishment: '2024-01-18',
            trend: 'decreasing'
          },
          {
            branchId: 'BR003',
            branchName: 'Erbil Merkez',
            branchCity: 'Erbil',
            productId: 'PRD003',
            productCode: 'MAC-M3-SLV',
            productName: 'MacBook Pro M3 14" Silver',
            currentStock: 2,
            minStock: 5,
            maxStock: 20,
            avgDailySales: 0.8,
            daysUntilStockout: 2.5,
            lastReplenishment: '2024-01-15',
            trend: 'critical'
          },
          {
            branchId: 'BR004',
            branchName: 'Basra Liman',
            branchCity: 'Basra',
            productId: 'PRD004',
            productCode: 'AIRPODS-PRO2',
            productName: 'AirPods Pro 2nd Generation',
            currentStock: 12,
            minStock: 20,
            maxStock: 60,
            avgDailySales: 3.2,
            daysUntilStockout: 3.75,
            lastReplenishment: '2024-01-19',
            trend: 'decreasing'
          }
        ];

        // AI-Powered Suggestions
        const mockSuggestions: ReplenishmentSuggestion[] = mockBranchStocks
          .filter(stock => stock.currentStock < stock.minStock)
          .map((stock, index) => {
            const suggestedQuantity = Math.ceil(
              (stock.maxStock - stock.currentStock) +
              (stock.avgDailySales * 7) // 7 günlük güvenlik stoku
            );

            let priority: 'critical' | 'high' | 'medium' | 'low';
            if (stock.daysUntilStockout < 2) priority = 'critical';
            else if (stock.daysUntilStockout < 5) priority = 'high';
            else if (stock.daysUntilStockout < 10) priority = 'medium';
            else priority = 'low';

            return {
              id: `SUG-${Date.now()}-${index}`,
              priority,
              branchId: stock.branchId,
              branchName: stock.branchName,
              branchCity: stock.branchCity,
              productId: stock.productId,
              productCode: stock.productCode,
              productName: stock.productName,
              currentStock: stock.currentStock,
              suggestedQuantity,
              estimatedCost: suggestedQuantity * 25000000, // IQD
              daysUntilStockout: stock.daysUntilStockout,
              reason: stock.daysUntilStockout < 2
                ? '⚠️ KRİTİK: Stok tükenmesine 1-2 gün kaldı!'
                : stock.daysUntilStockout < 5
                  ? '🔴 YÜKSEK: Acil sevkiyat gerekli'
                  : '🟡 ORTA: Yakın zamanda sevkiyat önerilir',
              warehouseStock: 150, // Depo stoku
              autoApproved: priority === 'critical', // Kritik olanlar otomatik onaylı
              created_at: new Date().toISOString()
            };
          });

        setBranchStocks(mockBranchStocks);
        setSuggestions(mockSuggestions.sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }));
        setIsLoading(false);
      }, 800);
    } catch (error) {
      console.error('Error loading stock alerts:', error);
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return darkMode ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'bg-red-50 border-red-300 text-red-900';
      case 'high': return darkMode ? 'bg-orange-900/30 border-orange-500/50 text-orange-300' : 'bg-orange-50 border-orange-300 text-orange-900';
      case 'medium': return darkMode ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-300' : 'bg-yellow-50 border-yellow-300 text-yellow-900';
      case 'low': return darkMode ? 'bg-blue-900/30 border-blue-500/50 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-900';
      default: return cardClass;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      critical: 'bg-red-500 text-white',
      high: 'bg-orange-500 text-white',
      medium: 'bg-yellow-500 text-white',
      low: 'bg-blue-500 text-white'
    };
    const labels = {
      critical: 'KRİTİK',
      high: 'YÜKSEK',
      medium: 'ORTA',
      low: 'DÜŞÜK'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-bold ${colors[priority as keyof typeof colors]}`}>
        {labels[priority as keyof typeof labels]}
      </span>
    );
  };

  const handleApproveSuggestion = (suggestionId: string) => {
    if (onNavigate) {
      const suggestion = suggestions.find(s => s.id === suggestionId);
      if (suggestion) {
        // Transfer sayfasına yönlendir
        onNavigate('transfer', {
          targetBranch: suggestion.branchId,
          products: [{
            productId: suggestion.productId,
            quantity: suggestion.suggestedQuantity
          }]
        });
      }
    }
  };

  const filteredSuggestions = suggestions.filter(s => {
    const matchesPriority = selectedPriority === 'all' || s.priority === selectedPriority;
    const matchesBranch = selectedBranch === 'all' || s.branchId === selectedBranch;
    const matchesSearch = searchQuery === '' ||
      s.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.branchName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesPriority && matchesBranch && matchesSearch;
  });

  const stats = {
    totalAlerts: suggestions.length,
    criticalAlerts: suggestions.filter(s => s.priority === 'critical').length,
    highAlerts: suggestions.filter(s => s.priority === 'high').length,
    totalValue: suggestions.reduce((sum, s) => sum + s.estimatedCost, 0),
    autoApproved: suggestions.filter(s => s.autoApproved).length
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen ${bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <RefreshCw className={`w-12 h-12 ${textClass} animate-spin mx-auto mb-4`} />
          <p className={textMutedClass}>Stok uyarıları yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgClass} p-4 md:p-6`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Bell className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-2xl md:text-3xl ${textClass}`}>Akıllı Stok Uyarı Sistemi</h1>
              <p className={textMutedClass}>Şubelerdeki stok durumu anlık takip ve otomatik sevkiyat önerileri</p>
            </div>
          </div>

          <button
            onClick={loadStockAlerts}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'} transition-colors`}
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden md:inline">Yenile</span>
          </button>
        </div>

        {/* Auto Refresh Toggle */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${autoRefresh
              ? 'bg-green-500 text-white'
              : darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'
              }`}
          >
            <Activity className="w-4 h-4" />
            <span>Otomatik Yenileme {autoRefresh ? 'Açık' : 'Kapalı'}</span>
          </button>
          {autoRefresh && (
            <span className="text-xs text-gray-500">Her 30 saniyede güncellenir</span>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span className="text-xs text-gray-500">Toplam</span>
          </div>
          <p className={`text-2xl ${textClass}`}>{stats.totalAlerts}</p>
          <p className="text-xs text-gray-500 mt-1">Aktif Uyarı</p>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-xs text-gray-500">Kritik</span>
          </div>
          <p className="text-2xl text-red-600">{stats.criticalAlerts}</p>
          <p className="text-xs text-gray-500 mt-1">Acil İşlem Gerekli</p>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <span className="text-xs text-gray-500">Yüksek</span>
          </div>
          <p className="text-2xl text-orange-600">{stats.highAlerts}</p>
          <p className="text-xs text-gray-500 mt-1">Öncelikli</p>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <Package className="w-5 h-5 text-blue-500" />
            <span className="text-xs text-gray-500">Toplam Değer</span>
          </div>
          <p className={`text-lg ${textClass}`}>{formatCurrency(stats.totalValue)}</p>
          <p className="text-xs text-gray-500 mt-1">Sevkiyat Maliyeti</p>
        </div>

        <div className={`${cardClass} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-5 h-5 text-green-500" />
            <span className="text-xs text-gray-500">Oto-Onay</span>
          </div>
          <p className="text-2xl text-green-600">{stats.autoApproved}</p>
          <p className="text-xs text-gray-500 mt-1">Sistem Onaylı</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={`block text-sm ${textMutedClass} mb-2`}>Öncelik</label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
            >
              <option value="all">Tümü</option>
              <option value="critical">Kritik</option>
              <option value="high">Yüksek</option>
              <option value="medium">Orta</option>
              <option value="low">Düşük</option>
            </select>
          </div>

          <div>
            <label className={`block text-sm ${textMutedClass} mb-2`}>Şube</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
            >
              <option value="all">Tüm Şubeler</option>
              {[...new Set(branchStocks.map(b => b.branchId))].map(branchId => {
                const branch = branchStocks.find(b => b.branchId === branchId);
                return (
                  <option key={branchId} value={branchId}>
                    {branch?.branchName} ({branch?.branchCity})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={`block text-sm ${textMutedClass} mb-2`}>Ürün Ara</label>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${textMutedClass}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ürün adı veya kodu..."
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 placeholder-gray-500'}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-xl ${textClass}`}>
            Sevkiyat Önerileri ({filteredSuggestions.length})
          </h2>
          {filteredSuggestions.length > 0 && (
            <p className="text-sm text-gray-500">
              Toplam Maliyet: <span className={textClass}>{formatCurrency(
                filteredSuggestions.reduce((sum, s) => sum + s.estimatedCost, 0)
              )}</span>
            </p>
          )}
        </div>

        {filteredSuggestions.length === 0 ? (
          <div className={`${cardClass} border rounded-xl p-12 text-center`}>
            <CheckCircle className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
            <h3 className={`text-xl ${textClass} mb-2`}>Tüm Şubeler Optimal Seviyede!</h3>
            <p className={textMutedClass}>Şu anda acil sevkiyat gerektiren ürün bulunmuyor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`border rounded-xl p-4 md:p-6 ${getPriorityColor(suggestion.priority)}`}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Left: Priority & Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${suggestion.priority === 'critical' ? 'text-red-500 animate-pulse' :
                        suggestion.priority === 'high' ? 'text-orange-500' : 'text-yellow-500'
                        }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getPriorityBadge(suggestion.priority)}
                          {suggestion.autoApproved && (
                            <span className="px-2 py-1 bg-green-500 text-white rounded text-xs font-bold flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              OTO-ONAY
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {formatDateTime(suggestion.created_at)}
                          </span>
                        </div>

                        <h3 className="text-lg font-semibold mb-1">
                          {suggestion.productName}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {suggestion.productCode}
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-gray-500">Şube</p>
                            <p className="text-sm font-medium">
                              {suggestion.branchName}
                            </p>
                            <p className="text-xs text-gray-500">{suggestion.branchCity}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Mevcut Stok</p>
                            <p className="text-sm font-medium text-red-600">
                              {formatNumber(suggestion.currentStock)} adet
                            </p>
                            <p className="text-xs text-gray-500">
                              {suggestion.daysUntilStockout.toFixed(1)} gün
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Önerilen Miktar</p>
                            <p className="text-sm font-medium text-green-600">
                              {formatNumber(suggestion.suggestedQuantity)} adet
                            </p>
                            <p className="text-xs text-gray-500">Depo: {suggestion.warehouseStock}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500">Tahmini Maliyet</p>
                            <p className="text-sm font-medium">
                              {formatCurrency(suggestion.estimatedCost)}
                            </p>
                          </div>
                        </div>

                        <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-white/50'} border ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                          <p className="text-sm">
                            <strong>Sebep:</strong> {suggestion.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-2 md:min-w-[200px]">
                    <button
                      onClick={() => handleApproveSuggestion(suggestion.id)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all shadow-lg active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                      <span>Transfer Oluştur</span>
                    </button>

                    <button
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-white/50 dark:bg-gray-700/50 hover:bg-white/70 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-300 dark:border-gray-600"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Detaylar</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

