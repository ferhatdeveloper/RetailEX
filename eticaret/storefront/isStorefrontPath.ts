/** Online mağaza yolu mu? ERP CSS/React yüklenmez. */
export function isEticaretStorefrontPath(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return /^\/(magaza|shop)(\/|$)/.test(p);
}
