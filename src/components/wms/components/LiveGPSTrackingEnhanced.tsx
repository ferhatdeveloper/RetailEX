// ğŸ—ºï¸ğŸš›ğŸ“¹ ENTERPRISE GPS TRACKING - Full Featured Fleet Management
// Features: Real map, historical data, live camera, route optimization, vehicle consolidation

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapPin, Navigation, Truck, Activity, RefreshCw,
  X, Video, Camera, TrendingUp, BarChart3,
  Minimize, LayoutGrid, ChevronLeft, Filter, Play, Pause
} from 'lucide-react';


interface LiveGPSTrackingEnhancedProps {
  darkMode: boolean;
  onBack: () => void;
}

interface HistoricalPoint {
  timestamp: string;
  lat: number;
  lng: number;
  speed: number;
  address: string;
}

interface VehicleConsolidationSuggestion {
  id: string;
  vehicle1: string;
  vehicle2: string;
  vehicle1_plate: string;
  vehicle2_plate: string;
  vehicle1_fill: number;
  vehicle2_fill: number;
  combined_fill: number;
  potential_savings_km: number;
  potential_savings_iqd: number;
  same_destination: boolean;
  distance_between_km: number;
  recommendation: string;
}

interface Personnel {
  id: string;
  name: string;
  employee_code: string;
  role: 'driver' | 'delivery' | 'cashier' | 'supervisor';
  vehicle_id?: string;
  vehicle_plate?: string;
  vehicle_type?: string;
  vehicle_capacity_m3?: number;
  vehicle_capacity_kg?: number;
  status: 'active' | 'idle' | 'offline';
  color: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    last_update: string;
    speed: number;
    battery: number;
    gps_accuracy: number;
    heading: number;
  };
  trip?: {
    start_time: string;
    distance_km: number;
    stops: number;
    destination: string;
    cargo_volume_m3: number;
    cargo_weight_kg: number;
    capacity_m3: number;
    capacity_kg: number;
    fill_percentage: number;
  };
  camera_available: boolean;
  camera_streaming: boolean;
  historical_data: HistoricalPoint[];
  stats: {
    total_distance_today: number;
    avg_speed_today: number;
    max_speed_today: number;
    stops_count: number;
    driving_time_minutes: number;
  };
}

const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#FF9933', '#33FFF5', '#F533FF', '#5733FF'];

export function LiveGPSTrackingEnhanced({ darkMode, onBack }: LiveGPSTrackingEnhancedProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showConsolidation, setShowConsolidation] = useState(false);
  const [consolidationSuggestions, setConsolidationSuggestions] = useState<VehicleConsolidationSuggestion[]>([]);

  const bgClass = darkMode
    ? 'bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f1023] to-slate-950'
    : 'bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-white';

  const cardClass = darkMode
    ? 'bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-2xl shadow-black/20'
    : 'bg-white/70 backdrop-blur-xl border-slate-200/60 shadow-xl shadow-slate-200/50';

  const textClass = darkMode ? 'text-slate-100' : 'text-slate-800';
  const subTextClass = darkMode ? 'text-slate-400' : 'text-slate-500';

  const mapCenter: [number, number] = [33.3152, 44.3661]; // Baghdad Center

  const createCustomIcon = (color: string, heading: number) => {
    return L.divIcon({
      className: 'custom-icon',
      html: `
        <div style="
          background-color: ${color};
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(${heading}deg);
          transition: all 0.3s ease;
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 22h20L12 2z" fill="white" />
          </svg>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
  };

  useEffect(() => {
    loadPersonnel();
    const interval = setInterval(() => {
      if (autoRefresh) loadPersonnel();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadPersonnel = async () => {
    const mockPersonnel: Personnel[] = [
      {
        id: '1',
        name: 'Mehmet YILMAZ',
        employee_code: 'DRV-001',
        role: 'driver',
        vehicle_id: 'VEH-101',
        vehicle_plate: '34 ABC 123',
        vehicle_type: 'Kamyon',
        vehicle_capacity_m3: 20,
        vehicle_capacity_kg: 5000,
        status: 'active',
        color: COLORS[0],
        location: {
          lat: 33.3152,
          lng: 44.3661,
          address: 'Karrada, Baghdad, Iraq',
          last_update: new Date(Date.now() - 30000).toISOString(),
          speed: 65,
          battery: 85,
          gps_accuracy: 8,
          heading: 135
        },
        trip: {
          start_time: '09:30',
          distance_km: 45.8,
          stops: 5,
          destination: 'Al Mansour Distribution Center',
          cargo_volume_m3: 8.5,
          cargo_weight_kg: 2100,
          capacity_m3: 20,
          capacity_kg: 5000,
          fill_percentage: 42.5
        },
        camera_available: true,
        camera_streaming: false,
        historical_data: generateHistoricalData(33.3152, 44.3661, 50),
        stats: {
          total_distance_today: 45.8,
          avg_speed_today: 58,
          max_speed_today: 78,
          stops_count: 5,
          driving_time_minutes: 120
        }
      },
      {
        id: '2',
        name: 'Ali AHMED',
        employee_code: 'DRV-002',
        role: 'driver',
        vehicle_id: 'VEH-102',
        vehicle_plate: '34 DEF 456',
        vehicle_type: 'Kamyon',
        vehicle_capacity_m3: 20,
        vehicle_capacity_kg: 5000,
        status: 'active',
        color: COLORS[1],
        location: {
          lat: 33.3180,
          lng: 44.3700,
          address: 'Al Jadiriya, Baghdad, Iraq',
          last_update: new Date(Date.now() - 15000).toISOString(),
          speed: 52,
          battery: 92,
          gps_accuracy: 12,
          heading: 140
        },
        trip: {
          start_time: '10:15',
          distance_km: 32.3,
          stops: 3,
          destination: 'Al Mansour Distribution Center',
          cargo_volume_m3: 6.2,
          cargo_weight_kg: 1550,
          capacity_m3: 20,
          capacity_kg: 5000,
          fill_percentage: 31
        },
        camera_available: true,
        camera_streaming: false,
        historical_data: generateHistoricalData(33.3180, 44.3700, 50),
        stats: {
          total_distance_today: 32.3,
          avg_speed_today: 49,
          max_speed_today: 68,
          stops_count: 3,
          driving_time_minutes: 85
        }
      },
      {
        id: '3',
        name: 'Sara KAYA',
        employee_code: 'DRV-003',
        role: 'driver',
        vehicle_id: 'VEH-103',
        vehicle_plate: '34 GHI 789',
        vehicle_type: 'Panelvan',
        vehicle_capacity_m3: 12,
        vehicle_capacity_kg: 2000,
        status: 'active',
        color: COLORS[2],
        location: {
          lat: 33.3120,
          lng: 44.3890,
          address: 'Green Zone, Baghdad, Iraq',
          last_update: new Date(Date.now() - 5000).toISOString(),
          speed: 42,
          battery: 67,
          gps_accuracy: 15,
          heading: 90
        },
        trip: {
          start_time: '11:00',
          distance_km: 18.7,
          stops: 2,
          destination: 'Rusafa Market',
          cargo_volume_m3: 8.5,
          cargo_weight_kg: 1200,
          capacity_m3: 12,
          capacity_kg: 2000,
          fill_percentage: 70.8
        },
        camera_available: true,
        camera_streaming: false,
        historical_data: generateHistoricalData(33.3120, 44.3890, 50),
        stats: {
          total_distance_today: 18.7,
          avg_speed_today: 45,
          max_speed_today: 55,
          stops_count: 2,
          driving_time_minutes: 45
        }
      },
      {
        id: '4',
        name: 'Hasan ÖZ',
        employee_code: 'DRV-004',
        role: 'driver',
        vehicle_id: 'VEH-104',
        vehicle_plate: '34 JKL 012',
        vehicle_type: 'Panelvan',
        vehicle_capacity_m3: 12,
        vehicle_capacity_kg: 2000,
        status: 'active',
        color: COLORS[3],
        location: {
          lat: 33.3100,
          lng: 44.3920,
          address: 'Al Karada, Baghdad, Iraq',
          last_update: new Date(Date.now() - 8000).toISOString(),
          speed: 38,
          battery: 78,
          gps_accuracy: 10,
          heading: 85
        },
        trip: {
          start_time: '11:15',
          distance_km: 15.2,
          stops: 1,
          destination: 'Rusafa Market',
          cargo_volume_m3: 4.8,
          cargo_weight_kg: 850,
          capacity_m3: 12,
          capacity_kg: 2000,
          fill_percentage: 40
        },
        camera_available: true,
        camera_streaming: false,
        historical_data: generateHistoricalData(33.3100, 44.3920, 50),
        stats: {
          total_distance_today: 15.2,
          avg_speed_today: 42,
          max_speed_today: 50,
          stops_count: 1,
          driving_time_minutes: 35
        }
      },
    ];
    setPersonnel(mockPersonnel);

    // Calculate consolidation suggestions
    calculateConsolidationSuggestions(mockPersonnel);
  };

  function generateHistoricalData(lat: number, lng: number, points: number): HistoricalPoint[] {
    const data: HistoricalPoint[] = [];
    const now = Date.now();

    // Generate data only for "today" (last 12 hours effectively for this demo)
    // In a real app, this would query backend with date filter
    const maxTimeLookback = 12 * 60 * 60 * 1000; // 12 hours

    for (let i = 0; i < points; i++) {
      const timeOffset = (points - i) * 15 * 60000; // 15 minute intervals spread out
      if (timeOffset > maxTimeLookback) continue;

      const timestamp = new Date(now - timeOffset);

      // Ensure it's the same calendar day
      if (timestamp.getDate() !== new Date().getDate()) continue;

      const latOffset = (Math.random() - 0.5) * 0.05; // Wider spread for demo
      const lngOffset = (Math.random() - 0.5) * 0.05;
      const speed = Math.floor(Math.random() * 80);

      data.push({
        timestamp: timestamp.toISOString(),
        lat: lat + latOffset,
        lng: lng + lngOffset,
        speed,
        address: `Point ${i + 1}`
      });
    }

    return data;
  }

  function calculateConsolidationSuggestions(personnel: Personnel[]) {
    const suggestions: VehicleConsolidationSuggestion[] = [];

    // Find vehicles with same destination and low fill rates
    for (let i = 0; i < personnel.length; i++) {
      for (let j = i + 1; j < personnel.length; j++) {
        const p1 = personnel[i];
        const p2 = personnel[j];

        if (p1.trip && p2.trip && p1.trip.destination === p2.trip.destination) {
          const combined_volume = p1.trip.cargo_volume_m3 + p2.trip.cargo_volume_m3;
          const combined_weight = p1.trip.cargo_weight_kg + p2.trip.cargo_weight_kg;
          const max_capacity = Math.max(p1.trip.capacity_m3, p2.trip.capacity_m3);
          const combined_fill = (combined_volume / max_capacity) * 100;

          // Only suggest if combined fill < 90%
          if (combined_fill < 90 && (p1.trip.fill_percentage < 60 || p2.trip.fill_percentage < 60)) {
            const distance_between = calculateDistance(p1.location.lat, p1.location.lng, p2.location.lat, p2.location.lng);

            suggestions.push({
              id: `${p1.id}-${p2.id}`,
              vehicle1: p1.name,
              vehicle2: p2.name,
              vehicle1_plate: p1.vehicle_plate || '',
              vehicle2_plate: p2.vehicle_plate || '',
              vehicle1_fill: p1.trip.fill_percentage,
              vehicle2_fill: p2.trip.fill_percentage,
              combined_fill,
              potential_savings_km: p2.trip.distance_km,
              potential_savings_iqd: p2.trip.distance_km * 2500, // 2500 IQD per km
              same_destination: true,
              distance_between_km: distance_between,
              recommendation: distance_between < 5
                ? '✅ ÖNERİLİR - Araçlar yakın konumda'
                : '⚠️ DEĞERLENDİR - Araçlar uzak konumda'
            });
          }
        }
      }
    }

    setConsolidationSuggestions(suggestions);
  }

  function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const getTimeSinceUpdate = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}sn önce`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}dk önce`;
    const hours = Math.floor(minutes / 60);
    return `${hours}s önce`;
  };

  const getBatteryColor = (battery: number) => {
    if (battery >= 70) return 'text-green-600';
    if (battery >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredPersonnel = filterRole === 'all'
    ? personnel
    : personnel.filter(p => p.role === filterRole);

  const activeCount = personnel.filter(p => p.status === 'active').length;
  const movingCount = personnel.filter(p => p.location.speed > 0).length;
  const totalDistance = personnel.reduce((sum, p) => sum + (p.stats?.total_distance_today || 0), 0);
  const avgSpeed = personnel
    .filter(p => p.location.speed > 0)
    .reduce((sum, p) => sum + p.location.speed, 0) / (movingCount || 1);

  // FULLSCREEN MAP VIEW
  if (showFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900">
        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-sm flex items-center justify-between px-6 z-[1000]">
          <div className="flex items-center gap-4">
            <MapPin className="w-6 h-6 text-red-500" />
            <div>
              <h2 className="text-white text-lg font-bold">Canlı GPS Takip - Tam Ekran</h2>
              <p className="text-gray-400 text-sm">{activeCount} aktif araç • {movingCount} hareket halinde</p>
            </div>
          </div>
          <button
            onClick={() => setShowFullscreen(false)}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2"
          >
            <X className="w-5 h-5" />
            Kapat
          </button>
        </div>

        {/* Full Map */}
        <div className="w-full h-full relative z-0">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={darkMode
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />

            {filteredPersonnel.map((person) => (
              <div key={person.id}>
                <Marker
                  position={[person.location.lat, person.location.lng]}
                  icon={createCustomIcon(person.color, person.location.heading)}
                  eventHandlers={{
                    click: () => setSelectedPerson(person),
                  }}
                >
                  <Popup className="custom-popup">
                    <div className="p-2">
                      <div className="font-bold mb-1">{person.name}</div>
                      <div className="text-xs text-gray-500">{person.vehicle_plate}</div>
                      <div className="text-xs font-bold mt-1">{person.location.speed} km/s</div>
                    </div>
                  </Popup>
                </Marker>

                {/* Historical Route - Fullscreen Fix */}
                {selectedPerson?.id === person.id && person.historical_data.length > 1 && (
                  <Polyline
                    positions={person.historical_data.map(p => [p.lat, p.lng])}
                    pathOptions={{ color: person.color, weight: 3, opacity: 0.6, dashArray: '5, 10' }}
                  />
                )}
              </div>
            ))}
          </MapContainer>

          {/* Legend - Fullscreen Updated */}
          <div className="absolute bottom-6 left-6 z-[1000] pointer-events-none">
            <div className="bg-slate-900/90 text-white backdrop-blur-md rounded-xl p-4 shadow-xl border border-slate-700/50 pointer-events-auto min-w-[280px]">
              <h3 className="font-bold mb-3 text-sm">Araçlar</h3>
              <div className="space-y-2.5">
                {filteredPersonnel.map(person => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between gap-3 group cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
                    onClick={() => setSelectedPerson(person)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: person.color, color: person.color }} />
                      <div className="text-sm font-medium text-slate-200">
                        {person.name} <span className="text-slate-500 mx-1">-</span> {person.vehicle_plate}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      ({person.location.speed} km/s)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-8 animate-in fade-in slide-in-from-top duration-700">
        <button onClick={onBack} className={`mb-4 flex items-center gap-2 ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} transition-colors font-medium`}>
          <ChevronLeft className="w-5 h-5" />
          Geri Dön
        </button>
        <div className="flex items-center justify-between flex-wrap gap-6">
          <div className="relative group">
            <div className={`absolute -inset-1 rounded-2xl blur opacity-25 group-hover:opacity-60 transition duration-500 ${darkMode ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gradient-to-r from-blue-400 to-purple-400'}`}></div>
            <div className="relative">
              <h1 className={`text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r ${darkMode ? 'from-white to-slate-400' : 'from-slate-900 to-slate-600'} mb-2 flex items-center gap-4`}>
                <div className="bg-gradient-to-tr from-red-500 to-orange-500 p-2.5 rounded-2xl shadow-lg shadow-orange-500/20">
                  <MapPin className="w-8 h-8 text-white" />
                </div>
                Enterprise GPS Filo Takibi
              </h1>
              <p className={`${subTextClass} text-lg font-medium tracking-wide`}>Anlık konum, geçmiş veri, kamera ve akıllı rota optimizasyonu</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowConsolidation(!showConsolidation)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 ${showConsolidation
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-purple-500/25 border border-transparent'
                : `${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-200'} border`
                }`}
            >
              <LayoutGrid className="w-5 h-5" />
              Araç Birleştirme
            </button>
            <button
              onClick={() => setShowFullscreen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Minimize className="w-5 h-5" />
              Tam Ekran
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold transition-all duration-300 border ${autoRefresh
                ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                : `${darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`
                }`}
            >
              <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Canlı' : 'Durduruldu'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 animate-in slide-in-from-bottom-4 duration-700 delay-150">
        {[
          { label: 'Aktif Araçlar', value: `${activeCount}/${personnel.length}`, icon: Activity, color: 'emerald', sub: 'Tüm sistem çalışıyor' },
          { label: 'Hareket Halinde', value: movingCount, icon: Navigation, color: 'blue', sub: 'Anlık rota üzerinde' },
          { label: 'Toplam Mesafe', value: `${totalDistance.toFixed(1)} km`, icon: TrendingUp, color: 'violet', sub: 'Bugünkü kat edilen' },
          { label: 'Ort. Hız', value: `${avgSpeed.toFixed(0)} km/s`, icon: Truck, color: 'orange', sub: 'Filo geneli ortalama' }
        ].map((stat, i) => (
          <div key={i} className={`${cardClass} border rounded-2xl p-6 group hover:border-slate-300/50 dark:hover:border-slate-600 transition-all duration-300 hover:shadow-2xl hover:shadow-${stat.color}-500/10`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-sm font-semibold ${subTextClass} mb-1 uppercase tracking-wider`}>{stat.label}</div>
                <div className={`text-3xl font-black ${textClass} tracking-tight`}>{stat.value}</div>
                <div className={`text-xs font-medium mt-2 py-1 px-2 rounded-lg bg-${stat.color}-500/10 text-${stat.color}-500 inline-block`}>
                  {stat.sub}
                </div>
              </div>
              <div className={`w-14 h-14 bg-gradient-to-br from-${stat.color}-500 to-${stat.color}-600 rounded-2xl flex items-center justify-center shadow-lg shadow-${stat.color}-500/30 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                <stat.icon className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Consolidation Suggestions */}
      {showConsolidation && consolidationSuggestions.length > 0 && (
        <div className={`${cardClass} border rounded-xl mb-6 overflow-hidden`}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-500 to-pink-500">
            <div className="flex items-center gap-3">
              <LayoutGrid className="w-6 h-6 text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">Akıllı Araç Birleştirme Önerileri</h3>
                <p className="text-sm text-white/80">Aynı rotaya giden yakın araçlar tespit edildi</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {consolidationSuggestions.map((suggestion) => (
              <div key={suggestion.id} className={`border-2 border-purple-200 dark:border-purple-800 rounded-xl p-4 ${darkMode ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className={`font-bold ${textClass} mb-1`}>
                      {suggestion.recommendation}
                    </h4>
                    <p className="text-sm text-gray-500">
                      Araçlar {suggestion.distance_between_km.toFixed(1)} km mesafede • Potansiyel tasarruf: {suggestion.potential_savings_km.toFixed(1)} km
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">
                      {suggestion.potential_savings_iqd.toLocaleString('tr-TR')} IQD
                    </div>
                    <div className="text-xs text-gray-500">Yakıt tasarrufu</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Vehicle 1 */}
                  <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700' : 'bg-white'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="w-5 h-5 text-blue-500" />
                      <div className={`font-bold ${textClass}`}>{suggestion.vehicle1}</div>
                    </div>
                    <div className="text-sm text-gray-500 mb-2">{suggestion.vehicle1_plate}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                        <div
                          className="bg-blue-500 h-3 rounded-full"
                          style={{ width: `${suggestion.vehicle1_fill}%` }}
                        />
                      </div>
                      <div className={`text-sm font-bold ${textClass}`}>{suggestion.vehicle1_fill.toFixed(0)}%</div>
                    </div>
                  </div>

                  {/* Plus Sign */}
                  <div className="flex items-center justify-center">
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-2xl font-bold">+</span>
                    </div>
                  </div>

                  {/* Vehicle 2 */}
                  <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700' : 'bg-white'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Truck className="w-5 h-5 text-green-500" />
                      <div className={`font-bold ${textClass}`}>{suggestion.vehicle2}</div>
                    </div>
                    <div className="text-sm text-gray-500 mb-2">{suggestion.vehicle2_plate}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                        <div
                          className="bg-green-500 h-3 rounded-full"
                          style={{ width: `${suggestion.vehicle2_fill}%` }}
                        />
                      </div>
                      <div className={`text-sm font-bold ${textClass}`}>{suggestion.vehicle2_fill.toFixed(0)}%</div>
                    </div>
                  </div>
                </div>

                {/* Combined Result */}
                <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Birleştirilmiş Doluluk Oranı</div>
                      <div className={`text-2xl font-bold ${textClass}`}>{suggestion.combined_fill.toFixed(1)}%</div>
                    </div>
                    <button className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold">
                      Birleştir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-8 duration-1000 delay-300">
        {/* Map Area */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className={`${cardClass} border rounded-3xl overflow-hidden flex flex-col h-[700px] relative`}>
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none" />

            <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-start pointer-events-none">
              <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 pointer-events-auto shadow-xl">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Gerçek Zamanlı Konum
                </h3>
                <div className="text-white/60 text-xs mt-1">Son güncelleme: {new Date().toLocaleTimeString()}</div>
              </div>

              <div className="flex gap-2 pointer-events-auto">
                <button
                  onClick={() => setShowHistorical(!showHistorical)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold backdrop-blur-md transition-all ${showHistorical
                    ? 'bg-blue-500/90 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-black/40 text-white/80 border border-white/10 hover:bg-black/60'
                    }`}
                >
                  Geçmiş Rota
                </button>
                <button
                  onClick={() => setShowFullscreen(true)}
                  className="p-2.5 bg-black/40 border border-white/10 text-white/80 hover:bg-black/60 hover:text-white rounded-xl backdrop-blur-md transition-all"
                >
                  <Minimize className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="w-full h-full relative z-0">
              <MapContainer
                center={mapCenter}
                zoom={12}
                style={{ width: '100%', height: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url={darkMode
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  }
                />

                {filteredPersonnel.map((person) => (
                  <div key={person.id}>
                    <Marker
                      position={[person.location.lat, person.location.lng]}
                      icon={createCustomIcon(person.color, person.location.heading)}
                      eventHandlers={{
                        click: () => setSelectedPerson(person),
                      }}
                      zIndexOffset={selectedPerson?.id === person.id ? 1000 : 0}
                    >
                      <Popup className="custom-popup" closeButton={false}>
                        <div className="p-3 min-w-[200px]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-lg">{person.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white bg-slate-900`}>{person.vehicle_plate}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                              <div className="text-slate-500 mb-0.5">Hız</div>
                              <div className="font-bold text-slate-900 dark:text-slate-200">{person.location.speed} km/s</div>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                              <div className="text-slate-500 mb-0.5">Batarya</div>
                              <div className={`font-bold ${getBatteryColor(person.location.battery)}`}>{person.location.battery}%</div>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    {showHistorical && selectedPerson?.id === person.id && person.historical_data.length > 1 && (
                      <Polyline
                        positions={person.historical_data.map(p => [p.lat, p.lng])}
                        pathOptions={{
                          color: person.color,
                          weight: 3,
                          opacity: 0.6,
                          dashArray: '5, 10',
                          lineCap: 'round',
                          lineJoin: 'round'
                        }}
                      />
                    )}
                  </div>
                ))}
              </MapContainer>
            </div>

            {/* Legend - Updated to match user request */}
            <div className="absolute bottom-6 left-6 z-[1000] pointer-events-none">
              <div className="bg-slate-900/90 text-white backdrop-blur-md rounded-xl p-4 shadow-xl border border-slate-700/50 pointer-events-auto min-w-[280px]">
                <h3 className="font-bold mb-3 text-sm">Araçlar</h3>
                <div className="space-y-2.5">
                  {filteredPersonnel.map(person => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between gap-3 group cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
                      onClick={() => setSelectedPerson(person)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: person.color, color: person.color }} />
                        <div className="text-sm font-medium text-slate-200">
                          {person.name} <span className="text-slate-500 mx-1">-</span> {person.vehicle_plate}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        ({person.location.speed} km/s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="lg:col-span-1 h-[700px]">
          <div className={`${cardClass} border rounded-3xl overflow-hidden h-full flex flex-col`}>
            <div className={`p-6 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
              <h3 className={`text-xl font-black ${textClass} mb-4 flex items-center gap-2`}>
                Listelenen Araçlar
                <span className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{personnel.length}</span>
              </h3>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border appearance-none outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer font-medium ${darkMode
                    ? 'bg-slate-900/50 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                    }`}
                >
                  <option value="all">Tüm Filo Görüntüleniyor</option>
                  <option value="driver">Sadece Sürücüler</option>
                </select>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3 custom-scrollbar">
              {filteredPersonnel.map((person) => (
                <div
                  key={person.id}
                  className={`p-4 rounded-2xl border transition-all duration-300 group cursor-pointer hover:scale-[1.02] ${selectedPerson?.id === person.id
                    ? darkMode ? 'bg-blue-500/10 border-blue-500/50' : 'bg-blue-50 border-blue-200'
                    : darkMode ? 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/50' : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50'
                    }`}
                  onClick={() => setSelectedPerson(person)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:rotate-12"
                          style={{ backgroundColor: person.color, boxShadow: `0 8px 20px -6px ${person.color}50` }}
                        >
                          <Truck className="w-6 h-6 text-white" />
                        </div>
                        {person.status === 'active' && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full" />
                        )}
                      </div>
                      <div>
                        <div className={`font-bold ${textClass} text-lg leading-tight group-hover:text-blue-500 transition-colors`}>{person.name}</div>
                        <div className={`text-xs font-medium ${subTextClass} mt-0.5`}>{person.vehicle_plate}</div>
                      </div>
                    </div>
                    {person.camera_available && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPerson(person);
                          setShowCamera(true);
                        }}
                        className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all duration-300"
                        title="Kamerayı İzle"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{person.location.address}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className={`p-2 rounded-lg text-center ${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                      <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Hız</div>
                      <div className={`font-black ${textClass}`}>{person.location.speed} <span className="text-[10px] font-normal text-slate-500">km/s</span></div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                      <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Doluluk</div>
                      <div className={`font-black ${textClass}`}>{person.trip?.fill_percentage.toFixed(0)}%</div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                      <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Batarya</div>
                      <div className={`font-black ${getBatteryColor(person.location.battery)}`}>{person.location.battery}%</div>
                    </div>
                  </div>

                  {person.trip && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className={subTextClass}>Görev Tamamlanma</span>
                        <span className={`font-bold ${textClass}`}>{person.trip.fill_percentage.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000"
                          style={{ width: `${person.trip.fill_percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      {showCamera && selectedPerson?.camera_available && (
        <>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={() => setShowCamera(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-4xl z-50">
            <div className={`${cardClass} border rounded-2xl shadow-2xl overflow-hidden`}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-red-500 to-pink-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Video className="w-6 h-6 text-white" />
                    <div>
                      <h3 className="text-xl font-bold text-white">Canlı Kamera - {selectedPerson.name}</h3>
                      <p className="text-sm text-white/80">{selectedPerson.vehicle_plate}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCamera(false)}
                    className="p-2 rounded-lg hover:bg-white/20"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              <div className="bg-black aspect-video flex items-center justify-center">
                <div className="text-center">
                  <Video className="w-16 h-16 text-white mx-auto mb-4" />
                  <p className="text-white text-lg">Canlı Kamera Yayını</p>
                  <p className="text-gray-400 text-sm mt-2">Mobil uygulama kamera akışı burada görüntülenecek</p>
                  <div className="mt-6 flex items-center justify-center gap-4">
                    <button className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2">
                      <Play className="w-5 h-5" />
                      Başlat
                    </button>
                    <button className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2">
                      <Pause className="w-5 h-5" />
                      Duraklat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Historical Data Modal */}
      {selectedPerson && showHistorical && (
        <div className="fixed bottom-6 right-6 w-96 z-50">
          <div className={`${cardClass} border rounded-xl shadow-2xl overflow-hidden`}>
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  <h3 className="text-lg font-bold">Geçmiş Veri</h3>
                </div>
                <button
                  onClick={() => setShowHistorical(false)}
                  className="p-1 hover:bg-white/20 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="text-sm opacity-90">{selectedPerson.name}</div>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto">
              <div className="space-y-3">
                {selectedPerson.historical_data.slice(-10).reverse().map((point, index) => (
                  <div key={index} className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-500">
                        {new Date(point.timestamp).toLocaleTimeString('tr-TR')}
                      </div>
                      <div className={`text-sm font-bold ${textClass}`}>{point.speed} km/s</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

