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
    const bootstrapWebConfig = async (firmId: string) => {
      try {
        const { data, error } = await supabase
          .from('firmalar')
          .select('*')
          .eq('firma_id', firmId)
          .maybeSingle();

        if (error || !data) return null;

        const conn = data.connection_config || {};
        const config = {
          is_configured: true,
          db_mode: "hybrid",
          remote_db: `${conn.host || '91.205.41.130'}:${conn.port || 5432}/${conn.database || 'EXFINOPS'}`,
          pg_remote_user: conn.username || 'postgres',
          pg_remote_pass: conn.password || '',
          erp_firm_nr: data.firma_id || '001',
          terminal_name: data.firma_adi || 'RETAILEX DEMO',
          license_expiry: data.license_expiry || data.lisans_bitis || '2026-12-31',
          max_users: data.max_users || data.kullanici_hakki || 5,
        };

        localStorage.setItem('retailex_web_config', JSON.stringify(config));
        localStorage.setItem('exretail_selected_firma_id', config.erp_firm_nr);
        localStorage.setItem('exretail_firma_donem_configured', 'true');
        return config;
      } catch (e) {
        console.error('Bootstrap failed:', e);
        return null;
      }
    };

    const startupFlow = async () => {
      try {
        let config: any = null;
        let tauriInvoke: any = null;
        let backendVersion: string = "unknown";

        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          tauriInvoke = invoke;

          // 1. Get backend version first (fast)
          try {
            backendVersion = await Promise.race([
              tauriInvoke('get_app_version'),
              new Promise<string>((_, reject) => setTimeout(() => reject(new Error('get_app_version timeout')), 2000))
            ]);
            setVersion(backendVersion);
            console.log(`[Startup] Backend version: ${backendVersion}`);
          } catch (e) {
            console.warn('[Startup] Could not fetch backend version', e);
          }

          // 2. Fetch config with timeout
          try {
            config = await Promise.race([
              tauriInvoke('get_app_config'),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('get_app_config timeout')), 5000))
            ]);
          } catch (configErr) {
            console.warn('Config fetch failed, using defaults:', configErr);
            config = null;
          }

          // 3. Database initialization (non-blocking)
          const dbInitPromise = (async () => {
            try {
              if (config) {
                localStorage.setItem('retailex_web_config', JSON.stringify(config));
              }
              await initializeFromSQLite(config);
              try {
                const { postgres } = await import('./services/postgres');
                await postgres.connect(config);
              } catch (e) { console.error('DB Connect failed:', e); }
            } catch (e) {
              console.error('DB Init failed:', e);
            }
          })();

          // 4. PG check (background)
          const pgCheckPromise = (async () => {
            try {
              const pgExists = await Promise.race([
                tauriInvoke('check_pg16'),
                new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('check_pg16 timeout')), 5000))
              ]) as boolean;

              if (!pgExists) {
                setInstallingPg(true);
                try {
                  await tauriInvoke('install_pg16');
                } catch (err) {
                  console.error('PG Install error:', err);
                }
                setInstallingPg(false);
              }
            } catch (e) {
              console.error('PG Check failed:', e);
              setInstallingPg(false);
            }
          })();

          // We wait at most 8 seconds for everything to settle before showing UI
          await Promise.race([
            Promise.all([dbInitPromise, pgCheckPromise]),
            new Promise<void>((resolve) => setTimeout(() => {
              console.warn('Startup: UI break-through timeout reached');
              resolve();
            }, 8000))
          ]);
        }
        else {
          // Web Flow
          const saved = localStorage.getItem('retailex_web_config');
          if (saved) config = JSON.parse(saved);
          await initializeFromSQLite();
        }

        setIsPgReady(true);

        // 5. Decide state
        if (config && config.is_configured === true) {
          setIsConfigured(true);
          localStorage.setItem('exretail_selected_firma_id', config.erp_firm_nr);
          localStorage.setItem('exretail_selected_donem_id', config.erp_period_nr || '01');
          localStorage.setItem('exretail_firma_donem_configured', 'true');
        } else if (!isTauri) {
          setIsConfigured(true);
        } else {
          setIsConfigured(false);
        }
      } catch (err) {
        console.error('Startup flow failed:', err);
        setIsPgReady(true);
        setIsConfigured(!!localStorage.getItem('exretail_firma_donem_configured'));
      }
    };
    startupFlow();

    const emergencyTimer = setTimeout(() => {
      console.warn('Emergency timeout: Startup taking too long, forcing UI recovery');
      setIsPgReady(true);
      setIsConfigured(prev => prev === null ? false : prev);
      if ((window as any).removeLoader) (window as any).removeLoader();
    }, 10000);

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
                  currentUser={{
                    id: user!.id,
                    username: user!.username,
                    fullName: user!.full_name,
                    role: user!.role_ids?.[0] === 'admin' ? 'admin' :
                      user!.role_ids?.[0] === 'accountant' ? 'manager' : 'cashier',
                    email: user!.email,
                    permissions: user!.role_ids?.includes('admin') ? ['all'] : ['pos', 'reports'],
                    createdAt: user!.created_at,
                  } as any}
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


