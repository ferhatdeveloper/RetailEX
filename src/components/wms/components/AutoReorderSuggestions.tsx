// ğŸ”„ Auto Reorder Suggestions - Otomatik Sipariş Önerileri
// Min-Max stock levels, reorder point, automatic suggestions

import { useState, useEffect } from 'react';
import {
  RefreshCw, TrendingDown, AlertCircle, CheckCircle, Send,
  Package, Calendar, DollarSign, Truck, MessageCircle,
  Download, Filter, Eye, X
} from 'lucide-react';

interface AutoReorderSuggestionsProps {
  darkMode: boolean;
  onBack: () => void;
}

interface ReorderSuggestion {
  id: string;
  product_id: string;
  product_name: string;
  category: string;
  supplier_name: string;
  supplier_phone: string;

  // Stock levels
  current_stock: number;
  min_stock: number;
  max_stock: number;
  reorder_point: number;
  safety_stock: number;

  // Calculations
  daily_usage: number;
  lead_time_days: number;
  suggested_order_qty: number;
  estimated_cost: number;

  // Priority
  priority: 'critical' | 'high' | 'medium' | 'low';
  days_until_stockout: number;

  // Status
  status: 'pending' | 'approved' | 'ordered' | 'cancelled';
  last_order_date?: string;
  last_order_qty?: number;
}

export function AutoReorderSuggestions({ darkMode, onBack }: AutoReorderSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    // Mock data
    const mockSuggestions: ReorderSuggestion[] = [
      {
        id: '1',
        product_id: 'P1',
        product_name: 'Zeytinyağı 1L',
        category: 'Yağlar',
        supplier_name: 'Komili A.Ş.',
        supplier_phone: '+964 770 123 4567',
        current_stock: 45,
        min_stock: 100,
        max_stock: 500,
        reorder_point: 150,
        safety_stock: 50,
        daily_usage: 38,
        lead_time_days: 3,
        suggested_order_qty: 400,
        estimated_cost: 12500000,
        priority: 'critical',
        days_until_stockout: 1,
        status: 'pending',
        last_order_date: '2024-12-15',
        last_order_qty: 350
      },
      {
        id: '2',
        product_id: 'P2',
        product_name: 'Un 1kg',
        category: 'Unlar',
        supplier_name: 'Söke Un',
        supplier_phone: '+964 770 234 5678',
        current_stock: 180,
        min_stock: 200,
        max_stock: 1000,
        reorder_point: 300,
        safety_stock: 100,
        daily_usage: 45,
        lead_time_days: 2,
        suggested_order_qty: 800,
        estimated_cost: 8000000,
        priority: 'high',
        days_until_stockout: 4,
        status: 'pending'
      },
      {
        id: '3',
        product_id: 'P3',
        product_name: 'Makarna 500g',
        category: 'Bakliyat',
        supplier_name: 'Piyale Gıda',
        supplier_phone: '+964 770 345 6789',
        current_stock: 320,
        min_stock: 300,
        max_stock: 1500,
        reorder_point: 500,
        safety_stock: 150,
        daily_usage: 28,
        lead_time_days: 4,
        suggested_order_qty: 1000,
        estimated_cost: 5500000,
        priority: 'medium',
        days_until_stockout: 11,
        status: 'pending'
      },
    ];
    setSuggestions(mockSuggestions);
  };

  const getPriorityConfig = (priority: string) => {
    const configs: any = {
      critical: { label: 'Kritik', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: AlertCircle },
      high: { label: 'Yüksek', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30', icon: TrendingDown },
      medium: { label: 'Orta', color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: Package },
      low: { label: 'Düşük', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: CheckCircle },
    };
    return configs[priority] || configs.low;
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedItems(newSelection);
  };

  const generateWhatsAppMessage = () => {
    const selected = suggestions.filter(s => selectedItems.has(s.id));
    if (selected.length === 0) {
      alert('Lütfen sipariş seçin');
      return;
    }

    let message = '🛒 *Sipariş Talebi*\n\n';
    message += `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n\n`;

    selected.forEach((item, index) => {
      message += `${index + 1}. *${item.product_name}*\n`;
      message += `   Miktar: ${item.suggested_order_qty} adet\n`;
      message += `   Mevcut Stok: ${item.current_stock}\n`;
      message += `   Tahmini Tutar: ${(item.estimated_cost / 1000).toFixed(0)}K IQD\n\n`;
    });

    const totalCost = selected.reduce((sum, item) => sum + item.estimated_cost, 0);
    message += `*Toplam Tutar:* ${(totalCost / 1000000).toFixed(2)}M IQD\n\n`;
    message += 'Lütfen onaylayınız. Teşekkürler.';

    setWhatsappMessage(message);
    setShowWhatsApp(true);
  };

  const sendViaWhatsApp = (supplier_phone: string) => {
    const encodedMessage = encodeURIComponent(whatsappMessage);
    const whatsappUrl = `https://wa.me/${supplier_phone.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    setShowWhatsApp(false);
  };

  // Priority counts
  const priorityCounts = {
    critical: suggestions.filter(s => s.priority === 'critical').length,
    high: suggestions.filter(s => s.priority === 'high').length,
    medium: suggestions.filter(s => s.priority === 'medium').length,
    low: suggestions.filter(s => s.priority === 'low').length,
  };

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
          ← Geri
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${textClass} mb-2 flex items-center gap-3`}>
              <RefreshCw className="w-8 h-8 text-blue-500" />
              Otomatik Sipariş Önerileri
            </h1>
            <p className="text-gray-500">Min-Max stok seviyeleri ve yeniden sipariş noktaları</p>
          </div>
        </div>
      </div>

      {/* Priority Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(priorityCounts).map(([priority, count]) => {
          const config = getPriorityConfig(priority);
          const Icon = config.icon;

          return (
            <button
              key={priority}
              onClick={() => setPriorityFilter(priorityFilter === priority ? 'all' : priority)}
              className={`${cardClass} border-2 rounded-xl p-4 transition-all ${priorityFilter === priority ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-12 h-12 ${config.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${config.color}`} />
                </div>
                <span className={`text-3xl font-black ${textClass}`}>{count}</span>
              </div>
              <div className={`text-sm font-semibold ${config.color}`}>{config.label}</div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      {selectedItems.size > 0 && (
        <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className={textClass}>{selectedItems.size} ürün seçildi</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={generateWhatsAppMessage}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp ile Gönder
              </button>
              <button
                onClick={() => setSelectedItems(new Set())}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
              >
                <X className="w-4 h-4" />
                Seçimi Temizle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggestions Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className={`text-lg font-bold ${textClass}`}>Sipariş Önerileri</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(suggestions.map(s => s.id)));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Öncelik</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mevcut</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Min/Max</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tükenme</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Öneri</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tutar</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {suggestions
                .filter(s => priorityFilter === 'all' || s.priority === priorityFilter)
                .map((suggestion) => {
                  const priorityConfig = getPriorityConfig(suggestion.priority);
                  const PriorityIcon = priorityConfig.icon;

                  return (
                    <tr key={suggestion.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(suggestion.id)}
                          onChange={() => toggleSelection(suggestion.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className={`font-medium ${textClass}`}>{suggestion.product_name}</div>
                        <div className="text-xs text-gray-500">{suggestion.supplier_name}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${priorityConfig.bg} ${priorityConfig.color}`}>
                          <PriorityIcon className="w-3 h-3" />
                          {priorityConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-lg font-bold ${suggestion.current_stock < suggestion.min_stock ? 'text-red-600' : textClass}`}>
                          {suggestion.current_stock}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm">
                          <div className="text-gray-500">Min: {suggestion.min_stock}</div>
                          <div className="text-gray-500">Max: {suggestion.max_stock}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-bold ${suggestion.days_until_stockout <= 2 ? 'text-red-600' :
                            suggestion.days_until_stockout <= 5 ? 'text-orange-600' :
                              'text-green-600'
                          }`}>
                          {suggestion.days_until_stockout} gün
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-lg font-bold ${textClass}`}>
                          {suggestion.suggested_order_qty}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm">{(suggestion.estimated_cost / 1000).toFixed(0)}K IQD</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedItems(new Set([suggestion.id]));
                            generateWhatsAppMessage();
                          }}
                          className="p-2 hover:bg-green-100 dark:hover:bg-green-900/20 rounded text-green-600"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* WhatsApp Modal */}
      {showWhatsApp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${cardClass} border rounded-2xl max-w-2xl w-full p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${textClass}`}>WhatsApp Sipariş Mesajı</h3>
              <button onClick={() => setShowWhatsApp(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <textarea
              value={whatsappMessage}
              onChange={(e) => setWhatsappMessage(e.target.value)}
              className={`w-full h-64 px-4 py-3 rounded-lg border ${inputClass} font-mono text-sm`}
            />

            <div className="mt-4 flex items-center gap-3">
              <select className={`flex-1 px-4 py-2 rounded-lg border ${inputClass}`}>
                {suggestions
                  .filter(s => selectedItems.has(s.id))
                  .map(s => (
                    <option key={s.id} value={s.supplier_phone}>
                      {s.supplier_name} - {s.supplier_phone}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => {
                  const supplier = suggestions.find(s => selectedItems.has(s.id));
                  if (supplier) sendViaWhatsApp(supplier.supplier_phone);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                <Send className="w-5 h-5" />
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

