import { useState, useRef } from 'react';
import {
  ArrowLeft, MapPin, Plus, Search, Package, BarChart3,
  Edit2, Trash2, Check, X, Box, Grid, List, Filter, AlertCircle
} from 'lucide-react';

interface Location {
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  capacity: number;
  currentStock: number;
  status: 'empty' | 'partial' | 'full' | 'blocked';
  type: 'normal' | 'cold' | 'hazmat' | 'high-value';
}

interface LocationManagementProps {
  onBack: () => void;
}

export function LocationManagement({ onBack }: LocationManagementProps) {
  const [view, setView] = useState<'list' | 'grid' | 'create'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [newLocation, setNewLocation] = useState({ zone: 'A', aisle: '01', rack: '01', capacity: 100, type: 'normal' as const });

  // Mock data
  const [locations, setLocations] = useState<Location[]>([
    { code: 'A-01-01', zone: 'A', aisle: '01', rack: '01', capacity: 100, currentStock: 85, status: 'partial', type: 'normal' },
    { code: 'A-01-02', zone: 'A', aisle: '01', rack: '02', capacity: 100, currentStock: 100, status: 'full', type: 'normal' },
    { code: 'A-01-03', zone: 'A', aisle: '01', rack: '03', capacity: 100, currentStock: 0, status: 'empty', type: 'normal' },
    { code: 'A-01-04', zone: 'A', aisle: '01', rack: '04', capacity: 100, currentStock: 45, status: 'partial', type: 'normal' },
    { code: 'A-02-01', zone: 'A', aisle: '02', rack: '01', capacity: 150, currentStock: 120, status: 'partial', type: 'high-value' },
    { code: 'B-01-01', zone: 'B', aisle: '01', rack: '01', capacity: 80, currentStock: 0, status: 'blocked', type: 'normal' },
    { code: 'B-01-02', zone: 'B', aisle: '01', rack: '02', capacity: 80, currentStock: 60, status: 'partial', type: 'cold' },
    { code: 'C-01-01', zone: 'C', aisle: '01', rack: '01', capacity: 200, currentStock: 150, status: 'partial', type: 'hazmat' },
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'empty': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'partial': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'full': return 'bg-green-100 text-green-700 border-green-300';
      case 'blocked': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cold': return '❄️';
      case 'hazmat': return '⚠️';
      case 'high-value': return 'ğŸ’';
      default: return 'ğŸ“¦';
    }
  };

  const getOccupancyPercentage = (loc: Location) => {
    return Math.round((loc.currentStock / loc.capacity) * 100);
  };

  const filteredLocations = locations.filter(loc => {
    const matchesSearch = loc.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesZone = filterZone === 'all' || loc.zone === filterZone;
    const matchesStatus = filterStatus === 'all' || loc.status === filterStatus;
    return matchesSearch && matchesZone && matchesStatus;
  });

  const zones = ['all', ...Array.from(new Set(locations.map(l => l.zone)))];

  const handleCreateLocation = () => {
    const code = `${newLocation.zone}-${newLocation.aisle}-${newLocation.rack}`;
    const exists = locations.find(l => l.code === code);
    
    if (exists) {
      alert('Bu lokasyon kodu zaten mevcut!');
      return;
    }

    setLocations([
      ...locations,
      {
        code,
        ...newLocation,
        currentStock: 0,
        status: 'empty'
      }
    ]);

    setView('grid');
    setNewLocation({ zone: 'A', aisle: '01', rack: '01', capacity: 100, type: 'normal' });
  };

  const handleDeleteLocation = (code: string) => {
    if (confirm(`${code} lokasyonunu silmek istediğinize emin misiniz?`)) {
      setLocations(locations.filter(l => l.code !== code));
    }
  };

  // Create Location View
  if (view === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-4 sticky top-0 z-10 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('grid')} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Yeni Lokasyon</h1>
              <p className="text-xs text-indigo-100">New Location</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Lokasyon Bilgileri</h3>

            {/* Zone */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Bölge (Zone)</label>
              <select
                value={newLocation.zone}
                onChange={(e) => setNewLocation({ ...newLocation, zone: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                {['A', 'B', 'C', 'D', 'E', 'F'].map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>

            {/* Aisle */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Koridor (Aisle)</label>
              <input
                type="text"
                value={newLocation.aisle}
                onChange={(e) => setNewLocation({ ...newLocation, aisle: e.target.value.padStart(2, '0') })}
                placeholder="01"
                maxLength={2}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Rack */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Raf (Rack)</label>
              <input
                type="text"
                value={newLocation.rack}
                onChange={(e) => setNewLocation({ ...newLocation, rack: e.target.value.padStart(2, '0') })}
                placeholder="01"
                maxLength={2}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Preview */}
            <div className="mb-4 p-4 bg-indigo-50 rounded-xl border-2 border-indigo-200">
              <div className="text-xs text-gray-600 mb-1">Lokasyon Kodu:</div>
              <div className="text-2xl font-bold text-indigo-600 font-mono">
                {newLocation.zone}-{newLocation.aisle}-{newLocation.rack}
              </div>
            </div>

            {/* Capacity */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Kapasite</label>
              <input
                type="number"
                value={newLocation.capacity}
                onChange={(e) => setNewLocation({ ...newLocation, capacity: parseInt(e.target.value) || 0 })}
                placeholder="100"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tip</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'normal', label: 'ğŸ“¦ Normal', color: 'border-gray-300' },
                  { value: 'cold', label: '❄️ Soğuk', color: 'border-blue-300' },
                  { value: 'hazmat', label: '⚠️ Tehlikeli', color: 'border-red-300' },
                  { value: 'high-value', label: 'ğŸ’ Yüksek Değer', color: 'border-yellow-300' },
                ].map(type => (
                  <button
                    key={type.value}
                    onClick={() => setNewLocation({ ...newLocation, type: type.value as any })}
                    className={`px-4 py-3 border-2 rounded-xl font-medium text-sm transition-all ${
                      newLocation.type === type.value
                        ? `${type.color} bg-white shadow-md`
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setView('grid')}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl font-bold hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleCreateLocation}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Oluştur
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Raf/Konum Yönetimi</h1>
            <p className="text-xs text-indigo-100">Location Management</p>
          </div>
          <button
            onClick={() => setView('create')}
            className="p-2 hover:bg-white/10 rounded-lg"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-indigo-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lokasyon ara..."
            className="w-full pl-10 pr-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-indigo-200 focus:outline-none focus:bg-white/20"
          />
        </div>
      </div>

      {/* View Toggle & Filters */}
      <div className="p-4 bg-white border-b">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setView('grid')}
            className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
              view === 'grid'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <Grid className="w-4 h-4 inline mr-1" />
            Grid
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
              view === 'list'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <List className="w-4 h-4 inline mr-1" />
            Liste
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            {zones.map(z => (
              <option key={z} value={z}>{z === 'all' ? 'Tüm Bölgeler' : `Bölge ${z}`}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="empty">Boş</option>
            <option value="partial">Kısmi</option>
            <option value="full">Dolu</option>
            <option value="blocked">Bloklu</option>
          </select>
        </div>
      </div>

      {/* Statistics */}
      <div className="p-4 grid grid-cols-4 gap-2">
        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-indigo-600">{locations.length}</div>
          <div className="text-xs text-gray-600">Toplam</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-green-600">
            {locations.filter(l => l.status === 'empty').length}
          </div>
          <div className="text-xs text-gray-600">Boş</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-blue-600">
            {locations.filter(l => l.status === 'partial').length}
          </div>
          <div className="text-xs text-gray-600">Kısmi</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-600">
            {locations.filter(l => l.status === 'full').length}
          </div>
          <div className="text-xs text-gray-600">Dolu</div>
        </div>
      </div>

      {/* Grid View */}
      {view === 'grid' && (
        <div className="p-4 grid grid-cols-2 gap-3">
          {filteredLocations.map((loc) => (
            <div
              key={loc.code}
              className={`bg-white rounded-xl p-4 shadow-sm border-2 ${
                loc.status === 'blocked' ? 'border-red-300' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-lg font-bold text-gray-900 font-mono">{loc.code}</div>
                <div className="text-xl">{getTypeIcon(loc.type)}</div>
              </div>

              {/* Status Badge */}
              <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium mb-2 border ${getStatusColor(loc.status)}`}>
                {loc.status === 'empty' && 'Boş'}
                {loc.status === 'partial' && 'Kısmi Dolu'}
                {loc.status === 'full' && 'Dolu'}
                {loc.status === 'blocked' && 'Bloklu'}
              </div>

              {/* Occupancy Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Doluluk</span>
                  <span className="font-bold">{getOccupancyPercentage(loc)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      getOccupancyPercentage(loc) === 0 ? 'bg-gray-400' :
                      getOccupancyPercentage(loc) < 50 ? 'bg-green-500' :
                      getOccupancyPercentage(loc) < 90 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${getOccupancyPercentage(loc)}%` }}
                  />
                </div>
              </div>

              {/* Stock Info */}
              <div className="text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Stok:</span>
                  <span className="font-bold">{loc.currentStock} / {loc.capacity}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 py-2 bg-gray-100 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  <Edit2 className="w-3 h-3 inline mr-1" />
                  Düzenle
                </button>
                <button
                  onClick={() => handleDeleteLocation(loc.code)}
                  className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="p-4 space-y-2">
          {filteredLocations.map((loc) => (
            <div key={loc.code} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="text-xl">{getTypeIcon(loc.type)}</div>
                  <div>
                    <div className="font-bold text-gray-900 font-mono">{loc.code}</div>
                    <div className="text-xs text-gray-500">
                      Bölge {loc.zone} • Koridor {loc.aisle} • Raf {loc.rack}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(loc.status)}`}>
                  {loc.status === 'empty' && 'Boş'}
                  {loc.status === 'partial' && 'Kısmi'}
                  {loc.status === 'full' && 'Dolu'}
                  {loc.status === 'blocked' && 'Bloklu'}
                </div>
              </div>

              <div className="mb-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      getOccupancyPercentage(loc) === 0 ? 'bg-gray-400' :
                      getOccupancyPercentage(loc) < 50 ? 'bg-green-500' :
                      getOccupancyPercentage(loc) < 90 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${getOccupancyPercentage(loc)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Stok: {loc.currentStock} / {loc.capacity}</span>
                <span className="font-bold">{getOccupancyPercentage(loc)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-20"></div>
    </div>
  );
}







