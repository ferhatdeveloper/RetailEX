import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  MAX_MANAGEMENT_TABS,
  useManagementTabsStore,
} from '../../store/useManagementTabsStore';

interface ManagementTabBarProps {
  onActivate: (screenId: string) => void;
  onClose: (screenId: string) => void;
  closeTabLabel?: string;
}

/**
 * Yönetim çoklu sekme çubuğu — kurumsal, tek satır, içerikle ayrılmış şerit.
 */
export function ManagementTabBar({
  onActivate,
  onClose,
  closeTabLabel = 'Sekmeyi kapat',
}: ManagementTabBarProps) {
  const { darkMode } = useTheme();
  const tabs = useManagementTabsStore((s) => s.tabs);
  const activeScreenId = useManagementTabsStore((s) => s.activeScreenId);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      className={`shrink-0 z-20 flex h-10 items-stretch border-b shadow-sm ${
        darkMode
          ? 'bg-gray-900 border-gray-700'
          : 'bg-slate-200/80 border-slate-300'
      }`}
      role="tablist"
      aria-label="Açık sayfalar"
    >
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 flex items-end gap-0 overflow-x-auto overflow-y-hidden px-2 pt-1.5"
      >
        {tabs.map((tab) => {
          const active = tab.screenId === activeScreenId;
          const canClose = tabs.length > 1;
          return (
            <div
              key={tab.screenId}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onActivate(tab.screenId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onActivate(tab.screenId);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && canClose) {
                  e.preventDefault();
                  onClose(tab.screenId);
                }
              }}
              className={`group relative flex h-8 max-w-[11.5rem] min-w-[7rem] items-center gap-1.5 px-3 cursor-pointer select-none transition-colors border border-b-0 rounded-t-md -mb-px ${
                active
                  ? darkMode
                    ? 'bg-gray-800 text-white border-gray-600 z-[1]'
                    : 'bg-white text-slate-900 border-slate-300 z-[1] shadow-[0_-1px_2px_rgba(15,23,42,0.04)]'
                  : darkMode
                    ? 'bg-gray-800/40 text-gray-400 border-transparent hover:bg-gray-800/70 hover:text-gray-200'
                    : 'bg-slate-100/80 text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-800'
              }`}
              title={tab.title}
            >
              {/* Aktif sekme alt çizgi — içerik zeminine birleşir */}
              {active ? (
                <span
                  className={`pointer-events-none absolute inset-x-0 -bottom-px h-0.5 ${
                    darkMode ? 'bg-blue-500' : 'bg-blue-600'
                  }`}
                  aria-hidden
                />
              ) : null}
              <span
                className={`truncate text-[12px] leading-none flex-1 min-w-0 ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {tab.title}
              </span>
              {canClose ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.screenId);
                  }}
                  className={`shrink-0 p-0.5 rounded-sm transition-colors ${
                    active
                      ? darkMode
                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                      : darkMode
                        ? 'opacity-0 group-hover:opacity-100 text-gray-400 hover:bg-gray-700'
                        : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:bg-slate-200'
                  }`}
                  aria-label={`${closeTabLabel}: ${tab.title}`}
                  title={closeTabLabel}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {tabs.length >= 2 ? (
        <div
          className={`shrink-0 flex items-center gap-1.5 px-3 text-[11px] tabular-nums border-l ${
            darkMode
              ? 'text-gray-500 border-gray-700'
              : 'text-slate-500 border-slate-300'
          }`}
          title={
            tabs.length >= MAX_MANAGEMENT_TABS
              ? `En fazla ${MAX_MANAGEMENT_TABS} sekme`
              : `${tabs.length} açık sekme`
          }
        >
          {tabs.length}
          <span className="opacity-60">/</span>
          {MAX_MANAGEMENT_TABS}
        </div>
      ) : null}
    </div>
  );
}
