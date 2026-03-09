import { useEffect, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Login } from './components/system/Login';
import { VersionProvider } from './contexts/VersionContext';
import { FirmaDonemProvider } from './contexts/FirmaDonemContext';
import { logger } from './utils/logger';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { initializeFromSQLite } from './services/postgres';
import { MainLayout } from './components/system/MainLayout';
import { emitVersionEvent } from './hooks/useAutoVersion';
import { useProductStore, useCustomerStore, useSaleStore, useCampaignStore } from './store';
import { useRestaurantStore } from './components/restaurant/store/useRestaurantStore';
import { Loader2, Monitor } from 'lucide-react';
import SetupWizard from './components/system/SetupWizard';
import { NeonLogo } from './components/ui/NeonLogo';
import { supabase } from './utils/supabase/client';

// Import WebSocket patch FIRST to suppress all WebSocket errors globally
import './services/websocketPatch';

export type Module = 'pos' | 'management' | 'wms' | 'mobile-pos' | 'restaurant' | 'beauty';
export type ManagementScreen = 'dashboard' | 'products' | 'customers' | 'reports' | 'settings' | 'integrations';

// Re-export types for backward compatibility
export type { Product, ProductVariant, Customer, Sale, SaleItem, Campaign, User } from './core/types';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isPgReady, setIsPgReady] = useState(false);
  const [installingPg, setInstallingPg] = useState(false);
  const [version, setVersion] = useState<string>('0.1.46');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Unified Infrastructure & Config Check
  useEffect(() => {
    const applyConfig = (config: any) => {
      if (config?.is_configured === true) {
        setIsConfigured(true);
        localStorage.setItem('exretail_selected_firma_id', config.erp_firm_nr);
        localStorage.setItem('exretail_selected_donem_id', config.erp_period_nr || '01');
        localStorage.setItem('exretail_firma_donem_configured', 'true');
      } else {
        setIsConfigured(false);
      }
    };

    const startupFlow = async () => {
      try {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');

          // ── FAST PATH ────────────────────────────────────────────────────────
          // Eğer önceki oturumdan cache'lenmiş config varsa, Tauri'yi bekleme
          const cachedRaw = localStorage.getItem('retailex_web_config');
          if (cachedRaw) {
            try {
              const cachedConfig = JSON.parse(cachedRaw);
              await initializeFromSQLite(); // initializeFromSQLite takes no arguments based on lint
              setIsPgReady(true);
              applyConfig(cachedConfig);

              // Arka planda config'i yenile (bir sonraki açılış için)
              invoke('get_app_version').then((v: any) => setVersion(String(v))).catch(() => { });
              invoke('get_app_config').then((fresh: any) => {
                if (fresh) {
                  localStorage.setItem('retailex_web_config', JSON.stringify(fresh));
                  import('./services/postgres').then(({ postgres }) =>
                    postgres.connect(fresh).catch(() => { })
                  ).catch(() => { });
                }
              }).catch(() => { });
              return; // UI gösterildi, bitti
            } catch { /* cache bozuksa slow path'e düş */ }
          }

          // ── SLOW PATH (ilk açılış) ────────────────────────────────────────────
          // get_app_version + get_app_config PARALEL, 3 saniye max bekle
          const results = await Promise.race([
            Promise.allSettled([
              invoke('get_app_config'),
              invoke('get_app_version'),
            ]),
            new Promise<PromiseSettledResult<any>[]>(r =>
              setTimeout(() => r([
                { status: 'rejected', reason: 'timeout' },
                { status: 'rejected', reason: 'timeout' },
              ]), 3000)
            ),
          ]);

          const config = results[0].status === 'fulfilled' ? results[0].value : null;
          const ver = results[1].status === 'fulfilled' ? results[1].value : null;
          if (ver) setVersion(String(ver));
          if (config) localStorage.setItem('retailex_web_config', JSON.stringify(config));

          await initializeFromSQLite().catch(() => { });
          if (config) {
            import('./services/postgres').then(({ postgres }) =>
              postgres.connect().catch(() => { })
            ).catch(() => { });
          }

          setIsPgReady(true);
          applyConfig(config || { is_configured: !!localStorage.getItem('exretail_firma_donem_configured') });

          // PG kontrolü arka planda — UI'yı bloke etme
          invoke('check_pg16').then((exists: any) => {
            if (!exists) {
              setInstallingPg(true);
              invoke('install_pg16').catch(() => { }).finally(() => setInstallingPg(false));
            }
          }).catch(() => { });
        } else {
          // ── Web Flow ──────────────────────────────────────────────────────────
          const saved = localStorage.getItem('retailex_web_config');
          if (saved) { try { await initializeFromSQLite(); } catch { await initializeFromSQLite(); } }
          else await initializeFromSQLite();
          setIsPgReady(true);
          setIsConfigured(true);
        }
      } catch (err) {
        console.error('[Startup] Flow failed:', err);
        setIsPgReady(true);
        setIsConfigured(!!localStorage.getItem('exretail_firma_donem_configured'));
      }
    };

    startupFlow();

    // Güvenlik ağı: 5 saniyede UI'ı zorla göster
    const emergencyTimer = setTimeout(() => {
      console.warn('[Startup] Emergency timeout — forcing UI');
      setIsPgReady(true);
      setIsConfigured(prev => prev === null ? !!localStorage.getItem('exretail_firma_donem_configured') : prev);
      if ((window as any).removeLoader) (window as any).removeLoader();
    }, 5000);

    return () => clearTimeout(emergencyTimer);
  }, [isTauri]);

  // Remove loader when app is ready
  useEffect(() => {
    if (isConfigured !== null && isPgReady && !installingPg) {
      if ((window as any).removeLoader) {
        (window as any).removeLoader();
      }
    }
  }, [isConfigured, isPgReady, installingPg]);

  // Get data from stores
  const products = useProductStore((state) => state.products);
  const setProducts = useProductStore((state) => state.setProducts);
  const customers = useCustomerStore((state) => state.customers);
  const setCustomers = useCustomerStore((state) => state.setCustomers);
  const sales = useSaleStore((state) => state.sales);
  const addSale = useSaleStore((state) => state.addSale);
  const campaigns = useCampaignStore((state) => state.campaigns);
  const setCampaigns = useCampaignStore((state) => state.setCampaigns);

  // Update product stock and customer purchase history
  const updateProductStock = useProductStore((state) => state.updateStock);
  const updateCustomerPurchaseHistory = useCustomerStore((state) => state.updatePurchaseHistory);

  const handleSaleComplete = useCallback(async (sale: any) => {
    console.log('[App] handleSaleComplete called with:', sale);
    try {
      await addSale(sale);

      const restaurantStore = useRestaurantStore.getState();

      for (const item of sale.items) {
        // Recipe-aware stock deduction
        let recipes: any[] = [];
        try {
          const restaurantStore = useRestaurantStore.getState();
          recipes = restaurantStore?.recipes || [];
        } catch (e) {
          logger.warn('[App] Could not get restaurantStore recipes', e);
        }

        const recipe = recipes.find(r => r.menuItemId === item.productId);

        if (recipe && recipe.ingredients) {
          // It's a recipe item, deduct ingredients
          for (const ingredient of recipe.ingredients) {
            if (ingredient.materialId) {
              const product = (products || []).find(p => p.id === ingredient.materialId);
              if (product) {
                const usedAmount = (ingredient.quantity || 0) * (item.quantity || 0);
                const newStock = (product.stock || 0) - usedAmount;
                await updateProductStock(product.id, newStock);
              }
            }
          }
        } else {
          // Standard item, deduct directly
          const product = (products || []).find(p => p.id === item.productId);
          if (product) {
            const newStock = (product.stock || 0) - (item.quantity || 0);
            await updateProductStock(item.productId, newStock);
          }
        }
      }

      if (sale.customerId) {
        updateCustomerPurchaseHistory(sale.customerId, sale.total);
      }
      emitVersionEvent('sale_complete', { saleId: sale.id, total: sale.total });
    } catch (error) {
      console.error('[App] Error completing sale:', error);
      logger.error('Satış kaydedilirken hata oluştu', error);
      alert(`Satış kaydedilemedi! Hata: ${(error as any).message || error}`);
    }
  }, [addSale, products, updateProductStock, updateCustomerPurchaseHistory]);

  const handleLogout = useCallback(() => {
    logout();
    localStorage.removeItem('exretail_firma_donem_configured');
  }, [logout]);

  // Loading state for infrastructure or config check
  if (isConfigured === null || !isPgReady || installingPg) {
    return (
      <div className="fixed inset-0 bg-[#0f1113] flex items-center justify-center animate-in fade-in duration-500">
        <div className="text-center space-y-6">
          <NeonLogo size="lg" className="animate-pulse" />
          <p className="text-blue-500/50 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
            {installingPg ? 'Veritabanı Altyapısı Hazırlanıyor...' : 'Sistem Yükleniyor...'}
          </p>
          {installingPg && (
            <p className="text-gray-400 text-[10px] animate-pulse">Lütfen bekleyin, bu işlem ilk sefere mahsustur.</p>
          )}
          <div className="mt-8 text-blue-400/50 text-[10px] font-mono tracking-widest uppercase">
            Enterprise OS v{version} • Initializing Core
          </div>
        </div>
      </div>
    );
  }

  return (
    <FirmaDonemProvider>
      <VersionProvider>
        <ErrorBoundary>
          {/* Global Loading / Setup Wizard Check */}
          {isConfigured === null || authLoading ? (
            <div className="min-h-screen bg-[#050510] flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            </div>
          ) : (windowWidth >= 1024 && !isConfigured) ? (
            <SetupWizard />
          ) : (
            <>
              {/* Login Screen */}
              {!isAuthenticated ? (
                <Login onLogin={(userData) => {
                  logger.info(`User logged in: ${userData.username} (${userData.role})`);
                }} />
              ) : (
                /* Main Application */
                <MainLayout
                  currentUser={user as any}
                  products={products}
                  setProducts={setProducts}
                  customers={customers}
                  setCustomers={setCustomers}
                  sales={sales}
                  campaigns={campaigns}
                  setCampaigns={setCampaigns}
                  onSaleComplete={handleSaleComplete}
                  onLogout={handleLogout}
                />
              )}
            </>
          )}
        </ErrorBoundary>
      </VersionProvider>
    </FirmaDonemProvider>
  );
}

export default App;


