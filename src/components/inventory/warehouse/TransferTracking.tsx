import { useState, useEffect } from 'react';
import { 
  MapPin, Navigation, Clock, Package, User, Phone, 
  ArrowLeft, RefreshCw, CheckCircle, Truck, AlertCircle,
  Navigation2, Map, Route, Target
} from 'lucide-react';

interface TransferLocation {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy?: number;
}

interface TransferTracking {
  id: string;
  transferNo: string;
  fromLocation: string;
  toLocation: string;
  status: 'pending' | 'in-transit' | 'completed' | 'cancelled';
  driver: {
    name: string;
    phone: string;
    vehiclePlate: string;
  };
  items: {
    productName: string;
    quantity: number;
  }[];
  currentLocation?: TransferLocation;
  route?: TransferLocation[];
  estimatedArrival?: string;
  distance?: number;
  startTime?: string;
  endTime?: string;
}

interface TransferTrackingProps {
  transfer: TransferTracking;
  onBack: () => void;
}

export function TransferTracking({ transfer, onBack }: TransferTrackingProps) {
  const [currentLocation, setCurrentLocation] = useState<TransferLocation | null>(
    transfer.currentLocation || null
  );
  const [isTracking, setIsTracking] = useState(transfer.status === 'in-transit');
  const [route, setRoute] = useState<TransferLocation[]>(transfer.route || []);
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toISOString());

  // Simulate real-time location updates (in production, this would use actual GPS data)
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      // Simulate GPS update
      if (currentLocation) {
        const newLat = currentLocation.lat + (Math.random() - 0.5) * 0.001;
        const newLng = currentLocation.lng + (Math.random() - 0.5) * 0.001;
        
        const newLocation: TransferLocation = {
          lat: newLat,
          lng: newLng,
          timestamp: new Date().toISOString(),
          accuracy: Math.random() * 20 + 5 // 5-25 meters
        };

        setCurrentLocation(newLocation);
        setRoute(prev => [...prev, newLocation]);
        setLastUpdate(new Date().toISOString());
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [isTracking, currentLocation]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return '--';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'in-transit': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Bekliyor';
      case 'in-transit': return 'Yolda';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal Edildi';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Transfer Takip</h1>
            <p className="text-xs text-blue-100">{transfer.transferNo}</p>
          </div>
          <button
            onClick={() => setLastUpdate(new Date().toISOString())}
            className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 ${getStatusColor(transfer.status)} rounded-full flex items-center gap-2`}>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">{getStatusText(transfer.status)}</span>
          </div>
          {currentLocation && (
            <div className="text-xs text-blue-100">
              Son Güncelleme: {formatTime(lastUpdate)}
            </div>
          )}
        </div>
      </div>

      {/* Live Map */}
      <div className="relative h-80 bg-gray-200 border-b-4 border-blue-500">
        {/* Map Container - In production, use Google Maps or Leaflet */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-100 to-blue-100">
          {/* Simulated Map */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Map className="w-16 h-16 text-blue-400 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-gray-600">Canlı Harita Görünümü</p>
              {currentLocation && (
                <div className="mt-2 text-xs text-gray-500">
                  <div>Lat: {currentLocation.lat.toFixed(6)}</div>
                  <div>Lng: {currentLocation.lng.toFixed(6)}</div>
                  {currentLocation.accuracy && (
                    <div className="mt-1 text-green-600">
                      Doğruluk: ±{Math.round(currentLocation.accuracy)}m
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Current Location Marker */}
          {currentLocation && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="relative">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                  <Truck className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
            </div>
          )}

          {/* Route Path */}
          {route.length > 1 && (
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg">
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <Route className="w-4 h-4 text-blue-600" />
                <span>{route.length} GPS noktası</span>
              </div>
            </div>
          )}

          {/* Map Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-50">
              <Target className="w-5 h-5 text-gray-700" />
            </button>
            <button className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center hover:bg-gray-50">
              <Navigation2 className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Details */}
      <div className="p-4 space-y-4">
        {/* Route Info */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-blue-600" />
            Rota Bilgisi
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500">Başlangıç</div>
                <div className="font-medium text-gray-900">{transfer.fromLocation}</div>
                {transfer.startTime && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatTime(transfer.startTime)}
                  </div>
                )}
              </div>
            </div>

            <div className="ml-4 border-l-2 border-dashed border-gray-300 pl-7 py-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Truck className="w-4 h-4" />
                <span>
                  {transfer.distance ? formatDistance(transfer.distance) : 'Hesaplanıyor...'}
                </span>
                {transfer.estimatedArrival && (
                  <>
                    <span className="text-gray-400">•</span>
                    <Clock className="w-4 h-4" />
                    <span>Tahmini: {formatTime(transfer.estimatedArrival)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <MapPin className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500">Hedef</div>
                <div className="font-medium text-gray-900">{transfer.toLocation}</div>
                {transfer.endTime && (
                  <div className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Teslim Edildi: {formatTime(transfer.endTime)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Driver Info */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Sürücü Bilgisi
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">İsim</span>
              <span className="font-medium">{transfer.driver.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Telefon</span>
              <a 
                href={`tel:${transfer.driver.phone}`}
                className="font-medium text-blue-600 flex items-center gap-1 hover:underline"
              >
                <Phone className="w-4 h-4" />
                {transfer.driver.phone}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Araç Plaka</span>
              <span className="font-medium font-mono">{transfer.driver.vehiclePlate}</span>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Transfer Edilen Ürünler ({transfer.items.length})
          </h3>
          
          <div className="space-y-2">
            {transfer.items.map((item, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <span className="text-sm text-gray-900">{item.productName}</span>
                <span className="font-medium text-blue-600">{item.quantity} adet</span>
              </div>
            ))}
          </div>
        </div>

        {/* GPS Accuracy Alert */}
        {currentLocation && currentLocation.accuracy && currentLocation.accuracy > 50 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-orange-800">
              <div className="font-medium mb-1">Düşük GPS Hassasiyeti</div>
              <div>
                Konum doğruluğu ±{Math.round(currentLocation.accuracy)}m. 
                Daha iyi sinyal için açık alana çıkın.
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        {transfer.status !== 'pending' && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Zaman Çizelgesi
            </h3>
            
            <div className="space-y-3">
              {transfer.startTime && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Transfer Başladı</div>
                    <div className="text-xs text-gray-500">{formatTime(transfer.startTime)}</div>
                  </div>
                </div>
              )}
              
              {transfer.status === 'in-transit' && route.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Yolda</div>
                    <div className="text-xs text-gray-500">
                      {route.length} GPS güncellemesi alındı
                    </div>
                  </div>
                </div>
              )}
              
              {transfer.endTime && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Teslim Edildi</div>
                    <div className="text-xs text-gray-500">{formatTime(transfer.endTime)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Padding for scroll */}
      <div className="h-20"></div>
    </div>
  );
}

