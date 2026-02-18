// RetailOS - Service Worker Registration
// PWA kurulumu ve yönetimi

// Service Worker'ı kaydet
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

async function registerServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    console.log('[PWA] Service Worker registered successfully:', registration.scope);

    // Güncelleme kontrolü
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[PWA] New Service Worker found, installing...');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Yeni versiyon mevcut, kullanıcıya bildir
          showUpdateNotification();
        }
      });
    });

    // Periyodik güncelleme kontrolü (her 1 saatte bir)
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);

  } catch (error) {
    console.error('[PWA] Service Worker registration failed:', error);
  }
}

// Güncelleme bildirimi göster
function showUpdateNotification() {
  const updateBanner = document.createElement('div');
  updateBanner.id = 'pwa-update-banner';
  updateBanner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 90%;
      animation: slideUp 0.3s ease-out;
    ">
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          ğŸš€ Yeni Versiyon Mevcut!
        </div>
        <div style="font-size: 14px; opacity: 0.9;">
          RetailOS güncellemesi hazır. Yenilemek için tıklayın.
        </div>
      </div>
      <button id="pwa-update-btn" style="
        background: white;
        color: #2563eb;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      ">
        Yenile
      </button>
      <button id="pwa-dismiss-btn" style="
        background: transparent;
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
      ">
        Daha Sonra
      </button>
    </div>
  `;

  document.body.appendChild(updateBanner);

  // Yenileme butonu
  document.getElementById('pwa-update-btn').addEventListener('click', () => {
    window.location.reload();
  });

  // Kapat butonu
  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    updateBanner.remove();
  });
}

// PWA kurulum istemi
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('[PWA] Install prompt available');
  
  // Kurulum butonunu göster
  showInstallButton();
});

// Kurulum butonunu göster
function showInstallButton() {
  // Eğer zaten kuruluysa gösterme
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('[PWA] Already installed');
    return;
  }

  const installBanner = document.createElement('div');
  installBanner.id = 'pwa-install-banner';
  installBanner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 400px;
      animation: slideInRight 0.3s ease-out;
    ">
      <div style="
        width: 48px;
        height: 48px;
        background: white;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: bold;
        color: #2563eb;
      ">
        R
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          RetailOS'u Yükle
        </div>
        <div style="font-size: 13px; opacity: 0.9;">
          Hızlı erişim için ana ekrana ekleyin
        </div>
      </div>
      <button id="pwa-install-btn" style="
        background: white;
        color: #2563eb;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
        transition: transform 0.2s;
      ">
        Yükle
      </button>
      <button id="pwa-install-dismiss" style="
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 20px;
        padding: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      ">
        ✕
      </button>
    </div>
  `;

  // CSS animasyon ekle
  if (!document.getElementById('pwa-animations')) {
    const style = document.createElement('style');
    style.id = 'pwa-animations';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideUp {
        from {
          transform: translate(-50%, 100%);
          opacity: 0;
        }
        to {
          transform: translate(-50%, 0);
          opacity: 1;
        }
      }
      #pwa-install-btn:hover {
        transform: scale(1.05);
      }
      #pwa-install-dismiss:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(installBanner);

  // Yükle butonu
  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', outcome);
      deferredPrompt = null;
      installBanner.remove();
    }
  });

  // Kapat butonu
  document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
    installBanner.remove();
  });

  // 15 saniye sonra otomatik kapat
  setTimeout(() => {
    if (document.getElementById('pwa-install-banner')) {
      installBanner.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => installBanner.remove(), 300);
    }
  }, 15000);
}

// Kurulum tamamlandığında
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  deferredPrompt = null;
  
  // Teşekkür mesajı göster
  showInstalledNotification();
});

// Kurulum tamamlandı bildirimi
function showInstalledNotification() {
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      animation: slideInRight 0.3s ease-out;
    ">
      <div style="font-weight: 600; margin-bottom: 4px;">
        ✅ Kurulum Tamamlandı!
      </div>
      <div style="font-size: 14px; opacity: 0.9;">
        RetailOS artık ana ekranınızda
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideInRight 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Çevrimdışı durumu takip et
window.addEventListener('online', () => {
  console.log('[PWA] Back online');
  showConnectionStatus(true);
  
  // Background sync tetikle
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.sync.register('sync-sales');
    });
  }
});

window.addEventListener('offline', () => {
  console.log('[PWA] Gone offline');
  showConnectionStatus(false);
});

// Bağlantı durumu bildirimi
function showConnectionStatus(isOnline) {
  const existingStatus = document.getElementById('pwa-connection-status');
  if (existingStatus) {
    existingStatus.remove();
  }

  const statusBar = document.createElement('div');
  statusBar.id = 'pwa-connection-status';
  statusBar.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: ${isOnline ? '#10b981' : '#ef4444'};
      color: white;
      padding: 12px;
      text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      animation: slideDown 0.3s ease-out;
    ">
      ${isOnline ? '✅ İnternet bağlantısı yeniden kuruldu' : '⚠️ Çevrimdışı moddasınız - Veriler yerel olarak kaydediliyor'}
    </div>
  `;

  // Animasyon ekle
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
      }
      to {
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(statusBar);

  setTimeout(() => {
    statusBar.style.animation = 'slideDown 0.3s ease-out reverse';
    setTimeout(() => statusBar.remove(), 300);
  }, 3000);
}

// Standalone mod kontrolü
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('[PWA] Running in standalone mode');
  document.documentElement.classList.add('pwa-standalone');
}

// iOS Safari için standalone mod kontrolü
if (window.navigator.standalone === true) {
  console.log('[PWA] Running in iOS standalone mode');
  document.documentElement.classList.add('pwa-standalone', 'pwa-ios');
}

console.log('[PWA] Registration script loaded');

