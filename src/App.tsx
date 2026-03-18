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
import { AdminElevationPrompt } from './components/system/AdminElevationPrompt';
import { listen } from '@tauri-apps/api/event';
import { IS_TAURI, safeInvoke } from './utils/env';

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
  const [isInitialized, setIsInitialized] = useState(false);
  const [installingPg, setInstallingPg] = useState(false);
  const [version, setVersion] = useState<string>('0.1.46');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showElevationPrompt, setShowElevationPrompt] = useState(false);
  const [elevationReason, setElevationReason] = useState('');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // HTML loader'ı kaldır: React logo+spinner çizildikten sonra, böylece arada boş ekran olmaz
  useEffect(() => {
    const t = setTimeout(() => {
      if ((window as any).removeLoader) (window as any).removeLoader();
    }, 120);
    return () => clearTimeout(t);
  }, []);

  // Unified Infrastructure & Config Check
  useEffect(() => {
    const applyConfig = (config: any) => {
      if (config?.is_configured === true) {
        setIsConfigured(true);
        localStorage.setItem('exretail_selected_firma_id', config.erp_firm_nr);
        localStorage.setItem('exretail_selected_donem_id', config.erp_period_nr || '01');
        localStorage.setItem('exretail_firma_donem_configured', 'true');
        localStorage.setItem('retailex_web_config', JSON.stringify(config));
      } else {
        setIsConfigured(false);
        // Clear ghost flags if backend says not configured
        localStorage.removeItem('exretail_firma_donem_configured');
        localStorage.removeItem('retailex_web_config');
      }
    };

    const startupFlow = async () => {
      try {
        if (IS_TAURI) {
          // ── SLOW PATH (Source of Truth) ──────────────────────────────────────────
          const results = await Promise.race([
            Promise.allSettled([
              safeInvoke('get_app_config'),
              safeInvoke('get_app_version'),
            ]),
            new Promise<PromiseSettledResult<any>[]>(r =>
              setTimeout(() => r([
                { status: 'rejected', reason: 'timeout' },
                { status: 'rejected', reason: 'timeout' },
              ]), 5000)
            ),
          ]);

          const config = results[0].status === 'fulfilled' ? results[0].value : null;
          const ver = results[1].status === 'fulfilled' ? results[1].value : null;
          if (ver) setVersion(String(ver));
          if (config) localStorage.setItem('retailex_web_config', JSON.stringify(config));

          await initializeFromSQLite(config).catch(() => { });
          if (config) {
            import('./services/postgres').then(({ postgres }) =>
              postgres.connect().catch(() => { })
            ).catch(() => { });
          }

          setIsPgReady(true);
          
          // Final configuration check: if we have a config object OR something in localStorage
          const finalConfigured = !!(config?.is_configured || localStorage.getItem('exretail_firma_donem_configured'));
          applyConfig(config || { is_configured: finalConfigured });

          safeInvoke('check_pg16').then((exists: any) => {
            if (!exists) {
              setInstallingPg(true);
              safeInvoke('install_pg16').catch(() => { }).finally(() => setInstallingPg(false));
            }
          }).catch(() => { });

          setIsInitialized(true);
          if ((window as any).removeLoader) (window as any).removeLoader();
        } else {
          // ── Web Flow ──────────────────────────────────────────────────────────
          await initializeFromSQLite();
          setIsPgReady(true);
          setIsConfigured(true);
          setIsInitialized(true);
          if ((window as any).removeLoader) (window as any).removeLoader();
        }
      } catch (err) {
        console.error('[Startup] Flow failed:', err);
        setIsPgReady(true);
        setIsConfigured(!!localStorage.getItem('exretail_firma_donem_configured'));
        setIsInitialized(true);
      }
    };

    startupFlow();

    // Emergency fallback to prevent white screen if initialization hangs
    const emergencyTimer = setTimeout(() => {
      if (!isInitialized) {
        console.warn('⚠️ Emergency initialization triggered - slow startup detected');
        
        // Recover from cache if possible
        const cachedRaw = localStorage.getItem('retailex_web_config');
        const hasLegacyFlag = !!localStorage.getItem('exretail_firma_donem_configured');
        
        if (cachedRaw || hasLegacyFlag) {
          console.info('Retrieved configuration from cache during emergency fallback');
          setIsConfigured(true);
        } else {
          // Only show wizard if absolutely no config is found
          setIsConfigured(IS_TAURI ? false : true);
        }
        
        setIsPgReady(true);
        setIsInitialized(true);
      }
      
      const loader = document.getElementById('app-loader');
      if (loader) loader.remove();
      if ((window as any).removeLoader) (window as any).removeLoader();
    }, 10000); // Fallback if startup hangs; loader removed as soon as ready

    return () => clearTimeout(emergencyTimer);
  }, [IS_TAURI]);

  // VPN Permission Error Listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      if (IS_TAURI) {
        unlisten = await listen('vpn-permission-error', (event) => {
          console.error('[VPN] Permission Error:', event.payload);
          setElevationReason(String(event.payload));
          setShowElevationPrompt(true);
        });
      }
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [IS_TAURI]);

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

  // Load + Neon logo tek ekranda: logo ile spinner birlikte
  if (isConfigured === null || !isPgReady || installingPg) {
    return (
      <div className="fixed inset-0 bg-[#0f1113] flex items-center justify-center animate-in fade-in duration-300">
        <div className="text-center flex flex-col items-center gap-6">
          <NeonLogo size="lg" className="animate-pulse" />
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          {installingPg && (
            <p className="text-gray-300 text-sm animate-pulse">Veritabanı hazırlanıyor, lütfen bekleyin.</p>
          )}
          <div className="text-blue-300 text-xs font-mono tracking-widest uppercase">v{version}</div>
        </div>
      </div>
    );
  }

  return (
    <FirmaDonemProvider>
      <VersionProvider>
        <ErrorBoundary>
          <AdminElevationPrompt 
            isOpen={showElevationPrompt} 
            onClose={() => setShowElevationPrompt(false)} 
            reason={elevationReason}
          />
          {/* Global Loading / Setup Wizard Check */}
          {isConfigured === null || authLoading ? (
            <div className="min-h-screen bg-[#0f1113] flex items-center justify-center">
              <div className="text-center flex flex-col items-center gap-6">
                <NeonLogo size="lg" className="animate-pulse" />
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              </div>
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


