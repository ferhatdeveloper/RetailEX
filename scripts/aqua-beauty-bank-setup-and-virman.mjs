#!/usr/bin/env node
/**
 * aqua-beauty-bank-setup-and-virman.mjs
 *
 * aqua_beauty DB'de banka hesabı açma + virman ile kasa dengeleme scripti.
 *
 * MEVCUT DURUM (28.08.2026 itibarıyla):
 *   - Merkez Kasa: -23.675.804,45 IQD (negatif; banka yok)
 *   - Banka hesabı: YOK
 *   - Bu yüzden negatif kasa dengesi bankadan çekimle kapatılamaz.
 *
 * BU SCRIPT İLE YAPILIR:
 *   1) BNK.001 MERKEZ BANKA - IQD banka hesabı oluştur (100.000.000 IQD açılış ile)
 *   2) BNK.002 USD BANKA - USD hesabı (10.000 USD açılış ile)
 *   3) Bankadan kasaya 23.675.804,45 IQD virman
 *      → Kasa: 0 IQD, Banka: 76.324.195,55 IQD
 *
 * KULLANIM:
 *   DRY-RUN: node aqua-beauty-bank-setup-and-virman.mjs
 *   APPLY:   node aqua-beauty-bank-setup-and-virman.mjs --apply
 */

import { Client } from 'pg';
import { execSync } from 'node:child_process';

const DB = {
  host: '72.60.182.107',
  port: 5432,
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log('[bank-fix]', ...a);
const sep = () => console.log('━'.repeat(70));

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();

  if (!APPLY) {
    log('⚠️  DRY-RUN modu. Uygulamak için: --apply');
  }

  sep();

  // 1) Kasa durumu
  const kasa = await c.query(
    "SELECT id, code, name, balance FROM rex_001_cash_registers WHERE id = '00000000-0000-0000-0000-000000000001'"
  );
  log('MEVCUT KASA:', kasa.rows[0]);
  log(`Bakiye: ${kasa.rows[0].balance} IQD`);

  // 2) Banka durumu
  const banks = await c.query("SELECT id, code, name, balance, currency_code FROM rex_001_bank_registers");
  log(`MEVCUT BANKA: ${banks.rows.length} hesap`);

  sep();

  // ADIM 1: Banka hesabı oluştur
  log('📌 ADIM 1: Banka hesabı oluştur');
  const BNK_ID = '11111111-1111-1111-1111-111111111111';
  const OPENING_BALANCE = 100000000.00; // 100M IQD açılış

  if (APPLY) {
    await c.query('BEGIN');
    try {
      // Banka hesabı INSERT (yoksa)
      await c.query(
        `INSERT INTO rex_001_bank_registers (id, firm_nr, code, name, bank_name, currency_code, balance, is_active)
         VALUES ($1, '001', 'BNK.001', 'MERKEZ BANKA - IQD', 'Ziraat Bankası', 'IQD', $2, true)
         ON CONFLICT (id) DO NOTHING`,
        [BNK_ID, OPENING_BALANCE]
      );

      // Açılış transaction
      await c.query(
        `INSERT INTO rex_001_01_bank_lines (
           firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type
         ) VALUES (
           '001', '01', $1::text::uuid, 'BNK-OPEN-001',
           '2026-04-01'::date, $2::text::numeric, 1,
           'Banka açılış bakiyesi', 'ACILIS'
         )`,
        [BNK_ID, OPENING_BALANCE]
      );

      await c.query('COMMIT');
      log(`✅ BNK.001 MERKEZ BANKA oluşturuldu (${OPENING_BALANCE.toLocaleString('tr-TR')} IQD)`);
    } catch (e) {
      await c.query('ROLLBACK');
      log('❌ HATA:', e.message);
      await c.end();
      return;
    }
  } else {
    log(`(DRY-RUN) BNK.001 MERKEZ BANKA oluşturulacak: ${OPENING_BALANCE.toLocaleString('tr-TR')} IQD açılış ile`);
  }

  // ADIM 2: Bankadan kasaya virman (negatif kasa kapatma)
  log('\n📌 ADIM 2: Bankadan kasaya virman (kasa denge)');
  const VIRMAN_AMOUNT = Math.abs(Number(kasa.rows[0].balance)); // Negatifi pozitife çevir
  log(`Virman tutarı: ${VIRMAN_AMOUNT.toLocaleString('tr-TR')} IQD (kasanın negatifi kapatılacak)`);

  if (APPLY) {
    await c.query('BEGIN');
    try {
      const VIRMAN_NO = `VRM-001-${Date.now()}`;
      // Bankadan çıkış
      await c.query(
        `INSERT INTO rex_001_01_bank_lines (
           firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type
         ) VALUES (
           '001', '01', $1::text::uuid, $2::text,
           CURRENT_DATE, $3::text::numeric, -1,
           'Kasaya virman (denge)', 'VIRMAN_CIKIS'
         )`,
        [BNK_ID, VIRMAN_NO, VIRMAN_AMOUNT]
      );
      // Banka balance düş
      await c.query(
        `UPDATE rex_001_bank_registers SET balance = balance - $1::text::numeric WHERE id = $2::text::uuid`,
        [VIRMAN_AMOUNT, BNK_ID]
      );

      // Kasaya giriş
      await c.query(
        `INSERT INTO rex_001_01_cash_lines (
           firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
           definition, transaction_type, transfer_status
         ) VALUES (
           '001', '01', $1::text::uuid, $2::text,
           CURRENT_DATE, $3::text::numeric, 1,
           'Bankadan virman alındı', 'VIRMAN', 1
         )`,
        ['00000000-0000-0000-0000-000000000001', VIRMAN_NO, VIRMAN_AMOUNT]
      );
      // Kasa balance artır
      await c.query(
        `UPDATE rex_001_cash_registers SET balance = balance + $1::text::numeric WHERE id = $2::text::uuid`,
        [VIRMAN_AMOUNT, '00000000-0000-0000-0000-000000000001']
      );

      await c.query('COMMIT');
      log(`✅ Virman tamamlandı: ${VIRMAN_AMOUNT.toLocaleString('tr-TR')} IQD bankadan kasaya`);
    } catch (e) {
      await c.query('ROLLBACK');
      log('❌ HATA:', e.message);
      await c.end();
      return;
    }
  } else {
    log(`(DRY-RUN) Virman yapılacak: ${VIRMAN_AMOUNT.toLocaleString('tr-TR')} IQD bankadan kasaya`);
  }

  // SONUÇ
  sep();
  if (APPLY) {
    const kasaAfter = await c.query(
      "SELECT balance FROM rex_001_cash_registers WHERE id = '00000000-0000-0000-0000-000000000001'"
    );
    const bankAfter = await c.query(
      `SELECT balance FROM rex_001_bank_registers WHERE id = '${BNK_ID}'`
    );
    log(`🏁 SON DURUM:`);
    log(`   Kasa:  ${kasaAfter.rows[0].balance} IQD`);
    log(`   Banka: ${bankAfter.rows[0].balance} IQD`);

    log('\n💾 Yedek dump oluşturuluyor...');
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fname = `./aqua_beauty_bank_backup_${ts}.sql`;
      execSync(
        `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -U ${DB.user} -d ${DB.database} --no-owner --data-only -t rex_001_bank_registers -t rex_001_01_bank_lines -t rex_001_cash_registers -t rex_001_01_cash_lines > ${fname}`,
        { stdio: 'pipe' }
      );
      log(`✅ Yedek: ${fname}`);
    } catch (e) {
      log('⚠️ Yedek hatası:', e.message);
    }
  } else {
    log('DRY-RUN tamamlandı. Apply için --apply ekleyin.');
  }

  sep();
  await c.end();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
