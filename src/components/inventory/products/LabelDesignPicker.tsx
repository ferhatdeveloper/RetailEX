import { useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { Template, TemplateUsageScope } from '../../../core/types/templates';
import { useTemplateStore } from '../../../store/useTemplateStore';
import {
  LABEL_DESIGNS,
  type LabelDesign,
} from './ProductLabelPrint';
import {
  labelTemplateDesignId,
  mergeLabelTemplatesForScopes,
} from '../../../services/labelTemplateRender';

export interface LabelDesignPickerProps {
  selectedDesignId: string;
  onSelectBuiltin: (design: LabelDesign) => void;
  onSelectTemplate: (template: Template) => void;
  /** Etiket şablonu kapsamları (global otomatik dahil edilir) */
  templateScopes?: TemplateUsageScope[];
  tm: (key: string) => string;
}

const DEFAULT_SCOPES: TemplateUsageScope[] = ['product_bulk_label', 'shelf_label'];

export function LabelDesignPicker({
  selectedDesignId,
  onSelectBuiltin,
  onSelectTemplate,
  templateScopes = DEFAULT_SCOPES,
  tm,
}: LabelDesignPickerProps) {
  const { getTemplatesForScope, loadTemplatesFromDatabase } = useTemplateStore();

  useEffect(() => {
    void loadTemplatesFromDatabase();
  }, [loadTemplatesFromDatabase]);

  const labelTemplates = useMemo(
    () => mergeLabelTemplatesForScopes(getTemplatesForScope, templateScopes),
    [getTemplatesForScope, templateScopes],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {LABEL_DESIGNS.map((design) => (
          <button
            key={design.id}
            type="button"
            onClick={() => onSelectBuiltin(design)}
            className={`p-2 text-left border-2 rounded-lg transition-all ${
              selectedDesignId === design.id
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="text-lg mb-1">{design.icon}</div>
            <div className="text-xs font-medium">{tm(design.id)}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {tm(`${design.id}_desc`) || design.description.split('-')[0]}
            </div>
          </button>
        ))}
      </div>

      {labelTemplates.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {tm('labelCustomTemplates')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {labelTemplates.map((template) => {
              const designId = labelTemplateDesignId(template.id);
              const active = selectedDesignId === designId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelectTemplate(template)}
                  className={`p-2 text-left border-2 rounded-lg transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-200 bg-white'
                  }`}
                >
                  <div className="text-lg mb-1 text-indigo-600">
                    <Sparkles className="w-4 h-4 inline" aria-hidden />
                  </div>
                  <div className="text-xs font-medium text-gray-900 line-clamp-2">{template.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {template.width}×{template.height} mm
                    {template.description ? ` · ${template.description}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
