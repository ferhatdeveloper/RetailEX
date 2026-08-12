import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Download, CheckCircle2, AlertCircle, HardDrive, Bell, RefreshCw } from 'lucide-react';
import { getPWAStatus, updateServiceWorker, formatBytes, promptPWAInstall } from '../../utils/pwaHelpers';

interface PWAStatusData {
  installed: boolean;
  canInstall: boolean;
  online: boolean;
  serviceWorker: {
    registered: boolean;
    active: boolean;
    version?: string;
  };
  notifications: NotificationPermission;
  storage: {
    usage: number;
    quota: number;
    percentage: number;
    persistent: boolean;
  };
  cacheSize: number;
}

export function PWAStatus() {
  const [status, setStatus] = useState<PWAStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await getPWAStatus();
      setStatus(data);
    } catch (error) {
      console.error('PWA status error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();

    // Online/offline durumunu dinle
    const handleOnline = () => loadStatus();
    const handleOffline = () => loadStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updateServiceWorker();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Update error:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleInstall = async () => {
    const installed = await promptPWAInstall();
    if (installed) {
      setTimeout(() => loadStatus(), 1000);
    }
  };

  if (loading || !status) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2 animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-48 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              status.installed ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              {status.installed ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <Download className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                PWA Durumu
              </h3>
              <p className="text-sm text-gray-500">
                {status.installed ? 'Kurulum tamamlandı' : 'Uygulama olarak yükle'}
              </p>
            </div>
          </div>

          <button
            onClick={loadStatus}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Yenile"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Status Grid */}
      <div className="p-4 space-y-3">
        {/* Online Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status.online ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm text-gray-700">Bağlantı</span>
          </div>
          <span className={`text-sm font-medium ${
            status.online ? 'text-green-600' : 'text-red-600'
          }`}>
            {status.online ? 'Çevrimiçi' : 'Çevrimdışı'}
          </span>
        </div>

        {/* Service Worker */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status.serviceWorker.active ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-600" />
            )}
            <span className="text-sm text-gray-700">Service Worker</span>
          </div>
          <span className={`text-sm font-medium ${
            status.serviceWorker.active ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {status.serviceWorker.active ? 'Aktif' : 'Kayıtlı Değil'}
          </span>
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-700">Bildirimler</span>
          </div>
          <span className={`text-sm font-medium ${
            status.notifications === 'granted' ? 'text-green-600' :
            status.notifications === 'denied' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {status.notifications === 'granted' ? 'Aktif' :
             status.notifications === 'denied' ? 'Reddedildi' : 'Bekliyor'}
          </span>
        </div>

        {/* Storage */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-gray-700">Depolama</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {formatBytes(status.storage.usage)} / {formatBytes(status.storage.quota)}
          </span>
        </div>

        {/* Storage Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Kullanım</span>
            <span>{status.storage.percentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                status.storage.percentage > 80 ? 'bg-red-500' :
                status.storage.percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(status.storage.percentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Cache Size */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Cache Boyutu</span>
          <span className="text-sm font-medium text-gray-900">
            {formatBytes(status.cacheSize)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        {!status.installed && status.canInstall && (
          <button
            onClick={handleInstall}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2.5 px-4 rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Uygulamayı Yükle
          </button>
        )}

        {status.serviceWorker.registered && (
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="w-full bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
            {updating ? 'Güncelleniyor...' : 'Güncelleme Kontrol Et'}
          </button>
        )}
      </div>

      {/* Info */}
      {status.installed && (
        <div className="bg-green-50 border-t border-green-200 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-green-700">
              RetailOS başarıyla yüklendi! Artık çevrimdışı çalışabilir ve ana ekranınızdan hızlıca erişebilirsiniz.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

