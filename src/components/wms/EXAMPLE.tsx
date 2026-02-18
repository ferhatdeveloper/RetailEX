/**
 * ğŸ­ ExRetailOS WMS - Kullanım Örnekleri
 * 
 * Bu dosya, WMS modülünü farklı senaryolarda nasıl kullanabileceğinizi gösterir.
 * Kendi projenize göre özelleştirebilirsiniz.
 */

import { useState } from 'react';
import WarehouseManagement from './index';

// ============================================================================
// ÖRNEK 1: Basit Kullanım (Standalone)
// ============================================================================
export function Example1_StandaloneWMS() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div>
      {/* Theme Toggle */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          padding: '10px 20px',
          background: darkMode ? '#fff' : '#000',
          color: darkMode ? '#000' : '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        {darkMode ? '☀️ Light' : 'ğŸŒ™ Dark'}
      </button>

      {/* WMS Modülü */}
      <WarehouseManagement
        darkMode={darkMode}
        language="tr"
        onLogout={() => {
          alert('Çıkış yapıldı!');
          window.location.href = '/login';
        }}
      />
    </div>
  );
}

// ============================================================================
// ÖRNEK 2: ExRetailOS Context Entegrasyonu
// ============================================================================
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

export function Example2_WithContexts() {
  const { darkMode } = useTheme();
  const { currentLanguage } = useLanguage();

  const handleLogout = () => {
    // Logout işlemleri
    localStorage.removeItem('exretail_user');
    localStorage.removeItem('exretail_selected_firma_id');
    localStorage.removeItem('exretail_selected_donem_id');
    window.location.reload();
  };

  return (
    <WarehouseManagement
      darkMode={darkMode}
      language={currentLanguage as 'tr' | 'en' | 'ar'}
      onLogout={handleLogout}
    />
  );
}

// ============================================================================
// ÖRNEK 3: Multi-Module System (Modül Sistemi)
// ============================================================================
export function Example3_MultiModuleSystem() {
  const [currentModule, setCurrentModule] = useState<'pos' | 'warehouse' | 'inventory'>('warehouse');
  const [darkMode, setDarkMode] = useState(false);

  const renderModule = () => {
    switch (currentModule) {
      case 'warehouse':
        return (
          <WarehouseManagement
            darkMode={darkMode}
            language="tr"
            onLogout={() => setCurrentModule('pos')}
          />
        );

      case 'pos':
        return (
          <div className="p-8">
            <h1>POS Modülü</h1>
            <button onClick={() => setCurrentModule('warehouse')}>
              Depo Yönetimine Geç
            </button>
          </div>
        );

      case 'inventory':
        return (
          <div className="p-8">
            <h1>Stok Modülü</h1>
            <button onClick={() => setCurrentModule('warehouse')}>
              Depo Yönetimine Geç
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      {/* Module Selector */}
      <div style={{
        display: 'flex',
        gap: '10px',
        padding: '10px',
        background: darkMode ? '#1F2937' : '#fff',
        borderBottom: '1px solid',
        borderColor: darkMode ? '#374151' : '#e5e7eb'
      }}>
        <button
          onClick={() => setCurrentModule('pos')}
          style={{
            padding: '8px 16px',
            background: currentModule === 'pos' ? '#3B82F6' : 'transparent',
            color: currentModule === 'pos' ? '#fff' : darkMode ? '#fff' : '#000',
            border: '1px solid #3B82F6',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          🛒 POS
        </button>

        <button
          onClick={() => setCurrentModule('warehouse')}
          style={{
            padding: '8px 16px',
            background: currentModule === 'warehouse' ? '#3B82F6' : 'transparent',
            color: currentModule === 'warehouse' ? '#fff' : darkMode ? '#fff' : '#000',
            border: '1px solid #3B82F6',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ğŸ­ Depo
        </button>

        <button
          onClick={() => setCurrentModule('inventory')}
          style={{
            padding: '8px 16px',
            background: currentModule === 'inventory' ? '#3B82F6' : 'transparent',
            color: currentModule === 'inventory' ? '#fff' : darkMode ? '#fff' : '#000',
            border: '1px solid #3B82F6',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ğŸ“¦ Stok
        </button>

        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            background: 'transparent',
            color: darkMode ? '#fff' : '#000',
            border: '1px solid',
            borderColor: darkMode ? '#374151' : '#e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          {darkMode ? '☀️' : 'ğŸŒ™'}
        </button>
      </div>

      {/* Active Module */}
      {renderModule()}
    </div>
  );
}

// ============================================================================
// ÖRNEK 4: Router Entegrasyonu (React Router)
// ============================================================================
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

export function Example4_WithRouter() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <BrowserRouter>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        gap: '20px',
        padding: '20px',
        background: darkMode ? '#1F2937' : '#fff',
        borderBottom: '1px solid',
        borderColor: darkMode ? '#374151' : '#e5e7eb'
      }}>
        <Link to="/">Ana Sayfa</Link>
        <Link to="/pos">POS</Link>
        <Link to="/warehouse">Depo Yönetimi</Link>
        <Link to="/inventory">Stok</Link>

        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{ marginLeft: 'auto' }}
        >
          {darkMode ? '☀️ Light' : 'ğŸŒ™ Dark'}
        </button>
      </nav>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/warehouse" element={
          <WarehouseManagement
            darkMode={darkMode}
            language="tr"
          />
        } />
        <Route path="/inventory" element={<InventoryPage />} />
      </Routes>
    </BrowserRouter>
  );
}

// Helper Components
function HomePage() {
  return <div className="p-8"><h1>Ana Sayfa</h1></div>;
}

function POSPage() {
  return <div className="p-8"><h1>POS Modülü</h1></div>;
}

function InventoryPage() {
  return <div className="p-8"><h1>Stok Modülü</h1></div>;
}

// ============================================================================
// ÖRNEK 5: Conditional Loading (Koşullu Yükleme)
// ============================================================================
import { lazy, Suspense } from 'react';

// Lazy load WMS for better performance
const LazyWMS = lazy(() => import('./index'));

export function Example5_LazyLoading() {
  const [showWMS, setShowWMS] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div>
      <div style={{ padding: '20px' }}>
        <h1>Ana Uygulama</h1>

        <button
          onClick={() => setShowWMS(!showWMS)}
          style={{
            padding: '10px 20px',
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          {showWMS ? 'WMS\'i Kapat' : 'WMS\'i Aç'}
        </button>
      </div>

      {showWMS && (
        <Suspense fallback={
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh'
          }}>
            <div>Depo Yönetim Sistemi Yükleniyor...</div>
          </div>
        }>
          <LazyWMS
            darkMode={darkMode}
            language="tr"
            onLogout={() => setShowWMS(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

// ============================================================================
// ÖRNEK 6: Custom Auth Integration
// ============================================================================
export function Example6_CustomAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Custom login
  const handleLogin = (username: string, password: string) => {
    // Kendi auth logic'iniz
    if (username === 'admin' && password === 'admin') {
      const userData = {
        id: '1',
        username: 'admin',
        name: 'Admin User',
        role: 'warehouse_manager'
      };

      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('exretail_user', JSON.stringify(userData));
      localStorage.setItem('exretail_selected_firma_id', '1');
    }
  };

  // Custom logout
  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('exretail_user');
    localStorage.removeItem('exretail_selected_firma_id');
  };

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: darkMode ? '#111827' : '#f9fafb'
      }}>
        <div style={{
          background: darkMode ? '#1F2937' : '#fff',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2>WMS Login</h2>
          <button
            onClick={() => handleLogin('admin', 'admin')}
            style={{
              width: '100%',
              padding: '12px',
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            Login as Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <WarehouseManagement
      darkMode={darkMode}
      language="tr"
      onLogout={handleLogout}
    />
  );
}

// ============================================================================
// ÖRNEK 7: Ana App.tsx Entegrasyonu
// ============================================================================
/**
 * Ana App.tsx dosyanızı şöyle güncelleyin:
 */

/*
// App.tsx
import { useState, useEffect } from 'react';
import WarehouseManagement from './warehouse-management';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

function AppContent() {
  const { darkMode } = useTheme();
  const { currentLanguage } = useLanguage();

  const handleLogout = () => {
    localStorage.removeItem('exretail_user');
    localStorage.removeItem('exretail_selected_firma_id');
    window.location.href = '/login';
  };

  return (
    <WarehouseManagement 
      darkMode={darkMode}
      language={currentLanguage as 'tr' | 'en' | 'ar'}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
*/

// ============================================================================
// Default Export - Tüm örnekleri göster
// ============================================================================
export default function WMSExamples() {
  const [selectedExample, setSelectedExample] = useState<number>(1);

  const examples = [
    { id: 1, name: 'Standalone WMS', component: <Example1_StandaloneWMS /> },
    { id: 2, name: 'With Contexts', component: <Example2_WithContexts /> },
    { id: 3, name: 'Multi-Module', component: <Example3_MultiModuleSystem /> },
    { id: 4, name: 'With Router', component: <Example4_WithRouter /> },
    { id: 5, name: 'Lazy Loading', component: <Example5_LazyLoading /> },
    { id: 6, name: 'Custom Auth', component: <Example6_CustomAuth /> },
  ];

  return (
    <div>
      <div style={{
        padding: '20px',
        background: '#1F2937',
        color: '#fff',
        borderBottom: '2px solid #3B82F6'
      }}>
        <h1>ğŸ­ WMS Kullanım Örnekleri</h1>
        <p>Farklı senaryolarda WMS kullanımı</p>

        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '20px',
          flexWrap: 'wrap'
        }}>
          {examples.map(ex => (
            <button
              key={ex.id}
              onClick={() => setSelectedExample(ex.id)}
              style={{
                padding: '8px 16px',
                background: selectedExample === ex.id ? '#3B82F6' : '#374151',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {examples.find(ex => ex.id === selectedExample)?.component}
    </div>
  );
}

