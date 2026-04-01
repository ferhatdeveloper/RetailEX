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
    /** TR: GİB e-belge; IQ: Irak vb. — `firms.regulatory_region` */
    regulatory_region?: 'TR' | 'IQ';
    /** Supabase tarafındaki firma/organization ID; ürün ve resim senkronu için */
    supabase_firm_id?: string;
    /** TR: GİB — `mock` | `nilvera` | `qnb_esolutions` | `integrator` | `direct_unconfigured` */
    gib_integration_mode?: string;
    gib_ubl_profile?: string;
    gib_sender_alias?: string;
    gib_integrator_base_url?: string;
    gib_integrator_username?: string;
    gib_integrator_password?: string;
    gib_use_test_environment?: boolean;
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

/** `public.system_settings` tek satır (id=1); web açılış varsayılanları */
export interface SystemSettingsRow {
    id: number;
    default_currency: string;
    primary_firm_nr: string | null;
    primary_period_nr: string | null;
}

export const organizationAPI = {
    /**
     * Get firm by firm_nr (örn. aktif firma için Supabase ID almak için)
     */
    async getFirmByFirmNr(firmNr: string): Promise<Firm | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM firms WHERE firm_nr = $1 LIMIT 1`,
                [firmNr]
            );
            if (!rows[0]) return null;
            const r = rows[0];
            return {
                ...r,
                id: r.id?.toString?.() ?? r.id,
                firma_adi: r.name,
                firma_kodu: r.firm_nr,
                supabase_firm_id: r.supabase_firm_id,
                regulatory_region: (String(r.regulatory_region || 'IQ').toUpperCase() === 'TR' ? 'TR' : 'IQ') as 'TR' | 'IQ',
            } as Firm & { firma_adi: string; firma_kodu: string };
        } catch (error) {
            console.error('[OrganizationAPI] getFirmByFirmNr failed:', error);
            return null;
        }
    },

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
                firma_kodu: r.firm_nr,
                supabase_firm_id: r.supabase_firm_id,
                regulatory_region: (String(r.regulatory_region || 'IQ').toUpperCase() === 'TR' ? 'TR' : 'IQ') as 'TR' | 'IQ',
            }));
        } catch (error) {
            console.error('[OrganizationAPI] getFirms failed:', error);
            return [];
        }
    },

    /**
     * Create/Update firm
     */
    /**
     * Aktif firma için mevzuat bölgesi (e-belge). Sütun yoksa null.
     */
    async getRegulatoryRegionForFirmNr(firmNr: string): Promise<'TR' | 'IQ' | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT regulatory_region FROM firms WHERE firm_nr = $1 LIMIT 1`,
                [firmNr]
            );
            if (!rows?.[0]) return null;
            const v = String((rows[0] as { regulatory_region?: string }).regulatory_region ?? 'IQ').toUpperCase();
            return v === 'TR' ? 'TR' : 'IQ';
        } catch {
            return null;
        }
    },

    async saveFirm(firm: any): Promise<Firm | null> {
        try {
            const isUpdate = !!firm.id;
            const anaPara = firm.ana_para_birimi || 'IQD';
            const raporPara = firm.raporlama_para_birimi || 'IQD';
            const reg =
                firm.regulatory_region === 'TR' || String(firm.regulatory_region || '').toUpperCase() === 'TR'
                    ? 'TR'
                    : 'IQ';
            const gibMode = String(firm.gib_integration_mode || 'mock').slice(0, 20);
            const gibUbl = String(firm.gib_ubl_profile || 'TICARIFATURA').slice(0, 40);
            const gibAlias = firm.gib_sender_alias != null ? String(firm.gib_sender_alias).slice(0, 255) : '';
            const gibUrl = firm.gib_integrator_base_url != null ? String(firm.gib_integrator_base_url).slice(0, 512) : '';
            const gibUser = firm.gib_integrator_username != null ? String(firm.gib_integrator_username).slice(0, 255) : '';
            const gibPass = firm.gib_integrator_password != null ? String(firm.gib_integrator_password) : '';
            const gibTest = firm.gib_use_test_environment !== false;
            let saved: any;
            if (isUpdate) {
                const { rows } = await postgres.query(
                    `UPDATE firms SET
                       name = $1, tax_nr = $2, tax_office = $3, city = $4,
                       ana_para_birimi = $5, raporlama_para_birimi = $6, regulatory_region = $7,
                       gib_integration_mode = $9, gib_ubl_profile = $10, gib_sender_alias = NULLIF($11, ''),
                       gib_integrator_base_url = NULLIF($12, ''), gib_integrator_username = NULLIF($13, ''),
                       gib_integrator_password = COALESCE(NULLIF($14, ''), firms.gib_integrator_password),
                       gib_use_test_environment = $15
                     WHERE id = $8::text::uuid RETURNING *`,
                    [
                        firm.firma_adi || firm.name,
                        firm.tax_nr ?? '',
                        firm.tax_office ?? '',
                        firm.city ?? '',
                        anaPara,
                        raporPara,
                        reg,
                        firm.id,
                        gibMode,
                        gibUbl,
                        gibAlias,
                        gibUrl,
                        gibUser,
                        gibPass,
                        gibTest,
                    ]
                );
                saved = rows[0];
            } else {
                const { rows } = await postgres.query(
                    `INSERT INTO firms (
                       firm_nr, name, tax_nr, tax_office, city, ana_para_birimi, raporlama_para_birimi, regulatory_region,
                       gib_integration_mode, gib_ubl_profile, gib_sender_alias, gib_integrator_base_url,
                       gib_integrator_username, gib_integrator_password, gib_use_test_environment
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULLIF($11, ''), NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, ''), $15) RETURNING *`,
                    [
                        firm.firma_kodu || firm.firm_nr,
                        firm.firma_adi || firm.name,
                        firm.tax_nr ?? '',
                        firm.tax_office ?? '',
                        firm.city ?? '',
                        anaPara,
                        raporPara,
                        reg,
                        gibMode,
                        gibUbl,
                        gibAlias,
                        gibUrl,
                        gibUser,
                        gibPass,
                        gibTest,
                    ]
                );
                saved = rows[0];
            }
            const sid = firm.supabase_firm_id?.trim?.() || firm.supabase_firm_id;
            if (sid && saved?.id) {
                try {
                    await postgres.query(
                        `UPDATE firms SET supabase_firm_id = $1 WHERE id = $2::text::uuid`,
                        [sid, saved.id]
                    );
                    const { rows } = await postgres.query(`SELECT * FROM firms WHERE id = $1::text::uuid`, [saved.id]);
                    if (rows[0]) saved = rows[0];
                } catch {
                    /* firms.supabase_firm_id sütunu yoksa (eski kurulum) ana kayıt yine başarılı */
                }
            }
            return saved;
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
            const { rowCount } = await postgres.query(`DELETE FROM firms WHERE id = $1::text::uuid`, [id]);
            return rowCount > 0;
        } catch (error) {
            console.error('[OrganizationAPI] deleteFirm failed:', error);
            return false;
        }
    },

    /**
     * Get stores (mağaza/depo) for a firm
     */
    async getStoresByFirmNr(firmNr: string): Promise<{ id: string; code: string; name: string; type?: string }[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT id, code, name, type FROM public.stores WHERE firm_nr = $1 AND is_active = true ORDER BY name`,
                [firmNr]
            );
            return (rows || []).map((r: any) => ({
                id: r.id?.toString?.() ?? r.id,
                code: r.code || '',
                name: r.name || '',
                type: r.type
            }));
        } catch (error) {
            console.error('[OrganizationAPI] getStoresByFirmNr failed:', error);
            return [];
        }
    },

    /**
     * Get all firms with their periods and stores (for user tree: firma -> dönemler, mağazalar/depolar)
     */
    async getFirmsWithPeriodsAndStores(): Promise<{
        firms: Firm[];
        periodsByFirmNr: Record<string, Period[]>;
        storesByFirmNr: Record<string, { id: string; code: string; name: string; type?: string }[]>;
    }> {
        const firms = await this.getFirms();
        const periodsByFirmNr: Record<string, Period[]> = {};
        const storesByFirmNr: Record<string, { id: string; code: string; name: string; type?: string }[]> = {};
        await Promise.all(
            firms.map(async (f: any) => {
                const firmNr = f.firm_nr || f.firma_kodu || '';
                const [periods, stores] = await Promise.all([
                    this.getPeriods(f.id || firmNr),
                    this.getStoresByFirmNr(firmNr)
                ]);
                periodsByFirmNr[firmNr] = periods;
                storesByFirmNr[firmNr] = stores;
                return { periods, stores };
            })
        );
        return { firms, periodsByFirmNr, storesByFirmNr };
    },

    /**
     * Get all firms with their periods (for user allowed firms/periods selection)
     */
    async getFirmsWithPeriods(): Promise<{ firms: Firm[]; periodsByFirmNr: Record<string, Period[]> }> {
        const { firms, periodsByFirmNr } = await this.getFirmsWithPeriodsAndStores();
        return { firms, periodsByFirmNr };
    },

    /**
     * Get periods for a firm
     */
    async getPeriods(firmId: string): Promise<Period[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM periods WHERE firm_id = $1::text::uuid ORDER BY nr DESC`,
                [firmId]
            );
            return rows.map(r => ({
                ...r,
                id: r.id.toString(),
                firma_id: r.firm_id ? r.firm_id.toString() : r.firma_id,  // alias for tree filter
                donem_adi: r.nr ? `${r.nr}. Dönem` : r.donem_adi || 'Dönem',
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
            const nr = period.nr !== undefined ? period.nr : (parseInt(period.donem_adi) || 1);
            const isActive = period.durum ? period.durum === 'acik' : (period.is_active !== false);

            if (isUpdate) {
                const { rows } = await postgres.query(
                    `UPDATE periods SET nr = $1::text::int4, beg_date = $2::text::date, end_date = $3::text::date, is_active = $4 WHERE id = $5::text::uuid RETURNING *`,
                    [nr.toString(), period.baslangic_tarihi || period.beg_date, period.bitis_tarihi || period.end_date, isActive, period.id]
                );
                return rows[0];
            } else {
                const { rows } = await postgres.query(
                    `INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active) VALUES ($1::text::uuid, $2::text::int4, $3::text::date, $4::text::date, $5) RETURNING *`,
                    [period.firma_id, nr.toString(), period.baslangic_tarihi, period.bitis_tarihi, isActive]
                );
                return rows[0];
            }
        } catch (error) {
            console.error('[OrganizationAPI] savePeriod failed:', error);
            throw error;
        }
    },

    async getSystemSettings(): Promise<SystemSettingsRow | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT id, default_currency, primary_firm_nr, primary_period_nr FROM public.system_settings WHERE id = 1`,
                []
            );
            const r = rows[0] as {
                id?: number;
                default_currency?: string;
                primary_firm_nr?: string | null;
                primary_period_nr?: string | null;
            } | undefined;
            if (!r) return null;
            return {
                id: 1,
                default_currency: String(r.default_currency || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD',
                primary_firm_nr: r.primary_firm_nr != null ? String(r.primary_firm_nr) : null,
                primary_period_nr: r.primary_period_nr != null ? String(r.primary_period_nr) : null,
            };
        } catch (error) {
            console.warn('[OrganizationAPI] getSystemSettings:', error);
            return null;
        }
    },

    async saveSystemSettings(data: {
        default_currency: string;
        primary_firm_nr: string | null;
        primary_period_nr: string | null;
    }): Promise<void> {
        const dc = String(data.default_currency || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD';
        const fn = data.primary_firm_nr?.trim() || null;
        const pn = data.primary_period_nr?.trim() || null;
        await postgres.query(
            `INSERT INTO public.system_settings (id, default_currency, primary_firm_nr, primary_period_nr)
             VALUES (1, $1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
               default_currency = EXCLUDED.default_currency,
               primary_firm_nr = EXCLUDED.primary_firm_nr,
               primary_period_nr = EXCLUDED.primary_period_nr,
               updated_at = CURRENT_TIMESTAMP`,
            [dc, fn, pn]
        );
    }
};

