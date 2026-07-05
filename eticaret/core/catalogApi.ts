import { fetchRetailexAware } from '../../src/utils/retailexDevProxy';
import {
  buildStorefrontContext,
  firmNrCandidates,
  productTableForFirm,
  type StorefrontContext,
} from './tenantContext';
import type { StorefrontProduct } from './types';

const PLACEHOLDER_IMG = '/eticaret-static/ella/assets/images/card-product/img-14.jpg';
const PLACEHOLDER_HOVER = '/eticaret-static/ella/assets/images/card-product/img-13.jpg';

const PRODUCT_SELECT =
  'id,code,barcode,name,price,cost,image_url,image_url_cdn,stock,brand,currency,is_active';

function mapRowToProduct(row: Record<string, unknown>, currency: string): StorefrontProduct | null {
  const id = String(row.id ?? row.code ?? '').trim();
  const name = String(row.name ?? row.title ?? row.description ?? '').trim();
  if (!id || !name) return null;
  if (row.is_active === false) return null;

  const price = Number(row.price ?? row.sale_price ?? row.list_price ?? 0) || 0;
  const cost = Number(row.cost ?? 0) || 0;
  const compare = cost > price ? cost : Number(row.compare_at_price ?? 0) || undefined;

  const imageUrl =
    String(row.image_url_cdn ?? row.image_url ?? row.image ?? row.thumbnail ?? '').trim() ||
    PLACEHOLDER_IMG;

  const stock = Number(row.stock ?? row.quantity ?? 0);
  const rowCurrency = String(row.currency ?? currency).trim() || currency;

  return {
    id,
    code: String(row.code ?? row.barcode ?? id),
    name,
    price,
    compareAtPrice: compare && compare > price ? compare : undefined,
    currency: rowCurrency,
    imageUrl,
    hoverImageUrl: PLACEHOLDER_HOVER,
    vendor: String(row.brand ?? row.vendor ?? 'RetailEX').trim() || 'RetailEX',
    badge: row.is_new ? 'Yeni' : compare && compare > price ? 'İndirim' : undefined,
    inStock: stock > 0,
  };
}

async function fetchJson(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetchRetailexAware(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function resolveContext(
  tenantCode: string,
  context?: StorefrontContext,
): Promise<StorefrontContext> {
  if (context) return context;
  const ctx = await buildStorefrontContext(tenantCode);
  return ctx;
}

/**
 * Kiracı PostgREST üzerinden `rex_{firm}_products` listesi.
 */
export async function fetchTenantCatalog(
  tenantCode: string,
  options?: {
    limit?: number;
    search?: string;
    context?: StorefrontContext;
    demoMode?: boolean;
    catalogFirmNr?: string;
  },
): Promise<{ products: StorefrontProduct[]; currency: string; source: string }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 24));
  const ctx = await resolveContext(tenantCode, options?.context);
  const demoMode = options?.demoMode ?? ctx.settings.demoMode;
  const catalogFirmNr = options?.catalogFirmNr?.trim() || ctx.settings.catalogFirmNr?.trim();

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const q = new URLSearchParams({ tenant: ctx.catalogTenantCode, limit: String(limit) });
    if (options?.search?.trim()) q.set('search', options.search.trim());
    if (catalogFirmNr) q.set('catalog_firm_nr', catalogFirmNr);
    const res = await fetch(`${origin}/api/eticaret/catalog?${q.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        products?: StorefrontProduct[];
        currency?: string;
        demo?: boolean;
      };
      if (Array.isArray(data.products) && data.products.length) {
        return {
          products: data.products,
          currency: data.currency || ctx.currency,
          source: `bridge/catalog (${ctx.catalogTenantCode})`,
        };
      }
      if (!demoMode) {
        return { products: [], currency: data.currency || ctx.currency, source: 'bridge-empty' };
      }
    }
  } catch {
    /* PostgREST fallback */
  }

  const { restBase, firmNr, currency, catalogTenantCode, settings } = ctx;

  const firms = settings.catalogFirmNr?.trim() ? [firmNr] : firmNrCandidates(firmNr);
  for (const firm of firms) {
    const table = productTableForFirm(firm);
    const q = new URLSearchParams({
      limit: String(limit),
      select: PRODUCT_SELECT,
      is_active: 'eq.true',
      order: 'code.asc',
    });
    if (options?.search?.trim()) {
      const term = options.search.trim();
      q.set('or', `(name.ilike.*${term}*,code.ilike.*${term}*,barcode.ilike.*${term}*)`);
    }

    const rows = await fetchJson(`${restBase}/${table}?${q.toString()}`);
    if (rows?.length) {
      const products = rows
        .map((r) => mapRowToProduct(r as Record<string, unknown>, currency))
        .filter((p): p is StorefrontProduct => p != null);
      if (products.length) {
        return {
          products,
          currency,
          source: `${restBase}/${table} (${catalogTenantCode})`,
        };
      }
    }
  }

  return {
    products: demoMode ? buildDemoProducts(catalogTenantCode) : [],
    currency,
    source: demoMode ? 'demo-fallback' : 'empty',
  };
}

export function buildDemoProducts(tenantCode: string): StorefrontProduct[] {
  const label = tenantCode.toUpperCase();
  return Array.from({ length: 8 }, (_, i) => ({
    id: `demo-${tenantCode}-${i + 1}`,
    code: `${label}-${String(i + 1).padStart(3, '0')}`,
    name: `${label} Ürün ${i + 1}`,
    price: 199 + i * 50,
    compareAtPrice: i % 2 === 0 ? 299 + i * 50 : undefined,
    currency: 'TRY',
    imageUrl: PLACEHOLDER_IMG,
    hoverImageUrl: PLACEHOLDER_HOVER,
    vendor: label,
    badge: i === 0 ? 'Yeni' : i === 2 ? 'İndirim' : undefined,
    inStock: true,
  }));
}

export async function fetchTenantProductByCode(
  tenantCode: string,
  productCode: string,
  context?: StorefrontContext,
): Promise<StorefrontProduct | null> {
  const ctx = await resolveContext(tenantCode, context);
  const code = decodeURIComponent(productCode).trim();

  const q = new URLSearchParams({
    select: PRODUCT_SELECT,
    is_active: 'eq.true',
    limit: '1',
    or: `(code.eq.${code},barcode.eq.${code},id.eq.${code})`,
  });

  for (const firm of ctx.settings.catalogFirmNr?.trim() ? [ctx.firmNr] : firmNrCandidates(ctx.firmNr)) {
    const table = productTableForFirm(firm);
    const rows = await fetchJson(`${ctx.restBase}/${table}?${q.toString()}`);
    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (row) {
      const mapped = mapRowToProduct(row, ctx.currency);
      if (mapped) return mapped;
    }
  }

  const { products } = await fetchTenantCatalog(tenantCode, { limit: 100, context: ctx });
  return products.find((p) => p.code === code || p.id === code) ?? null;
}
