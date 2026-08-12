import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Database,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { TemplateType } from '../../core/types/templates';
import {
  getBuiltinTemplateFieldCatalog,
  getTemplateFieldCatalog,
  TEMPLATE_FIELD_CATEGORY_LABELS,
  type TemplateFieldCategory,
  type TemplateFieldDef,
} from '../../services/templateFieldCatalog';
import {
  addCustomTemplateField,
  loadCustomTemplateFields,
  removeCustomTemplateField,
} from '../../services/templateCustomFieldsStorage';
import {
  dbColumnToFieldDef,
  discoverTemplateDbSchema,
  formatSampleFromRow,
  loadDbSampleRow,
  type DbTableMeta,
} from '../../services/templateDbFieldDiscoveryService';

type PanelTab = 'builtin' | 'database' | 'pinned';

interface TemplateDesignerFieldsPanelProps {
  type: TemplateType;
  previewContext: Record<string, unknown> | null;
  onInsertField: (field: TemplateFieldDef) => void;
}

function FieldCard({
  field,
  previewContext,
  onInsert,
  onPin,
  onUnpin,
  showPin,
  showUnpin,
}: {
  field: TemplateFieldDef;
  previewContext: Record<string, unknown> | null;
  onInsert: (f: TemplateFieldDef) => void;
  onPin?: (f: TemplateFieldDef) => void;
  onUnpin?: (token: string) => void;
  showPin?: boolean;
  showUnpin?: boolean;
}) {
  const resolveLiveSample = (): string => {
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
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('field', field.token);
        e.dataTransfer.setData('fieldType', field.token === '{{items}}' ? 'table' : 'text');
      }}
      onClick={() => onInsert(field)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onInsert(field);
        }
      }}
      className="group px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-1">
        <code className="text-[10px] text-blue-700 break-all flex-1">{field.token}</code>
        <div className="flex items-center gap-0.5 shrink-0">
          {field.source === 'database' && (
            <span title="Veritabanı kolonu">
              <Database className="w-3 h-3 text-violet-600" aria-hidden />
            </span>
          )}
          {previewContext && (
            <span title="Canlı örnek">
              <Sparkles className="w-3 h-3 text-emerald-600" aria-hidden />
            </span>
          )}
          {showPin && onPin && (
            <button
              type="button"
              title="Listeme ekle"
              onClick={(e) => {
                e.stopPropagation();
                onPin(field);
              }}
              className="p-0.5 rounded hover:bg-white opacity-0 group-hover:opacity-100"
            >
              <BookmarkPlus className="w-3 h-3 text-amber-600" />
            </button>
          )}
          {showUnpin && onUnpin && (
            <button
              type="button"
              title="Listeden çıkar"
              onClick={(e) => {
                e.stopPropagation();
                onUnpin(field.token);
              }}
              className="p-0.5 rounded hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3 text-red-500" />
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-gray-700 font-medium mt-0.5">{field.label}</p>
      <p className="text-[10px] text-gray-500 truncate" title={resolveLiveSample()}>
        Örnek: {resolveLiveSample()}
      </p>
      {field.description && <p className="text-[9px] text-gray-400 mt-0.5">{field.description}</p>}
      {field.dataType && (
        <p className="text-[9px] text-violet-500 mt-0.5">{field.dataType}</p>
      )}
    </div>
  );
}

function FieldsList({
  fields,
  previewContext,
  onInsert,
  onPin,
  onUnpin,
  showPin,
  showUnpin,
  emptyMessage,
}: {
  fields: TemplateFieldDef[];
  previewContext: Record<string, unknown> | null;
  onInsert: (f: TemplateFieldDef) => void;
  onPin?: (f: TemplateFieldDef) => void;
  onUnpin?: (token: string) => void;
  showPin?: boolean;
  showUnpin?: boolean;
  emptyMessage: string;
}) {
  const [category, setCategory] = useState<TemplateFieldCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    const set = new Set<TemplateFieldCategory>();
    for (const f of fields) set.add(f.category);
    return Array.from(set);
  }, [fields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return fields.filter((f) => {
      if (category !== 'all' && f.category !== category) return false;
      if (!q) return true;
      return (
        f.label.toLocaleLowerCase('tr-TR').includes(q) ||
        f.token.toLocaleLowerCase('tr-TR').includes(q) ||
        f.dataKey.toLocaleLowerCase('tr-TR').includes(q) ||
        (f.columnName ?? '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [fields, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<TemplateFieldCategory, TemplateFieldDef[]>();
    for (const f of filtered) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [filtered]);

  if (fields.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-6">{emptyMessage}</p>;
  }

  return (
    <>
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
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            category === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'
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
              category === cat ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'
            }`}
          >
            {TEMPLATE_FIELD_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">Eşleşen alan yok</p>
        )}
        {Array.from(grouped.entries()).map(([cat, list]) => (
          <div key={cat}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              {TEMPLATE_FIELD_CATEGORY_LABELS[cat]} ({list.length})
            </p>
            <div className="space-y-1">
              {list.map((field) => (
                <FieldCard
                  key={field.token}
                  field={field}
                  previewContext={previewContext}
                  onInsert={onInsert}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  showPin={showPin}
                  showUnpin={showUnpin}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function TemplateDesignerFieldsPanel({
  type,
  previewContext,
  onInsertField,
}: TemplateDesignerFieldsPanelProps) {
  const [tab, setTab] = useState<PanelTab>('builtin');
  const [pinned, setPinned] = useState<TemplateFieldDef[]>(() => loadCustomTemplateFields(type));
  const [dbSchema, setDbSchema] = useState<DbTableMeta[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableSamples, setTableSamples] = useState<Record<string, Record<string, unknown> | null>>({});

  const builtinCatalog = useMemo(() => getBuiltinTemplateFieldCatalog(type), [type]);
  const fullCatalog = useMemo(() => getTemplateFieldCatalog(type), [type, pinned.length]);

  const loadDbSchema = useCallback(async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const schema = await discoverTemplateDbSchema(type);
      setDbSchema(schema);
      if (schema.length > 0 && !selectedTable) {
        setSelectedTable(schema[0]!.logicalName);
      }
      const samples: Record<string, Record<string, unknown> | null> = {};
      for (const t of schema) {
        samples[t.logicalName] = await loadDbSampleRow(t.logicalName);
      }
      setTableSamples(samples);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : String(err));
    } finally {
      setDbLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (tab === 'database' && dbSchema.length === 0 && !dbLoading) {
      void loadDbSchema();
    }
  }, [tab, dbSchema.length, dbLoading, loadDbSchema]);

  const dbFieldsForTable = useMemo(() => {
    const table = dbSchema.find((t) => t.logicalName === selectedTable);
    if (!table) return [];
    const sample = tableSamples[selectedTable];
    return table.columns.map((col) =>
      dbColumnToFieldDef(col, formatSampleFromRow(sample ?? null, col.columnName) || undefined),
    );
  }, [dbSchema, selectedTable, tableSamples]);

  const handlePin = (field: TemplateFieldDef) => {
    const next = addCustomTemplateField(type, { ...field, source: field.source ?? 'custom' });
    setPinned(next);
  };

  const handleUnpin = (token: string) => {
    setPinned(removeCustomTemplateField(type, token));
  };

  const handleAddAllTableColumns = () => {
    for (const f of dbFieldsForTable) {
      addCustomTemplateField(type, f);
    }
    setPinned(loadCustomTemplateFields(type));
  };

  const selectedTableMeta = dbSchema.find((t) => t.logicalName === selectedTable);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Dinamik Alanlar</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
          {fullCatalog.length}
        </span>
      </div>

      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-2 shrink-0">
        {(
          [
            { id: 'builtin' as const, label: 'Standart', icon: Layers },
            { id: 'database' as const, label: 'Veritabanı', icon: Database },
            { id: 'pinned' as const, label: `Listem (${pinned.length})`, icon: BookmarkPlus },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium ${
              tab === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-gray-500 mb-2 shrink-0">
        Tıklayın veya sürükleyip tuvala bırakın. Veritabanı sekmesinden kolonları listeye ekleyebilirsiniz.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {tab === 'builtin' && (
          <FieldsList
            fields={builtinCatalog}
            previewContext={previewContext}
            onInsert={onInsertField}
            onPin={handlePin}
            showPin
            emptyMessage="Standart alan yok"
          />
        )}

        {tab === 'pinned' && (
          <FieldsList
            fields={pinned}
            previewContext={previewContext}
            onInsert={onInsertField}
            onUnpin={handleUnpin}
            showUnpin
            emptyMessage="Henüz alan eklemediniz. Veritabanı sekmesinden + ile ekleyin."
          />
        )}

        {tab === 'database' && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void loadDbSchema()}
                disabled={dbLoading}
                className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {dbLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Şemayı yükle
              </button>
            </div>
            {dbError && (
              <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded p-2">{dbError}</p>
            )}
            {dbSchema.length > 0 && (
              <>
                <label className="block text-[10px] font-bold text-gray-500 uppercase">Tablo</label>
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2"
                >
                  {dbSchema.map((t) => (
                    <option key={t.logicalName} value={t.logicalName}>
                      {t.label} ({t.columns.length} kolon)
                    </option>
                  ))}
                </select>
                {selectedTableMeta && (
                  <p className="text-[9px] text-gray-400 mb-2 font-mono truncate" title={selectedTableMeta.physicalName}>
                    {selectedTableMeta.physicalName}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAddAllTableColumns}
                  className="w-full mb-2 flex items-center justify-center gap-1 text-[10px] py-1.5 bg-violet-50 text-violet-800 border border-violet-200 rounded-lg hover:bg-violet-100"
                >
                  <Plus className="w-3 h-3" />
                  Tüm kolonları listeme ekle
                </button>
                <FieldsList
                  fields={dbFieldsForTable}
                  previewContext={previewContext}
                  onInsert={onInsertField}
                  onPin={handlePin}
                  showPin
                  emptyMessage="Bu tabloda kolon yok"
                />
              </>
            )}
            {!dbLoading && dbSchema.length === 0 && !dbError && (
              <p className="text-xs text-gray-500 text-center py-4">
                PostgreSQL bağlantısı ile tablo kolonlarını görmek için «Şemayı yükle»ye basın.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
