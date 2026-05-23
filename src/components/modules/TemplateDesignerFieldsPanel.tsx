import { useMemo, useState } from 'react';
import { Database, Search, Sparkles } from 'lucide-react';
import type { TemplateType } from '../../core/types/templates';
import {
  getTemplateFieldCatalog,
  TEMPLATE_FIELD_CATEGORY_LABELS,
  type TemplateFieldCategory,
  type TemplateFieldDef,
} from '../../services/templateFieldCatalog';

interface TemplateDesignerFieldsPanelProps {
  type: TemplateType;
  previewContext: Record<string, unknown> | null;
  onInsertField: (field: TemplateFieldDef) => void;
}

export function TemplateDesignerFieldsPanel({
  type,
  previewContext,
  onInsertField,
}: TemplateDesignerFieldsPanelProps) {
  const catalog = useMemo(() => getTemplateFieldCatalog(type), [type]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateFieldCategory | 'all'>('all');

  const categories = useMemo(() => {
    const set = new Set<TemplateFieldCategory>();
    for (const f of catalog) set.add(f.category);
    return Array.from(set);
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return catalog.filter((f) => {
      if (category !== 'all' && f.category !== category) return false;
      if (!q) return true;
      return (
        f.label.toLocaleLowerCase('tr-TR').includes(q) ||
        f.token.toLocaleLowerCase('tr-TR').includes(q) ||
        f.dataKey.toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [catalog, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<TemplateFieldCategory, TemplateFieldDef[]>();
    for (const f of filtered) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [filtered]);

  const resolveLiveSample = (field: TemplateFieldDef): string => {
    if (!previewContext) return field.sampleValue;
    const key = field.dataKey;
    if (key === 'items') return '(tablo)';
    const direct = previewContext[key];
    if (direct != null && direct !== '' && typeof direct !== 'object') return String(direct);
    const parts = key.split('.');
    let cur: unknown = previewContext;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return field.sampleValue;
      cur = (cur as Record<string, unknown>)[p];
    }
    if (cur != null && cur !== '' && typeof cur !== 'object') return String(cur);
    return field.sampleValue;
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Dinamik Alanlar</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
          {catalog.length}
        </span>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Alan ara…"
          className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            category === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Tümü
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              category === cat ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TEMPLATE_FIELD_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-gray-500 mb-2 flex items-start gap-1">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
        Tıklayın veya sürükleyip tuvala bırakın. Önizleme modunda sağdaki değerler canlı veriden gelir.
      </p>

      <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">Eşleşen alan yok</p>
        )}
        {Array.from(grouped.entries()).map(([cat, fields]) => (
          <div key={cat}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              {TEMPLATE_FIELD_CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-1">
              {fields.map((field) => (
                <div
                  key={field.token}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('field', field.token);
                    e.dataTransfer.setData('fieldType', field.token === '{{items}}' ? 'table' : 'text');
                  }}
                  onClick={() => onInsertField(field)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onInsertField(field);
                    }
                  }}
                  className="px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <code className="text-[10px] text-blue-700 break-all">{field.token}</code>
                    {previewContext && (
                      <span title="Canlı örnek değer" className="shrink-0">
                        <Database className="w-3 h-3 text-emerald-600" aria-hidden />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-700 font-medium mt-0.5">{field.label}</p>
                  <p className="text-[10px] text-gray-500 truncate" title={resolveLiveSample(field)}>
                    Örnek: {resolveLiveSample(field)}
                  </p>
                  {field.description && (
                    <p className="text-[9px] text-gray-400 mt-0.5">{field.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
