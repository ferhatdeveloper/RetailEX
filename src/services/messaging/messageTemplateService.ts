/**
 * Kullanıcı tanımlı WhatsApp mesaj şablonları (firma kart).
 *
 * 4-dil birleşik yapı (migration 207):
 *   - body_text_tr / body_text_en / body_text_ar / body_text_ku
 *   - headline_tr / headline_en / headline_ar / headline_ku
 *   - Mevcut body_text (geriye uyumlu) korunur; yeni kayıtlarda tr olarak
 *     body_text_tr ile aynı metin kullanılır.
 *
 * Recipient gönderiminde resolveTemplateBody(row, lang) fallback ile
 *   ku → ar → en → tr sırasıyla dil kolonunu seçer.
 */
import { v4 as uuidv4 } from 'uuid';
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { ERP_SETTINGS, postgres } from '../postgres';
import {
  normalizeWhatsAppMessageLang,
  type WhatsAppMessageLang,
} from './whatsappMessageLang';

export type MessageTemplateCategory = 'general' | 'birthday' | 'special_day' | string;

export interface MessageTemplateRow {
  id: string;
  firm_nr?: string;
  name: string;
  body_text: string;
  body_text_tr?: string | null;
  body_text_en?: string | null;
  body_text_ar?: string | null;
  body_text_ku?: string | null;
  headline_tr?: string | null;
  headline_en?: string | null;
  headline_ar?: string | null;
  headline_ku?: string | null;
  category: MessageTemplateCategory;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Çeviri objesi (4 dil) — UI ve dış servisler için */
export interface MessageTemplateTranslations {
  tr: string;
  en: string;
  ar: string;
  ku: string;
}

/**
 * Mesaj gövdesini iki parçaya ayır: kısa başlık (headline) + ana metin (body).
 * Saklama formatı: `headline` boşsa tüm metin `body`; doluysa `headline\n\nbody`.
 */
export function splitHeadlineAndBody(bodyText: string): { headline: string; body: string } {
  const raw = String(bodyText ?? '');
  if (!raw) return { headline: '', body: '' };
  const idx = raw.indexOf('\n\n');
  if (idx <= 0) return { headline: '', body: raw };
  const head = raw.slice(0, idx).trim();
  const body = raw.slice(idx + 2);
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

/**
 * Tek bir body_text kolonunu dile göre getirir.
 * Sırasıyla: ku → ar → en → tr (fallback boş kalırsa ilk dolu olan).
 */
export function resolveTemplateBody(
  row: MessageTemplateRow | null | undefined,
  rawLang: string | null | undefined,
): string {
  if (!row) return '';
  const lang = normalizeWhatsAppMessageLang(rawLang);
  const direct = readBodyLang(row, lang);
  if (direct) return direct;
  // Fallback zinciri (kendi dilinden sonra, soldan sağa)
  const order: WhatsAppMessageLang[] = ['tr', 'en', 'ar', 'ku'];
  for (const l of order) {
    if (l === lang) continue;
    const v = readBodyLang(row, l);
    if (v) return v;
  }
  return row.body_text ?? '';
}

function readBodyLang(row: MessageTemplateRow, lang: WhatsAppMessageLang): string {
  switch (lang) {
    case 'en':
      return (row.body_text_en ?? '').trim();
    case 'ar':
      return (row.body_text_ar ?? '').trim();
    case 'ku':
      return (row.body_text_ku ?? '').trim();
    default:
      return (row.body_text_tr ?? row.body_text ?? '').trim();
  }
}

function readHeadlineLang(row: MessageTemplateRow, lang: WhatsAppMessageLang): string {
  switch (lang) {
    case 'en':
      return (row.headline_en ?? '').trim();
    case 'ar':
      return (row.headline_ar ?? '').trim();
    case 'ku':
      return (row.headline_ku ?? '').trim();
    default:
      return (row.headline_tr ?? '').trim();
  }
}

/** 4 dilde body çevirilerini tek bir obje olarak getirir (boşsa fallback). */
export function resolveTemplateTranslations(
  row: MessageTemplateRow | null | undefined,
): MessageTemplateTranslations {
  const empty: MessageTemplateTranslations = { tr: '', en: '', ar: '', ku: '' };
  if (!row) return empty;
  const fallback = (row.body_text_tr ?? row.body_text ?? '').trim();
  return {
    tr: (row.body_text_tr ?? '').trim() || fallback,
    en: (row.body_text_en ?? '').trim() || fallback,
    ar: (row.body_text_ar ?? '').trim() || fallback,
    ku: (row.body_text_ku ?? '').trim() || fallback,
  };
}

/** Belirli bir dilde dolu body_text kolonu olan şablonları filtrele.
 *  - Dil kolonu (`body_text_<lang>`) açıkça dolu olan şablonlar listelenir.
 *  - Geriye uyumluluk: tüm 4 dil kolonu boş + legacy `body_text` dolu olan
 *    eski şablonlar, tüm dillerde (fallback) görünür kabul edilir (migration 207
 *    öncesi tek kolon verisi).
 *  - Pasif taslak (is_active=false) şablonlar hariç tutulur. */
const TPL_LANG_KEYS = [
  'body_text_tr',
  'body_text_en',
  'body_text_ar',
  'body_text_ku',
] as const;

function readExplicitBodyLang(row: MessageTemplateRow, lang: WhatsAppMessageLang): string {
  switch (lang) {
    case 'en':
      return (row.body_text_en ?? '').trim();
    case 'ar':
      return (row.body_text_ar ?? '').trim();
    case 'ku':
      return (row.body_text_ku ?? '').trim();
    default:
      return (row.body_text_tr ?? '').trim();
  }
}

function allLangColsEmpty(row: MessageTemplateRow): boolean {
  return TPL_LANG_KEYS.every((k) => !(row[k] ?? '').toString().trim());
}

export function hasTemplateBodyInLang(
  row: MessageTemplateRow,
  lang: WhatsAppMessageLang,
): boolean {
  const direct = readExplicitBodyLang(row, lang);
  if (direct) return true;
  // Tüm 4 dil kolonu boş + eski body_text dolu → fallback olarak göster (her dilde listele)
  if (allLangColsEmpty(row) && (row.body_text ?? '').trim()) return true;
  return false;
}

export function filterTemplatesByLang(
  rows: MessageTemplateRow[],
  lang: WhatsAppMessageLang,
): MessageTemplateRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const normLang = normalizeWhatsAppMessageLang(lang);
  return rows.filter((r) => {
    // Pasif taslaklar (is_active === false) gizle
    if (r.is_active === false) return false;
    return hasTemplateBodyInLang(r, normLang);
  });
}

/** Migration 207 ile oluşturulan 3 seed şablonun sabit ID listesi.
 *  Bu şablonlar kullanıcı tarafından **silinemez** (sistem şablonu). */
export const SYSTEM_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'c1000001-bbbb-4bbb-8bbb-000000000001',
  'c1000001-bbbb-4bbb-8bbb-000000000002',
  'c1000001-bbbb-4bbb-8bbb-000000000003',
]);

export function isSystemTemplate(row: MessageTemplateRow | { id: string } | null | undefined): boolean {
  if (!row || !row.id) return false;
  return SYSTEM_TEMPLATE_IDS.has(row.id);
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
    body_text?: string;
    /** 4-dil birleşik metin (ör. { tr, en, ar, ku }); verilirse body_text yerine öncelikli */
    translations?: Partial<MessageTemplateTranslations>;
    /** 4-dil birleşik başlık */
    headlines?: Partial<MessageTemplateTranslations>;
    category?: MessageTemplateCategory;
    is_active?: boolean;
  }): Promise<MessageTemplateRow> {
    const fn = firmNrRow();
    const trBody = data.translations?.tr ?? data.body_text ?? '';
    const row: MessageTemplateRow = {
      id: uuidv4(),
      firm_nr: fn,
      name: data.name.trim(),
      body_text: trBody,
      body_text_tr: data.translations?.tr ?? trBody,
      body_text_en: data.translations?.en ?? null,
      body_text_ar: data.translations?.ar ?? null,
      body_text_ku: data.translations?.ku ?? null,
      headline_tr: data.headlines?.tr ?? null,
      headline_en: data.headlines?.en ?? null,
      headline_ar: data.headlines?.ar ?? null,
      headline_ku: data.headlines?.ku ?? null,
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
      `INSERT INTO ${t} (
         id, firm_nr, name, body_text,
         body_text_tr, body_text_en, body_text_ar, body_text_ku,
         headline_tr, headline_en, headline_ar, headline_ku,
         category, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        row.id, fn, row.name, row.body_text,
        row.body_text_tr, row.body_text_en, row.body_text_ar, row.body_text_ku,
        row.headline_tr, row.headline_en, row.headline_ar, row.headline_ku,
        row.category, row.is_active,
      ],
      { firmNr: fn },
    );
    return row;
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      body_text: string;
      translations: Partial<MessageTemplateTranslations>;
      headlines: Partial<MessageTemplateTranslations>;
      category: MessageTemplateCategory;
      is_active: boolean;
    }>,
  ): Promise<void> {
    const fn = firmNrRow();
    const cur = await messageTemplateService.getById(id);
    if (!cur) return;
    const nextTr = data.translations?.tr ?? data.body_text ?? cur.body_text_tr ?? cur.body_text;
    const merged: MessageTemplateRow = {
      ...cur,
      name: data.name?.trim() ?? cur.name,
      body_text: nextTr,
      body_text_tr: data.translations?.tr ?? nextTr ?? null,
      body_text_en: data.translations?.en ?? cur.body_text_en ?? null,
      body_text_ar: data.translations?.ar ?? cur.body_text_ar ?? null,
      body_text_ku: data.translations?.ku ?? cur.body_text_ku ?? null,
      headline_tr: data.headlines?.tr ?? cur.headline_tr ?? null,
      headline_en: data.headlines?.en ?? cur.headline_en ?? null,
      headline_ar: data.headlines?.ar ?? cur.headline_ar ?? null,
      headline_ku: data.headlines?.ku ?? cur.headline_ku ?? null,
      category: data.category ?? cur.category,
      is_active: data.is_active ?? cur.is_active !== false,
    };

    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.patch(
        `/rex_${fn}_message_templates?id=eq.${encodeURIComponent(id)}`,
        {
          name: merged.name,
          body_text: merged.body_text,
          body_text_tr: merged.body_text_tr,
          body_text_en: merged.body_text_en,
          body_text_ar: merged.body_text_ar,
          body_text_ku: merged.body_text_ku,
          headline_tr: merged.headline_tr,
          headline_en: merged.headline_en,
          headline_ar: merged.headline_ar,
          headline_ku: merged.headline_ku,
          category: merged.category,
          is_active: merged.is_active,
          updated_at: new Date().toISOString(),
        },
        { schema: 'public', prefer: 'return=minimal' },
      );
      return;
    }
    const t = templatesTable();
    await postgres.query(
      `UPDATE ${t} SET
         name=$2,
         body_text=$3,
         body_text_tr=$4,
         body_text_en=$5,
         body_text_ar=$6,
         body_text_ku=$7,
         headline_tr=$8,
         headline_en=$9,
         headline_ar=$10,
         headline_ku=$11,
         category=$12,
         is_active=$13,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [
        id, merged.name, merged.body_text,
        merged.body_text_tr, merged.body_text_en, merged.body_text_ar, merged.body_text_ku,
        merged.headline_tr, merged.headline_en, merged.headline_ar, merged.headline_ku,
        merged.category, merged.is_active,
      ],
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

/**
 * Şablon düzenleme modalı için isim-odaklı CRUD wrapper'ları.
 * Mevcut `messageTemplateService.create/update/remove` çağrılarını
 * 4-dil (tr/en/ar/ku) tek-nesne şemasıyla sarmalar.
 */

export interface TemplateInput {
  name: string;
  category?: MessageTemplateCategory;
  /** body_<lang>: 4 dilde içerik metinleri (opsiyonel, en az biri zorunlu) */
  body_text_tr?: string | null;
  body_text_en?: string | null;
  body_text_ar?: string | null;
  body_text_ku?: string | null;
  /** headline_<lang>: opsiyonel başlıklar */
  headline_tr?: string | null;
  headline_en?: string | null;
  headline_ar?: string | null;
  headline_ku?: string | null;
  /** Taslak olarak kaydetmek için false; varsayılan true */
  is_active?: boolean;
}

/** Yeni şablon oluşturur; oluşturulan kaydın id'sini döndürür. */
export async function createMessageTemplate(input: TemplateInput): Promise<{ id: string }> {
  const translations = {
    tr: input.body_text_tr ?? '',
    en: input.body_text_en ?? '',
    ar: input.body_text_ar ?? '',
    ku: input.body_text_ku ?? '',
  };
  const headlines = {
    tr: input.headline_tr ?? '',
    en: input.headline_en ?? '',
    ar: input.headline_ar ?? '',
    ku: input.headline_ku ?? '',
  };
  const created = await messageTemplateService.create({
    name: input.name,
    translations,
    headlines,
    category: input.category ?? 'general',
    is_active: input.is_active !== false,
  });
  return { id: created.id };
}

/** Mevcut şablonun bir kısmını günceller — verilmeyen alanlar korunur. */
export async function updateMessageTemplate(
  id: string,
  patch: Partial<TemplateInput>,
): Promise<void> {
  const translations: Partial<MessageTemplateTranslations> | undefined =
    patch.body_text_tr !== undefined ||
    patch.body_text_en !== undefined ||
    patch.body_text_ar !== undefined ||
    patch.body_text_ku !== undefined
      ? {
          ...(patch.body_text_tr !== undefined ? { tr: patch.body_text_tr } : {}),
          ...(patch.body_text_en !== undefined ? { en: patch.body_text_en } : {}),
          ...(patch.body_text_ar !== undefined ? { ar: patch.body_text_ar } : {}),
          ...(patch.body_text_ku !== undefined ? { ku: patch.body_text_ku } : {}),
        }
      : undefined;
  const headlines: Partial<MessageTemplateTranslations> | undefined =
    patch.headline_tr !== undefined ||
    patch.headline_en !== undefined ||
    patch.headline_ar !== undefined ||
    patch.headline_ku !== undefined
      ? {
          ...(patch.headline_tr !== undefined ? { tr: patch.headline_tr } : {}),
          ...(patch.headline_en !== undefined ? { en: patch.headline_en } : {}),
          ...(patch.headline_ar !== undefined ? { ar: patch.headline_ar } : {}),
          ...(patch.headline_ku !== undefined ? { ku: patch.headline_ku } : {}),
        }
      : undefined;

  await messageTemplateService.update(id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.is_active !== undefined ? { is_active: !!patch.is_active } : {}),
    ...(translations ? { translations } : {}),
    ...(headlines ? { headlines } : {}),
  });
}

/** Şablonu siler — sistem şablonları için Error fırlatır. */
export async function deleteMessageTemplate(id: string): Promise<void> {
  if (SYSTEM_TEMPLATE_IDS.has(id)) {
    throw new Error('Bu şablon sistem şablonudur ve silinemez.');
  }
  await messageTemplateService.remove(id);
}
