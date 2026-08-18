#!/usr/bin/env node
/**
 * FERHAT YILDIRIM (%75 ortak) — 79.485.000 IQD Para Çıkışı (Sermaye İadesi)
 *
 * Uygulama:
 *   1) cash_lines INSERT (ORTAK_SERMAYE_ODEME, sign=-1, kasa -79.485.000)
 *   2) party_ledger_movements INSERT (SERMAYE_ODEME, sign=-1)
 *   3) cash_registers.balance -= 79.485.000
 *   4) parties.balance -= 79.485.000
 *
 * Tek transaction — hata olursa tüm adımlar ROLLBACK.
 */

import('pg').then(async ({default: pg}) => {
  const m = await import('../database/scripts/pg-endpoint-parse.mjs');
  const d = m.loadRemotePgDefaults();
  const c = new pg.Client({
    host: d.host, port: Number(d.port), user: d.user, password: d.password,
    database: 'aqua_beauty', connectionTimeoutMillis: 15000,
  });
  await c.connect();

  const PARTY_ID = '678f449b-36a2-4259-b5c6-0a502e2ec07d';
  const AMOUNT = 79485000;
  const REGISTER_ID = '00000000-0000-0000-0000-000000000001';
  const FIRM = '001';
  const PERIOD = '01';
  const FICHE = 'ORT-SER-2026-08-002';
  const DEF = 'FERHAT YILDIRIM — şahsi sermaye iadesi (haricen çekim)';

  console.log('=== FERHAT YILDIRIM — Para Çıkışı ===');
  console.log('Tutar:    79.485.000 IQD');
  console.log('Kasa:     MERKEZ KASA');
  console.log('Parti:    FERHAT YILDIRIM (pay %75)');
  console.log('Tip:      ORTAK_SERMAYE_ODEME / SERMAYE_ODEME');
  console.log('');

  await c.query('BEGIN');
  try {
    // 1) cash_lines INSERT
    const { rows: cashLine } = await c.query(
      `INSERT INTO rex_001_01_cash_lines (
         firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
         definition, transaction_type, party_id,
         currency_code, exchange_rate, f_amount
       ) VALUES (
         $1, $2, $3, $4, NOW(), $5, -1,
         $6, 'ORTAK_SERMAYE_ODEME', $7,
         'IQD', 1, $5
       ) RETURNING id::text AS id`,
      [FIRM, PERIOD, REGISTER_ID, FICHE, AMOUNT, DEF, PARTY_ID],
    );
    const cashLineId = cashLine[0].id;
    console.log('✓ cash_lines INSERT: id=' + cashLineId);

    // 2) party_ledger_movements INSERT
    await c.query(
      `INSERT INTO rex_001_01_party_ledger_movements (
         firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
         date, amount, sign, definition, source_module, source_id, cash_line_id
       ) VALUES (
         $1, $2, $3, 'partner', 0, 'SERMAYE_ODEME',
         NOW(), $4, -1, $5, 'partner_cash', $6, $6
       )`,
      [FIRM, PERIOD, PARTY_ID, AMOUNT, DEF, cashLineId],
    );
    console.log('✓ party_ledger_movements INSERT');

    // 3) cash_registers.balance
    const { rowCount: cashUpd } = await c.query(
      `UPDATE rex_001_cash_registers SET balance = balance - $1 WHERE id = $2`,
      [AMOUNT, REGISTER_ID],
    );
    console.log('✓ cash_registers.balance güncellendi (' + cashUpd + ' satır)');

    // 4) parties.balance
    const { rowCount: partyUpd } = await c.query(
      `UPDATE rex_001_parties SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
      [AMOUNT, PARTY_ID],
    );
    console.log('✓ parties.balance güncellendi (' + partyUpd + ' satır)');

    await c.query('COMMIT');
    console.log('\n✓ COMMIT başarılı');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('✗ ROLLBACK: ' + err.message);
    process.exit(1);
  }

  // Doğrulama
  console.log('\n=== DOĞRULAMA ===');
  const { rows: cash } = await c.query(`SELECT balance FROM rex_001_cash_registers WHERE id = $1`, [REGISTER_ID]);
  console.log('Kasa yeni bakiye: ' + cash[0].balance);

  const { rows: party } = await c.query(`SELECT name, balance FROM rex_001_parties WHERE id = $1`, [PARTY_ID]);
  console.log('FERHAT yeni bakiye: ' + party[0].balance);

  // Ledger toplamı vs bakiye kontrol
  const { rows: ledger } = await c.query(`
    SELECT COALESCE(SUM(amount*sign), 0) AS t
    FROM rex_001_01_party_ledger_movements
    WHERE party_id::text = $1 AND COALESCE(source_module,'')<>'cash_delete'
  `, [PARTY_ID]);
  console.log('Ledger toplamı:    ' + ledger[0].t);
  console.log('Tutarlı:           ' + (Math.abs(parseFloat(ledger[0].t) - parseFloat(party[0].balance)) < 0.01 ? '✓' : '✗ UYUMSUZ'));

  await c.end();
}).catch(e => { console.error(e.message); process.exit(1); });
