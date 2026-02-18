// Advanced search and filtering for unlimited stores

import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  X,
  ChevronDown,
  MapPin,
  TrendingUp,
  Store as StoreIcon
} from 'lucide-react';
import { useSearchStores } from '../hooks/useInfiniteStores';
import { storeApiService, type SearchFilters } from '../../services/storeApiService';
import type { Store } from '../../services/storeApiService';

interface AdvancedStoreSearchProps {
  onSearch: (filters: SearchFilters) => void;
  onStoreSelect?: (store: Store) => void;
}

export function AdvancedStoreSearch({ onSearch, onStoreSelect }: AdvancedStoreSearchProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const regions = storeApiService.getRegions();
  
  // Calculate total stores dynamically
  const totalStores = regions.reduce((total, region) => {
    return total + (region.subRegions.length * 312);
  }, 0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Search results
  const { data: searchResults, isLoading: isSearching } = useSearchStores(
    debouncedQuery,
    filters,
    50
  );

  // Apply filters
  const handleApplyFilters = () => {
    onSearch({ ...filters, query });
  };

  // Clear filters
  const handleClearFilters = () => {
    setQuery('');
    setFilters({});
    onSearch({});
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || query.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Search Bar */}
      <div className="p-4">
        <div className="flex gap-2">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Mağaza kodu, adı, şehir veya müdür ara... (${totalStores.toLocaleString('tr-TR')} mağaza)`}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors ${
              hasActiveFilters 
                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-5 w-5" />
            <span>Filtreler</span>
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs">
                {Object.keys(filters).length + (query ? 1 : 0)}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Search Results Dropdown */}
        {debouncedQuery && searchResults && (
          <div className="absolute z-50 mt-2 w-full max-w-2xl bg-white rounded-lg shadow-lg border max-h-96 overflow-auto">
            {isSearching ? (
              <div className="p-4 text-center text-gray-500">
                Aranıyor...
              </div>
            ) : searchResults.data.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                Sonuç bulunamadı
              </div>
            ) : (
              <>
                <div className="p-3 border-b bg-gray-50 text-sm text-gray-600">
                  {searchResults.data.length} sonuç bulundu
                </div>
                {searchResults.data.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => {
                      onStoreSelect?.(store);
                      setQuery('');
                    }}
                    className="w-full p-3 hover:bg-blue-50 border-b last:border-b-0 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <StoreIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{store.name}</span>
                          <span className="text-xs text-gray-500 font-mono">{store.code}</span>
                        </div>
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span>{store.region} / {store.city}</span>
                          <span className="text-gray-400">•</span>
                          <span>{store.manager}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="border-t bg-gray-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Region Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bölge
              </label>
              <select
                value={filters.region || ''}
                onChange={(e) => setFilters({ ...filters, region: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Tümü</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sub Region Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Alt Bölge / Şehir
              </label>
              <select
                value={filters.subRegion || ''}
                onChange={(e) => setFilters({ ...filters, subRegion: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={!filters.region}
              >
                <option value="">Tümü</option>
                {filters.region && 
                  regions
                    .find(r => r.name === filters.region)
                    ?.subRegions.map((subRegion) => (
                      <option key={subRegion} value={subRegion}>
                        {subRegion}
                      </option>
                    ))
                }
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Durum
              </label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Tümü</option>
                <option value="active">Aktif</option>
                <option value="inactive">Kapalı</option>
                <option value="maintenance">Bakımda</option>
              </select>
            </div>

            {/* Revenue Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ciro Aralığı
              </label>
              <select
                value={filters.revenue}
                onChange={(e) => setFilters({ ...filters, revenue: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tümü</option>
                <option value="100k+">130,000,000 IQD üzeri</option>
                <option value="50k-100k">65,000,000 - 130,000,000 IQD</option>
                <option value="under50k">65,000,000 IQD altı</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              <span>Filtreleri Uygula</span>
            </button>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                <span>Filtreleri Temizle</span>
              </button>
            )}
            <div className="ml-auto text-sm text-gray-600">
              {hasActiveFilters ? (
                <span>Filtreler aktif</span>
              ) : (
                <span>{totalStores.toLocaleString('tr-TR')} mağaza içinde arama yapın</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
