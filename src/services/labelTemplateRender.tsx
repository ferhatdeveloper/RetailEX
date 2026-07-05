import { useEffect, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { Template, TemplateElement, TemplateUsageScope } from '../core/types/templates';

export interface TemplateLabelSize {
  id: string;
  name: string;
  width: number;
  height: number;
  perRow: number;
  perColumn: number;
  description: string;
  category: 'termal' | 'a4' | 'raf';
}
import {
  buildJsBarcodeOptions,
  type BarcodeCaptionMode,
  type LabelPrintFieldSettings,
} from './labelPrintFieldSettingsService';

export const LABEL_TEMPLATE_ID_PREFIX = 'tpl:';

export function isCustomLabelTemplateSelection(designId: string): boolean {
  return designId.startsWith(LABEL_TEMPLATE_ID_PREFIX);
}

export function labelTemplateDesignId(templateId: string): string {
  return `${LABEL_TEMPLATE_ID_PREFIX}${templateId}`;
}

export function parseLabelTemplateId(designId: string): string | null {
  if (!designId.startsWith(LABEL_TEMPLATE_ID_PREFIX)) return null;
  return designId.slice(LABEL_TEMPLATE_ID_PREFIX.length);
}

export function mmToLabelPx(mm: number): number {
  return (mm * 96) / 25.4;
}

export interface LabelTemplateFieldValues {
  productName: string;
  barcode: string;
  price: string;
  category: string;
  stock: string;
  sku: string;
  description: string;
  variantCode: string;
  specialCode2: string;
}

export function buildLabelTemplateFieldValues(input: {
  productName: string;
  barcode: string;
  variantCode: string;
  salePrice: number;
  currency: string;
  category?: string;
  stock?: number;
  sku?: string;
  description?: string;
  specialCode2?: string;
}): LabelTemplateFieldValues {
  const priceNum = Number.isFinite(input.salePrice) ? input.salePrice : 0;
  const priceFormatted = priceNum.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  const currency = (input.currency ?? '').trim();
  return {
    productName: input.productName ?? '',
    barcode: input.barcode ?? '',
    price: currency ? `${priceFormatted} ${currency}` : priceFormatted,
    category: input.category ?? '',
    stock: input.stock != null ? String(input.stock) : '',
    sku: input.sku ?? input.variantCode ?? '',
    description: input.description ?? '',
    variantCode: input.variantCode ?? '',
    specialCode2: input.specialCode2 ?? '',
  };
}

export function interpolateLabelTemplateText(text: string, fields: LabelTemplateFieldValues): string {
  return text
    .replace(/\{\{productName\}\}/g, fields.productName)
    .replace(/\{\{barcode\}\}/g, fields.barcode)
    .replace(/\{\{price\}\}/g, fields.price)
    .replace(/\{\{category\}\}/g, fields.category)
    .replace(/\{\{stock\}\}/g, fields.stock)
    .replace(/\{\{sku\}\}/g, fields.sku)
    .replace(/\{\{description\}\}/g, fields.description)
    .replace(/\{\{variantCode\}\}/g, fields.variantCode)
    .replace(/\{\{specialCode2\}\}/g, fields.specialCode2);
}

export function templateToLabelSize(
  template: Template,
  category: TemplateLabelSize['category'] = 'termal',
): TemplateLabelSize {
  return {
    id: labelTemplateDesignId(template.id),
    name: template.name,
    width: template.width,
    height: template.height,
    perRow: 1,
    perColumn: 1,
    description: template.description ?? '',
    category,
  };
}

export function mergeLabelTemplatesForScopes(
  getTemplatesForScope: (type: 'label', scope?: TemplateUsageScope) => Template[],
  scopes: TemplateUsageScope[],
): Template[] {
  const seen = new Set<string>();
  const merged: Template[] = [];
  for (const scope of scopes) {
    for (const t of getTemplatesForScope('label', scope)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function resolveBarcodeValue(
  element: TemplateElement,
  fields: LabelTemplateFieldValues,
): string {
  const field = element.field ?? element.content ?? '{{barcode}}';
  const interpolated = interpolateLabelTemplateText(field, fields);
  if (interpolated && interpolated !== field) return interpolated;
  return fields.barcode || fields.sku;
}

interface TemplateLabelViewProps {
  template: Template;
  fields: LabelTemplateFieldValues;
  instanceKey: string;
  className?: string;
  fieldSettings?: Partial<LabelPrintFieldSettings>;
}

export function TemplateLabelView({
  template,
  fields,
  instanceKey,
  className = '',
  fieldSettings,
}: TemplateLabelViewProps) {
  const captionMode: BarcodeCaptionMode = fieldSettings?.barcodeCaptionMode ?? 'barcode';

  const barcodeTargets = useMemo(() => {
    const targets: { elementId: string; value: string; heightMm: number }[] = [];
    for (const el of template.elements) {
      if (el.type !== 'barcode') continue;
      targets.push({
        elementId: el.id,
        value: resolveBarcodeValue(el, fields),
        heightMm: el.height,
      });
    }
    return targets;
  }, [template.elements, fields]);

  const qrTargets = useMemo(() => {
    const targets: { elementId: string; value: string; sizePx: number }[] = [];
    for (const el of template.elements) {
      if (el.type !== 'qr') continue;
      const raw = el.field ?? el.content ?? '{{barcode}}';
      const value = interpolateLabelTemplateText(raw, fields) || fields.barcode;
      if (!value) continue;
      targets.push({
        elementId: el.id,
        value,
        sizePx: Math.max(32, mmToLabelPx(Math.min(el.width, el.height))),
      });
    }
    return targets;
  }, [template.elements, fields]);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const t of barcodeTargets) {
        const svg = document.getElementById(`tpl-barcode-${instanceKey}-${t.elementId}`);
        if (!svg || !t.value) continue;
        try {
          const opts = buildJsBarcodeOptions(t.value, fields.variantCode, captionMode, {
            width: template.width,
            height: t.heightMm,
          });
          JsBarcode(svg, t.value, opts as Parameters<typeof JsBarcode>[2]);
        } catch (err) {
          console.error('Şablon barkod hatası:', err);
        }
      }
      for (const t of qrTargets) {
        const canvas = document.getElementById(`tpl-qr-${instanceKey}-${t.elementId}`) as HTMLCanvasElement | null;
        if (!canvas || !t.value) continue;
        QRCode.toCanvas(canvas, t.value, {
          width: t.sizePx,
          margin: 1,
          errorCorrectionLevel: 'M',
        }).catch((err: unknown) => console.error('Şablon QR hatası:', err));
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [barcodeTargets, qrTargets, instanceKey, captionMode, fields.variantCode, template.width]);

  const wPx = mmToLabelPx(template.width);
  const hPx = mmToLabelPx(template.height);

  return (
    <div
      className={`border border-gray-300 bg-white relative overflow-hidden ${className}`.trim()}
      style={{
        width: `${wPx}px`,
        height: `${hPx}px`,
        boxSizing: 'border-box',
      }}
    >
      {template.elements.map((element) => {
        if (element.type === 'text') {
          const raw = element.content || element.field || '';
          const text = interpolateLabelTemplateText(raw, fields);
          return (
            <div
              key={element.id}
              className="absolute"
              style={{
                left: `${mmToLabelPx(element.x)}px`,
                top: `${mmToLabelPx(element.y)}px`,
                width: `${mmToLabelPx(element.width)}px`,
                height: `${mmToLabelPx(element.height)}px`,
                fontSize: `${element.fontSize ?? 12}px`,
                fontWeight: element.fontWeight,
                textAlign: element.textAlign,
                color: element.color ?? '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  element.textAlign === 'center'
                    ? 'center'
                    : element.textAlign === 'right'
                      ? 'flex-end'
                      : 'flex-start',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {text}
            </div>
          );
        }

        if (element.type === 'barcode') {
          return (
            <div
              key={element.id}
              className="absolute flex items-center justify-center overflow-hidden"
              style={{
                left: `${mmToLabelPx(element.x)}px`,
                top: `${mmToLabelPx(element.y)}px`,
                width: `${mmToLabelPx(element.width)}px`,
                height: `${mmToLabelPx(element.height)}px`,
              }}
            >
              <svg
                id={`tpl-barcode-${instanceKey}-${element.id}`}
                className="max-w-full max-h-full"
              />
            </div>
          );
        }

        if (element.type === 'qr') {
          return (
            <div
              key={element.id}
              className="absolute flex items-center justify-center"
              style={{
                left: `${mmToLabelPx(element.x)}px`,
                top: `${mmToLabelPx(element.y)}px`,
                width: `${mmToLabelPx(element.width)}px`,
                height: `${mmToLabelPx(element.height)}px`,
              }}
            >
              <canvas id={`tpl-qr-${instanceKey}-${element.id}`} />
            </div>
          );
        }

        if (element.type === 'box') {
          return (
            <div
              key={element.id}
              className="absolute"
              style={{
                left: `${mmToLabelPx(element.x)}px`,
                top: `${mmToLabelPx(element.y)}px`,
                width: `${mmToLabelPx(element.width)}px`,
                height: `${mmToLabelPx(element.height)}px`,
                border: `${element.borderWidth ?? 1}px solid ${element.borderColor ?? '#000'}`,
                backgroundColor: element.backgroundColor,
              }}
            />
          );
        }

        if (element.type === 'line') {
          return (
            <div
              key={element.id}
              className="absolute"
              style={{
                left: `${mmToLabelPx(element.x)}px`,
                top: `${mmToLabelPx(element.y)}px`,
                width: `${mmToLabelPx(element.width)}px`,
                height: `${element.borderWidth ?? 1}px`,
                backgroundColor: element.borderColor ?? '#000',
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
