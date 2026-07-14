import { createCustomer, updateCustomer } from '../api/customersApi';
import { useConnectivityStore } from '../store/connectivityStore';
import {
  loadMutationQueue,
  removeMutation,
  type PendingMutation,
} from './mutationQueue';
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
