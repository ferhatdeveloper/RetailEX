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
      className={`shrink-0 flex items-stretch border-b ${
        darkMode
          ? 'bg-gray-800/95 border-gray-700'
          : 'bg-slate-100/90 border-slate-200'
      }`}
      role="tablist"
      aria-label="Açık sayfalar"
    >
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 flex items-stretch gap-0.5 overflow-x-auto overflow-y-hidden px-1 py-1"
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
              className={`group relative flex items-center gap-1.5 max-w-[12rem] min-w-[6rem] px-2.5 py-1.5 rounded-md cursor-pointer select-none transition-colors ${
                active
                  ? darkMode
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : darkMode
                    ? 'text-gray-300 hover:bg-gray-700/60'
                    : 'text-slate-600 hover:bg-white/70'
              }`}
              title={tab.title}
            >
              <span className="truncate text-xs font-medium flex-1 min-w-0">
                {tab.title}
              </span>
              {canClose ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.screenId);
                  }}
                  className={`shrink-0 p-0.5 rounded transition-colors ${
                    active
                      ? darkMode
                        ? 'hover:bg-gray-600 text-gray-200'
                        : 'hover:bg-slate-200 text-slate-500'
                      : darkMode
                        ? 'opacity-0 group-hover:opacity-100 hover:bg-gray-600'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-slate-200'
                  }`}
                  aria-label={`${closeTabLabel}: ${tab.title}`}
                  title={closeTabLabel}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {tabs.length >= MAX_MANAGEMENT_TABS ? (
        <div
          className={`shrink-0 flex items-center px-2 text-[10px] font-medium ${
            darkMode ? 'text-amber-400' : 'text-amber-700'
          }`}
          title={`En fazla ${MAX_MANAGEMENT_TABS} sekme`}
        >
          {tabs.length}/{MAX_MANAGEMENT_TABS}
        </div>
      ) : null}
    </div>
  );
}
