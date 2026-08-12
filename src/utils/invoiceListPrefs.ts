export type InvoiceListPrefs = {
  dateFilter?: string;
  /** dateFilter === 'range' iken başlangıç (YYYY-MM-DD) */
  customDateFrom?: string;
  /** dateFilter === 'range' iken bitiş (YYYY-MM-DD, dahil) */
  customDateTo?: string;
  invoiceTypeFilter?: string;
  statusFilter?: string;
  detailInvoiceId?: string | null;
  showDetail?: boolean;
};

export function invoiceListPrefsKey(
  defaultCategory?: string,
  defaultInvoiceTypeFilter?: string,
): string {
  return `retailex_invoice_list_prefs_v2_${defaultCategory || 'all'}_${defaultInvoiceTypeFilter || 'all'}`;
}

export function loadInvoiceListPrefs(key: string): InvoiceListPrefs | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as InvoiceListPrefs;
  } catch {
    return null;
  }
}

export function saveInvoiceListPrefs(key: string, prefs: InvoiceListPrefs): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}
