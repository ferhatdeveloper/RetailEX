/**
 * RetailOS PWA Yardımcı Fonksiyonları
 * Progressive Web App özellikleri için yardımcı araçlar
 */

// PWA kurulu mu kontrol et
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Standalone modda çalışıyor mu?
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // iOS Safari standalone modu
  const isIOSStandalone = (window.navigator as any).standalone === true;
  
  return isStandalone || isIOSStandalone;
}

// PWA kurulumu mevcut mu?
export function canInstallPWA(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Zaten kuruluysa false döndür
  if (isPWAInstalled()) return false;
  
  // beforeinstallprompt event'i tetiklendiyse true
  return (window as any).deferredPrompt !== undefined;
}

// PWA kurulum isteğini tetikle
export async function promptPWAInstall(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  const deferredPrompt = (window as any).deferredPrompt;
  
  if (!deferredPrompt) {
    console.warn('[PWA] Install prompt not available');
    return false;
  }
  
  try {
    // Kurulum isteğini göster
    deferredPrompt.prompt();
    
    // Kullanıcının seçimini bekle
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log('[PWA] User choice:', outcome);
    
    // Prompt'u temizle
    (window as any).deferredPrompt = null;
    
    return outcome === 'accepted';
  } catch (error) {
    console.error('[PWA] Install prompt error:', error);
    return false;
  }
}

// Online durumunu kontrol et
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

// Service Worker durumunu kontrol et
export async function getServiceWorkerStatus(): Promise<{
  registered: boolean;
  active: boolean;
  version?: string;
}> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { registered: false, active: false };
  }
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    
    if (!registration) {
      return { registered: false, active: false };
    }
    
    return {
      registered: true,
      active: registration.active !== null,
      version: registration.active?.scriptURL
    };
  } catch (error) {
    console.error('[PWA] Service Worker status error:', error);
    return { registered: false, active: false };
  }
}

// Service Worker'ı güncelle
export async function updateServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    
    if (!registration) {
      console.warn('[PWA] No Service Worker registered');
      return false;
    }
    
    await registration.update();
    console.log('[PWA] Service Worker updated');
    return true;
  } catch (error) {
    console.error('[PWA] Service Worker update error:', error);
    return false;
  }
}

// Cache'i temizle
export async function clearCache(cacheName?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }
  
  try {
    if (cacheName) {
      // Belirli cache'i sil
      await caches.delete(cacheName);
      console.log('[PWA] Cache cleared:', cacheName);
    } else {
      // Tüm cache'leri sil
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[PWA] All caches cleared');
    }
    return true;
  } catch (error) {
    console.error('[PWA] Clear cache error:', error);
    return false;
  }
}

// Cache boyutunu hesapla
export async function getCacheSize(): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return 0;
  }
  
  try {
    const cacheNames = await caches.keys();
    let totalSize = 0;
    
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('[PWA] Get cache size error:', error);
    return 0;
  }
}

// Push notification izni iste
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  
  try {
    const permission = await Notification.requestPermission();
    console.log('[PWA] Notification permission:', permission);
    return permission;
  } catch (error) {
    console.error('[PWA] Notification permission error:', error);
    return 'denied';
  }
}

// Push notification gönder
export async function sendNotification(
  title: string,
  options?: NotificationOptions
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  
  if (Notification.permission !== 'granted') {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return false;
    }
  }
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    
    if (registration) {
      await registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        ...options
      });
    } else {
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        ...options
      });
    }
    
    return true;
  } catch (error) {
    console.error('[PWA] Send notification error:', error);
    return false;
  }
}

// Background Sync kaydet
export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  
  if (!('sync' in ServiceWorkerRegistration.prototype)) {
    console.warn('[PWA] Background Sync not supported');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as any).sync.register(tag);
    console.log('[PWA] Background Sync registered:', tag);
    return true;
  } catch (error) {
    console.error('[PWA] Background Sync error:', error);
    return false;
  }
}

// Depolama kotasını kontrol et
export async function checkStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
}> {
  if (typeof window === 'undefined' || !('storage' in navigator)) {
    return { usage: 0, quota: 0, percentage: 0 };
  }
  
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;
    
    return { usage, quota, percentage };
  } catch (error) {
    console.error('[PWA] Storage quota error:', error);
    return { usage: 0, quota: 0, percentage: 0 };
  }
}

// Kalıcı depolama iste
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !('storage' in navigator)) {
    return false;
  }
  
  if (!navigator.storage.persist) {
    console.warn('[PWA] Persistent storage not supported');
    return false;
  }
  
  try {
    const isPersisted = await navigator.storage.persisted();
    
    if (isPersisted) {
      console.log('[PWA] Storage already persisted');
      return true;
    }
    
    const result = await navigator.storage.persist();
    console.log('[PWA] Persistent storage request:', result);
    return result;
  } catch (error) {
    console.error('[PWA] Persistent storage error:', error);
    return false;
  }
}

// Format helpers
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// PWA durumunu al (tümü)
export async function getPWAStatus(): Promise<{
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
}> {
  const [serviceWorker, storage, cacheSize, persistent] = await Promise.all([
    getServiceWorkerStatus(),
    checkStorageQuota(),
    getCacheSize(),
    navigator.storage?.persisted() || Promise.resolve(false)
  ]);
  
  return {
    installed: isPWAInstalled(),
    canInstall: canInstallPWA(),
    online: isOnline(),
    serviceWorker,
    notifications: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    storage: { ...storage, persistent },
    cacheSize
  };
}

// Share API desteği kontrol et
export function canShare(): boolean {
  if (typeof window === 'undefined') return false;
  return 'share' in navigator;
}

// Web Share API kullan
export async function shareContent(data: ShareData): Promise<boolean> {
  if (!canShare()) {
    console.warn('[PWA] Web Share API not supported');
    return false;
  }
  
  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('[PWA] Share error:', error);
    }
    return false;
  }
}

export default {
  isPWAInstalled,
  canInstallPWA,
  promptPWAInstall,
  isOnline,
  getServiceWorkerStatus,
  updateServiceWorker,
  clearCache,
  getCacheSize,
  requestNotificationPermission,
  sendNotification,
  registerBackgroundSync,
  checkStorageQuota,
  requestPersistentStorage,
  formatBytes,
  getPWAStatus,
  canShare,
  shareContent
};

