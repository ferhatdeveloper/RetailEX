import { createCustomer, updateCustomer } from '../api/customersApi';
import {
  createPurchaseInvoice,
  createReturnInvoice,
  createSalesInvoice,
  createDocumentInvoice,
  updateInvoiceHeader,
} from '../api/invoicesApi';
import { savePosSale } from '../api/posApi';
import {
  applyStockCount,
  createCountingSlip,
  deleteCountingLine,
  updateCountingSlipStatus,
  upsertCountingLine,
} from '../api/wmsStockCountApi';
import { useConnectivityStore } from '../store/connectivityStore';
import {
  loadMutationQueue,
  removeMutation,
  type PendingMutation,
} from './mutationQueue';
import { markCountingSlipSynced, removePendingInvoiceFromCache } from './snapshotCache';
import { shouldUseLiveData } from './policy';

export type FlushResult = {
  ok: number;
  failed: number;
  skipped: boolean;
  errors: string[];
};

async function applyOne(m: PendingMutation): Promise<void> {
  if (m.type === 'customer.create') {
    await createCustomer(m.payload.input, {
      forceLive: true,
      skipQueue: true,
      id: m.payload.localId,
    });
    return;
  }
  if (m.type === 'customer.update') {
    await updateCustomer(m.payload.customerId, m.payload.input, {
      forceLive: true,
      skipQueue: true,
    });
    return;
  }
  if (m.type === 'pos.sale') {
    await savePosSale(m.payload.lines, m.payload.paymentMethod, {
      forceLive: true,
      skipQueue: true,
      id: m.payload.localId,
      ficheNo: m.payload.ficheNo,
      customerId: m.payload.customerId,
      customerName: m.payload.customerName,
      totalDiscount: m.payload.totalDiscount,
      campaignId: m.payload.campaignId,
      campaignName: m.payload.campaignName,
    });
    return;
  }
  if (m.type === 'invoice.sales.create') {
    await createSalesInvoice(
      {
        customerId: m.payload.customerId,
        customerName: m.payload.customerName,
        notes: m.payload.notes,
        paymentMethod: m.payload.paymentMethod,
        lines: m.payload.lines,
      },
      {
        forceLive: true,
        skipQueue: true,
        id: m.payload.localId,
        ficheNo: m.payload.ficheNo,
      },
    );
    await removePendingInvoiceFromCache(m.payload.localId);
    return;
  }
  if (m.type === 'invoice.purchase.create') {
    await createPurchaseInvoice(
      {
        supplierId: m.payload.supplierId,
        supplierName: m.payload.supplierName,
        notes: m.payload.notes,
        paymentMethod: m.payload.paymentMethod,
        lines: m.payload.lines,
      },
      {
        forceLive: true,
        skipQueue: true,
        id: m.payload.localId,
        ficheNo: m.payload.ficheNo,
      },
    );
    await removePendingInvoiceFromCache(m.payload.localId);
    return;
  }
  if (m.type === 'invoice.return.create') {
    await createReturnInvoice(
      {
        trcode: m.payload.trcode,
        accountId: m.payload.accountId,
        accountName: m.payload.accountName,
        notes: m.payload.notes,
        paymentMethod: m.payload.paymentMethod,
        cashier: m.payload.cashier,
        returnReason: m.payload.returnReason,
        documentNo: m.payload.documentNo,
        lines: m.payload.lines,
      },
      {
        forceLive: true,
        skipQueue: true,
        id: m.payload.localId,
        ficheNo: m.payload.ficheNo,
      },
    );
    await removePendingInvoiceFromCache(m.payload.localId);
    return;
  }
  if (m.type === 'invoice.document.create') {
    await createDocumentInvoice(
      m.payload.kind,
      {
        accountId: m.payload.accountId,
        accountName: m.payload.accountName,
        notes: m.payload.notes,
        paymentMethod: m.payload.paymentMethod,
        documentNo: m.payload.documentNo,
        footerDiscountAmount: m.payload.footerDiscountAmount,
        lines: m.payload.lines,
        trcodeOverride: m.payload.trcode,
      },
      {
        forceLive: true,
        skipQueue: true,
        id: m.payload.localId,
        ficheNo: m.payload.ficheNo,
      },
    );
    await removePendingInvoiceFromCache(m.payload.localId);
    return;
  }
  if (m.type === 'invoice.header.update') {
    await updateInvoiceHeader(m.payload.invoiceId, m.payload, {
      forceLive: true,
      skipQueue: true,
    });
    await removePendingInvoiceFromCache(m.payload.invoiceId);
    return;
  }
  if (m.type === 'wms.counting.slip.create') {
    await createCountingSlip(
      {
        store_id: m.payload.store_id,
        store_name: m.payload.store_name,
        count_type: m.payload.count_type,
        description: m.payload.description,
      },
      {
        forceLive: true,
        skipQueue: true,
        id: m.payload.localId,
        ficheNo: m.payload.ficheNo,
      },
    );
    await markCountingSlipSynced(m.payload.localId);
    return;
  }
  if (m.type === 'wms.counting.line.upsert') {
    await upsertCountingLine(
      m.payload.slipId,
      {
        product_id: m.payload.product_id,
        barcode: m.payload.barcode,
        product_name: m.payload.product_name,
        expected_qty: m.payload.expected_qty,
        counted_qty: m.payload.counted_qty,
        unit: m.payload.unit,
      },
      {
        forceLive: true,
        skipQueue: true,
        lineId: m.payload.lineId,
      },
    );
    return;
  }
  if (m.type === 'wms.counting.line.delete') {
    await deleteCountingLine(m.payload.slipId, m.payload.lineId, {
      forceLive: true,
      skipQueue: true,
    });
    return;
  }
  if (m.type === 'wms.counting.status.update') {
    await updateCountingSlipStatus(m.payload.slipId, m.payload.status, {
      forceLive: true,
      skipQueue: true,
    });
    return;
  }
  if (m.type === 'wms.counting.applyStock') {
    await applyStockCount(m.payload.slipId, {
      forceLive: true,
      skipQueue: true,
    });
  }
}

/** Online’a dönüşte veya manuel: bekleyen mutasyonları sırayla gönder */
export async function flushPendingMutations(): Promise<FlushResult> {
  if (!shouldUseLiveData()) {
    return { ok: 0, failed: 0, skipped: true, errors: [] };
  }

  const store = useConnectivityStore.getState();
  if (store.syncing) {
    return { ok: 0, failed: 0, skipped: true, errors: ['Senkron zaten çalışıyor'] };
  }

  store.setSyncing(true);
  const errors: string[] = [];
  let ok = 0;
  let failed = 0;

  try {
    const queue = await loadMutationQueue();
    for (const m of queue) {
      try {
        await applyOne(m);
        await removeMutation(m.id);
        ok += 1;
      } catch (e) {
        failed += 1;
        errors.push(
          `${m.type}: ${e instanceof Error ? e.message : String(e)}`,
        );
        // Sıra bozulmasın: ilk hatada dur (FIFO güvenliği)
        break;
      }
    }
    await store.refreshPendingCount();
    if (ok > 0) store.setLastSyncedAt(new Date().toISOString());
  } finally {
    store.setSyncing(false);
  }

  return { ok, failed, skipped: false, errors };
}
