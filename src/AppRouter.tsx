/**
 * ExRetailOS - Main App Router with Authentication
 * 
 * Routes with authentication integration
 * 
 * @created 2024-12-24
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AntDesignThemeProvider } from './theme/AntDesignThemeProvider';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeSyncToaster } from './components/system/ThemeSyncToaster';
import { KasaDataArrivalBridge } from './components/system/KasaDataArrivalBridge';
import { ThemeAwarePageShell } from './components/system/ThemeAwarePageShell';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { FirmaDonemProvider } from './contexts/FirmaDonemContext';
import { Login } from './components/system/Login';
import { InfrastructureSettingsPage } from './components/system/InfrastructureSettingsPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import App from './App';
import PublicBeautyBooking from './components/beauty/components/PublicBeautyBooking';
import { EticaretStorefrontApp } from '../eticaret/storefront/EticaretStorefrontApp';
import { RoleManagement } from './components/system/RoleManagement';
import { RoleForm } from './components/system/RoleForm';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 2 * 60 * 1000,
    },
  },
});

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Dil bağlamı Auth/Routes üstünde olmalı; aksi halde bazı ağaç düzenlerinde MainLayout useLanguage hatası verebilir */}
      <LanguageProvider>
        <ThemeProvider>
          {/*
            AuthProvider tüm Router + Routes’u sarar (yalnızca Routes değil).
            Aksi düzende veya çift React kopyasında usePermission → useAuth “provider yok” hatası görülebilir.
          */}
          <AuthProvider>
            <ThemeSyncToaster />
            <KasaDataArrivalBridge />
            <Router>
              <AntDesignThemeProvider>
                <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<FirmaDonemProvider><Login onLogin={() => { }} /></FirmaDonemProvider>} />
                  <Route path="/infra-settings" element={<InfrastructureSettingsPage />} />
                  <Route path="/book/:firmNr" element={<PublicBeautyBooking />} />
                  <Route path="/magaza/*" element={<EticaretStorefrontApp />} />
                  <Route path="/shop/*" element={<EticaretStorefrontApp />} />

                  {/* Protected routes */}
                  <Route
                    path="/system/roles"
                    element={
                      <ProtectedRoute>
                        <ThemeAwarePageShell><RoleManagement /></ThemeAwarePageShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/system/roles/new"
                    element={
                      <ProtectedRoute>
                        <ThemeAwarePageShell><RoleForm /></ThemeAwarePageShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/system/roles/:id"
                    element={
                      <ProtectedRoute>
                        <ThemeAwarePageShell><RoleForm /></ThemeAwarePageShell>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/*"
                    element={<App />}
                  />
                </Routes>
              </AntDesignThemeProvider>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default AppRouter;


