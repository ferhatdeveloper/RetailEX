import { useEffect, useState, useCallback, useRef } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
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
import { readNeonProductLineFromStorage } from './utils/neonProductLine';
import { supabase } from './utils/supabase/client';
import { IS_TAURI, safeInvoke } from './utils/env';
import { mergeRustIntoStoredWebConfig } from './utils/retailexWebConfigMerge';
import { APP_VERSION } from './core/version';
import { initRetailexDataSync } from './services/retailexDataSync';
import {
  SETUP_WIZARD_EVENT,
  clearSetupWizardLocalFlags,
  consumeForceSetupWizard,
} from './utils/setupWizardGate';

// Import WebSocket patch FIRST to suppress all WebSocket errors globally
import './services/websocketPatch';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Module = 'pos' | 'management' | 'wms' | 'mobile-pos' | 'restaurant' | 'beauty';
export type ManagementScreen = 'dashboard' | 'products' | 'customers' | 'reports' | 'settings' | 'integrations';

// Re-export types for backward compatibility
export type { Product, ProductVariant, Customer, Sale, SaleItem, Campaign, User } from './core/types';

function App() {
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isPgReady, setIsPgReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [installingPg, setInstallingPg] = useState(false);
  const [version, setVersion] = useState<string>(() => APP_VERSION.full);
  const recentSaleReceiptsRef = useRef<Map<string, number>>(new Map());
  /** Acil zamanlayıcı closure’da `isInitialized` hep eski kalır; yalnızca ref ile gerçek tamamlanmayı izleyin. */
  const startupCompleteRef = useRef(false);
  const hasWebTenantResolution = (config?: any) => {
    try {
      const cfg = config ?? (() => {
        const raw = localStorage.getItem('retailex_web_config');
        return raw ? JSON.parse(raw) : null;
      })();
      const tenantCode = String(cfg?.merkez_tenant_code ?? '').trim();
      const tenantId = String(cfg?.merkez_tenant_id ?? '').trim();
      return Boolean(tenantCode || tenantId || localStorage.getItem('exretail_selected_tenant'));
    } catch {
      return Boolean(localStorage.getItem('exretail_selected_tenant'));
    }
  };

  useEffect(() => {
    initRetailexDataSync();
  }, []);

  // Login → siyah SetupWizard: state ile (reload şart değil)
  useEffect(() => {
    if (!IS_TAURI) return;
    const openWizard = () => {
      clearSetupWizardLocalFlags();
      setIsConfigured(false);
      setIsPgReady(true);
      if ((window as any).removeLoader) (window as any).removeLoader();
    };
    window.addEventListener(SETUP_WIZARD_EVENT, openWizard);
    return () => window.removeEventListener(SETUP_WIZARD_EVENT, openWizard);
  }, []);

  // HTML loader yalnızca ana arayüz (Login/MainLayout/SetupWizard) gösterilmeden önce kaldırılır — arada siyah ekran olmasın
  // (removeLoader startupFlow ve aşağıdaki isConfigured/isPgReady effect'inde çağrılıyor)

  // Unified Infrastructure & Config Check
  useEffect(() => {
    startupCompleteRef.current = false;
    const applyConfig = (config: any) => {
      if (config?.is_configured === true) {
        setIsConfigured(true);
        const dF = String(config.erp_firm_nr ?? '').replace(/\D/g, '');
        const dP = String(config.erp_period_nr ?? '').replace(/\D/g, '');
        const fn = !dF ? '' : (dF.length <= 3 ? dF.padStart(3, '0') : dF);
        const pn = !dP ? '01' : (dP.length <= 2 ? dP.padStart(2, '0') : dP);
        if (fn) localStorage.setItem('exretail_selected_firma_id', fn);
        localStorage.setItem('exretail_selected_donem_id', pn);
        if (IS_TAURI || hasWebTenantResolution(config)) {
          localStorage.setItem('exretail_firma_donem_configured', 'true');
        } else {
          localStorage.removeItem('exretail_firma_donem_configured');
        }
        localStorage.setItem('retailex_web_config', JSON.stringify(mergeRustIntoStoredWebConfig(config)));
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
          if (config) {
            localStorage.setItem('retailex_web_config', JSON.stringify(mergeRustIntoStoredWebConfig(config)));
          }

          await initializeFromSQLite(config).catch(() => { });
          if (config) {
            import('./services/postgres').then(({ postgres }) =>
              postgres.connect().catch(() => { })
            ).catch(() => { });
          }

          setIsPgReady(true);

          // DeskApp: yalnızca config.db is_configured — legacy localStorage tek başına wizard atlamasın
          const forceWizard = consumeForceSetupWizard();
          const configured = !forceWizard && config?.is_configured === true;
          if (config) {
            applyConfig(configured ? config : { ...config, is_configured: false });
          } else {
            applyConfig({ is_configured: false });
          }

          safeInvoke('check_pg16').then((exists: any) => {
            if (!exists) {
              setInstallingPg(true);
              safeInvoke('install_pg16').catch(() => { }).finally(() => setInstallingPg(false));
            }
          }).catch(() => { });

          startupCompleteRef.current = true;
          setIsInitialized(true);
          if ((window as any).removeLoader) (window as any).removeLoader();
        } else {
          // ── Web Flow ──────────────────────────────────────────────────────────
          await initializeFromSQLite();
          setIsPgReady(true);
          setIsConfigured(hasWebTenantResolution());
          startupCompleteRef.current = true;
          setIsInitialized(true);
          if ((window as any).removeLoader) (window as any).removeLoader();
        }
      } catch (err) {
        console.error('[Startup] Flow failed:', err);
        setIsPgReady(true);
        if (IS_TAURI) {
          // DeskApp: hata / timeout → SetupWizard (Login UUID modalına sıkışma)
          consumeForceSetupWizard();
          setIsConfigured(false);
        } else {
          setIsConfigured(localStorage.getItem('exretail_firma_donem_configured') === 'true');
        }
        startupCompleteRef.current = true;
        setIsInitialized(true);
      }
    };

    startupFlow();

    // Emergency fallback to prevent white screen if initialization hangs
    const emergencyTimer = setTimeout(() => {
      if (!startupCompleteRef.current) {
        console.warn('⚠️ Emergency initialization triggered - slow startup detected');

        const forceWizard = consumeForceSetupWizard();
        const cachedRaw = localStorage.getItem('retailex_web_config');
        let cacheIsConfigured = false;
        if (cachedRaw) {
          try {
            cacheIsConfigured = JSON.parse(cachedRaw)?.is_configured === true;
          } catch {
            /* ignore */
          }
        }

        if (IS_TAURI) {
          // Yalnızca cache’te açık is_configured:true → Login; aksi / force → SetupWizard
          // Legacy exretail_firma_donem_configured tek başına atlama yapmaz
          setIsConfigured(!forceWizard && cacheIsConfigured);
        } else {
          const hasLegacyFlag = localStorage.getItem('exretail_firma_donem_configured') === 'true';
          setIsConfigured(cacheIsConfigured || hasLegacyFlag);
        }

        setIsPgReady(true);
        startupCompleteRef.current = true;
        setIsInitialized(true);
      }

      const loader = document.getElementById('app-loader');
      if (loader) loader.remove();
      if ((window as any).removeLoader) (window as any).removeLoader();
    }, 10000);

    return () => clearTimeout(emergencyTimer);
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
  const updateStocksBatch = useProductStore((state) => state.updateStocksBatch);
  const updateCustomerPurchaseHistory = useCustomerStore((state) => state.updatePurchaseHistory);

  const handleSaleComplete = useCallback(async (sale: any) => {
    console.log('[App] handleSaleComplete called with:', sale);
    const receipt = String(sale?.receiptNumber ?? '').trim();
    if (receipt) {
      // Aynı fiş numarası zaten store'da varsa ikinci kez yazma.
      if ((sales || []).some(s => String(s?.receiptNumber ?? '').trim() === receipt)) {
        console.warn('[App] Duplicate sale ignored (already in store):', receipt);
        return;
      }
      // Kısa aralıkta tekrarlayan submit'i yut (double-click / modal tekrar tetiklenmesi).
      const nowMs = Date.now();
      const lastMs = recentSaleReceiptsRef.current.get(receipt) ?? 0;
      if (nowMs - lastMs < 15000) {
        console.warn('[App] Duplicate sale ignored (recent submit guard):', receipt);
        return;
      }
      recentSaleReceiptsRef.current.set(receipt, nowMs);
      for (const [k, ts] of recentSaleReceiptsRef.current.entries()) {
        if (nowMs - ts > 10 * 60 * 1000) recentSaleReceiptsRef.current.delete(k);
      }
    }
    try {
      await addSale(sale);

      const prods = products || [];
      const stockMap = new Map<string, number>(prods.map((p) => [p.id, Number(p.stock ?? 0)]));
      let recipes: any[] = [];
      try {
        recipes = useRestaurantStore.getState()?.recipes || [];
      } catch (e) {
        logger.warn('[App] Could not get restaurantStore recipes', e);
      }

      // Not: Normal ürün stokları satış kaydı sırasında backend'de güncellenir.
      // Burada yalnızca reçete bağlı malzeme tüketimini düşüyoruz.
      for (const item of sale.items || []) {
        const pid = item.productId;
        const qty = Number(item.quantity || 0);
        if (!pid || !UUID_RE.test(String(pid))) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const recipe = recipes.find((r: any) => r.menuItemId === pid);
        if (recipe?.ingredients?.length) {
          for (const ingredient of recipe.ingredients) {
            const mid = ingredient.materialId;
            if (!mid || !stockMap.has(mid)) continue;
            const ingredientQty = Number(ingredient.quantity || 0);
            if (!Number.isFinite(ingredientQty) || ingredientQty <= 0) continue;
            const usedAmount = ingredientQty * qty;
            stockMap.set(mid, stockMap.get(mid)! - usedAmount);
          }
        }
      }

      const stockUpdates: { id: string; quantity: number }[] = [];
      for (const p of prods) {
        const newStock = stockMap.get(p.id);
        if (newStock === undefined) continue;
        const normalizedStock = Number(newStock);
        if (!Number.isFinite(normalizedStock)) {
          logger.warn('[App] Geçersiz stok değeri atlandı', { productId: p.id, rawStock: newStock });
          continue;
        }
        if (!UUID_RE.test(String(p.id || ''))) continue;
        if (normalizedStock !== Number(p.stock ?? 0)) {
          stockUpdates.push({ id: p.id, quantity: normalizedStock });
        }
      }
      if (stockUpdates.length > 0) {
        try {
          await updateStocksBatch(stockUpdates);
        } catch (stockError) {
          console.error('[App] Stock update failed after sale save:', stockError);
          logger.warn('Satış kaydedildi ancak stok güncellemesinde hata oluştu', stockError);
          alert('Satış kaydedildi, ancak bazı stoklar güncellenemedi. Lütfen stokları kontrol edin.');
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
  }, [addSale, products, sales, updateStocksBatch, updateCustomerPurchaseHistory]);

  const handleLogout = useCallback(() => {
    logout();
    localStorage.removeItem('exretail_firma_donem_configured');
  }, [logout]);

  // Yükleme ekranı: siyah yerine gradient arka plan, böylece ekran boş görünmez
  if (isConfigured === null || !isPgReady || installingPg) {
    return (
      <div className="fixed inset-0 flex items-center justify-center animate-in fade-in duration-300 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center flex flex-col items-center gap-6">
          <NeonLogo size="lg" className="animate-pulse justify-center" productLine={readNeonProductLineFromStorage()} />
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          {installingPg && (
            <p className="text-slate-300 text-sm animate-pulse">Veritabanı hazırlanıyor, lütfen bekleyin.</p>
          )}
          <p className="text-slate-400 text-sm">Uygulama başlatılıyor...</p>
          <div className="text-blue-400/80 text-xs font-mono tracking-widest uppercase">v{version}</div>
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
              <div className="text-center flex flex-col items-center gap-6">
                <NeonLogo size="lg" className="animate-pulse justify-center" productLine={readNeonProductLineFromStorage()} />
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-slate-400 text-sm">Yükleniyor...</p>
              </div>
            </div>
          ) : (IS_TAURI && !isConfigured) ? (
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


