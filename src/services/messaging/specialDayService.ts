/**
 * Özel gün tanımları (bayram vb.) — otomatik WhatsApp kampanyası.
 */
import { v4 as uuidv4 } from 'uuid';
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { ERP_SETTINGS, postgres } from '../postgres';

export interface SpecialDayRow {
  id: string;
  firm_nr?: string;
  name: string;
  month: number;
  day: number;
  fixed_date?: string | null;
  days_before: number;
  send_time: string;
  template_id?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function specialDaysTable(): string {
  return postgres.getCardTableName('special_days', 'public');
}

function mapRow(r: Record<string, unknown>): SpecialDayRow {
  return {
    id: String(r.id ?? ''),
    firm_nr: r.firm_nr != null ? String(r.firm_nr) : undefined,
    name: String(r.name ?? ''),
    month: Number(r.month) || 1,
    day: Number(r.day) || 1,
    fixed_date: r.fixed_date != null ? String(r.fixed_date).slice(0, 10) : null,
    days_before: Number(r.days_before) || 0,
    send_time: String(r.send_time || '10:00').slice(0, 8),
    template_id: r.template_id != null ? String(r.template_id) : null,
    is_active: r.is_active !== false,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

/** Özel günün bu yılki takvim tarihi (YYYY-MM-DD). */
export function specialDayOccurrenceDate(day: SpecialDayRow, year: number): string {
  if (day.fixed_date) return day.fixed_date.slice(0, 10);
  const m = String(Math.min(12, Math.max(1, day.month))).padStart(2, '0');
  const d = String(Math.min(31, Math.max(1, day.day))).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Bugün, özel günün (event - days_before) gönderim günü mü? */
export function isSpecialDaySendDue(day: SpecialDayRow, now = new Date()): boolean {
  const y = now.getFullYear();
  const occ = specialDayOccurrenceDate(day, y);
  const occDate = new Date(`${occ}T12:00:00`);
  if (Number.isNaN(occDate.getTime())) return false;
  const sendDate = new Date(occDate);
  sendDate.setDate(sendDate.getDate() - Math.max(0, day.days_before || 0));
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sendYmd = `${sendDate.getFullYear()}-${String(sendDate.getMonth() + 1).padStart(2, '0')}-${String(sendDate.getDate()).padStart(2, '0')}`;
  return today === sendYmd;
}

export function timeMatchesNow(sendTime: string, now = new Date(), toleranceMinutes = 1): boolean {
  const raw = String(sendTime || '10:00').trim();
  const [hh, mm] = raw.split(':').map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  const target = hh * 60 + mm;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.abs(current - target) <= Math.max(0, toleranceMinutes);
}

export const specialDayService = {
  async list(activeOnly = false): Promise<SpecialDayRow[]> {
    const fn = firmNrRow();
    if (shouldUseTenantPostgrestApi()) {
      try {
        const { postgrest } = await import('../api/postgrestClient');
        const params: Record<string, string | number> = {
          select: '*',
          order: 'month.asc,day.asc',
          limit: 200,
        };
        if (activeOnly) params.is_active = 'eq.true';
        const rows = await postgrest.get<Record<string, unknown>[]>(
          `/rex_${fn}_special_days`,
          params,
          { schema: 'public' },
        );
        return (Array.isArray(rows) ? rows : []).map(mapRow);
      } catch {
        return [];
      }
    }
    const t = specialDaysTable();
    const { rows } = await postgres.query(
      activeOnly
        ? `SELECT * FROM ${t} WHERE COALESCE(is_active, true) = true ORDER BY month, day`
        : `SELECT * FROM ${t} ORDER BY month, day`,
      [],
      { firmNr: fn },
    );
    return (rows as Record<string, unknown>[]).map(mapRow);
  },

  async create(data: {
    name: string;
    month: number;
    day: number;
    fixed_date?: string | null;
    days_before?: number;
    send_time?: string;
    template_id?: string | null;
    is_active?: boolean;
  }): Promise<SpecialDayRow> {
    const fn = firmNrRow();
    const row = {
      id: uuidv4(),
      firm_nr: fn,
      name: data.name.trim(),
      month: Math.min(12, Math.max(1, Number(data.month) || 1)),
      day: Math.min(31, Math.max(1, Number(data.day) || 1)),
      fixed_date: data.fixed_date || null,
      days_before: Math.max(0, Number(data.days_before) || 0),
      send_time: (data.send_time || '10:00').slice(0, 8),
      template_id: data.template_id || null,
      is_active: data.is_active !== false,
    };
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.post(`/rex_${fn}_special_days`, [row], {
        schema: 'public',
        prefer: 'return=minimal',
      });
      return mapRow(row as unknown as Record<string, unknown>);
    }
    const t = specialDaysTable();
    await postgres.query(
      `INSERT INTO ${t} (id, firm_nr, name, month, day, fixed_date, days_before, send_time, template_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.id,
        fn,
        row.name,
        row.month,
        row.day,
        row.fixed_date,
        row.days_before,
        row.send_time,
        row.template_id,
        row.is_active,
      ],
      { firmNr: fn },
    );
    return mapRow(row as unknown as Record<string, unknown>);
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      month: number;
      day: number;
      fixed_date: string | null;
      days_before: number;
      send_time: string;
      template_id: string | null;
      is_active: boolean;
    }>,
  ): Promise<void> {
    const fn = firmNrRow();
    const list = await specialDayService.list(false);
    const cur = list.find((r) => r.id === id);
    if (!cur) return;
    const merged = {
      name: data.name?.trim() ?? cur.name,
      month: data.month ?? cur.month,
      day: data.day ?? cur.day,
      fixed_date: data.fixed_date !== undefined ? data.fixed_date : cur.fixed_date,
      days_before: data.days_before ?? cur.days_before,
      send_time: data.send_time ?? cur.send_time,
      template_id: data.template_id !== undefined ? data.template_id : cur.template_id,
      is_active: data.is_active ?? cur.is_active !== false,
    };
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.patch(
        `/rex_${fn}_special_days?id=eq.${encodeURIComponent(id)}`,
        { ...merged, updated_at: new Date().toISOString() },
        { schema: 'public', prefer: 'return=minimal' },
      );
      return;
    }
    const t = specialDaysTable();
    await postgres.query(
      `UPDATE ${t} SET name=$2, month=$3, day=$4, fixed_date=$5, days_before=$6,
        send_time=$7, template_id=$8, is_active=$9, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [
        id,
        merged.name,
        merged.month,
        merged.day,
        merged.fixed_date,
        merged.days_before,
        merged.send_time,
        merged.template_id,
        merged.is_active,
      ],
      { firmNr: fn },
    );
  },

  async remove(id: string): Promise<void> {
    const fn = firmNrRow();
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.delete(`/rex_${fn}_special_days?id=eq.${encodeURIComponent(id)}`, {
        schema: 'public',
      });
      return;
    }
    const t = specialDaysTable();
    await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id], { firmNr: fn });
  },
};
