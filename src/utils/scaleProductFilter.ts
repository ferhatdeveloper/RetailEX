import type { Product } from '../core/types';

/** Ürün teraziye aktarım için işaretli mi? */
export function isScaleProductFlag(product: Product | Record<string, unknown>): boolean {
  const p = product as Product & { is_scale_product?: boolean };
  if (p.isScaleProduct === true) return true;
  if (p.is_scale_product === true) return true;
  return false;
}
