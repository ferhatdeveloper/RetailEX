// Invoice Queue System - Offline kesilen faturaları Logo'ya senkronize etmek için

export interface PendingInvoice {
  id: string;
  invoiceNo: string;
  type: 'sales' | 'purchase' | 'return';
  date: string;
  total: number;
  customerName: string;
  customerId?: string;
  items: any[];
  status: 'pending' | 'syncing' | 'synced' | 'error';
  createdAt: string;
  syncedAt?: string;
  error?: string;
}

const STORAGE_KEY = 'retailos_pending_invoices';

// Add invoice to pending queue
export function addPendingInvoice(invoice: Omit<PendingInvoice, 'status' | 'createdAt'>): void {
  const pendingInvoice: PendingInvoice = {
    ...invoice,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  const existing = getPendingInvoices();
  existing.push(pendingInvoice);
  
  // Save to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  
  // Dispatch event
  const event = new CustomEvent('retailos:new-invoice', { detail: pendingInvoice });
  window.dispatchEvent(event);
  
  console.log('[Invoice Queue] Invoice added:', invoice.invoiceNo);
}

// Get all pending invoices
export function getPendingInvoices(): PendingInvoice[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[Invoice Queue] Failed to load pending invoices:', error);
  }
  return [];
}

// Update invoice status
export function updateInvoiceStatus(invoiceId: string, status: PendingInvoice['status'], error?: string): void {
  const invoices = getPendingInvoices();
  const index = invoices.findIndex(inv => inv.id === invoiceId);
  
  if (index !== -1) {
    invoices[index].status = status;
    if (status === 'synced') {
      invoices[index].syncedAt = new Date().toISOString();
    }
    if (error) {
      invoices[index].error = error;
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    console.log(`[Invoice Queue] Invoice ${invoiceId} status updated:`, status);
  }
}

// Clear synced invoices (optional cleanup)
export function clearSyncedInvoices(): number {
  const invoices = getPendingInvoices();
  const pending = invoices.filter(inv => inv.status !== 'synced');
  const cleared = invoices.length - pending.length;
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  console.log(`[Invoice Queue] Cleared ${cleared} synced invoices`);
  
  return cleared;
}

// Get pending count
export function getPendingCount(): number {
  const invoices = getPendingInvoices();
  return invoices.filter(inv => inv.status === 'pending').length;
}

