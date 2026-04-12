/**
 * ExRetailOS - Main App Router with Authentication
 * 
 * Routes with authentication integration
 * 
 * @created 2024-12-24
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { retailexAntdTheme } from './theme/retailexAntdTheme';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { Login } from './components/system/Login';
import { InfrastructureSettingsPage } from './components/system/InfrastructureSettingsPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import App from './App';
import PublicBeautyBooking from './components/beauty/components/PublicBeautyBooking';
import { Toaster } from 'sonner';
import { RoleManagement } from './components/system/RoleManagement';
import { RoleForm } from './components/system/RoleForm';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Dil bağlamı Auth/Routes üstünde olmalı; aksi halde bazı ağaç düzenlerinde MainLayout useLanguage hatası verebilir */}
      <LanguageProvider>
        <ThemeProvider>
          <Toaster
            richColors
            position="bottom-right"
            expand={true}
            visibleToasts={5}
            toastOptions={{
              style: {
                marginBottom: '8px',
              },
              className: 'toast-item',
            }}
          />
          <Router>
            <ConfigProvider theme={retailexAntdTheme}>
              <AuthProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login onLogin={() => { }} />} />
                <Route path="/infra-settings" element={<InfrastructureSettingsPage />} />
                <Route path="/book/:firmNr" element={<PublicBeautyBooking />} />

                {/* Protected routes */}
                <Route
                  path="/system/roles"
                  element={
                    <ProtectedRoute>
                      <div className="h-screen w-full bg-slate-50"><RoleManagement /></div>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/system/roles/new"
                  element={
                    <ProtectedRoute>
                      <div className="h-screen w-full overflow-hidden bg-slate-50"><RoleForm /></div>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/system/roles/:id"
                  element={
                    <ProtectedRoute>
                      <div className="h-screen w-full overflow-hidden bg-slate-50"><RoleForm /></div>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/*"
                  element={<App />}
                />
              </Routes>
              </AuthProvider>
            </ConfigProvider>
          </Router>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default AppRouter;


