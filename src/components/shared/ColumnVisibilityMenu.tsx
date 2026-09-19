import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Columns3, Search } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { GRID_POPOVER_Z } from './FullscreenBodyPortal';

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
  /** Üst mavi toolbar | arama satırı (Bugün yanı) | ızgara chrome | varsayılan */
  variant?: 'default' | 'toolbar' | 'filterBar' | 'grid';
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
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_WIDTH = 300;
  const MENU_HEIGHT = 440;

  const updateMenuPos = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const width = Math.min(MENU_WIDTH, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const flipUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(200, Math.min(MENU_HEIGHT, flipUp ? spaceAbove : spaceBelow));
    const top = flipUp
      ? Math.max(margin, rect.top - maxHeight - 6)
      : rect.bottom + 6;
    setMenuPos({ top, left, width, maxHeight });
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
  const isGrid = variant === 'grid';

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
      className="fixed inset-0"
      style={{ zIndex: GRID_POPOVER_Z, isolation: 'isolate', transform: 'translateZ(0)' }}
      onMouseDown={closeMenu}
    >
      <div
        ref={menuRef}
        className="absolute flex flex-col bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
          height: 'auto',
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
              className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
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
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="mt-2 text-[10px] text-gray-500 tabular-nums">
            {tm('columnsVisibleCount')
              .replace('{visible}', String(visibleCount))
              .replace('{total}', String(filteredColumns.length))}
          </p>
        </div>

        <div className="panel-menu-scroll flex-1 min-h-0 overflow-y-auto p-2 border-b border-gray-100">
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
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 shrink-0"
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
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
              }`
            : isToolbar
              ? 'flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] font-bold'
              : isGrid
                ? 'inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-700 bg-white border border-gray-300 rounded hover:bg-gray-50'
              : 'px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm'
        }
        title={tm('columnVisibilityHint')}
      >
        <Columns3 className={isToolbar || isGrid ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
        <span>{tm('columns')}</span>
      </button>

      {typeof document !== 'undefined' && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
