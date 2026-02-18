/**
 * Audit Service
 * 
 * Provides access to system-wide audit logs.
 */

import { postgres } from './postgres';
import { logger } from '../utils/logger';

export interface AuditLog {
    id: string;
    user_id?: string;
    user_name?: string;
    firm_nr: string;
    table_name: string;
    record_id: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    old_data: any;
    new_data: any;
    client_info: any;
    created_at: string;
}

export interface AuditFilter {
    firm_nr?: string;
    table_name?: string;
    action?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
}

class AuditService {
    /**
     * Fetch audit logs with filtering
     */
    async getLogs(filter: AuditFilter = {}): Promise<{ logs: AuditLog[], total: number }> {
        try {
            const {
                firm_nr,
                table_name,
                action,
                user_id,
                date_from,
                date_to,
                limit = 50,
                offset = 0
            } = filter;

            let query = `
                SELECT *, count(*) OVER() AS full_count 
                FROM public.audit_logs 
                WHERE 1=1
            `;
            const params: any[] = [];
            let paramIdx = 1;

            if (firm_nr) {
                query += ` AND firm_nr = $${paramIdx++}`;
                params.push(firm_nr);
            }

            if (table_name) {
                query += ` AND table_name = $${paramIdx++}`;
                params.push(table_name);
            }

            if (action) {
                query += ` AND action = $${paramIdx++}`;
                params.push(action);
            }

            if (user_id) {
                query += ` AND user_id = $${paramIdx++}`;
                params.push(user_id);
            }

            if (date_from) {
                query += ` AND created_at >= $${paramIdx++}`;
                params.push(date_from);
            }

            if (date_to) {
                query += ` AND created_at <= $${paramIdx++}`;
                params.push(date_to);
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
            params.push(limit, offset);

            const result = await postgres.query<AuditLog & { full_count: string }>(query, params);

            const total = result.rows.length > 0 ? parseInt(result.rows[0].full_count) : 0;

            return {
                logs: result.rows,
                total
            };
        } catch (error) {
            logger.error('Failed to fetch audit logs:', error);
            return { logs: [], total: 0 };
        }
    }

    /**
     * Get unique tables that have audit entries
     */
    async getAuditedTables(): Promise<string[]> {
        try {
            const result = await postgres.query<{ table_name: string }>(
                'SELECT DISTINCT table_name FROM public.audit_logs ORDER BY table_name'
            );
            return result.rows.map(r => r.table_name);
        } catch (error) {
            logger.error('Failed to fetch audited tables:', error);
            return [];
        }
    }
}

export const auditService = new AuditService();
