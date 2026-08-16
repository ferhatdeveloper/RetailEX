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
 */
export async function getPartyStatement(
  partyId: string,
  cardType: PartyCardType,
  start?: string,
  end?: string,
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

  const params: any[] = [partyId];
  if (start) params.push(start);
  if (end) params.push(end);

  let sql = '';

  if (resolvedType === 'customer') {
    // Müşteri ekstresi: sales + cash_lines.customer_id
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
        AND s.is_cancelled = false${dateCond('s.date')}
    `;
  } else if (resolvedType === 'supplier') {
    // Tedarikçi: cash_lines (müşteri olarak bağlanmışsa) — mevcut supplier ekstresiyle hizalanır
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
      WHERE cl.customer_id = $1::text::uuid${dateCond('cl.date')}
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
      UNION ALL
      SELECT
        cl.date,
        'cash_line'::text AS source,
        cl.transaction_type,
        cl.fiche_no,
        cl.definition,
        cl.f_amount AS amount,
        CASE
          WHEN cl.transaction_type IN ('MAAS_ODEME','AVANS_ODEME','ORTAK_DAGITIM_KAR') THEN 1
          WHEN cl.transaction_type IN ('ORTAK_DAGITIM_ZARAR','AVANS_MAHSUP','ORTAK_SERMAYE_CIKIS') THEN -1
          ELSE 0
        END AS sign,
        cl.id
      FROM ${cashLinesTable()} cl
      WHERE cl.party_id = $1::text::uuid${dateCond('cl.date')}
        AND NOT EXISTS (
          SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
        )
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
  let opening = 0;
  if (start) {
    const opSql =
      resolvedType === 'customer'
        ? `SELECT COALESCE(SUM(CASE WHEN is_cancelled THEN 0 ELSE total_gross END), 0) AS t
           FROM ${salesTable()} WHERE customer_id = $1::text::uuid AND date < $2::date`
        : resolvedType === 'supplier'
          ? `SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('ODEME','TAHSILAT_CIKIS','VIRMAN_CIKIS') THEN f_amount ELSE 0 END), 0) AS t
             FROM ${cashLinesTable()} WHERE customer_id = $1::text::uuid AND date < $2::date`
          : resolvedType === 'employee'
          ? `SELECT
              (SELECT COALESCE(SUM(CASE
                 WHEN transaction_type = 'MAAS_HAKKEDIS' THEN amount
                 WHEN transaction_type IN ('MAAS_ODEME','AVANS_ODEME') THEN -amount
                 ELSE 0 END), 0) FROM ${partyLedgerTable()}
               WHERE party_id = $1::text::uuid AND date < $2::date)
             + (SELECT COALESCE(SUM(CASE
                 WHEN transaction_type IN ('MAAS_ODEME','AVANS_ODEME') THEN -f_amount
                 ELSE 0 END), 0) FROM ${cashLinesTable()} cl
               WHERE cl.party_id = $1::text::uuid AND cl.date < $2::date
                 AND NOT EXISTS (
                   SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
                 )) AS t`
          : `SELECT
              (SELECT COALESCE(SUM(amount * sign), 0) FROM ${partyLedgerTable()}
               WHERE party_id = $1::text::uuid AND date < $2::date)
             + (SELECT COALESCE(SUM(CASE
                 WHEN transaction_type IN ('ORTAK_DAGITIM_KAR') THEN f_amount
                 WHEN transaction_type IN ('ORTAK_DAGITIM_ZARAR','ORTAK_SERMAYE_CIKIS') THEN -f_amount
                 ELSE 0 END), 0) FROM ${cashLinesTable()} cl
               WHERE cl.party_id = $1::text::uuid AND cl.date < $2::date
                 AND NOT EXISTS (
                   SELECT 1 FROM ${partyLedgerTable()} pl2 WHERE pl2.cash_line_id = cl.id
                 )) AS t`;
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
