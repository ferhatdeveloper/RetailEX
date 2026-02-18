import { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import SetupWizard from './components/system/SetupWizard';

// Import WebSocket patch FIRST to suppress all WebSocket errors globally
import './services/websocketPatch';

export type Module = 'pos' | 'management' | 'wms' | 'mobile-pos';
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

  // Unified Infrastructure & Config Check
  useEffect(() => {
    const startupFlow = async () => {
      try {
        // 1. Check for PostgreSQL 16
        const pgExists: boolean = await invoke('check_pg16');
        if (!pgExists) {
          setInstallingPg(true);
          logger.info('PostgreSQL 16 not found. Attempting silent installation...');
          try {
            await invoke('install_pg16');
            logger.info('PostgreSQL 16 installation triggered.');
          } catch (err) {
            console.error('PG Install error:', err);
          }
          setInstallingPg(false);
        }
        setIsPgReady(true);

        // 2. Initialize global config from SQLite
        await initializeFromSQLite();

        // 3. Fetch current config state to decide redirection
        const config: any = await invoke('get_app_config');
        setIsConfigured(config.is_configured === true);

        if (config.is_configured === true) {
          localStorage.setItem('exretail_selected_firma_id', config.erp_firm_nr);
          localStorage.setItem('exretail_selected_donem_id', config.erp_period_nr);
          localStorage.setItem('exretail_firma_donem_configured', 'true');

          // Config is ready
        } else {
          // If backend says NOT configured, clear local storage to force Wizard
          localStorage.removeItem('exretail_firma_donem_configured');
          localStorage.removeItem('exretail_selected_firma_id');
          localStorage.removeItem('exretail_selected_donem_id');
        }
      } catch (err) {
        console.error('Startup flow failed:', err);
        setIsPgReady(true);
        setIsConfigured(false);
      }
    };
    startupFlow();
  }, []);

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

  const handleSaleComplete = async (sale: any) => {
    console.log('[App] handleSaleComplete called with:', sale);
    try {
      await addSale(sale);
      sale.items.forEach((item: any) => {
        updateProductStock(item.productId, item.quantity);
      });
      if (sale.customerId) {
        updateCustomerPurchaseHistory(sale.customerId, sale.total);
      }
      emitVersionEvent('sale_complete', { saleId: sale.id, total: sale.total });
    } catch (error) {
      console.error('[App] Error completing sale:', error);
      logger.error('Satış kaydedilirken hata oluştu', error);
      alert(`Satış kaydedilemedi! Hata: ${(error as any).message || error}`);
    }
  };

  const handleLogout = () => {
    logout();
    localStorage.removeItem('exretail_firma_donem_configured');
  };

  // Loading state for infrastructure or config check
  if (isConfigured === null || !isPgReady || installingPg) {
    return (
      <div className="fixed inset-0 bg-[#0f1113] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
            {installingPg ? 'Veritabanı Altyapısı Hazırlanıyor...' : 'Sistem Yükleniyor...'}
          </p>
          {installingPg && (
            <p className="text-gray-400 text-[10px] animate-pulse">Lütfen bekleyin, bu işlem ilk sefere mahsustur.</p>
          )}
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
          ) : !isConfigured ? (
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
