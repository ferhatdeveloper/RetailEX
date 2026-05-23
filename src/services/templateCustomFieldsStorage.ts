import type { TemplateType } from '../core/types/templates';
import type { TemplateFieldDef } from './templateFieldCatalog';

const STORAGE_PREFIX = 'retailex_template_custom_fields_v1';

function storageKey(type: TemplateType): string {
  return `${STORAGE_PREFIX}_${type}`;
}

export function loadCustomTemplateFields(type: TemplateType): TemplateFieldDef[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(type));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TemplateFieldDef[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplateFields(type: TemplateType, fields: TemplateFieldDef[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(type), JSON.stringify(fields));
  } catch {
    /* quota */
  }
}

export function addCustomTemplateField(type: TemplateType, field: TemplateFieldDef): TemplateFieldDef[] {
  const current = loadCustomTemplateFields(type);
  const exists = current.some((f) => f.token === field.token);
  if (exists) return current;
  const next = [...current, { ...field, source: field.source ?? 'custom' }];
  saveCustomTemplateFields(type, next);
  return next;
}

export function removeCustomTemplateField(type: TemplateType, token: string): TemplateFieldDef[] {
  const next = loadCustomTemplateFields(type).filter((f) => f.token !== token);
  saveCustomTemplateFields(type, next);
  return next;
}

export function clearCustomTemplateFields(type: TemplateType): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(type));
}
