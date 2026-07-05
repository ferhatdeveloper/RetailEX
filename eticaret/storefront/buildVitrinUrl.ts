/** /magaza/:tenant/... → izole Ella vitrin iframe URL */

const VARIANT_HOME: Record<string, string> = {
  'ella-classic': 'index.html',
  'ella-fashion': 'index-2.html',
  'ella-trendy': 'index-3.html',
  'ella-beauty': 'index-4.html',
  'ella-jewelry': 'index-5.html',
  'ella-shoes': 'index-6.html',
  'ella-auto': 'index-7.html',
  'ella-pet': 'index-8.html',
  'ella-surf': 'index-9.html',
  'ella-electronic': 'index-10.html',
};

const STATIC_PAGE_MAP: Record<string, string> = {
  sepet: 'page-cart.html',
  odeme: 'checkout.html',
  iletisim: 'contact-us.html',
  hakkimizda: 'about-us.html',
  blog: 'blog-default.html',
  favoriler: 'wishlists.html',
  kayit: 'register.html',
};

function readLocalEticaretSettings(): {
  activeVariantId?: string;
  demoMode?: boolean;
  demoTenantCode?: string;
  announcementText?: string;
  storeTitle?: string;
} {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('retailex_eticaret_settings');
    return raw ? (JSON.parse(raw) as ReturnType<typeof readLocalEticaretSettings>) : {};
  } catch {
    return {};
  }
}

function parseStorefrontPath(pathname: string): {
  base: 'magaza' | 'shop';
  tenant: string;
  page: string;
  productCode?: string;
  staticSlug?: string;
} {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const base = parts[0] === 'shop' ? 'shop' : 'magaza';
  const tenant = parts[1] || 'demo';
  if (parts[2] === 'kategori') {
    return { base, tenant, page: 'category' };
  }
  if (parts[2] === 'urun' && parts[3]) {
    return { base, tenant, page: 'product', productCode: decodeURIComponent(parts[3]) };
  }
  if (parts[2] === 'sepet') return { base, tenant, page: 'static', staticSlug: 'sepet' };
  if (parts[2] === 'odeme') return { base, tenant, page: 'static', staticSlug: 'odeme' };
  if (parts[2] === 'sayfa' && parts[3]) {
    return { base, tenant, page: 'static', staticSlug: parts[3] };
  }
  return { base, tenant, page: 'home' };
}

export function buildVitrinIframeSrc(pathname: string): string {
  const settings = readLocalEticaretSettings();
  const parsed = parseStorefrontPath(pathname);
  const variantId = settings.activeVariantId || 'ella-classic';

  let htmlFile = VARIANT_HOME[variantId] || 'index.html';
  if (parsed.page === 'static' && parsed.staticSlug) {
    htmlFile = STATIC_PAGE_MAP[parsed.staticSlug] || 'about-us.html';
  } else if (parsed.page === 'product') {
    htmlFile = 'product-layout-default.html';
  } else if (parsed.page === 'category') {
    htmlFile = 'category-right-sidebar.html';
  }

  const qs = new URLSearchParams();
  qs.set('rex_tenant', parsed.tenant);
  qs.set('rex_variant', variantId);
  qs.set('rex_page', parsed.page);
  if (parsed.productCode) qs.set('rex_product', parsed.productCode);
  if (parsed.staticSlug) qs.set('rex_static', parsed.staticSlug);
  if (settings.demoMode) qs.set('rex_demo', '1');
  if (settings.demoTenantCode) qs.set('rex_demo_tenant', settings.demoTenantCode);
  if (settings.storeTitle) qs.set('rex_title', settings.storeTitle);
  if (settings.announcementText) qs.set('rex_announce', settings.announcementText);

  return `/eticaret-static/ella/${htmlFile}?${qs.toString()}`;
}

export function buildStorefrontAppPath(tenant: string, subpath = ''): string {
  const clean = subpath.replace(/^\/+/, '');
  return `/magaza/${encodeURIComponent(tenant)}${clean ? `/${clean}` : ''}`;
}
