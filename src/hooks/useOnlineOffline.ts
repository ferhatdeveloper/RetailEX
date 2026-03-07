// Online/Offline Detection Hook

import { useState, useEffect } from 'react';
import { storeSyncService, type SyncStatus } from '../services/storeSyncService';

export function useOnlineOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(storeSyncService.getSyncStatus());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🟢 Connection restored');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('🔴 Connection lost');
    };

    // Subscribe to sync status changes
    const unsubscribe = storeSyncService.subscribe((status) => {
      setSyncStatus(status);
    });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return {
    isOnline,
    syncStatus,
    forceSync: () => storeSyncService.syncNow()
  };
}



