/**
 * Rapor Oluşturucu — kayıtlı SELECT raporları (firma bazlı).
 */

import { ERP_SETTINGS, postgres } from './postgres';
import { assertSafeSelectSql } from './tenantReportSchemaService';

export type SavedCustomReport = {
  id: string;
  firmNr: string;
  name: string;
  description: string | null;
  sqlText: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function firmNr(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

function mapRow(row: Record<string, unknown>): SavedCustomReport {
  return {
    id: String(row.id),
    firmNr: String(row.firm_nr ?? ''),
    name: String(row.name ?? ''),
    description: row.description != null ? String(row.description) : null,
    sqlText: String(row.sql_text ?? ''),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function listSavedCustomReports(): Promise<SavedCustomReport[]> {
  const fn = firmNr();
  const { rows } = await postgres.query(
    `SELECT id, firm_nr, name, description, sql_text, created_by, created_at, updated_at
     FROM public.custom_saved_reports
     WHERE firm_nr = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [fn]
  );
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function saveCustomReport(input: {
  name: string;
  sqlText: string;
  description?: string;
  id?: string;
  createdBy?: string;
}): Promise<SavedCustomReport> {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Rapor adı zorunlu.');
  const sqlText = assertSafeSelectSql(input.sqlText);
  const fn = firmNr();
  const desc = input.description?.trim() || null;
  const by = input.createdBy?.trim() || null;

  if (input.id) {
    const { rows } = await postgres.query(
      `UPDATE public.custom_saved_reports
       SET name = $1, description = $2, sql_text = $3, updated_at = now()
       WHERE id = $4::uuid AND firm_nr = $5
       RETURNING id, firm_nr, name, description, sql_text, created_by, created_at, updated_at`,
      [name, desc, sqlText, input.id, fn]
    );
    if (!rows?.[0]) throw new Error('Rapor bulunamadı veya güncellenemedi.');
    return mapRow(rows[0] as Record<string, unknown>);
  }

  const { rows } = await postgres.query(
    `INSERT INTO public.custom_saved_reports (firm_nr, name, description, sql_text, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, firm_nr, name, description, sql_text, created_by, created_at, updated_at`,
    [fn, name, desc, sqlText, by]
  );
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function deleteSavedCustomReport(id: string): Promise<void> {
  const fn = firmNr();
  await postgres.query(
    `DELETE FROM public.custom_saved_reports WHERE id = $1::uuid AND firm_nr = $2`,
    [id, fn]
  );
}
