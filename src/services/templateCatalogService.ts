import { ERP_SETTINGS, postgres } from './postgres';
import type { Template } from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';

const TEMPLATE_CATALOG_CATEGORY = 'template_catalog';
const TEMPLATE_CATALOG_TYPE = 'template_designer_v2';

function normalizeTemplate(template: Template): Template {
  return {
    ...template,
    engine: template.engine ?? 'fastreport-like',
    usageScopes: template.usageScopes?.length ? template.usageScopes : ['global'],
    defaultScopes: template.defaultScopes?.length ? template.defaultScopes : [],
  };
}

function defaultTemplateCatalog(): Template[] {
  return DEFAULT_TEMPLATES.map(normalizeTemplate);
}

function currentFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
}

function parseTemplateCatalog(content: unknown): Template[] {
  if (!content) return defaultTemplateCatalog();
  if (Array.isArray(content)) {
    return (content as Template[]).map(normalizeTemplate);
  }
  if (typeof content === 'object' && content !== null && Array.isArray((content as { templates?: unknown }).templates)) {
    return ((content as { templates: Template[] }).templates || []).map(normalizeTemplate);
  }
  return defaultTemplateCatalog();
}

async function getCatalogRow(): Promise<{ id: string; content: unknown } | null> {
  const firmNr = currentFirmNr();
  const { rows } = await postgres.query<{ id: string; content: unknown }>(
    `SELECT id, content
       FROM public.report_templates
      WHERE category = $1
        AND template_type = $2
        AND (firm_nr = $3 OR firm_nr IS NULL)
      ORDER BY CASE WHEN firm_nr = $3 THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
    [TEMPLATE_CATALOG_CATEGORY, TEMPLATE_CATALOG_TYPE, firmNr],
  );
  return rows[0] ?? null;
}

export async function loadTemplateCatalog(): Promise<Template[]> {
  try {
    const row = await getCatalogRow();
    if (!row) {
      return defaultTemplateCatalog();
    }
    return parseTemplateCatalog(row.content);
  } catch (error) {
    console.warn('[TemplateCatalogService] katalog yüklenemedi, varsayılanlar kullanılıyor:', error);
    return defaultTemplateCatalog();
  }
}

export async function saveTemplateCatalog(templates: Template[]): Promise<void> {
  const firmNr = currentFirmNr();
  const normalized = templates.map(normalizeTemplate);
  const payload = {
    version: 2,
    templates: normalized,
    updated_at: new Date().toISOString(),
  };
  const existing = await getCatalogRow();
  if (existing?.id) {
    await postgres.query(
      `UPDATE public.report_templates
          SET name = $2,
              description = $3,
              category = $4,
              template_type = $5,
              content = $6::jsonb,
              firm_nr = $7,
              updated_at = NOW()
        WHERE id = $1`,
      [
        existing.id,
        'RetailEX Template Catalog',
        'Fatura ve etiket tasarım kataloğu',
        TEMPLATE_CATALOG_CATEGORY,
        TEMPLATE_CATALOG_TYPE,
        JSON.stringify(payload),
        firmNr,
      ],
    );
    return;
  }

  await postgres.query(
    `INSERT INTO public.report_templates
      (name, description, category, template_type, content, is_default, firm_nr)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
    [
      'RetailEX Template Catalog',
      'Fatura ve etiket tasarım kataloğu',
      TEMPLATE_CATALOG_CATEGORY,
      TEMPLATE_CATALOG_TYPE,
      JSON.stringify(payload),
      true,
      firmNr,
    ],
  );
}
