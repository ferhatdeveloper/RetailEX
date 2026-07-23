import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Columns3, Search } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

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
  const { tm } = useLanguage();
  const locale = tm('localeCode');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_WIDTH = 300;
  const MENU_HEIGHT = 440;
  const LIST_SCROLL_HEIGHT = 250;

  const updateMenuPos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    let top = rect.bottom + 6;
    if (top + MENU_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_HEIGHT - 6);
    }
    setMenuPos({ top, left });
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
    const q = search.trim().toLocaleLowerCase(locale);
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.label.toLocaleLowerCase(locale).includes(q) ||
        c.id.toLocaleLowerCase(locale).includes(q)
    );
  }, [columns, search, locale]);

  const visibleCount = filteredColumns.filter((c) => c.visible).length;

  const menuPanel = isOpen && menuPos ? (
    <div
      ref={menuRef}
      className="fixed flex flex-col bg-white rounded-lg shadow-2xl border border-gray-300 z-[14000] overflow-hidden"
      style={{
        top: menuPos.top,
        left: menuPos.left,
        width: MENU_WIDTH,
        height: Math.min(MENU_HEIGHT, window.innerHeight - 16),
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800">{tm('columnVisibilityTitle')}</span>
          <button type="button" onClick={closeMenu} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShowAll}
            className="flex-1 px-2 py-1 text-xs bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-accent,#1FA8A0)] rounded hover:bg-[var(--asin-accent-muted,#D5F0EE)] font-medium"
          >
            {tm('showAllColumns')}
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="flex-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 font-medium"
          >
            {tm('hideAllColumns')}
          </button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tm('searchColumns')}
            className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
          />
        </div>
        <p className="mt-2 text-[10px] text-gray-500 tabular-nums">
          {tm('columnsVisibleCount')
            .replace('{visible}', String(visibleCount))
            .replace('{total}', String(filteredColumns.length))}
        </p>
      </div>

      <div className="panel-menu-scroll shrink-0 p-2 border-b border-gray-100" style={{ height: LIST_SCROLL_HEIGHT }}>
        {filteredColumns.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">{tm('noMatchingColumns')}</p>
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
                className="w-4 h-4 text-[var(--asin-accent,#1FA8A0)] rounded focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] shrink-0"
              />
              <span className="text-sm text-gray-700 flex-1 truncate" title={column.label}>
                {column.label}
              </span>
              {column.visible ? (
                <Eye className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <EyeOff className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </label>
          ))
        )}
      </div>

      <p className="shrink-0 px-3 py-2 text-[10px] text-gray-400 bg-gray-50 border-t border-gray-100">
        {tm('columnVisibilitySavedNote')}
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
            ? `flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm font-bold rounded border transition-colors whitespace-nowrap ${
                isOpen
                  ? 'bg-[var(--asin-accent,#1FA8A0)] text-white border-[var(--asin-accent,#1FA8A0)] shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-[var(--asin-accent-muted,#D5F0EE)] hover:border-[var(--asin-accent,#1FA8A0)]'
              }`
            : isToolbar
              ? 'flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-bold'
              : 'px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm'
        }
        title={tm('columnVisibilityHint')}
      >
        <Columns3 className={isToolbar ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
        <span>{tm('columns')}</span>
      </button>

      {typeof document !== 'undefined' && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
