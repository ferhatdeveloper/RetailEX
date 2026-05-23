import type { Template, TemplateFormat, TemplateType } from './types/templates';
import { TEMPLATE_FORMATS } from './types/templates';

export const TEMPLATE_PAPER_MM_MIN = 20;
export const TEMPLATE_PAPER_MM_MAX = 420;

/** Fatura / belge şablonları için standart kağıt listesi */
export const INVOICE_TEMPLATE_FORMATS: TemplateFormat[] = [
  '80mm',
  '58mm',
  'A5',
  'A4',
  'A3',
  'Letter',
  'Legal',
  'custom',
];

/** Etiket şablonları için standart boyut listesi */
export const LABEL_TEMPLATE_FORMATS: TemplateFormat[] = [
  'label-small',
  'label-medium',
  'label-large',
  'custom',
];

export function getTemplateFormatsForType(type: TemplateType): TemplateFormat[] {
  return type === 'invoice' ? INVOICE_TEMPLATE_FORMATS : LABEL_TEMPLATE_FORMATS;
}

export function clampTemplatePaperMm(value: number): number {
  if (!Number.isFinite(value)) return TEMPLATE_PAPER_MM_MIN;
  return Math.min(TEMPLATE_PAPER_MM_MAX, Math.max(TEMPLATE_PAPER_MM_MIN, Math.round(value)));
}

export function dimensionsMatchFormat(
  format: TemplateFormat,
  widthMm: number,
  heightMm: number,
): boolean {
  if (format === 'custom') return false;
  const spec = TEMPLATE_FORMATS[format];
  return (
    (spec.width === widthMm && spec.height === heightMm) ||
    (spec.width === heightMm && spec.height === widthMm)
  );
}

/** Kayıtlı format veya ölçülerden aktif kağıt ön ayarını bulur */
export function resolveActivePaperFormat(template: Pick<Template, 'format' | 'width' | 'height'>): TemplateFormat {
  if (template.format === 'custom') return 'custom';
  const keys = Object.keys(TEMPLATE_FORMATS) as TemplateFormat[];
  for (const key of keys) {
    if (key === 'custom') continue;
    if (dimensionsMatchFormat(key, template.width, template.height)) return key;
  }
  return 'custom';
}

export function getTemplatePaperDisplayName(template: Pick<Template, 'format' | 'width' | 'height'>): string {
  const active = resolveActivePaperFormat(template);
  if (active !== 'custom') return TEMPLATE_FORMATS[active].name;
  return `Özel ölçü (${template.width}×${template.height} mm)`;
}

export function applyPaperFormatToTemplate(
  format: TemplateFormat,
  orientation: Template['orientation'],
  type: TemplateType,
): Pick<Template, 'format' | 'width' | 'height' | 'orientation'> {
  if (format === 'custom') {
    return { format: 'custom', width: 210, height: 297, orientation };
  }
  const spec = TEMPLATE_FORMATS[format];
  let width = spec.width;
  let height = spec.height;
  const canLandscape = type === 'invoice' && format !== '80mm' && format !== '58mm';
  if (canLandscape && orientation === 'landscape') {
    width = spec.height;
    height = spec.width;
  }
  return {
    format,
    width,
    height,
    orientation: canLandscape ? orientation : 'portrait',
  };
}

export function applyTemplatePaperDimensions(
  template: Template,
  widthMm: number,
  heightMm: number,
): Pick<Template, 'format' | 'width' | 'height'> {
  const width = clampTemplatePaperMm(widthMm);
  const height = clampTemplatePaperMm(heightMm);
  const matched = getTemplateFormatsForType(template.type).find((f) =>
    f !== 'custom' && dimensionsMatchFormat(f, width, height),
  );
  return {
    width,
    height,
    format: matched ?? 'custom',
  };
}
