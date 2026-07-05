import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Spin } from 'antd';
import { fetchTenantProductByCode } from '../../core/catalogApi';
import { resolveEticaretTenant, buildStorefrontBasePath } from '../../core/tenantResolver';
import type { StorefrontProduct } from '../../core/types';
import { EllaThemeAssets } from '../layout/EllaThemeAssets';
import { EllaHeader } from '../layout/EllaHeader';
import { EllaFooter } from '../layout/EllaFooter';

export function StorefrontProductPage() {
  const { tenantCode: routeTenant, productCode } = useParams<{
    tenantCode: string;
    productCode: string;
  }>();
  const tenant = resolveEticaretTenant({ pathTenantCode: routeTenant });
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const base = buildStorefrontBasePath(tenant.tenantCode);

  useEffect(() => {
    if (!productCode) return;
    let cancelled = false;
    void (async () => {
      const p = await fetchTenantProductByCode(tenant.tenantCode, decodeURIComponent(productCode));
      if (!cancelled) {
        setProduct(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant.tenantCode, productCode]);

  return (
    <div className="page-wrapper">
      <EllaThemeAssets />
      <EllaHeader tenantCode={tenant.tenantCode} />
      <main className="container container-1170" style={{ padding: '32px 0' }}>
        <Link to={base} style={{ fontSize: 13 }}>← Mağazaya dön</Link>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : product ? (
          <div className="row" style={{ marginTop: 24 }}>
            <div className="col-md-6">
              <img src={product.imageUrl} alt={product.name} style={{ width: '100%' }} />
            </div>
            <div className="col-md-6">
              <p className="product-card__vendor">{product.vendor}</p>
              <h1>{product.name}</h1>
              <p className="price" style={{ fontSize: 24, fontWeight: 600 }}>
                {product.price.toLocaleString('tr-TR', { style: 'currency', currency: product.currency })}
              </p>
              <p>{product.inStock ? 'Stokta' : 'Tükendi'}</p>
              <Link to={`${base}/sepet`} className="button button-ATC" style={{ display: 'inline-block', marginTop: 16 }}>
                Sepete ekle
              </Link>
            </div>
          </div>
        ) : (
          <p>Ürün bulunamadı.</p>
        )}
      </main>
      <EllaFooter tenantCode={tenant.tenantCode} />
    </div>
  );
}
