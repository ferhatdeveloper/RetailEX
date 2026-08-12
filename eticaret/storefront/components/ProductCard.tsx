import { Link } from 'react-router-dom';
import type { StorefrontProduct } from '../../core/types';
import { buildStorefrontBasePath } from '../../core/tenantResolver';

type Props = {
  tenantCode: string;
  product: StorefrontProduct;
};

export function ProductCard({ tenantCode, product }: Props) {
  const base = buildStorefrontBasePath(tenantCode);
  const price = product.price.toLocaleString('tr-TR', {
    style: 'currency',
    currency: product.currency || 'TRY',
  });

  return (
    <div className="product-item col-6 col-md-4 col-lg-3">
      <div className="product-card">
        <div className="product-card-top">
          <div className="product-card-media">
            <Link to={`${base}/urun/${encodeURIComponent(product.code)}`} className="media-link">
              <img src={product.imageUrl} alt={product.name} loading="lazy" />
              {product.hoverImageUrl ? (
                <img src={product.hoverImageUrl} alt={product.name} className="media-hover" loading="lazy" />
              ) : null}
            </Link>
            {product.badge ? <span className="badge badge-sale">{product.badge}</span> : null}
          </div>
        </div>
        <div className="product-card-bottom">
          <div className="product-card__vendor">{product.vendor}</div>
          <Link to={`${base}/urun/${encodeURIComponent(product.code)}`} className="product-card__title">
            {product.name}
          </Link>
          <div className="product-card__price">
            <span className="price">{price}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
