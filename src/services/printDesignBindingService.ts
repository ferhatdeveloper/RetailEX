import type {
  PrintDesignBinding,
  PrintDesignKind,
  PrintDesignOption,
  PrintDesignScope,
} from '../core/types/printDesignBindings';
import { ERP_SETTINGS, postgres } from './postgres';
import { loadTemplateCatalog } from './templateCatalogService';

type BindingRow = {
  id: string;
  firm_nr: string;
  scope: PrintDesignScope;
  design_kind: PrintDesignKind;
  design_id: string | null;
  design_ref: string | null;
  design_name: string | null;
  is_active: boolean;
  updated_at: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeFirmNr(firmNr?: string | null): string {
  const raw = String(firmNr || ERP_SETTINGS.firmNr || '001').trim();
  return raw.length <= 3 ? raw.padStart(3, '0') : raw.slice(0, 10);
}

function normalizeKind(value: unknown): PrintDesignKind {
  if (value === 'fastreport_frx' || value === 'design_center' || value === 'builtin') return value;
  return 'builtin';
}

function rowToBinding(row: BindingRow): PrintDesignBinding {
  return {
    id: row.id,
    firmNr: row.firm_nr,
    scope: row.scope,
    designKind: normalizeKind(row.design_kind),
    designId: row.design_ref || row.design_id || null,
    designName: row.design_name || null,
    isActive: row.is_active !== false,
    updatedAt: row.updated_at,
  };
}

export async function getBindings(firmNr?: string | null): Promise<PrintDesignBinding[]> {
  const fn = normalizeFirmNr(firmNr);
  const { rows } = await postgres.query<BindingRow>(
    `SELECT id, firm_nr, scope, design_kind, design_id::text, design_ref, design_name, is_active, updated_at::text
       FROM public.print_design_bindings
      WHERE firm_nr = $1
      ORDER BY scope`,
    [fn],
  );
  return rows.map(rowToBinding);
}

export async function getBindingForScope(
  firmNr: string | null | undefined,
  scope: PrintDesignScope,
): Promise<Pick<PrintDesignBinding, 'designKind' | 'designId' | 'designName'> | null> {
  const fn = normalizeFirmNr(firmNr);
  const { rows } = await postgres.query<BindingRow>(
    `SELECT id, firm_nr, scope, design_kind, design_id::text, design_ref, design_name, is_active, updated_at::text
       FROM public.print_design_bindings
      WHERE firm_nr = $1
        AND scope = $2
        AND is_active = true
      LIMIT 1`,
    [fn, scope],
  );
  const binding = rows[0] ? rowToBinding(rows[0]) : null;
  if (!binding || binding.designKind === 'builtin' || !binding.designId) return binding;
  return {
    designKind: binding.designKind,
    designId: binding.designId,
    designName: binding.designName,
  };
}

export async function saveBindings(
  firmNr: string | null | undefined,
  rows: Array<Pick<PrintDesignBinding, 'scope' | 'designKind' | 'designId' | 'designName' | 'isActive'>>,
): Promise<void> {
  const fn = normalizeFirmNr(firmNr);
  for (const row of rows) {
    const designKind = normalizeKind(row.designKind);
    const designId = row.designId?.trim() || null;
    const designUuid = designKind === 'fastreport_frx' && designId && UUID_RE.test(designId) ? designId : null;
    const designRef = designKind === 'design_center' && designId ? designId : null;
    await postgres.query(
      `INSERT INTO public.print_design_bindings
        (firm_nr, scope, design_kind, design_id, design_ref, design_name, is_active, updated_at)
       VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, NOW())
       ON CONFLICT (firm_nr, scope) DO UPDATE SET
        design_kind = EXCLUDED.design_kind,
        design_id = EXCLUDED.design_id,
        design_ref = EXCLUDED.design_ref,
        design_name = EXCLUDED.design_name,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        fn,
        row.scope,
        designKind,
        designUuid,
        designRef,
        row.designName || null,
        row.isActive !== false,
      ],
    );
  }
}

export async function listFastReportDesigns(firmNr?: string | null): Promise<PrintDesignOption[]> {
  const fn = normalizeFirmNr(firmNr);
  const { rows } = await postgres.query<{ id: string; name: string; description: string | null }>(
    `SELECT id::text, name, description
       FROM public.report_templates
      WHERE (firm_nr = $1 OR firm_nr IS NULL)
        AND (LOWER(template_type) = 'fastreport_frx' OR LOWER(category) = 'fastreport_frx')
      ORDER BY CASE WHEN firm_nr = $1 THEN 0 ELSE 1 END, updated_at DESC, name ASC`,
    [fn],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    designKind: 'fastreport_frx',
    sourceLabel: row.description ? `FastReport .frx - ${row.description}` : 'FastReport .frx',
  }));
}

export async function listDesignCenterTemplates(): Promise<PrintDesignOption[]> {
  const templates = await loadTemplateCatalog();
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    designKind: 'design_center',
    sourceLabel: `Dizayn Merkezi - ${template.type === 'label' ? 'Etiket' : 'Fatura'} / ${template.format}`,
  }));
}
