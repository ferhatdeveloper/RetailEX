#!/usr/bin/env node
/**
 * AQUA — Mevcut CH_ODEME (tedarikçi ödemeleri) satırlarını ortaklara pay oranına
 * göre dağıtır. Yeni "Ortak adına ödeme" özelliği öncesi yapılmış ödemeler için
 * geriye dönük CH_ODEME_PARTNER ledger kayıtları açar; party_id olmayan CH_ODEME
 * satırlarına partner dağıtımı ekler.
 *
 * Dağıtım kuralı:
 *   her CH_ODEME satırı tutarı → aktif ortakların share_pct oranına göre bölünür.
 *   AQUA'da ortak listesi rex_001_parties (card_type='partner', share_pct>0) içinden alınır.
 *
 * Önemli:
 *  - idempotent: cash_line_id zaten CH_ODEME_PARTNER ledger kaydına bağlıysa atlanır.
 *  - party bakiyeleri delta ile güncellenir.
 *  - cash_lines.party_id NULL kalır (geriye dönük orak ID kavramı yok);
 *    sadece party_ledger_movements yazılır.
 *
 * Kullanım:
 *   node scripts/aqua-beauty-distribute-supplier-payments.mjs --dry-run   # önizleme
 *   node scripts/aqua-beauty-distribute-supplier-payments.mjs --apply     # uygula
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
  const cash = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const parties = `rex_${FIRM}_parties`;

  console.log('=== AQUA — Tedarikçi Ödemelerini Ortaklara Dağıt ===');
  console.log(`DB:      ${DB}`);
  console.log(`Firma:   ${FIRM}  Dönem: ${PERIOD}`);
  console.log(`Mod:     ${MODE}`);
  console.log('');

  // Aktif ortaklar (share_pct > 0)
  const { rows: ortakRows } = await c.query(
    `SELECT id::text AS id, code, name, share_pct
       FROM ${parties}
      WHERE card_type = 'partner' AND COALESCE(share_pct, 0) > 0 AND is_active IS NOT FALSE
      ORDER BY code`
  );
  if (!ortakRows.length) {
    console.log('UYARI: Aktif ortak bulunamadı — dağıtım yapılamaz.');
    await c.end();
    return;
  }
  const totalPct = ortakRows.reduce((s, o) => s + Number(o.share_pct || 0), 0);
  console.log(`Ortaklar (${ortakRows.length}, toplam %${totalPct.toFixed(2)}):`);
  for (const o of ortakRows) {
    console.log(`  - ${o.code} — ${o.name} (%${o.share_pct})`);
  }
  console.log('');

  // Tedarikçi ödemeleri: cash_lines.transaction_type='CH_ODEME', customer_id bir tedarikçiye bağlı
  // NOT: geriye dönük bu satırlarda party_id NULL. idareye göre dağıtacağız.
  // Sadece henüz bu cash_line için CH_ODEME_PARTNER ledger kaydı yazılmamış olanları al.
  const { rows: payRows } = await c.query(
    `SELECT cl.id::text AS id, cl.amount::numeric AS amount, cl.date, cl.definition,
            cl.customer_id::text AS supplier_id, cl.register_id::text AS register_id,
            cl.fiche_no
       FROM ${cash} cl
      WHERE cl.transaction_type = 'CH_ODEME'
        AND COALESCE(cl.customer_id::text, '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM ${ledger} pl
           WHERE pl.cash_line_id = cl.id
             AND pl.transaction_type IN ('CH_ODEME_PARTNER','CANCELLED_CH_ODEME_PARTNER')
        )
      ORDER BY cl.date ASC, cl.created_at ASC`
  );

  if (!payRows.length) {
    console.log('Dağıtılacak tedarikçi ödemesi bulunamadı (hepsi zaten işlenmiş veya CH_ODEME kaydı yok).');
    await c.end();
    return;
  }
  console.log(`Dağıtılacak CH_ODEME satırı: ${payRows.length}`);
  console.log('');

  // Toplam etki
  let grandTotal = 0;
  for (const p of payRows) {
    const amt = Math.round(Number(p.amount) * 100) / 100;
    grandTotal += amt;
  }
  console.log(`Toplam tutar: ${grandTotal.toLocaleString('en-US')} IQD`);

  // Planlama
  const plan = [];
  for (const p of payRows) {
    const amt = Math.round(Number(p.amount) * 100) / 100;
    for (const o of ortakRows) {
      const share = (amt * Number(o.share_pct || 0)) / totalPct;
      const shareRound = Math.round(share * 100) / 100;
      plan.push({
        cashLineId: p.id,
        date: p.date,
        supplierId: p.supplier_id,
        amount: amt,
        partyId: o.id,
        partyCode: o.code,
        partyName: o.name,
        sharePct: Number(o.share_pct || 0),
        shareAmount: shareRound,
      });
    }
  }

  console.log('');
  console.log('İlk 8 plan örneği:');
  for (const r of plan.slice(0, 8)) {
    console.log(`  ${r.cashLineId.slice(0, 8)} | ${r.date.toISOString().slice(0, 10)} | ${r.shareAmount.toLocaleString('en-US')} → ${r.partyCode} (${r.partyName}) %${r.sharePct}`);
  }
  if (plan.length > 8) console.log(`  ... ve ${plan.length - 8} satır daha.`);

  if (MODE === 'dry-run') {
    console.log('');
    console.log('--dry-run: Hiçbir şey yazılmadı. Uygulamak için --apply ekleyin.');
    await c.end();
    return;
  }

  // Uygula
  await c.query('BEGIN');
  try {
    for (const r of plan) {
      // ledger INSERT (CH_ODEME_PARTNER, sign=-1, source_module='legacy_migration')
      await c.query(
        `INSERT INTO ${ledger} (
           firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
           date, amount, sign, definition, source_module, source_id, cash_line_id
         ) VALUES (
           $1, $2, $3::uuid, 'partner', 0, 'CH_ODEME_PARTNER',
           $4::date, $5::numeric, -1, $6, 'legacy_migration', $7::uuid, $7::uuid
         )`,
        [
          FIRM,
          PERIOD,
          r.partyId,
          r.date,
          r.shareAmount.toString(),
          `Geriye dönük dağıtım: tedarikçi ödemesi (${r.sharePct}% pay)`,
          r.cashLineId,
        ]
      );
      // parties.balance düşür
      await c.query(
        `UPDATE ${parties} SET balance = balance - $1::numeric, updated_at = NOW() WHERE id = $2::uuid`,
        [r.shareAmount.toString(), r.partyId]
      );
    }
    await c.query('COMMIT');
    console.log('');
    console.log(`Uygulandı: ${plan.length} ledger satırı + parties.balance güncellemeleri.`);
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Hata — ROLLBACK:', err.message);
    throw err;
  } finally {
    await c.end();
  }
});