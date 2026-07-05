import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { FirmaDonemProvider } from '../../src/contexts/FirmaDonemContext';
import { getRetailexAntdTheme } from '../../src/theme/retailexAntdTheme';
import { AdminProtectedRoute } from './AdminProtectedRoute';
import { EticaretAdminModule } from './EticaretAdminModule';

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

const adminTheme = getRetailexAntdTheme(false);

/**
 * /mgz e-ticaret yönetim paneli — ERP bootstrap (Tailwind, dark mode, MainLayout) yok.
 */
export function EticaretAdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfigProvider theme={adminTheme}>
          <BrowserRouter>
            <Routes>
              <Route
                path="/mgz/*"
                element={
                  <AdminProtectedRoute>
                    <FirmaDonemProvider>
                      <EticaretAdminModule />
                    </FirmaDonemProvider>
                  </AdminProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/mgz" replace />} />
            </Routes>
          </BrowserRouter>
        </ConfigProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
