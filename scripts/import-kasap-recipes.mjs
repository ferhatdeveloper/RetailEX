#!/usr/bin/env node
/**
 * Kasap reçete Excel import CLI.
 *
 * Kullanım:
 *   node scripts/import-kasap-recipes.mjs <excel-dosyası> [--dry-run] [--firm=001]
 *
 * Excel şablonu: Ürünler_YYYY-MM-DD.xlsx
 *   - COME FROM kolonu → reçete adı
 *   - GOLK / SINGE / FROZEN → D (yüzde) + E (kg)
 *   - KALASHE KAML → F (yüzde) + G (kg)
 *   - Ürün Kodu/Adı/Birim → DB eşleşmesi
 *
 * --dry-run: parse + grup + eşleşme önizlemesi, DB yazmaz
 *
 * Gerekli ortam (kasap DB):
 *   PGHOST=72.60.182.107 PGPORT=5432 PGUSER=postgres PGPASSWORD=... PGDATABASE=kasap
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Yardım: i18n / format
function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toFixed(2);
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toFixed(2) + '%';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args[0] === '-h' || args[0] === '--help') {
    console.log('Kullanım: node scripts/import-kasap-recipes.mjs <excel> [--dry-run] [--firm=001]');
    process.exit(1);
  }
  const excelPath = resolve(args[0]);
  const dryRun = args.includes('--dry-run');
  const firmArg = args.find((a) => a.startsWith('--firm='));
  const firm = firmArg ? firmArg.split('=')[1] : '001';

  console.log('=== Kasap Reçete Excel Import ===');
  console.log('Dosya :', excelPath);
  console.log('Firma :', firm);
  console.log('Mod   :', dryRun ? 'DRY-RUN (DB yazmaz)' : 'LIVE (DB yazar)');
  console.log('');

  // 1) Excel'i parse et (TS modülünü Node --experimental-strip-types ile yükle)
  const buf = readFileSync(excelPath);
  const excelMod = await import(
    'file://' + resolve(projectRoot, 'src/utils/butcherRecipeExcelImport.ts')
  );
  const parseResult = await excelMod.parseButcherRecipeExcelFromBuffer(
    new Uint8Array(buf).buffer,
  );

  console.log('Parse:', parseResult.ok ? 'OK' : 'HATA');
  console.log('  Satır sayısı:', parseResult.rows.length);
  console.log('  Hatalar:', parseResult.errors.length);
  for (const e of parseResult.errors) console.log('    !', e);
  console.log('  Uyarılar:', parseResult.warnings.length);
  if (parseResult.warnings.length) {
    console.log('    İlk 5 uyarı:');
    parseResult.warnings.slice(0, 5).forEach((w) => console.log('    -', w));
  }
  if (!parseResult.ok) process.exit(1);

  // 2) Gruplara ayır
  const groups = excelMod.groupRowsByRecipe(parseResult.rows);
  console.log('\n=== REÇETE GRUPLARI ===');
  for (const g of groups) {
    console.log(
      `\n[${g.recipeName}] (hayvan: ${g.animalType}) — toplam: %${fmtNum(g.totalPercent)} / ${fmtNum(g.totalKg)} kg — ${g.rows.length} ürün`,
    );
    for (const r of g.rows) {
      const warn =
        r.standardRatioPercent == null || r.outputKg == null
          ? ' (yüzde/kg BOŞ!)'
          : '';
      console.log(
        `  - ${r.outputProductCode} ${r.outputProductName} → %${fmtPct(r.standardRatioPercent).replace('%', '')} / ${fmtNum(r.outputKg)} kg${warn}`,
      );
    }
  }

  if (dryRun) {
    console.log('\n[DRY-RUN] DB yazılmadı. Gerçek import için --dry-run olmadan çalıştırın.');
    return;
  }

  // 3) DB bağlantısı ve import
  // pg paketi zaten depoda mevcut (services altında kullanılıyor).
  console.log('\n=== DB IMPORT ===');
  const { Client } = await import('pg');
  const client = new Client({
    host: process.env.PGHOST || '72.60.182.107',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'kasap',
  });
  await client.connect();
  try {
    const px = `rex_${firm.padStart(3, '0')}`;

    // Tablo kontrol
    const { rows: tbl } = await client.query(
      `SELECT to_regclass($1) AS t`,
      [`${px}_butcher_recipes`],
    );
    if (!tbl[0]?.t) {
      console.error(
        `HATA: ${px}_butcher_recipes tablosu yok. Önce INIT_BUTCHER_PRODUCTION_TABLES çalıştırın.`,
      );
      process.exit(1);
    }

    // Ürün kodlarını çöz (toplu)
    const allCodes = [...new Set(groups.flatMap((g) => g.rows.map((r) => r.outputProductCode)))];
    const { rows: products } = await client.query(
      `SELECT id, code, name FROM ${px}_products WHERE code = ANY($1::text[])`,
      [allCodes],
    );
    const codeMap = new Map(products.map((p) => [p.code, p.id]));
    const missing = allCodes.filter((c) => !codeMap.has(c));

    let created = 0;
    let updated = 0;
    let outputsInserted = 0;

    for (const group of groups) {
      const outputs = [];
      for (let i = 0; i < group.rows.length; i++) {
        const r = group.rows[i];
        const id = codeMap.get(r.outputProductCode);
        if (!id) continue;
        outputs.push({
          productId: id,
          sortOrder: i,
          coefficient: 1,
          standardRatioPercent: r.standardRatioPercent ?? null,
        });
      }
      if (!outputs.length) continue;

      await client.query('BEGIN');
      try {
        const { rows: existing } = await client.query(
          `SELECT id FROM ${px}_butcher_recipes
           WHERE name = $1 AND is_active = true
           ORDER BY created_at DESC LIMIT 1`,
          [group.recipeName],
        );
        const existingId = existing[0]?.id;

        let recipeId = existingId;
        if (existingId) {
          await client.query(
            `UPDATE ${px}_butcher_recipes
             SET animal_type = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [existingId, group.animalType],
          );
          updated += 1;
        } else {
          const ins = await client.query(
            `INSERT INTO ${px}_butcher_recipes (firm_nr, name, animal_type, is_active)
             VALUES ($1, $2, $3, true) RETURNING id`,
            [firm, group.recipeName, group.animalType],
          );
          recipeId = ins.rows[0].id;
          created += 1;
        }

        // Output'ları sil ve yeniden yaz
        await client.query(
          `DELETE FROM ${px}_butcher_recipe_outputs WHERE recipe_id = $1`,
          [recipeId],
        );
        for (const o of outputs) {
          await client.query(
            `INSERT INTO ${px}_butcher_recipe_outputs
               (recipe_id, product_id, sort_order, coefficient, standard_ratio_percent)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              recipeId,
              o.productId,
              o.sortOrder,
              o.coefficient,
              o.standardRatioPercent,
            ],
          );
          outputsInserted += 1;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('HATA:', group.recipeName, err?.message || err);
        throw err;
      }
    }

    console.log('\n=== SONUÇ ===');
    console.log('Yeni reçete :', created);
    console.log('Güncellenen :', updated);
    console.log('Output satırı:', outputsInserted);
    if (missing.length) {
      console.log('Eksik ürün kodu (DB\'de yok, atlandı):', missing.length);
      missing.slice(0, 10).forEach((c) => console.log('  -', c));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Beklenmeyen hata:', err?.message || err);
  process.exit(1);
});
