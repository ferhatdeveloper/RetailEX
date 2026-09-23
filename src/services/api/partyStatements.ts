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
import { deleteKasaIslemi } from './kasa';
import {
  invalidateYearNetSyncCache,
  PERIOD_SHARE_REMOVED_MODULE,
} from './partiesPartners';
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
  /** Kasa satırı varsa silmede deleteKasaIslemi için */
  cash_line_id?: string | null;
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
  const cancelledLedgerSql = showCancelled ? '' : ` AND pl.source_module IS DISTINCT FROM 'cash_delete' AND pl.source_module IS DISTINCT FROM 'period_net_share_removed' AND pl.transaction_type NOT LIKE 'CANCELLED_%'`;

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
        pl.id,
        pl.cash_line_id
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
        cl.id,
        cl.id AS cash_line_id
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
    const cashLineId = r.cash_line_id != null ? String(r.cash_line_id) : null;
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
        cash_line_id: cashLineId,
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
      cash_line_id: cashLineId,
    };
  });

  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Açılış balance: tarih aralığından önceki tüm hareketlerin toplamı
  // showCancelled/excludeCompanyDebts filtreleri ana sorgu ile aynı uygulanır
  // (running balance tutarlılığı için gerekli).
  // party_ledger_movements tablosu için: source_module='cash_delete' + CANCELLED_ transaction_type
  const opCancelledSql = showCancelled ? '' : ` AND source_module IS DISTINCT FROM 'cash_delete' AND source_module IS DISTINCT FROM 'period_net_share_removed' AND transaction_type NOT LIKE 'CANCELLED_%'`;
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

/**
 * Ekstre satırını siler.
 * - Kasa bağlıysa: kasa bakiyesi + party bakiyesi deleteKasaIslemi ile geri alınır;
 *   bağlı party_ledger satırları da temizlenir (hayalet ekstre satırı kalmasın).
 * - Yalnızca ledger (kâr dağıtımı vb.): party bakiyesi amount×sign tersine çevrilir;
 *   dönem payı satırları sync’in yeniden yazmaması için tombstone bırakılır.
 */
export async function deletePartyStatementLine(line: PartyStatementLine): Promise<void> {
  const tx = String(line.transaction_type || '').toUpperCase();
  if (tx.startsWith('CANCELLED_')) {
    throw new Error('İptal kaydı silinemez');
  }
  const rowId = String(line.id || '').trim();
  if (!rowId) throw new Error('Satır kimliği yok');

  await ensurePartyPeriodTables();
  const firmNr = firm();
  const partiesTbl = `rex_${firmNr}_parties`;
  const ledgerTbl = partyLedgerTable();
  const distItemsTbl = `rex_${firmNr}_${period()}_partner_distribution_items`;

  let cashLineId = String(line.cash_line_id || '').trim();
  let ledgerId = line.source === 'party_ledger' ? rowId : '';

  if (line.source === 'cash_line') {
    cashLineId = rowId;
  }

  if (ledgerId && !cashLineId) {
    const { rows } = await postgres.query(
      `SELECT id, cash_line_id, amount, sign, party_id, transaction_type, source_module, source_id, definition, date
       FROM ${ledgerTbl} WHERE id = $1::text::uuid LIMIT 1`,
      [ledgerId],
    );
    const led = rows?.[0];
    if (!led) throw new Error('Hareket bulunamadı');
    cashLineId = String(led.cash_line_id || '').trim();
  }

  if (cashLineId) {
    const { rows: cashRows } = await postgres.query(
      `SELECT id FROM ${cashLinesTable()} WHERE id = $1::text::uuid LIMIT 1`,
      [cashLineId],
    );
    if (cashRows?.[0]?.id) {
      await deleteKasaIslemi(cashLineId);
      await postgres.query(`DELETE FROM ${ledgerTbl} WHERE cash_line_id = $1::text::uuid`, [cashLineId]);
      invalidateYearNetSyncCache();
      return;
    }
    // Kasa satırı yok (önceden silinmiş): hayalet ledger’ı temizle, bakiyeyi tekrar çevirme
    await postgres.query(
      `DELETE FROM ${ledgerTbl}
       WHERE cash_line_id = $1::text::uuid OR id = $2::text::uuid`,
      [cashLineId, rowId],
    );
    invalidateYearNetSyncCache();
    return;
  }

  // Ledger-only (KAR_DAGITIMI / ZARAR_DAGITIMI / hakkediş vb.)
  const { rows: ledRows } = await postgres.query(
    `SELECT id, amount, sign, party_id, transaction_type, source_module, source_id, definition, date
     FROM ${ledgerTbl} WHERE id = $1::text::uuid LIMIT 1`,
    [rowId],
  );
  const led = ledRows?.[0];
  if (!led) throw new Error('Hareket bulunamadı');
  const ledTx = String(led.transaction_type || '').toUpperCase();
  if (ledTx.startsWith('CANCELLED_') || String(led.source_module || '') === 'cash_delete') {
    throw new Error('İptal kaydı silinemez');
  }

  const amt = Math.abs(parseFloat(String(led.amount || 0)) || 0);
  const sign = parseInt(String(led.sign || 0), 10) || 0;
  const partyId = String(led.party_id || '');
  const sourceModule = String(led.source_module || '');
  const balanceDelta = -(amt * sign);

  await postgres.query('BEGIN');
  try {
    if (partyId && balanceDelta !== 0) {
      await postgres.query(
        `UPDATE ${partiesTbl}
         SET balance = COALESCE(balance, 0) + $1::text::numeric, updated_at = NOW()
         WHERE id = $2::text::uuid`,
        [balanceDelta.toString(), partyId],
      );
    }

    // Dağıtım kalemi bağlantısını temizle (tüm dağıtımı ters çevirme — yalnızca bu satır)
    try {
      await postgres.query(
        `UPDATE ${distItemsTbl}
         SET party_ledger_movement_id = NULL
         WHERE party_ledger_movement_id = $1::text::uuid`,
        [rowId],
      );
    } catch {
      /* tablo yoksa yoksay */
    }

    if (sourceModule === 'period_net_share') {
      // Tombstone: sync aynı ayı yeniden yazmasın; tutar 0 — bakiye/ekstre etkilemesin
      await postgres.query(
        `UPDATE ${ledgerTbl}
         SET transaction_type = $1::text,
             source_module = $2::text,
             definition = $3::text,
             amount = 0,
             sign = 0
         WHERE id = $4::text::uuid`,
        [
          `CANCELLED_${ledTx || 'KAR_DAGITIMI'}`,
          PERIOD_SHARE_REMOVED_MODULE,
          `İptal: ${led.definition || ''}`.trim(),
          rowId,
        ],
      );
    } else {
      await postgres.query(`DELETE FROM ${ledgerTbl} WHERE id = $1::text::uuid`, [rowId]);
    }

    await postgres.query('COMMIT');
  } catch (err) {
    try {
      await postgres.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }

  invalidateYearNetSyncCache();
}
