#!/usr/bin/env node
/**
 * AQUA — Tedarikçi bakiyesi dağıtımını geri al.
 * source_module='opening_supplier' ile yazılmış 40 CH_ODEME_PARTNER ledger satırını
 * siler ve parties.balance'ı geri artırır (ters sign).
 *
 * Idempotent: ledger'da 'opening_supplier' kaydı yoksa no-op.
 *
 * Kullanım:
 *   node scripts/aqua-beauty-distribute-supplier-balances-undo.mjs --dry-run
 *   node scripts/aqua-beauty-distribute-supplier-balances-undo.mjs --apply
 */

import('pg').then(async ({ default: pg }) => {
  const m = await import('../database/scripts/pg-endpoint-parse.mjs');
  const d = m.loadRemotePgDefaults();
  const DB = process.env.AQUA_DB || 'aqua_beauty';
  const FIRM = process.env.AQUA_FIRM || '001';
  const PERIOD = process.env.AQUA_PERIOD || '01';
  const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';

  const c = new pg.Client({
    host: d.host,
    port: Number(d.port),
    user: d.user,
    password: d.password,
    database: DB,
    connectionTimeoutMillis: 15000,
  });
  await c.connect();

  const ledger = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;
  const parties = `rex_${FIRM}_parties`;

  console.log('=== AQUA — Açılış Dağıtımı Geri Al ===');
  console.log(`DB:  ${DB}`);
  console.log(`Mod: ${MODE}`);
  console.log('');

  // Silinecek kayıtlar
  const { rows: rows } = await c.query(
    `SELECT id::text, party_id::text AS party_id, amount::numeric AS amount, sign, definition
       FROM ${ledger}
      WHERE source_module = 'opening_supplier'
        AND transaction_type = 'CH_ODEME_PARTNER'
      ORDER BY party_id, amount`
  );

  if (!rows.length) {
    console.log('Geri alınacak kayıt yok (hepsi zaten silinmiş veya hiç uygulanmamış).');
    await c.end();
    return;
  }

  console.log(`Geri alınacak ledger satırı: ${rows.length}`);
  console.log('');

  // Önizleme: party başına geri alınacak toplam
  const byParty = new Map();
  for (const r of rows) {
    const restore = Math.round(Number(r.amount) * Number(r.sign) * 100) / 100;
    byParty.set(r.party_id, (byParty.get(r.party_id) || 0) + restore);
  }
  const { rows: pt } = await c.query(
    `SELECT code, balance::numeric FROM ${parties}
      WHERE id::text = ANY($1)
      ORDER BY code`,
    [Array.from(byParty.keys())]
  );
  for (const r of pt) {
    const restore = byParty.get(r.code === 'ORT-001'
      ? rows.find(x => true)?.party_id
      : r.code);
    // party_id ile eşle
    const partyId = pt.rows ? '' : '';
    const matched = rows.find(x => {
      const partyCode = pt.find(p => p.id?.toString() === x.party_id)?.code;
      return partyCode === r.code;
    });
  }

  // Basit önizleme: party_id'ye göre toplam restore
  console.log('Geri alınacak bakiye değişimi (party_id kısmi):');
  for (const [pid, restore] of byParty.entries()) {
    console.log(`  party_id ${pid.slice(0, 8)}: parties.balance += ${restore.toLocaleString('en-US')}`);
  }
  console.log('');

  if (MODE === 'dry-run') {
    console.log('--dry-run: Hiçbir şey yazılmadı. Uygulamak için --apply ekleyin.');
    await c.end();
    return;
  }

  console.log('Geri alma başlıyor...');
  await c.query('BEGIN');
  try {
    let deleted = 0;
    for (const r of rows) {
      // Ledger satırı sign=-1, amount=ABS(tutar). Geri alma: balance += ABS(amount)
      const restore = Math.round(Math.abs(Number(r.amount)) * 100) / 100;
      await c.query(
        `UPDATE ${parties} SET balance = balance + $1::numeric, updated_at = NOW() WHERE id = $2::uuid`,
        [restore.toString(), r.party_id]
      );
      await c.query(`DELETE FROM ${ledger} WHERE id = $1::uuid`, [r.id]);
      deleted++;
    }
    await c.query('COMMIT');
    console.log(`✓ Silinen ledger satırı: ${deleted}`);
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('HATA — ROLLBACK:', err.message);
    throw err;
  } finally {
    await c.end();
  }
});