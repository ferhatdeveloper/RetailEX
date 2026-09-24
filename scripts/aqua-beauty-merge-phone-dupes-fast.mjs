/**
 * Hızlı bitirici: kalan telefon mükerrerlerini toplu SQL ile birleştir + file_id 0001…
 * Önceki batch commit’ler korunur; yalnızca kalan aktif mükerrerler işlenir.
 *
 *   node scripts/aqua-beauty-merge-phone-dupes-fast.mjs --apply
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
  console.error('PGPASSWORD gerekli (örn. PGPASSWORD=… node scripts/aqua-beauty-merge-phone-dupes-fast.mjs --apply)');
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

function nameScore(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return -10000;
  let s = 0;
  const parts = n.split(' ').filter(Boolean);
  s += Math.min(parts.length, 5) * 35;
  s += Math.min(n.length, 50) * 1.5;
  const letters = (n.match(/[A-Za-zÀ-ÖØ-öø-ÿĞğÜüŞşİıÖöÇç]/g) || []).length;
  s += (letters / Math.max(n.length, 1)) * 40;
  if (parts.every((p) => /^[A-ZÇĞİÖŞÜÁÉÍÓÚÂÊÎÔÛÄËÏÖÜ]/.test(p))) s += 25;
  if (n === n.toUpperCase() && n.length > 4) s -= 40;
  if (n === n.toLowerCase() && n.length > 4) s -= 10;
  if (/demo|test|asdf|xxx|qwerty|müşteri\s*\d|customer\s*\d/i.test(n)) s -= 200;
  if (/ltd|a\.?ş|co\.|company|ticaret|market|dağıtım|distrib/i.test(n)) s -= 15;
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
  for (const [, ids] of keyMembers) {
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

async function main() {
  console.log(APPLY ? '=== FAST APPLY ===' : '=== DRY-RUN ===');
  const client = new pg.Client({ ...DB, connectionTimeoutMillis: 20000 });
  await client.connect();

  const apt = `beauty.rex_${FIRM}_01_beauty_appointments`;
  const { rows: customers } = await client.query(`
    SELECT c.id, c.name, c.phone, c.phone2, c.file_id, c.is_active,
           c.total_spent, c.points, c.created_at,
           (SELECT COUNT(*)::int FROM ${apt} a WHERE a.client_id = c.id) AS appointment_count
    FROM ${CT} c
    WHERE COALESCE(c.is_active, true) = true
  `);

  const groups = findDuplicatePhoneGroups(customers);
  const pairs = [];
  for (const g of groups) {
    const keep = pickKeeper(g);
    for (const src of g.filter((c) => c.id !== keep.id)) {
      pairs.push({
        source_id: src.id,
        target_id: keep.id,
        notes: `phone-dupe auto-merge keep="${keep.name}" drop="${src.name}"`,
      });
    }
  }

  console.log('Aktif:', customers.length, '| kalan grup:', groups.length, '| kalan kaynak:', pairs.length);

  if (!APPLY) {
    await client.end();
    return;
  }

  if (pairs.length === 0) {
    console.log('Kalan mükerrer yok — yalnızca file_id renumber');
  }

  const t0 = Date.now();
  await client.query('BEGIN');
  const step = async (label, fn) => {
    const a = Date.now();
    try {
      await fn();
      console.log(`  ✓ ${label} (${Date.now() - a}ms)`);
    } catch (e) {
      console.error(`  ✗ ${label}:`, e.message || e);
      throw e;
    }
  };
  try {
    await step('temp', async () => {
      await client.query(`
        CREATE TEMP TABLE tmp_phone_merge (
          source_id uuid PRIMARY KEY,
          target_id uuid NOT NULL,
          notes text
        ) ON COMMIT DROP
      `);
    });

    await step('insert', async () => {
      const chunk = 200;
      for (let i = 0; i < pairs.length; i += chunk) {
        const slice = pairs.slice(i, i + chunk);
        const vals = [];
        const params = [];
        let n = 1;
        for (const p of slice) {
          vals.push(`($${n++}::uuid, $${n++}::uuid, $${n++})`);
          params.push(p.source_id, p.target_id, p.notes);
        }
        await client.query(
          `INSERT INTO tmp_phone_merge (source_id, target_id, notes) VALUES ${vals.join(',')}`,
          params,
        );
      }
    });

    await step('totals', async () => {
      await client.query(`
        UPDATE ${CT} t
        SET balance = COALESCE(t.balance,0) + s.sum_balance,
            points = COALESCE(t.points,0) + s.sum_points,
            total_spent = COALESCE(t.total_spent,0) + s.sum_spent,
            updated_at = NOW()
        FROM (
          SELECT m.target_id,
                 SUM(COALESCE(c.balance,0)) AS sum_balance,
                 SUM(COALESCE(c.points,0)) AS sum_points,
                 SUM(COALESCE(c.total_spent,0)) AS sum_spent
          FROM tmp_phone_merge m
          JOIN ${CT} c ON c.id = m.source_id
          GROUP BY m.target_id
        ) s
        WHERE t.id = s.target_id
      `);
    });

    await step('fill_fields', async () => {
      await client.query(`
        UPDATE ${CT} t
        SET phone = COALESCE(NULLIF(BTRIM(t.phone), ''), s.phone),
            phone2 = COALESCE(NULLIF(BTRIM(t.phone2), ''), s.phone2),
            email = COALESCE(NULLIF(BTRIM(t.email), ''), s.email),
            address = COALESCE(NULLIF(BTRIM(t.address), ''), s.address),
            updated_at = NOW()
        FROM (
          SELECT DISTINCT ON (m.target_id)
                 m.target_id, c.phone, c.phone2, c.email, c.address
          FROM tmp_phone_merge m
          JOIN ${CT} c ON c.id = m.source_id
          ORDER BY m.target_id, c.created_at NULLS LAST
        ) s
        WHERE t.id = s.target_id
      `);
    });

    await step('appointments', async () => {
      await client.query(`
        UPDATE beauty.rex_${FIRM}_01_beauty_appointments a
        SET client_id = m.target_id
        FROM tmp_phone_merge m
        WHERE a.client_id = m.source_id
      `);
    });

    const { rows: beautyTables } = await client.query(
      `SELECT table_schema, table_name
       FROM information_schema.columns
       WHERE table_schema = 'beauty' AND column_name = 'customer_id'
         AND table_name ~ $1`,
      [`^rex_${FIRM}(_[0-9]+)?_`],
    );
    for (const bt of beautyTables) {
      const t = `${bt.table_schema}."${bt.table_name}"`;
      const sp = `sp_b_${bt.table_name.replace(/\W/g, '_').slice(0, 40)}`;
      await step(`beauty:${bt.table_name}`, async () => {
        try {
          await client.query(`SAVEPOINT ${sp}`);
          await client.query(`
            UPDATE ${t} x SET customer_id = m.target_id
            FROM tmp_phone_merge m WHERE x.customer_id = m.source_id
          `);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (e) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          if (/unique|duplicate/i.test(e.message || '')) {
            await client.query(
              `DELETE FROM ${t} x USING tmp_phone_merge m WHERE x.customer_id = m.source_id`,
            );
          } else {
            throw e;
          }
        }
      });
    }

    for (const [suffix, col] of [
      ['_sales', 'customer_id'],
      ['_cash_lines', 'customer_id'],
      ['_account_movements', 'customer_id'],
      ['_bank_lines', 'customer_id'],
    ]) {
      const { rows: tabs } = await client.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND (tablename ~ $1 OR tablename ~ $2)`,
        [`^rex_${FIRM}_[0-9]+${suffix}$`, `^rex_${FIRM}${suffix}$`],
      );
      for (const r of tabs) {
        await step(`ledger:${r.tablename}`, async () => {
          await client.query(`
            UPDATE public."${r.tablename}" x SET ${col} = m.target_id
            FROM tmp_phone_merge m WHERE x.${col} = m.source_id
          `);
        });
      }
    }

    for (const t of ['public.customer_call_plan_weekly', 'public.customer_call_plan_weekly_archive']) {
      const sp = `sp_cp_${t.split('.').pop()}`;
      await step(`call:${t}`, async () => {
        try {
          await client.query(`SAVEPOINT ${sp}`);
          await client.query(`
            UPDATE ${t} x SET customer_id = m.target_id
            FROM tmp_phone_merge m WHERE x.customer_id = m.source_id
          `);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        }
      });
    }

    await step('archive', async () => {
      const arch = await client.query(`
        UPDATE ${CT} c
        SET is_active = false,
            merged_into_id = m.target_id,
            merged_at = NOW(),
            merge_notes = m.notes,
            file_id = NULL,
            balance = 0,
            updated_at = NOW()
        FROM tmp_phone_merge m
        WHERE c.id = m.source_id
      `);
      console.log(`    arşiv rowCount=${arch.rowCount}`);
    });

    await client.query('COMMIT');
    console.log('Merge COMMIT');

    // Renumber
    console.log('file_id 0001…');
    await client.query('BEGIN');
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

    const { rows: v } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS active_fid,
        MIN(file_id) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS min_fid,
        MAX(NULLIF(BTRIM(file_id),'')::bigint) FILTER (WHERE COALESCE(is_active,true)=true AND file_id ~ '^[0-9]+$') AS max_fid,
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=true) AS active_n,
        COUNT(*) FILTER (WHERE COALESCE(is_active,true)=false) AS passive_n,
        COUNT(*) FILTER (WHERE merged_into_id IS NOT NULL) AS merged_n
      FROM ${CT}
    `);
    const row = v[0];
    if (Number(row.active_fid) !== Number(row.active_n)) {
      throw new Error(`file_id uyuşmazlığı: ${row.active_fid} vs ${row.active_n}`);
    }
    if (String(row.min_fid) !== '0001') throw new Error(`min=${row.min_fid}`);
    if (Number(row.max_fid) !== Number(row.active_n)) {
      throw new Error(`max=${row.max_fid} active=${row.active_n}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ BİTTİ', `${Date.now() - t0}ms`);
    console.log(
      `Aktif: ${row.active_n}, pasif: ${row.passive_n}, birleşmiş: ${row.merged_n}, file_id ${row.min_fid}..${row.max_fid}`,
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('HATA:', e.message || e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
