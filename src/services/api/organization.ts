/**
 * Organization API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface Firm {
    id: string;
    firm_nr: string;
    name: string;
    tax_nr?: string;
    tax_office?: string;
    city?: string;
    is_active: boolean;
}

export interface Period {
    id: string;
    firm_id: string;
    nr: number;
    donem_adi: string;
    beg_date: string;
    end_date: string;
    is_active: boolean;
}

export const organizationAPI = {
    /**
     * Get all firms
     */
    async getFirms(): Promise<Firm[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM firms ORDER BY firm_nr ASC`
            );
            // Map database schema to frontend expectations if needed
            return rows.map(r => ({
                ...r,
                id: r.id.toString(),
                firma_adi: r.name,
                firma_kodu: r.firm_nr
            }));
        } catch (error) {
            console.error('[OrganizationAPI] getFirms failed:', error);
            return [];
        }
    },

    /**
     * Create/Update firm
     */
    async saveFirm(firm: any): Promise<Firm | null> {
        try {
            const isUpdate = !!firm.id;
            if (isUpdate) {
                const { rows } = await postgres.query(
                    `UPDATE firms SET name = $1, tax_nr = $2, tax_office = $3, city = $4 WHERE id = $5 RETURNING *`,
                    [firm.firma_adi || firm.name, firm.tax_nr, firm.tax_office, firm.city, firm.id]
                );
                return rows[0];
            } else {
                const { rows } = await postgres.query(
                    `INSERT INTO firms (firm_nr, name, tax_nr, tax_office, city) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [firm.firma_kodu || firm.firm_nr, firm.firma_adi || firm.name, firm.tax_nr, firm.tax_office, firm.city]
                );
                return rows[0];
            }
        } catch (error) {
            console.error('[OrganizationAPI] saveFirm failed:', error);
            throw error;
        }
    },

    /**
     * Delete firm
     */
    async deleteFirm(id: string): Promise<boolean> {
        try {
            const { rowCount } = await postgres.query(`DELETE FROM firms WHERE id = $1`, [id]);
            return rowCount > 0;
        } catch (error) {
            console.error('[OrganizationAPI] deleteFirm failed:', error);
            return false;
        }
    },

    /**
     * Get periods for a firm
     */
    async getPeriods(firmId: string): Promise<Period[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM periods WHERE firm_id = $1 ORDER BY nr DESC`,
                [firmId]
            );
            return rows.map(r => ({
                ...r,
                id: r.id.toString(),
                donem_adi: r.nr.toString().padStart(2, '0'),
                baslangic_tarihi: r.beg_date,
                bitis_tarihi: r.end_date
            }));
        } catch (error) {
            console.error('[OrganizationAPI] getPeriods failed:', error);
            return [];
        }
    },

    /**
     * Save period
     */
    async savePeriod(period: any): Promise<Period | null> {
        try {
            const isUpdate = !!period.id;
            if (isUpdate) {
                const { rows } = await postgres.query(
                    `UPDATE periods SET beg_date = $1, end_date = $2 WHERE id = $3 RETURNING *`,
                    [period.baslangic_tarihi || period.beg_date, period.bitis_tarihi || period.end_date, period.id]
                );
                return rows[0];
            } else {
                const { rows } = await postgres.query(
                    `INSERT INTO periods (firm_id, nr, beg_date, end_date) VALUES ($1, $2, $3, $4) RETURNING *`,
                    [period.firma_id, period.nr, period.baslangic_tarihi, period.bitis_tarihi]
                );
                return rows[0];
            }
        } catch (error) {
            console.error('[OrganizationAPI] savePeriod failed:', error);
            throw error;
        }
    }
};
