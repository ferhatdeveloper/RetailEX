/**
 * TableRoutingService
 * 
 * Handles strict Logo-style table naming conventions.
 * Format: FN_{FIRM_NR}_{PERIOD_NR}_{TABLE_NAME}
 * Example: FN_001_01_EMUHACC (Firm 1, Period 1, Account Plan)
 */

export interface RoutingContext {
    firmNr: number;
    periodNr: number;
}

export class TableRoutingService {
    /**
     * Generates the dynamic table name based on context
     */
    static getTableName(context: RoutingContext, baseTableName: string): string {
        const firmStr = context.firmNr.toString().padStart(3, '0');
        const periodStr = context.periodNr.toString().padStart(2, '0');

        // Normalize table name (remove existing prefixes if any)
        const normalizedName = baseTableName.replace(/^FN_\d+_\d+_/, '');

        return `FN_${firmStr}_${periodStr}_${normalizedName}`;
    }

    /**
     * Helper for commonly used base table names
     */
    static Tables = {
        // Accounting
        ACCOUNT_PLAN: 'EMUHACC',
        JOURNAL_HEADER: 'EMUHFICHE',
        JOURNAL_LINE: 'EMUHLINE',

        // Inventory / Invoice
        INVOICE_HEADER: 'INVOICE',
        INVOICE_LINE: 'STLINE',
        ITEM_TOTALS: 'STINVTOT',

        // CRM
        CLIENT_CARD: 'CLCARD'
    };

    /**
     * Provides a safe way to get the full table path for Supabase queries
     */
    static getPath(context: RoutingContext, baseTable: string): string {
        return this.getTableName(context, baseTable);
    }
}


