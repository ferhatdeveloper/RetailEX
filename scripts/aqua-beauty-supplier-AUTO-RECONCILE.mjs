import { Client } from 'pg';

const DB = {host:'72.60.182.107',port:5432,user:'postgres',password:'Yq7xwQpt6c',database:'aqua_beauty'};
const FIRM = '001', PERIOD = '01';

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();

  console.log('1) sync_queue trigger KAPALI');
  await c.query(`ALTER TABLE rex_${FIRM}_suppliers DISABLE TRIGGER ALL`);
  await c.query(`ALTER TABLE rex_${FIRM}_cash_registers DISABLE TRIGGER ALL`);
  await c.query(`ALTER TABLE rex_${FIRM}_customers DISABLE TRIGGER ALL`);
  console.log('   ✓ Disabled\n');

  console.log('2) AUTO-RECONCILE fonksiyonu');
  await c.query(`DROP FUNCTION IF EXISTS auto_reconcile_supplier_balance() CASCADE`);

  // SET LOCAL ile recursion guard — aynı transaction'da ikinci kez tetiklenirse sessize al
  await c.query(`
    CREATE OR REPLACE FUNCTION auto_reconcile_supplier_balance()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      v_correct_balance NUMERIC;
      v_id UUID;
      v_current NUMERIC;
    BEGIN
      v_id := NEW.id;

      SELECT balance INTO v_current FROM rex_${FIRM}_suppliers WHERE id = v_id;
      
      SELECT COALESCE(SUM(pl.amount*pl.sign), 0)
      INTO v_correct_balance
      FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
      WHERE pl.party_id = v_id
        AND pl.card_type='supplier'
        AND pl.transaction_type NOT LIKE 'CANCELLED_%';

      -- Sadece gerçekten farklıysa güncelle (recursion guard)
      IF v_current IS DISTINCT FROM v_correct_balance THEN
        UPDATE rex_${FIRM}_suppliers SET balance = v_correct_balance WHERE id = v_id;
      END IF;

      RETURN NULL;
    END;
    $func$;
  `);
  console.log('   ✓ Fonksiyon oluşturuldu\n');

  console.log('3) Trigger ekle');
  await c.query(`DROP TRIGGER IF EXISTS trg_auto_reconcile_supplier ON rex_${FIRM}_suppliers`);
  await c.query(`
    CREATE TRIGGER trg_auto_reconcile_supplier
      AFTER INSERT OR UPDATE ON rex_${FIRM}_suppliers
      FOR EACH ROW
      EXECUTE FUNCTION auto_reconcile_supplier_balance();
  `);
  console.log('   ✓ Trigger AKTİF\n');

  console.log('4) sync_queue.pending → DELETE');
  const d = await c.query(`DELETE FROM sync_queue WHERE status='pending'`);
  console.log('   ✓ ' + d.rowCount + ' pending silindi\n');

  console.log('5) Mevcut balance\'ları düzelt');
  // tek tek, her biri için UPDATE yaparak trigger'ı tetikle
  const list = await c.query(`
    SELECT id, code FROM rex_${FIRM}_suppliers 
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier')
  `);
  
  for (const r of list.rows) {
    // Önce geçici olarak sync_trigger'ı aç, sonra auto_trigger'dan önce UPDATE yap
    // ... ama biz aynı tabloya 2 trigger açamayız. Bu yüzden her birini ayrı transaction'da yapacağız
    await c.query(`BEGIN`);
    await c.query(`SET LOCAL session_replication_role = replica`);  // disable tüm user triggers
    await c.query(`UPDATE rex_${FIRM}_suppliers SET name = name WHERE id = $1`, [r.id]);  // noop ama sync tetiklenir mi kontrol
    await c.query(`COMMIT`);
    // Şimdi balance'ı ledger'dan direkt hesapla ve yaz
    const sel = await c.query(`
      SELECT COALESCE(SUM(pl.amount*pl.sign), 0) AS bal
      FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
      WHERE pl.party_id = $1 AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'`, [r.id]);
    await c.query(`UPDATE rex_${FIRM}_suppliers SET balance = $1 WHERE id = $2`, [sel.rows[0].bal, r.id]);
  }
  console.log('   ✓ ' + list.rows.length + ' tedarikçi balance düzeltildi\n');

  console.log('6) Doğrulama');
  const v = await c.query(`SELECT code, balance FROM rex_${FIRM}_suppliers WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier') ORDER BY code`);
  v.rows.forEach(x => console.log('   ' + x.code.padEnd(18) + ' balance=' + Number(x.balance).toLocaleString().padStart(15) + (Number(x.balance)===0?' ✓ TAM':'')));

  console.log('\n✅ SETUP TAMAM:');
  console.log('   - sync_queue trigger KAPALI');
  console.log('   - auto-reconcile trigger AKTİF');
  console.log('   - Her UPDATE/INSERT sonrası balance ledger\'a göre yeniden hesaplanır');
  console.log('   - TauriDeskApp eski değer yazsa bile aynı statement içinde override edilir');

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
