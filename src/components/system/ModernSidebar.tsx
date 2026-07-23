import React, { useState } from 'react';
import {
  ChevronDown, ChevronRight, Package, Search, X, Languages, Moon, Sun
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { Language } from '../../locales/module-translations';
import { useResponsive } from '../../hooks/useResponsive';
import { Translations } from '../../locales/translations';

interface MenuSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: any;
    badge: string | null;
    children?: {
      id: string;
      label: string;
      icon: any;
      badge: string | null;
    }[];
  }[];
}

interface ModernSidebarProps {
  menuSections: MenuSection[];
  currentScreen: string;
  setCurrentScreen: (screen: any) => void;
  menuSearchQuery: string;
  setMenuSearchQuery: (query: string) => void;
  searchResults: any[];
  handleSearchItemClick: (item: any) => void;
  expandedSections: string[];
  toggleSection: (title: string) => void;
  currentLanguage: Language;
  setCurrentLanguage: (lang: Language) => void;
  showLanguageMenu: boolean;
  setShowLanguageMenu: (show: boolean) => void;
  languages: { code: Language; name: string; flag: string; }[];
  APP_VERSION: { full: string };
  t: Translations;
}

export function ModernSidebar({
  menuSections,
  currentScreen,
  setCurrentScreen,
  menuSearchQuery,
  setMenuSearchQuery,
  searchResults,
  handleSearchItemClick,
  expandedSections,
  toggleSection,
  showLanguageMenu: _showLanguageMenu,
  setShowLanguageMenu,
  APP_VERSION,
  t,
}: ModernSidebarProps) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { isMobile } = useResponsive();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const renderMenuItem = (
    item: { id: string; label: string; icon: any; badge: string | null; children?: any[] },
    level: number = 0,
  ) => {
    const isActive = currentScreen === item.id;
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const expandKey = hasChildren
      ? item.id != null && item.id !== ''
        ? String(item.id)
        : `group:${item.label}`
      : String(item.id ?? '');
    const isExpanded = hasChildren
      ? expandedItems.includes(expandKey)
      : expandedItems.includes(item.id);

    if (hasChildren) {
      return (
        <div key={expandKey}>
          <button type="button" onClick={() => toggleItem(expandKey)} className="asin-shell-nav-group">
            <span className="flex items-center gap-2 min-w-0">
              {Icon ? <Icon aria-hidden /> : null}
              <span className="truncate" style={{ paddingLeft: level ? 4 : 0 }}>
                {item.label}
              </span>
            </span>
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
          </button>
          {isExpanded && item.children ? (
            <div className="asin-shell-nav-items">
              {item.children.map((child) => renderMenuItem(child, level + 1))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <button
        key={item.id != null && item.id !== '' ? String(item.id) : `leaf:${item.label}`}
        type="button"
        onClick={() => {
          if (item.id != null && item.id !== '') setCurrentScreen(item.id);
        }}
        className={`asin-shell-nav-item${isActive ? ' is-active' : ''}`}
      >
        {Icon ? <Icon aria-hidden /> : null}
        <span className="truncate flex-1">{item.label}</span>
      </button>
    );
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector(
          '.asin-shell-nav-search input',
        ) as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      if (e.key === 'Escape' && menuSearchQuery) {
        setMenuSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuSearchQuery, setMenuSearchQuery]);

  return (
    <nav className="asin-shell-nav" aria-label="Ana menü">
      <div className="asin-shell-nav-search">
        <Search className="asin-shell-nav-search-icon w-4 h-4" aria-hidden />
        <input
          type="text"
          placeholder={isMobile ? t.sidebar.searchPlaceholderShort : t.sidebar.searchPlaceholderFull}
          value={menuSearchQuery}
          onChange={(e) => setMenuSearchQuery(e.target.value)}
          autoComplete="off"
        />
        {menuSearchQuery ? (
          <button
            type="button"
            onClick={() => setMenuSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-[#1FA8A0]"
            title={t.sidebar.clearSearch}
            aria-label={t.sidebar.clearSearch}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <span className="asin-shell-nav-kbd">⌘K</span>
        )}

        {searchResults.length > 0 && (
          <div className="asin-shell-nav-results">
            {searchResults.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => handleSearchItemClick(item)}
              >
                <span className="asin-shell-brand-mark" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.7rem' }}>
                  {item.icon ? <item.icon className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{item.label}</span>
                  <span className="block text-[0.68rem] opacity-55 truncate">
                    {[item.grandParentLabel, item.parentLabel, item.sectionTitle].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {menuSearchQuery && searchResults.length === 0 && (
          <div className="asin-shell-nav-results p-4 text-center text-sm opacity-60">
            {t.sidebar.noResultsFound}
          </div>
        )}
      </div>

      <div className="asin-shell-nav-body">
        {menuSections.map((section) => (
          <div key={section.title} className="asin-shell-nav-section">
            <button type="button" onClick={() => toggleSection(section.title)}>
              <span className="truncate">{section.title}</span>
              {expandedSections.includes(section.title) ? (
                <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />
              )}
            </button>
            {expandedSections.includes(section.title) && (
              <div className="asin-shell-nav-items">
                {section.items.map((item) => renderMenuItem(item, 0))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="asin-shell-nav-foot">
        <button type="button" onClick={() => setShowLanguageMenu(true)} title={t.sidebar.languageSelection}>
          <Languages className="w-4 h-4" />
          <span>{t.sidebar.languageSelection}</span>
        </button>
        <button
          type="button"
          onClick={toggleDarkMode}
          title={darkMode ? t.sidebar.lightMode : t.sidebar.darkMode}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{darkMode ? t.sidebar.lightMode : t.sidebar.darkMode}</span>
        </button>
        <div className="asin-shell-nav-ver">v{APP_VERSION.full}</div>
      </div>
    </nav>
  );
}
