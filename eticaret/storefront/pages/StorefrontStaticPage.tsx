import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { resolveEticaretTenant } from '../../core/tenantResolver';

const PAGE_MAP: Record<string, string> = {
  iletisim: 'contact-us.html',
  hakkimizda: 'about-us.html',
  sepet: 'page-cart.html',
  odeme: 'checkout.html',
  blog: 'blog-default.html',
  favoriler: 'wishlists.html',
  kayit: 'register.html',
};

type Props = {
  fixedSlug?: string;
};

export function StorefrontStaticPage({ fixedSlug }: Props) {
  const { tenantCode: routeTenant, pageSlug } = useParams<{ tenantCode: string; pageSlug: string }>();
  const tenant = resolveEticaretTenant({ pathTenantCode: routeTenant });
  const slug = fixedSlug ?? pageSlug ?? 'hakkimizda';

  const src = useMemo(() => {
    const file = PAGE_MAP[slug] ?? 'about-us.html';
    const qs = new URLSearchParams({
      tenant: tenant.tenantCode,
      demo: tenant.source === 'demo' ? '1' : '0',
    });
    return `/eticaret-static/ella/${file}?${qs.toString()}`;
  }, [slug, tenant.source, tenant.tenantCode]);

  return (
    <iframe
      title={`${tenant.tenantCode}-${slug}`}
      src={src}
      style={{ width: '100%', minHeight: '100vh', border: 0 }}
    />
  );
}
