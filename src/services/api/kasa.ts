/**
 * ExRetailOS - Kasa Service (Direct PostgreSQL Integration)
 * Refactored to use logic.cash_registers and logic.cash_lines
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  cariCashStoredBalanceDelta,
  normalizeFirmTableNr,
} from './accountBalance';
import { ensureCariAccountInCurrentFirm } from './cariAccountResolve';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';

function padKasaFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}
function padKasaPeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

function partyLedgerTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_party_ledger_movements`;
}

/**
 * Personel/Şirket Ortağı için party_id → card_type ('employee' | 'partner' | 'customer' | 'supplier') çözümler.
 * Bulunamazsa varsayılan 'employee' döner — silme ters kayıt audit için yine de yazılır.
 */
async function resolvePartyCardType(partyId: string): Promise<string> {
  try {
    const tbl = `rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties`;
    const { rows } = await postgres.query(
      `SELECT card_type FROM ${tbl} WHERE id = $1::text::uuid LIMIT 1`,
      [partyId],
    );
    return String(rows?.[0]?.card_type || 'employee');
  } catch {
    return 'employee';
  }
}

const PARTY_CANCEL_TYPES = new Set<string>([
  'MAAS_ODEME',
  'MAAS_HAKKEDIS',
  'AVANS_ODEME',
  'AVANS_MAHSUP',
  'ORTAK_DAGITIM_KAR',
  'ORTAK_DAGITIM_ZARAR',
  'ORTAK_SERMAYE_TAHSILAT',
  'ORTAK_SERMAYE_ODEME',
  'ORTAK_PARA_GIRIS',
  'ORTAK_PARA_CIKIS',
  'ORTAK_SERMAYE_CIKIS',
]);

async function writePartyLedgerCancel(opts: {
  partyId: string;
  cardType: string;
  trType: string;
  amount: number;
  sign: number;
  definition?: string | null;
  cashLineId: string;
}): Promise<void> {
  await ensurePartyPeriodTables();
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  // Idempotent: aynı cash_line_id için daha önce CANCELLED kaydı açıldıysa yeniden açma
  const { rows: existing } = await postgres.query(
    `SELECT 1 FROM ${partyLedgerTable()}
       WHERE cash_line_id = $1::text::uuid AND source_module = 'cash_delete' LIMIT 1`,
    [opts.cashLineId],
  );
  if (existing?.length) return;

  await postgres.query(
    `INSERT INTO ${partyLedgerTable()} (
       firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
       date, amount, sign, definition, source_module, source_id, cash_line_id
     ) VALUES (
       $1::text, $2::text, $3::text::uuid, $4::text, 0, $5::text,
       NOW(), $6::text::numeric, $7::integer, $8::text, 'cash_delete', $9::text::uuid, $10::text::uuid
     )`,
    [
      firmNr,
      period,
      opts.partyId,
      opts.cardType,
      `CANCELLED_${opts.trType}`,
      Math.abs(opts.amount).toString(),
      -opts.sign,
      `İptal: ${opts.definition || ''}`.trim(),
      opts.cashLineId,
      opts.cashLineId,
    ],
  );
}

/**
 * Parties (Personel / Şirket Ortağı) için bakiye delta hesabı.
 *
 * Bakiye yönü:
 *   Personel pozitif = ödenmemiş maaş alacağı (hakkediş − ödeme/avans).
 *   Ortağı pozitif = ortağın işletmeden alacağı (dağıtılmamış kâr payı).
 *
 * İşlem       | Kasa sign | Party balance delta
 * -----------|-----------|--------------------
 * MAAS_HAKKEDIS |  0      |   +tutar (kasa yok; payroll API yazar)
 * MAAS_ODEME  |   -1      |   −tutar (ödenen maaş)
 * AVANS_ODEME |   -1      |   −tutar (avans)
 * AVANS_MAHSUP|    0      |    0     (belge; avans zaten düştü)
 * ORTAK_DAGITIM_KAR  |  0 | +tutar (hesaba kâr payı; kasa yok)
 * ORTAK_DAGITIM_ZARAR|  0 | -tutar (hesaba zarar; kasa yok)
 * ORTAK_SERMAYE_TAHSILAT | +1 | +tutar (para girişi: ortak kasaya koyar)
 * ORTAK_SERMAYE_ODEME    | -1 | -tutar (para çıkışı: ortak kasadan çeker)
 */
export function computePartyBalanceDelta(tutar: number, islemTipi: string): number {
  const amt = Math.abs(parseFloat(String(tutar ?? 0)) || 0);
  if (!amt) return 0;
  switch (String(islemTipi || '').toUpperCase().trim()) {
    case 'MAAS_HAKKEDIS':
    case 'ORTAK_DAGITIM_KAR':
    case 'ORTAK_SERMAYE_TAHSILAT':
    case 'ORTAK_PARA_GIRIS':
      return amt;
    case 'MAAS_ODEME':
    case 'AVANS_ODEME':
    case 'ORTAK_DAGITIM_ZARAR':
    case 'ORTAK_SERMAYE_ODEME':
    case 'ORTAK_PARA_CIKIS':
    case 'ORTAK_SERMAYE_CIKIS':
      return -amt;
    case 'AVANS_MAHSUP':
      return 0;
    default:
      return 0;
  }
}

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
  /** Detay modalında gösterilen ek alanlar (Logo/ERP uyumluluğu) */
  makbuz_no?: string;
  durumu?: string;
  ticari_islem_grubu?: string;
  kullanilacak_para_birimi?: string;
  nakit_indirimli?: boolean | string | number;
  teminat_riskini_etkileyecek?: boolean | string;
  riski_etkileyecek?: boolean | string;
  isyeri_adi?: string;
  isyeri_kodu?: string;
  satis_elemani_kodu?: string;
  yetki_kodu?: string;
  kasa_aciklamasi?: string;
  muhasebe_fis_no?: string;
  // New fields for Virman / Bank / Expense
  target_register_id?: string;
  target_register_name?: string; // Add this line
  bank_id?: string;
  bank_account_id?: string;
  expense_card_id?: string;
  tax_rate?: number;
  withholding_tax_rate?: number;
  /** Polimorfik cari ref — Personel/Şirket Ortağı işlemleri için (customer_id ayrı tutulur) */
  party_id?: string;
  party_code?: string;
  party_name?: string;
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

    let rows: any[] = [];
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      rows = await postgrest.get<any[]>(
        `/rex_${padKasaFirmNr()}_cash_registers`,
        {
          select: '*',
          is_active: `eq.${isActive ? 'true' : 'false'}`,
          order: 'code.asc',
        },
        { schema: 'public' }
      );
    } else {
      const result = await postgres.query(
        `SELECT * FROM ${table} WHERE is_active = ${isActive} ORDER BY code ASC`
      );
      rows = result.rows || [];
    }

    console.log(`[KasaService] Rows found: ${rows?.length || 0}`);

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
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const rows = await postgrest.get<any[]>(
        `/rex_${padKasaFirmNr()}_cash_registers`,
        { select: '*', id: `eq.${id}`, limit: 1 },
        { schema: 'public' }
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new Error('Kasa bulunamadı');
      return mapDbKasaToKasa(row);
    }
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
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const body: Record<string, unknown> = {
        firm_nr: ERP_SETTINGS.firmNr,
        code: kasa.kasa_kodu || '',
        name: kasa.kasa_adi || '',
        currency_code: kasa.id_doviz_kodu || 'IQD',
        balance: kasa.bakiye || 0,
        is_active: true,
      };
      const rows = await postgrest.post<any[]>(
        `/rex_${padKasaFirmNr()}_cash_registers`,
        body,
        { schema: 'public', prefer: 'return=representation' }
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      return String(row?.id || '');
    }
    const { rows } = await postgres.query(
      `INSERT INTO ${table} (firm_nr, code, name, currency_code, balance, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        ERP_SETTINGS.firmNr,
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

export async function cloneKasa(source: Kasa): Promise<string> {
  const suffix = '-K';
  let code = `${source.kasa_kodu || 'KASA'}${suffix}`;
  let name = `${source.kasa_adi || 'Kasa'} (Kopya)`;
  let n = 2;
  while (n < 50) {
    try {
      return await createKasa({
        firma_id: source.firma_id,
        kasa_kodu: code,
        kasa_adi: name,
        aciklama: source.aciklama,
        bakiye: 0,
        id_bakiye: 0,
        id_doviz_kodu: source.id_doviz_kodu || 'IQD',
        aktif: true,
        olusturma_tarihi: new Date().toISOString(),
        guncelleme_tarihi: new Date().toISOString(),
      });
    } catch {
      code = `${source.kasa_kodu || 'KASA'}${suffix}${n}`;
      name = `${source.kasa_adi || 'Kasa'} (Kopya ${n})`;
      n += 1;
    }
  }
  throw new Error('Kasa klonlanamadı — benzersiz kod üretilemedi.');
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
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const patchBody: Record<string, unknown> = {};
      if (kasa.kasa_adi) patchBody.name = kasa.kasa_adi;
      if (kasa.kasa_kodu) patchBody.code = kasa.kasa_kodu;
      if (kasa.aktif !== undefined) patchBody.is_active = kasa.aktif;
      if (Object.keys(patchBody).length === 0) return fetchKasa(id);
      const rows = await postgrest.patch<any[]>(
        `/rex_${padKasaFirmNr()}_cash_registers?id=eq.${encodeURIComponent(id)}`,
        patchBody,
        { schema: 'public', prefer: 'return=representation' }
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      return mapDbKasaToKasa(row);
    }
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
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      await postgrest.patch(
        `/rex_${padKasaFirmNr()}_cash_registers?id=eq.${encodeURIComponent(id)}`,
        { is_active: false },
        { schema: 'public', prefer: 'return=minimal' }
      );
      return;
    }
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

    let rows: any[] = [];
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const tableName = `/rex_${padKasaFirmNr()}_${padKasaPeriodNr()}_cash_lines`;
      const query: Record<string, string> = {
        select: '*',
        order: 'date.desc',
      };
      if (params?.kasa_id) query.register_id = `eq.${params.kasa_id}`;
      const fetched = await postgrest.get<any[]>(tableName, query, { schema: 'public' });
      rows = (Array.isArray(fetched) ? fetched : []).filter((r: any) => {
        const d = String(r?.date || '').slice(0, 10);
        if (params?.baslangic_tarihi && d < String(params.baslangic_tarihi).slice(0, 10)) return false;
        if (params?.bitis_tarihi && d > String(params.bitis_tarihi).slice(0, 10)) return false;
        return true;
      });
    } else {
      const result = await postgres.query(sql + ` ORDER BY cl.date DESC`, values);
      rows = result.rows || [];
    }

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

/** PostgREST: kasa hareketi + bakiyeler (atomik DEĞİL; `rest_api` için) */
async function createKasaIslemiViaPostgrest(
  islem: KasaIslemi,
  sign: number,
  ficheNo: string
): Promise<KasaIslemi> {
  const { postgrest } = await import('./postgrestClient');
  const fn = padKasaFirmNr();
  const pn = padKasaPeriodNr();
  const linesPath = `/rex_${fn}_${pn}_cash_lines`;
  const kasaPath = `/rex_${fn}_cash_registers`;
  const bankLinesPath = `/rex_${fn}_${pn}_bank_lines`;
  const bankRegPath = `/rex_${fn}_bank_registers`;

  const lineBody: Record<string, unknown> = {
    firm_nr: String(ERP_SETTINGS.firmNr),
    period_nr: String(ERP_SETTINGS.periodNr || '01'),
    register_id: islem.kasa_id || null,
    fiche_no: ficheNo,
    date: islem.islem_tarihi || new Date().toISOString(),
    amount: islem.tutar || 0,
    sign,
    definition: islem.islem_aciklamasi || '',
    transaction_type: islem.islem_tipi || '',
    customer_id: islem.cari_hesap_id || null,
    party_id: islem.party_id || null,
    currency_code: islem.doviz_kodu || 'YEREL',
    exchange_rate: 1,
    f_amount: islem.dovizli_tutar || 0,
    transfer_status: 0,
    special_code: islem.ozel_kod || '',
    target_register_id: islem.target_register_id || null,
    bank_id: islem.bank_id || null,
    bank_account_id: islem.bank_account_id || null,
    expense_card_id: islem.expense_card_id || null,
    tax_rate: islem.tax_rate || 0,
    withholding_tax_rate: islem.withholding_tax_rate || 0,
  };

  const rows = await postgrest.post<any[]>(linesPath, lineBody, {
    schema: 'public',
    prefer: 'return=representation',
  });
  const mainRow = Array.isArray(rows) ? rows[0] : rows;

  const bumpKasaBalance = async (registerId: string | undefined, delta: number) => {
    if (!registerId || Number.isNaN(delta) || delta === 0) return;
    const cur = await postgrest.get<any[]>(
      kasaPath,
      { select: 'balance', id: `eq.${registerId}`, limit: 1 },
      { schema: 'public' }
    );
    const row = Array.isArray(cur) ? cur[0] : null;
    if (!row) return;
    const nb = Number(row.balance ?? 0) + delta;
    await postgrest.patch(
      `${kasaPath}?id=eq.${encodeURIComponent(String(registerId))}`,
      { balance: nb },
      { schema: 'public', prefer: 'return=minimal' }
    );
  };

  await bumpKasaBalance(islem.kasa_id, Number(islem.tutar || 0) * sign);

  if (islem.party_id) {
    const partyDelta = computePartyBalanceDelta(islem.tutar, islem.islem_tipi);
    if (partyDelta !== 0) {
      try {
        const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
        const partyPath = `/rex_${firmNr}_parties`;
        const rs = await postgrest.get<any[]>(
          partyPath,
          { select: 'balance', id: `eq.${islem.party_id}`, limit: '1' },
          { schema: 'public' },
        );
        const r = Array.isArray(rs) ? rs[0] : null;
        if (r) {
          await postgrest.patch(
            `${partyPath}?id=eq.${encodeURIComponent(String(islem.party_id))}`,
            { balance: Number(r.balance ?? 0) + partyDelta },
            { schema: 'public', prefer: 'return=minimal' },
          );
        }
      } catch {
        /* payroll API ledger recomputes card balance */
      }
    }
  }

  if (islem.cari_hesap_id && (islem.islem_tipi === 'CH_ODEME' || islem.islem_tipi === 'CH_TAHSILAT')) {
    const delta = cariCashStoredBalanceDelta(islem.tutar, islem.islem_tipi);
    if (delta !== 0) {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const custPath = `/rex_${firmNr}_customers`;
      const supPath = `/rex_${firmNr}_suppliers`;
      const patchPartner = async (path: string, withFirm: boolean) => {
        try {
          const { stripPostgrestOpPrefix } = await import('./postgrestClient');
          const partnerId = stripPostgrestOpPrefix(String(islem.cari_hesap_id));
          const q: Record<string, string> = {
            select: 'balance',
            id: `eq.${partnerId}`,
            limit: '1',
          };
          if (withFirm) q.firm_nr = `eq.${firmNr}`;
          const rs = await postgrest.get<any[]>(path, q, { schema: 'public' });
          const r = Array.isArray(rs) ? rs[0] : null;
          if (!r) return false;
          const nb = Number(r.balance ?? 0) + delta;
          const url = withFirm
            ? `${path}?id=eq.${encodeURIComponent(partnerId)}&firm_nr=eq.${encodeURIComponent(firmNr)}`
            : `${path}?id=eq.${encodeURIComponent(partnerId)}`;
          await postgrest.patch(url, { balance: nb }, { schema: 'public', prefer: 'return=minimal' });
          return true;
        } catch {
          return false;
        }
      };
      const patchedCustomer = await patchPartner(custPath, true);
      if (!patchedCustomer) {
        await patchPartner(supPath, false);
      }
    }
  }

  if (islem.islem_tipi === 'VIRMAN' && islem.target_register_id) {
    const counterBody: Record<string, unknown> = {
      firm_nr: String(ERP_SETTINGS.firmNr),
      period_nr: String(ERP_SETTINGS.periodNr || '01'),
      register_id: islem.target_register_id,
      fiche_no: `${ficheNo}-VRM`,
      date: islem.islem_tarihi || new Date().toISOString(),
      amount: islem.tutar || 0,
      sign: 1,
      definition: `${islem.islem_aciklamasi || ''} (Virman Alındı)`,
      transaction_type: 'VIRMAN',
      customer_id: null,
      currency_code: islem.doviz_kodu || 'YEREL',
      exchange_rate: 1,
      f_amount: islem.dovizli_tutar || 0,
      transfer_status: 0,
      special_code: islem.ozel_kod || '',
      target_register_id: islem.kasa_id,
    };
    await postgrest.post(linesPath, counterBody, { schema: 'public', prefer: 'return=minimal' });
    await bumpKasaBalance(islem.target_register_id, Number(islem.tutar || 0));
  } else if (islem.islem_tipi === 'VIRMAN') {
    console.warn('[Kasa] VIRMAN logic SKIPPED. Target register ID missing or falsy:', islem.target_register_id);
  }

  if ((islem.islem_tipi === 'BANKA_YATIRILAN' || islem.islem_tipi === 'BANKADAN_CEKILEN') && islem.bank_id) {
    let bankSign = 0;
    let bankTransType = '';
    if (islem.islem_tipi === 'BANKA_YATIRILAN') {
      bankSign = 1;
      bankTransType = 'BANKA_GIRIS';
    } else {
      bankSign = -1;
      bankTransType = 'BANKA_CIKIS';
    }
    await postgrest.post(
      bankLinesPath,
      {
        firm_nr: String(ERP_SETTINGS.firmNr),
        period_nr: String(ERP_SETTINGS.periodNr || '01'),
        register_id: islem.bank_id,
        fiche_no: islem.islem_no || '',
        date: islem.islem_tarihi || new Date().toISOString(),
        amount: islem.tutar,
        sign: bankSign,
        definition: `${islem.islem_aciklamasi || ''} (Kasa Entegrasyon)`,
        transaction_type: bankTransType,
      },
      { schema: 'public', prefer: 'return=minimal' }
    );
    const curB = await postgrest.get<any[]>(
      bankRegPath,
      { select: 'balance', id: `eq.${islem.bank_id}`, limit: 1 },
      { schema: 'public' }
    );
    const br = Array.isArray(curB) ? curB[0] : null;
    if (br) {
      const nb = Number(br.balance ?? 0) + Number(islem.tutar) * bankSign;
      await postgrest.patch(
        `${bankRegPath}?id=eq.${encodeURIComponent(String(islem.bank_id))}`,
        { balance: nb },
        { schema: 'public', prefer: 'return=minimal' }
      );
    }
  }

  return mapDbIslemToIslem(mainRow);
}

/**
 * Yeni kasa işlemi oluştur
 */
export async function createKasaIslemi(incoming: KasaIslemi): Promise<KasaIslemi> {
  try {
    let islem = {
      ...incoming,
      islem_tipi: String(incoming.islem_tipi || '').trim().toUpperCase(),
      tutar: Math.abs(Number(incoming.tutar) || 0),
    };
    if (
      (islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'CH_ODEME') &&
      !islem.cari_hesap_id
    ) {
      throw new Error('Cari hesap seçilmeden tahsilat/ödeme kaydedilemez');
    }

    if (
      islem.cari_hesap_id &&
      (islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'CH_ODEME')
    ) {
      const canon = await ensureCariAccountInCurrentFirm(islem.cari_hesap_id, {
        code: islem.cari_hesap_kodu,
        name: islem.cari_hesap_unvani,
      });
      if (canon.id) {
        islem = { ...islem, cari_hesap_id: canon.id };
      }
    }

    const table = 'cash_lines';
    const kasaTable = 'cash_registers';

    let sign = 0;
    switch (islem.islem_tipi) {
      case 'CH_TAHSILAT':
      case 'KASA_GIRIS':
      case 'BANKADAN_CEKILEN':
      case 'ALINAN_SERBEST_MESLEK':
      case 'ACILIS_BORC':
      case 'KUR_FARKI_BORC':
      case 'ORTAK_DAGITIM_ZARAR':
      case 'ORTAK_SERMAYE_TAHSILAT':
      case 'ORTAK_PARA_GIRIS':
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
      case 'MAAS_ODEME':
      case 'AVANS_ODEME':
      case 'ORTAK_DAGITIM_KAR':
      case 'ORTAK_SERMAYE_ODEME':
      case 'ORTAK_PARA_CIKIS':
      case 'ORTAK_SERMAYE_CIKIS':
        sign = -1;
        break;
      case 'AVANS_MAHSUP':
        sign = 0;
        break;
      default:
        sign = islem.islem_tipi.includes('CIKIS') || islem.islem_tipi.includes('ODEME') ? -1 : 1;
    }

    const ficheNo = islem.islem_no || `KL-${ERP_SETTINGS.firmNr}-${Date.now()}`;

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      console.log('[Kasa] PostgREST işlem. Type:', islem.islem_tipi, 'Target:', islem.target_register_id);
      return await createKasaIslemiViaPostgrest(islem, sign, ficheNo);
    }

    // Start transaction
    await postgres.query('BEGIN');
    console.log('[Kasa] Transaction STARTED. Type:', islem.islem_tipi, 'Target:', islem.target_register_id);

    const { rows } = await postgres.query(
      `INSERT INTO ${table} (
         firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type,
         customer_id, party_id, currency_code, exchange_rate, f_amount, transfer_status, special_code,
         target_register_id, bank_id, bank_account_id, expense_card_id, tax_rate, withholding_tax_rate
       )
         VALUES (
           $1::text,
           $2::text,
           $3::text::uuid,
           $4::text,
           $5::text::date,
           $6::text::numeric,
           $7::text::integer,
           $8::text,
           $9::text,
           $10::text::uuid,
           $11::text::uuid,
           $12::text,
           $13::text::numeric,
           $14::text::numeric,
           0,
           $15::text,
           $16::text::uuid,
           $17::text::uuid,
           $18::text::uuid,
           $19::text::uuid,
           $20::text::numeric,
           $21::text::numeric
         ) RETURNING *`,
      [
        ERP_SETTINGS.firmNr,
        ERP_SETTINGS.periodNr || '01',
        islem.kasa_id || null,
        ficheNo,
        islem.islem_tarihi || new Date().toISOString(),
        islem.tutar || 0,
        sign,
        islem.islem_aciklamasi || '',
        islem.islem_tipi || '',
        islem.cari_hesap_id || null,
        islem.party_id || null,
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

    // Update current account balance for CH_ODEME and CH_TAHSILAT
    // Önemli: Kasa sign (+1/-1) cariye uygulanmaz. Tahsilat/ödeme açık bakiyeyi düşürür (-ABS).
    // CH_TAHSILAT: müşteriden tahsilat → alacak → borç ↓
    // CH_ODEME: tedarikçiye/müşteriye ödeme → açık ↓
    if (islem.cari_hesap_id && (islem.islem_tipi === 'CH_ODEME' || islem.islem_tipi === 'CH_TAHSILAT')) {
      const delta = cariCashStoredBalanceDelta(islem.tutar, islem.islem_tipi);
      if (delta !== 0) {
        const deltaStr = delta.toString();
        const { rowCount: custCount } = await postgres.query(
          `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
          [deltaStr, islem.cari_hesap_id, normalizeFirmTableNr(ERP_SETTINGS.firmNr)],
        );
        if (!custCount) {
          await postgres.query(
            `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
            [deltaStr, islem.cari_hesap_id],
          );
        }
      }
    }

    // Parties (Personel / Şirket Ortağı) — party_id ile polymorphic bakiye güncelleme.
    // Personel: MAAS_ODEME/AVANS_ODEME (−tutar, ödenmemiş maaş alacağı ↓).
    // Ortağı nakit: ORTAK_SERMAYE_TAHSILAT (kasa +, bakiye +), ORTAK_SERMAYE_ODEME (kasa −, bakiye −).
    // Kâr/zarar dağıtımı kasa yazmaz; ledger + parties.balance partnerDistribution içinde güncellenir.
    if (islem.party_id) {
      const partyDelta = computePartyBalanceDelta(islem.tutar, islem.islem_tipi);
      if (partyDelta !== 0) {
        await postgres.query(
          `UPDATE rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties SET balance = balance + $1::text::numeric, updated_at = NOW() WHERE id = $2::text::uuid`,
          [partyDelta.toString(), islem.party_id],
        );
      }
    }

    // VIRMAN Logic: Create counter transaction if target_register_id is present
    if (islem.islem_tipi === 'VIRMAN' && islem.target_register_id) {
      console.log('[Kasa] Executing VIRMAN Counter Transaction logic for target:', islem.target_register_id);
      // Counter transaction: Money IN (+1) for Target Register
      await postgres.query(
        `INSERT INTO ${table} (
           firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type, 
           customer_id, currency_code, exchange_rate, f_amount, transfer_status, special_code,
           target_register_id
         ) 
           VALUES (
             $1::text,
             $2::text,
             $3::text::uuid, 
             $4::text, 
             $5::text::date, 
             $6::text::numeric, 
             $7::text::integer, 
             $8::text, 
             $9::text, 
             $10::text::uuid, 
             $11::text, 
             $12::text::numeric, 
             $13::text::numeric, 
             0, 
             $14::text,
             $15::text::uuid
           )`,
        [
          ERP_SETTINGS.firmNr,
          ERP_SETTINGS.periodNr || '01',
          islem.target_register_id, // Target Register
          `${ficheNo}-VRM`, // VIRMAN karşı işlemi için benzersiz fiche_no
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
           firm_nr, period_nr, register_id, fiche_no, date, amount, sign, definition, transaction_type
         ) 
         VALUES ($1::text, $2::text, $3::text::uuid, $4::text, $5::text::date, $6::text::numeric, $7::text::integer, $8::text, $9::text)`,
        [
          ERP_SETTINGS.firmNr,
          ERP_SETTINGS.periodNr || '01',
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
    try {
      await postgres.query('ROLLBACK');
    } catch {
      /* BEGIN yoksa veya zaten COMMIT */
    }
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
    cari_hesap_id: row.customer_id || undefined,
    doviz_kodu: row.currency_code || undefined,
    dovizli_tutar: row.f_amount !== undefined ? parseFloat(row.f_amount || 0) : undefined,
    ozel_kod: row.special_code || undefined,
    target_register_id: row.target_register_id || undefined,
    bank_id: row.bank_id || undefined,
    bank_account_id: row.bank_account_id || undefined,
    expense_card_id: row.expense_card_id || undefined,
    tax_rate: row.tax_rate !== undefined ? parseFloat(row.tax_rate || 0) : undefined,
    withholding_tax_rate: row.withholding_tax_rate !== undefined ? parseFloat(row.withholding_tax_rate || 0) : undefined,
    party_id: row.party_id || undefined,
    olusturma_tarihi: row.created_at,
  };
}

/**
 * Kasa işlemini sil — bakiye ters yönde geri alınır.
 * VIRMAN ise eşli karşı satır, banka entegrasyonu varsa bank_lines satırı,
 * CH_TAHSILAT/CH_ODEME ise cari/tedarikçi bakiyesi de tersine alınır.
 */
export async function deleteKasaIslemi(id: string): Promise<void> {
  if (!id) throw new Error('Silinecek işlem ID boş');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    return await deleteKasaIslemiViaPostgrest(id);
  }

  const table = 'cash_lines';
  const kasaTable = 'cash_registers';

  // 1) Satırı oku
  const { rows: prevRows } = await postgres.query(
    `SELECT * FROM ${table} WHERE id = $1::text::uuid LIMIT 1`,
    [id]
  );
  const row = prevRows?.[0];
  if (!row) throw new Error('İşlem bulunamadı');

  const amount = parseFloat(row.amount || 0);
  const sign = parseInt(row.sign || 0, 10);
  const registerId = row.register_id;
  const targetRegisterId = row.target_register_id;
  const ficheNo = row.fiche_no || '';
  const trType = row.transaction_type || '';
  const customerId = row.customer_id;
  const bankId = row.bank_id;
  const partyId = row.party_id;

  await postgres.query('BEGIN');
  try {
    // 2) Kasa bakiyesini geri al
    if (registerId) {
      await postgres.query(
        `UPDATE ${kasaTable} SET balance = balance - $1::text::numeric WHERE id = $2::text::uuid`,
        [(amount * sign).toString(), registerId]
      );
    }

    // 3) Cari hesap entegrasyonu — orijinal işlem cari bakiyeyi -tutar ile değiştirmişti, geri al
    if (customerId && (trType === 'CH_ODEME' || trType === 'CH_TAHSILAT')) {
      const delta = -cariCashStoredBalanceDelta(amount, trType);
      if (delta !== 0) {
        const deltaStr = delta.toString();
        const { rowCount: custCount } = await postgres.query(
          `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
          [deltaStr, customerId, normalizeFirmTableNr(ERP_SETTINGS.firmNr)],
        );
        if (!custCount) {
          await postgres.query(
            `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
            [deltaStr, customerId],
          );
        }
      }
    }

    // 4) Party bakiyesini tersine al (Personel / Şirket Ortağı)
    if (partyId) {
      const partyDelta = computePartyBalanceDelta(amount, trType);
      if (partyDelta !== 0) {
        await postgres.query(
          `UPDATE rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties SET balance = balance - $1::text::numeric, updated_at = NOW() WHERE id = $2::text::uuid`,
          [partyDelta.toString(), partyId],
        );
      }
    }

    // 5) VIRMAN karşı satırını ve hedef kasa bakiyesini temizle
    if (trType === 'VIRMAN' && targetRegisterId && sign === -1) {
      // Kaynak satırı: ficheNo / sign=-1. Karşı satır fiche_no = `${ficheNo}-VRM`
      const counterFiche = `${ficheNo}-VRM`;
      const { rows: ctr } = await postgres.query(
        `SELECT id, amount FROM ${table}
         WHERE fiche_no = $1::text AND register_id = $2::text::uuid AND transaction_type = 'VIRMAN'
         LIMIT 1`,
        [counterFiche, targetRegisterId]
      );
      const counter = ctr?.[0];
      if (counter) {
        await postgres.query(
          `UPDATE ${kasaTable} SET balance = balance - $1::text::numeric WHERE id = $2::text::uuid`,
          [(parseFloat(counter.amount || 0)).toString(), targetRegisterId]
        );
        await postgres.query(`DELETE FROM ${table} WHERE id = $1::text::uuid`, [counter.id]);
      }
    } else if (trType === 'VIRMAN' && sign === 1) {
      // Karşı tarafın kendisi siliniyorsa kaynak satırı bul ve onu da temizle.
      // Kaynak satırın fiche_no'su, karşı satırın fiche_no'sundan `-VRM` suffix'i atılarak elde edilir.
      if (ficheNo.endsWith('-VRM')) {
        const sourceFiche = ficheNo.slice(0, -4);
        const { rows: src } = await postgres.query(
          `SELECT id, register_id, amount, sign FROM ${table}
           WHERE fiche_no = $1::text AND transaction_type = 'VIRMAN'
           LIMIT 1`,
          [sourceFiche]
        );
        const s = src?.[0];
        if (s) {
          await postgres.query(
            `UPDATE ${kasaTable} SET balance = balance - $1::text::numeric WHERE id = $2::text::uuid`,
            [(parseFloat(s.amount || 0) * parseInt(s.sign || 0, 10)).toString(), s.register_id]
          );
          await postgres.query(`DELETE FROM ${table} WHERE id = $1::text::uuid`, [s.id]);
        }
      }
    }

    // 5) Banka entegrasyonu — orijinal createKasaIslemi'de bank_lines INSERT eklenmişti
    if ((trType === 'BANKA_YATIRILAN' || trType === 'BANKADAN_CEKILEN') && bankId) {
      const bankSign = trType === 'BANKA_YATIRILAN' ? 1 : -1;
      const bankLinesTable = 'bank_lines';
      const bankRegTable = 'bank_registers';
      // Banka satırını fiche_no ile eşleştir
      const { rows: bl } = await postgres.query(
        `SELECT id FROM ${bankLinesTable}
         WHERE fiche_no = $1::text AND register_id = $2::text::uuid
         ORDER BY created_at DESC NULLS LAST
         LIMIT 1`,
        [ficheNo, bankId]
      );
      if (bl?.[0]?.id) {
        await postgres.query(`DELETE FROM ${bankLinesTable} WHERE id = $1::text::uuid`, [bl[0].id]);
      }
      await postgres.query(
        `UPDATE ${bankRegTable} SET balance = balance - $1::text::numeric WHERE id = $2::text::uuid`,
        [(amount * bankSign).toString(), bankId]
      );
    }

    // 6) Party ledger iptal kaydı — Personel/Şirket Ortağı kasa işlemleri için.
    // createKasaIslemi + writePartyLedger çift-ayaklı yazıyor; silme ledger'ı yalnız bırakıyordu.
    // Burada aynı cash_line_id'ye ters işaretli yeni bir ledger satırı açıyoruz (audit trail korunur).
    if (partyId && PARTY_CANCEL_TYPES.has(trType)) {
      const cardType = await resolvePartyCardType(partyId);
      await writePartyLedgerCancel({
        partyId,
        cardType,
        trType,
        amount,
        sign,
        definition: row.definition,
        cashLineId: id,
      });
    }

    // 7) Ana satırı sil
    await postgres.query(`DELETE FROM ${table} WHERE id = $1::text::uuid`, [id]);

    await postgres.query('COMMIT');
  } catch (err: any) {
    try { await postgres.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[Kasa] deleteKasaIslemi failed:', err);
    throw err;
  }
}

async function deleteKasaIslemiViaPostgrest(id: string): Promise<void> {
  const { postgrest } = await import('./postgrestClient');
  const fn = padKasaFirmNr();
  const pn = padKasaPeriodNr();
  const linesPath = `/rex_${fn}_${pn}_cash_lines`;
  const kasaPath = `/rex_${fn}_cash_registers`;
  const bankLinesPath = `/rex_${fn}_${pn}_bank_lines`;
  const bankRegPath = `/rex_${fn}_bank_registers`;

  const rs = await postgrest.get<any[]>(
    linesPath,
    { select: '*', id: `eq.${id}`, limit: 1 },
    { schema: 'public' }
  );
  const row = Array.isArray(rs) ? rs[0] : null;
  if (!row) throw new Error('İşlem bulunamadı');

  const amount = Number(row.amount || 0);
  const sign = Number(row.sign || 0);
  const registerId = row.register_id;
  const targetRegisterId = row.target_register_id;
  const ficheNo = row.fiche_no || '';
  const trType = row.transaction_type || '';
  const customerId = row.customer_id;
  const bankId = row.bank_id;

  const bumpKasa = async (rid: string | undefined, delta: number) => {
    if (!rid || !Number.isFinite(delta) || delta === 0) return;
    const cur = await postgrest.get<any[]>(
      kasaPath,
      { select: 'balance', id: `eq.${rid}`, limit: 1 },
      { schema: 'public' }
    );
    const r = Array.isArray(cur) ? cur[0] : null;
    if (!r) return;
    await postgrest.patch(
      `${kasaPath}?id=eq.${encodeURIComponent(String(rid))}`,
      { balance: Number(r.balance ?? 0) + delta },
      { schema: 'public', prefer: 'return=minimal' }
    );
  };

  // Kasa bakiyesini ters al
  await bumpKasa(registerId, -(amount * sign));

  // Cari hesap geri al
  if (customerId && (trType === 'CH_ODEME' || trType === 'CH_TAHSILAT')) {
    const delta = -cariCashStoredBalanceDelta(amount, trType);
    if (delta !== 0) {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const custPath = `/rex_${firmNr}_customers`;
      const supPath = `/rex_${firmNr}_suppliers`;
      const patchPartner = async (path: string, withFirm: boolean) => {
        try {
          const { stripPostgrestOpPrefix } = await import('./postgrestClient');
          const partnerId = stripPostgrestOpPrefix(String(customerId));
          const q: Record<string, string> = { select: 'balance', id: `eq.${partnerId}`, limit: '1' };
          if (withFirm) q.firm_nr = `eq.${firmNr}`;
          const rsP = await postgrest.get<any[]>(path, q, { schema: 'public' });
          const rp = Array.isArray(rsP) ? rsP[0] : null;
          if (!rp) return false;
          const url = withFirm
            ? `${path}?id=eq.${encodeURIComponent(partnerId)}&firm_nr=eq.${encodeURIComponent(firmNr)}`
            : `${path}?id=eq.${encodeURIComponent(partnerId)}`;
          await postgrest.patch(
            url,
            { balance: Number(rp.balance ?? 0) + delta },
            { schema: 'public', prefer: 'return=minimal' },
          );
          return true;
        } catch {
          return false;
        }
      };
      const patchedCustomer = await patchPartner(custPath, true);
      if (!patchedCustomer) {
        await patchPartner(supPath, false);
      }
    }
  }

  // VIRMAN karşı taraf temizle
  if (trType === 'VIRMAN' && targetRegisterId && sign === -1) {
    const counterFiche = `${ficheNo}-VRM`;
    const ctr = await postgrest.get<any[]>(
      linesPath,
      {
        select: 'id,amount',
        fiche_no: `eq.${counterFiche}`,
        register_id: `eq.${targetRegisterId}`,
        transaction_type: 'eq.VIRMAN',
        limit: 1,
      },
      { schema: 'public' }
    );
    const counter = Array.isArray(ctr) ? ctr[0] : null;
    if (counter?.id) {
      await bumpKasa(targetRegisterId, -Number(counter.amount || 0));
      await postgrest.delete(`${linesPath}?id=eq.${encodeURIComponent(String(counter.id))}`, { schema: 'public', prefer: 'return=minimal' });
    }
  } else if (trType === 'VIRMAN' && sign === 1 && String(ficheNo).endsWith('-VRM')) {
    const sourceFiche = String(ficheNo).slice(0, -4);
    const src = await postgrest.get<any[]>(
      linesPath,
      {
        select: 'id,register_id,amount,sign',
        fiche_no: `eq.${sourceFiche}`,
        transaction_type: 'eq.VIRMAN',
        limit: 1,
      },
      { schema: 'public' }
    );
    const s = Array.isArray(src) ? src[0] : null;
    if (s?.id) {
      await bumpKasa(s.register_id, -(Number(s.amount || 0) * Number(s.sign || 0)));
      await postgrest.delete(`${linesPath}?id=eq.${encodeURIComponent(String(s.id))}`, { schema: 'public', prefer: 'return=minimal' });
    }
  }

  // Banka entegrasyonu
  if ((trType === 'BANKA_YATIRILAN' || trType === 'BANKADAN_CEKILEN') && bankId) {
    const bankSign = trType === 'BANKA_YATIRILAN' ? 1 : -1;
    const bl = await postgrest.get<any[]>(
      bankLinesPath,
      { select: 'id', fiche_no: `eq.${ficheNo}`, register_id: `eq.${bankId}`, limit: 1 },
      { schema: 'public' }
    );
    const bRow = Array.isArray(bl) ? bl[0] : null;
    if (bRow?.id) {
      await postgrest.delete(`${bankLinesPath}?id=eq.${encodeURIComponent(String(bRow.id))}`, { schema: 'public', prefer: 'return=minimal' });
    }
    const curB = await postgrest.get<any[]>(
      bankRegPath,
      { select: 'balance', id: `eq.${bankId}`, limit: 1 },
      { schema: 'public' }
    );
    const br = Array.isArray(curB) ? curB[0] : null;
    if (br) {
      await postgrest.patch(
        `${bankRegPath}?id=eq.${encodeURIComponent(String(bankId))}`,
        { balance: Number(br.balance ?? 0) - amount * bankSign },
        { schema: 'public', prefer: 'return=minimal' }
      );
    }
  }

  // Party ledger iptal kaydı — Personel/Şirket Ortağı kasa işlemleri için.
  // createKasaIslemi + writePartyLedger çift-ayaklı yazıyor; silme ledger'ı yalnız bırakıyordu.
  // Burada aynı cash_line_id'ye ters işaretli yeni bir ledger satırı açıyoruz.
  const partyId = row.party_id;
  if (partyId && PARTY_CANCEL_TYPES.has(String(trType))) {
    try {
      const cardType = await resolvePartyCardType(partyId);
      const ledgerPath = `/rex_${fn}_${pn}_party_ledger_movements`;
      // Idempotent kontrol
      const existing = await postgrest.get<any[]>(
        ledgerPath,
        {
          select: 'id',
          cash_line_id: `eq.${id}`,
          source_module: 'eq.cash_delete',
          limit: 1,
        },
        { schema: 'public' },
      );
      if (!Array.isArray(existing) || existing.length === 0) {
        await postgrest.post(
          ledgerPath,
          {
            firm_nr: fn,
            period_nr: pn,
            party_id: partyId,
            card_type: cardType,
            trcode: 0,
            transaction_type: `CANCELLED_${String(trType)}`,
            date: new Date().toISOString(),
            amount: Math.abs(Number(row.amount || 0)),
            sign: -Number(row.sign || 0),
            definition: `İptal: ${row.definition || ''}`.trim(),
            source_module: 'cash_delete',
            source_id: id,
            cash_line_id: id,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
    } catch (err) {
      // Ledger iptal kaydı başarısız olursa cash_lines silinmesini engellememeli — audit log'a düş.
      console.warn('[Kasa] deleteKasaIslemiViaPostgrest: ledger cancel yazılamadı', err);
    }
  }

  // Ana satırı sil
  await postgrest.delete(`${linesPath}?id=eq.${encodeURIComponent(String(id))}`, { schema: 'public', prefer: 'return=minimal' });
}

/**
 * Kasa işlemini güncelle — pragmatik: önce eski işlemi sil (bakiyeyi geri al),
 * sonra yeni değerlerle createKasaIslemi ile tekrar oluştur.
 */
export async function updateKasaIslemi(id: string, islem: KasaIslemi): Promise<KasaIslemi> {
  if (!id) throw new Error('Güncellenecek işlem ID boş');
  await deleteKasaIslemi(id);
  const created = await createKasaIslemi({ ...islem, id: undefined });
  return created;
}

