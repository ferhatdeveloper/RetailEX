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
    async getServiceHealth(): Promise<ServiceHealth[]> {
        try {
            // First, trigger cleanup of stale services
            await postgres.query('SELECT public.cleanup_stale_services()');

            // Then fetch all
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
