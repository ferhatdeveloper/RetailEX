// Store Selector & Sync Status Component

import { useState, useEffect } from 'react';
import { 
  Store, 
  Check, 
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Activity
} from 'lucide-react';
import { storeSyncService, type SelectedStore } from '../../services/storeSyncService';
import { useOnlineOffline } from '../hooks/useOnlineOffline';
import { useInfiniteStores } from '../hooks/useInfiniteStores';

export function StoreSelector() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(
    storeSyncService.getSelectedStore()
  );
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  const { isOnline, syncStatus, forceSync } = useOnlineOffline();
  const { data: storesData } = useInfiniteStores({}, 50);
  const stores = storesData?.pages[0]?.data || [];

  const handleStoreSelect = async (storeId: string) => {
    try {
      const store = await storeSyncService.selectStore(storeId);
      setSelectedStore(store);
      setShowDropdown(false);
      console.log('✅ Store selected:', store.name);
    } catch (error) {
      console.error('Failed to select store:', error);
    }
  };

  const handleSync = async () => {
    try {
      await forceSync();
      console.log('✅ Manual sync completed');
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const handleDownloadData = async () => {
    if (!selectedStore) return;
    
    try {
      await storeSyncService.downloadStoreData(selectedStore.id);
      console.log('✅ Store data downloaded');
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Update selected store when sync status changes
  useEffect(() => {
    const current = storeSyncService.getSelectedStore();
    setSelectedStore(current);
  }, [syncStatus]);

  const getSyncStatusColor = () => {
    if (!isOnline) return 'text-red-600';
    if (syncStatus.isSyncing) return 'text-blue-600';
    if (syncStatus.pendingCount > 0) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getSyncStatusIcon = () => {
    if (!isOnline) return WifiOff;
    if (syncStatus.isSyncing) return RefreshCw;
    if (syncStatus.pendingCount > 0) return AlertCircle;
    return CheckCircle;
  };

  const getSyncStatusText = () => {
    if (!isOnline) return 'Çevrimdışı';
    if (syncStatus.isSyncing) return 'Senkronize ediliyor...';
    if (syncStatus.pendingCount > 0) return `${syncStatus.pendingCount} bekleyen işlem`;
    return 'Senkronize';
  };

  const StatusIcon = getSyncStatusIcon();

  return (
    <div className="relative">
      {/* Store Selector Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Store className="h-5 w-5 text-blue-600" />
        <div className="flex-1 text-left">
          {selectedStore ? (
            <>
              <div className="font-medium text-gray-900">{selectedStore.name}</div>
              <div className="text-xs text-gray-600">{selectedStore.code}</div>
            </>
          ) : (
            <div className="text-gray-600">Mağaza Seç</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sync Status Indicator */}
          <div className={`flex items-center gap-1 ${getSyncStatusColor()}`}>
            <StatusIcon className={`h-4 w-4 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-600 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
          {/* Sync Status Header */}
          <div className={`p-3 border-b ${isOnline ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                  {getSyncStatusText()}
                </span>
              </div>
              <button
                onClick={() => setShowSyncDetails(!showSyncDetails)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {showSyncDetails ? 'Gizle' : 'Detay'}
              </button>
            </div>

            {/* Sync Details */}
            {showSyncDetails && (
              <div className="mt-2 pt-2 border-t space-y-1 text-xs">
                <div className="flex items-center justify-between text-gray-700">
                  <span>Bekleyen işlem:</span>
                  <span className="font-medium">{syncStatus.pendingCount}</span>
                </div>
                <div className="flex items-center justify-between text-gray-700">
                  <span>Başarısız işlem:</span>
                  <span className="font-medium text-red-600">{syncStatus.failedCount}</span>
                </div>
                {syncStatus.lastSync && (
                  <div className="flex items-center justify-between text-gray-700">
                    <span>Son senkronizasyon:</span>
                    <span className="font-medium">{new Date(syncStatus.lastSync).toLocaleTimeString('tr-TR')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Store List */}
          <div className="max-h-64 overflow-auto">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleStoreSelect(store.id)}
                className={`w-full p-3 hover:bg-blue-50 border-b last:border-b-0 text-left transition-colors ${
                  selectedStore?.id === store.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{store.name}</div>
                    <div className="text-sm text-gray-600">{store.code} • {store.city}</div>
                  </div>
                  {selectedStore?.id === store.id && (
                    <Check className="h-5 w-5 text-blue-600" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="p-3 border-t bg-gray-50 space-y-2">
            <button
              onClick={handleSync}
              disabled={!isOnline || syncStatus.isSyncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span>Şimdi Senkronize Et</span>
            </button>

            {selectedStore && (
              <button
                onClick={handleDownloadData}
                disabled={!isOnline}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Offline Veri İndir</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact Sync Status Indicator (for header)
 */
export function SyncStatusIndicator() {
  const { isOnline, syncStatus } = useOnlineOffline();

  const getStatusColor = () => {
    if (!isOnline) return 'bg-red-500';
    if (syncStatus.isSyncing) return 'bg-blue-500';
    if (syncStatus.pendingCount > 0) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${syncStatus.isSyncing ? 'animate-pulse' : ''}`}></div>
      <span className="text-xs text-gray-700">
        {isOnline ? (
          syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} bekliyor` : 'Çevrimiçi'
        ) : (
          'Çevrimdışı'
        )}
      </span>
    </div>
  );
}

/**
 * Detailed Sync Status Panel
 */
export function SyncStatusPanel() {
  const { isOnline, syncStatus, forceSync } = useOnlineOffline();
  const [syncQueue, setSyncQueue] = useState(storeSyncService.getSyncQueue());

  useEffect(() => {
    const interval = setInterval(() => {
      setSyncQueue(storeSyncService.getSyncQueue());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Senkronizasyon Durumu
        </h3>
      </div>

      {/* Status Cards */}
      <div className="p-4 grid grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            <span className="text-sm text-gray-600">Bağlantı</span>
          </div>
          <div className={`text-xl font-bold ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
            {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-gray-600">Bekleyen</span>
          </div>
          <div className="text-xl font-bold text-yellow-600">
            {syncStatus.pendingCount}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-gray-600">Başarısız</span>
          </div>
          <div className="text-xl font-bold text-red-600">
            {syncStatus.failedCount}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-gray-600">Son Sync</span>
          </div>
          <div className="text-sm font-medium text-gray-900">
            {syncStatus.lastSync 
              ? new Date(syncStatus.lastSync).toLocaleTimeString('tr-TR')
              : 'Yok'}
          </div>
        </div>
      </div>

      {/* Sync Queue */}
      {syncQueue.length > 0 && (
        <div className="p-4 border-t">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">Senkronizasyon Kuyruğu</h4>
            <button
              onClick={() => forceSync()}
              disabled={!isOnline || syncStatus.isSyncing}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {syncStatus.isSyncing ? 'Senkronize ediliyor...' : 'Şimdi Sync Et'}
            </button>
          </div>

          <div className="max-h-48 overflow-auto space-y-2">
            {syncQueue.map((op) => (
              <div key={op.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  op.status === 'completed' ? 'bg-green-500' :
                  op.status === 'syncing' ? 'bg-blue-500 animate-pulse' :
                  op.status === 'failed' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {op.type} - {op.entity}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(op.timestamp).toLocaleTimeString('tr-TR')}
                  </div>
                </div>
                {op.retryCount > 0 && (
                  <span className="text-xs text-red-600">
                    {op.retryCount} tekrar
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

