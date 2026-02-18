/**
 * ExRetailOS - Kasa Service (Direct PostgreSQL Integration)
 * Refactored to use logic.cash_registers and logic.cash_lines
 */

import { postgres, ERP_SETTINGS } from '../postgres';

// ===== TYPES =====

export interface Kasa {
  id: string;
  firma_id: string;
  kasa_kodu: string;
  kasa_adi: string;
  aciklama?: string;
  bakiye: number;
  id_bakiye: number;
  id_doviz_kodu: string;
  aktif: boolean;
  olusturma_tarihi: string;
  guncelleme_tarihi: string;
}

export interface KasaIslemi {
  id?: string;
  firma_id: string;
  donem_id?: string;
  kasa_id: string;
  islem_no?: string;
  islem_tarihi: string;
  islem_saati?: string;
  duzenlenme_tarihi?: string;
  islem_tipi: string;
  tutar: number;
  islem_aciklamasi?: string;
  cari_hesap_id?: string;
  cari_hesap_kodu?: string;
  cari_hesap_unvani?: string;
  doviz_kodu?: string;
  dovizli_tutar?: number;
  olusturma_tarihi?: string;
  guncelleme_tarihi?: string;
  ozel_kod?: string;
  // New fields for Virman / Bank / Expense
  target_register_id?: string;
  target_register_name?: string; // Add this line
  bank_id?: string;
  bank_account_id?: string;
  expense_card_id?: string;
  tax_rate?: number;
  withholding_tax_rate?: number;
}

// ===== API FUNCTIONS =====

/**
 * Get active table name helpers
 */
// getKasaTableName removed - using rewriter

// getLinesTableName removed - using rewriter

/**
 * Tüm kasaları getir
 */
export async function fetchKasalar(params?: {
  aktif?: boolean;
  firm_nr?: string;
}): Promise<Kasa[]> {
  try {
    // If firm_nr is provided, temporarily sync it (safety)
    if (params?.firm_nr) {
      ERP_SETTINGS.firmNr = params.firm_nr;
    }

    // Rely on postgres.query rewriter for multi-tenancy (rex_{firm}_cash_registers)
    const table = 'cash_registers';

    // DEBUG LOG
    console.log(`[KasaService] Fetching from table: ${table}, Current FirmNr: ${ERP_SETTINGS.firmNr}`);

    // params?.aktif !== false means it defaults to true if not provided.
    const isActive = params?.aktif !== false;

    const { rows } = await postgres.query(
      `SELECT * FROM ${table} WHERE is_active = ${isActive} ORDER BY code ASC`
    );

    console.log(`[KasaService] Rows found: ${rows?.length || 0}`);
    // EMERGENCY DEBUG: Write to a file in the project root so I can read it.
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/api/fs');
      await writeTextFile('kasa_debug_log.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        table,
        firmNr: ERP_SETTINGS.firmNr,
        rowCount: rows?.length || 0,
        firstRow: rows?.[0] || null,
        params: params || null
      }, null, 2), { dir: BaseDirectory.AppConfig });
      // Wait, AppConfig might be hard to find. Let's try to just use a local path if possible or just log it.
      // Actually, I can't easily write to a known path without permissions.
    } catch (e) { }

    return (rows || []).map(mapDbKasaToKasa);
  } catch (error: any) {
    console.error('[Kasa] Fetch error:', error);
    // Throw error so component catch block handles it (e.g. mock data or toast)
    throw error;
  }
}

/**
 * Kasa detayını getir
 */
export async function fetchKasa(id: string): Promise<Kasa> {
  try {
    const table = 'cash_registers';
    const { rows } = await postgres.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) throw new Error('Kasa bulunamadı');
    return mapDbKasaToKasa(rows[0]);
  } catch (error: any) {
    console.error('[Kasa] Fetch detail error:', error);
    throw error;
  }
}

/**
 * Yeni kasa oluştur
 */
export async function createKasa(kasa: Omit<Kasa, 'id'>): Promise<string> {
  try {
    const table = 'cash_registers';
    const { rows } = await postgres.query(
      `INSERT INTO ${table} (code, name, currency_code, balance, is_active) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        kasa.kasa_kodu || '',
        kasa.kasa_adi || '',
        kasa.id_doviz_kodu || 'IQD',
        kasa.bakiye || 0,
        true
      ]
    );

    return rows[0].id; // Assuming the ID is returned
  } catch (error: any) {
    console.error('[Kasa] Create error:', error);
    throw error;
  }
}

/**
 * Kasa güncelle
 */
export async function updateKasa(id: string, kasa: Partial<Kasa>): Promise<Kasa> {
  try {
    const table = 'cash_registers';
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (kasa.kasa_adi) { fields.push(`name = $${i++}`); values.push(kasa.kasa_adi); }
    if (kasa.kasa_kodu) { fields.push(`code = $${i++}`); values.push(kasa.kasa_kodu); }
    if (kasa.aktif !== undefined) { fields.push(`is_active = ${kasa.aktif}`); }

    values.push(id);
    const { rows } = await postgres.query(
      `UPDATE ${table} SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );

    return mapDbKasaToKasa(rows[0]);
  } catch (error: any) {
    console.error('[Kasa] Update error:', error);
    throw error;
  }
}

/**
 * Kasa sil
 */
export async function deleteKasa(id: string): Promise<void> {
  try {
    const table = 'cash_registers';
    await postgres.query(`UPDATE ${table} SET is_active = false WHERE id = $1`, [id]);
  } catch (error: any) {
    console.error('[Kasa] Delete error:', error);
    throw error;
  }
}

/**
 * Kasa işlemlerini getir
 */
export async function fetchKasaIslemleri(params?: {
  kasa_id?: string;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  firm_nr?: string;
  period_nr?: string;
}): Promise<KasaIslemi[]> {
  try {
    if (params?.firm_nr) ERP_SETTINGS.firmNr = params.firm_nr;
    if (params?.period_nr) ERP_SETTINGS.periodNr = params.period_nr;

    const table = 'cash_lines';
    // customers ve suppliers tablolarını join yap
    // Not: Dinamik tablo isimleri postgres.ts içindeki rewriter tarafından halledilir (rex_ prefixleri)
    let sql = `
      SELECT 
        cl.*,
        COALESCE(c.name, s.name) as current_account_name,
        COALESCE(c.code, s.code) as current_account_code,
        target_kasa.name as target_register_name,
        target_kasa.code as target_register_code
      FROM ${table} cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      LEFT JOIN suppliers s ON cl.customer_id = s.id
      LEFT JOIN cash_registers target_kasa ON cl.target_register_id = target_kasa.id
      WHERE 1=1
    `;

    const values: any[] = [];
    let i = 1;

    if (params?.kasa_id) {
      sql += ` AND cl.register_id = $${i++}::text::uuid`;
      values.push(params.kasa_id);
    }

    if (params?.baslangic_tarihi) {
      sql += ` AND cl.date >= $${i++}`;
      values.push(params.baslangic_tarihi);
    }

    if (params?.bitis_tarihi) {
      sql += ` AND cl.date <= $${i++}`;
      values.push(params.bitis_tarihi);
    }

    const { rows } = await postgres.query(sql + ` ORDER BY cl.date DESC`, values);

    // Assuming a logger exists, otherwise this line would cause an error.
    // If logger is not defined, it should be removed or replaced with console.log
    //    // logger.sql('Postgres', 'Fetched cash transactions', { count: rows.length });
    console.log('[Kasa] Fetched cash transactions:', rows.length);

    return rows.map(row => ({
      ...mapDbIslemToIslem(row),
      cari_hesap_unvani: row.current_account_name || row.definition, // Map fetched name
      cari_hesap_kodu: row.current_account_code,
      target_register_name: row.target_register_name, // Add target register name
    }));
  } catch (error: any) {
    console.error('[Kasa] İşlem fetch error:', error);
    return [];
  }
}

/**
 * Yeni kasa işlemi oluştur
 */
export async function createKasaIslemi(islem: KasaIslemi): Promise<KasaIslemi> {
  try {
    const table = 'cash_lines';
    const kasaTable = 'cash_registers';

    // Start transaction
    await postgres.query('BEGIN');
    console.log('[Kasa] Transaction STARTED. Type:', islem.islem_tipi, 'Target:', islem.target_register_id);

    // Determine Sign based on Transaction Type
    let sign = 0;
    switch (islem.islem_tipi) {
      case 'CH_TAHSILAT':
      case 'KASA_GIRIS':
      case 'BANKADAN_CEKILEN':
      case 'ALINAN_SERBEST_MESLEK':
      case 'ACILIS_BORC':
      case 'KUR_FARKI_BORC':
        sign = 1;
        break;
      case 'CH_ODEME':
      case 'KASA_CIKIS':
      case 'BANKA_YATIRILAN':
      case 'VIRMAN':
      case 'GIDER_PUSULASI':
      case 'VERILEN_SERBEST_MESLEK':
      case 'MUSTAHSIL_MAKBUZU':
      case 'ACILIS_ALACAK':
      case 'KUR_FARKI_ALACAK':
        sign = -1;
        break;
      default:
        // Fallback for safety (though all types should be covered)
        sign = islem.islem_tipi.includes('CIKIS') || islem.islem_tipi.includes('ODEME') ? -1 : 1;
    }

    const { rows } = await postgres.query(
      `INSERT INTO ${table} (
         register_id, fiche_no, date, amount, sign, definition, transaction_type, 
         customer_id, currency_code, exchange_rate, f_amount, transfer_status, special_code,
         target_register_id, bank_id, bank_account_id, expense_card_id, tax_rate, withholding_tax_rate
       ) 
         VALUES (
           $1::text::uuid, 
           $2::text, 
           $3::text::date, 
           $4::text::numeric, 
           $5::text::integer, 
           $6::text, 
           $7::text, 
           $8::text::uuid, 
           $9::text, 
           $10::text::numeric, 
           $11::text::numeric, 
           0, 
          $12::text,
           $13::text::uuid,
           $14::text::uuid,
           $15::text::uuid,
           $16::text::uuid,
           $17::text::numeric,
           $18::text::numeric
         ) RETURNING *`,
      [
        islem.kasa_id || null, // Ensure not undefined
        islem.islem_no || '',
        islem.islem_tarihi || new Date().toISOString(),
        islem.tutar || 0,
        sign,
        islem.islem_aciklamasi || '',
        islem.islem_tipi || '',
        islem.cari_hesap_id || null,
        islem.doviz_kodu || 'YEREL',
        1,
        islem.dovizli_tutar || 0,
        islem.ozel_kod || '',
        islem.target_register_id || null,
        islem.bank_id || null,
        islem.bank_account_id || null,
        islem.expense_card_id || null,
        islem.tax_rate || 0,
        islem.withholding_tax_rate || 0
      ]
    );

    // Update kasa balance
    await postgres.query(
      `UPDATE ${kasaTable} SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
      [(islem.tutar * sign).toString(), islem.kasa_id]
    );

    // VIRMAN Logic: Create counter transaction if target_register_id is present
    if (islem.islem_tipi === 'VIRMAN' && islem.target_register_id) {
      console.log('[Kasa] Executing VIRMAN Counter Transaction logic for target:', islem.target_register_id);
      // Counter transaction: Money IN (+1) for Target Register
      await postgres.query(
        `INSERT INTO ${table} (
           register_id, fiche_no, date, amount, sign, definition, transaction_type, 
           customer_id, currency_code, exchange_rate, f_amount, transfer_status, special_code,
           target_register_id
         ) 
           VALUES (
             $1::text::uuid, 
             $2::text, 
             $3::text::date, 
             $4::text::numeric, 
             $5::text::integer, 
             $6::text, 
             $7::text, 
             $8::text::uuid, 
             $9::text, 
             $10::text::numeric, 
             $11::text::numeric, 
             0, 
             $12::text,
             $13::text::uuid
           )`,
        [
          islem.target_register_id, // Target Register
          islem.islem_no || '',
          islem.islem_tarihi || new Date().toISOString(),
          islem.tutar || 0,
          1, // Sign is +1 (IN) for target
          `${islem.islem_aciklamasi || ''} (Virman Alındı)`, // Modify description
          'VIRMAN',
          null, // No customer
          islem.doviz_kodu || 'YEREL',
          1,
          islem.dovizli_tutar || 0,
          islem.ozel_kod || '',
          islem.kasa_id // Link back to source register
        ]
      );

      // Update Target Kasa Balance
      await postgres.query(
        `UPDATE ${kasaTable} SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
        [islem.tutar.toString(), islem.target_register_id]
      );
      console.log('[Kasa] VIRMAN Counter Transaction COMPLETED');
    } else if (islem.islem_tipi === 'VIRMAN') {
      console.warn('[Kasa] VIRMAN logic SKIPPED. Target register ID missing or falsy:', islem.target_register_id);
    }

    // BANK INTEGRATION Logic
    if ((islem.islem_tipi === 'BANKA_YATIRILAN' || islem.islem_tipi === 'BANKADAN_CEKILEN') && islem.bank_id) {
      const bankTable = 'bank_registers';
      const bankLinesTable = 'bank_lines';

      // Determine Bank Transaction Type and Sign
      // BANKA_YATIRILAN: Cash OUT (-1), Bank IN (+1, BANKA_GIRIS)
      // BANKADAN_CEKILEN: Cash IN (+1), Bank OUT (-1, BANKA_CIKIS)

      let bankSign = 0;
      let bankTransType = '';

      if (islem.islem_tipi === 'BANKA_YATIRILAN') {
        bankSign = 1;
        bankTransType = 'BANKA_GIRIS';
      } else {
        bankSign = -1;
        bankTransType = 'BANKA_CIKIS';
      }

      await postgres.query(
        `INSERT INTO ${bankLinesTable} (
           register_id, fiche_no, date, amount, sign, definition, transaction_type
         ) 
         VALUES ($1::text::uuid, $2::text, $3::text::date, $4::text::numeric, $5::text::integer, $6::text, $7::text)`,
        [
          islem.bank_id,
          islem.islem_no || '',
          islem.islem_tarihi || new Date().toISOString(),
          islem.tutar,
          bankSign,
          `${islem.islem_aciklamasi || ''} (Kasa Entegrasyon)`,
          bankTransType
        ]
      );

      // Update Bank Balance
      await postgres.query(
        `UPDATE ${bankTable} SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
        [(islem.tutar * bankSign).toString(), islem.bank_id]
      );
    }

    await postgres.query('COMMIT');

    return mapDbIslemToIslem(rows[0]);
  } catch (error: any) {
    await postgres.query('ROLLBACK');
    console.error('[Kasa] İşlem create error:', error);
    throw error;
  }
}

function mapDbKasaToKasa(row: any): Kasa {
  return {
    id: row.id,
    firma_id: ERP_SETTINGS.firmNr,
    kasa_kodu: row.code,
    kasa_adi: row.name,
    bakiye: parseFloat(row.balance || 0),
    id_bakiye: parseFloat(row.balance || 0),
    id_doviz_kodu: row.currency_code || 'IQD',
    aktif: row.is_active,
    olusturma_tarihi: row.created_at,
    guncelleme_tarihi: row.updated_at
  };
}

function mapDbIslemToIslem(row: any): KasaIslemi {
  return {
    id: row.id,
    firma_id: ERP_SETTINGS.firmNr,
    kasa_id: row.register_id,
    islem_no: row.fiche_no,
    islem_tarihi: row.date,
    islem_tipi: row.transaction_type,
    tutar: parseFloat(row.amount || 0),
    islem_aciklamasi: row.definition,
    olusturma_tarihi: row.created_at
  };
}
