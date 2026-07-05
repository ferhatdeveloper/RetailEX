import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StorefrontHomePage } from './pages/StorefrontHomePage';
import { StorefrontCategoryPage } from './pages/StorefrontCategoryPage';
import { StorefrontProductPage } from './pages/StorefrontProductPage';
import { StorefrontStaticPage } from './pages/StorefrontStaticPage';

/** SaaS online mağaza — `/magaza/:tenantCode` */
export function EticaretStorefrontApp() {
  const location = useLocation();
  const base = location.pathname.startsWith('/shop') ? '/shop' : '/magaza';

  return (
    <Routes>
      <Route path="/:tenantCode" element={<StorefrontHomePage />} />
      <Route path="/:tenantCode/kategori" element={<StorefrontCategoryPage />} />
      <Route path="/:tenantCode/urun/:productCode" element={<StorefrontProductPage />} />
      <Route path="/:tenantCode/sepet" element={<StorefrontStaticPage fixedSlug="sepet" />} />
      <Route path="/:tenantCode/odeme" element={<StorefrontStaticPage fixedSlug="odeme" />} />
      <Route path="/:tenantCode/sayfa/:pageSlug" element={<StorefrontStaticPage />} />
      <Route path="*" element={<Navigate to={`${base}/demo`} replace />} />
    </Routes>
  );
}
