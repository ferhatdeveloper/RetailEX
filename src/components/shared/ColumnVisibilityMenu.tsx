import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  /** Üst mavi toolbar | arama satırı (Bugün yanı) | varsayılan */
  variant?: 'default' | 'toolbar' | 'filterBar';
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
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 280;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    setMenuPos({ top: rect.bottom + 6, left });
  };

  const openMenu = () => {
    updateMenuPos();
    setIsOpen(true);
  };

  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const onScrollOrResize = () => updateMenuPos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen]);

  const isToolbar = variant === 'toolbar';
  const isFilterBar = variant === 'filterBar';

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.label.toLocaleLowerCase('tr-TR').includes(q) ||
        c.id.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [columns, search]);

  const menuPanel = isOpen && menuPos ? (
    <div
      ref={menuRef}
      className="fixed w-[280px] bg-white rounded-lg shadow-2xl border border-gray-200 z-[14000]"
      style={{ top: menuPos.top, left: menuPos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800">Kolon Görünürlüğü</span>
          <button type="button" onClick={closeMenu} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShowAll}
            className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
          >
            Tümünü Göster
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="flex-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 font-medium"
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

      <div className="max-h-[min(24rem,50vh)] overflow-y-auto p-2">
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
  ) : null;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className={
          isFilterBar
            ? `flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded border transition-colors whitespace-nowrap ${
                isOpen
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
              }`
            : isToolbar
              ? 'flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-bold'
              : 'px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm'
        }
        title="Kolon görünürlüğü — DB alanlarını seç"
      >
        <Columns3 className={isToolbar ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
        <span>Kolonlar</span>
      </button>

      {typeof document !== 'undefined' && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
