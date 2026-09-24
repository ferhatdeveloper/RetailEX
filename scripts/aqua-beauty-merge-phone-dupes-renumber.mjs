/**
 * Aqua Beauty — telefon mükerrer müşterileri birleştir + file_id 0001'den yeniden numarala.
 *
 * Kural: gruptaki en düzgün/güzel isimli kart kalır; diğerleri arşivlenir (hareketler taşınır).
 *
 *   node scripts/aqua-beauty-merge-phone-dupes-renumber.mjs --dry-run
 *   node scripts/aqua-beauty-merge-phone-dupes-renumber.mjs --apply
 */

import pg from 'pg';

const DB = {
  host: process.env.PGHOST || '72.60.182.107',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'aqua_beauty',
};
if (!DB.password) {
  console.error('PGPASSWORD gerekli (örn. PGPASSWORD=… node scripts/aqua-beauty-merge-phone-dupes-renumber.mjs --dry-run)');
  process.exit(1);
}
const FIRM = process.env.AQUA_FIRM || '001';
const APPLY = process.argv.includes('--apply');

const CT = `public.rex_${FIRM}_customers`;

function normalizeDigits(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

function phoneDigitCores(digits) {
  const raw = String(digits ?? '').replace(/\D/g, '');
  if (!raw) return [];
  const out = new Set();
  const seed = raw.replace(/^00+/, '');
  if (!seed) return [];
  const add = (v) => {
    const s = String(v ?? '').replace(/\D/g, '');
    if (s) out.add(s);
  };
  add(seed);
  add(seed.replace(/^0+/, '') || seed);
  for (const cc of ['964', '90']) {
    if (seed.startsWith(cc) && seed.length > cc.length + 2) {
      const rest = seed.slice(cc.length);
      add(rest);
      add(rest.replace(/^0+/, '') || rest);
      if (!rest.startsWith('0')) add(`0${rest}`);
    }
  }
  if (seed.startsWith('0') && seed.length > 1) add(seed.slice(1));
  else if (!seed.startsWith('0')) add(`0${seed}`);
  for (const v of [...out]) {
    if (v.length >= 10) add(v.slice(-10));
    if (v.length >= 9) add(v.slice(-9));
    if (v.startsWith('0') && v.length > 1) add(v.slice(1));
  }
  return [...out];
}

function phoneSignificantKey(phone) {
  const digits = normalizeDigits(phone);
  if (digits.length < 7) return null;
  const cores = phoneDigitCores(digits);
  let best = '';
  for (const c of cores) {
    const bare = c.replace(/^0+/, '') || c;
    if (bare.length < 7) continue;
    const key = bare.length > 10 ? bare.slice(-10) : bare;
    if (key.length > best.length) best = key;
  }
  return best.length >= 7 ? best : null;
}

/** En güzel / düzgün isim skoru (yüksek = tercih). */
function nameScore(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return -10000;
  let s = 0;
  const parts = n.split(' ').filter(Boolean);
  s += Math.min(parts.length, 5) * 35; // çok kelimeli ad tercih
  s += Math.min(n.length, 50) * 1.5;
  // Harf oranı
  const letters = (n.match(/[A-Za-zÀ-ÖØ-öø-ÿĞğÜüŞşİıÖöÇç]/g) || []).length;
  s += (letters / Math.max(n.length, 1)) * 40;
  // Baş harf büyük / Title-ish
  if (parts.every((p) => /^[A-ZÇĞİÖŞÜÁÉÍÓÚÂÊÎÔÛÄËÏÖÜ]/.test(p))) s += 25;
  if (n === n.toUpperCase() && n.length > 4) s -= 40; // HEP BÜYÜK
  if (n === n.toLowerCase() && n.length > 4) s -= 10;
  if (/demo|test|asdf|xxx|qwerty|müşteri\s*\d|customer\s*\d/i.test(n)) s -= 200;
  if (/ltd|a\.?ş|co\.|company|ticaret|market|dağıtım|distrib/i.test(n)) s -= 15; // şirket adı kişi adından düşük
  if (/\d{3,}/.test(n)) s -= 30;
  if (parts.length === 1 && n.length <= 4) s -= 20;
  return s;
}

function pickKeeper(rows) {
  return [...rows].sort((a, b) => {
    const ns = nameScore(b.name) - nameScore(a.name);
    if (ns !== 0) return ns;
    const ap = Number(a.appointment_count || 0);
    const bp = Number(b.appointment_count || 0);
    if (bp !== ap) return bp - ap;
    const as = Number(a.total_spent || 0);
    const bs = Number(b.total_spent || 0);
    if (bs !== as) return bs - as;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  })[0];
}

function findDuplicatePhoneGroups(customers) {
  const active = customers.filter((c) => c.is_active !== false);
  const parent = new Map();
  const find = (id) => {
    let p = parent.get(id) ?? id;
    while ((parent.get(p) ?? p) !== p) p = parent.get(p);
    parent.set(id, p);
    return p;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const byId = new Map(active.map((c) => [c.id, c]));
  const keyMembers = new Map();
  for (const c of active) {
    parent.set(c.id, c.id);
    for (const raw of [c.phone, c.phone2]) {
      const key = phoneSignificantKey(raw);
      if (!key) continue;
      const list = keyMembers.get(key) ?? [];
      if (!list.includes(c.id)) list.push(c.id);
      keyMembers.set(key, list);
    }
  }
  for (const [, ids] of keyMembers) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }
  const rootToIds = new Map();
  for (const [key, ids] of keyMembers) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const root = find(id);
      if (!rootToIds.has(root)) rootToIds.set(root, new Set());
      rootToIds.get(root).add(id);
    }
  }
  const groups = [];
  for (const [, idSet] of rootToIds) {
    if (idSet.size < 2) continue;
    groups.push([...idSet].map((id) => byId.get(id)).filter(Boolean));
  }
  return groups;
}

async function findTables(client, schema, firm, suffix) {
  const periodRe = `^rex_${firm}_[0-9]+${suffix}$`;
  const firmRe = `^rex_${firm}${suffix}$`;
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = $1 AND (tablename ~ $2 OR tablename ~ $3)`,
    [schema, periodRe, firmRe],
  );
  return rows.map((r) => `${schema}."${r.tablename}"`);
}

async function findBeautyCustomerIdTables(client, firm) {
  const { rows } = await client.query(
    `SELECT c.table_schema, c.table_name
     FROM information_schema.columns c
     JOIN pg_tables t ON t.schemaname = c.table_schema AND t.tablename = c.table_name
     WHERE c.table_schema = 'beauty'
       AND c.column_name = 'customer_id'
       AND c.table_name ~ $1`,
    [`^rex_${firm}(_[0-9]+)?_`],
  );
  return rows.map((r) => `${r.table_schema}."${r.table_name}"`);
}

async function safeUpdate(client, sql, params) {
  const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await client.query(`SAVEPOINT ${sp}`);
    const res = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { ok: true, n: res.rowCount || 0 };
  } catch (e) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch {
      /* ignore */
    }
    return { ok: false, n: 0, error: e.message || String(e) };
  }
}

async function resolveMergeTargets(client) {
  const appointmentTables = await findTables(client, 'beauty', FIRM, '_beauty_appointments');
  const beautyCustomerTables = await findBeautyCustomerIdTables(client, FIRM);
  const ledger = [];
  for (const [suffix, col] of [
    ['_sales', 'customer_id'],
    ['_cash_lines', 'customer_id'],
    ['_account_movements', 'customer_id'],
    ['_bank_lines', 'customer_id'],
  ]) {
    for (const t of await findTables(client, 'public', FIRM, suffix)) {
      ledger.push({ t, col });
    }
  }
  const callPlan = ['public.customer_call_plan_weekly', 'public.customer_call_plan_weekly_archive'];
  return { appointmentTables, beautyCustomerTables, ledger, callPlan };
}

async function mergeOne(client, sourceId, targetId, notes, targets) {
  const errors = [];
  // totals
  let r = await safeUpdate(
    client,
    `UPDATE ${CT}
     SET balance = COALESCE(balance,0) + COALESCE((SELECT balance FROM ${CT} WHERE id = $2::uuid),0),
         points = COALESCE(points,0) + COALESCE((SELECT points FROM ${CT} WHERE id = $2::uuid),0),
         total_spent = COALESCE(total_spent,0) + COALESCE((SELECT total_spent FROM ${CT} WHERE id = $2::uuid),0),
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [targetId, sourceId],
  );
  if (!r.ok) errors.push(`totals: ${r.error}`);

  // fill empty fields on target from source
  await safeUpdate(
    client,
    `UPDATE ${CT} t
     SET phone = COALESCE(NULLIF(BTRIM(t.phone), ''), s.phone),
         phone2 = COALESCE(NULLIF(BTRIM(t.phone2), ''), s.phone2),
         email = COALESCE(NULLIF(BTRIM(t.email), ''), s.email),
         address = COALESCE(NULLIF(BTRIM(t.address), ''), s.address),
         occupation = COALESCE(NULLIF(BTRIM(t.occupation), ''), s.occupation),
         birth_date = COALESCE(t.birth_date, s.birth_date),
         gender = COALESCE(t.gender, s.gender),
         notes = CASE
           WHEN NULLIF(BTRIM(COALESCE(t.notes,'')), '') IS NULL THEN s.notes
           WHEN NULLIF(BTRIM(COALESCE(s.notes,'')), '') IS NULL THEN t.notes
           ELSE t.notes || E'\\n---\\n' || s.notes
         END,
         updated_at = NOW()
     FROM ${CT} s
     WHERE t.id = $1::uuid AND s.id = $2::uuid`,
    [targetId, sourceId],
  );

  for (const t of targets.appointmentTables) {
    r = await safeUpdate(client, `UPDATE ${t} SET client_id = $1::uuid WHERE client_id = $2::uuid`, [
      targetId,
      sourceId,
    ]);
    if (!r.ok) errors.push(`${t}: ${r.error}`);
  }

  for (const t of targets.beautyCustomerTables) {
    r = await safeUpdate(client, `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`, [
      targetId,
      sourceId,
    ]);
    if (!r.ok && /unique|duplicate/i.test(String(r.error || ''))) {
      await safeUpdate(client, `DELETE FROM ${t} WHERE customer_id = $1::uuid`, [sourceId]);
    } else if (!r.ok) {
      errors.push(`${t}: ${r.error}`);
    }
  }

  for (const { t, col } of targets.ledger) {
    r = await safeUpdate(client, `UPDATE ${t} SET ${col} = $1::uuid WHERE ${col} = $2::uuid`, [
      targetId,
      sourceId,
    ]);
    if (!r.ok) errors.push(`${t}: ${r.error}`);
  }

  for (const t of targets.callPlan) {
    await safeUpdate(client, `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`, [
      targetId,
      sourceId,
    ]);
  }

  r = await safeUpdate(
    client,
    `UPDATE ${CT}
     SET is_active = false,
         merged_into_id = $1::uuid,
         merged_at = NOW(),
         merge_notes = $2,
         file_id = NULL,
         balance = 0,
         updated_at = NOW()
     WHERE id = $3::uuid`,
    [targetId, notes || null, sourceId],
  );
  if (!r.ok) {
    r = await safeUpdate(
      client,
      `UPDATE ${CT}
       SET is_active = false, file_id = NULL, balance = 0, updated_at = NOW(),
           notes = COALESCE(notes,'') || $1
       WHERE id = $2::uuid`,
      [`\n[MERGE→${targetId}]`, sourceId],
    );
    if (!r.ok) errors.push(`archive: ${r.error}`);
  }

  return errors;
}

async function renumberFileIds(client) {
  await client.query(`
    UPDATE ${CT}
    SET file_id = NULL, updated_at = NOW()
    WHERE COALESCE(is_active, true) = false
      AND NULLIF(BTRIM(COALESCE(file_id, '')), '') IS NOT NULL
  `);

  await client.query(`
    UPDATE ${CT} c
    SET file_id = 'TMP_' || LPAD(sub.rn::text, 6, '0'), updated_at = NOW()
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY
                 CASE WHEN NULLIF(BTRIM(file_id), '') ~ '^[0-9]+$'
                   THEN NULLIF(BTRIM(file_id), '')::bigint END NULLS LAST,
                 created_at NULLS LAST,
                 name NULLS LAST,
                 id
             ) AS rn
      FROM ${CT}
      WHERE COALESCE(is_active, true) = true
    ) sub
    WHERE c.id = sub.id
  `);

  await client.query(`
    UPDATE ${CT} c
    SET file_id = LPAD(sub.rn::text, 4, '0'), updated_at = NOW()
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY NULLIF(BTRIM(REPLACE(file_id, 'TMP_', '')), '')::bigint
             ) AS rn
      FROM ${CT}
      WHERE file_id LIKE 'TMP_%'
    ) sub
    WHERE c.id = sub.id
  `);
}

async function main() {
  console.log(APPLY ? '=== APPLY modu ===' : '=== DRY-RUN (değişiklik yok) ===');
  console.log('DB:', DB.database, 'firm:', FIRM);

  const client = new pg.Client({ ...DB, connectionTimeoutMillis: 20000 });
  await client.connect();

  const apt = `beauty.rex_${FIRM}_01_beauty_appointments`;
  const { rows: customers } = await client.query(`
    SELECT c.id, c.name, c.phone, c.phone2, c.file_id, c.code, c.is_active,
           c.total_spent, c.points, c.created_at,
           (SELECT COUNT(*)::int FROM ${apt} a WHERE a.client_id = c.id) AS appointment_count
    FROM ${CT} c
    WHERE COALESCE(c.is_active, true) = true
  `);

  console.log('Aktif müşteri:', customers.length);
  const groups = findDuplicatePhoneGroups(customers);
  console.log('Telefon mükerrer grubu:', groups.length);
  const mergeOps = groups.reduce((s, g) => s + (g.length - 1), 0);
  console.log('Birleştirilecek kaynak kart:', mergeOps);

  // örnekler
  console.log('\nÖrnek 8 grup (kalacak isim ★):');
  for (const g of groups.slice(0, 8)) {
    const keep = pickKeeper(g);
    console.log(
      `  ★ ${keep.name} | ${keep.phone || keep.phone2} | score=${nameScore(keep.name).toFixed(0)} | +${g.length - 1} kaynak`,
    );
    for (const c of g.filter((x) => x.id !== keep.id).slice(0, 3)) {
      console.log(`      → ${c.name} (${c.phone || c.phone2}) score=${nameScore(c.name).toFixed(0)}`);
    }
  }

  if (!APPLY) {
    console.log('\nUygulamak için: node scripts/aqua-beauty-merge-phone-dupes-renumber.mjs --apply');
    await client.end();
    return;
  }

  let ok = 0;
  let fail = 0;
  const log = [];
  const BATCH = 20;

  console.log('\nHedef tablolar çözülüyor…');
  const targets = await resolveMergeTargets(client);
  console.log(
    `  randevu=${targets.appointmentTables.length}, beauty=${targets.beautyCustomerTables.length}, ledger=${targets.ledger.length}`,
  );

  try {
    await client.query('BEGIN');
    let sinceCommit = 0;

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const keep = pickKeeper(g);
      const sources = g.filter((c) => c.id !== keep.id);
      for (const src of sources) {
        const errors = await mergeOne(
          client,
          src.id,
          keep.id,
          `phone-dupe auto-merge keep="${keep.name}" drop="${src.name}"`,
          targets,
        );
        if (errors.length) {
          fail += 1;
          log.push({ keep: keep.name, src: src.name, errors });
          console.warn(`FAIL ${src.name} → ${keep.name}:`, errors.join('; '));
        } else {
          ok += 1;
        }
        sinceCommit += 1;
      }

      if (sinceCommit >= BATCH) {
        await client.query('COMMIT');
        console.log(`  … ${gi + 1}/${groups.length} grup (ok=${ok} fail=${fail}) — batch commit`);
        await client.query('BEGIN');
        sinceCommit = 0;
      } else if ((gi + 1) % 25 === 0) {
        console.log(`  … ${gi + 1}/${groups.length} grup (ok=${ok} fail=${fail})`);
      }
    }

    await client.query('COMMIT');
    console.log(`\nBirleştirme bitti. OK=${ok}, hata=${fail}`);

    console.log('file_id yeniden numaralanıyor (0001…)…');
    await client.query('BEGIN');
    await renumberFileIds(client);

    const { rows: v } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS active_fid,
        MIN(file_id) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS min_fid,
        MAX(NULLIF(BTRIM(file_id),'')::bigint) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS max_fid,
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=true) AS active_n,
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=false) AS passive_n
      FROM ${CT}
    `);
    const row = v[0];
    if (Number(row.active_fid) !== Number(row.active_n)) {
      throw new Error(`file_id sayısı uyuşmuyor: active_fid=${row.active_fid} active_n=${row.active_n}`);
    }
    if (String(row.min_fid) !== '0001') {
      throw new Error(`min file_id ${row.min_fid}, beklenen 0001`);
    }
    if (Number(row.max_fid) !== Number(row.active_n)) {
      throw new Error(`max ${row.max_fid} != active ${row.active_n}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ COMMIT');
    console.log(`Birleştirme OK: ${ok}, hata: ${fail}`);
    console.log(
      `Aktif: ${row.active_n}, pasif: ${row.passive_n}, file_id ${row.min_fid}..${row.max_fid}`,
    );
    if (log.length) {
      console.log('İlk hatalar:', JSON.stringify(log.slice(0, 5), null, 2));
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('ROLLBACK:', e.message || e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
