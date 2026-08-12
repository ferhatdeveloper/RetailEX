/**
 * Live Tracking Dashboard
 * Pattern: Observer Pattern + Real-time updates
 * Features: Live salesperson locations, route monitoring, map view
 */

import { useState, useEffect } from 'react';
import { MapPin, Navigation, User, Clock, TrendingUp, Phone, AlertCircle } from 'lucide-react';
import { fieldSalesService, type Salesperson, type LocationTrack } from '../../services/fieldSalesService';

export function LiveTracking() {
  const [liveData, setLiveData] = useState<Map<string, { salesperson: Salesperson; track?: LocationTrack }>>(new Map());
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  // Subscribe to location updates
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // Get all salespeople
    const salespeople = fieldSalesService.getSalespeople();

    salespeople.forEach(person => {
      const unsubscribe = fieldSalesService.subscribeToLocation(
        person.id,
        (track) => {
          // Update triggered
          setUpdateCount(c => c + 1);
        }
      );

      unsubscribers.push(unsubscribe);
    });

    // Initial load
    setLiveData(fieldSalesService.getLiveLocations());

    // Refresh every 5 seconds
    const interval = setInterval(() => {
      setLiveData(fieldSalesService.getLiveLocations());
    }, 5000);

    return () => {
      unsubscribers.forEach(unsub => unsub());
      clearInterval(interval);
    };
  }, []);

  const selectedData = selectedPerson ? liveData.get(selectedPerson) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl mb-1">Canlı Konum Takibi</h1>
              <p className="text-sm text-gray-600">
                Saha satış ekibinizin anlık konumları
              </p>
            </div>
            <div className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm">Canlı</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl text-blue-600">{liveData.size}</div>
                  <div className="text-xs text-gray-600">Aktif Personel</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Navigation className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl text-green-600">
                    {Array.from(liveData.values()).filter(d => d.salesperson.current_route_id).length}
                  </div>
                  <div className="text-xs text-gray-600">Rotada</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl text-orange-600">
                    {Array.from(liveData.values()).filter(d => d.track?.is_moving).length}
                  </div>
                  <div className="text-xs text-gray-600">Hareket Halinde</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl text-purple-600">{updateCount}</div>
                  <div className="text-xs text-gray-600">Güncelleme</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Personnel List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-lg">Personel Listesi</h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-auto">
              {Array.from(liveData.entries()).map(([id, data]) => (
                <PersonnelCard
                  key={id}
                  salesperson={data.salesperson}
                  track={data.track}
                  isSelected={selectedPerson === id}
                  onClick={() => setSelectedPerson(id)}
                />
              ))}
            </div>
          </div>

          {/* Map/Details */}
          <div className="col-span-2 space-y-6">
            {/* Map placeholder */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="h-96 bg-gradient-to-br from-blue-100 to-green-100 relative">
                {/* Mock map */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                    <p className="text-gray-600">
                      Gerçek projede Google Maps / Mapbox entegrasyonu
                    </p>
                  </div>
                </div>

                {/* Map markers simulation */}
                {Array.from(liveData.values()).map((data, index) => (
                  <div
                    key={data.salesperson.id}
                    className="absolute w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-white cursor-pointer hover:scale-110 transition-transform"
                    style={{
                      top: `${20 + index * 15}%`,
                      left: `${20 + index * 20}%`
                    }}
                    onClick={() => setSelectedPerson(data.salesperson.id)}
                  >
                    <User className="w-5 h-5" />
                  </div>
                ))}
              </div>
            </div>

            {/* Selected person details */}
            {selectedData && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl mb-1">{selectedData.salesperson.name}</h3>
                    <div className="text-sm text-gray-600">
                      {selectedData.salesperson.employee_code} • {selectedData.salesperson.territory}
                    </div>
                  </div>
                  <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <Phone className="w-4 h-4" />
                    Ara
                  </button>
                </div>

                {selectedData.track ? (
                  <div className="space-y-4">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${selectedData.track.is_moving ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                      <span className="text-sm">
                        {selectedData.track.is_moving ? 'Hareket halinde' : 'Durağan'}
                      </span>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="text-xs text-gray-600 mb-1">Hız</div>
                        <div className="text-lg">{selectedData.track.speed?.toFixed(1) || 0} km/h</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="text-xs text-gray-600 mb-1">Batarya</div>
                        <div className="text-lg">{selectedData.track.battery_level || 100}%</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="text-xs text-gray-600 mb-1">Hassasiyet</div>
                        <div className="text-lg">{selectedData.track.location.accuracy.toFixed(0)}m</div>
                      </div>
                    </div>

                    {/* Location */}
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-blue-600 mt-1" />
                        <div className="flex-1">
                          <div className="text-sm mb-1">Konum</div>
                          <div className="text-xs text-gray-600">
                            {selectedData.track.location.latitude.toFixed(6)}, {selectedData.track.location.longitude.toFixed(6)}
                          </div>
                        </div>
                        <button className="text-sm text-blue-600 hover:underline">
                          Haritada Göster
                        </button>
                      </div>
                    </div>

                    {/* Route info */}
                    {selectedData.salesperson.current_route_id && (
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Navigation className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-medium">Aktif Rota</span>
                        </div>
                        <button className="text-sm text-green-600 hover:underline">
                          Rota Detaylarını Gör
                        </button>
                      </div>
                    )}

                    {/* Last update */}
                    <div className="text-xs text-gray-500 text-center pt-2 border-t">
                      Son güncelleme: {new Date(selectedData.track.recorded_at).toLocaleTimeString('tr-TR')}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Konum bilgisi yok</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Personnel Card
interface PersonnelCardProps {
  salesperson: Salesperson;
  track?: LocationTrack;
  isSelected: boolean;
  onClick: () => void;
}

function PersonnelCard({ salesperson, track, isSelected, onClick }: PersonnelCardProps) {
  const timeSinceLastSeen = salesperson.last_seen
    ? Math.floor((Date.now() - new Date(salesperson.last_seen).getTime()) / 1000 / 60)
    : null;

  return (
    <div
      onClick={onClick}
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white">
            <User className="w-5 h-5" />
          </div>
          {track && (
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
              track.is_moving ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium mb-1 truncate">{salesperson.name}</div>
          <div className="text-xs text-gray-600 mb-1">{salesperson.employee_code}</div>

          {timeSinceLastSeen !== null && (
            <div className="text-xs text-gray-500">
              {timeSinceLastSeen < 1 
                ? 'Şimdi' 
                : timeSinceLastSeen < 60 
                ? `${timeSinceLastSeen} dk önce` 
                : `${Math.floor(timeSinceLastSeen / 60)} saat önce`
              }
            </div>
          )}

          {salesperson.current_route_id && (
            <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
              <Navigation className="w-3 h-3" />
              <span>Rotada</span>
            </div>
          )}
        </div>

        {track?.speed && track.speed > 1 && (
          <div className="text-xs text-gray-600">
            {track.speed.toFixed(0)} km/h
          </div>
        )}
      </div>
    </div>
  );
}

