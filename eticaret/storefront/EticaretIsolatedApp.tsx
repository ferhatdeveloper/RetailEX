import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { buildVitrinIframeSrc } from './buildVitrinUrl';

function StorefrontFrame() {
  const location = useLocation();
  const src = useMemo(() => buildVitrinIframeSrc(location.pathname), [location.pathname]);

  return (
    <iframe
      key={src}
      className="rex-eticaret-frame"
      title="Online Mağaza"
      src={src}
      allow="fullscreen"
    />
  );
}

/**
 * ERP'den tamamen izole online mağaza — yalnızca Ella HTML iframe.
 * Tailwind / Ant Design / RetailEX global CSS yüklenmez.
 */
export function EticaretIsolatedApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/magaza/*" element={<StorefrontFrame />} />
        <Route path="/shop/*" element={<StorefrontFrame />} />
        <Route path="*" element={<Navigate to="/magaza/demo" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
