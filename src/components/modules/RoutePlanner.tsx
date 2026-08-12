/**
 * Route Planning & Optimization
 * Pattern: Strategy Pattern
 * Features: Customer selection, route optimization, schedule management
 */

import { useState } from 'react';
import { Navigation, MapPin, Calendar, User, TrendingUp, Check } from 'lucide-react';
import { toast } from 'sonner';
import { fieldSalesService, type RouteOptimizationRequest } from '../../services/fieldSalesService';

interface Customer {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  priority: number;
  visit_type: 'SALES' | 'COLLECTION' | 'SURVEY' | 'COMPLAINT' | 'DEMO' | 'FOLLOW_UP';
}

export function RoutePlanner() {
  const [selectedSalesperson, setSelectedSalesperson] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);

  // Mock customers
  const mockCustomers: Customer[] = [
    { id: 'c1', name: 'ABC Market', address: 'Kadıköy', latitude: 40.99, longitude: 29.03, priority: 1, visit_type: 'SALES' },
    { id: 'c2', name: 'XYZ Gıda', address: 'Üsküdar', latitude: 41.02, longitude: 29.01, priority: 2, visit_type: 'COLLECTION' },
    { id: 'c3', name: 'DEF AVM', address: 'Beşiktaş', latitude: 41.04, longitude: 29.00, priority: 1, visit_type: 'SALES' },
    { id: 'c4', name: 'GHI Süpermarket', address: 'Şişli', latitude: 41.06, longitude: 28.98, priority: 3, visit_type: 'SURVEY' }
  ];

  const salespeople = fieldSalesService.getSalespeople();

  const toggleCustomer = (customer: Customer) => {
    const exists = selectedCustomers.find(c => c.id === customer.id);

    if (exists) {
      setSelectedCustomers(selectedCustomers.filter(c => c.id !== customer.id));
    } else {
      setSelectedCustomers([...selectedCustomers, customer]);
    }
  };

  const optimizeRoute = () => {
    if (!selectedSalesperson || selectedCustomers.length === 0) {
      toast.error('Personel ve müşteri seçin');
      return;
    }

    const request: RouteOptimizationRequest = {
      salesperson_id: selectedSalesperson,
      date: selectedDate,
      customers: selectedCustomers.map(c => ({
        id: c.id,
        name: c.name,
        location: { latitude: c.latitude, longitude: c.longitude, accuracy: 10, timestamp: new Date().toISOString() },
        priority: c.priority,
        visit_type: c.visit_type
      })),
      start_location: { latitude: 41.01, longitude: 28.97, accuracy: 10, timestamp: new Date().toISOString() },
      max_visits_per_day: 10
    };

    const route = fieldSalesService.optimizeRoute(request);
    setOptimizedRoute(route);
    toast.success('Rota optimize edildi!');
  };

  const saveRoute = () => {
    if (!optimizedRoute) return;

    toast.success('Rota kaydedildi ve personele atandı');
    setOptimizedRoute(null);
    setSelectedCustomers([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl mb-2">Rota Planlama</h1>
          <p className="text-gray-600 text-sm">Satış rotalarını planlayın ve optimize edin</p>
        </div>

        {!optimizedRoute ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg mb-4">Rota Bilgileri</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Personel</label>
                  <select
                    value={selectedSalesperson}
                    onChange={(e) => setSelectedSalesperson(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Seçin...</option>
                    {salespeople.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2">Tarih</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Seçili Müşteri</span>
                    <span className="text-lg text-blue-600">{selectedCustomers.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tahmini Süre</span>
                    <span className="text-lg text-blue-600">{selectedCustomers.length * 30} dk</span>
                  </div>
                </div>

                <button
                  onClick={optimizeRoute}
                  disabled={selectedCustomers.length === 0}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-5 h-5" />
                  Rotayı Optimize Et
                </button>
              </div>
            </div>

            {/* Customer List */}
            <div className="col-span-2 bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h2 className="text-lg">Müşteri Listesi</h2>
              </div>
              <div className="divide-y max-h-[600px] overflow-auto">
                {mockCustomers.map(customer => (
                  <div
                    key={customer.id}
                    onClick={() => toggleCustomer(customer)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedCustomers.find(c => c.id === customer.id) ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                        selectedCustomers.find(c => c.id === customer.id) 
                          ? 'bg-blue-600 border-blue-600' 
                          : 'border-gray-300'
                      }`}>
                        {selectedCustomers.find(c => c.id === customer.id) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{customer.name}</h3>
                          <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                            Öncelik: {customer.priority}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {customer.address}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{customer.visit_type}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg mb-1">Optimize Edilmiş Rota</h2>
                <p className="text-sm text-gray-600">
                  {optimizedRoute.planned_visits.length} ziyaret • 
                  Tahmini mesafe: {(optimizedRoute.planned_distance / 1000).toFixed(1)} km
                </p>
              </div>
              <button
                onClick={saveRoute}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Check className="w-5 h-5" />
                Rotayı Kaydet
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {optimizedRoute.planned_visits.map((visit: any, index: number) => (
                  <div key={visit.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{visit.customer_name}</h3>
                      <div className="text-sm text-gray-600 flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {visit.customer_address || 'Adres bilgisi yok'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {visit.estimated_duration} dk
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      {visit.visit_type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

