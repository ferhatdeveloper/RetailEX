import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { fetchTenantCatalog } from '../../core/catalogApi';
import { resolveEticaretTenant } from '../../core/tenantResolver';
import type { StorefrontProduct } from '../../core/types';
import { EllaThemeAssets } from '../layout/EllaThemeAssets';
import { EllaHeader } from '../layout/EllaHeader';
import { EllaFooter } from '../layout/EllaFooter';
import { ProductCard } from '../components/ProductCard';

export function StorefrontCategoryPage() {
  const { tenantCode: routeTenant } = useParams<{ tenantCode: string }>();
  const tenant = resolveEticaretTenant({ pathTenantCode: routeTenant });
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchTenantCatalog(tenant.tenantCode, { limit: 48 });
      if (!cancelled) {
        setProducts(result.products);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.tenantCode]);

  return (
    <div className="page-wrapper">
      <EllaThemeAssets />
      <EllaHeader tenantCode={tenant.tenantCode} />
      <main className="container container-1170" style={{ padding: '32px 0' }}>
        <h1 className="page-header text-center uppercase" style={{ marginBottom: 24 }}>
          Tüm Ürünler
        </h1>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : (
          <div className="row">{products.map((p) => (
            <ProductCard key={p.id} tenantCode={tenant.tenantCode} product={p} />
          ))}</div>
        )}
      </main>
      <EllaFooter tenantCode={tenant.tenantCode} />
    </div>
  );
}
