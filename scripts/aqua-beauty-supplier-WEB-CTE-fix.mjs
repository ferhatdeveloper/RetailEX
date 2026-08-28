import { Client } from 'pg';
import { execSync } from 'node:child_process';

const DB = {host:'72.60.182.107',port:5432,user:'postgres',password:'Yq7xwQpt6c',database:'aqua_beauty'};
const FIRM = '001', PERIOD = '01';

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_WEB_CTE_${ts}.sql`;
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t sync_queue -t rex_${FIRM}_suppliers --no-owner --no-acl > ${filename}`;
  execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
  return filename;
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();

  const backupFile = takeBackup();
  console.log('💾 Yedek: ' + backupFile + '\n');

  // 1) Eski fonksiyon sil
  await c.query(`DROP FUNCTION IF EXISTS auto_reconcile_supplier_balance() CASCADE`);
  console.log('1) Eski fonksiyon silindi');

  // 2) Yeni fonksiyon — web CTE mantığı
  // Satır 113: cash_lines.CH_ODEME/CH_TAHSILAT → -ABS(amount)
  // Satır 78: sales.purchase_invoice → +net_amount, return → -net_amount, opening → +net_amount
  await c.query(`
    CREATE OR REPLACE FUNCTION auto_reconcile_supplier_balance()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      v_correct NUMERIC;
      v_current NUMERIC;
      v_id UUID;
      v_sales NUMERIC;
      v_payments NUMERIC;
    BEGIN
      v_id := NEW.id;
      SELECT balance INTO v_current FROM rex_${FIRM}_suppliers WHERE id = v_id;

      -- sales katkısı
      SELECT COALESCE(SUM(CASE WHEN fiche_type='purchase_invoice' THEN net_amount
                                 WHEN fiche_type='return_invoice' THEN -net_amount
                                 WHEN fiche_type='opening_balance' THEN net_amount
                                 ELSE 0 END), 0)
      INTO v_sales
      FROM rex_${FIRM}_${PERIOD}_sales
      WHERE customer_id = v_id
        AND COALESCE(is_cancelled, false) = false
        AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance');

      -- cash_lines CH_ODEME/CH_TAHSILAT: -ABS(amount)
      SELECT COALESCE(SUM(ABS(amount)), 0)
      INTO v_payments
      FROM rex_${FIRM}_${PERIOD}_cash_lines
      WHERE customer_id = v_id
        AND UPPER(TRIM(transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
        AND transaction_type NOT LIKE 'CANCELLED_%';

      v_correct := v_sales - v_payments;

      IF v_current IS DISTINCT FROM v_correct THEN
        UPDATE rex_${FIRM}_suppliers SET balance = v_correct WHERE id = v_id;
      END IF;

      RETURN NULL;
    END;
    $func$;
  `);
  console.log('2) Fonksiyon oluşturuldu (web CTE mantığı)');

  // 3) Trigger
  await c.query(`DROP TRIGGER IF EXISTS trg_auto_reconcile_supplier ON rex_${FIRM}_suppliers`);
  await c.query(`
    CREATE TRIGGER trg_auto_reconcile_supplier
      AFTER INSERT OR UPDATE ON rex_${FIRM}_suppliers
      FOR EACH ROW
      EXECUTE FUNCTION auto_reconcile_supplier_balance();
  `);
  console.log('3) Trigger AKTİF');

  // 4) sync_queue.pending sil
  const d = await c.query(`DELETE FROM sync_queue WHERE status='pending'`);
  console.log('4) sync_queue.pending → ' + d.rowCount + ' silindi');

  // 5) Tüm supplier.balance yeniden hesapla (her UPDATE trigger'ı tetikler)
  // Tüm satırları noop update et
  await c.query(`UPDATE rex_${FIRM}_suppliers SET name = name WHERE is_active = true`);
  console.log('5) Tüm balance yeniden hesaplandı (trigger tetiklendi)');

  // 6) Doğrulama
  console.log('\n6) WEB\'İN GÖRECEĞİ BALANCE:');
  const v = await c.query(`
    SELECT s.code, s.name, s.balance
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (
      SELECT 1 FROM rex_${FIRM}_${PERIOD}_cash_lines cl
      WHERE cl.customer_id = s.id AND UPPER(TRIM(cl.transaction_type)) IN ('CH_ODEME','CH_TAHSILAT')
    ) OR EXISTS (
      SELECT 1 FROM rex_${FIRM}_${PERIOD}_sales sa
      WHERE sa.customer_id = s.id AND sa.fiche_type IN ('purchase_invoice','return_invoice','opening_balance')
    )
    ORDER BY s.code
  `);
  v.rows.forEach(x => console.log('   ' + x.code.padEnd(10) + ' ' + x.name.padEnd(32) + ' balance=' + Number(x.balance).toLocaleString().padStart(15)));

  console.log('\n✅ Web UI ile uyumlu balance. Kısa süre içinde kontrol edin (page refresh).');

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
