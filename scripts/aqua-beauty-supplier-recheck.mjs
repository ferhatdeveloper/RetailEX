import { Client } from 'pg';

const DB = {
  host: '72.60.182.107',
  port: 5432,
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};

const c = new Client(DB);
await c.connect();

console.log('=== CARI HESAP — TEDARİKÇİ BAKİYE DURUMU (sync_queue fix sonrası) ===\n');

const r = await c.query(`
  SELECT s.code, s.name, s.balance, s.updated_at,
         COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint FROM rex_001_01_party_ledger_movements pl
                   WHERE pl.party_id=s.id AND pl.card_type='supplier'
                     AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net
  FROM rex_001_suppliers s
  WHERE EXISTS (SELECT 1 FROM rex_001_01_party_ledger_movements pl
                WHERE pl.party_id=s.id AND pl.card_type='supplier')
  ORDER BY code
`);

console.log('1) suppliers.balance — su anki durum');
console.log('   Cari Kodu          Ad                              Balance          Ledger Net     updated_at');
console.log('   ' + '-'.repeat(110));
r.rows.forEach(x => {
  const ok = Math.abs(Number(x.balance) + Number(x.ledger_net)) < 1 ? 'OK' : 'SAPMA';
  console.log('   ' + x.code.padEnd(18) + ' ' + String(x.name).slice(0,30).padEnd(32) + ' ' +
    Number(x.balance).toLocaleString().padStart(16) + ' ' +
    Number(x.ledger_net).toLocaleString().padStart(14) + ' ' +
    String(x.updated_at).slice(0,19) + ' ' + ok);
});

console.log('\n2) sync_queue — yeni olusan tedarikci UPDATE var mi?');
const sq = await c.query("SELECT id, created_at, data->>'code' AS code, data->>'balance' AS balance FROM sync_queue WHERE table_name='rex_001_suppliers' AND status='pending' AND created_at > NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC");
if (sq.rows.length === 0) console.log('   OK Son 30dk icinde yeni pending supplier UPDATE yok');
sq.rows.forEach(x => console.log('   ' + String(x.created_at).slice(0,19) + ' ' + x.code + ' balance=' + x.balance));

console.log('\n3) rex_001_suppliers son 30dk guncellemeleri');
const up = await c.query("SELECT code, name, balance, updated_at FROM rex_001_suppliers WHERE updated_at > NOW() - INTERVAL '30 minutes' ORDER BY updated_at DESC");
if (up.rows.length === 0) console.log('   OK Son 30dk icinde hicbir tedarikci balance degismedi');
up.rows.forEach(r => console.log('   ' + String(r.updated_at).slice(0,19) + ' ' + r.code + ' ' + String(r.name).slice(0,30) + ' balance=' + Number(r.balance).toLocaleString()));

console.log('\n4) ARZENGROUP detay (kullanici ornegi)');
const arz = await c.query("SELECT code, balance, updated_at FROM rex_001_suppliers WHERE code='TED-031'");
if (arz.rows.length === 0) console.log('   ARZENGROUP bulunamadi!');
else {
  const a = arz.rows[0];
  const status = Number(a.balance)===0 ? 'TAM ODENDI' : 'DUSMEMIS';
  console.log('   TED-031 balance=' + Number(a.balance).toLocaleString() + ' IQD ' + status);
}

await c.end();
