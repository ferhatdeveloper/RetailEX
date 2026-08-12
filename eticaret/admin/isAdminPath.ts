/** E-ticaret yönetim paneli (/mgz) — ERP CSS/React bootstrap yüklenmez. */
export function isEticaretAdminPath(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return /^\/mgz(\/|$)/.test(p);
}
