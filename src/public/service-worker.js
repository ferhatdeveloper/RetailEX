// RetailOS Service Worker - v1.0.0
const CACHE_NAME = 'retailos-v1.0.0';
const RUNTIME_CACHE = 'retailos-runtime-v1.0.0';
const IMAGE_CACHE = 'retailos-images-v1.0.0';

// Önbelleğe alınacak statik dosyalar
const STATIC_ASSETS = [
  '/',
  '/App.tsx',
  '/styles/globals.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// Cache-First stratejisi için dosya türleri
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  /\.(?:woff|woff2|ttf|eot)$/
];

// Network-First stratejisi için dosya türleri
const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /\.(?:json)$/
];

// Service Worker kurulum aşaması
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Service Worker aktivasyon aşaması
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME && 
                     cacheName !== RUNTIME_CACHE && 
                     cacheName !== IMAGE_CACHE;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch olaylarını dinle
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Sadece aynı origin için önbellekleme
  if (url.origin !== location.origin) {
    return;
  }

  // Cache-First stratejisi (resimler, fontlar)
  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Network-First stratejisi (API, JSON)
  if (NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // Stale-While-Revalidate stratejisi (diğer dosyalar)
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

// Cache-First stratejisi
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-First fetch failed:', error);
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Network-First stratejisi
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network-First falling back to cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline - No cached data available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Stale-While-Revalidate stratejisi
async function staleWhileRevalidate(request, cacheName) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      const cache = caches.open(cacheName);
      cache.then(c => c.put(request, networkResponse.clone()));
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Background Sync için
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-sales') {
    event.waitUntil(syncSalesData());
  }
});

// Push notification için
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  const options = {
    body: event.data ? event.data.text() : 'Yeni bildirim',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Görüntüle',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Kapat',
        icon: '/icons/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('RetailOS', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Offline satış verilerini senkronize et
async function syncSalesData() {
  try {
    const db = await openIndexedDB();
    const pendingSales = await getPendingSales(db);
    
    for (const sale of pendingSales) {
      try {
        const response = await fetch('/api/v1/sales/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sale)
        });
        
        if (response.ok) {
          await deletePendingSale(db, sale.id);
          console.log('[SW] Sale synced:', sale.id);
        }
      } catch (error) {
        console.error('[SW] Sync failed for sale:', sale.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync sales data failed:', error);
  }
}

// IndexedDB yardımcı fonksiyonları
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RetailOS', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingSales')) {
        db.createObjectStore('pendingSales', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getPendingSales(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingSales'], 'readonly');
    const store = transaction.objectStore('pendingSales');
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingSale(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingSales'], 'readwrite');
    const store = transaction.objectStore('pendingSales');
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

console.log('[SW] Service Worker loaded successfully');

