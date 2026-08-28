import { Client } from 'pg';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const DB = {
  host: '72.60.182.107', port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: 'aqua_beauty',
};
const FIRM = '001';
const PERIOD = '01';

const m = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_fn_backup_${ts}.sql`;
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t rex_${FIRM}_suppliers --no-owner --no-acl > ${filename}`;
  execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
  return filename;
}

const NEW_FN = `
CREATE OR REPLACE FUNCTION public.auto_reconcile_supplier_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_correct NUMERIC;
      v_current NUMERIC;
      v_id UUID;
      v_sales NUMERIC;
      v_payments NUMERIC;
    BEGIN
      v_id := NEW.id;
      SELECT balance INTO v_current FROM rex_${FIRM}_suppliers WHERE id = v_id;

      -- sales katkısı: alış faturaları + iadeler + açılış bakiyesi
      SELECT COALESCE(SUM(CASE WHEN fiche_type='purchase_invoice' THEN net_amount
                                 WHEN fiche_type='return_invoice' THEN -net_amount
                                 WHEN fiche_type='opening_balance' THEN net_amount
                                 ELSE 0 END), 0)
      INTO v_sales
      FROM rex_${FIRM}_${PERIOD}_sales
      WHERE customer_id = v_id
        AND COALESCE(is_cancelled, false) = false
        AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance');

      -- cash_lines CH_ODEME/CH_TAHSILAT: -ABS(amount)  ← DÜZELTME: party_id (tedarikçi ödemeleri bu kolonda)
      SELECT COALESCE(SUM(ABS(amount)), 0)
      INTO v_payments
      FROM rex_${FIRM}_${PERIOD}_cash_lines
      WHERE party_id = v_id
        AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
        AND transaction_type NOT LIKE 'CANCELLED_%';

      v_correct := v_sales - v_payments;

      IF v_current IS DISTINCT FROM v_correct THEN
        UPDATE rex_${FIRM}_suppliers SET balance = v_correct WHERE id = v_id;
      END IF;

      RETURN NULL;
    END;
    $function$
`;

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  console.log('✅ Bağlantı: ' + DB.database + '\n');

  // 1) Mevcut fonksiyonun yedeğini dosyaya yaz
  console.log('1) auto_reconcile_supplier_balance() fonksiyon yedeği alınıyor...');
  const fnDef = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'auto_reconcile_supplier_balance'`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fnBackup = `auto_reconcile_supplier_balance_BACKUP_${ts}.sql`;
  writeFileSync(fnBackup, fnDef.rows[0].def + ';\n');
  console.log('   💾 Fonksiyon yedeği: ' + fnBackup + '\n');

  // 2) suppliers tablosu yedeği
  console.log('2) rex_001_suppliers tablo yedeği alınıyor...');
  const tblBackup = takeBackup();
  console.log('   💾 Tablo yedeği: ' + tblBackup + '\n');

  // 3) Fonksiyonu değiştir
  console.log('3) Fonksiyon güncelleniyor (cash_lines.customer_id → party_id)');
  await c.query('BEGIN');
  try {
    await c.query(NEW_FN);
    console.log('   ✓ Fonksiyon güncellendi\n');
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.log('   ✗ HATA: ' + e.message);
    process.exit(1);
  }

  // 4) Tedarikçi balance'larını düzeltmek için UPDATE
  // Trigger fonksiyon içinde UPDATE yapıyor → trigger'ı bypass etmek yerine
  // doğrudan UPDATE ile tetikleyip fonksiyonun yeni haliyle yazmasını sağlayacağız
  console.log('4) UPDATE tetikleyici ile balance düzeltme (fn yeni haliyle hesaplayacak)');
  await c.query('BEGIN');
  try {
    // Önce eski balance'ı oku
    const before = await c.query(`
      SELECT code, balance FROM rex_${FIRM}_suppliers
      WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                    WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier')
      ORDER BY code`);
    const beforeMap = new Map(before.rows.map(r => [r.code, Number(r.balance)]));

    // Boş bir UPDATE tetikle → trg_auto_reconcile_supplier yeni haliyle doğru balance'ı yazacak
    await c.query(`UPDATE rex_${FIRM}_suppliers SET updated_at = NOW() WHERE EXISTS (
      SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
      WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier')`);
    
    // Doğrula
    const after = await c.query(`
      SELECT code, balance FROM rex_${FIRM}_suppliers
      WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                    WHERE pl.party_id = rex_${FIRM}_suppliers.id AND pl.card_type='supplier')
      ORDER BY code`);
    
    console.log('   code                  eski          yeni         fark');
    after.rows.forEach(r => {
      const oldB = beforeMap.get(r.code);
      const newB = Number(r.balance);
      const fark = oldB - newB;
      const ok = Math.abs(fark) > 0.01;
      console.log(`   ${String(r.code).padEnd(18)} ${m(oldB).padStart(13)} ${m(newB).padStart(13)} ${ok ? m(fark).padStart(12) : ' (zaten OK)'}`);
    });
    
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.log('   ✗ HATA: ' + e.message);
    process.exit(1);
  }

  // 5) Ledger ile karşılaştır (muhasebe denetimi)
  console.log('\n5) Muhasebe denetimi (balance = alış - ödeme, vs ledger)');
  const check = await c.query(`
    WITH calc AS (
      SELECT s.id, s.code, s.balance AS cur_bal,
             COALESCE((SELECT SUM(CASE WHEN fiche_type='purchase_invoice' THEN net_amount
                                         WHEN fiche_type='return_invoice' THEN -net_amount
                                         WHEN fiche_type='opening_balance' THEN net_amount
                                         ELSE 0 END)
                       FROM rex_${FIRM}_${PERIOD}_sales
                       WHERE customer_id = s.id
                         AND COALESCE(is_cancelled, false) = false
                         AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')), 0) AS sales_net,
             COALESCE((SELECT SUM(ABS(amount))
                       FROM rex_${FIRM}_${PERIOD}_cash_lines
                       WHERE party_id = s.id
                         AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
                         AND transaction_type NOT LIKE 'CANCELLED_%'), 0) AS payments,
             COALESCE((SELECT SUM(amount*sign)
                       FROM rex_${FIRM}_${PERIOD}_party_ledger_movements
                       WHERE party_id = s.id AND card_type='supplier'
                         AND transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_payments_only
      FROM rex_${FIRM}_suppliers s
      WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                    WHERE pl.party_id=s.id AND pl.card_type='supplier'))
    SELECT code, cur_bal, sales_net, payments, sales_net - payments AS formula_balance, ledger_payments_only
    FROM calc ORDER BY code`);
  check.rows.forEach(r => {
    const ok = Math.abs(Number(r.cur_bal) - Number(r.formula_balance)) < 0.5;
    console.log(`   ${String(r.code).padEnd(18)} balance=${m(r.cur_bal).padStart(13)} formül=${m(r.formula_balance).padStart(13)} ${ok ? '✓' : '✗'}`);
  });

  console.log('\n✅ Bitti. Yedekler:');
  console.log('   Fonksiyon: ' + fnBackup);
  console.log('   Tablo:     ' + tblBackup);

  await c.end();
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1); });
