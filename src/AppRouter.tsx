/**
 * ExRetailOS - Main App Router with Authentication
 * 
 * Routes with authentication integration
 * 
 * @created 2024-12-24
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { Login } from './components/system/Login';
import { InfrastructureSettingsPage } from './components/system/InfrastructureSettingsPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import App from './App';
import { Toaster } from 'sonner';

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
      <ThemeProvider>
        <LanguageProvider>
          <Toaster
            richColors
            position="top-right"
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
            <AuthProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login onLogin={() => { }} />} />
                <Route path="/infra-settings" element={<InfrastructureSettingsPage />} />

                {/* Protected routes */}
                <Route
                  path="/*"
                  element={<App />}
                />
              </Routes>
            </AuthProvider>
          </Router>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default AppRouter;
