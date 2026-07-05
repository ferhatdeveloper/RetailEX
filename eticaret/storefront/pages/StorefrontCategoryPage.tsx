import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { fetchTenantCatalog } from '../../core/catalogApi';
import type { StorefrontProduct } from '../../core/types';
import { useStorefrontContext } from '../hooks/useStorefrontContext';
import { EllaThemeAssets } from '../layout/EllaThemeAssets';
import { EllaHeader } from '../layout/EllaHeader';
import { EllaFooter } from '../layout/EllaFooter';
import { ProductCard } from '../components/ProductCard';

export function StorefrontCategoryPage() {
  const { tenantCode: routeTenant } = useParams<{ tenantCode: string }>();
  const { ctx, loading: ctxLoading } = useStorefrontContext(routeTenant);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await fetchTenantCatalog(ctx.catalogTenantCode, { limit: 48, context: ctx });
      if (!cancelled) {
        setProducts(result.products);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  if (ctxLoading || !ctx) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const { tenant, settings } = ctx;

  return (
    <div className="page-wrapper">
      <EllaThemeAssets settings={settings} />
      <EllaHeader
        tenantCode={tenant.tenantCode}
        displayName={tenant.displayName}
        settings={settings}
      />
      <main className="container container-1170" style={{ padding: '32px 0' }}>
        <h1 className="page-header text-center uppercase" style={{ marginBottom: 24 }}>
          Tüm Ürünler
        </h1>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : (
          <div className="row">
            {products.map((p) => (
              <ProductCard key={p.id} tenantCode={tenant.tenantCode} product={p} />
            ))}
          </div>
        )}
      </main>
      <EllaFooter tenantCode={tenant.tenantCode} />
    </div>
  );
}
