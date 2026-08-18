#!/usr/bin/env node
/**
 * FERHAT YILDIRIM Para Çıkışı — GERİ ALMA
 *
 * Bugün (2026-08-18 ~20:46) yapılan 79.485.000 IQD SERMAYE_ODEME işlemini geri alır.
 * Yalnızca bu spesifik cash_lines + ledger satırını siler, geri kalan her şey korunur.
 *
 * Tek transaction:
 *   1) cash_lines DELETE (id = a9f309a1-3bca-48cb-8184-9eed2c5d656c)
 *   2) party_ledger_movements DELETE (cash_line_id = a9f309a1...)
 *   3) cash_registers.balance += 79.485.000 (geri al)
 *   4) parties.balance += 79.485.000 (geri al)
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
  const CASH_LINE_ID = 'a9f309a1-3bca-48cb-8184-9eed2c5d656c';

  console.log('=== FERHAT Para Çıkışı — GERİ ALMA ===');
  console.log('Tutar:    79.485.000 IQD');
  console.log('Cash line: ' + CASH_LINE_ID);
  console.log('');

  // Önce: hedef satırı doğrula (var mı, doğru mu?)
  const { rows: cl } = await c.query(
    `SELECT id::text, fiche_no, amount, sign, transaction_type, party_id::text AS pid, definition
     FROM rex_001_01_cash_lines WHERE id = $1`,
    [CASH_LINE_ID],
  );
  if (!cl.length) {
    console.error('✗ cash_lines kaydı bulunamadı: ' + CASH_LINE_ID);
    process.exit(1);
  }
  const target = cl[0];
  console.log('Hedef cash_lines:');
  console.log('  id=' + target.id);
  console.log('  fiche=' + target.fiche_no);
  console.log('  tip=' + target.transaction_type);
  console.log('  amount=' + target.amount + ' sign=' + target.sign);
  console.log('  party_id=' + target.pid);
  console.log('  def="' + target.definition + '"');

  if (target.transaction_type !== 'ORTAK_SERMAYE_ODEME') {
    console.error('✗ Transaction type uyuşmuyor — beklenen ORTAK_SERMAYE_ODEME, bulunan: ' + target.transaction_type);
    process.exit(1);
  }
  if (target.pid !== PARTY_ID) {
    console.error('✗ Party uyuşmuyor — beklenen FERHAT, bulunan: ' + target.pid);
    process.exit(1);
  }
  if (parseFloat(target.amount) !== AMOUNT) {
    console.error('✗ Tutar uyuşmuyor — beklenen ' + AMOUNT + ', bulunan: ' + target.amount);
    process.exit(1);
  }

  await c.query('BEGIN');
  try {
    // 1) party_ledger_movements DELETE
    const { rowCount: ledgerDel } = await c.query(
      `DELETE FROM rex_001_01_party_ledger_movements WHERE cash_line_id = $1::text::uuid`,
      [CASH_LINE_ID],
    );
    console.log('✓ party_ledger_movements silindi: ' + ledgerDel + ' satır');

    // 2) cash_lines DELETE
    const { rowCount: cashDel } = await c.query(
      `DELETE FROM rex_001_01_cash_lines WHERE id = $1::text::uuid`,
      [CASH_LINE_ID],
    );
    console.log('✓ cash_lines silindi: ' + cashDel + ' satır');

    // 3) cash_registers.balance += 79485000
    const { rowCount: cashUpd } = await c.query(
      `UPDATE rex_001_cash_registers SET balance = balance + $1 WHERE id = $2`,
      [AMOUNT, REGISTER_ID],
    );
    console.log('✓ cash_registers.balance geri alındı (' + cashUpd + ' satır)');

    // 4) parties.balance += 79485000
    const { rowCount: partyUpd } = await c.query(
      `UPDATE rex_001_parties SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [AMOUNT, PARTY_ID],
    );
    console.log('✓ parties.balance geri alındı (' + partyUpd + ' satır)');

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
  console.log('Kasa yeni bakiye: ' + cash[0].balance + ' (beklenen -140673534.45)');

  const { rows: party } = await c.query(`SELECT name, balance FROM rex_001_parties WHERE id = $1`, [PARTY_ID]);
  console.log('FERHAT yeni bakiye: ' + party[0].balance + ' (beklenen -22729125.00)');

  const { rows: ledger } = await c.query(`
    SELECT COALESCE(SUM(amount*sign), 0) AS t
    FROM rex_001_01_party_ledger_movements
    WHERE party_id::text = $1 AND COALESCE(source_module,'')<>'cash_delete'
  `, [PARTY_ID]);
  console.log('Ledger toplamı:    ' + ledger[0].t);
  console.log('Tutarlı:           ' + (Math.abs(parseFloat(ledger[0].t) - parseFloat(party[0].balance)) < 0.01 ? '✓' : '✗ UYUMSUZ'));

  await c.end();
}).catch(e => { console.error(e.message); process.exit(1); });
