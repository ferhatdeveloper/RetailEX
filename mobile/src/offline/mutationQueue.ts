import AsyncStorage from '@react-native-async-storage/async-storage';

/** Customer form / mutation kuyruğu — API’den ayrı tut (circular import yok) */
export type CustomerInput = {
  code?: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  district?: string;
  address?: string;
  tax_nr?: string;
  tax_office?: string;
  notes?: string;
};

/** POS sepet satırı — offline fiş kuyruğu */
export type PosCartLineInput = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string | null;
  code?: string | null;
};

/** Fatura kalem — offline fatura kuyruğu */
export type InvoiceLineInput = {
  productId: string;
  code?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string | null;
  /** Satır indirim % (0–100) */
  discountPercent?: number;
  /** Satır KDV % (UI + sale_items.vat_rate; header total_vat web gibi 0 kalabilir) */
  vatRate?: number;
};

export type CountingSlipStatus =
  | 'draft'
  | 'active'
  | 'counting'
  | 'reconciliation'
  | 'completed'
  | 'cancelled';

/** WMS sayım satırı — offline upsert kuyruğu */
export type CountingLineInput = {
  slipId: string;
  lineId?: string;
  product_id?: string;
  barcode?: string;
  product_name?: string;
  expected_qty?: number;
  counted_qty: number;
  unit?: string;
};

const QUEUE_KEY = 'retailex_offline_mutations';

export type PendingMutation =
  | {
      id: string;
      createdAt: string;
      type: 'customer.create';
      payload: { localId: string; input: CustomerInput };
    }
  | {
      id: string;
      createdAt: string;
      type: 'customer.update';
      payload: { customerId: string; input: Partial<CustomerInput> };
    }
  | {
      id: string;
      createdAt: string;
      type: 'pos.sale';
      payload: {
        localId: string;
        ficheNo: string;
        lines: PosCartLineInput[];
        paymentMethod: string;
        customerId?: string | null;
        customerName?: string | null;
        totalDiscount?: number;
        campaignId?: string | null;
        campaignName?: string | null;
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'invoice.sales.create';
      payload: {
        localId: string;
        ficheNo: string;
        customerId?: string;
        customerName: string;
        notes?: string;
        paymentMethod?: string;
        lines: InvoiceLineInput[];
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'invoice.purchase.create';
      payload: {
        localId: string;
        ficheNo: string;
        supplierId?: string;
        supplierName: string;
        notes?: string;
        paymentMethod?: string;
        lines: InvoiceLineInput[];
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'invoice.header.update';
      payload: { invoiceId: string; notes?: string; status?: string };
    }
  | {
      id: string;
      createdAt: string;
      type: 'invoice.return.create';
      payload: {
        localId: string;
        ficheNo: string;
        /** 3 = satış iade, 6 = alış iade */
        trcode: 3 | 6;
        accountId?: string;
        accountName: string;
        notes?: string;
        paymentMethod?: string;
        cashier?: string;
        returnReason?: string;
        documentNo?: string;
        lines: InvoiceLineInput[];
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'invoice.document.create';
      payload: {
        localId: string;
        ficheNo: string;
        kind:
          | 'service-given'
          | 'service-received'
          | 'waybill-sales'
          | 'waybill-purchase'
          | 'order-sales'
          | 'order-purchase'
          | 'quote';
        trcode?: number;
        accountId?: string;
        accountName: string;
        notes?: string;
        paymentMethod?: string;
        documentNo?: string;
        footerDiscountAmount?: number;
        lines: InvoiceLineInput[];
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'wms.counting.slip.create';
      payload: {
        localId: string;
        ficheNo: string;
        store_id: string;
        store_name?: string | null;
        count_type?: 'full' | 'cycle' | 'location';
        description?: string;
      };
    }
  | {
      id: string;
      createdAt: string;
      type: 'wms.counting.line.upsert';
      payload: CountingLineInput;
    }
  | {
      id: string;
      createdAt: string;
      type: 'wms.counting.line.delete';
      payload: { slipId: string; lineId: string };
    }
  | {
      id: string;
      createdAt: string;
      type: 'wms.counting.status.update';
      payload: { slipId: string; status: CountingSlipStatus };
    }
  | {
      id: string;
      createdAt: string;
      type: 'wms.counting.applyStock';
      payload: { slipId: string };
    };

function newId(): string {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadMutationQueue(): Promise<PendingMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: PendingMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueMutation(
  mutation: Omit<PendingMutation, 'id' | 'createdAt'> & { id?: string },
): Promise<PendingMutation> {
  const item = {
    ...mutation,
    id: mutation.id || newId(),
    createdAt: new Date().toISOString(),
  } as PendingMutation;
  const q = await loadMutationQueue();
  q.push(item);
  await saveQueue(q);
  return item;
}

export async function removeMutation(id: string): Promise<void> {
  const q = await loadMutationQueue();
  await saveQueue(q.filter((m) => m.id !== id));
}

export async function clearMutationQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function pendingMutationCount(): Promise<number> {
  return (await loadMutationQueue()).length;
}
