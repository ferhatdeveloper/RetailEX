import React, { useState } from 'react';
import {
  LayoutGrid, ChevronDown, ChevronRight, Package, FileText, Layers,
  ShoppingCart, TrendingUp, Wallet, Users, Settings, Tag, Scale,
  Boxes, FileSignature, Truck, BarChart3, Receipt, Warehouse,
  FileCheck, Target, GitBranch, Building2, Store, PackagePlus,
  ShoppingBag, Wrench, Search, X, Languages, Moon, Sun
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { Language } from '../../locales/module-translations';
import { useResponsive } from '../../hooks/useResponsive';

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
  APP_VERSION: any;
  menuSource?: 'database' | 'static'; // Yeni prop
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
  currentLanguage,
  setCurrentLanguage,
  showLanguageMenu,
  setShowLanguageMenu,
  languages,
  APP_VERSION,
  menuSource = 'static' // Default value
}: ModernSidebarProps) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { isMobile } = useResponsive();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleItem = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const renderMenuItem = (item: { id: string; label: string; icon: any; badge: string | null; children?: any[]; }, level: number = 0) => {
    const isActive = currentScreen === item.id;
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);

    // Tutarlı spacing ve font boyutları - Responsive
    const basePadding = level === 0
      ? (isMobile ? 'px-3 sm:px-4' : 'px-4')
      : level === 1
        ? (isMobile ? 'px-4 sm:px-5' : 'px-5')
        : level === 2
          ? (isMobile ? 'px-5 sm:px-6' : 'px-6')
          : (isMobile ? 'px-7 sm:px-8' : 'px-8');
    const iconSize = level === 0
      ? (isMobile ? 'w-5 h-5' : 'w-5 h-5')
      : (isMobile ? 'w-4 h-4' : 'w-4 h-4');
    const fontSize = level === 0
      ? 'text-sm'
      : 'text-xs';
    const fontWeight = level === 0 ? 'font-medium' : 'font-normal';
    const pySize = level === 0
      ? 'py-2.5 min-h-[40px]'
      : 'py-1.5 min-h-[32px]';

    // Eğer children varsa, expandable item render et
    if (hasChildren) {
      return (
        <div key={item.id}>
          <button
            onClick={() => toggleItem(item.id)}
            className={`w-full flex items-center justify-between ${pySize} ${fontSize} ${fontWeight} transition-all duration-200 ${basePadding} active:scale-[0.98] ${darkMode
              ? level === 0
                ? 'text-gray-200 hover:bg-gray-700 hover:text-white active:bg-gray-600'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white active:bg-gray-600'
              : level === 0
                ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
                : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 active:bg-gray-300'
              }`}
          >
            <div className="flex items-center gap-3">
              {Icon && <Icon className={iconSize} />}
              <span>{item.label}</span>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {isExpanded && item.children && (
            <div className={`${darkMode ? 'bg-gray-800 border-l-2 border-gray-600' : 'bg-gray-100 border-l-2 border-gray-300'} ml-4`}>
              {item.children.map(child => renderMenuItem(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    // Leaf items (actual navigation items) - Badge gösterilmiyor
    return (
      <button
        key={item.id}
        onClick={() => {
          setCurrentScreen(item.id);
        }}
        className={`w-full flex items-center gap-2 sm:gap-3 ${pySize} ${fontSize} ${fontWeight} transition-all duration-200 ${basePadding} active:scale-[0.98] ${isActive
          ? darkMode
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
          : darkMode
            ? level === 0
              ? 'text-gray-200 hover:bg-gray-700 hover:text-white active:bg-gray-600'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white active:bg-gray-600'
            : level === 0
              ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
              : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 active:bg-gray-300'
          }`}
      >
        {Icon && <Icon className={iconSize} />}
        <span className="flex-1 text-left">{item.label}</span>
      </button>
    );
  };

  // Keyboard shortcut for search (Ctrl+K or Cmd+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
      // ESC to clear search
      if (e.key === 'Escape' && menuSearchQuery) {
        setMenuSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuSearchQuery, setMenuSearchQuery]);

  return (
    <div className={`h-full overflow-y-auto ${darkMode ? 'bg-gray-900' : 'bg-white'} border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      {/* Search Box - Enhanced */}
      <div className={`p-3 sm:p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gradient-to-br from-blue-50/50 to-white'}`}>
        <div className="relative">
          <div className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            type="text"
            placeholder={isMobile ? "Ara..." : "Menüde hızlı ara... (Ctrl+K)"}
            value={menuSearchQuery}
            onChange={(e) => setMenuSearchQuery(e.target.value)}
            className={`w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3.5 border-2 rounded-lg sm:rounded-xl text-sm sm:text-base font-medium shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 sm:focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px] ${darkMode
              ? 'bg-gray-800/80 border-gray-600 text-white placeholder-gray-400 focus:bg-gray-800 focus:shadow-lg'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white focus:shadow-lg focus:border-blue-500'
              }`}
            autoComplete="off"
          />
          {menuSearchQuery && (
            <button
              onClick={() => setMenuSearchQuery('')}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all duration-200 ${darkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                }`}
              title="Temizle (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {!menuSearchQuery && (
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded text-xs ${darkMode ? 'text-gray-500 bg-gray-700/50' : 'text-gray-400 bg-gray-100'
              }`}>
              <kbd className="px-1.5 py-0.5 rounded text-xs font-mono border border-gray-300">Ctrl</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 rounded text-xs font-mono border border-gray-300">K</kbd>
            </div>
          )}
        </div>

        {/* Search Results Dropdown - Enhanced */}
        {searchResults.length > 0 && (
          <div className={`absolute left-4 right-4 mt-2 max-h-80 overflow-y-auto rounded-xl shadow-2xl border z-50 backdrop-blur-sm ${darkMode
            ? 'bg-gray-800/95 border-gray-600 shadow-gray-900/50'
            : 'bg-white/95 border-gray-200 shadow-gray-900/10'
            }`}>
            <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`text-xs font-semibold px-3 py-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                {searchResults.length} sonuç bulundu
              </div>
            </div>
            <div className="py-1">
              {searchResults.map((item, index) => (
                <button
                  key={`${item.id}-${index}`}
                  onClick={() => handleSearchItemClick(item)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-base text-left transition-all duration-200 border-b last:border-b-0 ${darkMode
                    ? 'hover:bg-gray-700/80 text-gray-200 border-gray-700/50'
                    : 'hover:bg-blue-50 text-gray-700 border-gray-100'
                    }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-blue-100'
                    }`}>
                    {item.icon ? (
                      <item.icon className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-blue-600'}`} />
                    ) : (
                      <Package className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-blue-600'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{item.label}</div>
                    <div className={`text-sm truncate flex items-center gap-1 flex-wrap ${darkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                      {item.grandParentLabel && (
                        <>
                          <span className="font-medium">{item.grandParentLabel}</span>
                          <span>•</span>
                        </>
                      )}
                      {item.parentLabel && (
                        <>
                          <span className="font-medium">{item.parentLabel}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{item.sectionTitle}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No Results Message */}
        {menuSearchQuery && searchResults.length === 0 && (
          <div className={`absolute left-4 right-4 mt-2 p-4 rounded-xl text-center ${darkMode
            ? 'bg-gray-800/95 border border-gray-600 text-gray-400'
            : 'bg-white/95 border border-gray-200 text-gray-500'
            }`}>
            <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sonuç bulunamadı</p>
            <p className="text-xs mt-1 opacity-75">Farklı bir arama terimi deneyin</p>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="py-2">
        {menuSections.map(section => (
          <div key={section.title} className="mb-1">
            <button
              onClick={() => toggleSection(section.title)}
              className={`w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 text-sm sm:text-base font-semibold transition-all duration-200 min-h-[44px] active:scale-[0.98] ${darkMode
                ? 'text-gray-100 hover:bg-gray-700 hover:text-white active:bg-gray-600'
                : 'text-gray-800 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
                }`}
            >
              <span className="flex items-center gap-3">
                <Package className="w-5 h-5" />
                <span>{section.title}</span>
              </span>
              {expandedSections.includes(section.title) ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>

            {expandedSections.includes(section.title) && (
              <div className={`${darkMode ? 'bg-gray-800 border-l-2 border-gray-600' : 'bg-gray-100 border-l-2 border-gray-300'} ml-4`}>
                {section.items.map(item => renderMenuItem(item, 0))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dark Mode Toggle */}
      <div className={`p-3 sm:p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} space-y-2`}>
        <button
          onClick={() => setShowLanguageMenu(true)}
          className={`w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-lg text-sm sm:text-base font-medium transition-all duration-200 min-h-[44px] active:scale-[0.98] ${darkMode
            ? 'text-gray-200 hover:bg-gray-700 bg-gray-800 hover:text-white active:bg-gray-600'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
            }`}
          title="Dil Seçimi"
        >
          <span className="flex items-center gap-3">
            <Languages className="w-5 h-5" />
            <span>Dil Seçimi</span>
          </span>
        </button>
        <button
          onClick={toggleDarkMode}
          className={`w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-lg text-sm sm:text-base font-medium transition-all duration-200 min-h-[44px] active:scale-[0.98] ${darkMode
            ? 'text-gray-200 hover:bg-gray-700 bg-gray-800 hover:text-white active:bg-gray-600'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200'
            }`}
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
        >
          <span className="flex items-center gap-3">
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </span>
        </button>
      </div>

      {/* App Version */}
      <div className="p-3 text-center text-xs text-gray-500">
        <p>Version: {APP_VERSION.display}</p>
        {/* Menu Source Indicator */}
        <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${menuSource === 'database'
          ? darkMode
            ? 'bg-green-900/30 text-green-400 border border-green-700/50'
            : 'bg-green-100 text-green-700 border border-green-200'
          : darkMode
            ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50'
            : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${menuSource === 'database' ? 'bg-green-500' : 'bg-yellow-500'
            }`} />
          {menuSource === 'database' ? '📊 DB Menü' : '📋 Statik Menü'}
        </div>
      </div>
    </div>
  );
}
