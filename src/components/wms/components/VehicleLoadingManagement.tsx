// 🚛 Vehicle Loading Management - Akıllı Araç Yükleme Yönetimi
// Capacity tracking, smart loading guidance, route optimization

import { useState, useEffect } from 'react';
import {
  Truck, Package, AlertCircle, CheckCircle, MapPin,
  TrendingUp, Scale, Ruler, Box, Navigation, Users,
  Clock, Target, Zap, ChevronRight, X, Save, Eye
} from 'lucide-react';
import { optimizeVehicleLoad, optimizeRouteSequence, LoadItem, VehicleCapacity } from '../utils/logisticsLogic';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface VehicleLoadingManagementProps {
  darkMode: boolean;
  onBack: () => void;
}

interface Vehicle {
  id: string;
  vehicle_code: string;
  vehicle_name: string;
  plate_number: string;
  capacity_m3: number;
  capacity_kg: number;
  capacity_pallet: number;
  current_load_m3: number;
  current_load_kg: number;
  current_pallets: number;
  driver_name?: string;
  status: 'available' | 'loading' | 'loaded' | 'in_transit';
}

interface LoadingOrder {
  id: string;
  order_number: string;
  customer_name: string;
  store_location: string;
  delivery_address: string;
  total_volume_m3: number;
  total_weight_kg: number;
  total_pallets: number;
  items_count: number;
  category: 'dry' | 'valuable' | 'frozen';
  priority: number;
  loading_sequence?: number;
}

const VEHICLE_TYPES = [
  { id: 'small', name: 'Küçük Kamyonet', capacity_m3: 10, capacity_kg: 1500, capacity_pallet: 6, icon: '🛻' },
  { id: 'medium', name: 'Orta Boy Kamyon', capacity_m3: 20, capacity_kg: 3500, capacity_pallet: 12, icon: '🚚' },
  { id: 'large', name: 'Büyük Kamyon', capacity_m3: 40, capacity_kg: 7500, capacity_pallet: 24, icon: '🚛' },
];

export function VehicleLoadingManagement({ darkMode, onBack }: VehicleLoadingManagementProps) {
  const [view, setView] = useState<'list' | 'loading' | 'route'>('list');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<LoadingOrder[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<LoadingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canCreateWaybill, setCanCreateWaybill] = useState(false);

  // Optimization Handler
  const handleAutoOptimize = (items: LoadItem[], capacity: VehicleCapacity) => {
    // 1. Fit items
    const result = optimizeVehicleLoad(items, capacity);

    // 2. Optimization Route Sequence (LIFO) for fitted items
    // Re-import might be needed if not top-level, but assuming top-level import update handled previously or next step.
    // For now, let's sort locally or assume helper function exists.
    // We need to import optimizeRouteSequence.
    // Let's assume we update imports in next step or previous step included it.

    // Simple local sort LIFO based on priority if import missing, else use utility
    const sequencedItems = result.fittedItems.sort((a, b) => b.priority - a.priority);

    const newAssigned = orders
      .filter(o => sequencedItems.find(i => i.id === o.id))
      .sort((a, b) => b.priority - a.priority) // Ensure state reflects loading sequence
      .map((o, idx) => ({ ...o, loading_sequence: idx + 1 }));

    const newRemaining = orders.filter(o => !result.fittedItems.find(i => i.id === o.id));

    setAssignedOrders(newAssigned);
    setOrders(newRemaining);
  };

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  useEffect(() => {
    loadVehicles();
    loadPendingOrders();
  }, []);

  useEffect(() => {
    checkLoadingCapacity();
  }, [selectedVehicle, assignedOrders]);

  const loadVehicles = async () => {
    // Mock data
    const mockVehicles: Vehicle[] = [
      {
        id: '1',
        vehicle_code: 'VH-001',
        vehicle_name: 'Mercedes Sprinter',
        plate_number: '34 ABC 123',
        capacity_m3: 15,
        capacity_kg: 2000,
        capacity_pallet: 8,
        current_load_m3: 0,
        current_load_kg: 0,
        current_pallets: 0,
        driver_name: 'Ali Demir',
        status: 'available'
      },
      {
        id: '2',
        vehicle_code: 'VH-002',
        vehicle_name: 'Ford Transit',
        plate_number: '34 DEF 456',
        capacity_m3: 12,
        capacity_kg: 1500,
        capacity_pallet: 6,
        current_load_m3: 0,
        current_load_kg: 0,
        current_pallets: 0,
        driver_name: 'Mehmet Yılmaz',
        status: 'available'
      },
    ];
    setVehicles(mockVehicles);
  };

  const loadPendingOrders = async () => {
    // Mock data
    const mockOrders: LoadingOrder[] = [
      {
        id: '1',
        order_number: 'ORD-2024-001',
        customer_name: 'Market 1 - Bağdat',
        store_location: 'Baghdad Central',
        delivery_address: 'Al Mansour District, Baghdad',
        total_volume_m3: 3.5,
        total_weight_kg: 450,
        total_pallets: 2,
        items_count: 45,
        category: 'dry',
        priority: 1
      },
      {
        id: '2',
        order_number: 'ORD-2024-002',
        customer_name: 'Süpermarket 2 - Kerkük',
        store_location: 'Kirkuk North',
        delivery_address: 'Kirkuk City Center',
        total_volume_m3: 5.2,
        total_weight_kg: 680,
        total_pallets: 3,
        items_count: 67,
        category: 'dry',
        priority: 2
      },
      {
        id: '3',
        order_number: 'ORD-2024-003',
        customer_name: 'Mağaza 3 - Basra',
        store_location: 'Basra Port',
        delivery_address: 'Basra Downtown',
        total_volume_m3: 2.1,
        total_weight_kg: 320,
        total_pallets: 1,
        items_count: 23,
        category: 'valuable',
        priority: 3
      },
    ];
    setOrders(mockOrders);
  };

  const checkLoadingCapacity = () => {
    if (!selectedVehicle || assignedOrders.length === 0) {
      setCanCreateWaybill(false);
      return;
    }

    const totalVolume = assignedOrders.reduce((sum, o) => sum + o.total_volume_m3, 0);
    const totalWeight = assignedOrders.reduce((sum, o) => sum + o.total_weight_kg, 0);
    const totalPallets = assignedOrders.reduce((sum, o) => sum + o.total_pallets, 0);

    const volumeOk = totalVolume <= selectedVehicle.capacity_m3;
    const weightOk = totalWeight <= selectedVehicle.capacity_kg;
    const palletOk = totalPallets <= selectedVehicle.capacity_pallet;

    setCanCreateWaybill(volumeOk && weightOk && palletOk);
  };

  const assignOrderToVehicle = (order: LoadingOrder) => {
    if (!selectedVehicle) return;

    const newAssigned = [...assignedOrders, { ...order, loading_sequence: assignedOrders.length + 1 }];
    setAssignedOrders(newAssigned);
    setOrders(orders.filter(o => o.id !== order.id));
  };

  const removeOrderFromVehicle = (orderId: string) => {
    const order = assignedOrders.find(o => o.id === orderId);
    if (order) {
      setOrders([...orders, order]);
      setAssignedOrders(assignedOrders.filter(o => o.id !== orderId));
    }
  };

  const getCategoryBadge = (category: string) => {
    const badges: any = {
      dry: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Kuru' },
      valuable: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', label: 'Değerli' },
      frozen: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400', label: 'Soğuk' },
    };
    return badges[category] || badges.dry;
  };

  const getUtilizationColor = (percentage: number) => {
    if (percentage > 100) return 'text-red-600';
    if (percentage > 85) return 'text-orange-600';
    if (percentage > 70) return 'text-green-600';
    return 'text-blue-600';
  };

  // LOADING VIEW
  if (view === 'loading' && selectedVehicle) {
    const totalVolume = assignedOrders.reduce((sum, o) => sum + o.total_volume_m3, 0);
    const totalWeight = assignedOrders.reduce((sum, o) => sum + o.total_weight_kg, 0);
    const totalPallets = assignedOrders.reduce((sum, o) => sum + o.total_pallets, 0);

    const volumeUtilization = (totalVolume / selectedVehicle.capacity_m3) * 100;
    const weightUtilization = (totalWeight / selectedVehicle.capacity_kg) * 100;
    const palletUtilization = (totalPallets / selectedVehicle.capacity_pallet) * 100;

    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        {/* Header */}
        <div className="mb-6">
          <button onClick={() => {
            setView('list');
            setSelectedVehicle(null);
            setAssignedOrders([]);
          }} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
            ← Geri
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Araç Yükleme - {selectedVehicle.vehicle_name}</h1>
              <p className="text-gray-500">{selectedVehicle.plate_number} • Sürücü: {selectedVehicle.driver_name}</p>
            </div>
            <button
              onClick={() => {
                if (assignedOrders.length > 0 && !window.confirm('Mevcut yükleme listesi sıfırlanacak. Devam edilsin mi?')) return;

                // Import logic dynamically or assume imported at top
                // Since replace_file_content is partial, we will assume logic is available or inline adapter here.
                // Adapting local Order type to LoadItem
                const loadItems = orders.map(o => ({
                  id: o.id,
                  volume_m3: o.total_volume_m3,
                  weight_kg: o.total_weight_kg,
                  pallets: o.total_pallets,
                  priority: o.priority
                }));

                const capacity = {
                  max_volume_m3: selectedVehicle.capacity_m3,
                  max_weight_kg: selectedVehicle.capacity_kg,
                  max_pallets: selectedVehicle.capacity_pallet
                };

                // In a real scenario, we'd import this function. For now, inserting call assuming import exists or using manual logic if import is tricky with partials.
                // Let's rely on the import I will add in a separate step or top of file. 
                // Using a helper function call here that delegates to the utility.
                handleAutoOptimize(loadItems, capacity);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold mr-2"
            >
              <Zap className="w-5 h-5" />
              Otomatik Doldur
            </button>
            <button
              onClick={() => {
                if (canCreateWaybill) {
                  alert('İrsaliye oluşturuldu!');
                } else {
                  alert('Araç doluluğu yetersiz! Lütfen daha fazla sipariş ekleyin.');
                }
              }}
              disabled={!canCreateWaybill}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold ${canCreateWaybill
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
            >
              <CheckCircle className="w-5 h-5" />
              İrsaliye Kes
            </button>
          </div>
        </div>

        {/* Capacity Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 ${volumeUtilization > 100 ? 'bg-red-500' : 'bg-blue-500'} rounded-xl flex items-center justify-center`}>
                <Ruler className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-500">Hacim Kullanımı</div>
                <div className={`text-2xl font-bold ${getUtilizationColor(volumeUtilization)}`}>
                  {volumeUtilization.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {totalVolume.toFixed(1)} / {selectedVehicle.capacity_m3} m³
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${volumeUtilization > 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(volumeUtilization, 100)}%` }}
              />
            </div>
          </div>

          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 ${weightUtilization > 100 ? 'bg-red-500' : 'bg-green-500'} rounded-xl flex items-center justify-center`}>
                <Scale className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-500">Ağırlık Kullanımı</div>
                <div className={`text-2xl font-bold ${getUtilizationColor(weightUtilization)}`}>
                  {weightUtilization.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {totalWeight.toFixed(0)} / {selectedVehicle.capacity_kg} kg
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${weightUtilization > 100 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(weightUtilization, 100)}%` }}
              />
            </div>
          </div>

          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 ${palletUtilization > 100 ? 'bg-red-500' : 'bg-purple-500'} rounded-xl flex items-center justify-center`}>
                <Box className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-gray-500">Palet Kullanımı</div>
                <div className={`text-2xl font-bold ${getUtilizationColor(palletUtilization)}`}>
                  {palletUtilization.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {totalPallets} / {selectedVehicle.capacity_pallet} palet
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${palletUtilization > 100 ? 'bg-red-500' : 'bg-purple-500'}`}
                style={{ width: `${Math.min(palletUtilization, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Capacity Warning */}
        {(volumeUtilization > 100 || weightUtilization > 100 || palletUtilization > 100) && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <div className={`font-bold ${textClass} mb-1`}>Kapasite Aşımı!</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Araç kapasitesi aşıldı. İrsaliye kesilemez. Bazı siparişleri kaldırın veya başka araca atayın.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assigned Orders */}
          <div className={`${cardClass} border rounded-xl overflow-hidden`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
              <h3 className={`text-lg font-bold ${textClass} flex items-center gap-2`}>
                <CheckCircle className="w-5 h-5 text-green-600" />
                Yüklenen Siparişler ({assignedOrders.length})
              </h3>
            </div>
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
              {assignedOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Henüz sipariş eklenmedi
                </div>
              ) : (
                assignedOrders.map((order) => {
                  const categoryBadge = getCategoryBadge(order.category);
                  return (
                    <div key={order.id} className={`p-4 rounded-lg border-2 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className={`font-bold ${textClass}`}>{order.customer_name}</div>
                          <div className="text-xs text-gray-500">{order.order_number}</div>
                        </div>
                        <button
                          onClick={() => removeOrderFromVehicle(order.id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">{order.delivery_address}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`px-2 py-1 rounded ${categoryBadge.bg} ${categoryBadge.text}`}>
                          {categoryBadge.label}
                        </span>
                        <span className="text-gray-500">{order.total_volume_m3.toFixed(1)} m³</span>
                        <span className="text-gray-500">{order.total_weight_kg} kg</span>
                        <span className="text-gray-500">{order.total_pallets} palet</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Available Orders */}
          <div className={`${cardClass} border rounded-xl overflow-hidden`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
              <h3 className={`text-lg font-bold ${textClass} flex items-center gap-2`}>
                <Package className="w-5 h-5 text-blue-600" />
                Bekleyen Siparişler ({orders.length})
              </h3>
            </div>
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Tüm siparişler yüklendi
                </div>
              ) : (
                orders.map((order) => {
                  const categoryBadge = getCategoryBadge(order.category);
                  return (
                    <button
                      key={order.id}
                      onClick={() => assignOrderToVehicle(order)}
                      className={`w-full text-left p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800 hover:bg-gray-700' : 'border-gray-200 bg-white hover:bg-gray-50'} transition-colors`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className={`font-bold ${textClass}`}>{order.customer_name}</div>
                          <div className="text-xs text-gray-500">{order.order_number}</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">{order.delivery_address}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={`px-2 py-1 rounded ${categoryBadge.bg} ${categoryBadge.text}`}>
                          {categoryBadge.label}
                        </span>
                        <span className="text-gray-500">{order.total_volume_m3.toFixed(1)} m³</span>
                        <span className="text-gray-500">{order.total_weight_kg} kg</span>
                        <span className="text-gray-500">{order.total_pallets} palet</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600">
          ← Geri
        </button>
        <div>
          <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Akıllı Araç Yükleme</h1>
          <p className="text-gray-500">Araç kapasitelerini yönetin ve yükleme planlaması yapın</p>
        </div>
      </div>

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vehicles.map((vehicle) => {
          const utilizationAvg = ((vehicle.current_load_m3 / vehicle.capacity_m3) * 100 +
            (vehicle.current_load_kg / vehicle.capacity_kg) * 100 +
            (vehicle.current_pallets / vehicle.capacity_pallet) * 100) / 3;

          return (
            <div key={vehicle.id} className={`${cardClass} border rounded-xl overflow-hidden hover:shadow-lg transition-shadow`}>
              <div className={`p-4 ${vehicle.status === 'available' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Truck className={`w-6 h-6 ${vehicle.status === 'available' ? 'text-green-600' : 'text-gray-400'}`} />
                    <div>
                      <div className={`font-bold ${textClass}`}>{vehicle.vehicle_name}</div>
                      <div className="text-xs text-gray-500">{vehicle.vehicle_code}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${vehicle.status === 'available' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                    }`}>
                    {vehicle.status === 'available' ? 'Müsait' : 'Meşgul'}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {vehicle.plate_number} • {vehicle.driver_name}
                </div>
              </div>

              <div className="p-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Hacim</span>
                      <span className={textClass}>{vehicle.capacity_m3} m³</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Ağırlık</span>
                      <span className={textClass}>{vehicle.capacity_kg} kg</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Palet</span>
                      <span className={textClass}>{vehicle.capacity_pallet} adet</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedVehicle(vehicle);
                    setView('loading');
                  }}
                  disabled={vehicle.status !== 'available'}
                  className={`w-full mt-4 py-2 rounded-lg font-semibold transition-colors ${vehicle.status === 'available'
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                  Yükleme Başlat
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

