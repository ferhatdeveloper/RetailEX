/**
 * Kullanıcı tanımlı WhatsApp mesaj şablonları (firma kart).
 */
import { v4 as uuidv4 } from 'uuid';
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { ERP_SETTINGS, postgres } from '../postgres';

export type MessageTemplateCategory = 'general' | 'birthday' | 'special_day' | string;

export interface MessageTemplateRow {
  id: string;
  firm_nr?: string;
  name: string;
  body_text: string;
  category: MessageTemplateCategory;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Mesaj gövdesini iki parçaya ayır: kısa başlık (headline) + ana metin (body).
 * Saklama formatı: `headline` boşsa tüm metin `body`; doluysa `headline\n\nbody`.
 * Birleşik modda kaydedilen metinler (kullanıcı tek alana yazdı) olduğu gibi
 * döner — sadece ilk "\n\n" sınırında ayrılır; sınır yoksa `body` dolu, `headline` boş kalır.
 */
export function splitHeadlineAndBody(bodyText: string): { headline: string; body: string } {
  const raw = String(bodyText ?? '');
  if (!raw) return { headline: '', body: '' };
  const idx = raw.indexOf('\n\n');
  if (idx <= 0) return { headline: '', body: raw };
  const head = raw.slice(0, idx).trim();
  const body = raw.slice(idx + 2);
  // Başlık tek satır olmalı; aksi halde ayrımı koruma
  if (head.includes('\n')) return { headline: '', body: raw };
  if (!head) return { headline: '', body: raw };
  return { headline: head, body };
}

export function composeHeadlineAndBody(headline: string, body: string): string {
  const h = headline.trim();
  const b = body.trim();
  if (!h) return b;
  if (!b) return h;
  return `${h}\n\n${b}`;
}

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function templatesTable(): string {
  return postgres.getCardTableName('message_templates', 'public');
}

export const messageTemplateService = {
  async list(activeOnly = false): Promise<MessageTemplateRow[]> {
    const fn = firmNrRow();
    if (shouldUseTenantPostgrestApi()) {
      try {
        const { postgrest } = await import('../api/postgrestClient');
        const params: Record<string, string | number> = {
          select: '*',
          order: 'name.asc',
          limit: 500,
        };
        if (activeOnly) params.is_active = 'eq.true';
        const rows = await postgrest.get<MessageTemplateRow[]>(
          `/rex_${fn}_message_templates`,
          params,
          { schema: 'public' },
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
    const t = templatesTable();
    const { rows } = await postgres.query(
      activeOnly
        ? `SELECT * FROM ${t} WHERE COALESCE(is_active, true) = true ORDER BY name`
        : `SELECT * FROM ${t} ORDER BY name`,
      [],
      { firmNr: fn },
    );
    return rows as MessageTemplateRow[];
  },

  async getById(id: string): Promise<MessageTemplateRow | null> {
    const list = await messageTemplateService.list(false);
    return list.find((r) => r.id === id) ?? null;
  },

  async create(data: {
    name: string;
    body_text: string;
    category?: MessageTemplateCategory;
    is_active?: boolean;
  }): Promise<MessageTemplateRow> {
    const fn = firmNrRow();
    const row: MessageTemplateRow = {
      id: uuidv4(),
      firm_nr: fn,
      name: data.name.trim(),
      body_text: data.body_text,
      category: data.category || 'general',
      is_active: data.is_active !== false,
    };
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.post(`/rex_${fn}_message_templates`, [row], {
        schema: 'public',
        prefer: 'return=minimal',
      });
      return row;
    }
    const t = templatesTable();
    await postgres.query(
      `INSERT INTO ${t} (id, firm_nr, name, body_text, category, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.id, fn, row.name, row.body_text, row.category, row.is_active],
      { firmNr: fn },
    );
    return row;
  },

  async update(
    id: string,
    data: Partial<Pick<MessageTemplateRow, 'name' | 'body_text' | 'category' | 'is_active'>>,
  ): Promise<void> {
    const fn = firmNrRow();
    const cur = await messageTemplateService.getById(id);
    if (!cur) return;
    const merged = {
      name: data.name?.trim() ?? cur.name,
      body_text: data.body_text ?? cur.body_text,
      category: data.category ?? cur.category,
      is_active: data.is_active ?? cur.is_active !== false,
    };
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.patch(
        `/rex_${fn}_message_templates?id=eq.${encodeURIComponent(id)}`,
        { ...merged, updated_at: new Date().toISOString() },
        { schema: 'public', prefer: 'return=minimal' },
      );
      return;
    }
    const t = templatesTable();
    await postgres.query(
      `UPDATE ${t} SET name=$2, body_text=$3, category=$4, is_active=$5, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [id, merged.name, merged.body_text, merged.category, merged.is_active],
      { firmNr: fn },
    );
  },

  async remove(id: string): Promise<void> {
    const fn = firmNrRow();
    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.delete(`/rex_${fn}_message_templates?id=eq.${encodeURIComponent(id)}`, {
        schema: 'public',
      });
      return;
    }
    const t = templatesTable();
    await postgres.query(`DELETE FROM ${t} WHERE id = $1`, [id], { firmNr: fn });
  },
};
