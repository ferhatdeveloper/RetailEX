import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { offlineQueue, QueuedTransaction } from '../utils/offlineQueue';

export function OfflineQueueIndicator() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update queue status
  useEffect(() => {
    const updateQueue = () => {
      setQueueSize(offlineQueue.getSize());
      setQueue(offlineQueue.getQueue());
    };

    updateQueue();
    const interval = setInterval(updateQueue, 2000);

    // Subscribe to sync events
    const unsubscribe = offlineQueue.onSync((status, updatedQueue) => {
      setIsSyncing(status === 'started');
      setQueue(updatedQueue);
      setQueueSize(updatedQueue.length);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleManualSync = () => {
    offlineQueue.syncQueue();
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: QueuedTransaction['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'syncing': return 'bg-blue-500 animate-pulse';
      case 'failed': return 'bg-red-500';
      case 'completed': return 'bg-green-500';
    }
  };

  const getStatusText = (status: QueuedTransaction['status']) => {
    switch (status) {
      case 'pending': return t('pending') || 'Bekliyor';
      case 'syncing': return t('syncing') || 'Senkronize Ediliyor';
      case 'failed': return t('failed') || 'Başarısız';
      case 'completed': return t('completed') || 'Tamamlandı';
    }
  };

  if (isOnline && queueSize === 0) {
    return null; // Hide when online and no queued items
  }

  return (
    <>
      <button
        onClick={() => setShowQueueModal(true)}
        className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all ${
          theme === 'dark'
            ? 'bg-gray-800 hover:bg-gray-700 text-white'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
        }`}
      >
        {isOnline ? (
          <Cloud className="w-4 h-4 text-green-500" />
        ) : (
          <CloudOff className="w-4 h-4 text-orange-500" />
        )}
        
        <span className="text-sm">
          {isOnline ? t('online') || 'Çevrimiçi' : t('offline') || 'Çevrimdışı'}
        </span>

        {queueSize > 0 && (
          <Badge variant="destructive" className="ml-1">
            {queueSize}
          </Badge>
        )}

        {isSyncing && (
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
        )}
      </button>

      {/* Queue Modal */}
      <Dialog open={showQueueModal} onOpenChange={setShowQueueModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isOnline ? (
                <Cloud className="w-5 h-5 text-green-500" />
              ) : (
                <CloudOff className="w-5 h-5 text-orange-500" />
              )}
              {t('offlineQueue') || 'Çevrimdışı Kuyruk'}
              {queueSize > 0 && (
                <Badge variant="secondary">{queueSize} {t('items') || 'öğe'}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {isOnline 
                ? t('queueWillBeSynced') || 'Bekleyen işlemler otomatik olarak senkronize edilecek'
                : t('transactionsWillBeSaved') || 'İşlemleriniz bağlantı sağlandığında gönderilecek'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status */}
            <div className={`p-4 rounded-lg ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    isOnline ? 'bg-green-500' : 'bg-orange-500'
                  }`} />
                  <span className="text-sm font-medium">
                    {isOnline 
                      ? t('connectionRestored') || 'Bağlantı Sağlandı'
                      : t('workingOffline') || 'Çevrimdışı Çalışılıyor'
                    }
                  </span>
                </div>

                {isOnline && queueSize > 0 && (
                  <Button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {t('syncNow') || 'Şimdi Senkronize Et'}
                  </Button>
                )}
              </div>
            </div>

            {/* Queue Items */}
            {queue.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>{t('noQueuedItems') || 'Bekleyen işlem yok'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map(transaction => (
                  <div
                    key={transaction.id}
                    className={`p-3 rounded-lg border ${
                      theme === 'dark'
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(transaction.status)}`} />
                        <span className="font-medium capitalize">
                          {transaction.type.replace('_', ' ')}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {getStatusText(transaction.status)}
                      </Badge>
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div>ID: {transaction.id}</div>
                      <div>{formatTimestamp(transaction.timestamp)}</div>
                      {transaction.retryCount > 0 && (
                        <div className="text-orange-500">
                          {t('retries') || 'Yeniden Deneme'}: {transaction.retryCount}/3
                        </div>
                      )}
                      {transaction.error && (
                        <div className="text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {transaction.error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            {queueSize > 0 && (
              <Button
                onClick={() => offlineQueue.clearCompleted()}
                variant="outline"
                size="sm"
              >
                {t('clearCompleted') || 'Tamamlananları Temizle'}
              </Button>
            )}
            <Button onClick={() => setShowQueueModal(false)} variant="outline">
              {t('close') || 'Kapat'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
