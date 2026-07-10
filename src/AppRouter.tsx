/**
 * ExRetailOS - Main App Router with Authentication
 *
 * Login + providers eager; App ve diğer ağır ekranlar lazy (Android ilk açılış).
 */

import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AntDesignThemeProvider } from './theme/AntDesignThemeProvider';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeSyncToaster } from './components/system/ThemeSyncToaster';
import { KasaDataArrivalBridge } from './components/system/KasaDataArrivalBridge';
import { ThemeAwarePageShell } from './components/system/ThemeAwarePageShell';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FirmaDonemProvider } from './contexts/FirmaDonemContext';
import { Login } from './components/system/Login';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const App = lazy(() => import('./App'));
const InfrastructureSettingsPage = lazy(() =>
  import('./components/system/InfrastructureSettingsPage').then((m) => ({
    default: m.InfrastructureSettingsPage,
  })),
);
const PublicBeautyBooking = lazy(() => import('./components/beauty/components/PublicBeautyBooking'));
const RoleManagement = lazy(() => import('./components/system/RoleManagement'));
const RoleForm = lazy(() => import('./components/system/RoleForm'));

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

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-slate-300 text-sm animate-pulse">Yükleniyor…</div>
    </div>
  );
}

/** Giriş yoksa Login (App chunk beklemeden); oturum varsa App lazy. */
function RootEntry() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!isAuthenticated) {
    return (
      <FirmaDonemProvider>
        <Login onLogin={() => {}} />
      </FirmaDonemProvider>
    );
  }
  return (
    <Suspense fallback={<RouteFallback />}>
      <App />
    </Suspense>
  );
}

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemeSyncToaster />
            <KasaDataArrivalBridge />
            <Router>
              <AntDesignThemeProvider>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route
                      path="/login"
                      element={
                        <FirmaDonemProvider>
                          <Login onLogin={() => {}} />
                        </FirmaDonemProvider>
                      }
                    />
                    <Route path="/infra-settings" element={<InfrastructureSettingsPage />} />
                    <Route path="/book/:firmNr" element={<PublicBeautyBooking />} />
                    <Route
                      path="/system/roles"
                      element={
                        <ProtectedRoute>
                          <ThemeAwarePageShell>
                            <RoleManagement />
                          </ThemeAwarePageShell>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/system/roles/new"
                      element={
                        <ProtectedRoute>
                          <ThemeAwarePageShell>
                            <RoleForm />
                          </ThemeAwarePageShell>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/system/roles/:id"
                      element={
                        <ProtectedRoute>
                          <ThemeAwarePageShell>
                            <RoleForm />
                          </ThemeAwarePageShell>
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/*" element={<RootEntry />} />
                  </Routes>
                </Suspense>
              </AntDesignThemeProvider>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default AppRouter;
