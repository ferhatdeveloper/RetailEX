/**
 * Hasta dosya yazdırma — Dizayn Merkezi `patient_file` scope.
 */
import type { Template } from '../core/types/templates';
import { DEFAULT_TEMPLATES } from '../core/types/templates';
import type { ReportTemplate } from '../components/reports/designerUtils';
import { getBindingForScope } from '../services/printDesignBindingService';
import { getReceiptSettings } from '../services/receiptSettingsService';
import {
  buildPatientFilePrintContext,
  convertTemplateToReportTemplate,
  type PatientFileCustomerLike,
} from '../services/templateRenderService';
import {
  enqueueFastReportFrxJob,
  enqueueFastReportTemplateJob,
  isWindowsPrinterServiceEnabled,
} from '../services/unifiedPrintQueueService';
import { companyHeaderFromReceiptSettings } from './materialExtractPrint';
import { ERP_SETTINGS } from '../services/postgres';

export const PATIENT_FILE_PRINT_SCOPE = 'patient_file' as const;
export const PATIENT_FILE_DEFAULT_TEMPLATE_ID = 'default-a4-patient-file';

export type PatientFilePrintResult =
  | { mode: 'viewer'; reportTemplate: ReportTemplate; context: Record<string, unknown> }
  | { mode: 'queued' };

function resolvePatientFileTemplate(
  resolveTemplateForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template | null,
  getTemplatesForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template[],
  designTemplates: Template[],
  preferredId?: string | null,
): Template | null {
  if (preferredId) {
    const hit = designTemplates.find((t) => t.id === preferredId);
    if (hit) return hit;
  }
  const resolved = resolveTemplateForScope('invoice', PATIENT_FILE_PRINT_SCOPE);
  if (resolved) return resolved;
  const scoped = getTemplatesForScope('invoice', PATIENT_FILE_PRINT_SCOPE);
  if (scoped[0]) return scoped[0];
  return (
    DEFAULT_TEMPLATES.find((t) => t.id === PATIENT_FILE_DEFAULT_TEMPLATE_ID) ??
    DEFAULT_TEMPLATES.find((t) => (t.usageScopes ?? []).includes(PATIENT_FILE_PRINT_SCOPE)) ??
    null
  );
}

/** Müşteri kartını Hasta Dosya şablonu ile yazdır / önizle */
export async function printPatientFileForCustomer(params: {
  customer: PatientFileCustomerLike;
  resolveTemplateForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template | null;
  getTemplatesForScope: (type: 'invoice', scope: typeof PATIENT_FILE_PRINT_SCOPE) => Template[];
  designTemplates: Template[];
  firmNr?: string;
}): Promise<PatientFilePrintResult> {
  const firmNr = String(params.firmNr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
  const receipt = await getReceiptSettings(firmNr).catch(() => ({}));
  const header = companyHeaderFromReceiptSettings(receipt, 'RetailEX');
  const context = buildPatientFilePrintContext(params.customer, {
    storeName: header.companyName,
    storeAddress: header.companyAddress,
    storePhone: header.companyPhone,
    storeTaxNo: header.companyTaxNumber,
  });

  let preferredId: string | null = null;
  let designKind: 'fastreport_frx' | 'design_center' | 'builtin' | null = null;
  let designName: string | null = null;
  try {
    const binding = await getBindingForScope(firmNr, PATIENT_FILE_PRINT_SCOPE);
    if (binding?.designId) {
      preferredId = binding.designId;
      designKind = binding.designKind;
      designName = binding.designName;
    }
  } catch {
    /* binding yoksa şablon çözümleyiciye düş */
  }

  if (designKind === 'fastreport_frx' && preferredId) {
    if (!(await isWindowsPrinterServiceEnabled())) {
      throw new Error('FastReport .frx yazdırma için Windows yazıcı servisi açık olmalı.');
    }
    await enqueueFastReportFrxJob({
      designId: preferredId,
      designName,
      scope: PATIENT_FILE_PRINT_SCOPE,
      data: context,
      connection: 'system',
      refType: 'customer',
      refId: params.customer.id ?? null,
      sourceSystem: 'web',
      priority: 80,
    });
    return { mode: 'queued' };
  }

  const template = resolvePatientFileTemplate(
    params.resolveTemplateForScope,
    params.getTemplatesForScope,
    params.designTemplates,
    preferredId,
  );
  if (!template) {
    throw new Error(
      'Hasta dosya şablonu bulunamadı. Dizayn Merkezi’nde «Hasta Dosya» kapsamlı bir şablon ekleyin.',
    );
  }

  if (await isWindowsPrinterServiceEnabled()) {
    await enqueueFastReportTemplateJob({
      templateId: template.id,
      type: 'invoice',
      data: context,
      connection: 'system',
      refType: 'customer',
      refId: params.customer.id ?? null,
      sourceSystem: 'web',
      priority: 80,
    });
    return { mode: 'queued' };
  }

  return {
    mode: 'viewer',
    reportTemplate: convertTemplateToReportTemplate(template),
    context,
  };
}
