/**
 * Offline Queue System
 * Handles offline transactions and auto-sync when connection restored
 */

import { logger } from './logger';
import { dbCache } from './indexedDBCache';

export interface QueuedTransaction {
  id: string;
  type: 'sale' | 'return' | 'stock_update' | 'customer_update';
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  error?: string;
}

const QUEUE_STORAGE_KEY = 'retailos_offline_queue';
const MAX_RETRY_COUNT = 3;

class OfflineQueue {
  private queue: QueuedTransaction[] = [];
  private isSyncing = false;
  private syncCallbacks: Array<(status: 'started' | 'completed' | 'failed', queue: QueuedTransaction[]) => void> = [];

  constructor() {
    this.loadQueue();
    this.setupOnlineListener();
  }

  /**
   * Load queue from IndexedDB
   */
  private async loadQueue() {
    try {
      const cached = await dbCache.get<QueuedTransaction[]>('offline_queue', 'system');
      if (cached) {
        this.queue = cached;
        logger.log('offline-queue', `Loaded ${this.queue.length} queued transactions`);
      }
    } catch (error) {
      logger.error('offline-queue', 'Failed to load queue', error);
      // Fallback to localStorage
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    }
  }

  /**
   * Save queue to IndexedDB and localStorage
   */
  private async saveQueue() {
    try {
      await dbCache.set('offline_queue', this.queue, 'system', Infinity);
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
      logger.log('offline-queue', `Saved ${this.queue.length} queued transactions`);
    } catch (error) {
      logger.error('offline-queue', 'Failed to save queue', error);
    }
  }

  /**
   * Add transaction to queue
   */
  async add(type: QueuedTransaction['type'], data: any): Promise<string> {
    const transaction: QueuedTransaction = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    this.queue.push(transaction);
    await this.saveQueue();

    logger.log('offline-queue', `Added ${type} to queue`, { id: transaction.id });

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.syncQueue();
    }

    return transaction.id;
  }

  /**
   * Get all queued transactions
   */
  getQueue(): QueuedTransaction[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  getSize(): number {
    return this.queue.length;
  }

  /**
   * Get pending transactions count
   */
  getPendingCount(): number {
    return this.queue.filter(t => t.status === 'pending').length;
  }

  /**
   * Setup online/offline listener
   */
  private setupOnlineListener() {
    window.addEventListener('online', () => {
      logger.log('offline-queue', 'Connection restored, starting sync...');
      this.syncQueue();
    });

    window.addEventListener('offline', () => {
      logger.warn('offline-queue', 'Connection lost, transactions will be queued');
    });
  }

  /**
   * Sync all queued transactions
   */
  async syncQueue(): Promise<void> {
    if (this.isSyncing) {
      logger.log('offline-queue', 'Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      logger.warn('offline-queue', 'Cannot sync - offline');
      return;
    }

    if (this.queue.length === 0) {
      logger.log('offline-queue', 'Queue is empty');
      return;
    }

    this.isSyncing = true;
    this.notifyCallbacks('started', this.queue);
    logger.log('offline-queue', `Starting sync of ${this.queue.length} transactions`);

    const pendingTransactions = this.queue.filter(t => 
      t.status === 'pending' || (t.status === 'failed' && t.retryCount < MAX_RETRY_COUNT)
    );

    for (const transaction of pendingTransactions) {
      try {
        transaction.status = 'syncing';
        await this.saveQueue();

        // Process based on type
        await this.processTransaction(transaction);

        // Mark as completed and remove from queue
        this.queue = this.queue.filter(t => t.id !== transaction.id);
        await this.saveQueue();

        logger.log('offline-queue', `Transaction ${transaction.id} synced successfully`);
      } catch (error) {
        transaction.status = 'failed';
        transaction.retryCount++;
        transaction.error = error instanceof Error ? error.message : 'Unknown error';
        await this.saveQueue();

        logger.error('offline-queue', `Transaction ${transaction.id} failed`, error);

        if (transaction.retryCount >= MAX_RETRY_COUNT) {
          logger.error('offline-queue', `Transaction ${transaction.id} exceeded retry limit`);
        }
      }
    }

    this.isSyncing = false;
    const hasFailures = this.queue.some(t => t.status === 'failed');
    this.notifyCallbacks(hasFailures ? 'failed' : 'completed', this.queue);
    
    logger.log('offline-queue', `Sync completed. ${this.queue.length} transactions remaining`);
  }

  /**
   * Process a single transaction
   */
  private async processTransaction(transaction: QueuedTransaction): Promise<void> {
    switch (transaction.type) {
      case 'sale':
        await this.syncSale(transaction.data);
        break;
      case 'return':
        await this.syncReturn(transaction.data);
        break;
      case 'stock_update':
        await this.syncStockUpdate(transaction.data);
        break;
      case 'customer_update':
        await this.syncCustomerUpdate(transaction.data);
        break;
      default:
        throw new Error(`Unknown transaction type: ${transaction.type}`);
    }
  }

  /**
   * Sync sale to backend
   */
  private async syncSale(data: any): Promise<void> {
    const response = await fetch('/api/v1/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to sync sale: ${response.statusText}`);
    }
  }

  /**
   * Sync return to backend
   */
  private async syncReturn(data: any): Promise<void> {
    const response = await fetch('/api/v1/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to sync return: ${response.statusText}`);
    }
  }

  /**
   * Sync stock update to backend
   */
  private async syncStockUpdate(data: any): Promise<void> {
    const response = await fetch('/api/v1/stock/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to sync stock update: ${response.statusText}`);
    }
  }

  /**
   * Sync customer update to backend
   */
  private async syncCustomerUpdate(data: any): Promise<void> {
    const response = await fetch('/api/v1/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to sync customer update: ${response.statusText}`);
    }
  }

  /**
   * Clear completed transactions
   */
  async clearCompleted(): Promise<void> {
    this.queue = this.queue.filter(t => t.status !== 'completed');
    await this.saveQueue();
    logger.log('offline-queue', 'Cleared completed transactions');
  }

  /**
   * Clear all transactions
   */
  async clearAll(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    logger.log('offline-queue', 'Cleared all transactions');
  }

  /**
   * Remove specific transaction
   */
  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter(t => t.id !== id);
    await this.saveQueue();
    logger.log('offline-queue', `Removed transaction ${id}`);
  }

  /**
   * Subscribe to sync events
   */
  onSync(callback: (status: 'started' | 'completed' | 'failed', queue: QueuedTransaction[]) => void): () => void {
    this.syncCallbacks.push(callback);
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(status: 'started' | 'completed' | 'failed', queue: QueuedTransaction[]) {
    this.syncCallbacks.forEach(callback => {
      try {
        callback(status, queue);
      } catch (error) {
        logger.error('offline-queue', 'Callback error', error);
      }
    });
  }

  /**
   * Get sync status
   */
  getSyncStatus(): { isSyncing: boolean; pendingCount: number; failedCount: number } {
    return {
      isSyncing: this.isSyncing,
      pendingCount: this.queue.filter(t => t.status === 'pending').length,
      failedCount: this.queue.filter(t => t.status === 'failed').length
    };
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueue();

