/**
 * ExRetailOS - Bank Service (Direct PostgreSQL Integration)
 * Refactored to use logic.bank_registers and logic.bank_lines
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}
function padPeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

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
 * Tüm bankaları getir
 */
export async function fetchBankalar(params?: {
    aktif?: boolean;
}): Promise<Banka[]> {
    try {
        const table = 'bank_registers';
        const isActive = params?.aktif !== false;
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const rows = await postgrest.get<any[]>(
                `/rex_${fn}_bank_registers`,
                {
                    select: '*',
                    is_active: `eq.${isActive ? 'true' : 'false'}`,
                    order: 'code.asc',
                },
                { schema: 'public' }
            );
            return (Array.isArray(rows) ? rows : []).map(mapDbBankaToBanka);
        }
        const { rows } = await postgres.query(
            `SELECT * FROM ${table} WHERE is_active = $1 ORDER BY code ASC`,
            [isActive]
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
        const table = 'bank_registers';
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const rows = await postgrest.get<any[]>(
                `/rex_${fn}_bank_registers`,
                { select: '*', id: `eq.${id}`, limit: 1 },
                { schema: 'public' }
            );
            const row = Array.isArray(rows) ? rows[0] : null;
            if (!row) throw new Error('Banka bulunamadı');
            return mapDbBankaToBanka(row);
        }
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
        const table = 'bank_registers';
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const body: Record<string, unknown> = {
                firm_nr: ERP_SETTINGS.firmNr,
                code: banka.banka_kodu || '',
                bank_name: banka.banka_adi || '',
                branch_name: banka.sube_adi || '',
                account_no: banka.hesap_no || '',
                iban: banka.iban || '',
                currency_code: banka.id_doviz_kodu || 'IQD',
                balance: banka.bakiye || 0,
                is_active: true,
            };
            const rows = await postgrest.post<any[]>(
                `/rex_${fn}_bank_registers`,
                body,
                { schema: 'public', prefer: 'return=representation' }
            );
            const row = Array.isArray(rows) ? rows[0] : rows;
            return mapDbBankaToBanka(row);
        }
        const { rows } = await postgres.query(
            `INSERT INTO ${table} (firm_nr, code, bank_name, branch_name, account_no, iban, currency_code, balance, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
                ERP_SETTINGS.firmNr,
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
        const table = 'bank_registers';
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
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const patchBody: Record<string, unknown> = {};
            if (banka.banka_adi) patchBody.bank_name = banka.banka_adi;
            if (banka.sube_adi !== undefined) patchBody.branch_name = banka.sube_adi;
            if (banka.hesap_no !== undefined) patchBody.account_no = banka.hesap_no;
            if (banka.iban !== undefined) patchBody.iban = banka.iban;
            if (banka.banka_kodu) patchBody.code = banka.banka_kodu;
            if (banka.aktif !== undefined) patchBody.is_active = banka.aktif;
            if (Object.keys(patchBody).length === 0) return fetchBanka(id);
            const rows = await postgrest.patch<any[]>(
                `/rex_${fn}_bank_registers?id=eq.${encodeURIComponent(id)}`,
                patchBody,
                { schema: 'public', prefer: 'return=representation' }
            );
            const row = Array.isArray(rows) ? rows[0] : rows;
            return mapDbBankaToBanka(row);
        }
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
        const table = 'bank_registers';
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            await postgrest.patch(
                `/rex_${fn}_bank_registers?id=eq.${encodeURIComponent(id)}`,
                { is_active: false },
                { schema: 'public', prefer: 'return=minimal' }
            );
            return;
        }
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
        const table = 'bank_lines';
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

        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const pn = padPeriodNr();
            const q: Record<string, string> = { select: '*', order: 'date.desc' };
            if (params?.banka_id) q.register_id = `eq.${params.banka_id}`;
            const rows = await postgrest.get<any[]>(`/rex_${fn}_${pn}_bank_lines`, q, { schema: 'public' });
            const list = Array.isArray(rows) ? rows : [];
            const d0 = (s: string) => String(s || '').slice(0, 10);
            return list
                .filter((r) => {
                    const d = d0(String(r?.date || ''));
                    if (params?.baslangic_tarihi && d < d0(params.baslangic_tarihi)) return false;
                    if (params?.bitis_tarihi && d > d0(params.bitis_tarihi)) return false;
                    return true;
                })
                .map(mapDbIslemToIslem);
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
        const table = 'bank_lines';
        const bankaTable = 'bank_registers';

        const sign = islem.islem_tipi.includes('CIKIS') || islem.islem_tipi.includes('ODEME') || islem.islem_tipi === 'EFT' || islem.islem_tipi === 'HAVALE' ? -1 : 1;

        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            const { postgrest } = await import('./postgrestClient');
            const fn = padFirmNr();
            const pn = padPeriodNr();
            const linesPath = `/rex_${fn}_${pn}_bank_lines`;
            const regPath = `/rex_${fn}_bank_registers`;
            const body: Record<string, unknown> = {
                firm_nr: String(ERP_SETTINGS.firmNr),
                period_nr: String(ERP_SETTINGS.periodNr || '01'),
                register_id: islem.banka_id,
                fiche_no: islem.islem_no || `BNK-${ERP_SETTINGS.firmNr}-${Date.now()}`,
                date: islem.islem_tarihi || new Date().toISOString(),
                amount: islem.tutar,
                sign,
                definition: islem.islem_aciklamasi || '',
                transaction_type: islem.islem_tipi,
            };
            const rows = await postgrest.post<any[]>(linesPath, body, {
                schema: 'public',
                prefer: 'return=representation',
            });
            const row = Array.isArray(rows) ? rows[0] : rows;
            const cur = await postgrest.get<any[]>(
                regPath,
                { select: 'balance', id: `eq.${islem.banka_id}`, limit: 1 },
                { schema: 'public' }
            );
            const br = Array.isArray(cur) ? cur[0] : null;
            const nb = Number(br?.balance ?? 0) + Number(islem.tutar) * sign;
            await postgrest.patch(
                `${regPath}?id=eq.${encodeURIComponent(String(islem.banka_id))}`,
                { balance: nb },
                { schema: 'public', prefer: 'return=minimal' }
            );
            return mapDbIslemToIslem(row);
        }

        // Start transaction
        await postgres.query('BEGIN');

        const { rows } = await postgres.query(
            `INSERT INTO ${table} (firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type)
         VALUES ($1::text, $2::text, $3::text::uuid, $4::text, $5::text::date, $6::text::numeric, $7::text::integer, $8::text, $9::text) RETURNING *`,
            [
                ERP_SETTINGS.firmNr,
                ERP_SETTINGS.periodNr || '01',
                islem.banka_id,
                islem.islem_no || `BNK-${ERP_SETTINGS.firmNr}-${Date.now()}`,
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
        if (DB_SETTINGS.connectionProvider !== 'rest_api') {
            try {
                await postgres.query('ROLLBACK');
            } catch {
                /* yoksa BEGIN yok */
            }
        }
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

