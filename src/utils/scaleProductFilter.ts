import type { Product } from '../core/types';

/** Ürün teraziye aktarım için işaretli mi? */
export function isScaleProductFlag(product: Product | Record<string, unknown>): boolean {
  const p = product as Product & { is_scale_product?: boolean };
  if (p.isScaleProduct === true) return true;
  if (p.is_scale_product === true) return true;
  return false;
}

/** Aktif ürün mü? (pasif kg ürünler teraziye gönderilmez) */
export function isProductActiveForScale(product: Product | Record<string, unknown>): boolean {
  const p = product as Product & { is_active?: boolean; status?: string };
  if (p.isActive === false || p.is_active === false) return false;
  const status = String(p.status ?? '').trim().toLocaleLowerCase('tr-TR');
  if (status === 'passive' || status === 'pasif' || status === 'inactive') return false;
  return true;
}

/** Terazi gönderim listesi: tartı ürünü + aktif */
export function isScaleSyncCandidate(product: Product | Record<string, unknown>): boolean {
  return isScaleProductFlag(product) && isProductActiveForScale(product);
}
