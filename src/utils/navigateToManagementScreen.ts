/**
 * Fatura seçim modallarından ilgili yönetim ekranına geçiş.
 * Önce management kabuğuna alır, sonra ekranı açar.
 */
export function navigateToManagementScreen(screen: string): void {
  const id = String(screen || '').trim();
  if (!id || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('switchToManagement'));
  window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: id }));
}
