import type { Product } from '../core/types';

function readBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function readDateOnly(v: unknown): Date | null {
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Ürün kartındaki efektif son kullanma tarihi (SKT veya raf ömrü + oluşturma). */
export function getProductEffectiveExpiryDate(product: Partial<Product> | null | undefined): Date | null {
  if (!product) return null;
  const tracking = readBool(product.expiryTracking ?? (product as any).expiry_tracking);
  if (!tracking) return null;

  const direct = product.expiryDate ?? (product as any).expiry_date;
  const fromDirect = readDateOnly(direct);
  if (fromDirect) return fromDirect;

  const shelfDays = Number(product.shelfLifeDays ?? (product as any).shelf_life_days ?? 0);
  const created = product.created_at ?? (product as any).created_at;
  if (shelfDays > 0 && created) {
    const base = new Date(String(created));
    if (!Number.isFinite(base.getTime())) return null;
    base.setDate(base.getDate() + Math.round(shelfDays));
    base.setHours(23, 59, 59, 999);
    return base;
  }
  return null;
}

export function isProductExpired(product: Partial<Product> | null | undefined, at: Date = new Date()): boolean {
  const expiry = getProductEffectiveExpiryDate(product);
  if (!expiry) return false;
  return at.getTime() > expiry.getTime();
}

export function formatProductExpiryDate(
  product: Partial<Product> | null | undefined,
  locale = 'tr-TR'
): string | null {
  const d = getProductEffectiveExpiryDate(product);
  if (!d) return null;
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
