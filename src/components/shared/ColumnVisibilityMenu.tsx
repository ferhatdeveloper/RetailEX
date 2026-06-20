import { useState, useEffect, useRef, useMemo } from 'react';
import { Eye, EyeOff, Columns3, Search } from 'lucide-react';

interface Column {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnVisibilityMenuProps {
  columns: Column[];
  onToggle: (columnId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  /** Üst mavi toolbar ile uyumlu kompakt görünüm */
  variant?: 'default' | 'toolbar';
}

export function ColumnVisibilityMenu({
  columns,
  onToggle,
  onShowAll,
  onHideAll,
  variant = 'default',
}: ColumnVisibilityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen]);

  const isToolbar = variant === 'toolbar';

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.label.toLocaleLowerCase('tr-TR').includes(q) ||
        c.id.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [columns, search]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          isToolbar
            ? 'flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-bold'
            : 'px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm'
        }
        title="Kolon görünürlüğü"
      >
        <Columns3 className={isToolbar ? 'w-3 h-3 shrink-0' : 'w-4 h-4'} />
        <span className={isToolbar ? 'hidden sm:inline' : ''}>Kolonlar</span>
      </button>

      {isOpen && (
        <div
          className={`absolute mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-[13000] ${
            isToolbar ? 'right-0' : 'right-0'
          }`}
        >
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Kolon Görünürlüğü</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onShowAll}
                className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
              >
                Tümünü Göster
              </button>
              <button
                type="button"
                onClick={onHideAll}
                className="flex-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
              >
                Tümünü Gizle
              </button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kolon ara..."
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {filteredColumns.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Eşleşen kolon yok</p>
            ) : (
              filteredColumns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => onToggle(column.id)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 flex-1 truncate">{column.label}</span>
                {column.visible ? (
                  <Eye className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </label>
            ))
            )}
          </div>
          <p className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100">
            Seçimler tarayıcıda kaydedilir (localStorage).
          </p>
        </div>
      )}
    </div>
  );
}
