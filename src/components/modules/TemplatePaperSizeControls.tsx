import { ArrowLeftRight } from 'lucide-react';
import type { Template, TemplateElement, TemplateFormat, TemplateType } from '../../core/types/templates';
import { TEMPLATE_FORMATS } from '../../core/types/templates';
import {
  applyPaperFormatToTemplate,
  applyTemplatePaperDimensions,
  clampTemplatePaperMm,
  getTemplateFormatsForType,
  resolveActivePaperFormat,
  TEMPLATE_PAPER_MM_MAX,
  TEMPLATE_PAPER_MM_MIN,
} from '../../core/templatePaperFormats';

function fitElementsToCanvas(
  elements: TemplateElement[],
  widthMm: number,
  heightMm: number,
): TemplateElement[] {
  return elements.map((el) => {
    const w = Math.min(el.width, widthMm);
    const h = Math.min(el.height, heightMm);
    return {
      ...el,
      width: w,
      height: h,
      x: Math.max(0, Math.min(el.x, widthMm - w)),
      y: Math.max(0, Math.min(el.y, heightMm - h)),
    };
  });
}

export interface TemplatePaperSizeControlsProps {
  template: Template;
  templateType: TemplateType;
  onApply: (patch: Partial<Template>) => void;
  labels?: {
    paperSize?: string;
    paperPreset?: string;
    customSize?: string;
    widthMm?: string;
    heightMm?: string;
    orientation?: string;
    portrait?: string;
    landscape?: string;
    swapDimensions?: string;
    paperSizeHint?: string;
  };
}

export function TemplatePaperSizeControls({
  template,
  templateType,
  onApply,
  labels = {},
}: TemplatePaperSizeControlsProps) {
  const formatOptions = getTemplateFormatsForType(templateType);
  const activeFormat = resolveActivePaperFormat(template);
  const isCustom = activeFormat === 'custom';
  const supportsOrientation =
    templateType === 'invoice' && activeFormat !== '80mm' && activeFormat !== '58mm';

  const applyCanvas = (patch: Partial<Template>) => {
    const width = patch.width ?? template.width;
    const height = patch.height ?? template.height;
    onApply({
      ...patch,
      elements: fitElementsToCanvas(template.elements, width, height),
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePresetChange = (format: TemplateFormat) => {
    if (format === 'custom') {
      applyCanvas({ format: 'custom' });
      return;
    }
    const next = applyPaperFormatToTemplate(format, template.orientation, templateType);
    applyCanvas(next);
  };

  const handleCustomDimension = (widthMm: number, heightMm: number) => {
    const dims = applyTemplatePaperDimensions(template, widthMm, heightMm);
    applyCanvas(dims);
  };

  const handleOrientation = (orientation: Template['orientation']) => {
    if (!supportsOrientation) {
      applyCanvas({ orientation: 'portrait' });
      return;
    }
    if (isCustom) {
      const w = template.width;
      const h = template.height;
      const width = orientation === 'landscape' ? Math.max(w, h) : Math.min(w, h);
      const height = orientation === 'landscape' ? Math.min(w, h) : Math.max(w, h);
      applyCanvas({ orientation, width, height, format: 'custom' });
      return;
    }
    const next = applyPaperFormatToTemplate(activeFormat, orientation, templateType);
    applyCanvas(next);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          {labels.paperSize ?? 'Kağıt boyutu'}
        </label>
        <select
          value={activeFormat}
          onChange={(e) => handlePresetChange(e.target.value as TemplateFormat)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          {formatOptions.map((format) => (
            <option key={format} value={format}>
              {format === 'custom'
                ? labels.customSize ?? 'Özel ölçü…'
                : `${TEMPLATE_FORMATS[format].name} (${TEMPLATE_FORMATS[format].width}×${TEMPLATE_FORMATS[format].height} mm)`}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
          {labels.paperSizeHint ??
            'Standart kağıt seçin veya özel ölçü ile milimetre cinsinden tanımlayın.'}
        </p>
      </div>

      {isCustom && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">{labels.widthMm ?? 'Genişlik (mm)'}</label>
            <input
              type="number"
              min={TEMPLATE_PAPER_MM_MIN}
              max={TEMPLATE_PAPER_MM_MAX}
              value={template.width}
              onChange={(e) =>
                handleCustomDimension(clampTemplatePaperMm(Number(e.target.value)), template.height)
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{labels.heightMm ?? 'Yükseklik (mm)'}</label>
            <input
              type="number"
              min={TEMPLATE_PAPER_MM_MIN}
              max={TEMPLATE_PAPER_MM_MAX}
              value={template.height}
              onChange={(e) =>
                handleCustomDimension(template.width, clampTemplatePaperMm(Number(e.target.value)))
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              handleCustomDimension(template.height, template.width)
            }
            className="col-span-2 flex items-center justify-center gap-2 px-2 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {labels.swapDimensions ?? 'Genişlik / yükseklik değiştir'}
          </button>
        </div>
      )}

      {!isCustom && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
          {template.width}×{template.height} mm
        </p>
      )}

      {supportsOrientation && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">{labels.orientation ?? 'Yönlendirme'}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleOrientation('portrait')}
              className={`px-3 py-2 text-xs rounded-lg border ${
                template.orientation !== 'landscape'
                  ? 'bg-blue-50 border-blue-500 text-blue-800'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {labels.portrait ?? 'Dikey'}
            </button>
            <button
              type="button"
              onClick={() => handleOrientation('landscape')}
              className={`px-3 py-2 text-xs rounded-lg border ${
                template.orientation === 'landscape'
                  ? 'bg-blue-50 border-blue-500 text-blue-800'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {labels.landscape ?? 'Yatay'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
