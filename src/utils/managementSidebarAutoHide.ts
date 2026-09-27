/**
 * Yönetim modülünde tam genişlik içerik (Genel Rapor, raporlar) açıkken
 * sol menü varsayılan olarak gizlenir; üst çubuk / Ctrl+B ile gösterilebilir.
 * Pin açıkken auto-hide uygulanmaz (localStorage tercihi).
 */

export const MANAGEMENT_SIDEBAR_PIN_KEY = 'retailex-management-sidebar-pinned';

const EXACT_SCREENS = new Set<string>([
  // Raporlar & Analiz
  'customreports',
  'grafana-report-builder',
  'reports',
  'category-group-profit-report',
  'product-analytics',
  'profit-dashboard',
  'bi-dashboard',
  'analytics-group',
  'sales-stock-group',
  'finance-reps-group',
  'advanced-reps-group',
  // Satış / stok / cari raporları
  'salesreports',
  'stockreports',
  'customeranalysis',
  'advanced-reports',
  'financereports',
  'graphanalysis',
  'universal-report-hub',
  // Muhasebe / analiz
  'mizan',
  'income-statement',
  'balance-sheet',
  'reconciliation',
  'customer-extract',
  'cari-debtors',
  'cari-creditors',
  'store-performance',
  'inventory-aging',
  'material-extract',
  // Malzeme raporları grubu
  'material-reports',
  'report-material-extract',
  'report-material-value',
  'inventory',
  'purchase-expiry-report',
  'cost',
  'report-in-out-totals',
  'report-warehouse-status',
  'report-transaction-breakdown',
  'report-slip-list',
  'report-min-max',
  'stockreports_bal',
  'stockreports_tr',
  'stockreports_list',
  'stockreports_sum',
  'stockreports_trans',
  'MMSR',
  'MLR',
  'Enr',
  'GCTR',
  'FLR',
  'MLADR',
  'MDR',
  'MER',
  'HDRR',
  'report-designer',
]);

export function shouldAutoHideManagementSidebar(screen: string | null | undefined): boolean {
  const id = String(screen ?? '').trim();
  if (!id || id === 'dashboard' || id === 'Dashboard') return false;
  if (EXACT_SCREENS.has(id)) return true;
  if (id.startsWith('report-')) return true;
  if (id.endsWith('reports')) return true;
  if (id.includes('-report')) return true;
  return false;
}

export function readManagementSidebarPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MANAGEMENT_SIDEBAR_PIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeManagementSidebarPinned(pinned: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MANAGEMENT_SIDEBAR_PIN_KEY, pinned ? '1' : '0');
  } catch {
    /* sessizce yoksay */
  }
}

/** Masaüstünde rapor ekranına geçerken menü kapanmalı mı? Pin açıksa hayır. */
export function shouldCollapseManagementSidebarOnNavigate(
  screen: string | null | undefined,
  pinned: boolean
): boolean {
  if (pinned) return false;
  return shouldAutoHideManagementSidebar(screen);
}
