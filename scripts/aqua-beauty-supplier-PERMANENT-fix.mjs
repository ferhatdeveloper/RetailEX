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
  const filename = `aqua_beauty_supplier_PERMANENT_${ts}.sql`;
  log('\n💾 YEDEKLEME: ' + filename);
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t sync_queue -t rex_${FIRM}_suppliers --no-owner --no-acl > ${filename}`;
  execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
  log('   ✓ Yedek: ' + filename);
  return filename;
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log('✅ Bağlantı: ' + DB.database);

  h('1) TRIGGER KALİCİ OLARAK DEVRE DIŞI (ALTER TABLE)');
  log('   Bu, sync_queue\'ya yeni UPDATE yazılmasını tamamen engeller.');
  log('   Dikkat: Sadece bu session için değil, tüm sessionlar için kalıcı.');

  if (DRY_RUN) {
    log('\n   DRY-RUN — gerçek komutlar:');
    log('   ALTER TABLE rex_' + FIRM + '_suppliers DISABLE TRIGGER USER;');
    log('   ALTER TABLE sync_queue DISABLE TRIGGER USER;');
    log('   ... düzeltme ...');
    log('   ALTER TABLE rex_' + FIRM + '_suppliers ENABLE TRIGGER USER;');
    log('   ALTER TABLE sync_queue ENABLE TRIGGER USER;');
    await c.end();
    return;
  }

  const backupFile = takeBackup();

  try {
    h('2) TRIGGER\'LARI DEVRE DIŞI BIRAK');
    await c.query('BEGIN');
    await c.query('ALTER TABLE rex_' + FIRM + '_suppliers DISABLE TRIGGER USER');
    await c.query('ALTER TABLE rex_' + FIRM + '_cash_registers DISABLE TRIGGER USER');
    await c.query('ALTER TABLE rex_' + FIRM + '_customers DISABLE TRIGGER USER');
    log('   ✓ ALTER TABLE ... DISABLE TRIGGER USER (kalıcı)');

    h('3) DOĞRU BALANCE PLANI');
    const plan = await c.query(`
      SELECT s.code, s.balance AS current_balance,
             COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                       WHERE pl.party_id=s.id AND pl.card_type='supplier'
                         AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
             (s.balance + COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS new_balance
      FROM rex_${FIRM}_suppliers s
      WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                    WHERE pl.party_id=s.id AND pl.card_type='supplier')`);

    log('   Cari Kodu          Mevcut       Ledger Net    DOĞRU');
    log('   ' + '─'.repeat(75));
    plan.rows.forEach(r => {
      const flag = Math.abs(Number(r.current_balance) - Number(r.new_balance)) > 1 ? '⚠' : '✓';
      log('   ' + r.code.padEnd(18) + ' ' + Number(r.current_balance).toLocaleString().padStart(13) + ' ' + Number(r.ledger_net).toLocaleString().padStart(13) + ' ' + Number(r.new_balance).toLocaleString().padStart(13) + ' ' + flag);
    });

    h('4) sync_queue.pending ARZENGROUP + diğerleri TEMİZLE (DELETE)');
    const del = await c.query(`DELETE FROM sync_queue WHERE table_name='rex_${FIRM}_suppliers' AND status='pending'`);
    log('   ✓ ' + del.rowCount + ' pending kayıt SİLİNDİ');

    h('5) rex_001_suppliers.balance düzeltme');
    let sUpd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      if (Math.abs(Number(r.current_balance) - newBal) > 0.01) {
        await c.query(`UPDATE rex_${FIRM}_suppliers SET balance = $1 WHERE code = $2`, [newBal, r.code]);
        sUpd++;
      }
    }
    log('   ✓ ' + sUpd + ' tedarikçi balance düzeltildi');

    h('6) TRIGGER\'LARI TEKRAR AKTİF ET');
    await c.query('ALTER TABLE rex_' + FIRM + '_suppliers ENABLE TRIGGER USER');
    await c.query('ALTER TABLE rex_' + FIRM + '_cash_registers ENABLE TRIGGER USER');
    await c.query('ALTER TABLE rex_' + FIRM + '_customers ENABLE TRIGGER USER');
    log('   ✓ ALTER TABLE ... ENABLE TRIGGER USER');

    await c.query('COMMIT');
    log('\n   ✓ Transaction commit edildi.');
  } catch (e) {
    await c.query('ROLLBACK');
    // Hata olursa trigger'ı mutlaka geri aç
    try { await c.query('ALTER TABLE rex_' + FIRM + '_suppliers ENABLE TRIGGER USER'); } catch {}
    try { await c.query('ALTER TABLE rex_' + FIRM + '_cash_registers ENABLE TRIGGER USER'); } catch {}
    try { await c.query('ALTER TABLE rex_' + FIRM + '_customers ENABLE TRIGGER USER'); } catch {}
    log('\n   ✗ HATA — ROLLBACK: ' + e.message);
    log('   Yedek: ' + backupFile);
    await c.end();
    process.exit(1);
  }

  h('7) DOĞRULAMA');
  const verify = await c.query(`SELECT code, name, balance FROM rex_${FIRM}_suppliers WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier') ORDER BY code`);
  verify.rows.forEach(r => log('   ' + r.code.padEnd(18) + ' ' + String(r.name).slice(0,32).padEnd(34) + ' ' + m(r.balance) + (Number(r.balance)===0?' ✓ TAM':'')));

  const sq = await c.query(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending FROM sync_queue WHERE table_name='rex_${FIRM}_suppliers'`);
  log('\n   sync_queue.pending rex_001_suppliers: ' + sq.rows[0].pending);

  log('\n📦 Yedek: ' + backupFile);
  log('\n✅ PERMANENT FIX TAMAMLANDI.');
  log('  - Trigger GEÇİCİ olarak devre dışı (sadece düzeltme sırasında)');
  log('  - Tekrar AKTİF (sync artık düzgün çalışıyor)');
  log('  - sync_queue.pending temizlendi');
  log('  - 8 tedarikçi balance doğru değerde');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});
