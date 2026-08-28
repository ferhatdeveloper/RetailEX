#!/usr/bin/env node
/**
 * AQUA — Tedarikçi bakiyelerini (henüz ödenmemiş borçlar) ortaklara
 * pay oranına göre dağıtır. Geriye dönük "açılış" kaydı.
 *
 * Mantık:
 *   her suppliers.balance > 0 olan kart için:
 *     pay = (tutar * share_pct) / toplam_pay
 *     party_ledger_movements INSERT (CH_ODEME_PARTNER, sign=-1, source_module='opening_supplier')
 *     parties.balance -= pay
 *
 * İdempotent: aynı supplier + party için 'opening_supplier' kaydı zaten varsa atlanır.
 * Tedarikçiye ödeme yapıldığında yeni CH_ODEME_PARTNER kaydı ile bakiye gerçek zamanlı düşer.
 *
 * Kullanım:
 *   node scripts/aqua-beauty-distribute-supplier-balances.mjs --dry-run
 *   node scripts/aqua-beauty-distribute-supplier-balances.mjs --apply
 */

import('pg').then(async ({ default: pg }) => {
  const m = await import('../database/scripts/pg-endpoint-parse.mjs');
  const d = m.loadRemotePgDefaults();
  const DB = process.env.AQUA_DB || 'aqua_beauty';
  const FIRM = process.env.AQUA_FIRM || '001';
  const PERIOD = process.env.AQUA_PERIOD || '01';
  const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
  const SKIP_TED029 = process.argv.includes('--skip-ted-029');

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
  const suppliers = `rex_${FIRM}_suppliers`;

  console.log('=== AQUA — Tedarikçi Bakiyelerini Ortaklara Dağıt ===');
  console.log(`DB:    ${DB}`);
  console.log(`Mod:   ${MODE}`);
  console.log(`TED-029: ${SKIP_TED029 ? 'HARIÇ' : 'DAHİL'}`);
  console.log('');

  // Aktif ortaklar
  const { rows: ortakRows } = await c.query(
    `SELECT id::text AS id, code, name, share_pct::numeric AS share_pct, balance::numeric AS balance
       FROM ${parties}
      WHERE card_type = 'partner' AND COALESCE(share_pct, 0) > 0 AND is_active IS NOT FALSE
      ORDER BY code`
  );
  if (!ortakRows.length) {
    console.log('UYARI: Aktif ortak bulunamadı.');
    await c.end();
    return;
  }
  const totalPct = ortakRows.reduce((s, o) => s + Number(o.share_pct), 0);
  console.log(`Ortaklar (${ortakRows.length}, toplam %${totalPct.toFixed(2)}):`);
  for (const o of ortakRows) {
    console.log(`  - ${o.code} — ${o.name} (%${o.share_pct}) mevcut bakiye: ${Number(o.balance).toLocaleString('en-US')}`);
  }
  console.log('');

  // Tedarikçi bakiyeleri
  const skipFilter = SKIP_TED029 ? "AND code <> 'TED-029'" : '';
  const { rows: supRows } = await c.query(
    `SELECT id::text AS id, code, name, balance::numeric AS balance
       FROM ${suppliers}
      WHERE COALESCE(balance, 0) > 0 ${skipFilter}
      ORDER BY balance DESC`
  );
  if (!supRows.length) {
    console.log('Bakiyesi > 0 olan tedarikçi yok.');
    await c.end();
    return;
  }
  const totalDebt = supRows.reduce((s, r) => s + Number(r.balance), 0);
  console.log(`Tedarikçiler (${supRows.length} kart, toplam borç): ${totalDebt.toLocaleString('en-US')}`);
  console.log('');
  console.log('Tedarikçi kartları:');
  for (const r of supRows) {
    console.log(`  ${r.code} — ${r.name}: ${Number(r.balance).toLocaleString('en-US')}`);
  }
  console.log('');

  // Plan
  const plan = [];
  for (const sup of supRows) {
    const amt = Math.round(Number(sup.balance) * 100) / 100;
    for (const o of ortakRows) {
      const raw = (amt * Number(o.share_pct)) / totalPct;
      const share = Math.round(raw * 100) / 100;
      plan.push({
        supplierId: sup.id,
        supplierCode: sup.code,
        supplierName: sup.name,
        supplierBalance: amt,
        partyId: o.id,
        partyCode: o.code,
        partyName: o.name,
        sharePct: Number(o.share_pct),
        shareAmount: share,
      });
    }
  }

  console.log('İlk 12 dağıtım planı:');
  for (const r of plan.slice(0, 12)) {
    console.log(
      `  ${r.supplierCode.padEnd(8)} ${r.supplierName.padEnd(28)} ${r.supplierBalance.toLocaleString('en-US').padStart(15)} | %${r.sharePct} ${r.partyCode.padEnd(8)} → ${r.shareAmount.toLocaleString('en-US').padStart(15)}`,
    );
  }
  if (plan.length > 12) console.log(`  ... ve ${plan.length - 12} satır daha.`);
  console.log('');

  // Toplam pay kontrol
  const partyTotals = new Map();
  for (const r of plan) {
    partyTotals.set(r.partyId, (partyTotals.get(r.partyId) || 0) + r.shareAmount);
  }
  console.log('Ortak başına dağıtım toplamı:');
  for (const o of ortakRows) {
    const t = partyTotals.get(o.id) || 0;
    console.log(`  ${o.code}: ${t.toLocaleString('en-US')} (yeni bakiye: ${(Number(o.balance) - t).toLocaleString('en-US')})`);
  }
  console.log(`  TOPLAM: ${(Array.from(partyTotals.values()).reduce((s, v) => s + v, 0)).toLocaleString('en-US')} / Tedarikçi toplamı: ${totalDebt.toLocaleString('en-US')}`);
  console.log('');

  if (MODE === 'dry-run') {
    console.log('--dry-run: Hiçbir şey yazılmadı. Uygulamak için --apply ekleyin.');
    await c.end();
    return;
  }

  // Uygula
  console.log('Uygulama başlıyor...');
  await c.query('BEGIN');
  try {
    let written = 0;
    let skipped = 0;
    for (const r of plan) {
      // İdempotent: aynı supplier + party + source_module için zaten kayıt var mı?
      const exist = await c.query(
        `SELECT 1 FROM ${ledger}
          WHERE party_id = $1::uuid
            AND source_module = 'opening_supplier'
            AND source_id = $2::uuid
          LIMIT 1`,
        [r.partyId, r.supplierId]
      );
      if (exist.rows.length) {
        skipped++;
        continue;
      }
      await c.query(
        `INSERT INTO ${ledger} (
           firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
           date, amount, sign, definition, source_module, source_id, cash_line_id
         ) VALUES (
           $1, $2, $3::uuid, 'partner', 0, 'CH_ODEME_PARTNER',
           CURRENT_DATE, $4::numeric, -1, $5, 'opening_supplier', $6::uuid, $6::uuid
         )`,
        [
          FIRM,
          PERIOD,
          r.partyId,
          r.shareAmount.toString(),
          `Tedarikçi bakiyesi payı: ${r.supplierCode} ${r.supplierName} — %${r.sharePct} (açılış)`,
          r.supplierId,
        ]
      );
      await c.query(
        `UPDATE ${parties} SET balance = balance - $1::numeric, updated_at = NOW() WHERE id = $2::uuid`,
        [r.shareAmount.toString(), r.partyId]
      );
      written++;
    }
    await c.query('COMMIT');
    console.log(`✓ Yazılan ledger satırı: ${written} (atlanan: ${skipped})`);
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('HATA — ROLLBACK:', err.message);
    throw err;
  } finally {
    await c.end();
  }
});