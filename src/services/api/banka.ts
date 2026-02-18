/**
 * ExRetailOS - Bank Service (Direct PostgreSQL Integration)
 * Refactored to use logic.bank_registers and logic.bank_lines
 */

import { postgres, ERP_SETTINGS } from '../postgres';

// ===== TYPES =====

export interface Banka {
    id: string;
    firma_id: string;
    banka_kodu: string;
    banka_adi: string;
    sube_adi?: string;
    hesap_no?: string;
    iban?: string;
    bakiye: number;
    id_bakiye: number;
    id_doviz_kodu: string;
    aktif: boolean;
    olusturma_tarihi: string;
    guncelleme_tarihi: string;
}

export interface BankaIslemi {
    id?: string;
    firma_id: string;
    banka_id: string;
    islem_no?: string;
    islem_tarihi: string;
    islem_tipi: 'CH_TAHSILAT' | 'CH_ODEME' | 'BANKA_GIRIS' | 'BANKA_CIKIS' | 'HAVALE' | 'EFT' | 'VIRMAN';
    tutar: number;
    islem_aciklamasi?: string;
    olusturma_tarihi?: string;
}

// ===== API FUNCTIONS =====

/**
 * Get active table name helpers
 */
function getBankaTableName() {
    const firmId = ERP_SETTINGS.firmNr;
    return firmId ? `public.rex_${firmId}_bank_registers` : `logic.bank_registers`;
}

function getLinesTableName() {
    const firmId = ERP_SETTINGS.firmNr;
    return firmId ? `public.rex_${firmId}_bank_lines` : `logic.bank_lines`;
}

/**
 * Tüm bankaları getir
 */
export async function fetchBankalar(params?: {
    aktif?: boolean;
}): Promise<Banka[]> {
    try {
        const table = getBankaTableName();
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE is_active = $1 ORDER BY code ASC`,
            [params?.aktif !== false]
        );

        return rows.map(mapDbBankaToBanka);
    } catch (error: any) {
        console.error('[Banka] Fetch error:', error);
        return [];
    }
}

/**
 * Banka detayını getir
 */
export async function fetchBanka(id: string): Promise<Banka> {
    try {
        const table = getBankaTableName();
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE id = $1`,
            [id]
        );

        if (rows.length === 0) throw new Error('Banka bulunamadı');
        return mapDbBankaToBanka(rows[0]);
    } catch (error: any) {
        console.error('[Banka] Fetch detail error:', error);
        throw error;
    }
}

/**
 * Yeni banka oluştur
 */
export async function createBanka(banka: Partial<Banka>): Promise<Banka> {
    try {
        const table = getBankaTableName();
        const { rows } = await postgres.query(
            `INSERT INTO ${table} (code, bank_name, branch_name, account_no, iban, currency_code, balance, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                banka.banka_kodu || '',
                banka.banka_adi || '',
                banka.sube_adi || '',
                banka.hesap_no || '',
                banka.iban || '',
                banka.id_doviz_kodu || 'IQD',
                banka.bakiye || 0,
                true
            ]
        );

        return mapDbBankaToBanka(rows[0]);
    } catch (error: any) {
        console.error('[Banka] Create error:', error);
        throw error;
    }
}

/**
 * Banka güncelle
 */
export async function updateBanka(id: string, banka: Partial<Banka>): Promise<Banka> {
    try {
        const table = getBankaTableName();
        const fields: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (banka.banka_adi) { fields.push(`bank_name = $${i++}`); values.push(banka.banka_adi); }
        if (banka.sube_adi !== undefined) { fields.push(`branch_name = $${i++}`); values.push(banka.sube_adi); }
        if (banka.hesap_no !== undefined) { fields.push(`account_no = $${i++}`); values.push(banka.hesap_no); }
        if (banka.iban !== undefined) { fields.push(`iban = $${i++}`); values.push(banka.iban); }
        if (banka.banka_kodu) { fields.push(`code = $${i++}`); values.push(banka.banka_kodu); }
        if (banka.aktif !== undefined) { fields.push(`is_active = $${i++}`); values.push(banka.aktif); }

        values.push(id);
        const { rows } = await postgres.query(
            `UPDATE ${table} SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
            values
        );

        return mapDbBankaToBanka(rows[0]);
    } catch (error: any) {
        console.error('[Banka] Update error:', error);
        throw error;
    }
}

/**
 * Banka sil
 */
export async function deleteBanka(id: string): Promise<void> {
    try {
        const table = getBankaTableName();
        await postgres.query(`UPDATE ${table} SET is_active = false WHERE id = $1`, [id]);
    } catch (error: any) {
        console.error('[Banka] Delete error:', error);
        throw error;
    }
}

/**
 * Banka işlemlerini getir
 */
export async function fetchBankaIslemleri(params?: {
    banka_id?: string;
    baslangic_tarihi?: string;
    bitis_tarihi?: string;
}): Promise<BankaIslemi[]> {
    try {
        const table = getLinesTableName();
        let sql = `SELECT * FROM ${table} WHERE 1=1`;
        const values: any[] = [];
        let i = 1;

        if (params?.banka_id) {
            sql += ` AND register_id = $${i++}`;
            values.push(params.banka_id);
        }

        if (params?.baslangic_tarihi) {
            sql += ` AND date >= $${i++}`;
            values.push(params.baslangic_tarihi);
        }

        if (params?.bitis_tarihi) {
            sql += ` AND date <= $${i++}`;
            values.push(params.bitis_tarihi);
        }

        const { rows } = await postgres.query(sql + ` ORDER BY date DESC`, values);
        return rows.map(mapDbIslemToIslem);
    } catch (error: any) {
        console.error('[Banka] İşlem fetch error:', error);
        return [];
    }
}

/**
 * Yeni banka işlemi oluştur
 */
export async function createBankaIslemi(islem: BankaIslemi): Promise<BankaIslemi> {
    try {
        const table = getLinesTableName();
        const bankaTable = getBankaTableName();

        // Start transaction
        await postgres.query('BEGIN');

        const sign = islem.islem_tipi.includes('CIKIS') || islem.islem_tipi.includes('ODEME') || islem.islem_tipi === 'EFT' || islem.islem_tipi === 'HAVALE' ? -1 : 1;

        const { rows } = await postgres.query(
            `INSERT INTO ${table} (register_id, fiche_no, date, amount, sign, definition, transaction_type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                islem.banka_id,
                islem.islem_no || '',
                islem.islem_tarihi || new Date().toISOString(),
                islem.tutar,
                sign,
                islem.islem_aciklamasi || '',
                islem.islem_tipi
            ]
        );

        // Update bank balance
        await postgres.query(
            `UPDATE ${bankaTable} SET balance = balance + $1 WHERE id = $2`,
            [islem.tutar * sign, islem.banka_id]
        );

        await postgres.query('COMMIT');

        return mapDbIslemToIslem(rows[0]);
    } catch (error: any) {
        await postgres.query('ROLLBACK');
        console.error('[Banka] İşlem create error:', error);
        throw error;
    }
}

function mapDbBankaToBanka(row: any): Banka {
    return {
        id: row.id,
        firma_id: ERP_SETTINGS.firmNr,
        banka_kodu: row.code,
        banka_adi: row.bank_name,
        sube_adi: row.branch_name,
        hesap_no: row.account_no,
        iban: row.iban,
        bakiye: parseFloat(row.balance || 0),
        id_bakiye: parseFloat(row.balance || 0),
        id_doviz_kodu: row.currency_code || 'IQD',
        aktif: row.is_active,
        olusturma_tarihi: row.created_at,
        guncelleme_tarihi: row.updated_at
    };
}

function mapDbIslemToIslem(row: any): BankaIslemi {
    return {
        id: row.id,
        firma_id: ERP_SETTINGS.firmNr,
        banka_id: row.register_id,
        islem_no: row.fiche_no,
        islem_tarihi: row.date,
        islem_tipi: row.transaction_type as any,
        tutar: parseFloat(row.amount || 0),
        islem_aciklamasi: row.definition,
        olusturma_tarihi: row.created_at
    };
}
