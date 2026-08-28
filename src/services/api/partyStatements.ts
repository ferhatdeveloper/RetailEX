/**
 * Party Hesap Ekstresi — UNION ALL tabanlı.
 *
 * 4 tip:
 *   - customer: sales + cash_lines (customer_id) — müşteri kartı ekstresi
 *   - supplier: cash_lines (customer_id ile tedarikçi olarak) + purchase_invoices
 *               (mevcut customers/suppliers mantığı — burada basitleştirilmiş)
 *   - employee: party_ledger_movements (MAAS_HAKKEDIS / MAAS_ODEME / AVANS_ODEME / AVANS_MAHSUP)
 *   - partner : cash_lines.party_id + party_ledger_movements (ORTAK_DAGITIM_KAR/ZARAR/SERMAYE)
 *
 * 90 yıllık muhasebeci denetimi:
 *   - Personel pozitif balance = ödenmemiş maaş alacağı (hakkediş − ödeme/avans).
 *   - Ortağı pozitif balance = dağıtılmamış kâr payı (işletme ortağa borçlu).
 *   - Personel yönü transaction_type ile hesaplanır (eski sign alanına güvenilmez).
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';
import { employeeStatementSides } from './partyEmployeeBalance';
import type { PartyCardType } from '../../core/types/models';

export interface PartyStatementLine {
  date: string;
  source: 'sale' | 'cash_line' | 'party_ledger' | 'opening';
  transaction_type: string;
  fiche_no?: string | null;
  definition?: string | null;
  debit: number;
  credit: number;
  balance_after: number;
  id?: string | null;
}

export interface PartyStatement {
  party_id: string;
  card_type: PartyCardType;
  opening_balance: number;
  /** Dönem sonu (açılış + hareketler). Kart bakiyesi ile karıştırılmaz. */
  closing_balance: number;
  /** parties.balance — maaş/avans/mahsup sonrası canlı kart bakiyesi */
  card_balance: number;
  rows: PartyStatementLine[];
}

function firm(): string {
  return normalizeFirmTableNr(ERP_SETTINGS.firmNr);
}

function period(): string {
  return String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
}

function salesTable(): string {
  return `rex_${firm()}_${period()}_sales`;
}

function cashLinesTable(): string {
  return `rex_${firm()}_${period()}_cash_lines`;
}

function partyLedgerTable(): string {
  return `rex_${firm()}_${period()}_party_ledger_movements`;
}

/**
 * partyId + cardType için tarih aralığında UNION ALL ekstresi döner.
 * start/end: 'YYYY-MM-DD' (veya tam ISO). Boş bırakılırsa dönemin tamamı.
 *
 * opts:
 *   - showCancelled        : default false. true ise iptal edilen (CANCELLED_*) ve
 *                            source_module='cash_delete' ledger satırları da döner.
 *   - excludeCompanyDebts  : default false. true ise "işletmenin ortağa/personele
 *                            borçlandığı" transaction_type'lar filtrelenir
 *                            (KAR_DAGITIMI, ORTAK_DAGITIM_KAR, SERMAYE_TAHSILAT,
 *                            ORTAK_SERMAYE_TAHSILAT, ORTAK_PARA_GIRIS).
 *                            Açılış bakiyesine de aynı filtre uygulanır; running
 *                            balance tutarlı kalır.
 */
export interface GetPartyStatementOptions {
  showCancelled?: boolean;
  excludeCompanyDebts?: boolean;
}

export async function getPartyStatement(
  partyId: string,
  cardType: PartyCardType,
  start?: string,
  end?: string,
  opts: GetPartyStatementOptions = {},
): Promise<PartyStatement> {
  await ensurePartyPeriodTables();
  const party = await postgres.query(
    `SELECT id, card_type, balance FROM rex_${firm()}_parties WHERE id = $1::text::uuid LIMIT 1`,
    [partyId],
  );
  const head = party?.rows?.[0];
  const currentBalance = parseFloat(head?.balance || 0);
  const resolvedType: PartyCardType = head?.card_type || cardType;

  const dateCond = (col: string): string => {
    const clauses: string[] = [];
    if (start) clauses.push(`${col} >= $2::date`);
    if (end) clauses.push(`${col} <= $3::date`);
    return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  };

  const showCancelled = opts.showCancelled === true;
  const excludeCompanyDebts = opts.excludeCompanyDebts === true;

  /** İptal edilenleri gizle:
   *   - cash_lines tablosunda 'source_module' kolonu YOK; sadece transaction_type LIKE 'CANCELLED_%'
   *     kullanılır (iptal edilen kasa satırları bu prefix ile yazılır).
   *   - party_ledger_movements (pl) tablosunda hem source_module='cash_delete' filtresi hem
   *     CANCELLED_ transaction_type filtresi uygulanır (iptal edilen kasa satırından
   *     üretilen ledger iptal kaydı).
   */
  const cancelledSql = showCancelled ? '' : ` AND cl.transaction_type NOT LIKE 'CANCELLED_%'`;
  const cancelledLedgerSql = showCancelled ? '' : ` AND pl.source_module IS DISTINCT FROM 'cash_delete' AND pl.transaction_type NOT LIKE 'CANCELLED_%'`;

  /** "İşletmenin ortağa/personele borçlandığı" transaction_type'lar (sign > 0 partner hareketleri) */
  const COMPANY_DEBT_TYPES = [
    'KAR_DAGITIMI',
    'ORTAK_DAGITIM_KAR',
    'SERMAYE_TAHSILAT',
    'ORTAK_SERMAYE_TAHSILAT',
    'ORTAK_PARA_GIRIS',
  ] as const;
  const companyDebtSql = excludeCompanyDebts
    ? ` AND cl.transaction_type NOT IN (${COMPANY_DEBT_TYPES.map((t) => `'${t}'`).join(',')})`
    : '';
  const companyDebtLedgerSql = excludeCompanyDebts
    ? ` AND pl.transaction_type NOT IN (${COMPANY_DEBT_TYPES.map((t) => `'${t}'`).join(',')})`
    : '';

  const params: any[] = [partyId];
  if (start) params.push(start);
  if (end) params.push(end);

  let sql = '';

  if (resolvedType === 'customer') {
    // Müşteri ekstresi: sales + cash_lines.customer_id
    // showCancelled açıkken iptal edilen sales kayıtları da döner.
    // excludeCompanyDebts müşteri için NO-OP (müşteriye kâr dağıtımı yazılmaz).
    sql = `
      SELECT
        s.date,
        'sale'::text AS source,
        COALESCE(s.trcode::text, 'SALE') AS transaction_type,
        s.fiche_no,
        s.customer_name AS definition,
        s.total_gross AS amount,
        CASE WHEN s.is_cancelled = true THEN 0 ELSE 1 END AS sign,
        s.id
      FROM ${salesTable()} s
      WHERE s.customer_id = $1::text::uuid
        ${showCancelled ? '' : 'AND s.is_cancelled = false'}${dateCond('s.date')}
    `;
  } else if (resolvedType === 'supplier') {
    // Tedarikçi: cash_lines.party_id ile bağlanır (CH_ODEME supplier ödemeleri bu kolonda).
    // Geriye uyumluluk: customer_id ile yazılmış eski tedarikçi ödemelerini de dahil et.
    // showCancelled: cash_lines iptal satırları (CANCELLED_* / source_module='cash_delete') filtrelenir.
    // excludeCompanyDebts tedarikçi için NO-OP.
    sql = `
      SELECT
        cl.date,
        'cash_line'::text AS source,
        cl.transaction_type,
        cl.fiche_no,
        cl.definition,
        cl.f_amount AS amount,
        CASE WHEN cl.transaction_type IN ('ODEME','TAHSILAT_CIKIS','VIRMAN_CIKIS') THEN 1 ELSE 0 END AS sign,
        cl.id
      FROM ${cashLinesTable()} cl
      WHERE (cl.party_id = $1::text::uuid
             OR (cl.customer_id = $1::text::uuid AND cl.party_id IS NULL))
        ${dateCond('cl.date')}
        ${cancelledSql}
        ${companyDebtSql}
    `;
  } else {
    // Personel/ortak: ledger kaynak; kasa satırı yalnızca fiş no için JOIN.
    // UNION ALL cash_lines + ledger maaş/avansı çift yazardı (paySalary her ikisine yazar).
    sql = `
      SELECT
        pl.date,
        'party_ledger'::text AS source,
        pl.transaction_type,
        cl.fiche_no,
        pl.definition,
        pl.amount,
        COALESCE(pl.sign, 0) AS sign,
        pl.id
      FROM ${partyLedgerTable()} pl
      LEFT JOIN ${cashLinesTable()} cl ON cl.id = pl.cash_line_id
      WHERE pl.party_id = $1::text::uuid${dateCond('pl.date')}
        ${cancelledLedgerSql}
        ${companyDebtLedgerSql}
      UNION ALL
      SELECT
        cl.date,
        'cash_line'::text AS source,
        cl.transaction_type,
        cl.fiche_no,
        cl.definition,
        cl.f_amount AS amount,
        CASE
          WHEN cl.transaction_type IN ('MAAS_ODEME','AVANS_ODEME','ORTAK_DAGITIM_KAR','ORTAK_SERMAYE_TAHSILAT','ORTAK_PARA_GIRIS','SERMAYE_TAHSILAT') THEN 1
          WHEN cl.transaction_type IN ('ORTAK_DAGITIM_ZARAR','AVANS_MAHSUP','ORTAK_SERMAYE_CIKIS','ORTAK_SERMAYE_ODEME','ORTAK_PARA_CIKIS','SERMAYE_ODEME') THEN -1
          ELSE 0
        END AS sign,
        cl.id
      FROM ${cashLinesTable()} cl
      WHERE cl.party_id = $1::text::uuid${dateCond('cl.date')}
        AND NOT EXISTS (
          SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
        )
        ${cancelledSql}
        ${companyDebtSql}
    `;
  }

  const { rows } = await postgres.query(sql, params);
  const lines: PartyStatementLine[] = (rows || []).map((r: any) => {
    const amount = parseFloat(r.amount || 0);
    const type = String(r.transaction_type || '');
    if (resolvedType === 'employee') {
      const sides = employeeStatementSides(type, amount);
      return {
        date: r.date,
        source: r.source,
        transaction_type: type,
        fiche_no: r.fiche_no,
        definition: r.definition,
        debit: sides.debit,
        credit: sides.credit,
        balance_after: 0,
        id: r.id,
      };
    }
    const sign = parseInt(r.sign || 0, 10);
    const debit = sign > 0 ? amount : 0;
    const credit = sign < 0 ? amount : 0;
    return {
      date: r.date,
      source: r.source,
      transaction_type: type,
      fiche_no: r.fiche_no,
      definition: r.definition,
      debit,
      credit,
      balance_after: 0,
      id: r.id,
    };
  });

  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Açılış balance: tarih aralığından önceki tüm hareketlerin toplamı
  // showCancelled/excludeCompanyDebts filtreleri ana sorgu ile aynı uygulanır
  // (running balance tutarlılığı için gerekli).
  // party_ledger_movements tablosu için: source_module='cash_delete' + CANCELLED_ transaction_type
  const opCancelledSql = showCancelled ? '' : ` AND source_module IS DISTINCT FROM 'cash_delete' AND transaction_type NOT LIKE 'CANCELLED_%'`;
  // cash_lines tablosu için: SADECE transaction_type LIKE 'CANCELLED_%' (source_module kolonu yok)
  const opCancelledCashLinesSql = showCancelled ? '' : ` AND transaction_type NOT LIKE 'CANCELLED_%'`;
  const opCompanyDebtSql = excludeCompanyDebts
    ? ` AND transaction_type NOT IN (${COMPANY_DEBT_TYPES.map((t) => `'${t}'`).join(',')})`
    : '';
  const opCompanyDebtCashLinesSql = excludeCompanyDebts
    ? ` AND transaction_type NOT IN (${COMPANY_DEBT_TYPES.map((t) => `'${t}'`).join(',')})`
    : '';

  let opening = 0;
  if (start) {
    const opSql =
      resolvedType === 'customer'
        ? `SELECT COALESCE(SUM(CASE WHEN is_cancelled THEN 0 ELSE total_gross END), 0) AS t
           FROM ${salesTable()} WHERE customer_id = $1::text::uuid AND date < $2::date`
        : resolvedType === 'supplier'
          ? `SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('ODEME','TAHSILAT_CIKIS','VIRMAN_CIKIS') THEN f_amount ELSE 0 END), 0) AS t
             FROM ${cashLinesTable()} WHERE customer_id = $1::text::uuid AND date < $2::date${opCancelledCashLinesSql}`
          : resolvedType === 'employee'
          ? `SELECT
              (SELECT COALESCE(SUM(CASE
                 WHEN transaction_type = 'MAAS_HAKKEDIS' THEN amount
                 WHEN transaction_type IN ('MAAS_ODEME','AVANS_ODEME') THEN -amount
                 ELSE 0 END), 0) FROM ${partyLedgerTable()}
               WHERE party_id = $1::text::uuid AND date < $2::date${opCancelledSql}${opCompanyDebtSql})
            + (SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('MAAS_ODEME','AVANS_ODEME') THEN -f_amount
                ELSE 0 END), 0) FROM ${cashLinesTable()} cl
              WHERE cl.party_id = $1::text::uuid AND cl.date < $2::date
                AND NOT EXISTS (
                  SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
                )
                ${opCancelledCashLinesSql}
                ${opCompanyDebtCashLinesSql}) AS t`
          : `SELECT
              (SELECT COALESCE(SUM(amount * sign), 0) FROM ${partyLedgerTable()}
               WHERE party_id = $1::text::uuid AND date < $2::date${opCancelledSql}${opCompanyDebtSql})
            + (SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('ORTAK_DAGITIM_KAR','ORTAK_SERMAYE_TAHSILAT','ORTAK_PARA_GIRIS','SERMAYE_TAHSILAT') THEN f_amount
                WHEN transaction_type IN ('ORTAK_DAGITIM_ZARAR','ORTAK_SERMAYE_CIKIS','ORTAK_SERMAYE_ODEME','ORTAK_PARA_CIKIS','SERMAYE_ODEME') THEN -f_amount
                ELSE 0 END), 0) FROM ${cashLinesTable()} cl
              WHERE cl.party_id = $1::text::uuid AND cl.date < $2::date
                AND NOT EXISTS (
                  SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
                )
                ${opCancelledCashLinesSql}
                ${opCompanyDebtCashLinesSql}) AS t`;
    const op = await postgres.query(opSql, [partyId, start]);
    opening = parseFloat(op?.rows?.[0]?.t || 0);
  }

  let running = opening;
  for (const line of lines) {
    const signed =
      resolvedType === 'employee'
        ? line.credit - line.debit
        : line.debit - line.credit;
    running += signed;
    line.balance_after = running;
  }

  return {
    party_id: partyId,
    card_type: resolvedType,
    opening_balance: opening,
    closing_balance: running,
    card_balance: currentBalance,
    rows: lines,
  };
}
