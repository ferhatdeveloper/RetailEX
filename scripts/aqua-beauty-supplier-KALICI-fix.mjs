import { Client } from 'pg';
import { execSync } from 'node:child_process';

const DB = {
  host: '72.60.182.107', port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: 'aqua_beauty',
};
const FIRM = '001';
const PERIOD = '01';

const m = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' IQD';

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_KALICI_${ts}.sql`;
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t sync_queue -t rex_${FIRM}_suppliers --no-owner --no-acl > ${filename}`;
  execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
  return filename;
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  console.log('✅ Bağlantı: ' + DB.database);

  const backupFile = takeBackup();
  console.log('💾 Yedek: ' + backupFile + '\n');

  await c.query('BEGIN');

  try {
    console.log('1) Trigger KALICI OLARAK devre dışı (DISABLE TRIGGER ALL)');
    await c.query(`ALTER TABLE rex_${FIRM}_suppliers DISABLE TRIGGER ALL`);
    await c.query(`ALTER TABLE rex_${FIRM}_cash_registers DISABLE TRIGGER ALL`);
    await c.query(`ALTER TABLE rex_${FIRM}_customers DISABLE TRIGGER ALL`);
    console.log('   ✓ Trigger\'lar KALICI OLARAK devre dışı');
    console.log('   (sync_queue\'ya yeni UPDATE yazılmayacak)\n');

    console.log('2) sync_queue.pending → DELETE (tamamen temizle)');
    const d = await c.query(`DELETE FROM sync_queue WHERE status = 'pending' AND table_name = ANY($1::text[])`, [[`rex_${FIRM}_suppliers`, `rex_${FIRM}_customers`, `rex_${FIRM}_cash_registers`]]);
    console.log('   ✓ ' + d.rowCount + ' pending kayıt SİLİNDİ\n');

    console.log('3) rex_001_suppliers.balance düzeltme');
    const plan = await c.query(`
      SELECT s.id, s.code, s.balance AS current_balance,
             COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                       WHERE pl.party_id=s.id AND pl.card_type='supplier'
                         AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
             (s.balance + COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS new_balance
      FROM rex_${FIRM}_suppliers s
      WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                    WHERE pl.party_id=s.id AND pl.card_type='supplier')`);
    
    let upd = 0;
    for (const r of plan.rows) {
      const newBal = Number(r.new_balance);
      if (Math.abs(Number(r.current_balance) - newBal) > 0.01) {
        await c.query(`UPDATE rex_${FIRM}_suppliers SET balance = $1 WHERE id = $2`, [newBal, r.id]);
        upd++;
        console.log('   ' + r.code.padEnd(18) + ' ' + Number(r.current_balance).toLocaleString().padStart(13) + ' → ' + Number(newBal).toLocaleString().padStart(13));
      }
    }
    console.log('   ✓ ' + upd + ' tedarikçi balance düzeltildi\n');

    console.log('4) COMMIT — trigger\'lar KAPALI kalacak');
    console.log('   (DB artık ana kaynak; sync_queue\'ya yazmıyor)');
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.log('HATA: ' + e.message);
    process.exit(1);
  }

  console.log('\n5) Doğrulama');
  const v = await c.query(`SELECT code, balance FROM rex_${FIRM}_suppliers WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier') ORDER BY code`);
  v.rows.forEach(r => console.log('   ' + r.code.padEnd(18) + ' ' + m(r.balance) + (Number(r.balance)===0?' ✓ TAM':'')));

  console.log('\n✅ Trigger\'lar KAPALI — sync_queue.pending birikmiyor.');
  console.log('   DeskApp veya başka client artık DB\'yi bozamaz.');
  console.log('   DİKKAT: Senkronizasyon manuel yapılacak. Tamir için:');
  console.log('     ALTER TABLE rex_001_suppliers ENABLE TRIGGER ALL;');
  console.log('     ALTER TABLE rex_001_cash_registers ENABLE TRIGGER ALL;');
  console.log('     ALTER TABLE rex_001_customers ENABLE TRIGGER ALL;');

  await c.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
