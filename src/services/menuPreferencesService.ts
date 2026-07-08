/**
 * Statik menü tercihleri: PostgreSQL `system_settings.menu_preferences` ↔ localStorage önbellek.
 * Tarayıcı geçmişi silinse bile PG'den yeniden yüklenir.
 */
import { postgres, DB_SETTINGS } from './postgres';

export interface MenuPreferences {
  hidden_modules: string[];
  /** screen_id → global sıra (sürükle-bırak) */
  item_orders?: Record<string, number>;
  updated_at?: string;
}

const HIDDEN_MODULES_KEY = 'retailex_hidden_modules';
const MENU_PREFS_KEY = 'retailex_menu_preferences';

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

function normalizePrefs(raw: unknown): MenuPreferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const hidden = Array.isArray(o.hidden_modules)
    ? o.hidden_modules.map((m) => String(m).trim()).filter(Boolean)
    : [];
  let item_orders: Record<string, number> | undefined;
  if (o.item_orders && typeof o.item_orders === 'object' && !Array.isArray(o.item_orders)) {
    item_orders = {};
    for (const [k, v] of Object.entries(o.item_orders as Record<string, unknown>)) {
      const n = Number(v);
      if (k && Number.isFinite(n)) item_orders[k] = n;
    }
    if (Object.keys(item_orders).length === 0) item_orders = undefined;
  }
  const updated_at = typeof o.updated_at === 'string' ? o.updated_at : undefined;
  return { hidden_modules: hidden, item_orders, updated_at };
}

export function emptyMenuPreferences(): MenuPreferences {
  return { hidden_modules: [] };
}

/** localStorage + retailex_web_config önbelleğine yazar */
export function applyMenuPreferencesToLocalStorage(prefs: MenuPreferences): void {
  if (typeof localStorage === 'undefined') return;
  const hidden = prefs.hidden_modules ?? [];
  try {
    localStorage.setItem(HIDDEN_MODULES_KEY, JSON.stringify(hidden));
    localStorage.setItem(MENU_PREFS_KEY, JSON.stringify(prefs));
    const webRaw = localStorage.getItem('retailex_web_config');
    const web = webRaw ? JSON.parse(webRaw) : {};
    web.hidden_modules = hidden;
    web.menu_preferences = prefs;
    localStorage.setItem('retailex_web_config', JSON.stringify(web));
  } catch {
    /* quota / private mode */
  }
}

/** Önbellekten oku (PG erişilemezse yedek) */
export function readMenuPreferencesFromLocalStorage(): MenuPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const rawPrefs = localStorage.getItem(MENU_PREFS_KEY);
    if (rawPrefs) {
      const parsed = normalizePrefs(JSON.parse(rawPrefs));
      if (parsed) return parsed;
    }
    const standalone = localStorage.getItem(HIDDEN_MODULES_KEY);
    if (standalone) {
      const arr = JSON.parse(standalone);
      if (Array.isArray(arr)) {
        return { hidden_modules: arr.map((m) => String(m)) };
      }
    }
    const webRaw = localStorage.getItem('retailex_web_config');
    if (webRaw) {
      const web = JSON.parse(webRaw);
      if (web.menu_preferences) {
        const fromWeb = normalizePrefs(web.menu_preferences);
        if (fromWeb) return fromWeb;
      }
      if (Array.isArray(web.hidden_modules)) {
        return { hidden_modules: web.hidden_modules.map((m: unknown) => String(m)) };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Tauri config.db hidden_modules ile hizala */
export async function applyMenuPreferencesToTauriConfig(prefs: MenuPreferences): Promise<void> {
  try {
    const { IS_TAURI } = await import('../utils/env');
    if (!IS_TAURI) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const config: Record<string, unknown> = (await invoke('get_app_config')) as Record<string, unknown>;
    config.hidden_modules = prefs.hidden_modules ?? [];
    await invoke('save_app_config', { config });
  } catch {
    /* web veya config yok */
  }
}

/** PostgreSQL'den menü tercihlerini oku */
export async function loadMenuPreferencesFromDb(): Promise<MenuPreferences | null> {
  try {
    if (isRestApi()) {
      const { postgrest } = await import('./api/postgrestClient');
      const rows = await postgrest.get<{ menu_preferences?: unknown }[]>(
        '/system_settings',
        { select: 'menu_preferences', id: 'eq.1', limit: 1 },
        { schema: 'public' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row?.menu_preferences) return null;
      return normalizePrefs(row.menu_preferences);
    }
    const { rows } = await postgres.query(
      `SELECT menu_preferences FROM public.system_settings WHERE id = 1 LIMIT 1`,
      [],
    );
    const raw = rows[0]?.menu_preferences;
    if (!raw) return null;
    return normalizePrefs(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('menu_preferences') || msg.includes('42P01') || msg.includes('does not exist')) {
      return null;
    }
    console.warn('[menuPreferences] loadMenuPreferencesFromDb:', e);
    return null;
  }
}

/** PostgreSQL'e kaydet (yalnızca menu_preferences kolonu) */
export async function saveMenuPreferencesToDb(prefs: MenuPreferences): Promise<void> {
  const payload: MenuPreferences = {
    hidden_modules: prefs.hidden_modules ?? [],
    ...(prefs.item_orders && Object.keys(prefs.item_orders).length > 0
      ? { item_orders: prefs.item_orders }
      : {}),
    updated_at: new Date().toISOString(),
  };
  const json = JSON.stringify(payload);

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const existing = await postgrest.get<{ id?: number }[]>(
      '/system_settings',
      { select: 'id', id: 'eq.1', limit: 1 },
      { schema: 'public' },
    );
    if (Array.isArray(existing) && existing[0]) {
      await postgrest.patch(
        '/system_settings?id=eq.1',
        { menu_preferences: payload },
        { schema: 'public', prefer: 'return=minimal' },
      );
    } else {
      await postgrest.post(
        '/system_settings',
        { id: 1, menu_preferences: payload },
        { schema: 'public', prefer: 'return=minimal' },
      );
    }
    return;
  }

  await postgres.query(
    `INSERT INTO public.system_settings (id, default_currency, menu_preferences)
     VALUES (1, 'IQD', $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       menu_preferences = EXCLUDED.menu_preferences,
       updated_at = CURRENT_TIMESTAMP`,
    [json],
  );
}

/**
 * PG → localStorage senkron (PG öncelikli).
 * PG boşsa yerel önbelleği PG'ye taşır (ilk kurulum migrasyonu).
 */
export async function syncMenuPreferences(): Promise<MenuPreferences> {
  const fromDb = await loadMenuPreferencesFromDb();
  const hasDbData =
    fromDb &&
    ((fromDb.hidden_modules?.length ?? 0) > 0 ||
      (fromDb.item_orders && Object.keys(fromDb.item_orders).length > 0));

  if (hasDbData && fromDb) {
    applyMenuPreferencesToLocalStorage(fromDb);
    await applyMenuPreferencesToTauriConfig(fromDb);
    return fromDb;
  }

  const fromLocal = readMenuPreferencesFromLocalStorage();
  const hasLocalData =
    fromLocal &&
    ((fromLocal.hidden_modules?.length ?? 0) > 0 ||
      (fromLocal.item_orders && Object.keys(fromLocal.item_orders).length > 0));

  if (hasLocalData && fromLocal) {
    try {
      await saveMenuPreferencesToDb(fromLocal);
    } catch (e) {
      console.warn('[menuPreferences] Yerel → PG migrasyonu başarısız:', e);
    }
    return fromLocal;
  }

  const empty = emptyMenuPreferences();
  applyMenuPreferencesToLocalStorage(empty);
  return empty;
}

/** Kaydet: PG + localStorage (+ Tauri) */
export async function persistMenuPreferences(prefs: MenuPreferences): Promise<void> {
  const normalized: MenuPreferences = {
    hidden_modules: prefs.hidden_modules ?? [],
    ...(prefs.item_orders && Object.keys(prefs.item_orders).length > 0
      ? { item_orders: prefs.item_orders }
      : {}),
    updated_at: new Date().toISOString(),
  };
  await saveMenuPreferencesToDb(normalized);
  applyMenuPreferencesToLocalStorage(normalized);
  await applyMenuPreferencesToTauriConfig(normalized);
}
