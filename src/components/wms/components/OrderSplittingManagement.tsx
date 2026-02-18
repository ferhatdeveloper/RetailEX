// ğŸ“¦ Order Splitting Management - Sipariş Bölme Sistemi
// Category-based splitting + Multi-picker assignment

import { useState, useEffect } from 'react';
import {
  Package, Users, Target, Layers, TrendingUp, CheckCircle,
  XCircle, Clock, User, Zap, AlertTriangle, ChevronRight,
  Split, UserPlus, Save, X, Eye, BarChart3
} from 'lucide-react';
import { smartSplitOrder, PickingItem } from '../utils/pickingLogic';

interface OrderSplittingManagementProps {
  darkMode: boolean;
  onBack: () => void;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  store_location: string;
  total_items: number;
  total_volume_m3: number;
  order_type: 'regular' | 'opening_store';
  priority: number;
  status: string;
}

// Using alias for compatibility while migrating
type OrderItem = PickingItem;

interface SplitPart {
  id: string;
  split_index: number;
  category: string; // generalized
  assigned_picker?: string;
  items: OrderItem[];
  total_items: number;
  total_volume: number;
  estimated_time_minutes: number;
  status: 'pending' | 'assigned' | 'picking' | 'completed';
  reason?: string;
}

interface Picker {
  id: string;
  name: string;
  current_tasks: number;
  today_picked: number;
  accuracy_rate: number;
  avg_pick_time: number;
  status: 'available' | 'busy';
}

const CATEGORIES = [
  { id: 'dry', label: 'Kuru Gıda', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'valuable', label: 'Değerli Ürünler', icon: Target, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: 'frozen', label: 'Soğuk/Donuk', icon: Layers, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
  { id: 'chemical', label: 'Kimyasal', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
];

export function OrderSplittingManagement({ darkMode, onBack }: OrderSplittingManagementProps) {
  const [view, setView] = useState<'list' | 'split' | 'assign'>('list');
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [splitParts, setSplitParts] = useState<SplitPart[]>([]);
  const [pickers, setPickers] = useState<Picker[]>([]);
  const [splitMode, setSplitMode] = useState<'category' | 'picker'>('category');

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadOrders();
    loadPickers();
  }, []);

  const loadOrders = async () => {
    // Mock data
    const mockOrders: Order[] = [
      {
        id: '1',
        order_number: 'ORD-2024-OPEN-001',
        customer_name: 'Yeni Açılış Mağaza - Kerkük',
        store_location: 'Kirkuk Central',
        total_items: 850,
        total_volume_m3: 45.5,
        order_type: 'opening_store',
        priority: 1,
        status: 'pending'
      },
      {
        id: '2',
        order_number: 'ORD-2024-002',
        customer_name: 'Süpermarket - Basra',
        store_location: 'Basra North',
        total_items: 320,
        total_volume_m3: 18.2,
        order_type: 'regular',
        priority: 2,
        status: 'pending'
      },
    ];
    setOrders(mockOrders);
  };

  const loadPickers = async () => {
    // Mock data
    const mockPickers: Picker[] = [
      {
        id: '1',
        name: 'Ahmet Yılmaz',
        current_tasks: 0,
        today_picked: 145,
        accuracy_rate: 98.5,
        avg_pick_time: 45,
        status: 'available'
      },
      {
        id: '2',
        name: 'Mehmet Demir',
        current_tasks: 1,
        today_picked: 138,
        accuracy_rate: 96.2,
        avg_pick_time: 42,
        status: 'busy'
      },
      {
        id: '3',
        name: 'Ali Kaya',
        current_tasks: 0,
        today_picked: 125,
        accuracy_rate: 97.8,
        avg_pick_time: 48,
        status: 'available'
      },
    ];
    setPickers(mockPickers);
  };

  const splitByCategory = () => {
    // Mock items with full PickingItem interface properties
    const mockItems: PickingItem[] = [
      { id: '1', product_id: 'P1', product_name: 'Un 1kg', quantity: 150, location_zone: 'dry', volume_m3: 8.5, weight_kg: 0.15 },
      { id: '2', product_id: 'P2', product_name: 'Zeytinyağı 1L', quantity: 80, location_zone: 'valuable' as any, volume_m3: 3.2, weight_kg: 0.8 },
      { id: '3', product_id: 'P3', product_name: 'Makarna 500g', quantity: 200, location_zone: 'dry', volume_m3: 6.8, weight_kg: 0.2 },
      { id: '4', product_id: 'P4', product_name: 'Dondurulmuş Tavuk', quantity: 120, location_zone: 'frozen', volume_m3: 5.5, weight_kg: 1.2 },
      { id: '5', product_id: 'P5', product_name: 'Çamaşır Suyu', quantity: 40, location_zone: 'chemical', volume_m3: 2.0, weight_kg: 1.5 },
    ];
    setOrderItems(mockItems);

    // Use Smart Splitting Logic
    const smartTasks = smartSplitOrder(mockItems);

    // Map to local State format
    const parts = smartTasks.map((task, index) => ({
      id: task.id,
      split_index: index + 1,
      category: task.zone,
      items: task.items,
      total_items: task.items.reduce((acc, i) => acc + i.quantity, 0),
      total_volume: task.total_volume,
      estimated_time_minutes: task.estimated_time_mins,
      status: 'pending' as const,
      reason: task.reason
    }));

    setSplitParts(parts);
  };

  const splitByPicker = (pickerCount: number) => {
    // Mock items
    const mockItems: PickingItem[] = [
      { id: '1', product_id: 'P1', product_name: 'Un 1kg', quantity: 150, location_zone: 'dry', volume_m3: 8.5, weight_kg: 0.15 },
      { id: '2', product_id: 'P2', product_name: 'Zeytinyağı 1L', quantity: 80, location_zone: 'valuable' as any, volume_m3: 3.2, weight_kg: 0.8 },
      { id: '3', product_id: 'P3', product_name: 'Makarna 500g', quantity: 200, location_zone: 'dry', volume_m3: 6.8, weight_kg: 0.2 },
      { id: '4', product_id: 'P4', product_name: 'Dondurulmuş Tavuk', quantity: 120, location_zone: 'frozen', volume_m3: 5.5, weight_kg: 1.2 },
      { id: '5', product_id: 'P5', product_name: 'Şeker 1kg', quantity: 100, location_zone: 'dry', volume_m3: 4.2, weight_kg: 0.5 },
    ];
    setOrderItems(mockItems);

    const itemsPerPicker = Math.ceil(mockItems.length / pickerCount);
    const parts: SplitPart[] = [];

    for (let i = 0; i < pickerCount; i++) {
      const partItems = mockItems.slice(i * itemsPerPicker, (i + 1) * itemsPerPicker);
      if (partItems.length > 0) {
        parts.push({
          id: `part-${i}`,
          split_index: i + 1,
          category: 'mixed',
          items: partItems,
          total_items: partItems.reduce((sum, item) => sum + item.quantity, 0),
          total_volume: partItems.reduce((sum, item) => sum + item.volume_m3, 0),
          estimated_time_minutes: Math.ceil(partItems.reduce((sum, item) => sum + item.quantity, 0) * 0.5),
          status: 'pending',
          reason: 'Manual Split by Picker Count'
        });
      }
    }

    setSplitParts(parts);
  };

  const assignPickerToPart = (partId: string, pickerId: string) => {
    setSplitParts(splitParts.map(part =>
      part.id === partId
        ? { ...part, assigned_picker: pickerId, status: 'assigned' }
        : part
    ));
  };

  const getCategoryConfig = (category: string) => {
    // Fallback mapping for internal zones to UI categories if needed
    if (category === 'cold') return CATEGORIES.find(c => c.id === 'frozen') || CATEGORIES[0];
    return CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
  };

  // SPLIT VIEW
  if (view === 'split' && selectedOrder) {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => {
            setView('list');
            setSelectedOrder(null);
            setSplitParts([]);
          }} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
            ← Geri
          </button>
          <div>
            <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Sipariş Bölme - {selectedOrder.order_number}</h1>
            <p className="text-gray-500">
              {selectedOrder.customer_name} • {selectedOrder.total_items} ürün • {selectedOrder.total_volume_m3.toFixed(1)} m³
            </p>
          </div>
        </div>

        {/* Split Mode Selection */}
        {splitParts.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <button
              onClick={() => {
                setSplitMode('category');
                splitByCategory();
              }}
              className={`${cardClass} border-2 rounded-xl p-6 hover:border-blue-500 transition-all`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                  <Layers className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className={`text-xl font-bold ${textClass} mb-2`}>Kategoriye Göre Böl</h3>
                  <p className="text-sm text-gray-500">
                    Kuru, değerli ve soğuk ürünleri ayrı bölümlere ayır
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <span key={cat.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${cat.bg} ${cat.color}`}>
                          <Icon className="w-3 h-3" />
                          {cat.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setSplitMode('picker');
                const pickerCount = window.prompt('Kaç toplayıcıya bölünecek?', '3');
                if (pickerCount) {
                  splitByPicker(parseInt(pickerCount));
                }
              }}
              className={`${cardClass} border-2 rounded-xl p-6 hover:border-purple-500 transition-all`}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className={`text-xl font-bold ${textClass} mb-2`}>Toplayıcılara Göre Böl</h3>
                  <p className="text-sm text-gray-500">
                    Siparişi eşit olarak birden fazla toplayıcıya dağıt
                  </p>
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    ✓ Açılış mağaza siparişleri için ideal<br />
                    ✓ Hızlı toplama süresi
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Split Parts */}
        {splitParts.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {splitParts.map((part) => {
                const categoryConfig = part.category !== 'mixed' ? getCategoryConfig(part.category) : null;
                const CategoryIcon = categoryConfig?.icon || Package;

                return (
                  <div key={part.id} className={`${cardClass} border rounded-xl overflow-hidden`}>
                    <div className={`p-4 ${categoryConfig ? categoryConfig.bg : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CategoryIcon className={`w-5 h-5 ${categoryConfig?.color || 'text-gray-600'}`} />
                          <div>
                            <div className={`font-bold ${textClass}`}>
                              Bölüm {part.split_index}
                            </div>
                            <div className="text-xs text-gray-500">
                              {categoryConfig ? categoryConfig.label : 'Karışık'}
                            </div>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${part.status === 'assigned' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                          }`}>
                          {part.status === 'assigned' ? 'Atandı' : 'Bekliyor'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Ürün Sayısı:</span>
                        <span className={`font-bold ${textClass}`}>{part.total_items}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Hacim:</span>
                        <span className={`font-bold ${textClass}`}>{part.total_volume.toFixed(1)} m³</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Tahmini Süre:</span>
                        <span className={`font-bold ${textClass}`}>{part.estimated_time_minutes} dk</span>
                      </div>

                      {part.assigned_picker ? (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-xs text-gray-500 mb-1">Atanan Toplayıcı:</div>
                          <div className={`font-medium ${textClass}`}>
                            {pickers.find(p => p.id === part.assigned_picker)?.name || 'Bilinmeyen'}
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            // Show picker assignment modal
                            const picker = pickers.find(p => p.status === 'available');
                            if (picker) {
                              assignPickerToPart(part.id, picker.id);
                            } else {
                              alert('Müsait toplayıcı yok');
                            }
                          }}
                          className="w-full mt-2 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold"
                        >
                          Toplayıcı Ata
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary & Action */}
            <div className={`${cardClass} border rounded-xl p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-lg font-bold ${textClass} mb-2`}>Bölme Özeti</h3>
                  <div className="text-sm text-gray-500">
                    Toplam {splitParts.length} bölüm oluşturuldu • {
                      splitParts.filter(p => p.assigned_picker).length
                    } bölüm atandı
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSplitParts([])}
                    className={`px-4 py-2 rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'}`}
                  >
                    Yeniden Böl
                  </button>
                  <button
                    onClick={() => {
                      alert('Sipariş bölme kaydedildi!');
                      setView('list');
                    }}
                    disabled={!splitParts.every(p => p.assigned_picker)}
                    className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-5 h-5" />
                    Kaydet ve Başlat
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
          ← Geri
        </button>
        <div>
          <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Sipariş Bölme Sistemi</h1>
          <p className="text-gray-500">Büyük siparişleri kategoriye veya toplayıcılara göre bölün</p>
        </div>
      </div>

      {/* Orders List */}
      <div className="grid gap-4">
        {orders.map((order) => {
          const isLargeOrder = order.total_items > 500;

          return (
            <div key={order.id} className={`${cardClass} border rounded-xl p-6 hover:shadow-lg transition-shadow`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`font-mono font-bold ${textClass}`}>{order.order_number}</div>
                    {order.order_type === 'opening_store' && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        Açılış Mağaza
                      </span>
                    )}
                    {isLargeOrder && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        Büyük Sipariş
                      </span>
                    )}
                  </div>

                  <div className={`text-lg font-bold ${textClass} mb-1`}>{order.customer_name}</div>
                  <div className="text-sm text-gray-500 mb-3">{order.store_location}</div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className={textClass}>{order.total_items} ürün</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-gray-400" />
                      <span className={textClass}>{order.total_volume_m3.toFixed(1)} m³</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className={textClass}>~{Math.ceil(order.total_items * 0.5)} dk</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedOrder(order);
                    setView('split');
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
                >
                  <Split className="w-5 h-5" />
                  Bölmeyi Başlat
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

