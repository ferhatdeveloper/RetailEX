// Virtual scrolling store list with infinite loading

import { useEffect, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { 
  Store, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  MapPin,
  User,
  Phone,
  Calendar
} from 'lucide-react';
import { useInfiniteStores } from '../../hooks/useInfiniteStores';
import type { Store as StoreType, SearchFilters } from '../../services/storeApiService';

interface VirtualStoreListProps {
  filters?: SearchFilters;
  onStoreSelect?: (storeId: string) => void;
}

export function VirtualStoreList({ filters, onStoreSelect }: VirtualStoreListProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError
  } = useInfiniteStores(filters, 50);

  const allStores = data?.pages.flatMap(page => page.data) ?? [];
  const totalCount = data?.pages[0]?.pagination.total ?? 0;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite] mb-4"></div>
          <p className="text-gray-600">Mağazalar yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-red-600">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <p>Veri yüklenirken hata oluştu</p>
        </div>
      </div>
    );
  }

  if (allStores.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-gray-500">
          <Store className="h-12 w-12 mx-auto mb-4" />
          <p>Mağaza bulunamadı</p>
          <p className="text-sm mt-2">Filtreleri değiştirerek tekrar deneyin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-blue-600" />
          <span className="font-semibold">
            Toplam {totalCount.toLocaleString('tr-TR')} Mağaza
          </span>
        </div>
        <div className="text-sm text-gray-600">
          Yüklenen: {allStores.length.toLocaleString('tr-TR')}
        </div>
      </div>

      {/* Virtual List */}
      <div className="flex-1">
        <Virtuoso
          data={allStores}
          endReached={loadMore}
          itemContent={(index, store) => (
            <StoreListItem 
              store={store} 
              onSelect={onStoreSelect}
            />
          )}
          components={{
            Footer: () => {
              if (isFetchingNextPage) {
                return (
                  <div className="p-4 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                    <p className="text-sm text-gray-600 mt-2">Daha fazla yükleniyor...</p>
                  </div>
                );
              }
              if (!hasNextPage) {
                return (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Tüm mağazalar yüklendi
                  </div>
                );
              }
              return null;
            }
          }}
        />
      </div>
    </div>
  );
}

interface StoreListItemProps {
  store: StoreType;
  onSelect?: (storeId: string) => void;
}

function StoreListItem({ store, onSelect }: StoreListItemProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Aktif';
      case 'inactive': return 'Kapalı';
      case 'maintenance': return 'Bakımda';
      default: return status;
    }
  };

  return (
    <div
      className="border-b border-gray-200 p-4 hover:bg-blue-50 cursor-pointer transition-colors"
      onClick={() => onSelect?.(store.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Store Name and Code */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-blue-600" />
              <span className="font-semibold">{store.name}</span>
            </div>
            <span className="text-sm text-gray-500 font-mono">{store.code}</span>
            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(store.status)}`}>
              {getStatusLabel(store.status)}
            </span>
          </div>

          {/* Store Info */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="h-4 w-4" />
              <span>{store.region} / {store.city}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4" />
              <span>{store.manager}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4" />
              <span>{store.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{store.size} m² • {store.employeeCount} personel</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

