/**
 * ExRetailOS - Kasa Service (Direct PostgreSQL Integration)
 * Refactored to use logic.cash_registers and logic.cash_lines
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { parseDecimalStringForInput } from '../../utils/numberFormatter';
import {
  cariCashStoredBalanceDelta,
  normalizeFirmTableNr,
} from './accountBalance';
import { ensureCariAccountInCurrentFirm } from './cariAccountResolve';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';
import { assertPeriodOpen } from '../periodControl';

function padKasaFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}
function padKasaPeriodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

function storedCariTypeFromKind(
  kind: 'customer' | 'supplier' | 'employee' | 'partner' | null | undefined,
): 'customer' | 'supplier' {
  return kind === 'supplier' ? 'supplier' : 'customer';
}

/**
 * Kasa tutarı: TR binlik "450.000" → 450000. Number/parseFloat("450.000")=450 yapmaz.
 */
export function parseKasaAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  const n = parseDecimalStringForInput(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

function expenseTableSqlKasa(): string {
  return `rex_${padKasaFirmNr()}_expenses`;
}

function expenseTablePathKasa(): string {
  return `/${expenseTableSqlKasa()}`;
}

type ExpenseMirrorRow = {
  id: string;
  cash_line_id?: string | null;
  amount?: number;
  description?: string;
  expense_date?: string;
  document_number?: string | null;
};

/** Aynı gün + aynı açıklama eşlemesi (EYLUL KIRASI / Eylül Kirası). */
export function normalizeGiderAciklama(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function isGiderPusulasiType(type: unknown): boolean {
  return String(type || '').trim().toUpperCase() === 'GIDER_PUSULASI';
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
  // CH_ODEME_PARTNER: CH_ODEME satırına party_id eklendiğinde createKasaIslemi içinde
  // party_ledger_movements'a CH_ODEME_PARTNER kaydı açılır. deleteKasaIslemi'de ters yazılır.
  'CH_ODEME_PARTNER',
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
 * CH_ODEME_PARTNER       | -1 | -tutar (tedarikçi ödemesi firma ortak adına yapıldı;
 *                                     ortağın firmadan alacağı azalır).
 *
 * CH_ODEME_PARTNER cash_lines.transaction_type='CH_ODEME' olan bir satıra party_id eklendiğinde
 * uygulanır. Kasa sign = -1 (mevcut CH_ODEME davranışı) korunur; ek olarak party_ledger_movements'a
 * CH_ODEME_PARTNER kaydı açılır. Silme anında CANCELLED_CH_ODEME_PARTNER ile ters yazılır.
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
    case 'CH_ODEME_PARTNER':
      return -amt;
    case 'AVANS_MAHSUP':
      return 0;
    default:
      return 0;
  }
}

/**
 * cari_hesap_id verilen bir UUID'nin hangi tabloya ait olduğunu tespit eder.
 * CH_ODEME / CH_TAHSILAT işlemlerinde hangi kolona (`customer_id` mı `party_id` mi)
 * yazılacağını ve hangi tablonun `balance` alanının güncelleneceğini belirler.
 *
 *   - 'customer' → cash_lines.customer_id'ye yaz, customers.balance güncelle
 *   - 'supplier' → cash_lines.party_id'ye yaz, suppliers.balance güncelle
 *   - 'employee' | 'partner' → cash_lines.party_id'ye yaz, parties.balance güncelle
 *   - null      → UUID hiçbir yerde yok; insert'i yine de yap ama balance güncelleme
 *
 * ESKİ MİRAS DÜZELTMESİ: Daha önce tedarikçi ödemeleri `customer_id` kolonuna
 * yanlışlıkla yazılıyordu (ARZENGROUP vakası). Bu tespit sayesinde INSERT'ten
 * önce doğru kolon seçilir ve `customer_id` ile `party_id` artık karışmaz.
 */
type CariAccountKind = 'customer' | 'supplier' | 'employee' | 'partner' | null;

export async function resolveCariAccountKind(
  accountId: string | null | undefined,
  callerHint?: 'supplier' | 'customer' | null,
): Promise<CariAccountKind> {
  if (!accountId) return null;
  const id = String(accountId).trim();
  if (!id) return null;
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);

  // callerHint === 'supplier' ise müşteri yerine önce tedarikçi tablosuna bak.
  // Sebep: aynı UUID hem customers hem suppliers tablosunda olabilir (legacy merge
  // yapılmamış cariler — ör. kasap BADIA). CH_ODEME bağlamında caller zaten
  // "bu tedarikçi ödemesidir" biliyor; müşteri tarafı öncelik kazanmamalı.
  const probeOrder: CariAccountKind[] =
    callerHint === 'supplier'
      ? ['supplier', 'customer', 'partner', 'employee']
      : callerHint === 'customer'
      ? ['customer', 'supplier', 'partner', 'employee']
      : ['customer', 'supplier', 'partner', 'employee'];

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    try {
      const { postgrest } = await import('./postgrestClient');
      // Sırayla ara: callerHint varsa ona göre, yoksa müşteri önce
      for (const kind of probeOrder) {
        if (kind === 'customer') {
          const c = await postgrest.get<any[]>(
            `/rex_${firmNr}_customers`,
            { select: 'id', id: `eq.${id}`, limit: '1' },
            { schema: 'public' },
          );
          if (Array.isArray(c) && c.length > 0) return 'customer';
        } else if (kind === 'supplier') {
          const s = await postgrest.get<any[]>(
            `/rex_${firmNr}_suppliers`,
            { select: 'id', id: `eq.${id}`, limit: '1' },
            { schema: 'public' },
          );
          if (Array.isArray(s) && s.length > 0) return 'supplier';
        } else if (kind === 'employee' || kind === 'partner') {
          const p = await postgrest.get<any[]>(
            `/rex_${firmNr}_parties`,
            { select: 'id,card_type', id: `eq.${id}`, limit: '1' },
            { schema: 'public' },
          );
          if (Array.isArray(p) && p.length > 0) {
            const ct = String(p[0]?.card_type || '').toLowerCase();
            if (kind === 'partner' && ct === 'partner') return 'partner';
            if (kind === 'employee' && ct !== 'partner') return 'employee';
            return ct === 'partner' ? 'partner' : 'employee';
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const { rows } = await postgres.query(
      `SELECT
         EXISTS(SELECT 1 FROM rex_${firmNr}_customers WHERE id = $1::uuid) AS is_customer,
         EXISTS(SELECT 1 FROM rex_${firmNr}_suppliers WHERE id = $1::uuid) AS is_supplier,
         (SELECT card_type FROM rex_${firmNr}_parties WHERE id = $1::uuid LIMIT 1) AS party_card_type`,
      [id],
    );
    const r = rows?.[0] || {};
    if (callerHint === 'supplier') {
      if (r.is_supplier) return 'supplier';
      if (r.is_customer) return 'customer';
    } else {
      if (r.is_customer) return 'customer';
      if (r.is_supplier) return 'supplier';
    }
    if (r.party_card_type) {
      return String(r.party_card_type).toLowerCase() === 'partner' ? 'partner' : 'employee';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * cash_lines INSERT body'sinde `customer_id` ve `party_id` kolonlarını cari türüne göre doldurur.
 * Tedarikçi ödemelerinde party_id, müşteri tahsilatlarında customer_id set edilir.
 */
export function splitCariAccountForCashLine(
  kind: CariAccountKind,
  accountId: string | null | undefined
): { customer_id: string | null; party_id: string | null } {
  if (!accountId) return { customer_id: null, party_id: null };
  const id = String(accountId).trim();
  if (!id) return { customer_id: null, party_id: null };
  switch (kind) {
    case 'customer':
      return { customer_id: id, party_id: null };
    case 'supplier':
    case 'employee':
    case 'partner':
      return { customer_id: null, party_id: id };
    default:
      // Tür tespit edilemedi — geriye dönük uyumluluk için customer_id'ye yaz (eski davranış).
      return { customer_id: id, party_id: null };
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
  /**
   * Gider Yönetimi expenses satırını zaten yazdıysa kasa ikinci gider açmasın.
   * Yalnızca expenseAPI.create nakit yolunda true.
   */
  skipExpenseMirror?: boolean;
  tax_rate?: number;
  withholding_tax_rate?: number;
  /** Polimorfik cari ref — Personel/Şirket Ortağı işlemleri için (customer_id ayrı tutulur) */
  party_id?: string;
  party_code?: string;
  party_name?: string;
}

/** Kasa → mevcut faturaya tahsilat/ödeme (fatura motoru ayrı; yalnızca kasa satırı). */
export const KASA_INVOICE_ISLEM_TIPLERI = ['SATIS_FATURASI', 'ALIS_FATURASI', 'HIZMET_FATURASI'] as const;
export type KasaInvoiceIslemTipi = (typeof KASA_INVOICE_ISLEM_TIPLERI)[number];

export type KasaIslemTipi =
  | 'CH_TAHSILAT'
  | 'CH_ODEME'
  | 'KASA_GIRIS'
  | 'KASA_CIKIS'
  | 'BANKA_YATIRILAN'
  | 'BANKADAN_CEKILEN'
  | 'VIRMAN'
  | 'GIDER_PUSULASI'
  | 'VERILEN_SERBEST_MESLEK'
  | 'ALINAN_SERBEST_MESLEK'
  | 'MUSTAHSIL_MAKBUZU'
  | 'ACILIS_BORC'
  | 'ACILIS_ALACAK'
  | 'KUR_FARKI_BORC'
  | 'KUR_FARKI_ALACAK'
  | KasaInvoiceIslemTipi;

export function isKasaInvoiceIslemTipi(tip: string | null | undefined): tip is KasaInvoiceIslemTipi {
  const t = String(tip || '').trim().toUpperCase();
  return (KASA_INVOICE_ISLEM_TIPLERI as readonly string[]).includes(t);
}

export function invoiceCategoryForKasaIslem(tip: KasaInvoiceIslemTipi): 'Satis' | 'Alis' | 'Hizmet' {
  if (tip === 'ALIS_FATURASI') return 'Alis';
  if (tip === 'HIZMET_FATURASI') return 'Hizmet';
  return 'Satis';
}

/** Satış/hizmet tahsilatı CH_TAHSILAT (+); alış ödemesi CH_ODEME (−) — ekstre ile aynı tipler. */
export function postedCashTypeForInvoiceIslem(tip: KasaInvoiceIslemTipi): 'CH_TAHSILAT' | 'CH_ODEME' {
  return tip === 'ALIS_FATURASI' ? 'CH_ODEME' : 'CH_TAHSILAT';
}

export function invoiceCashDescriptionPrefix(tip: KasaInvoiceIslemTipi): string {
  if (tip === 'ALIS_FATURASI') return 'Alış faturası';
  if (tip === 'HIZMET_FATURASI') return 'Hizmet faturası';
  return 'Satış faturası';
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

    const mapped = (rows || []).map(mapDbKasaToKasa);
    // "İlk eklenen kasa varsayılan" kuralı: DB ORDER BY code ASC ile gelir, ancak
    // code manuel verilebildiği için sıra DB'ye eklenme sırasıyla eşleşmez.
    // Burada created_at (yoksa guncelleme_tarihi) artan şekilde sıralayıp
    // deterministik bir "ilk eklenen kasa" listesini tüm tüketicilere (modal,
    // POS, fatura formu) aynı biçimde sunuyoruz.
    return [...mapped].sort((a, b) => {
      const ta = Date.parse(a.olusturma_tarihi || a.guncelleme_tarihi || '') || 0;
      const tb = Date.parse(b.olusturma_tarihi || b.guncelleme_tarihi || '') || 0;
      if (ta !== tb) return ta - tb;
      // Son çare: id'ye göre artan (UUID sıralaması tahmin edilebilirliği bozar ama tutarlı)
      return String(a.id).localeCompare(String(b.id));
    });
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
        COALESCE(c.name, s.name, p.name) as current_account_name,
        COALESCE(c.code, s.code, p.code) as current_account_code,
        COALESCE(c.id, s.id, p.id) as current_account_resolved_id,
        CASE
          WHEN c.id IS NOT NULL THEN 'customer'
          WHEN s.id IS NOT NULL THEN 'supplier'
          WHEN p.id IS NOT NULL THEN COALESCE(p.card_type, 'employee')
          ELSE NULL
        END as current_account_kind,
        target_kasa.name as target_register_name,
        target_kasa.code as target_register_code
      FROM ${table} cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      LEFT JOIN suppliers s ON cl.party_id = s.id AND cl.transaction_type = 'CH_ODEME'
      LEFT JOIN parties p ON cl.party_id = p.id AND cl.transaction_type <> 'CH_ODEME'
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

/** Fatura fiş no ile kasa satırı var mı (peşin yazım veya önceki tahsilat/ödeme). */
export async function cashLineExistsForFicheNo(ficheNo: string): Promise<boolean> {
  const trimmed = String(ficheNo || '').trim();
  if (!trimmed) return false;
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const path = `/rex_${padKasaFirmNr()}_${padKasaPeriodNr()}_cash_lines`;
      const exact = await postgrest.get<any[]>(
        path,
        { select: 'id', fiche_no: `eq.${trimmed}`, limit: 1 },
        { schema: 'public' },
      );
      if (Array.isArray(exact) && exact[0]?.id) return true;
      const prefixed = await postgrest.get<any[]>(
        path,
        { select: 'id', fiche_no: `like.${trimmed}-*`, limit: 1 },
        { schema: 'public' },
      );
      return Array.isArray(prefixed) && !!prefixed[0]?.id;
    }
    const { rows } = await postgres.query<{ id: string }>(
      `SELECT id FROM cash_lines
        WHERE fiche_no::text = $1::text OR fiche_no::text LIKE $2::text
        LIMIT 1`,
      [trimmed, `${trimmed}-%`],
    );
    return !!rows?.[0]?.id;
  } catch (err) {
    console.warn('[Kasa] cashLineExistsForFicheNo:', err);
    return false;
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

  // cari_hesap_id türünü INSERT'ten ÖNCE tespit et (tedarikçi → party_id, müşteri → customer_id).
  // CH_ODEME bağlamında caller "bu tedarikçi ödemesidir" bildiği için supplier hint'i veriyoruz;
  // aynı UUID hem customers hem suppliers tablosunda olsa bile doğru tablo seçilir.
  const callerHint: 'supplier' | 'customer' | null =
    islem.islem_tipi === 'CH_ODEME' ? 'supplier'
    : islem.islem_tipi === 'CH_TAHSILAT' ? 'customer'
    : null;
  const cariKind = await resolveCariAccountKind(islem.cari_hesap_id, callerHint);
  // Caller zaten party_id gönderdiyse (örn. CH_ODEME_PARTNER), onu koru; aksi halde türüne göre ayır.
  const cariSplit = islem.party_id
    ? { customer_id: null, party_id: islem.party_id }
    : splitCariAccountForCashLine(cariKind, islem.cari_hesap_id);

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
    customer_id: cariSplit.customer_id,
    party_id: cariSplit.party_id,
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
    let partyDelta = computePartyBalanceDelta(islem.tutar, islem.islem_tipi);
    let ledgerTrType: string | null = null;
    if (islem.islem_tipi === 'CH_ODEME') {
      ledgerTrType = 'CH_ODEME_PARTNER';
      partyDelta = -Math.abs(Number(islem.tutar || 0));
    }
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
    // CH_ODEME_PARTNER ledger kaydı (audit + hesap ekstresinde görünür)
    if (ledgerTrType) {
      try {
        await ensurePartyPeriodTables();
        const cardType = await resolvePartyCardType(islem.party_id);
        const ledgerPath = `/rex_${fn}_${pn}_party_ledger_movements`;
        const mainRowId = (Array.isArray(mainRow) ? mainRow : (mainRow as any))?.id || null;
        await postgrest.post(
          ledgerPath,
          {
            firm_nr: String(ERP_SETTINGS.firmNr || ''),
            period_nr: String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10),
            party_id: islem.party_id,
            card_type: cardType,
            trcode: 0,
            transaction_type: ledgerTrType,
            date: new Date().toISOString(),
            amount: Math.abs(Number(islem.tutar || 0)),
            sign: -1,
            definition: `Ortak adına tedarikçi ödemesi: ${islem.islem_aciklamasi || ''}`.trim(),
            source_module: 'cash_create',
            source_id: mainRowId,
            cash_line_id: mainRowId,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch (e) {
        console.warn('[Kasa] CH_ODEME_PARTNER ledger insert (PostgREST) failed:', (e as any)?.message || e);
      }
    }
  }

  if (islem.cari_hesap_id && (islem.islem_tipi === 'CH_ODEME' || islem.islem_tipi === 'CH_TAHSILAT')) {
    const delta = cariCashStoredBalanceDelta(
      islem.tutar,
      islem.islem_tipi,
      storedCariTypeFromKind(cariKind),
    );
    if (delta !== 0) {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const partnerId = String(islem.cari_hesap_id).trim();
      // Tespit sonucuna göre DOĞRU tabloya yaz. "Önce customer dene" stratejisi tedarikçi
      // ödemelerini müşteri tablosuna düşürüyordu. Şimdi INSERT'te de doğru kolona yazıldı.
      const tryPatch = async (path: string, withFirm: boolean): Promise<boolean> => {
        try {
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
      if (cariKind === 'customer') {
        await tryPatch(`/rex_${firmNr}_customers`, true);
      } else if (cariKind === 'supplier') {
        await tryPatch(`/rex_${firmNr}_suppliers`, false);
      } else if (cariKind === 'employee' || cariKind === 'partner') {
        // Parties için balance güncellemesi yukarıdaki party_id bloğunda yapıldı.
      } else {
        // Tür tespit edilemedi — fallback: önce customer, yoksa supplier (geriye dönük uyumluluk).
        const patched = await tryPatch(`/rex_${firmNr}_customers`, true);
        if (!patched) await tryPatch(`/rex_${firmNr}_suppliers`, false);
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
    // Çift ayak atomikliği: karşı satır INSERT başarısızsa ana INSERT'i geri al.
    try {
      await postgrest.post(linesPath, counterBody, { schema: 'public', prefer: 'return=minimal' });
    } catch (e) {
      try {
        await postgrest.delete(
          `${linesPath}?id=eq.${encodeURIComponent(String(mainRow?.id || ''))}`,
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch { /* best-effort rollback */ }
      throw new Error('Virman karşı satırı yazılamadı; ana satır geri alındı: ' + ((e as any)?.message || e));
    }
    // Hedef kasa bakiyesini güncelle; başarısız olursa her iki satırı temizle ve kaynak kasayı geri al.
    try {
      await bumpKasaBalance(islem.target_register_id, Number(islem.tutar || 0));
    } catch (e) {
      try {
        await bumpKasaBalance(islem.kasa_id, -Number(islem.tutar || 0) * sign);
      } catch { /* ignore */ }
      try {
        await postgrest.delete(
          `${linesPath}?id=eq.${encodeURIComponent(String(mainRow?.id || ''))}`,
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch { /* ignore */ }
      try {
        await postgrest.delete(
          `${linesPath}?fiche_no=eq.${encodeURIComponent(`${ficheNo}-VRM`)}`,
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch { /* ignore */ }
      throw new Error('Virman hedef kasa bakiyesi güncellenemedi; işlem geri alındı: ' + ((e as any)?.message || e));
    }
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
    const skipExpenseMirror = Boolean(incoming.skipExpenseMirror);
    let islem = {
      ...incoming,
      islem_tipi: String(incoming.islem_tipi || '').trim().toUpperCase(),
      tutar: Math.abs(parseKasaAmount(incoming.tutar)),
    };
    delete (islem as { skipExpenseMirror?: boolean }).skipExpenseMirror;
    // Dönem kontrolü — kapalı dönemde yazma engellenir (PeriodControl entegrasyonu).
    await assertPeriodOpen(
      ERP_SETTINGS.firmNr,
      ERP_SETTINGS.periodNr,
      islem.islem_tarihi || new Date().toISOString(),
    );
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

    // cari_hesap_id türünü INSERT'ten ÖNCE tespit et (tedarikçi → party_id, müşteri → customer_id).
    // CH_ODEME bağlamında caller supplier hint'i verir; UUID her iki tabloda olsa bile doğru yazılır.
    const callerHint: 'supplier' | 'customer' | null =
      islem.islem_tipi === 'CH_ODEME' ? 'supplier'
      : islem.islem_tipi === 'CH_TAHSILAT' ? 'customer'
      : null;
    const cariKind = await resolveCariAccountKind(islem.cari_hesap_id, callerHint);
    const cariSplit = islem.party_id
      ? { customer_id: null as string | null, party_id: islem.party_id }
      : (() => {
          const s = splitCariAccountForCashLine(cariKind, islem.cari_hesap_id);
          return { customer_id: s.customer_id, party_id: s.party_id };
        })();
    if (cariSplit.customer_id) islem = { ...islem, cari_hesap_id: cariSplit.customer_id };
    if (cariSplit.party_id && !islem.party_id) islem = { ...islem, party_id: cariSplit.party_id };

    if (isGiderPusulasiType(islem.islem_tipi) && !skipExpenseMirror) {
      const redirected = await redirectGiderPusulasiCreate(islem);
      if (redirected) return redirected;
    }

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      console.log('[Kasa] PostgREST işlem. Type:', islem.islem_tipi, 'Target:', islem.target_register_id);
      const created = await createKasaIslemiViaPostgrest(islem, sign, ficheNo);
      if (isGiderPusulasiType(islem.islem_tipi) && !skipExpenseMirror && created?.id) {
        await upsertExpenseLinkedToCashLine({
          cashLineId: String(created.id),
          amount: islem.tutar,
          definition: islem.islem_aciklamasi || 'Gider',
          date: islem.islem_tarihi || new Date().toISOString(),
          registerId: islem.kasa_id,
          ficheNo: created.islem_no || ficheNo,
          category: islem.ozel_kod || '',
        });
      }
      return created;
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
        cariSplit.customer_id || islem.cari_hesap_id || null,
        cariSplit.party_id || islem.party_id || null,
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

    /**
     * Virman (KASALAR ARASI VİRMAN): tek satırlık kayıt iki kasayı etkiler
     * ama şu ana kadar yalnızca kaynak kasaya −tutar yazılıyordu. Muhasebe
     * gereği hedef kasaya da +tutar yazılmalı, atomik (BEGIN/COMMIT) bir
     * çift-satır INSERT olmalı.
     *
     * Bu blok:
     *  1) Target kasada ters sign'li (sign=+1) bir cash_lines INSERT eder
     *     (kayıt: target_register_id = source kasası, register_id = target).
     *  2) Target kasa bakiyesini +tutar artırır.
     *  3) Fiche_no'ya `-VRM` soneki eklenir (cash_lines UNIQUE(fiche_no)
     *     kısıtı nedeniyle). Ana satırda fiche_no korunur; karşı satır
     *     ana fiche + `-VRM` soneki ile ayırt edilir. (PostgREST tarafıyla
     *     aynı convention — bkz. createKasaIslemiViaPostgrest.)
     *
     * Idempotent: hedef INSERT aynı fiche_no+(-VRM) ile UNIQUE çakışırsa
     * sessizce devam eder.
     */
    if (islem.islem_tipi === 'VIRMAN' && islem.target_register_id) {
      // Aynı kasa virmanı (kendi kendine transfer) mantıksız — engelle.
      if (islem.target_register_id === islem.kasa_id) {
        throw new Error('Kaynak ve hedef kasa aynı olamaz (virman)');
      }
      // Hedef kasada +tutar (sign=+1) karşılık INSERT'i.
      const targetDesc = (islem.islem_aciklamasi || '')
        ? `${islem.islem_aciklamasi} (Virman)`
        : `Virman — ${islem.islem_no || ficheNo}`;
      const targetFicheNo = `${ficheNo}-VRM`;
      const { rows: targetRows } = await postgres.query(
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
             1, -- sign=+1 (KASA_GIRIS yönü)
             $7::text,
             'VIRMAN_TARGET',
             NULL,
             NULL,
             $8::text,
             $9::text::numeric,
             $10::text::numeric,
             0,
             $11::text,
             $12::text::uuid,
             NULL,
             NULL,
             NULL,
             0,
             0
           ) RETURNING id`,
        [
          ERP_SETTINGS.firmNr,
          ERP_SETTINGS.periodNr || '01',
          islem.target_register_id,
          targetFicheNo,
          islem.islem_tarihi || new Date().toISOString(),
          islem.tutar || 0,
          targetDesc,
          islem.doviz_kodu || 'YEREL',
          1,
          islem.dovizli_tutar || 0,
          islem.ozel_kod || '',
          islem.kasa_id,
        ]
      );
      // Hedef kasa bakiyesi: +tutar.
      await postgres.query(
        `UPDATE ${kasaTable} SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
        [(islem.tutar).toString(), islem.target_register_id]
      );
      // eslint-disable-next-line no-console
      console.log('[Kasa] Virman hedef INSERT:', targetRows?.[0]?.id, 'fiche_no=', targetFicheNo);
    }

    // Update current account balance for CH_ODEME and CH_TAHSILAT
    // Önemli: Kasa sign (+1/-1) cariye uygulanmaz. Tahsilat/ödeme açık bakiyeyi düşürür (-ABS).
    // CH_TAHSILAT: müşteriden tahsilat → alacak → borç ↓
    // CH_ODEME: tedarikçiye/müşteriye ödeme → açık ↓
    // TÜR TESPİTİ: INSERT'te olduğu gibi burada da cariKind'e göre doğru tabloya yaz.
    // Eski "önce customer dene, yoksa supplier" yaklaşımı supplier ödemelerini müşteri tablosuna
    // düşürüyordu. cariKind=null ise (UUID hiçbir yerde yok) yine de fallback denenir.
    if (islem.cari_hesap_id && (islem.islem_tipi === 'CH_ODEME' || islem.islem_tipi === 'CH_TAHSILAT')) {
      const delta = cariCashStoredBalanceDelta(
        islem.tutar,
        islem.islem_tipi,
        storedCariTypeFromKind(cariKind),
      );
      if (delta !== 0) {
        const deltaStr = delta.toString();
        const partnerId = islem.cari_hesap_id;
        if (cariKind === 'customer') {
          await postgres.query(
            `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
            [deltaStr, partnerId, normalizeFirmTableNr(ERP_SETTINGS.firmNr)],
          );
        } else if (cariKind === 'supplier') {
          await postgres.query(
            `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
            [deltaStr, partnerId],
          );
        } else if (cariKind === 'employee' || cariKind === 'partner') {
          // Parties bakiyesi yukarıdaki party_id bloğunda güncelleniyor.
        } else {
          // Tür tespit edilemedi — geriye dönük uyumluluk: önce customer, yoksa supplier.
          const { rowCount: custCount } = await postgres.query(
            `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
            [deltaStr, partnerId, normalizeFirmTableNr(ERP_SETTINGS.firmNr)],
          );
          if (!custCount) {
            await postgres.query(
              `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
              [deltaStr, partnerId],
            );
          }
        }
      }
    }

    // Parties (Personel / Şirket Ortağı) — party_id ile polymorphic bakiye güncelleme.
    // Personel: MAAS_ODEME/AVANS_ODEME (−tutar, ödenmemiş maaş alacağı ↓).
    // Ortağı nakit: ORTAK_SERMAYE_TAHSILAT (kasa +, bakiye +), ORTAK_SERMAYE_ODEME (kasa −, bakiye −).
    // CH_ODEME + party_id → tedarikçi ödemesi firma ortak adına yapıldı; ortağın firmadan alacağı azalır.
    // Kâr/zarar dağıtımı kasa yazmaz; ledger + parties.balance partnerDistribution içinde güncellenir.
    if (islem.party_id) {
      let partyDelta = computePartyBalanceDelta(islem.tutar, islem.islem_tipi);
      let ledgerTrType: string | null = null;
      // CH_ODEME_PARTNER: cash_lines.transaction_type CH_ODEME kalır; ek ledger CH_ODEME_PARTNER yazılır
      if (islem.islem_tipi === 'CH_ODEME') {
        ledgerTrType = 'CH_ODEME_PARTNER';
        partyDelta = -Math.abs(islem.tutar || 0);
      }
      if (partyDelta !== 0) {
        await postgres.query(
          `UPDATE rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties SET balance = balance + $1::text::numeric, updated_at = NOW() WHERE id = $2::text::uuid`,
          [partyDelta.toString(), islem.party_id],
        );
      }
      if (ledgerTrType) {
        await ensurePartyPeriodTables();
        const cardType = await resolvePartyCardType(islem.party_id);
        await postgres.query(
          `INSERT INTO ${partyLedgerTable()} (
             firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
             date, amount, sign, definition, source_module, source_id, cash_line_id
           ) VALUES (
             $1::text, $2::text, $3::text::uuid, $4::text, 0, $5::text,
             NOW(), $6::text::numeric, $7::integer, $8::text, 'cash_create', $9::text::uuid, $9::text::uuid
           )`,
          [
            String(ERP_SETTINGS.firmNr || ''),
            String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10),
            islem.party_id,
            cardType,
            ledgerTrType,
            Math.abs(islem.tutar || 0).toString(),
            -1,
            `Ortak adına tedarikçi ödemesi: ${islem.islem_aciklamasi || ''}`.trim(),
            rows[0]?.id,
          ],
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

    const mapped = mapDbIslemToIslem(rows[0]);
    if (isGiderPusulasiType(islem.islem_tipi) && !skipExpenseMirror && mapped?.id) {
      await upsertExpenseLinkedToCashLine({
        cashLineId: String(mapped.id),
        amount: islem.tutar,
        definition: islem.islem_aciklamasi || 'Gider',
        date: islem.islem_tarihi || new Date().toISOString(),
        registerId: islem.kasa_id,
        ficheNo: mapped.islem_no || ficheNo,
        category: islem.ozel_kod || '',
      });
    }
    return mapped;
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
    bakiye: parseKasaAmount(row.balance),
    id_bakiye: parseKasaAmount(row.balance),
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
    tutar: Math.abs(parseKasaAmount(row.amount)),
    islem_aciklamasi: row.definition,
    // cari_hesap_id: customer_id öncelikli; tedarikçi/personel için party_id fallback.
    // Bu sayede eski müşteri tahsilatları ve yeni tedarikçi ödemelerinin ikisi de
    // CariHesapSelector / CariHesapPicker bileşeninde doğru şekilde görünür.
    cari_hesap_id:
      row.current_account_resolved_id || row.customer_id || row.party_id || undefined,
    cari_hesap_unvani: row.current_account_name || undefined,
    cari_hesap_kodu: row.current_account_code || undefined,
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

  const amount = Math.abs(parseKasaAmount(row.amount));
  const sign = effectiveKasaPostedSign(row.sign, row.transaction_type);
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
    // DELETE tarafında da INSERT tarafıyla simetrik olmalı: customer_id → customers,
    // party_id (supplier/employee/partner) → suppliers veya parties. customerId+partyId
    // aynı satırda ikisi birden olamaz, ama eski veride yanlışlıkla customer_id'ye
    // tedarikçi UUID'si yazılmış olabilir — bu durumda partyId NULL'dır ve customerId
    // üzerinden tespit yaparız.
    if ((customerId || partyId) && (trType === 'CH_ODEME' || trType === 'CH_TAHSILAT')) {
        const probeId = String(partyId || customerId || '');
        // CH_ODEME → tedarikçi ödemesi, CH_TAHSILAT → müşteri tahsilatı.
        // Her iki yönde aynı UUID hem customers hem suppliers'da olabilir; caller hint
        // doğru tabloyu seçmeyi garantiler.
        const delHint: 'supplier' | 'customer' | null =
          trType === 'CH_ODEME' ? 'supplier'
          : trType === 'CH_TAHSILAT' ? 'customer'
          : null;
        const delKind = await resolveCariAccountKind(probeId, delHint);
        const delta = -cariCashStoredBalanceDelta(amount, trType, storedCariTypeFromKind(delKind));
      if (delta !== 0) {
        const deltaStr = delta.toString();
        // Tedarikçi ödemelerinde party_id dolu (yeni davranış). Müşteri tahsilatlarında
        // customer_id dolu. Eski veride customer_id'ye tedarikçi UUID'si yazılmışsa
        // türü yeniden tespit edip doğru tabloya geri al.
        await ensurePartyPeriodTables();
        if (partyId && (delKind === 'employee' || delKind === 'partner')) {
          // Personel/Şirket ortağı kasa işlemleri için party bakiyesi zaten aşağıdaki
          // 4) adımda ters çevriliyor; burada ek bir şey yapma.
        } else if (delKind === 'supplier') {
          await postgres.query(
            `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
            [deltaStr, probeId],
          );
        } else if (delKind === 'customer') {
          await postgres.query(
            `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
            [deltaStr, probeId, normalizeFirmTableNr(ERP_SETTINGS.firmNr)],
          );
        } else if (customerId) {
          // Fallback: eski davranış (önce customer, yoksa supplier)
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
    }

    // 4) Party bakiyesini tersine al (Personel / Şirket Ortağı)
    if (partyId) {
      let partyDelta = -computePartyBalanceDelta(amount, trType);
      // CH_ODEME + party_id ise CH_ODEME_PARTNER ledger kaydı yazılmıştı; ters yönde al
      if (trType === 'CH_ODEME') {
        partyDelta = Math.abs(amount || 0);
      }
      if (partyDelta !== 0) {
        await postgres.query(
          `UPDATE rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties SET balance = balance + $1::text::numeric, updated_at = NOW() WHERE id = $2::text::uuid`,
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
    // CH_ODEME + party_id ise createKasaIslemi'de CH_ODEME_PARTNER kaydı açılmıştı → iptalde bu sanal tip kullanılır.
    if (partyId) {
      let cancelType = trType;
      if (trType === 'CH_ODEME' && PARTY_CANCEL_TYPES.has('CH_ODEME_PARTNER')) {
        cancelType = 'CH_ODEME_PARTNER';
      }
      if (PARTY_CANCEL_TYPES.has(cancelType)) {
        const cardType = await resolvePartyCardType(partyId);
        await writePartyLedgerCancel({
          partyId,
          cardType,
          trType: cancelType,
          amount,
          sign,
          definition: row.definition,
          cashLineId: id,
        });
      }
    }

    // 7) Bağlı gider pusulası (Gider Yönetimi / güzellik) — önce expenses, sonra cash_line
    await deleteExpenseLinkedToCashLine(id);

    // 8) Ana satırı sil
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

  const amount = Math.abs(parseKasaAmount(row.amount));
  const sign = effectiveKasaPostedSign(row.sign, row.transaction_type);
  const registerId = row.register_id;
  const targetRegisterId = row.target_register_id;
  const ficheNo = row.fiche_no || '';
  const trType = row.transaction_type || '';
  const customerId = row.customer_id;
  const partyIdFromRow = row.party_id;
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
      { balance: parseKasaAmount(r.balance) + delta },
      { schema: 'public', prefer: 'return=minimal' }
    );
  };

  // Kasa bakiyesini ters al
  await bumpKasa(registerId, -(amount * sign));

  // Cari hesap geri al
  // Tedarikçi ödemelerinde party_id dolu; müşteri tahsilatlarında customer_id dolu.
  // customerId veya partyIdFromRow → tür tespiti → doğru tablo.
  if ((customerId || partyIdFromRow) && (trType === 'CH_ODEME' || trType === 'CH_TAHSILAT')) {
      const probeId = String(partyIdFromRow || customerId || '');
      // CH_ODEME → tedarikçi ödemesi, CH_TAHSILAT → müşteri tahsilatı.
      // aynı UUID her iki tabloda olabilir → caller hint ile doğru tablo.
      const delHint: 'supplier' | 'customer' | null =
        trType === 'CH_ODEME' ? 'supplier'
        : trType === 'CH_TAHSILAT' ? 'customer'
        : null;
      const delKind = await resolveCariAccountKind(probeId, delHint);
    const delta = -cariCashStoredBalanceDelta(amount, trType, storedCariTypeFromKind(delKind));
    if (delta !== 0) {
      const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
      const patchPartner = async (path: string, withFirm: boolean, partnerId: string) => {
        try {
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
      if (delKind === 'supplier') {
        await patchPartner(`/rex_${firmNr}_suppliers`, false, probeId);
      } else if (delKind === 'customer') {
        await patchPartner(`/rex_${firmNr}_customers`, true, probeId);
      } else if (delKind === 'employee' || delKind === 'partner') {
        // parties bakiyesi aşağıdaki party_id bloğunda güncelleniyor.
      } else if (customerId) {
        // Fallback eski davranış
        const patched = await patchPartner(`/rex_${firmNr}_customers`, true, String(customerId));
        if (!patched) await patchPartner(`/rex_${firmNr}_suppliers`, false, String(customerId));
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
  if (partyId) {
    // Party bakiyesini tersine al
    let partyDelta = -computePartyBalanceDelta(amount, trType);
    if (trType === 'CH_ODEME') {
      // CH_ODEME + party_id ise createKasaIslemi'de CH_ODEME_PARTNER ledger kaydı yazılmıştı
      // (party bakiyesi -ABS olarak düşmüştü); geri al
      partyDelta = Math.abs(amount || 0);
    }
    if (partyDelta !== 0) {
      try {
        const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
        const partyPath = `/rex_${firmNr}_parties`;
        const rs = await postgrest.get<any[]>(
          partyPath,
          { select: 'balance', id: `eq.${partyId}`, limit: 1 },
          { schema: 'public' },
        );
        const r = Array.isArray(rs) ? rs[0] : null;
        if (r) {
          await postgrest.patch(
            `${partyPath}?id=eq.${encodeURIComponent(String(partyId))}`,
            { balance: Number(r.balance ?? 0) + partyDelta },
            { schema: 'public', prefer: 'return=minimal' },
          );
        }
      } catch (err) {
        console.warn('[Kasa] deleteKasaIslemiViaPostgrest: party balance revert failed:', err);
      }
    }

    // Ledger cancel kaydı
    let cancelType = trType;
    if (trType === 'CH_ODEME') cancelType = 'CH_ODEME_PARTNER';
    if (PARTY_CANCEL_TYPES.has(String(cancelType))) {
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
              transaction_type: `CANCELLED_${String(cancelType)}`,
              date: new Date().toISOString(),
              amount: Math.abs(parseKasaAmount(row.amount)),
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
  }

  // Bağlı gider pusulası
  await deleteExpenseLinkedToCashLine(String(id));

  // Ana satırı sil
  await postgrest.delete(`${linesPath}?id=eq.${encodeURIComponent(String(id))}`, { schema: 'public', prefer: 'return=minimal' });
}

/**
 * Kasa işlemini güncelle — mevcut cash_line üzerinde yerinde delta (sil+yeniden oluştur YOK).
 * GIDER_PUSULASI düzenlemesinde rex_{firm}_expenses satırı da senkronlanır (B01/B23).
 */
export function computeKasaIslemiSign(islemTipi: string): number {
  const tip = String(islemTipi || '').trim().toUpperCase();
  switch (tip) {
    case 'CH_TAHSILAT':
    case 'KASA_GIRIS':
    case 'BANKADAN_CEKILEN':
    case 'ALINAN_SERBEST_MESLEK':
    case 'ACILIS_BORC':
    case 'KUR_FARKI_BORC':
    case 'ORTAK_DAGITIM_ZARAR':
    case 'ORTAK_SERMAYE_TAHSILAT':
    case 'ORTAK_PARA_GIRIS':
      return 1;
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
      return -1;
    case 'AVANS_MAHSUP':
      return 0;
    default:
      return tip.includes('CIKIS') || tip.includes('ODEME') ? -1 : 1;
  }
}

/** Bakiye delta: (yeni tutar×sign) − (eski tutar×sign) — balance'a eklenir. */
export function kasaIslemiBalanceDeltaOnUpdate(
  oldAmount: number,
  oldSign: number,
  newAmount: number,
  newSign: number,
): number {
  const oa = Math.abs(parseKasaAmount(oldAmount));
  const na = Math.abs(parseKasaAmount(newAmount));
  return na * Number(newSign || 0) - oa * Number(oldSign || 0);
}

/**
 * cash_lines.sign 0/NULL/NaN ise create'in yazdığı tip işaretini kullan.
 * Aksi halde 450k→45k düzenlemede eski tutar terslenmez; silme yalnızca 45k alır (505k hayalet).
 */
export function effectiveKasaPostedSign(rowSign: unknown, trType: string): number {
  const n = Number(rowSign);
  if (Number.isFinite(n) && n !== 0) return n < 0 ? -1 : 1;
  return computeKasaIslemiSign(trType);
}

export function kasaIslemiPostedCash(amount: number, sign: number): number {
  return Math.abs(parseKasaAmount(amount)) * Number(sign || 0);
}

/** Silmede ledger'daki (tutar×sign) kadar bakiyeyi geri al. */
export function kasaIslemiBalanceDeltaOnDelete(amount: number, sign: number): number {
  return -kasaIslemiPostedCash(amount, sign);
}

export function isCariCashTransactionType(trType: string | null | undefined): boolean {
  const t = String(trType || '').trim().toUpperCase();
  return t === 'CH_TAHSILAT' || t === 'CH_ODEME';
}

/** Cari saklanan balance neti — create/delete ile aynı işaret (müşteri varsayılan). */
export function kasaIslemiCariDeltaOnUpdate(
  oldAmount: number,
  oldType: string,
  newAmount: number,
  newType: string,
  cariType: 'customer' | 'supplier' | null | undefined = 'customer',
): number {
  return (
    cariCashStoredBalanceDelta(newAmount, newType, cariType) -
    cariCashStoredBalanceDelta(oldAmount, oldType, cariType)
  );
}

export function cashRegisterDeltasOnUpdate(
  oldRegisterId: string | null | undefined,
  newRegisterId: string | null | undefined,
  oldPosted: number,
  newPosted: number,
): Array<{ registerId: string; delta: number }> {
  const o = String(oldRegisterId || '').trim();
  const n = String(newRegisterId || '').trim();
  const op = Number(oldPosted) || 0;
  const np = Number(newPosted) || 0;
  if (o && n && o === n) {
    const d = np - op;
    return Number.isFinite(d) && d !== 0 ? [{ registerId: o, delta: d }] : [];
  }
  const out: Array<{ registerId: string; delta: number }> = [];
  if (o && op) out.push({ registerId: o, delta: -op });
  if (n && np) out.push({ registerId: n, delta: np });
  return out;
}

function kasaIslemiPartyPostedDelta(
  amount: number,
  trType: string,
  partyId: string | null | undefined,
): number {
  if (!partyId) return 0;
  const t = String(trType || '').trim().toUpperCase();
  if (t === 'CH_ODEME') return -Math.abs(parseKasaAmount(amount));
  return computePartyBalanceDelta(amount, t);
}

async function applyCashRegisterBalanceDelta(
  registerId: string | null | undefined,
  delta: number,
): Promise<void> {
  const rid = String(registerId || '').trim();
  if (!rid || !Number.isFinite(delta) || delta === 0) return;
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const kasaPath = `/rex_${padKasaFirmNr()}_cash_registers`;
    const cur = await postgrest.get<any[]>(
      kasaPath,
      { select: 'balance', id: `eq.${rid}`, limit: 1 },
      { schema: 'public' },
    );
    const r = Array.isArray(cur) ? cur[0] : null;
    if (!r) {
      throw new Error('Kasa bakiyesi güncellenemedi — kasa bulunamadı');
    }
    await postgrest.patch(
      `${kasaPath}?id=eq.${encodeURIComponent(rid)}`,
      { balance: Number(r.balance ?? 0) + delta },
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }
  await postgres.query(
    `UPDATE cash_registers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
    [delta.toString(), rid],
  );
}

async function bumpCariStoredBalance(
  partnerId: string | null | undefined,
  trType: string,
  delta: number,
): Promise<void> {
  const id = String(partnerId || '').trim();
  if (!id || !Number.isFinite(delta) || delta === 0) return;
  const hint: 'supplier' | 'customer' | null =
    trType === 'CH_ODEME' ? 'supplier' : trType === 'CH_TAHSILAT' ? 'customer' : null;
  const kind = await resolveCariAccountKind(id, hint);
  if (kind === 'employee' || kind === 'partner') return;
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const deltaStr = delta.toString();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const tryPatch = async (path: string, withFirm: boolean): Promise<boolean> => {
      try {
        const q: Record<string, string> = { select: 'balance', id: `eq.${id}`, limit: '1' };
        if (withFirm) q.firm_nr = `eq.${firmNr}`;
        const rs = await postgrest.get<any[]>(path, q, { schema: 'public' });
        const r = Array.isArray(rs) ? rs[0] : null;
        if (!r) return false;
        const url = withFirm
          ? `${path}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmNr)}`
          : `${path}?id=eq.${encodeURIComponent(id)}`;
        await postgrest.patch(
          url,
          { balance: Number(r.balance ?? 0) + delta },
          { schema: 'public', prefer: 'return=minimal' },
        );
        return true;
      } catch {
        return false;
      }
    };
    if (kind === 'supplier') {
      await tryPatch(`/rex_${firmNr}_suppliers`, false);
    } else if (kind === 'customer') {
      await tryPatch(`/rex_${firmNr}_customers`, true);
    } else {
      const patched = await tryPatch(`/rex_${firmNr}_customers`, true);
      if (!patched) await tryPatch(`/rex_${firmNr}_suppliers`, false);
    }
    return;
  }
  if (kind === 'supplier') {
    await postgres.query(
      `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
      [deltaStr, id],
    );
  } else if (kind === 'customer') {
    await postgres.query(
      `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
      [deltaStr, id, firmNr],
    );
  } else {
    const { rowCount: custCount } = await postgres.query(
      `UPDATE customers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid AND firm_nr = $3::text`,
      [deltaStr, id, firmNr],
    );
    if (!custCount) {
      await postgres.query(
        `UPDATE suppliers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
        [deltaStr, id],
      );
    }
  }
}

async function bumpPartyCardBalance(partyId: string | null | undefined, delta: number): Promise<void> {
  const id = String(partyId || '').trim();
  if (!id || !Number.isFinite(delta) || delta === 0) return;
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const partyPath = `/rex_${firmNr}_parties`;
    const rs = await postgrest.get<any[]>(
      partyPath,
      { select: 'balance', id: `eq.${id}`, limit: 1 },
      { schema: 'public' },
    );
    const r = Array.isArray(rs) ? rs[0] : null;
    if (!r) return;
    await postgrest.patch(
      `${partyPath}?id=eq.${encodeURIComponent(id)}`,
      { balance: Number(r.balance ?? 0) + delta },
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }
  await postgres.query(
    `UPDATE rex_${firmNr}_parties SET balance = balance + $1::text::numeric, updated_at = NOW() WHERE id = $2::text::uuid`,
    [delta.toString(), id],
  );
}

async function applyCariAndPartyDeltasOnUpdate(opts: {
  oldPartnerId: string;
  newPartnerId: string;
  oldType: string;
  newType: string;
  oldAmount: number;
  newAmount: number;
  oldPartyId: string;
  newPartyId: string;
}): Promise<void> {
  const oldP = opts.oldPartnerId;
  const newP = opts.newPartnerId;
  const hintForType = (trType: string): 'supplier' | 'customer' | null =>
    trType === 'CH_ODEME' ? 'supplier' : trType === 'CH_TAHSILAT' ? 'customer' : null;
  if (oldP && newP && oldP === newP) {
    const hintType = isCariCashTransactionType(opts.oldType) ? opts.oldType : opts.newType;
    const kind = await resolveCariAccountKind(oldP, hintForType(hintType));
    await bumpCariStoredBalance(
      oldP,
      hintType,
      kasaIslemiCariDeltaOnUpdate(
        opts.oldAmount,
        opts.oldType,
        opts.newAmount,
        opts.newType,
        storedCariTypeFromKind(kind),
      ),
    );
  } else {
    if (oldP) {
      const kind = await resolveCariAccountKind(oldP, hintForType(opts.oldType));
      await bumpCariStoredBalance(
        oldP,
        opts.oldType,
        -cariCashStoredBalanceDelta(opts.oldAmount, opts.oldType, storedCariTypeFromKind(kind)),
      );
    }
    if (newP) {
      const kind = await resolveCariAccountKind(newP, hintForType(opts.newType));
      await bumpCariStoredBalance(
        newP,
        opts.newType,
        cariCashStoredBalanceDelta(opts.newAmount, opts.newType, storedCariTypeFromKind(kind)),
      );
    }
  }

  const oldParty = opts.oldPartyId;
  const newParty = opts.newPartyId;
  const oldPartyPosted = kasaIslemiPartyPostedDelta(opts.oldAmount, opts.oldType, oldParty);
  const newPartyPosted = kasaIslemiPartyPostedDelta(opts.newAmount, opts.newType, newParty);
  if (oldParty && newParty && oldParty === newParty) {
    await bumpPartyCardBalance(oldParty, newPartyPosted - oldPartyPosted);
  } else {
    if (oldParty) await bumpPartyCardBalance(oldParty, -oldPartyPosted);
    if (newParty) await bumpPartyCardBalance(newParty, newPartyPosted);
  }
}

async function listExpensesForMirrorDate(day: string): Promise<ExpenseMirrorRow[]> {
  const firm = padKasaFirmNr();
  const date = String(day || '').slice(0, 10);
  if (!date) return [];
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest
      .get<any[]>(
        expenseTablePathKasa(),
        {
          select: 'id,cash_line_id,amount,description,expense_date,document_number',
          firm_nr: `eq.${firm}`,
          expense_date: `eq.${date}`,
          limit: '500',
        },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    return Array.isArray(rows) ? rows : [];
  }
  try {
    const { rows } = await postgres.query(
      `SELECT id, cash_line_id, amount, description, expense_date, document_number
       FROM ${expenseTableSqlKasa()}
       WHERE firm_nr = $1 AND expense_date = $2::text::date
       LIMIT 500`,
      [firm, date],
    );
    return rows || [];
  } catch (err) {
    console.warn('[Kasa] listExpensesForMirrorDate failed:', err);
    return [];
  }
}

export function pickExpenseForKasaGider(
  rows: ExpenseMirrorRow[],
  opts: { cashLineId?: string; definition: string },
): ExpenseMirrorRow | null {
  const list = Array.isArray(rows) ? rows : [];
  const cid = String(opts.cashLineId || '').trim();
  if (cid) {
    const byLine = list.find((r) => String(r.cash_line_id || '').trim() === cid);
    if (byLine) return byLine;
  }
  const key = normalizeGiderAciklama(opts.definition);
  if (!key) return null;
  const matches = list.filter((r) => normalizeGiderAciklama(r.description) === key);
  if (!matches.length) return null;
  return matches.find((r) => String(r.cash_line_id || '').trim()) || matches[0];
}

async function upsertExpenseLinkedToCashLine(opts: {
  cashLineId: string;
  amount: number;
  definition: string;
  date: string;
  registerId?: string;
  ficheNo?: string;
  category?: string;
}): Promise<void> {
  const firm = padKasaFirmNr();
  const amt = Math.abs(parseKasaAmount(opts.amount));
  const day = String(opts.date || '').slice(0, 10);
  const def = String(opts.definition || '').trim() || 'Gider';
  const cashLineId = String(opts.cashLineId || '').trim();
  if (!cashLineId || !amt) return;

  const patchBody: Record<string, unknown> = {
    amount: amt,
    description: def,
    payment_method: 'cash',
    cash_line_id: cashLineId,
  };
  if (day) patchBody.expense_date = day;
  if (opts.registerId) patchBody.cash_register_id = opts.registerId;

  const rows = await listExpensesForMirrorDate(day || new Date().toISOString().slice(0, 10));
  const existing = pickExpenseForKasaGider(rows, { cashLineId, definition: def });

  try {
    if (existing?.id) {
      if (!String(existing.document_number || '').trim() && opts.ficheNo) {
        patchBody.document_number = opts.ficheNo;
      }
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./postgrestClient');
        await postgrest.patch(
          `${expenseTablePathKasa()}?id=eq.${encodeURIComponent(String(existing.id))}&firm_nr=eq.${encodeURIComponent(firm)}`,
          patchBody,
          { schema: 'public', prefer: 'return=minimal' },
        );
        return;
      }
      await postgres.query(
        `UPDATE ${expenseTableSqlKasa()}
         SET amount = $1::text::numeric,
             description = $2::text,
             expense_date = COALESCE($3::text::date, expense_date),
             payment_method = 'cash',
             cash_line_id = $4::text::uuid,
             cash_register_id = COALESCE($5::text::uuid, cash_register_id),
             document_number = COALESCE(NULLIF(document_number, ''), $6::text)
         WHERE id = $7::text::uuid AND firm_nr = $8`,
        [
          amt,
          def,
          day || null,
          cashLineId,
          opts.registerId || null,
          opts.ficheNo || null,
          existing.id,
          firm,
        ],
      );
      return;
    }

    const category = String(opts.category || '').trim() || 'other';
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      await postgrest.post(
        expenseTablePathKasa(),
        {
          category,
          description: def,
          amount: amt,
          payment_method: 'cash',
          document_number: opts.ficheNo || null,
          expense_date: day || new Date().toISOString().slice(0, 10),
          firm_nr: firm,
          cash_line_id: cashLineId,
          cash_register_id: opts.registerId || null,
        },
        { schema: 'public', prefer: 'return=minimal' },
      );
      return;
    }
    await postgres.query(
      `INSERT INTO ${expenseTableSqlKasa()} (
         category, description, amount, payment_method, document_number,
         expense_date, firm_nr, cash_line_id, cash_register_id
       ) VALUES ($1, $2, $3::text::numeric, 'cash', $4, $5::text::date, $6, $7::text::uuid, $8::text::uuid)`,
      [
        category,
        def,
        amt,
        opts.ficheNo || null,
        day || new Date().toISOString().slice(0, 10),
        firm,
        cashLineId,
        opts.registerId || null,
      ],
    );
  } catch (err) {
    console.warn('[Kasa] upsertExpenseLinkedToCashLine failed:', err);
  }
}

async function deleteExpenseLinkedToCashLine(cashLineId: string): Promise<void> {
  const id = String(cashLineId || '').trim();
  if (!id) return;
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      await postgrest.delete(
        `${expenseTablePathKasa()}?cash_line_id=eq.${encodeURIComponent(id)}`,
        { schema: 'public', prefer: 'return=minimal' },
      );
      return;
    }
    await postgres.query(
      `DELETE FROM ${expenseTableSqlKasa()} WHERE cash_line_id = $1::text::uuid`,
      [id],
    );
  } catch (err) {
    console.warn('[Kasa] deleteExpenseLinkedToCashLine failed:', err);
  }
}

/** Aynı gün + açıklamadaki gider pusulası varsa yeni fiş açma — mevcut cash_line'ı güncelle. */
async function redirectGiderPusulasiCreate(islem: KasaIslemi): Promise<KasaIslemi | null> {
  const day = String(islem.islem_tarihi || '').slice(0, 10);
  const def = String(islem.islem_aciklamasi || '').trim();
  if (!day || !def) return null;
  const rows = await listExpensesForMirrorDate(day);
  const existing = pickExpenseForKasaGider(rows, { definition: def });
  let linkedId = String(existing?.cash_line_id || '').trim();
  if (!linkedId && islem.kasa_id) {
    try {
      const cashRows = await fetchKasaIslemleri({
        kasa_id: islem.kasa_id,
        baslangic_tarihi: day,
        bitis_tarihi: day,
      });
      const key = normalizeGiderAciklama(def);
      const match = (Array.isArray(cashRows) ? cashRows : []).find((r) => {
        const tip = String(r.islem_tipi || '').trim().toUpperCase();
        if (tip !== 'GIDER_PUSULASI' && tip !== 'KASA_CIKIS') return false;
        return normalizeGiderAciklama(r.islem_aciklamasi) === key;
      });
      if (match?.id) linkedId = String(match.id);
    } catch (err) {
      console.warn('[Kasa] redirectGiderPusulasiCreate: mevcut kasa satırı aranamadı:', err);
    }
  }
  if (!linkedId) return null;
  try {
    return await updateKasaIslemi(linkedId, islem);
  } catch (err) {
    console.warn('[Kasa] redirectGiderPusulasiCreate: mevcut satır güncellenemedi, yeni satır denenecek:', err);
    return null;
  }
}

/**
 * Kasa işlemini güncelle — aynı cash_line id üzerinde yerinde delta (sil+yeniden oluştur YOK).
 * GIDER_PUSULASI için bağlı expenses satırı da senkronlanır (B01/B23).
 * VIRMAN / banka tipi değişiminde güvenli yol: delete + create.
 */
export async function updateKasaIslemi(id: string, islem: KasaIslemi): Promise<KasaIslemi> {
  if (!id) throw new Error('Güncellenecek işlem ID boş');

  const newAmount = Math.abs(parseKasaAmount(islem.tutar));
  const newType = String(islem.islem_tipi || '').trim().toUpperCase();
  const newSign = computeKasaIslemiSign(newType);
  const newDate = islem.islem_tarihi || new Date().toISOString();
  const newDef = islem.islem_aciklamasi || '';

  await assertPeriodOpen(
    ERP_SETTINGS.firmNr,
    ERP_SETTINGS.periodNr,
    newDate,
  );

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const fn = padKasaFirmNr();
    const pn = padKasaPeriodNr();
    const linesPath = `/rex_${fn}_${pn}_cash_lines`;

    const rs = await postgrest.get<any[]>(
      linesPath,
      { select: '*', id: `eq.${id}`, limit: 1 },
      { schema: 'public' },
    );
    const row = Array.isArray(rs) ? rs[0] : null;
    if (!row) throw new Error('İşlem bulunamadı');

    const oldAmount = Math.abs(parseKasaAmount(row.amount));
    const oldType = String(row.transaction_type || '').toUpperCase();
    const oldSign = effectiveKasaPostedSign(row.sign, oldType);
    const oldRegisterId = String(row.register_id || islem.kasa_id || '').trim();
    const newRegisterId = String(islem.kasa_id || row.register_id || '').trim();

    // VIRMAN / banka tipi değişimi: güvenli yol delete+create (karşı satır karmaşık).
    const complex =
      oldType === 'VIRMAN' ||
      newType === 'VIRMAN' ||
      oldType === 'BANKA_YATIRILAN' ||
      oldType === 'BANKADAN_CEKILEN' ||
      newType === 'BANKA_YATIRILAN' ||
      newType === 'BANKADAN_CEKILEN' ||
      Boolean(islem.target_register_id && islem.target_register_id !== row.target_register_id);

    if (complex) {
      await deleteKasaIslemi(id);
      return await createKasaIslemi({ ...islem, id: undefined });
    }

    let customerId = row.customer_id || null;
    let partyId = row.party_id || null;
    if (islem.cari_hesap_id && isCariCashTransactionType(newType)) {
      const hint: 'supplier' | 'customer' | null =
        newType === 'CH_ODEME' ? 'supplier' : 'customer';
      const kind = await resolveCariAccountKind(islem.cari_hesap_id, hint);
      const split = islem.party_id
        ? { customer_id: null as string | null, party_id: islem.party_id }
        : splitCariAccountForCashLine(kind, islem.cari_hesap_id);
      customerId = split.customer_id;
      partyId = split.party_id || islem.party_id || null;
    }

    const cashDeltas = cashRegisterDeltasOnUpdate(
      oldRegisterId,
      newRegisterId,
      kasaIslemiPostedCash(oldAmount, oldSign),
      kasaIslemiPostedCash(newAmount, newSign),
    );
    const patchBody: Record<string, unknown> = {
      amount: newAmount,
      f_amount: islem.dovizli_tutar != null ? Math.abs(Number(islem.dovizli_tutar) || 0) : newAmount,
      date: newDate,
      definition: newDef,
      transaction_type: newType || row.transaction_type,
      sign: newSign,
      special_code: islem.ozel_kod ?? row.special_code ?? '',
    };
    if (newRegisterId) patchBody.register_id = newRegisterId;
    if (customerId !== undefined) patchBody.customer_id = customerId;
    if (partyId !== undefined) patchBody.party_id = partyId;

    // Nakit önce: satır tutarı değişip kasa bakiyesinin eski 450k'da kalmasını önle.
    for (const d of cashDeltas) {
      await applyCashRegisterBalanceDelta(d.registerId, d.delta);
    }

    let updatedRow: any;
    try {
      const patched = await postgrest.patch<any[]>(
        `${linesPath}?id=eq.${encodeURIComponent(id)}`,
        patchBody,
        { schema: 'public', prefer: 'return=representation' },
      );
      updatedRow = Array.isArray(patched) ? patched[0] : patched;
      await applyCariAndPartyDeltasOnUpdate({
        oldPartnerId: String(row.customer_id || row.party_id || '').trim(),
        newPartnerId: String(customerId || partyId || islem.cari_hesap_id || '').trim(),
        oldType,
        newType,
        oldAmount,
        newAmount,
        oldPartyId: String(row.party_id || '').trim(),
        newPartyId: String(partyId || '').trim(),
      });
    } catch (err) {
      for (const d of cashDeltas) {
        try {
          await applyCashRegisterBalanceDelta(d.registerId, -d.delta);
        } catch {
          /* nakit geri alma en iyi çaba */
        }
      }
      throw err;
    }

    if (newType === 'GIDER_PUSULASI' || oldType === 'GIDER_PUSULASI') {
      await upsertExpenseLinkedToCashLine({
        cashLineId: id,
        amount: newAmount,
        definition: newDef || 'Gider',
        date: newDate,
        registerId: newRegisterId || undefined,
        ficheNo: String(updatedRow?.fiche_no || row.fiche_no || ''),
        category: islem.ozel_kod || String(row.special_code || ''),
      });
    }

    return mapDbIslemToIslem(updatedRow || { ...row, ...patchBody, id });
  }

  const table = 'cash_lines';
  const { rows: prevRows } = await postgres.query(
    `SELECT * FROM ${table} WHERE id = $1::text::uuid LIMIT 1`,
    [id],
  );
  const row = prevRows?.[0];
  if (!row) throw new Error('İşlem bulunamadı');

  const oldAmount = Math.abs(parseKasaAmount(row.amount));
  const oldType = String(row.transaction_type || '').toUpperCase();
  const oldSign = effectiveKasaPostedSign(row.sign, oldType);
  const oldRegisterId = String(row.register_id || islem.kasa_id || '').trim();
  const newRegisterId = String(islem.kasa_id || row.register_id || '').trim();

  const complex =
    oldType === 'VIRMAN' ||
    newType === 'VIRMAN' ||
    oldType === 'BANKA_YATIRILAN' ||
    oldType === 'BANKADAN_CEKILEN' ||
    newType === 'BANKA_YATIRILAN' ||
    newType === 'BANKADAN_CEKILEN' ||
    Boolean(islem.target_register_id && islem.target_register_id !== row.target_register_id);

  if (complex) {
    await deleteKasaIslemi(id);
    return await createKasaIslemi({ ...islem, id: undefined });
  }

  let customerId = row.customer_id || null;
  let partyId = row.party_id || null;
  if (islem.cari_hesap_id && isCariCashTransactionType(newType)) {
    const hint: 'supplier' | 'customer' | null =
      newType === 'CH_ODEME' ? 'supplier' : 'customer';
    const kind = await resolveCariAccountKind(islem.cari_hesap_id, hint);
    const split = islem.party_id
      ? { customer_id: null as string | null, party_id: islem.party_id }
      : splitCariAccountForCashLine(kind, islem.cari_hesap_id);
    customerId = split.customer_id;
    partyId = split.party_id || islem.party_id || null;
  }

  const cashDeltas = cashRegisterDeltasOnUpdate(
    oldRegisterId,
    newRegisterId,
    kasaIslemiPostedCash(oldAmount, oldSign),
    kasaIslemiPostedCash(newAmount, newSign),
  );

  await postgres.query('BEGIN');
  try {
    const { rows } = await postgres.query(
      `UPDATE ${table}
       SET amount = $1::text::numeric,
           f_amount = $2::text::numeric,
           date = $3::text::date,
           definition = $4::text,
           transaction_type = $5::text,
           sign = $6::text::integer,
           special_code = $7::text,
           register_id = COALESCE($8::text::uuid, register_id),
           customer_id = $9::text::uuid,
           party_id = $10::text::uuid
       WHERE id = $11::text::uuid
       RETURNING *`,
      [
        newAmount,
        islem.dovizli_tutar != null ? Math.abs(Number(islem.dovizli_tutar) || 0) : newAmount,
        newDate,
        newDef,
        newType || row.transaction_type,
        newSign,
        islem.ozel_kod ?? row.special_code ?? '',
        newRegisterId || null,
        customerId,
        partyId,
        id,
      ],
    );

    for (const d of cashDeltas) {
      await applyCashRegisterBalanceDelta(d.registerId, d.delta);
    }
    await applyCariAndPartyDeltasOnUpdate({
      oldPartnerId: String(row.customer_id || row.party_id || '').trim(),
      newPartnerId: String(customerId || partyId || islem.cari_hesap_id || '').trim(),
      oldType,
      newType,
      oldAmount,
      newAmount,
      oldPartyId: String(row.party_id || '').trim(),
      newPartyId: String(partyId || '').trim(),
    });

    await postgres.query('COMMIT');

    if (newType === 'GIDER_PUSULASI' || oldType === 'GIDER_PUSULASI') {
      await upsertExpenseLinkedToCashLine({
        cashLineId: id,
        amount: newAmount,
        definition: newDef || 'Gider',
        date: newDate,
        registerId: newRegisterId || undefined,
        ficheNo: String(rows[0]?.fiche_no || row.fiche_no || ''),
        category: islem.ozel_kod || String(row.special_code || ''),
      });
    }

    return mapDbIslemToIslem(rows[0]);
  } catch (err) {
    try {
      await postgres.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

// ===== CASH BREAKDOWN =====
/**
 * Kasa bakiye breakdown — kart üzerinde hover'da gösterilecek matematik özeti.
 *
 * 50 yıllık muhasebeci gözüyle: "Bu kasa neden bu kadar?" sorusuna tek bakışta yanıt verir.
 * - Açılış bakiyesi (legacy register_id NULL olan kayıtların toplamı)
 * - Toplam giriş / çıkış (tüm zaman)
 * - Aylık net
 * - En büyük gider kalemleri (son 5)
 * - Negatif bakiye uyarısı
 */
export interface CashBreakdown {
  registerId: string;
  registerName: string;
  registerCode: string;
  currentBalance: number;
  openingBalance: number; // legacy kayıtlardan hesaplanan gerçek açılış
  totalIn: number;
  totalOut: number;
  netMovement: number; // totalIn - totalOut (legacy hariç)
  transactionCount: number;
  monthlyBreakdown: Array<{
    month: string;
    inAmount: number;
    outAmount: number;
    net: number;
  }>;
  topExpenses: Array<{
    date: string;
    amount: number;
    definition: string;
    transactionType: string;
  }>;
  warnings: string[];
}

export async function fetchCashBreakdown(registerId: string): Promise<CashBreakdown> {
  const table = 'cash_registers';
  const linesTable = 'cash_lines';
  const firm = padKasaFirmNr();
  const period = padKasaPeriodNr();

  // Register bilgisi
  const regRes = await postgres.query(
    `SELECT id, code, name, balance FROM ${table} WHERE id = $1::text::uuid LIMIT 1`,
    [registerId]
  );
  const reg = regRes.rows?.[0];
  if (!reg) {
    throw new Error('Kasa bulunamadı');
  }

  // Legacy açılış (register_id NULL olanlar)
  const legacyRes = await postgres.query(
    `SELECT COALESCE(SUM(amount * sign), 0) AS legacy_net,
            COUNT(*) AS legacy_count
       FROM ${linesTable}
      WHERE register_id IS NULL
        AND firm_nr = $1::text
        AND period_nr = $2::text`,
    [firm, period]
  );
  const legacyNet = Number(legacyRes.rows?.[0]?.legacy_net || 0);

  // Toplam giriş / çıkış (bu kasa için)
  const totalsRes = await postgres.query(
    `SELECT
       COALESCE(SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END), 0) AS total_in,
       COALESCE(SUM(CASE WHEN sign = -1 THEN amount ELSE 0 END), 0) AS total_out,
       COUNT(*) AS tx_count
     FROM ${linesTable}
     WHERE register_id = $1::text::uuid
       AND firm_nr = $2::text
       AND period_nr = $3::text`,
    [registerId, firm, period]
  );
  const totalIn = Number(totalsRes.rows?.[0]?.total_in || 0);
  const totalOut = Number(totalsRes.rows?.[0]?.total_out || 0);
  const txCount = Number(totalsRes.rows?.[0]?.tx_count || 0);

  // Aylık breakdown (son 6 ay)
  const monthlyRes = await postgres.query(
    `SELECT
       TO_CHAR(date, 'YYYY-MM') AS month,
       COALESCE(SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END), 0) AS in_amount,
       COALESCE(SUM(CASE WHEN sign = -1 THEN amount ELSE 0 END), 0) AS out_amount
     FROM ${linesTable}
     WHERE register_id = $1::text::uuid
       AND firm_nr = $2::text
       AND period_nr = $3::text
       AND date >= (CURRENT_DATE - INTERVAL '6 months')
     GROUP BY 1
     ORDER BY 1 DESC`,
    [registerId, firm, period]
  );
  const monthlyBreakdown = (monthlyRes.rows || []).map((r: any) => ({
    month: String(r.month),
    inAmount: Number(r.in_amount),
    outAmount: Number(r.out_amount),
    net: Number(r.in_amount) - Number(r.out_amount),
  }));

  // En büyük 5 gider
  const topRes = await postgres.query(
    `SELECT
       TO_CHAR(date, 'YYYY-MM-DD') AS date,
       amount,
       COALESCE(definition, '') AS definition,
       transaction_type
     FROM ${linesTable}
     WHERE register_id = $1::text::uuid
       AND firm_nr = $2::text
       AND period_nr = $3::text
       AND sign = -1
     ORDER BY amount DESC
     LIMIT 5`,
    [registerId, firm, period]
  );
  const topExpenses = (topRes.rows || []).map((r: any) => ({
    date: String(r.date),
    amount: Number(r.amount),
    definition: String(r.definition || ''),
    transactionType: String(r.transaction_type || ''),
  }));

  // Uyarılar
  const warnings: string[] = [];
  const currentBalance = Number(reg.balance || 0);
  if (currentBalance < 0) {
    warnings.push(
      `⚠️ Kasa bakiyesi negatif (${currentBalance.toLocaleString('tr-TR')} IQD). Açılış bakiyesi eksik veya fazla gider girilmiş olabilir.`,
    );
  }
  if (legacyNet !== 0) {
    warnings.push(
      `📋 ${legacyRes.rows?.[0]?.legacy_count || 0} adet açılış öncesi kayıt (${legacyNet.toLocaleString('tr-TR')} IQD) register_id NULL olarak duruyor. Devir için düzeltme önerilir.`,
    );
  }
  // Negatif aylık net kontrolü
  const negativeMonths = monthlyBreakdown.filter((m) => m.net < 0);
  if (negativeMonths.length >= 3) {
    warnings.push(
      `📉 Son 6 ayda ${negativeMonths.length} ay negatif kapandı. Sürdürülebilirlik riski.`,
    );
  }

  return {
    registerId: reg.id,
    registerName: reg.name,
    registerCode: reg.code,
    currentBalance,
    openingBalance: legacyNet,
    totalIn,
    totalOut,
    netMovement: totalIn - totalOut,
    transactionCount: txCount,
    monthlyBreakdown,
    topExpenses,
    warnings,
  };
}

/**
 * Aylık kasa net akışı (tüm registerlar toplamı veya belirli register).
 * PeriodSummary raporunda "Kasa Bakiyesi" kolonu için kullanılır.
 *
 * @param startDate YYYY-MM-DD (dahil)
 * @param endDate YYYY-MM-DD (dahil)
 * @param registerCode Opsiyonel: belirli register (ör. 'KASA.001'); null = tüm registerlar
 * @returns Her ay için { month: 'YYYY-MM', inAmount, outAmount, net }
 */
export interface CashMonthlyNetRow {
  month: string;
  inAmount: number;
  outAmount: number;
  net: number;
}

export async function getMonthlyCashNetFlow(
  startDate: string,
  endDate: string,
  registerCode?: string | null,
): Promise<CashMonthlyNetRow[]> {
  const firmNr = String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0');
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const linesTable = `rex_${firmNr}_${periodNr}_cash_lines`;

  let sql = `
    SELECT TO_CHAR(l.created_at, 'YYYY-MM') AS month,
           SUM(CASE WHEN l.sign = 1 THEN l.amount ELSE 0 END)::bigint AS in_amount,
           SUM(CASE WHEN l.sign = -1 THEN l.amount ELSE 0 END)::bigint AS out_amount,
           SUM(l.amount * l.sign)::bigint AS net
    FROM ${linesTable} l
    WHERE l.created_at::date >= $1::date
      AND l.created_at::date <= $2::date
  `;
  const params: any[] = [startDate, endDate];

  if (registerCode) {
    sql += `
      AND l.register_id IN (
        SELECT id FROM rex_${firmNr}_cash_registers WHERE code = $3
      )
    `;
    params.push(registerCode);
  }

  sql += ` GROUP BY 1 ORDER BY 1`;

  const { rows } = await postgres.query(sql, params);

  return rows.map((r: any) => ({
    month: String(r.month || ''),
    inAmount: Number(r.in_amount || 0),
    outAmount: Number(r.out_amount || 0),
    net: Number(r.net || 0),
  }));
}

