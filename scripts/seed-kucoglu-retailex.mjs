#!/usr/bin/env node
/**
 * Kuç Oglu menü JSON → RetailEX kiracı DB (rex_001_products + kategoriler + rest.floors).
 *
 * Varsayılan: uzak PG (config) + database=kucoglu
 *
 *   PGPASSWORD=... PGHOST=... node scripts/seed-kucoglu-retailex.mjs
 *   DRY_RUN=1 node scripts/seed-kucoglu-retailex.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MENU_PATH = process.env.MENU_JSON || '/Users/ferhatnas/App/Kucoglu/src/data/kucoglu-menu.json'

const host = process.env.PGHOST || '72.60.182.107'
const port = Number(process.env.PGPORT || 5432)
const user = process.env.PGUSER || 'postgres'
const password = process.env.PGPASSWORD || process.env.TENANT_PG_PASS || ''
const database = process.env.PGDATABASE || 'kucoglu'
const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')

const CAT_MAP = {
  Meat: { code: 'REST-ET', name: 'Et', nameEn: 'Meat', nameAr: 'اللحوم' },
  Chicken: { code: 'REST-TAVUK', name: 'Tavuk', nameEn: 'Chicken', nameAr: 'دجاج' },
  Drinks: { code: 'REST-ICECEK', name: 'İçecekler', nameEn: 'Drinks', nameAr: 'مشروبات' },
  Other: { code: 'REST-DIGER', name: 'Diğer', nameEn: 'Other', nameAr: 'أخرى' },
}

const TR_NAMES = {
  'Meat Meal & Rice': 'Et Yemek & Pilav',
  Iskender: 'İskender',
  'Meat Roll': 'Et Dürüm',
  'Meat Doner': 'Et Döner',
  'Meat Meal': 'Et Yemek',
  'Super Beyti': 'Süper Beyti',
  'Chicken Meal & Rice': 'Tavuk Yemek & Pilav',
  'Chicken Iskender': 'Tavuk İskender',
  'Chicken Roll': 'Tavuk Dürüm',
  'Chicken Doner': 'Tavuk Döner',
  'Chicken Meal': 'Tavuk Yemek',
  'Chicken Platter': 'Tavuk Porsiyon',
  Ayran: 'Ayran',
  Cola: 'Kola',
  Fanta: 'Fanta',
  Sprite: 'Sprite',
  'Cola Fresh': 'Cola Fresh',
  'Cola zero': 'Cola Zero',
  'Soda Lemon': 'Limonlu Soda',
  Soda: 'Soda',
  Water: 'Su',
  'Sütlaç': 'Sütlaç',
  Fries: 'Patates Kızartması',
}

if (!password) {
  console.error('PGPASSWORD veya TENANT_PG_PASS gerekli')
  process.exit(1)
}
if (!fs.existsSync(MENU_PATH)) {
  console.error(`Menü JSON yok: ${MENU_PATH} — önce: node scripts/scrape-kucoglu-menu.mjs`)
  process.exit(1)
}

const menu = JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'))

async function ensureCategories(client) {
  const byCode = {}
  for (const [catKey, meta] of Object.entries(CAT_MAP)) {
    const { rows } = await client.query(
      `INSERT INTO public.rex_001_categories (code, name, description, is_active, is_restaurant)
       VALUES ($1::varchar, $2::varchar, $3::text, true, true)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         is_active = true,
         is_restaurant = true
       RETURNING id, code`,
      [meta.code, meta.name, `${meta.nameEn} / ${meta.nameAr}`],
    )
    byCode[catKey] = rows[0].id
    byCode[meta.code] = rows[0].id
  }
  return byCode
}

async function seedProducts(client, catByKey) {
  let upserted = 0
  for (const p of menu.products) {
    const catId = catByKey[p.category] || catByKey['Other']
    const nameTr = TR_NAMES[p.names?.en] || p.names?.tr || p.names?.en
    const nameEn = p.names?.en || p.name
    const nameAr = p.names?.ar || p.name
    const primaryName = nameTr
    const name2 = nameEn
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 1
    const desc = p.descs?.en || p.category || ''

    const { rows } = await client.query(
      `INSERT INTO public.rex_001_products (
         firm_nr, code, name, name2, image_url, image_url_cdn,
         description, description_tr, description_en, description_ar,
         category_id, category_code, brand, unit, vat_rate,
         price, cost, stock, min_stock, currency, is_active, has_variants
       ) VALUES (
         '001', $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, 'Kuç Oglu', 'Porsiyon', 0,
         $12, 0, 999, 1, 'IQD', true, $13
       )
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         name2 = EXCLUDED.name2,
         image_url = EXCLUDED.image_url,
         image_url_cdn = EXCLUDED.image_url_cdn,
         description = EXCLUDED.description,
         description_tr = EXCLUDED.description_tr,
         description_en = EXCLUDED.description_en,
         description_ar = EXCLUDED.description_ar,
         category_id = EXCLUDED.category_id,
         category_code = EXCLUDED.category_code,
         price = EXCLUDED.price,
         currency = EXCLUDED.currency,
         is_active = true,
         has_variants = EXCLUDED.has_variants,
         updated_at = now()
       RETURNING id`,
      [
        p.code.slice(0, 100),
        primaryName.slice(0, 255),
        name2.slice(0, 255),
        p.image || null,
        p.image || null,
        desc,
        nameTr,
        nameEn,
        nameAr,
        catId,
        (CAT_MAP[p.category] || CAT_MAP.Other).code,
        Number(p.price) || 0,
        hasVariants,
      ],
    )
    const productId = rows[0].id

    if (hasVariants) {
      await client.query(`DELETE FROM public.rex_001_product_variants WHERE product_id = $1`, [productId])
      for (const v of p.variants) {
        const sku = `${p.code}-${String(v.id || v.labelEn || 'v').toUpperCase()}`.slice(0, 100)
        await client.query(
          `INSERT INTO public.rex_001_product_variants (product_id, sku, attributes)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (sku) DO UPDATE SET attributes = EXCLUDED.attributes`,
          [
            productId,
            sku,
            JSON.stringify({
              label: v.labelEn || v.id,
              label_tr: v.labelTr || v.labelEn,
              label_en: v.labelEn,
              label_ar: v.labelAr,
              price: v.price,
              currency: 'IQD',
            }),
          ],
        )
      }
    }
    upserted += 1
  }
  return upserted
}

async function seedRestaurant(client) {
  await client.query(
    `UPDATE public.firms SET name = $1, is_active = true, "default" = true WHERE firm_nr = '001'`,
    [menu.tenant?.displayName || 'Kuç Oglu'],
  )
  await client.query(
    `UPDATE public.stores SET name = $1 WHERE firm_nr = '001'`,
    [menu.store?.nameTr || 'Kuç Oglu Duhok'],
  )

  await client.query(
    `INSERT INTO rest.floors (store_id, name, color, display_order)
     SELECT s.id, 'Salon', '#D6A36B', 1
     FROM stores s WHERE s.firm_nr = '001'
     AND NOT EXISTS (SELECT 1 FROM rest.floors f WHERE f.store_id = s.id AND f.name = 'Salon')
     LIMIT 1`,
  )
  await client.query(
    `INSERT INTO rest.floors (store_id, name, color, display_order)
     SELECT s.id, 'Teras', '#FFCF99', 2
     FROM stores s WHERE s.firm_nr = '001'
     AND NOT EXISTS (SELECT 1 FROM rest.floors f WHERE f.store_id = s.id AND f.name = 'Teras')
     LIMIT 1`,
  )

  // Tables (rex_001_rest_tables naming may vary — try common pattern)
  const tableRel = await client.query(`SELECT to_regclass('rest.rex_001_rest_tables') AS r`)
  if (tableRel.rows[0]?.r) {
    await client.query(
      `INSERT INTO rest.rex_001_rest_tables (floor_id, number, seats, status, pos_x, pos_y)
       SELECT f.id, v.number::VARCHAR, v.seats, 'empty', v.px, v.py
       FROM rest.floors f,
       (VALUES
         ('1', 4, 60, 60),
         ('2', 4, 180, 60),
         ('3', 2, 300, 60),
         ('4', 4, 60, 180),
         ('5', 6, 180, 180),
         ('6', 4, 300, 180)
       ) AS v(number, seats, px, py)
       WHERE f.name = 'Salon'
         AND NOT EXISTS (
           SELECT 1 FROM rest.rex_001_rest_tables t WHERE t.number = v.number::VARCHAR
         )`,
    )
  }

  await client.query(`NOTIFY pgrst, 'reload schema'`)
}

async function main() {
  console.log(`Seed → ${host}:${port}/${database} (${menu.productCount} ürün)`)
  if (dry) {
    console.log('[dry-run] örnek:', menu.products.slice(0, 2).map((p) => ({ code: p.code, name: p.names?.en, image: !!p.image })))
    return
  }

  const client = new pg.Client({
    host,
    port,
    user,
    password,
    database,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    const cats = await ensureCategories(client)
    const n = await seedProducts(client, cats)
    await seedRestaurant(client)
    await client.query('COMMIT')
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM public.rex_001_products WHERE firm_nr = '001' AND code LIKE 'KO_%'`,
    )
    console.log(`Tamam: upsert=${n}, KO_ ürün sayısı=${rows[0]?.n}`)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
