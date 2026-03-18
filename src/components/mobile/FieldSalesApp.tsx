/**
 * Mobile Field Sales Application
 * Pattern: Progressive Web App + Offline-First
 * Features: GPS tracking, route navigation, check-in/out, live sync
 */

import { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Navigation, CheckCircle, Clock, Camera, Phone, 
  Package, DollarSign, MessageSquare, AlertCircle, User, Menu
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { 
  fieldSalesService, 
  type SalesRoute, 
  type PlannedVisit, 
  type Visit, 
  type GeoLocation,
  DistanceCalculator
} from '../../services/fieldSalesService';

export function FieldSalesApp() {
  const [currentRoute, setCurrentRoute] = useState<SalesRoute | null>(null);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [activeVisit, setActiveVisit] = useState<PlannedVisit | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const trackingInterval = useRef<NodeJS.Timeout | null>(null);
  const salespersonId = 'sp-001'; // From auth context

  // Get current location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString()
          });
          setLocationError(null);
          toast.success('Konum başarıyla alındı');
        },
        (error) => {
          console.error('Location error:', error);
          let errorMessage = 'Konum alınamadı';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Konum izni reddedildi. Tarayıcı ayarlarından izin verin.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Konum bilgisi kullanılamıyor.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Konum alma zaman aşımına uğradı.';
              break;
          }
          
          setLocationError(errorMessage);
          toast.error(errorMessage);
          
          // Use mock location for testing
          console.log('Using mock location for testing');
          setLocation({
            latitude: 41.0082,
            longitude: 28.9784,
            accuracy: 10,
            timestamp: new Date().toISOString()
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      const error = 'Tarayıcınız GPS desteklemiyor';
      setLocationError(error);
      toast.error(error);
      
      // Use mock location
      setLocation({
        latitude: 41.0082,
        longitude: 28.9784,
        accuracy: 10,
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Start GPS tracking
  const startTracking = () => {
    if (!currentRoute) return;

    setIsTracking(true);

    trackingInterval.current = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const newLocation: GeoLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date().toISOString()
            };

            setLocation(newLocation);

            // Track location
            fieldSalesService.trackLocation(salespersonId, newLocation, {
              speed: position.coords.speed || undefined,
              heading: position.coords.heading || undefined
            });
          }
        );
      }
    }, 10000); // Track every 10 seconds
  };

  // Stop tracking
  const stopTracking = () => {
    setIsTracking(false);
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
    }
  };

  // Start route
  const handleStartRoute = () => {
    if (!currentRoute || !location) return;

    fieldSalesService.startRoute(currentRoute.id, location);
    setCurrentRoute({ ...currentRoute, status: 'IN_PROGRESS' });
    startTracking();
    toast.success('Rota başlatıldı');
  };

  // Check in
  const handleCheckIn = (visit: PlannedVisit) => {
    if (!location) {
      toast.error('Konum alınamıyor');
      return;
    }

    const newVisit = fieldSalesService.checkIn(
      visit.id,
      salespersonId,
      location
    );

    setCurrentVisit(newVisit);
    setActiveVisit(visit);
    toast.success(`${visit.customer_name} - Check-in yapıldı`);
  };

  // Check out
  const handleCheckOut = () => {
    if (!currentVisit || !location) return;

    fieldSalesService.checkOut(
      currentVisit.id,
      location,
      currentVisit.outcomes
    );

    setCurrentVisit(null);
    setActiveVisit(null);
    toast.success('Check-out yapıldı');
  };

  // Load today's route
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const routes = fieldSalesService.getRoutes(salespersonId, today);

    if (routes.length > 0) {
      setCurrentRoute(routes[0]);
    }
  }, []);

  // No route screen
  if (!currentRoute) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <Navigation className="w-16 h-16 mx-auto text-blue-600 mb-4" />
            <h1 className="text-xl mb-2">Bugünlük Rota Yok</h1>
            <p className="text-gray-600 text-sm">
              Yöneticiniz henüz bugün için rota oluşturmamış
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active visit screen
  if (currentVisit && activeVisit) {
    return <VisitScreen 
      visit={currentVisit} 
      plannedVisit={activeVisit}
      location={location}
      onCheckOut={handleCheckOut}
      onUpdateOutcome={(outcomes) => {
        setCurrentVisit({ ...currentVisit, outcomes });
      }}
    />;
  }

  // Route screen
  const completedVisits = currentRoute.planned_visits.filter(v => v.status === 'COMPLETED').length;
  const progress = (completedVisits / currentRoute.planned_visits.length) * 100;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg">Bugünkü Rotam</h1>
            <div className="text-sm opacity-90">
              {completedVisits}/{currentRoute.planned_visits.length} ziyaret
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl">{Math.round(progress)}%</div>
            <div className="text-xs opacity-90">Tamamlandı</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-blue-700 rounded-full h-2">
          <div 
            className="bg-white rounded-full h-2 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* GPS Info banner */}
      {locationError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-yellow-800 font-medium mb-1">GPS Uyarısı</div>
              <div className="text-yellow-700 text-xs">{locationError}</div>
              <div className="text-yellow-600 text-xs mt-1">
                Test için mock konum kullanılıyor (İstanbul, Türkiye)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status banner */}
      {currentRoute.status === 'PLANNED' && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-3">
          <button
            onClick={handleStartRoute}
            disabled={!location}
            className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-300"
          >
            Rotaya Başla
          </button>
        </div>
      )}

      {currentRoute.status === 'IN_PROGRESS' && (
        <div className="bg-green-50 border-l-4 border-green-500 p-3 flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-green-700">Rota aktif - GPS izleniyor</span>
        </div>
      )}

      {/* Visits List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {currentRoute.planned_visits.map((visit) => (
          <VisitCard
            key={visit.id}
            visit={visit}
            location={location}
            onCheckIn={() => handleCheckIn(visit)}
          />
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="bg-white border-t p-4 grid grid-cols-3 gap-2">
        <button className="flex flex-col items-center gap-1 py-2 text-gray-600">
          <MapPin className="w-5 h-5" />
          <span className="text-xs">Harita</span>
        </button>
        <button className="flex flex-col items-center gap-1 py-2 text-blue-600">
          <Navigation className="w-5 h-5" />
          <span className="text-xs">Rota</span>
        </button>
        <button className="flex flex-col items-center gap-1 py-2 text-gray-600">
          <Menu className="w-5 h-5" />
          <span className="text-xs">Menü</span>
        </button>
      </div>
    </div>
  );
}

// Visit Card Component
interface VisitCardProps {
  visit: PlannedVisit;
  location: GeoLocation | null;
  onCheckIn: () => void;
}

function VisitCard({ visit, location, onCheckIn }: VisitCardProps) {
  const distance = location 
    ? Math.round(DistanceCalculator.calculate(location, visit.location))
    : null;

  const statusColors = {
    COMPLETED: 'bg-green-100 border-green-500 text-green-700',
    IN_PROGRESS: 'bg-blue-100 border-blue-500 text-blue-700',
    PENDING: 'bg-gray-100 border-gray-300 text-gray-700',
    SKIPPED: 'bg-orange-100 border-orange-500 text-orange-700',
    CANCELLED: 'bg-red-100 border-red-500 text-red-700'
  };

  const visitTypeIcons = {
    SALES: Package,
    COLLECTION: DollarSign,
    SURVEY: MessageSquare,
    COMPLAINT: AlertCircle,
    DEMO: Camera,
    FOLLOW_UP: Phone
  };

  const Icon = visitTypeIcons[visit.visit_type] || MapPin;

  return (
    <div className={`rounded-lg border-l-4 p-4 ${statusColors[visit.status]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-white px-2 py-0.5 rounded text-xs">#{visit.sequence}</span>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="font-medium mb-1">{visit.customer_name}</h3>
          <p className="text-xs opacity-75">{visit.customer_address}</p>
        </div>

        {visit.status === 'COMPLETED' && (
          <CheckCircle className="w-6 h-6 text-green-600" />
        )}
      </div>

      {distance !== null && visit.status === 'PENDING' && (
        <div className="flex items-center gap-2 text-xs mb-3">
          <MapPin className="w-4 h-4" />
          <span>{distance}m uzaklıkta</span>
        </div>
      )}

      {visit.status === 'PENDING' && (
        <button
          onClick={onCheckIn}
          disabled={!location}
          className="w-full bg-white py-2 rounded hover:bg-opacity-90 text-sm disabled:opacity-50"
        >
          Check-in Yap
        </button>
      )}
    </div>
  );
}

// Visit Screen Component
interface VisitScreenProps {
  visit: Visit;
  plannedVisit: PlannedVisit;
  location: GeoLocation | null;
  onCheckOut: () => void;
  onUpdateOutcome: (outcomes: any) => void;
}

function VisitScreen({ visit, plannedVisit, location, onCheckOut, onUpdateOutcome }: VisitScreenProps) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const duration = Math.floor((Date.now() - new Date(visit.check_in_time).getTime()) / 1000 / 60);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-5 h-5" />
          <span className="text-sm">{duration} dakika</span>
        </div>
        <h1 className="text-xl mb-1">{visit.customer_name}</h1>
        <div className="text-sm opacity-90">Ziyaret devam ediyor</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Quick actions */}
        <div className="bg-white rounded-lg p-4">
          <h3 className="text-sm mb-3">İşlemler</h3>
          <div className="grid grid-cols-2 gap-2">
            <button className="border-2 border-blue-600 text-blue-600 py-3 rounded-lg hover:bg-blue-50 flex flex-col items-center gap-1">
              <Package className="w-6 h-6" />
              <span className="text-xs">Sipariş Al</span>
            </button>
            <button className="border-2 border-green-600 text-green-600 py-3 rounded-lg hover:bg-green-50 flex flex-col items-center gap-1">
              <DollarSign className="w-6 h-6" />
              <span className="text-xs">Tahsilat</span>
            </button>
          </div>
        </div>

        {/* Outcomes */}
        <div className="bg-white rounded-lg p-4">
          <h3 className="text-sm mb-3">Sonuçlar</h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-2xl text-blue-600">{visit.outcomes.orders_taken}</div>
              <div className="text-xs text-gray-600">Sipariş</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-2xl text-green-600">{visit.outcomes.collection_total}</div>
              <div className="text-xs text-gray-600">Tahsilat</div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg p-4">
          <h3 className="text-sm mb-2">Notlar</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Ziyaret notları..."
          />
        </div>

        {/* Photos */}
        <div className="bg-white rounded-lg p-4">
          <h3 className="text-sm mb-2">Fotoğraflar</h3>
          <button className="w-full border-2 border-dashed border-gray-300 rounded-lg py-8 hover:border-blue-500 hover:bg-blue-50">
            <Camera className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <div className="text-sm text-gray-600">Fotoğraf Çek</div>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t p-4">
        <button
          onClick={() => {
            if (confirm('Ziyareti tamamlamak istediğinizden emin misiniz?')) {
              onCheckOut();
            }
          }}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
        >
          Check-out Yap
        </button>
      </div>
    </div>
  );
}
