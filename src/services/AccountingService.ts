import { postgres } from './postgres';

export interface ReconciliationSummary {
    pending: number;
    success: number;
    error: number;
    total: number;
}

export interface SyncTransaction {
    id: string;
    fiche_no: string;
    customer_name: string;
    total_gross: number;
    date: string;
    logo_sync_status: 'pending' | 'success' | 'error';
    logo_sync_error?: string;
    logo_sync_date?: string;
    firm_nr: string;
    period_nr: string;
}

class AccountingService {
    async getReconciliationSummary(firmNr: string, periodNr: string): Promise<ReconciliationSummary> {
        const table = `rex_${firmNr}_${periodNr}_sales`;
        try {
            const result = await postgres.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE logo_sync_status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE logo_sync_status = 'success') as success,
                    COUNT(*) FILTER (WHERE logo_sync_status = 'error') as error,
                    COUNT(*) as total
                FROM "${table}"
            `);
            const row = result.rows[0];
            return {
                pending: Number(row.pending) || 0,
                success: Number(row.success) || 0,
                error: Number(row.error) || 0,
                total: Number(row.total) || 0
            };
        } catch (error) {
            console.error('Failed to fetch reconciliation summary:', error);
            return { pending: 0, success: 0, error: 0, total: 0 };
        }
    }

    async getTransactions(firmNr: string, periodNr: string, status?: string): Promise<SyncTransaction[]> {
        const table = `rex_${firmNr}_${periodNr}_sales`;
        let query = `SELECT id, fiche_no, customer_name, total_gross, date, logo_sync_status, logo_sync_error, logo_sync_date, firm_nr, period_nr FROM "${table}"`;
        const params: any[] = [];

        if (status) {
            query += ` WHERE logo_sync_status = $1`;
            params.push(status);
        }

        query += ` ORDER BY date DESC LIMIT 100`;

        try {
            const result = await postgres.query<SyncTransaction>(query, params);
            return result.rows;
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
            return [];
        }
    }

    async retrySync(id: string, firmNr: string, periodNr: string): Promise<boolean> {
        const table = `rex_${firmNr}_${periodNr}_sales`;
        try {
            await postgres.query(
                `UPDATE "${table}" SET logo_sync_status = 'pending', logo_sync_error = NULL WHERE id = $1`,
                [id]
            );
            return true;
        } catch (error) {
            console.error('Failed to retry sync:', error);
            return false;
        }
    }

    async retryAllErrors(firmNr: string, periodNr: string): Promise<number> {
        const table = `rex_${firmNr}_${periodNr}_sales`;
        try {
            const result = await postgres.query(
                `UPDATE "${table}" SET logo_sync_status = 'pending', logo_sync_error = NULL WHERE logo_sync_status = 'error'`
            );
            return result.rowCount;
        } catch (error) {
            console.error('Failed to retry all errors:', error);
            return 0;
        }
    }
}

export const accountingService = new AccountingService();
