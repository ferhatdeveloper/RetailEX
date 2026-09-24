/**
 * Müşteri (customers) birleştirme — aynı dosya no / mükerrer kart.
 *
 * Kaynak → hedef: hareketler hedefe taşınır, kaynak arşivlenir
 * (is_active=false, merged_into_id, file_id temizlenir).
 *
 * Ayrıca: mükerrer file_id listesi ve tek karta yeni benzersiz dosya no verme.
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { beautyService } from '../beautyService';
import type { BeautyCustomer } from '../../types/beauty';
import { parseFileIdNumber } from '../../utils/customerFileIdSort';

export type DuplicateFileIdGroup = {
  fileKey: string;
  fileNum: number;
  customers: BeautyCustomer[];
};

export type CustomerMergePreview = {
  source: BeautyCustomer;
  target: BeautyCustomer;
  counts: {
    beautyAppointments: number;
    beautyCustomerIdRows: number;
    sales: number;
    cashLines: number;
    accountMovements: number;
    bankLines: number;
  };
  projectedBalance: number;
  projectedPoints: number;
  warnings: string[];
};

export type CustomerMergeResult = {
  sourceId: string;
  targetId: string;
  applied: { step: string; table: string; rowsAffected: number; ok: boolean; error?: string }[];
};

export type ReassignFileIdResult = {
  customerId: string;
  oldFileId: string | null;
  newFileId: string;
};

function customersTable(firmNr: string): string {
  return `public.rex_${firmNr}_customers`;
}

async function loadCustomer(id: string): Promise<BeautyCustomer | null> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const t = customersTable(firmNr);
  try {
    const { rows } = await postgres.query(
      `SELECT id, code, name, phone, phone2, age, birth_date, file_id, occupation,
              gender, customer_tier, heard_from, email, address, city, points,
              total_spent, balance, is_active, notes, created_at
       FROM ${t}
       WHERE id = $1::uuid
       LIMIT 1`,
      [id],
    );
    const row = rows?.[0];
    if (!row) return null;
    return row as BeautyCustomer;
  } catch {
    const list = await beautyService.getCustomers();
    return list.find(c => c.id === id) ?? null;
  }
}

/** Yüklü müşteri listesinden sayısal file_id mükerrer grupları. */
export function findDuplicateFileIdGroups(customers: BeautyCustomer[]): DuplicateFileIdGroup[] {
  const map = new Map<number, BeautyCustomer[]>();
  for (const c of customers) {
    if (c.is_active === false) continue;
    const n = parseFileIdNumber(c.file_id);
    if (n == null) continue;
    const arr = map.get(n) ?? [];
    arr.push(c);
    map.set(n, arr);
  }
  const groups: DuplicateFileIdGroup[] = [];
  for (const [fileNum, list] of map) {
    if (list.length < 2) continue;
    groups.push({
      fileKey: String(fileNum),
      fileNum,
      customers: [...list].sort((a, b) =>
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
      ),
    });
  }
  groups.sort((a, b) => a.fileNum - b.fileNum);
  return groups;
}

export async function assertFileIdAvailable(
  fileId: string | null | undefined,
  excludeCustomerId?: string | null,
): Promise<void> {
  const raw = String(fileId ?? '').trim();
  if (!raw) return;
  const n = parseFileIdNumber(raw);
  if (n == null) return;
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const t = customersTable(firmNr);
  const params: unknown[] = [n];
  let sql = `
    SELECT id, name, file_id FROM ${t}
    WHERE COALESCE(is_active, true) = true
      AND merged_into_id IS NULL
      AND NULLIF(BTRIM(file_id), '') ~ '^[0-9]+$'
      AND NULLIF(BTRIM(file_id), '')::bigint = $1`;
  if (excludeCustomerId) {
    params.push(excludeCustomerId);
    sql += ` AND id <> $2::uuid`;
  }
  sql += ` LIMIT 1`;
  const { rows } = await postgres.query(sql, params);
  if (rows?.[0]) {
    const other = rows[0] as { name?: string; file_id?: string };
    throw new Error(
      `Dosya no ${raw} zaten kullanılıyor` +
        (other.name ? ` (${other.name})` : '') +
        '. Aynı numara iki müşteride olamaz.',
    );
  }
}

export async function previewCustomerMerge(
  sourceId: string,
  targetId: string,
): Promise<CustomerMergePreview> {
  if (sourceId === targetId) throw new Error('Kaynak ve hedef aynı olamaz.');
  const source = await loadCustomer(sourceId);
  const target = await loadCustomer(targetId);
  if (!source) throw new Error('Kaynak müşteri bulunamadı.');
  if (!target) throw new Error('Hedef müşteri bulunamadı.');

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const counts = await countCustomerRefs(firmNr, sourceId);
  const warnings: string[] = [];
  const sPhone = String(source.phone ?? '').replace(/\D/g, '');
  const tPhone = String(target.phone ?? '').replace(/\D/g, '');
  if (sPhone && tPhone && sPhone.slice(-10) !== tPhone.slice(-10)) {
    warnings.push(
      'Telefon numaraları farklı görünüyor; yanlışlıkla iki ayrı kişiyi birleştirmeyin. ' +
        'Gerekirse “Yeni dosya no” ile ayırın.',
    );
  }
  if ((Number(source.balance) || 0) !== 0 && (Number(target.balance) || 0) !== 0) {
    warnings.push(
      `Her iki kartın bakiyesi sıfır değil (kaynak: ${source.balance}, hedef: ${target.balance}). Birleştirmede bakiyeler toplanır.`,
    );
  }

  return {
    source,
    target,
    counts,
    projectedBalance: (Number(target.balance) || 0) + (Number(source.balance) || 0),
    projectedPoints: (Number(target.points) || 0) + (Number(source.points) || 0),
    warnings,
  };
}

export async function executeCustomerMerge(
  sourceId: string,
  targetId: string,
  options: { mergedBy?: string; notes?: string } = {},
): Promise<CustomerMergeResult> {
  if (sourceId === targetId) throw new Error('Kaynak ve hedef aynı olamaz.');
  const source = await loadCustomer(sourceId);
  const target = await loadCustomer(targetId);
  if (!source) throw new Error('Kaynak müşteri bulunamadı.');
  if (!target) throw new Error('Hedef müşteri bulunamadı.');
  if (target.is_active === false) throw new Error('Hedef müşteri pasif; önce aktif edin.');

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const ct = customersTable(firmNr);
  const applied: CustomerMergeResult['applied'] = [];

  const bal = Number(source.balance) || 0;
  const pts = Number(source.points) || 0;
  const spent = Number(source.total_spent) || 0;
  const balRes = await safeRun(
    'target_totals',
    ct,
    `UPDATE ${ct}
     SET balance = COALESCE(balance,0) + $1::numeric,
         points = COALESCE(points,0) + $2::numeric,
         total_spent = COALESCE(total_spent,0) + $3::numeric,
         updated_at = NOW()
     WHERE id = $4::uuid`,
    [bal, pts, spent, targetId],
  );
  applied.push({ step: 'target_totals', table: ct, rowsAffected: balRes.rows, ok: balRes.ok, error: balRes.error });
  if (!balRes.ok) throw new Error(`Hedef bakiye güncellenemedi: ${balRes.error}`);

  const beautyAppt = await findTables('beauty', firmNr, '_beauty_appointments');
  for (const t of beautyAppt) {
    const res = await safeRun(
      'beauty_appointments.client_id',
      t,
      `UPDATE ${t} SET client_id = $1::uuid WHERE client_id = $2::uuid`,
      [targetId, sourceId],
    );
    applied.push({ step: 'beauty_appointments', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`${t}: ${res.error}`);
  }

  const beautyCustCols = await findBeautyCustomerIdTables(firmNr);
  for (const t of beautyCustCols) {
    const res = await safeRun(
      'beauty.customer_id',
      t,
      `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`,
      [targetId, sourceId],
    );
    applied.push({
      step: 'beauty_customer_id',
      table: t,
      rowsAffected: res.rows,
      ok: res.ok,
      error: res.error,
    });
    // UNIQUE çakışmada kaynak satırını silmeyi dene
    if (!res.ok && /unique|duplicate/i.test(String(res.error || ''))) {
      const del = await safeRun(
        'beauty.customer_id_dedupe_delete',
        t,
        `DELETE FROM ${t} WHERE customer_id = $1::uuid`,
        [sourceId],
      );
      applied.push({
        step: 'beauty_customer_id_dedupe',
        table: t,
        rowsAffected: del.rows,
        ok: del.ok,
        error: del.error,
      });
      if (!del.ok) throw new Error(`${t}: ${res.error}`);
    } else if (!res.ok) {
      throw new Error(`${t}: ${res.error}`);
    }
  }

  for (const [step, suffix, col] of [
    ['sales', '_sales', 'customer_id'],
    ['cash_lines', '_cash_lines', 'customer_id'],
    ['account_movements', '_account_movements', 'customer_id'],
    ['bank_lines', '_bank_lines', 'customer_id'],
  ] as const) {
    const tables = await findTables('public', firmNr, suffix);
    for (const t of tables) {
      const res = await safeRun(
        step,
        t,
        `UPDATE ${t} SET ${col} = $1::uuid WHERE ${col} = $2::uuid`,
        [targetId, sourceId],
      );
      applied.push({ step, table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
      if (!res.ok) throw new Error(`${t}: ${res.error}`);
    }
  }

  // call plan
  for (const t of ['public.customer_call_plan_weekly', 'public.customer_call_plan_weekly_archive']) {
    const res = await safeRun(
      'call_plan',
      t,
      `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`,
      [targetId, sourceId],
    );
    applied.push({ step: 'call_plan', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    // tablo yoksa yoksay
  }

  const archiveSql = `
    UPDATE ${ct}
    SET is_active = false,
        merged_into_id = $1::uuid,
        merged_at = NOW(),
        merged_by = $2,
        merge_notes = $3,
        file_id = NULL,
        balance = 0,
        updated_at = NOW()
    WHERE id = $4::uuid`;
  const arch = await safeRun('source_archive', ct, archiveSql, [
    targetId,
    options.mergedBy || null,
    options.notes || null,
    sourceId,
  ]);
  applied.push({
    step: 'source_archive',
    table: ct,
    rowsAffected: arch.rows,
    ok: arch.ok,
    error: arch.error,
  });
  if (!arch.ok) {
    // kolon yoksa fallback
    const fallback = await safeRun(
      'source_archive_fallback',
      ct,
      `UPDATE ${ct}
       SET is_active = false, file_id = NULL, balance = 0, updated_at = NOW(),
           notes = COALESCE(notes,'') || $1
       WHERE id = $2::uuid`,
      [`\n[MERGE→${targetId}] ${options.notes || ''}`.trim(), sourceId],
    );
    applied.push({
      step: 'source_archive_fallback',
      table: ct,
      rowsAffected: fallback.rows,
      ok: fallback.ok,
      error: fallback.error,
    });
    if (!fallback.ok) throw new Error(`Kaynak arşivlenemedi: ${arch.error || fallback.error}`);
  }

  return { sourceId, targetId, applied };
}

/** Mükerrer dosya nolu karta yeni benzersiz numara verir (birleştirmez). */
export async function reassignUniqueFileId(customerId: string): Promise<ReassignFileIdResult> {
  const c = await loadCustomer(customerId);
  if (!c) throw new Error('Müşteri bulunamadı.');
  const oldFileId = c.file_id != null ? String(c.file_id) : null;
  const next = await beautyService.generateNextFileId();
  await assertFileIdAvailable(next, customerId);
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const ct = customersTable(firmNr);
  const { rowCount } = await postgres.query(
    `UPDATE ${ct} SET file_id = $1, updated_at = NOW() WHERE id = $2::uuid`,
    [next, customerId],
  );
  if (!rowCount) throw new Error('Dosya no güncellenemedi.');
  return { customerId, oldFileId, newFileId: next };
}

/* --------------------- dahili --------------------- */

async function findTables(schema: string, firmNr: string, suffix: string): Promise<string[]> {
  const periodRe = `^rex_${firmNr}_[0-9]+${suffix}$`;
  const firmRe = `^rex_${firmNr}${suffix}$`;
  const { rows } = await postgres.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = $1 AND (tablename ~ $2 OR tablename ~ $3)`,
    [schema, periodRe, firmRe],
  );
  return (rows || []).map((r: { tablename: string }) => `${schema}."${r.tablename}"`);
}

async function findBeautyCustomerIdTables(firmNr: string): Promise<string[]> {
  const { rows } = await postgres.query(
    `SELECT c.table_schema, c.table_name
     FROM information_schema.columns c
     JOIN pg_tables t
       ON t.schemaname = c.table_schema AND t.tablename = c.table_name
     WHERE c.table_schema = 'beauty'
       AND c.column_name = 'customer_id'
       AND c.table_name ~ $1`,
    [`^rex_${firmNr}(_[0-9]+)?_`],
  );
  return (rows || []).map(
    (r: { table_schema: string; table_name: string }) =>
      `${r.table_schema}."${r.table_name}"`,
  );
}

async function countCustomerRefs(firmNr: string, sourceId: string) {
  const beautyAppt = await findTables('beauty', firmNr, '_beauty_appointments');
  let beautyAppointments = 0;
  for (const t of beautyAppt) {
    try {
      const { rows } = await postgres.query(
        `SELECT COUNT(*)::int AS c FROM ${t} WHERE client_id = $1::uuid`,
        [sourceId],
      );
      beautyAppointments += Number(rows?.[0]?.c || 0);
    } catch {
      /* ignore */
    }
  }
  const beautyCust = await findBeautyCustomerIdTables(firmNr);
  let beautyCustomerIdRows = 0;
  for (const t of beautyCust) {
    try {
      const { rows } = await postgres.query(
        `SELECT COUNT(*)::int AS c FROM ${t} WHERE customer_id = $1::uuid`,
        [sourceId],
      );
      beautyCustomerIdRows += Number(rows?.[0]?.c || 0);
    } catch {
      /* ignore */
    }
  }
  const countPublic = async (suffix: string, col: string) => {
    let n = 0;
    for (const t of await findTables('public', firmNr, suffix)) {
      try {
        const { rows } = await postgres.query(
          `SELECT COUNT(*)::int AS c FROM ${t} WHERE ${col} = $1::uuid`,
          [sourceId],
        );
        n += Number(rows?.[0]?.c || 0);
      } catch {
        /* ignore */
      }
    }
    return n;
  };
  return {
    beautyAppointments,
    beautyCustomerIdRows,
    sales: await countPublic('_sales', 'customer_id'),
    cashLines: await countPublic('_cash_lines', 'customer_id'),
    accountMovements: await countPublic('_account_movements', 'customer_id'),
    bankLines: await countPublic('_bank_lines', 'customer_id'),
  };
}

async function safeRun(
  _step: string,
  _table: string,
  sql: string,
  params: unknown[],
): Promise<{ ok: boolean; rows: number; error?: string }> {
  try {
    const { rowCount } = await postgres.query(sql, params);
    return { ok: true, rows: rowCount || 0 };
  } catch (err: unknown) {
    return { ok: false, rows: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
