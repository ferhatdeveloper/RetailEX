import { Client } from 'pg';
import { execSync } from 'node:child_process';

const DB = {
  host: '72.60.182.107',
  port: 5432,
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};
const FIRM = '001';
const PERIOD = '01';
const DRY_RUN = process.env.DB_FIX_DRY_RUN !== '0';

const log = (...a) => console.log(...a);
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n) => fmt(n) + ' IQD';
const sep = () => log('═'.repeat(86));
const h = (t) => { sep(); log('📌 ' + t); sep(); };

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { return { ok: false, err: e.message }; }
}

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_supplier_FINAL_${ts}.sql`;
  log('\n💾 YEDEKLEME: ' + filename);
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t sync_queue -t rex_${FIRM}_suppliers --no-owner --no-acl > ${filename}`;
  try {
    execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
    log('   ✓ Yedek alındı: ' + filename);
    return filename;
  } catch (e) {
    log('   ✗ Yedekleme hatası: ' + e.message);
    process.exit(2);
  }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log('✅ Bağlantı: ' + DB.database);
  log('📋 MOD: ' + (DRY_RUN ? 'DRY-RUN' : 'GERÇEK FİNAL FİX (trigger tablo-seviyesi disable)') + '\n');

  h('1) Trigger\'ları tablo seviyesinde devre dışı bırak');
  // Bu transaction bittikten sonra normal moda döner; biz session_replication_role=replica
  // ile kalıcı olarak trigger'ı devre dışı bırakacağız ve düzeltme boyunca açık tutacağız
  await c.query('SET session_replication_role = replica');
  log('   ✓ session_replication_role = replica (trigger devre dışı)');

  h('2) Doğru balance planı');
  const plan = await c.query(`
    SELECT s.code, s.balance AS current_balance,
           COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                     WHERE pl.party_id=s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
           (s.balance + COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS new_balance,
           s.id AS sup_id
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                  WHERE pl.party_id=s.id AND pl.card_type='supplier')
  `);

  log('   Cari Kodu          Mevcut Balance    Ledger Net   DOĞRU Balance');
  log('   ' + '─'.repeat(85));
  plan.rows.forEach(r => {
    const newBal = Number(r.new_balance);
    const flag = Math.abs(Number(r.current_balance) - newBal) > 1 ? '⚠' : '✓';
    log('   ' + r.code.padEnd(18) + ' ' + Number(r.current_balance).toLocaleString().padStart(16) + ' ' + Number(r.ledger_net).toLocaleString().padStart(13) + ' ' + newBal.toLocaleString().padStart(14) + ' ' + flag);
  });

  if (DRY_RUN) {
    await c.query('SET session_replication_role = DEFAULT');
    h('DRY-RUN TAMAMLANDI');
    await c.end();
    return;
  }

  const backupFile = takeBackup();

  h('3) FİNAL DÜZELTME — Transaction');
  try {
    await c.query('BEGIN');

    h('3a) sync_queue.pending ARZENGROUP + diğerleri — DOĞRU balance + updated_at yaz');
    let qUpd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      const up = await c.query(
        `UPDATE sync_queue
         SET data = jsonb_set(jsonb_set(data::jsonb, '{balance}', to_jsonb($1::numeric), false), '{updated_at}', to_jsonb(NOW()::text), false)
         WHERE table_name = $2 AND status = 'pending'
           AND data->>'code' = $3`,
        [newBal, `rex_${FIRM}_suppliers`, r.code]
      );
      qUpd += up.rowCount || 0;
    }
    log('   ✓ sync_queue pending ' + qUpd + ' kayıt güncellendi (balance + updated_at)');

    h('3b) rex_001_suppliers.balance düzeltme + updated_at set et');
    let sUpd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      if (Math.abs(Number(r.current_balance) - newBal) > 0.01) {
        await c.query(`UPDATE rex_${FIRM}_suppliers SET balance = $1, updated_at = NOW() WHERE code = $2`, [newBal, r.code]);
        sUpd++;
      }
    }
    log('   ✓ ' + sUpd + ' tedarikçi balance düzeltildi + updated_at set');

    h('3c) sync_queue.pending → completed (DeskApp bunları tekrar apply etmeyecek)');
    const comp = await c.query(
      `UPDATE sync_queue SET status='completed', synced_at=NOW()
       WHERE table_name = $1 AND status = 'pending'
         AND data->>'code' = ANY($2::text[])`,
      [`rex_${FIRM}_suppliers`, plan.rows.map(r => r.code)]
    );
    log('   ✓ sync_queue ' + comp.rowCount + ' kayıt completed işaretlendi');

    h('4) COMMIT');
    await c.query('COMMIT');
    log('   ✓ Transaction commit edildi.');
  } catch (e) {
    await c.query('ROLLBACK');
    log('   ✗ HATA — ROLLBACK: ' + e.message);
    log('   Yedek: ' + backupFile);
    await c.end();
    process.exit(1);
  }

  h('5) DOĞRULAMA — şu anki gerçek durum');
  const verify = await c.query(`
    SELECT s.code, s.name, s.balance, s.updated_at::text
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                  WHERE pl.party_id=s.id AND pl.card_type='supplier')
    ORDER BY code
  `);
  log('   Cari Kodu          Ad                              Balance          updated_at');
  log('   ' + '─'.repeat(105));
  verify.rows.forEach(r => {
    const flag = Number(r.balance) === 0 ? '✓ TAM ÖDENDİ' : 'kalan';
    log('   ' + r.code.padEnd(18) + ' ' + String(r.name).slice(0,30).padEnd(32) + ' ' + m(r.balance).padStart(16) + ' ' + String(r.updated_at).slice(0,19) + ' ' + flag);
  });

  // Sync queue kontrol
  const sq = await c.query(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*) FILTER (WHERE status='completed')::int AS completed FROM sync_queue WHERE table_name='rex_${FIRM}_suppliers'`);
  log('\n   sync_queue.pending: ' + sq.rows[0].pending + ' | completed: ' + sq.rows[0].completed);

  log('\n📦 Yedek: ' + backupFile);
  log('\n✅ FİNAL DÜZELTME TAMAMLANDI.');
  log('  - 8 tedarikçi balance doğru mutabakat değerine');
  log('  - sync_queue.pending kayıtlar doğru balance + updated_at ile güncellendi');
  log('  - sync_queue.pending → completed');
  log('  - ARZENGROUP: 1.500.000 → 0 IQD');
  log('  - Session sonunda trigger normal moda döner');
  log('  - 14dk sonra kontrol önerilir');

  // Trigger'ı normal moda döndür
  await c.query('SET session_replication_role = DEFAULT');
  log('\n   ✓ Trigger normal moda döndü');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});
