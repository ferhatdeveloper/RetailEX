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
  /** Ürün KDV % — sale_items.vat_rate + header total_vat */
  vatRate?: number;
};

/** Fatura kalem — offline fatura kuyruğu */
export type InvoiceLineInput = {
  /** Ürün id — hizmet satırında opsiyonel / null */
  productId?: string | null;
  code?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string | null;
  /** Satır indirim % (0–100) */
  discountPercent?: number;
  /** Satır KDV % (UI + sale_items.vat_rate + header total_vat) */
  vatRate?: number;
  /** product | service — hizmette stok yok */
  lineType?: 'product' | 'service';
  /** sale_items.item_type — Malzeme | Hizmet */
  itemType?: string | null;
};

/** Web `invoiceHeaderFields` mobil alt kümesi — sales.header_fields JSONB */
export type InvoiceHeaderFieldsInput = {
  documentNo?: string;
  specialCode?: string;
  warehouse?: string;
  salespersonCode?: string;
  dueDate?: string;
  cashRegisterId?: string;
  cashRegisterName?: string;
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
      payload: {
        invoiceId: string;
        notes?: string;
        status?: string;
        documentNo?: string;
        invoiceDate?: string;
        currency?: string;
        currencyRate?: number;
        headerFields?: InvoiceHeaderFieldsInput;
        /** Yalnızca draft — kalem değişimi */
        lines?: InvoiceLineInput[];
        footerDiscountAmount?: number;
      };
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

/** WMS sayım — aynı fiş/satır için tekrarlayan kuyruk girdilerini birleştir */
function coalesceWmsMutation(q: PendingMutation[], incoming: PendingMutation): PendingMutation[] {
  if (incoming.type === 'wms.counting.line.upsert') {
    const { slipId, lineId } = incoming.payload;
    const filtered = q.filter(
      (m) =>
        !(
          m.type === 'wms.counting.line.upsert' &&
          m.payload.slipId === slipId &&
          m.payload.lineId === lineId
        ),
    );
    return [...filtered, incoming];
  }
  if (incoming.type === 'wms.counting.line.delete') {
    const { slipId, lineId } = incoming.payload;
    const filtered = q.filter(
      (m) =>
        !(
          (m.type === 'wms.counting.line.upsert' &&
            m.payload.slipId === slipId &&
            m.payload.lineId === lineId) ||
          (m.type === 'wms.counting.line.delete' &&
            m.payload.slipId === slipId &&
            m.payload.lineId === lineId)
        ),
    );
    return [...filtered, incoming];
  }
  if (incoming.type === 'wms.counting.status.update') {
    const { slipId } = incoming.payload;
    const filtered = q.filter(
      (m) => !(m.type === 'wms.counting.status.update' && m.payload.slipId === slipId),
    );
    return [...filtered, incoming];
  }
  if (incoming.type === 'wms.counting.applyStock') {
    const { slipId } = incoming.payload;
    const filtered = q.filter(
      (m) => !(m.type === 'wms.counting.applyStock' && m.payload.slipId === slipId),
    );
    return [...filtered, incoming];
  }
  return [...q, incoming];
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
  const next =
    item.type.startsWith('wms.counting.') ? coalesceWmsMutation(q, item) : [...q, item];
  await saveQueue(next);
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
