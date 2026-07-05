import { useMemo } from 'react';
import type { ReportTemplate } from '../../reports/designerUtils';
import { ReportBarcodePreview } from '../../reports/reportLabelBarcode';
import {
  buildQuickRetailProductLabelTemplate,
  type QuickRetailLabelInput,
} from './quickRetailProductLabelTemplate';

interface QuickRetailProductLabelViewProps {
  input: QuickRetailLabelInput;
  size: { w: number; h: number };
  instanceKey: string;
  currencyCode?: string;
}

function clampPageMm(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.min(1200, Math.max(8, x));
}

function ReportTemplateLabelPaper({
  template,
  instancePrefix,
}: {
  template: ReportTemplate;
  instancePrefix: string;
}) {
  const pw = clampPageMm(template.pageSize?.width, 60);
  const ph = clampPageMm(template.pageSize?.height, 40);

  return (
    <div
      className="relative box-border bg-white text-black"
      style={{ width: `${pw}mm`, height: `${ph}mm` }}
    >
      {template.components.map((comp) => (
        <div
          key={comp.id}
          className="absolute overflow-hidden box-border"
          style={{
            left: `${comp.x}mm`,
            top: `${comp.y}mm`,
            width: `${comp.width}mm`,
            height: `${comp.height}mm`,
            ...comp.style,
            background: comp.type === 'rect' ? (comp.style?.background || '#f3f4f6') : 'transparent',
          }}
        >
          {comp.type === 'text' && (
            <div className="w-full h-full p-0.5 whitespace-pre-wrap break-words">{comp.content}</div>
          )}
          {comp.type === 'barcode' && (() => {
            const barcodeValue = String(comp.content ?? '').trim();
            if (!barcodeValue) return null;
            return (
              <div className="w-full h-full min-h-0 min-w-0 bg-white flex items-center justify-center overflow-hidden box-border">
                <ReportBarcodePreview
                  svgId={`quick-label-barcode-${instancePrefix}-${comp.id}`}
                  value={barcodeValue}
                />
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

/** Sağ tık «Yazdır» ile aynı etiket gövdesi — toplu yazdırmada kullanılır. */
export function QuickRetailProductLabelView({
  input,
  size,
  instanceKey,
  currencyCode,
}: QuickRetailProductLabelViewProps) {
  const template = useMemo(
    () => buildQuickRetailProductLabelTemplate(input, size, currencyCode),
    [input, size.w, size.h, currencyCode],
  );

  return (
    <div
      className="border border-gray-300 bg-white rounded overflow-hidden box-border shrink-0"
      style={{ width: `${size.w}mm`, height: `${size.h}mm` }}
    >
      <ReportTemplateLabelPaper template={template} instancePrefix={instanceKey} />
    </div>
  );
}
