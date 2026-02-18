/**
 * Synchronization API Service
 * Interacts with the Rust-based central sync service
 */

const SYNC_SERVICE_URL = 'http://localhost:8080/api';

export const syncAPI = {
    /**
     * List all registered devices
     */
    async getDevices() {
        try {
            const response = await fetch(`${SYNC_SERVICE_URL}/devices`);
            return await response.json();
        } catch (error) {
            console.error('[SyncAPI] getDevices failed:', error);
            return { success: false, devices: [] };
        }
    },

    /**
     * Create a new broadcast message
     */
    async createBroadcast(payload: {
        message_type: string;
        action: string;
        priority: string;
        target_stores?: string[];
        payload: any;
    }) {
        try {
            const response = await fetch(`${SYNC_SERVICE_URL}/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            return await response.json();
        } catch (error) {
            console.error('[SyncAPI] createBroadcast failed:', error);
            return { success: false, error: 'Connection failed' };
        }
    },

    /**
     * Trigger a data pull from terminals
     */
    async pullData(options: {
        message_type: 'product' | 'customer' | 'sale' | 'stock';
        target_stores?: string[];
        since?: string;
    }) {
        try {
            const response = await fetch(`${SYNC_SERVICE_URL}/broadcasts/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_type: options.message_type,
                    target_stores: options.target_stores,
                    since: options.since
                }),
            });
            return await response.json();
        } catch (error) {
            console.error('[SyncAPI] pullData failed:', error);
            return { success: false, error: 'Connection failed' };
        }
    },

    /**
     * Get status of a specific broadcast
     */
    async getBroadcastStatus(id: string) {
        try {
            const response = await fetch(`${SYNC_SERVICE_URL}/broadcasts/${id}`);
            return await response.json();
        } catch (error) {
            console.error('[SyncAPI] getBroadcastStatus failed:', error);
            return { success: false, error: 'Connection failed' };
        }
    }
};
