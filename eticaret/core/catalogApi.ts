import { fetchTenantRegistryRow } from '../../src/services/merkezTenantRegistry';
import type { StorefrontProduct } from './types';

const PLACEHOLDER_IMG = '/eticaret-static/ella/assets/images/card-product/img-14.jpg';
const PLACEHOLDER_HOVER = '/eticaret-static/ella/assets/images/card-product/img-13.jpg';

function mapRowToProduct(row: Record<string, unknown>, currency: string): StorefrontProduct | null {
  const id = String(row.id ?? row.code ?? '').trim();
  const name = String(row.name ?? row.title ?? row.description ?? '').trim();
  if (!id || !name) return null;
  const price = Number(row.price ?? row.sale_price ?? row.list_price ?? 0) || 0;
  const compare = Number(row.compare_at_price ?? row.list_price ?? 0) || undefined;
  return {
    id,
    code: String(row.code ?? row.barcode ?? id),
    name,
    price,
    compareAtPrice: compare && compare > price ? compare : undefined,
    currency,
    imageUrl: String(row.image_url ?? row.image ?? row.thumbnail ?? '').trim() || PLACEHOLDER_IMG,
    hoverImageUrl: PLACEHOLDER_HOVER,
    vendor: String(row.brand ?? row.vendor ?? 'RetailEX').trim() || 'RetailEX',
    badge: row.is_new ? 'Yeni' : row.on_sale ? 'İndirim' : undefined,
    inStock: Number(row.stock ?? row.quantity ?? 1) > 0,
  };
}

async function fetchJson(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Kiracı PostgREST üzerinden ürün listesi.
 * Tablo adları kuruluma göre değişebilir; sırayla dener.
 */
export async function fetchTenantCatalog(
  tenantCode: string,
  options?: { limit?: number; search?: string },
): Promise<{ products: StorefrontProduct[]; currency: string; source: string }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 24));
  let restBase = `https://api.retailex.app/${encodeURIComponent(tenantCode)}`;

  try {
    const row = await fetchTenantRegistryRow(tenantCode);
    if (row?.rest_base_url) {
      restBase = String(row.rest_base_url).replace(/\/+$/, '');
    }
  } catch {
    /* registry yoksa varsayılan API yolu */
  }

  const tables = ['items', 'products', 'materials', 'rex_items'];
  for (const table of tables) {
    const q = new URLSearchParams({ limit: String(limit), select: '*' });
    if (options?.search?.trim()) {
      q.set('or', `(name.ilike.*${options.search.trim()}*,code.ilike.*${options.search.trim()}*)`);
    }
    const rows = await fetchJson(`${restBase}/${table}?${q.toString()}`);
    if (rows?.length) {
      const products = rows
        .map((r) => mapRowToProduct(r as Record<string, unknown>, 'TRY'))
        .filter((p): p is StorefrontProduct => p != null);
      if (products.length) {
        return { products, currency: 'TRY', source: `${restBase}/${table}` };
      }
    }
  }

  return { products: buildDemoProducts(tenantCode), currency: 'TRY', source: 'demo-fallback' };
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
): Promise<StorefrontProduct | null> {
  const { products } = await fetchTenantCatalog(tenantCode, { limit: 100 });
  return products.find((p) => p.code === productCode || p.id === productCode) ?? null;
}
