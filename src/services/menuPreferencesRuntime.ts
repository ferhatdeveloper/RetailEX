/**
 * Menü gizleme — hafif çalışma anı bus (postgres / PostgREST bağımlılığı yok).
 * Lazy MenuManagementPanel chunk'ının çökmesini önler.
 */

export interface MenuPreferencesLite {
  hidden_modules: string[];
  item_orders?: Record<string, number>;
  updated_at?: string;
}

export interface MenuPreferencesStoreLite {
  version: 2;
  active_preset_id?: string;
  presets: unknown[];
}

const HIDDEN_MODULES_KEY = 'retailex_hidden_modules';
const MENU_PREFS_KEY = 'retailex_menu_preferences';
const MENU_PREFS_STORE_KEY = 'retailex_menu_preferences_store';

const STATIC_MENU_SECTION_IDS = [
  'main-menu',
  'material-management',
  'invoices',
  'finance-management',
  'retail',
  'communication-notifications',
  'reports-analysis',
  'system-management',
] as const;

const STATIC_MENU_SECTION_ID_BASE = 10000;

export function remapLegacyStaticHiddenModules(hidden: string[]): string[] {
  return hidden.map((raw) => {
    const h = String(raw || '').trim();
    const m = /^static_(\d+)$/.exec(h);
    if (!m) return h;
    const idx = parseInt(m[1], 10) - STATIC_MENU_SECTION_ID_BASE;
    if (idx >= 0 && idx < STATIC_MENU_SECTION_IDS.length) {
      return STATIC_MENU_SECTION_IDS[idx];
    }
    return h;
  });
}

export function normalizeHiddenModules(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((m) => String(m).trim()).filter(Boolean)
    : [];
  return [...new Set(remapLegacyStaticHiddenModules(list))];
}

type HiddenModulesListener = (hidden: string[]) => void;
const hiddenModulesListeners = new Set<HiddenModulesListener>();
let runtimeHiddenModules: string[] | null = null;

function notifyHiddenModulesListeners(hidden: string[]): void {
  hiddenModulesListeners.forEach((listener) => {
    try {
      listener(hidden);
    } catch {
      /* ignore */
    }
  });
}

export function readHiddenModulesFromLocalStorage(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HIDDEN_MODULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeHiddenModules(parsed);
    }
    const webRaw = localStorage.getItem('retailex_web_config');
    if (webRaw) {
      const web = JSON.parse(webRaw);
      if (Array.isArray(web.hidden_modules)) return normalizeHiddenModules(web.hidden_modules);
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function writeHiddenModulesToLocalStorage(
  hidden: string[],
  store?: MenuPreferencesStoreLite,
): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = normalizeHiddenModules(hidden);
  runtimeHiddenModules = normalized;
  try {
    localStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify(normalized));
    localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ hidden_modules: normalized }));
    if (store) {
      localStorage.setItem(MENU_PREFS_STORE_KEY, JSON.stringify(store));
    }
    const webRaw = localStorage.getItem('retailex_web_config');
    const web = webRaw ? JSON.parse(webRaw) : {};
    web.hidden_modules = normalized;
    if (store) web.menu_preferences = store;
    localStorage.setItem('retailex_web_config', JSON.stringify(web));
  } catch {
    /* quota */
  }
}

export function getRuntimeHiddenModules(): string[] {
  if (runtimeHiddenModules) return runtimeHiddenModules;
  return readHiddenModulesFromLocalStorage();
}

export function setRuntimeHiddenModules(
  hidden: string[],
  opts?: { persist?: boolean; store?: MenuPreferencesStoreLite },
): void {
  const normalized = normalizeHiddenModules(hidden);
  runtimeHiddenModules = normalized;
  if (opts?.persist !== false) {
    writeHiddenModulesToLocalStorage(normalized, opts?.store);
  }
  notifyHiddenModulesListeners(normalized);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('menuUpdated', {
        detail: { forceReload: false, hidden_modules: normalized, preview: true },
      }),
    );
  }
}

export function subscribeRuntimeHiddenModules(listener: HiddenModulesListener): () => void {
  hiddenModulesListeners.add(listener);
  listener(getRuntimeHiddenModules());
  return () => {
    hiddenModulesListeners.delete(listener);
  };
}

export function buildDefaultPresetLabel(username: string, at = new Date()): string {
  const user = String(username || 'kullanici').trim() || 'kullanici';
  const when = at.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${user} - ${when}`;
}

export function syncRuntimeHiddenFromNormalized(hidden: unknown, notify = true): string[] {
  const normalized = normalizeHiddenModules(hidden);
  runtimeHiddenModules = normalized;
  if (notify) notifyHiddenModulesListeners(normalized);
  return normalized;
}
