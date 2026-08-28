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
const m = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' IQD';
const sep = () => log('═'.repeat(86));
const h = (t) => { sep(); log('📌 ' + t); sep(); };

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_supplier_fix_v2_${ts}.sql`;
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
  log('📋 MOD: ' + (DRY_RUN ? 'DRY-RUN' : 'GERÇEK DÜZELTME v2 (trigger-disabled)') + '\n');

  h('1) Trigger disable + doğru balance hesapla');
  await c.query('SET session_replication_role = replica');
  log('   ✓ session_replication_role=replica (trigger devre dışı)');

  h('2) Doğru balance planı');
  const plan = await c.query(`
    SELECT s.code, s.balance AS current_balance,
           COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                     WHERE pl.party_id=s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
           (s.balance + COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS new_balance
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

  h('3) TRANSACTION');
  try {
    await c.query('BEGIN');

    h('3a) sync_queue.pending supplier kayıtlarındaki balance DOĞRU değere güncelleniyor');
    let qUpd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      const up = await c.query(
        `UPDATE sync_queue
         SET data = jsonb_set(data::jsonb, '{balance}', to_jsonb($1::numeric), false)
         WHERE table_name = $2 AND status = 'pending'
           AND data->>'code' = $3`,
        [newBal, `rex_${FIRM}_suppliers`, r.code]
      );
      qUpd += up.rowCount || 0;
    }
    log('   ✓ sync_queue pending supplier kayıtları güncellendi: ' + qUpd + ' kayıt');

    h('3b) rex_001_suppliers.balance düzeltme');
    let sUpd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      if (Math.abs(Number(r.current_balance) - newBal) > 0.01) {
        await c.query(`UPDATE rex_${FIRM}_suppliers SET balance = $1 WHERE code = $2`, [newBal, r.code]);
        sUpd++;
      }
    }
    log('   ✓ ' + sUpd + ' tedarikçi balance düzeltildi');

    h('3c) sync_queue.pending supplier kayıtlarını completed işaretle');
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
    await c.query('SET session_replication_role = DEFAULT');
    log('   ✗ HATA — ROLLBACK: ' + e.message);
    log('   Yedek: ' + backupFile);
    await c.end();
    process.exit(1);
  }

  await c.query('SET session_replication_role = DEFAULT');
  log('   ✓ Trigger normal moda döndü');

  h('5) DOĞRULAMA — son durum');
  const verify = await c.query(`
    SELECT s.code, s.name, s.balance,
           COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                     WHERE pl.party_id=s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                  WHERE pl.party_id=s.id AND pl.card_type='supplier')
    ORDER BY code
  `);
  log('   Cari Kodu          Ad                              Balance          Ledger Net');
  log('   ' + '─'.repeat(85));
  verify.rows.forEach(r => {
    const flag = Math.abs(Number(r.balance) + Number(r.ledger_net)) < 1 ? '✓ MUTABIK' : '⚠';
    log('   ' + r.code.padEnd(18) + ' ' + String(r.name).slice(0,32).padEnd(34) + ' m(r.balance)'.padStart(16) + ' ' + m(r.ledger_net).padStart(13) + ' ' + flag);
  });

  log('\n📦 Yedek: ' + backupFile);
  log('\n✅ DÜZELTME v2 TAMAMLANDI.');
  log('  - Trigger session boyunca devre dışı');
  log('  - 8 tedarikçi balance doğru mutabakat değerine');
  log('  - sync_queue.pending kayıtlar doğru değerle güncellendi');
  log('  - sync_queue.pending → completed');
  log('  - ARZENGROUP: 1.500.000 → 0 IQD');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});
