import { Navigate } from 'react-router-dom';
import { Spin, Typography } from 'antd';
import { useAuth } from '../../src/contexts/AuthContext';

type Props = {
  children: React.ReactNode;
};

/** ERP Tailwind kullanmayan koruma — yalnızca Ant Design. */
export function AdminProtectedRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="rex-eticaret-admin-loading">
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            Yükleniyor…
          </Typography.Paragraph>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const currentPath = window.location.pathname;
    return <Navigate to={`/login?from=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <>{children}</>;
}
