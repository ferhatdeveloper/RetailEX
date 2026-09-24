/**
 * Hasta dosya yazdırma — Dizayn Merkezi `patient_file` scope.
 * Önizleme ekranı her zaman gösterilir; sessiz kuyruk yok.
 */
import type { Template } from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';
import { getBindingForScope } from '../services/printDesignBindingService';
import { getReceiptSettings } from '../services/receiptSettingsService';
import {
  buildPatientFilePrintContext,
  type PatientFileCustomerLike,
} from '../services/templateRenderService';
import { companyHeaderFromReceiptSettings } from './materialExtractPrint';
import { ERP_SETTINGS } from '../services/postgres';

export const PATIENT_FILE_PRINT_SCOPE = 'patient_file' as const;
export const PATIENT_FILE_DEFAULT_TEMPLATE_ID = 'default-a4-patient-file';

export function listPatientFileTemplates(
  getTemplatesForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template[],
  designTemplates: Template[],
): Template[] {
  const map = new Map<string, Template>();
  for (const t of getTemplatesForScope('invoice', PATIENT_FILE_PRINT_SCOPE)) {
    if (t?.id) map.set(t.id, t);
  }
  for (const t of designTemplates) {
    if (
      t?.id &&
      t.type === 'invoice' &&
      (t.usageScopes ?? []).includes(PATIENT_FILE_PRINT_SCOPE) &&
      !map.has(t.id)
    ) {
      map.set(t.id, t);
    }
  }
  for (const t of DEFAULT_TEMPLATES) {
    if (
      t.id &&
      (t.usageScopes ?? []).includes(PATIENT_FILE_PRINT_SCOPE) &&
      !map.has(t.id)
    ) {
      map.set(t.id, t);
    }
  }
  return Array.from(map.values());
}

export function resolvePatientFileTemplateId(
  templates: Template[],
  resolveTemplateForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template | null,
  preferredId?: string | null,
): string | null {
  if (preferredId && templates.some((t) => t.id === preferredId)) return preferredId;
  const resolved = resolveTemplateForScope('invoice', PATIENT_FILE_PRINT_SCOPE);
  if (resolved && templates.some((t) => t.id === resolved.id)) return resolved.id;
  const defaultHit = templates.find((t) => t.id === PATIENT_FILE_DEFAULT_TEMPLATE_ID);
  if (defaultHit) return defaultHit.id;
  return templates[0]?.id ?? null;
}

/** Müşteri verisi + mağaza başlığı → şablon context (yazdırma önizlemesi) */
export async function preparePatientFilePrintContext(
  customer: PatientFileCustomerLike,
  firmNr?: string,
): Promise<Record<string, unknown>> {
  const fn = String(firmNr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
  const receipt = await getReceiptSettings(fn).catch(() => ({}));
  const header = companyHeaderFromReceiptSettings(receipt, 'RetailEX');
  return buildPatientFilePrintContext(customer, {
    storeName: header.companyName,
    storeAddress: header.companyAddress,
    storePhone: header.companyPhone,
    storeTaxNo: header.companyTaxNumber,
  });
}

/** Yazdırma Seçenekleri bağından tercih edilen Dizayn Merkezi şablon id */
export async function getPreferredPatientFileTemplateId(
  firmNr?: string,
): Promise<string | null> {
  const fn = String(firmNr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
  try {
    const binding = await getBindingForScope(fn, PATIENT_FILE_PRINT_SCOPE);
    if (binding?.designKind === 'design_center' && binding.designId) {
      return binding.designId;
    }
  } catch {
    /* yok */
  }
  return null;
}
