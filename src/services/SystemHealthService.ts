import { postgres } from './postgres';

export interface ServiceHealth {
    service_name: string;
    last_heartbeat: string;
    status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE';
    version: string;
    metadata: any;
    updated_at: string;
}

class SystemHealthService {
    private lastCleanupAt = 0;

    async getServiceHealth(): Promise<ServiceHealth[]> {
        try {
            const now = Date.now();
            if (now - this.lastCleanupAt > 5 * 60_000) {
                this.lastCleanupAt = now;
                await postgres.query('SELECT public.cleanup_stale_services()').catch(() => {});
            }

            const result = await postgres.query<ServiceHealth>(
                'SELECT * FROM public.service_health ORDER BY service_name ASC'
            );
            return result.rows;
        } catch (error) {
            console.error('Failed to fetch service health:', error);
            return [];
        }
    }

    async getSyncLogs(limit: number = 50): Promise<any[]> {
        try {
            const result = await postgres.query(
                'SELECT * FROM public.sync_logs ORDER BY last_sync_date DESC LIMIT $1',
                [limit]
            );
            return result.rows;
        } catch (error) {
            console.error('Failed to fetch sync logs:', error);
            return [];
        }
    }
}

export const systemHealthService = new SystemHealthService();

