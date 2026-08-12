import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { buildVitrinIframeSrc, type VitrinBuildConfig } from './buildVitrinUrl';

function parseRouteTenant(pathname: string): string {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  return (parts[1] || 'demo').trim().toLowerCase();
}

function StorefrontFrame() {
  const location = useLocation();
  const tenant = parseRouteTenant(location.pathname);
  const [config, setConfig] = useState<VitrinBuildConfig | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    void fetch(`/api/eticaret/storefront-config?tenant=${encodeURIComponent(tenant)}`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VitrinBuildConfig | null) => {
        if (cancelled) return;
        if (data && data.enabled === false) {
          setClosed(true);
          setConfig({});
        } else {
          setClosed(false);
          setConfig(data || {});
        }
      })
      .catch(() => {
        if (!cancelled) setConfig({});
      });
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  const src = useMemo(
    () => (config ? buildVitrinIframeSrc(location.pathname, config) : ''),
    [location.pathname, config],
  );

  if (!config) {
    return <div className="rex-eticaret-loading">Mağaza yükleniyor…</div>;
  }

  if (closed) {
    return (
      <div className="rex-eticaret-loading">
        <p>Bu mağaza şu an kapalı.</p>
      </div>
    );
  }

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
 * Ayarlar kiracı DB + merkez registry'den köprü API ile yüklenir.
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
