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
