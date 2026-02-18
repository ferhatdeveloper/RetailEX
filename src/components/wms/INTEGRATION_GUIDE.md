# ğŸ”Œ ExRetailOS WMS Entegrasyon Kılavuzu

## ğŸ“‹ Hızlı Başlangıç

Bu kılavuz, WMS modülünü mevcut ExRetailOS sisteminize nasıl entegre edeceğinizi adım adım anlatmaktadır.

## ğŸ¯ Senaryo 1: İlk Yükleme Sayfası Olarak Kullanım

### App.tsx'i Güncelleyin

```tsx
// App.tsx
import { useState, useEffect } from 'react';
import WarehouseManagement from './warehouse-management';
import { useTheme } from './contexts/ThemeContext';
import { useLanguage } from './contexts/LanguageContext';

export default function App() {
  const { darkMode } = useTheme();
  const { currentLanguage } = useLanguage();

  return (
    <WarehouseManagement 
      darkMode={darkMode}
      language={currentLanguage as 'tr' | 'en' | 'ar'}
      onLogout={() => {
        // Logout işlemleri
        localStorage.removeItem('exretail_user');
        window.location.reload();
      }}
    />
  );
}
```

## ğŸ¯ Senaryo 2: Modül Olarak Entegrasyon

### ManagementModule.tsx'e Ekleyin

```tsx
// ManagementModule.tsx
import { lazy, Suspense } from 'react';

// Lazy load WMS
const WarehouseManagement = lazy(() => import('./warehouse-management'));

export function ManagementModule({ darkMode, onLogout }: ManagementModuleProps) {
  const [activeModule, setActiveModule] = useState<string>('pos');

  const renderModule = () => {
    switch (activeModule) {
      case 'warehouse':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <WarehouseManagement 
              darkMode={darkMode}
              language="tr"
              onLogout={onLogout}
            />
          </Suspense>
        );
      
      case 'pos':
        return <POSModule />;
      
      // Diğer modüller...
      
      default:
        return <POSModule />;
    }
  };

  return (
    <div className="management-module">
      {/* Module Selector */}
      <div className="module-selector">
        <button onClick={() => setActiveModule('pos')}>
          POS
        </button>
        <button onClick={() => setActiveModule('warehouse')}>
          Depo Yönetimi
        </button>
        {/* Diğer modül butonları */}
      </div>

      {/* Active Module */}
      {renderModule()}
    </div>
  );
}
```

## ğŸ¯ Senaryo 3: Sidebar Menüsüne Ekleme

### MainLayout.tsx'e Ekleyin

```tsx
// MainLayout.tsx
import { Warehouse } from 'lucide-react';

const sidebarMenuItems = [
  {
    id: 'pos',
    icon: <ShoppingCart />,
    label: 'Satış',
    path: '/pos'
  },
  {
    id: 'warehouse',
    icon: <Warehouse />,
    label: 'Depo Yönetimi',
    path: '/warehouse'
  },
  {
    id: 'inventory',
    icon: <Package />,
    label: 'Stok',
    path: '/inventory'
  },
  // ... diğer menüler
];

// Routing
const renderPage = () => {
  switch (currentPage) {
    case '/warehouse':
      return (
        <WarehouseManagement 
          darkMode={darkMode}
          onLogout={handleLogout}
        />
      );
    
    case '/pos':
      return <POSModule />;
    
    // ... diğer sayfalar
  }
};
```

## ğŸ” Authentication Entegrasyonu

WMS modülü otomatik olarak mevcut authentication sistemini kullanır:

```tsx
// index.tsx (WMS) - Otomatik kontrol
const checkAuthentication = async () => {
  const user = localStorage.getItem('exretail_user');
  const firmaId = localStorage.getItem('exretail_selected_firma_id');
  
  if (user && firmaId) {
    setIsAuthenticated(true);
  } else {
    setIsAuthenticated(false);
  }
};
```

### Eğer farklı bir auth sistemi kullanıyorsanız:

```tsx
// warehouse-management/index.tsx dosyasını düzenleyin:

// ÖNCE:
const user = localStorage.getItem('exretail_user');
const firmaId = localStorage.getItem('exretail_selected_firma_id');

// SONRA: (Kendi auth sisteminiz)
const user = yourAuthSystem.getCurrentUser();
const firmaId = yourAuthSystem.getSelectedCompany();
```

## ğŸ“Š Backend Entegrasyonu

### Supabase Backend Kullanımı

```tsx
// utils/api.ts oluşturun
import { projectId, publicAnonKey } from './utils/supabase/info';

export const wmsAPI = {
  async getDashboardStats() {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/wms/dashboard`,
      {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      }
    );
    return response.json();
  },

  async getReceivings() {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/wms/receiving`,
      {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      }
    );
    return response.json();
  },

  async createReceiving(data: any) {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0/wms/receiving`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );
    return response.json();
  },
};
```

### Backend Routes Oluşturma

```tsx
// supabase/functions/server/index.tsx
import { Hono } from 'npm:hono';

const app = new Hono();

// WMS Routes
app.get('/make-server-eae94dc0/wms/dashboard', async (c) => {
  // Dashboard stats logic
  return c.json({
    totalWarehouses: 5,
    activeWarehouses: 4,
    totalProducts: 1247,
    // ... diğer stats
  });
});

app.get('/make-server-eae94dc0/wms/receiving', async (c) => {
  // Mal kabul kayıtlarını getir
  const receivings = await kvStore.getByPrefix('receiving_');
  return c.json({ receivings });
});

app.post('/make-server-eae94dc0/wms/receiving', async (c) => {
  const data = await c.req.json();
  
  // Yeni mal kabul kaydı oluştur
  const id = `receiving_${Date.now()}`;
  await kvStore.set(id, data);
  
  return c.json({ success: true, id });
});

// ... diğer routes
```

## ğŸ¨ Theme Entegrasyonu

WMS modülü otomatik olarak `darkMode` prop'unu kullanır:

```tsx
// Eğer ThemeContext kullanıyorsanız:
import { useTheme } from './contexts/ThemeContext';

function App() {
  const { darkMode } = useTheme();
  
  return (
    <WarehouseManagement 
      darkMode={darkMode}
      // ... diğer props
    />
  );
}

// Eğer manuel state kullanıyorsanız:
function App() {
  const [darkMode, setDarkMode] = useState(false);
  
  return (
    <WarehouseManagement 
      darkMode={darkMode}
      // ... diğer props
    />
  );
}
```

## ğŸŒ Language Entegrasyonu

```tsx
// Eğer LanguageContext kullanıyorsanız:
import { useLanguage } from './contexts/LanguageContext';

function App() {
  const { currentLanguage } = useLanguage();
  
  return (
    <WarehouseManagement 
      language={currentLanguage as 'tr' | 'en' | 'ar'}
      // ... diğer props
    />
  );
}
```

## ğŸ“± Responsive Menü Entegrasyonu

### Mobile Menu'ye Ekleme

```tsx
// Mobile hamburger menüsü
const mobileMenuItems = [
  {
    icon: <ShoppingCart />,
    label: 'Satış',
    onClick: () => navigate('/pos')
  },
  {
    icon: <Warehouse />,
    label: 'Depo',
    onClick: () => navigate('/warehouse'),
    badge: '5' // Kritik uyarı sayısı
  },
  // ... diğer menüler
];
```

## ğŸ”” Notification Entegrasyonu

WMS'den gelen uyarıları ana sisteme entegre edin:

```tsx
// App.tsx
import { toast } from 'sonner@2.0.3';

// WMS'den uyarı geldiğinde
useEffect(() => {
  // WMS kritik uyarılarını dinle
  const checkWMSAlerts = async () => {
    const alerts = await wmsAPI.getCriticalAlerts();
    
    if (alerts.length > 0) {
      toast.error(`${alerts.length} kritik depo uyarısı!`, {
        action: {
          label: 'Görüntüle',
          onClick: () => navigate('/warehouse')
        }
      });
    }
  };

  const interval = setInterval(checkWMSAlerts, 60000); // Her dakika kontrol
  return () => clearInterval(interval);
}, []);
```

## ğŸ“Š Dashboard Widget Entegrasyonu

Ana dashboard'a WMS widget'ları ekleyin:

```tsx
// Dashboard.tsx
import { Warehouse, AlertCircle, Package } from 'lucide-react';

function Dashboard() {
  const [wmsStats, setWMSStats] = useState(null);

  useEffect(() => {
    // WMS stats yükle
    wmsAPI.getDashboardStats().then(setWMSStats);
  }, []);

  return (
    <div className="dashboard">
      {/* Diğer widgets */}
      
      {/* WMS Widget */}
      <div className="widget wms-widget">
        <div className="widget-header">
          <Warehouse />
          <h3>Depo Durumu</h3>
        </div>
        <div className="widget-body">
          <div className="stat">
            <span>Toplam Stok</span>
            <strong>{formatCurrency(wmsStats?.totalStockValue)}</strong>
          </div>
          <div className="stat">
            <span>Kritik Uyarı</span>
            <strong className="text-red-600">
              {wmsStats?.alerts.critical}
            </strong>
          </div>
          <button onClick={() => navigate('/warehouse')}>
            Detay →
          </button>
        </div>
      </div>
    </div>
  );
}
```

## ğŸš€ Production Build

### Vite Configuration

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // WMS'i ayrı chunk'a ayır
          'warehouse': [
            './warehouse-management/index.tsx',
            './warehouse-management/components/Dashboard.tsx'
          ]
        }
      }
    }
  }
});
```

## ğŸ§ª Test Edebilirsiniz

### Hızlı Test

```tsx
// test.tsx - Hızlı test için
import WarehouseManagement from './warehouse-management';

export default function TestWMS() {
  return (
    <WarehouseManagement 
      darkMode={false}
      language="tr"
      onLogout={() => console.log('Logout')}
    />
  );
}
```

Tarayıcınızda `/test` sayfasına gidin ve WMS'i test edin.

## ✅ Checklist

Entegrasyon tamamlandıktan sonra kontrol edin:

- [ ] WMS modülü yükleniyor mu?
- [ ] Dark mode çalışıyor mu?
- [ ] Authentication çalışıyor mu?
- [ ] Logout fonksiyonu çalışıyor mu?
- [ ] Responsive tasarım düzgün mü?
- [ ] Türkçe decimal formatı doğru mu? (20.000,50)
- [ ] IQD para birimi gösteriliyor mu?
- [ ] Navigation çalışıyor mu?
- [ ] API entegrasyonu hazır mı?

## ğŸ†˜ Sorun Giderme

### Problem: "Module not found"
**Çözüm**: `warehouse-management` klasörünün doğru konumda olduğundan emin olun.

### Problem: "useState is not defined"
**Çözüm**: Component'lerde React import'larını kontrol edin.

### Problem: Dark mode çalışmıyor
**Çözüm**: `darkMode` prop'unun doğru pass edildiğinden emin olun.

### Problem: Authentication redirect çalışmıyor
**Çözüm**: localStorage key'lerini kontrol edin (`exretail_user`, `exretail_selected_firma_id`)

## ğŸ“ Destek

Herhangi bir sorunla karşılaşırsanız:
1. README.md'yi okuyun
2. INTEGRATION_GUIDE.md'yi kontrol edin (bu dosya)
3. Console'da hata mesajlarını kontrol edin
4. GitHub Issues'a bildirin

---

**Happy Coding! ğŸš€**

