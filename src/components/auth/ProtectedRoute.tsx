/**
 * ExRetailOS - Protected Route Component
 * 
 * Route wrapper that requires authentication
 * 
 * @created 2024-12-24
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: {
    module: string;
    action: string;
  };
}

export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save current location for redirect after login
    const currentPath = window.location.pathname;
    return <Navigate to={`/login?from=${encodeURIComponent(currentPath)}`} replace />;
  }

  // Check permission if required
  if (requiredPermission) {
    if (!hasPermission(requiredPermission.module, requiredPermission.action)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-6xl mb-4">ğŸ”’</div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Erişim Reddedildi</h2>
            <p className="text-gray-600 mb-4">Bu sayfaya erişim yetkiniz bulunmamaktadır.</p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Geri Dön
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
