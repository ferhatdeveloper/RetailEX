// Store Selection & Offline Data Synchronization Service

import { storeApiService } from './storeApiService';
import { logger } from './loggingService';

export interface SelectedStore {
  id: string;
  code: string;
  name: string;
  region: string;
  city: string;
  isOnline: boolean;
  lastSyncTime: string | null;
  pendingOperations: number;
}

export interface SyncOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'sale' | 'product' | 'customer' | 'stock';
  data: any;
  timestamp: string;
  storeId: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: string | null;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
}

class StoreSyncService {
  private selectedStore: SelectedStore | null = null;
  private syncQueue: SyncOperation[] = [];
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    this.init();
  }

  /**
   * Initialize service
   */
  private init() {
    // Load selected store from localStorage
    const savedStore = localStorage.getItem('selectedStore');
    if (savedStore) {
      this.selectedStore = JSON.parse(savedStore);
    }

    // Load sync queue from localStorage
    const savedQueue = localStorage.getItem('syncQueue');
    if (savedQueue) {
      this.syncQueue = JSON.parse(savedQueue);
    }

    // Setup online/offline detection
    window.addEventListener('online', () => {
      logger.info('Sync', 'System went ONLINE. Resuming synchronization...');
      this.isOnline = true;
      this.notifyListeners();
      this.startAutoSync();
    });

    window.addEventListener('offline', () => {
      logger.warn('Sync', 'System went OFFLINE. Operations will be queued.');
      this.isOnline = false;
      this.notifyListeners();
      this.stopAutoSync();
    });

    // Start auto-sync if online
    if (this.isOnline) {
      this.startAutoSync();
    }

    console.log('?? StoreSyncService initialized', {
      isOnline: this.isOnline,
      selectedStore: this.selectedStore?.name,
      pendingOps: this.syncQueue.length
    });
  }

  /**
   * Select a store
   */
  async selectStore(storeId: string): Promise<SelectedStore> {
    try {
      // Fetch store details (in real app, this would be an API call)
      const response = await storeApiService.fetchStores(0, 1, { query: storeId });
      const store = response.data[0];

      if (!store) {
        throw new Error('Store not found');
      }

      this.selectedStore = {
        id: store.id,
        code: store.code,
        name: store.name,
        region: store.region,
        city: store.city,
        isOnline: this.isOnline,
        lastSyncTime: new Date().toISOString(),
        pendingOperations: this.syncQueue.filter(op => op.storeId === store.id).length
      };

      // Save to localStorage
      localStorage.setItem('selectedStore', JSON.stringify(this.selectedStore));

      console.log('?? Store selected:', this.selectedStore.name);
      this.notifyListeners();

      return this.selectedStore;
    } catch (error) {
      console.error('Failed to select store:', error);
      throw error;
    }
  }

  /**
   * Get selected store
   */
  getSelectedStore(): SelectedStore | null {
    return this.selectedStore;
  }

  /**
   * Clear store selection
   */
  clearStoreSelection() {
    this.selectedStore = null;
    localStorage.removeItem('selectedStore');
    this.notifyListeners();
    console.log('?? Store selection cleared');
  }

  /**
   * Queue an operation for sync
   */
  queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'status' | 'retryCount'>): string {
    if (!this.selectedStore) {
      throw new Error('No store selected');
    }

    const op: SyncOperation = {
      ...operation,
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      storeId: operation.storeId || this.selectedStore.id
    };

    this.syncQueue.push(op);
    this.persistQueue();

    logger.info('Sync', `Operation queued: ${op.type} ${op.entity}`, { id: op.id });

    // Try to sync immediately if online
    if (this.isOnline && !this.isSyncing) {
      this.syncNow();
    }

    this.notifyListeners();
    return op.id;
  }

  /**
   * Start automatic sync (every 30 seconds)
   */
  private startAutoSync() {
    if (this.syncInterval) {
      return;
    }

    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.syncQueue.length > 0 && !this.isSyncing) {
        this.syncNow();
      }
    }, 30000); // 30 seconds

    console.log('? Auto-sync started');
  }

  /**
   * Stop automatic sync
   */
  private stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('? Auto-sync stopped');
    }
  }

  /**
   * Sync now
   */
  async syncNow(): Promise<void> {
    if (!this.isOnline) {
      console.log('?? Cannot sync - offline');
      return;
    }

    if (this.isSyncing) {
      console.log('?? Sync already in progress');
      return;
    }

    if (this.syncQueue.length === 0) {
      console.log('? Nothing to sync');
      return;
    }

    this.isSyncing = true;
    this.notifyListeners();

    logger.info('Sync', `Sync starting: ${this.syncQueue.length} operations pending.`);

    const pendingOps = this.syncQueue.filter(op => op.status === 'pending' || op.status === 'failed');

    for (const op of pendingOps) {
      try {
        op.status = 'syncing';
        this.notifyListeners();

        // Simulate API call (in real app, this would be actual API)
        await this.syncOperation(op);

        op.status = 'completed';
        logger.info('Sync', `Successfully synced ${op.type} ${op.entity}`, { id: op.id });
      } catch (error: any) {
        op.status = 'failed';
        op.retryCount++;
        op.error = error.message;
        logger.error('Sync', `Sync failed for ${op.type} ${op.entity}`, { id: op.id, error: error.message, retry: op.retryCount });

        // Remove if retry count exceeds 3
        if (op.retryCount >= 3) {
          logger.error('Sync', `Max retries exceeded for operation ${op.id}. Removing from queue.`);
          this.syncQueue = this.syncQueue.filter(o => o.id !== op.id);
        }
      }
    }

    // Remove completed operations
    this.syncQueue = this.syncQueue.filter(op => op.status !== 'completed');
    this.persistQueue();

    if (this.selectedStore) {
      this.selectedStore.lastSyncTime = new Date().toISOString();
      this.selectedStore.pendingOperations = this.syncQueue.length;
      localStorage.setItem('selectedStore', JSON.stringify(this.selectedStore));
    }

    this.isSyncing = false;
    this.notifyListeners();

    console.log('? Sync completed. Remaining:', this.syncQueue.length);
  }

  /**
   * Sync single operation (simulated API call)
   */
  private async syncOperation(op: SyncOperation): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // In real app, this would be actual API calls like:
    // switch (op.type) {
    //   case 'CREATE':
    //     await api.post(`/${op.entity}`, op.data);
    //     break;
    //   case 'UPDATE':
    //     await api.put(`/${op.entity}/${op.data.id}`, op.data);
    //     break;
    //   case 'DELETE':
    //     await api.delete(`/${op.entity}/${op.data.id}`);
    //     break;
    // }

    // Simulate 10% failure rate for testing
    if (Math.random() < 0.1) {
      throw new Error('Network error (simulated)');
    }
  }

  /**
   * Persist queue to localStorage
   */
  private persistQueue() {
    localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      lastSync: this.selectedStore?.lastSyncTime || null,
      pendingCount: this.syncQueue.filter(op => op.status === 'pending').length,
      failedCount: this.syncQueue.filter(op => op.status === 'failed').length,
      isSyncing: this.isSyncing
    };
  }

  /**
   * Get sync queue
   */
  getSyncQueue(): SyncOperation[] {
    return [...this.syncQueue];
  }

  /**
   * Clear sync queue (for testing/debug)
   */
  clearSyncQueue() {
    this.syncQueue = [];
    this.persistQueue();
    this.notifyListeners();
    console.log('??? Sync queue cleared');
  }

  /**
   * Subscribe to sync status changes
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners() {
    const status = this.getSyncStatus();
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in sync listener:', error);
      }
    });
  }

  /**
   * Download store data (for offline use)
   */
  async downloadStoreData(storeId: string): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot download data while offline');
    }

    console.log('?? Downloading store data...', storeId);

    try {
      // In real app, download all necessary data
      // - Products
      // - Customers
      // - Recent sales
      // - Settings
      // - etc.

      const storeData = {
        storeId,
        downloadedAt: new Date().toISOString(),
        products: [], // Would be fetched from API
        customers: [], // Would be fetched from API
        settings: {}, // Would be fetched from API
      };

      // Save to IndexedDB or localStorage
      localStorage.setItem(`storeData-${storeId}`, JSON.stringify(storeData));

      console.log('? Store data downloaded');
    } catch (error) {
      console.error('? Failed to download store data:', error);
      throw error;
    }
  }

  /**
   * Upload local changes (force sync)
   */
  async uploadChanges(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot upload while offline');
    }

    await this.syncNow();
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isOnline;
  }
}

// Singleton instance
export const storeSyncService = new StoreSyncService();


