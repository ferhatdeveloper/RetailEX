import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { TableRoutingService, RoutingContext } from './TableRoutingService';

export interface QueueItem {
    id: string; // Internal Queue ID
    idempotencyKey: string; // The crucial key for the backend
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    tableContext: RoutingContext; // Firm/Period info
    tableName: string; // Base table name (e.g. INVOICE)
    payload: any;
    status: 'PENDING' | 'PROCESSING' | 'FAILED' | 'COMPLETED';
    retryCount: number;
    createdAt: number;
    lastError?: string;
}

const QUEUE_STORAGE_KEY = 'exretail_offline_queue';
const MAX_RETRIES = 5;

export class OfflineQueueService {
    private static instance: OfflineQueueService;
    private isProcessing = false;
    private queue: QueueItem[] = [];

    private constructor() {
        this.loadQueue();
        // Try to process queue on startup and when online status changes
        window.addEventListener('online', () => this.processQueue());
        setInterval(() => this.processQueue(), 30000); // Periodic check every 30s
    }

    static getInstance(): OfflineQueueService {
        if (!this.instance) {
            this.instance = new OfflineQueueService();
        }
        return this.instance;
    }

    private loadQueue() {
        try {
            const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
            if (stored) {
                this.queue = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load queue', e);
            this.queue = [];
        }
    }

    private saveQueue() {
        try {
            localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.error('Failed to save queue', e);
        }
    }

    /**
     * Adds an item to the sync queue.
     * Auto-generates idempotency_key if not present.
     */
    async addToQueue(
        context: RoutingContext,
        tableName: string,
        payload: any,
        type: 'INSERT' | 'UPDATE' | 'DELETE' = 'INSERT'
    ): Promise<string> {
        const idempotencyKey = payload.idempotency_key || uuidv4();

        // Ensure payload has the key
        const finalPayload = { ...payload, idempotency_key: idempotencyKey };

        const item: QueueItem = {
            id: uuidv4(),
            idempotencyKey,
            type,
            tableContext: context,
            tableName,
            payload: finalPayload,
            status: 'PENDING',
            retryCount: 0,
            createdAt: Date.now()
        };

        console.log(`[Queue] Adding item ${tableName} (${type})`, item);

        this.queue.push(item);
        this.saveQueue();

        // Attempt immediate processing if online
        if (navigator.onLine) {
            this.processQueue();
        } else {
            toast.info('İşlem kuyruğa alındı (Offline)');
        }

        return idempotencyKey;
    }

    /**
     * Process pending items in the queue
     */
    async processQueue() {
        if (this.isProcessing || !navigator.onLine || this.queue.length === 0) return;

        this.isProcessing = true;
        const pendingItems = this.queue.filter(i => i.status === 'PENDING' || i.status === 'FAILED');

        if (pendingItems.length > 0) {
            console.log(`[Queue] Processing ${pendingItems.length} items...`);
        }

        for (const item of pendingItems) {
            if (item.retryCount >= MAX_RETRIES) {
                console.warn(`[Queue] Skipping item ${item.id} after max retries`);
                continue; // Skip but keep in queue for manual review? Or move to dead letter queue
            }

            try {
                item.status = 'PROCESSING';
                this.saveQueue();

                await this.syncItem(item);

                item.status = 'COMPLETED';
                // Remove completed items to keep storage clean
                this.queue = this.queue.filter(i => i.id !== item.id);
                this.saveQueue();

                toast.success(`Senkronizasyon başarılı: ${item.tableName}`);

            } catch (error: any) {
                console.error(`[Queue] Sync failed for ${item.id}`, error);
                item.status = 'FAILED';
                item.retryCount++;
                item.lastError = error.message;
                this.saveQueue();

                // If it's a constraint violation (e.g. duplicate key), it might be already synced
                if (error.code === '23505') { // Unique violation
                    console.log('[Queue] Item already exists (Idempotency), marking complete.');
                    item.status = 'COMPLETED';
                    this.queue = this.queue.filter(i => i.id !== item.id);
                    this.saveQueue();
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Performs the actual API call
     */
    private async syncItem(item: QueueItem) {
        const fullTableName = TableRoutingService.getTableName(item.tableContext, item.tableName);
        const supabaseUrl = `https://${projectId}.supabase.co/rest/v1/${fullTableName}`;

        let method = 'POST';
        let url = supabaseUrl;

        if (item.type === 'UPDATE') {
            method = 'PATCH';
            // Assume payload has logicalref or some ID used in URL
            // This part needs specific logic: usually updates are done by ID.
            // For now, let's assume filtering by idempotency_key if possible or payload ID
            if (item.payload.logicalref) {
                url += `?logicalref=eq.${item.payload.logicalref}`;
            }
        } else if (item.type === 'DELETE') {
            method = 'DELETE';
            if (item.payload.logicalref) {
                url += `?logicalref=eq.${item.payload.logicalref}`;
            }
        }

        const headers: any = {
            'apikey': publicAnonKey,
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal' // Don't need response body for sync
        };

        const body = item.type === 'DELETE' ? undefined : JSON.stringify(item.payload);

        const response = await fetch(url, {
            method,
            headers,
            body
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw { message: response.statusText, code: errorData.code, details: errorData };
        }
    }

    /**
     * Public stats
     */
    getQueueStats() {
        return {
            total: this.queue.length,
            pending: this.queue.filter(i => i.status === 'PENDING').length,
            failed: this.queue.filter(i => i.status === 'FAILED').length
        };
    }
}

export const offlineQueue = OfflineQueueService.getInstance();

