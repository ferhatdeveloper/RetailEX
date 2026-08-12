import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

// Define the structure of a queued action
export interface QueueItem {
    id: string; // Internal ID for the queue item
    type: 'SAVE_JOURNAL' | 'SAVE_ACCOUNT' | 'UPDATE_JOURNAL' | 'DELETE_JOURNAL'; // Action types
    payload: any; // The data needed for the action
    idempotencyKey: string; // The UUID sent to backend to prevent duplicates
    timestamp: number;
    retryCount: number;
    status: 'PENDING' | 'PROCESSING' | 'FAILED';
    error?: string;
}

const QUEUE_STORAGE_KEY = 'offline_action_queue';

class QueueService {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private storage: LocalForage;
    private processInterval: NodeJS.Timeout | null = null;
    private onProcessCallback: ((item: QueueItem, success: boolean) => void) | null = null;

    constructor() {
        this.storage = localforage.createInstance({
            name: 'ExRetailOS',
            storeName: 'offline_queue'
        });
        this.init();
    }

    private async init() {
        try {
            const storedQueue = await this.storage.getItem<QueueItem[]>(QUEUE_STORAGE_KEY);
            if (storedQueue) {
                this.queue = storedQueue;
            }
            // Start background processing loop
            this.startProcessingLoop();
        } catch (err) {
            console.error('Failed to initialize queue storage', err);
        }
    }

    // Add an action to the queue
    async addToQueue(type: QueueItem['type'], payload: any): Promise<string> {
        const idempotencyKey = uuidv4();
        const item: QueueItem = {
            id: uuidv4(),
            type,
            payload,
            idempotencyKey,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'PENDING'
        };

        this.queue.push(item);
        await this.saveQueue();

        // Trigger immediate processing attempt if online
        if (navigator.onLine) {
            this.processQueue();
        }

        return idempotencyKey;
    }

    // Store queue to persistence
    private async saveQueue() {
        try {
            await this.storage.setItem(QUEUE_STORAGE_KEY, this.queue);
        } catch (err) {
            console.error('Failed to save queue', err);
        }
    }

    // Start the background loop
    private startProcessingLoop() {
        if (this.processInterval) clearInterval(this.processInterval);
        this.processInterval = setInterval(() => {
            if (navigator.onLine && !this.isProcessing && this.queue.length > 0) {
                this.processQueue();
            }
        }, 10000); // Check every 10 seconds
    }

    // Register a handler to actually execute the actions
    // This will be called by the main application to inject the API logic
    private actionHandler: ((item: QueueItem) => Promise<void>) | null = null;

    public setActionHandler(handler: (item: QueueItem) => Promise<void>) {
        this.actionHandler = handler;
    }

    // Process the queue
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) return;

        this.isProcessing = true;

        // Get next pending item
        const item = this.queue.find(i => i.status === 'PENDING' || i.status === 'FAILED');

        if (!item) {
            this.isProcessing = false;
            return;
        }

        if (!this.actionHandler) {
            console.warn('No action handler registered for QueueService');
            this.isProcessing = false;
            return;
        }

        try {
            console.log(`Processing queue item: ${item.type} (${item.id})`);
            item.status = 'PROCESSING';
            await this.saveQueue();

            await this.actionHandler(item);

            // Success: Remove from queue
            this.queue = this.queue.filter(i => i.id !== item.id);
            await this.saveQueue();

            toast.success('Çevrimdışı işlem senkronize edildi.');

            // Immediately try next item
            this.isProcessing = false;
            setTimeout(() => this.processQueue(), 100);

        } catch (error: any) {
            console.error(`Failed to process item ${item.id}:`, error);

            item.status = 'FAILED';
            item.retryCount++;
            item.error = error.message;

            // If retried too many times, maybe move to a "Dead Letter Queue" or keep it pending?
            // For now, keep it failed. User might need to manually retry or we retry later.

            await this.saveQueue();
            this.isProcessing = false;
        }
    }

    public getQueueStatus() {
        return {
            pendingCount: this.queue.length,
            isProcessing: this.isProcessing
        };
    }
}

export const queueService = new QueueService();

