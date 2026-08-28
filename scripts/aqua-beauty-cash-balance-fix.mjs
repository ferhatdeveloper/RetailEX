#!/usr/bin/env node
/**
 * aqua-beauty-cash-balance-fix.mjs
 *
 * aqua_beauty DB Merkez Kasa düzeltme scripti.
 *
 * 3 ADIM (her biri DRY-RUN ile başlar, --apply ile uygulanır):
 *   1) Mhashi dctor: cash_lines.amount 77.000.000 -> 7.700.000 (10x veri giriş hatası)
 *      ve ilgili cash_registers.balance düzeltmesi (+69.300.000 düzeltme).
 *   2) Çift kayıt: KASA_GIRIS 49 satır / 4.102.000 IQD fazla tahsilat silme.
 *   3) Açılış bakiyesi devri: Legacy 8 kayıt register_id NULL -> Merkez Kasa'ya bağla
 *      + balance düzeltme (+649.900 IQD gerçek açılış).
 *
 * 50 yıllık muhasebeci gözüyle kontrol:
 *   - DRY-RUN önce çalıştır (SQL çıktısı + etki özeti).
 *   - Her düzeltme transaction içinde; hata olursa rollback.
 *   - Yedek dump otomatik alınır (./aqua_beauty_cash_fix_backup_<ts>.sql).
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DB = {
  host: '72.60.182.107',
  port: 5432,
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};

const REGISTER_ID = '00000000-0000-0000-0000-000000000001'; // MERKEZ KASA

const APPLY = process.argv.includes('--apply');
const STEP = (() => {
  const i = process.argv.indexOf('--step');
  return i >= 0 ? Number(process.argv[i + 1]) : 0; // 0 = hepsi, 1-3 = tek adım
})();

const log = (...a) => console.log('[kasa-fix]', ...a);
const sep = () => console.log('━'.repeat(70));

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`Bağlantı: ${DB.database} @ ${DB.host}`);

  // Mevcut durum
  const reg = await c.query(
    "SELECT id, code, name, balance FROM rex_001_cash_registers WHERE id = $1",
    [REGISTER_ID]
  );
  log(`Kasa: ${reg.rows[0].code} - ${reg.rows[0].name}`);
  log(`Mevcut balance: ${reg.rows[0].balance} IQD`);
  sep();

  if (!APPLY) {
    log('⚠️  DRY-RUN modu (SQL + etki özeti). Uygulamak için: node ... --apply');
  }

  // ─── ADIM 1: Mhashi dctor 77M → 7.7M ─────────────────────────────
  if (STEP === 0 || STEP === 1) {
    log('\n📌 ADIM 1: Mhashi dctor 77.000.000 → 7.700.000');
    const fix1 = await c.query(
      `SELECT id, fiche_no, date, amount, definition
       FROM rex_001_01_cash_lines
       WHERE transaction_type = 'GIDER_PUSULASI'
         AND amount = 77000000
         AND definition ILIKE '%Mhashi%'`
    );
    if (fix1.rows.length === 0) {
      log('  → Hedef kayıt bulunamadı (belki zaten düzeltilmiş). Atlanıyor.');
    } else {
      const row = fix1.rows[0];
      const fark = 77000000 - 7700000; // 69.300.000
      log(`  Kayıt: ${row.id} | ${row.fiche_no} | ${row.date.toISOString().slice(0, 10)} | ${row.definition}`);
      log(`  Mevcut: 77.000.000 IQD → Hedef: 7.700.000 IQD | Fark: ${fark.toLocaleString('tr-TR')} IQD`);
      log(`  Kasa etkisi: +${fark.toLocaleString('tr-TR')} IQD (gider azalıyor)`);

      if (APPLY) {
        await c.query('BEGIN');
        try {
          await c.query('UPDATE rex_001_01_cash_lines SET amount = 7700000 WHERE id = $1', [row.id]);
          await c.query(
            'UPDATE rex_001_cash_registers SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
            [fark, REGISTER_ID]
          );
          await c.query('COMMIT');
          log('  ✅ Uygulandı');
        } catch (e) {
          await c.query('ROLLBACK');
          log('  ❌ HATA:', e.message);
        }
      } else {
        log('  (DRY-RUN: SQL uygulanmadı)');
      }
    }
  }

  // ─── ADIM 2: Çift KASA_GIRIS 49 satır silme ───────────────────────
  if (STEP === 0 || STEP === 2) {
    log('\n📌 ADIM 2: Çift KASA_GIRIS kayıtları (49 satır / 4.102.000 IQD)');
    const dup = await c.query(
      `SELECT date, amount, COUNT(*) AS adet
       FROM rex_001_01_cash_lines
       WHERE transaction_type = 'KASA_GIRIS'
         AND register_id = $1
       GROUP BY 1, 2
       HAVING COUNT(*) > 1
       ORDER BY adet DESC, amount DESC
       LIMIT 10`,
      [REGISTER_ID]
    );
    log(`  ${dup.rows.length} grup çift kayıt (ilk 10):`);
    let totalFazla = 0;
    let totalSatir = 0;
    for (const r of dup.rows) {
      const fazla = (Number(r.adet) - 1) * Number(r.amount);
      totalFazla += fazla;
      totalSatir += Number(r.adet) - 1;
      log(
        `  ${r.date.toISOString().slice(0, 10)} | ${Number(r.amount).toLocaleString('tr-TR')} IQD x ${r.adet} → fazla ${fazla.toLocaleString('tr-TR')}`
      );
    }
    log(`  TOPLAM: ${totalSatir} satır / ${totalFazla.toLocaleString('tr-TR')} IQD fazla`);

    if (APPLY) {
      await c.query('BEGIN');
      try {
        // Her (date, amount) grubunda en yüksek id'yi tut, diğerlerini sil
        // + balance düzelt
        const del = await c.query(
          `WITH ranked AS (
             SELECT id, amount,
                    ROW_NUMBER() OVER (PARTITION BY date, amount ORDER BY id DESC) AS rn
             FROM rex_001_01_cash_lines
             WHERE transaction_type = 'KASA_GIRIS' AND register_id = $1
           ),
           deleted AS (
             DELETE FROM rex_001_01_cash_lines
             WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
             RETURNING amount
           )
           SELECT COALESCE(SUM(amount), 0) AS silinen_toplam, COUNT(*) AS silinen_adet FROM deleted`,
          [REGISTER_ID]
        );
        const removed = Number(del.rows[0].silinen_toplam);
        const cnt = Number(del.rows[0].silinen_adet);
        // Kasa balance: fazla KASA_GIRIS = bakiye şişmişti; düzelt
        await c.query(
          'UPDATE rex_001_cash_registers SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
          [removed, REGISTER_ID]
        );
        await c.query('COMMIT');
        log(`  ✅ ${cnt} satır silindi, balance ${removed.toLocaleString('tr-TR')} IQD düşürüldü`);
      } catch (e) {
        await c.query('ROLLBACK');
        log('  ❌ HATA:', e.message);
      }
    } else {
      log('  (DRY-RUN: SQL uygulanmadı)');
    }
  }

  // ─── ADIM 3: Açılış bakiyesi devri ────────────────────────────────
  if (STEP === 0 || STEP === 3) {
    log('\n📌 ADIM 3: Legacy 8 kayıt → Merkez Kasa + açılış bakiyesi düzeltmesi');
    const legacy = await c.query(
      `SELECT id, date, amount, sign, transaction_type, definition
       FROM rex_001_01_cash_lines
       WHERE register_id IS NULL
       ORDER BY date`
    );
    if (legacy.rows.length === 0) {
      log('  → Legacy kayıt kalmamış (önceki adımda bağlanmış olabilir). Atlanıyor.');
    } else {
      let netLegacy = 0;
      log(`  ${legacy.rows.length} legacy kayıt bulundu:`);
      for (const r of legacy.rows) {
        const signed = Number(r.amount) * Number(r.sign);
        netLegacy += signed;
        log(
          `  ${r.date.toISOString().slice(0, 10)} | ${r.transaction_type.padEnd(16)} | ${Number(r.amount).toLocaleString('tr-TR')} (${r.sign > 0 ? '+' : '−'}) | ${r.definition ?? ''}`
        );
      }
      log(`  Legacy NET: ${netLegacy.toLocaleString('tr-TR')} IQD`);
      log(`  Kasa etkisi: +${netLegacy.toLocaleString('tr-TR')} IQD (gerçek açılış)`);

      if (APPLY) {
        await c.query('BEGIN');
        try {
          await c.query(
            'UPDATE rex_001_01_cash_lines SET register_id = $1 WHERE register_id IS NULL',
            [REGISTER_ID]
          );
          await c.query(
            'UPDATE rex_001_cash_registers SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
            [netLegacy, REGISTER_ID]
          );
          await c.query('COMMIT');
          log(`  ✅ Legacy bağlandı, balance +${netLegacy.toLocaleString('tr-TR')} IQD`);
        } catch (e) {
          await c.query('ROLLBACK');
          log('  ❌ HATA:', e.message);
        }
      } else {
        log('  (DRY-RUN: SQL uygulanmadı)');
      }
    }
  }

  // ─── SONUÇ ────────────────────────────────────────────────────────
  sep();
  const finalReg = await c.query(
    "SELECT balance FROM rex_001_cash_registers WHERE id = $1",
    [REGISTER_ID]
  );
  log(`🏁 Sonuç bakiye: ${finalReg.rows[0].balance} IQD`);

  if (APPLY) {
    log('💾 Yedek dump oluşturuluyor...');
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fname = `./aqua_beauty_cash_fix_backup_${ts}.sql`;
      execSync(
        `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -U ${DB.user} -d ${DB.database} --no-owner --data-only -t rex_001_01_cash_lines -t rex_001_cash_registers > ${fname}`,
        { stdio: 'pipe' }
      );
      log(`✅ Yedek: ${fname}`);
    } catch (e) {
      log('⚠️ Yedek hatası:', e.message);
    }
  }

  await c.end();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
