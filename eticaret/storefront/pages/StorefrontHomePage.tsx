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
import { loadEticaretSettings } from '../../core/settings';

export function StorefrontHomePage() {
  const { tenantCode: routeTenant } = useParams<{ tenantCode: string }>();
  const tenant = resolveEticaretTenant({ pathTenantCode: routeTenant });
  const settings = loadEticaretSettings();
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const result = await fetchTenantCatalog(tenant.tenantCode, { limit: 12 });
      if (!cancelled) {
        setProducts(result.products);
        setSource(result.source);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.tenantCode]);

  if (!settings.enabled) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        Online mağaza şu an kapalı. Sistem ayarlarından etkinleştirin.
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <EllaThemeAssets />
      <EllaHeader tenantCode={tenant.tenantCode} />
      <main>
        <section className="halo-block halo-product-block" style={{ padding: '32px 0' }}>
          <div className="container container-1170">
            <div className="halo-block-header text-center" style={{ marginBottom: 24 }}>
              <h2 className="title uppercase">{settings.storeTitle}</h2>
              <p className="desc">
                Kiracı: <strong>{tenant.tenantCode}</strong>
                {tenant.source === 'demo' ? ' · Demo önizleme' : ''}
              </p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <Spin size="large" />
              </div>
            ) : (
              <>
                <div className="row">
                  {products.map((p) => (
                    <ProductCard key={p.id} tenantCode={tenant.tenantCode} product={p} />
                  ))}
                </div>
                <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#888' }}>
                  Veri kaynağı: {source}
                </p>
              </>
            )}
          </div>
        </section>
      </main>
      <EllaFooter tenantCode={tenant.tenantCode} />
    </div>
  );
}
