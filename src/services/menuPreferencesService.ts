/**
 * Statik menü tercihleri: PostgreSQL `system_settings.menu_preferences` ↔ localStorage önbellek.
 * Birden fazla adlandırılmış yükleme seçeneği (kullanıcı + tarih varsayılan etiket).
 */
import { postgres, DB_SETTINGS } from './postgres';
import {
  normalizeHiddenModules,
  remapLegacyStaticHiddenModules,
  getRuntimeHiddenModules,
  setRuntimeHiddenModules,
  subscribeRuntimeHiddenModules,
  syncRuntimeHiddenFromNormalized,
  writeHiddenModulesToLocalStorage,
  readHiddenModulesFromLocalStorage,
  buildDefaultPresetLabel,
} from './menuPreferencesRuntime';

export {
  remapLegacyStaticHiddenModules,
  getRuntimeHiddenModules,
  setRuntimeHiddenModules,
  subscribeRuntimeHiddenModules,
  buildDefaultPresetLabel,
} from './menuPreferencesRuntime';

export interface MenuPreferences {
  hidden_modules: string[];
  item_orders?: Record<string, number>;
  updated_at?: string;
}

export interface MenuPreferencePreset {
  id: string;
  /** Kullanıcının düzenleyebileceği etiket */
  name: string;
  saved_by: string;
  saved_at: string;
  hidden_modules: string[];
  item_orders?: Record<string, number>;
}

export interface MenuPreferencesStore {
  version: 2;
  active_preset_id?: string;
  presets: MenuPreferencePreset[];
}

const MENU_PREFS_STORE_KEY = 'retailex_menu_preferences_store';
const MENU_PREFS_KEY = 'retailex_menu_preferences';

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

function newPresetId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeItemOrders(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const item_orders: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (k && Number.isFinite(n)) item_orders[k] = n;
  }
  return Object.keys(item_orders).length > 0 ? item_orders : undefined;
}

function normalizePrefs(raw: unknown): MenuPreferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const hidden = normalizeHiddenModules(o.hidden_modules);
  const item_orders = normalizeItemOrders(o.item_orders);
  const updated_at = typeof o.updated_at === 'string' ? o.updated_at : undefined;
  return { hidden_modules: hidden, item_orders, updated_at };
}

function presetFromLegacy(prefs: MenuPreferences, savedBy = 'sistem'): MenuPreferencePreset {
  const saved_at = prefs.updated_at || new Date().toISOString();
  return {
    id: newPresetId(),
    name: buildDefaultPresetLabel(savedBy, new Date(saved_at)),
    saved_by: savedBy,
    saved_at,
    hidden_modules: prefs.hidden_modules ?? [],
    item_orders: prefs.item_orders,
  };
}

function normalizeStore(raw: unknown, fallbackUser = 'sistem'): MenuPreferencesStore {
  if (!raw || typeof raw !== 'object') {
    return { version: 2, presets: [] };
  }
  const o = raw as Record<string, unknown>;

  if (o.version === 2 && Array.isArray(o.presets)) {
    const presets: MenuPreferencePreset[] = o.presets
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const pr = p as Record<string, unknown>;
        const id = String(pr.id || '').trim() || newPresetId();
        const name = String(pr.name || '').trim() || buildDefaultPresetLabel(String(pr.saved_by || fallbackUser));
        const saved_by = String(pr.saved_by || fallbackUser).trim() || fallbackUser;
        const saved_at = typeof pr.saved_at === 'string' ? pr.saved_at : new Date().toISOString();
        const hidden_modules = normalizeHiddenModules(pr.hidden_modules);
        const item_orders = normalizeItemOrders(pr.item_orders);
        return { id, name, saved_by, saved_at, hidden_modules, item_orders };
      })
      .filter((p): p is MenuPreferencePreset => p != null);
    return {
      version: 2,
      active_preset_id: typeof o.active_preset_id === 'string' ? o.active_preset_id : undefined,
      presets,
    };
  }

  const legacy = normalizePrefs(raw);
  if (legacy && ((legacy.hidden_modules?.length ?? 0) > 0 || legacy.item_orders)) {
    const preset = presetFromLegacy(legacy, fallbackUser);
    return { version: 2, active_preset_id: preset.id, presets: [preset] };
  }

  return { version: 2, presets: [] };
}

function presetToMenuPreferences(preset: MenuPreferencePreset): MenuPreferences {
  return {
    hidden_modules: preset.hidden_modules ?? [],
    item_orders: preset.item_orders,
    updated_at: preset.saved_at,
  };
}

function resolveActivePreset(store: MenuPreferencesStore): MenuPreferencePreset | null {
  if (store.presets.length === 0) return null;
  if (store.active_preset_id) {
    const found = store.presets.find((p) => p.id === store.active_preset_id);
    if (found) return found;
  }
  return [...store.presets].sort((a, b) => b.saved_at.localeCompare(a.saved_at))[0];
}

export function emptyMenuPreferences(): MenuPreferences {
  return defaultMenuPreferences();
}

/** Statik menü fabrika varsayılanı: gizli modül yok, özel sıra yok */
export function defaultMenuPreferences(): MenuPreferences {
  return { hidden_modules: [] };
}

/** Kayıtlı profil yokken varsayılan menüyü uygula (PG'ye yazmaz) */
export async function applyDefaultMenuPreferences(): Promise<MenuPreferences> {
  const prefs = defaultMenuPreferences();
  const store: MenuPreferencesStore = { version: 2, presets: [] };
  applyMenuPreferencesToLocalStorage(prefs, store);
  await applyMenuPreferencesToTauriConfig(prefs);
  return prefs;
}

async function readRawMenuPreferencesFromDb(): Promise<unknown | null> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ menu_preferences?: unknown }[]>(
      '/system_settings',
      { select: 'menu_preferences', id: 'eq.1', limit: 1 },
      { schema: 'public' },
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return row?.menu_preferences ?? null;
  }
  const { rows } = await postgres.query(
    `SELECT menu_preferences FROM public.system_settings WHERE id = 1 LIMIT 1`,
    [],
  );
  const raw = rows[0]?.menu_preferences;
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function writeMenuPreferencesStoreToDb(store: MenuPreferencesStore): Promise<void> {
  const json = JSON.stringify(store);
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const existing = await postgrest.get<{ id?: number }[]>(
      '/system_settings',
      { select: 'id', id: 'eq.1', limit: 1 },
      { schema: 'public' },
    );
    const patchBody = { menu_preferences: store };
    try {
      if (Array.isArray(existing) && existing[0]) {
        await postgrest.patch(
          '/system_settings?id=eq.1',
          patchBody,
          { schema: 'public', prefer: 'return=minimal' },
        );
      } else {
        await postgrest.post(
          '/system_settings',
          { id: 1, menu_preferences: store },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const schemaCacheMiss =
        msg.includes('PGRST204') ||
        msg.includes('menu_preferences') ||
        msg.includes('schema cache');
      if (!schemaCacheMiss) throw e;
      console.warn('[menuPreferences] PostgREST PATCH başarısız, pg_query yedeği deneniyor:', msg);
    }
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

/** localStorage + retailex_web_config önbelleğine yazar */
export function applyMenuPreferencesToLocalStorage(
  prefs: MenuPreferences,
  store?: MenuPreferencesStore,
  opts?: { notify?: boolean },
): void {
  if (typeof localStorage === 'undefined') return;
  const hidden = normalizeHiddenModules(prefs.hidden_modules ?? []);
  try {
    writeHiddenModulesToLocalStorage(hidden, store);
    localStorage.setItem('retailex_menu_preferences', JSON.stringify({ ...prefs, hidden_modules: hidden }));
    if (store) {
      localStorage.setItem(MENU_PREFS_STORE_KEY, JSON.stringify(store));
    }
  } catch {
    /* quota / private mode */
  }
  syncRuntimeHiddenFromNormalized(hidden, opts?.notify !== false);
}

export function readMenuPreferencesStoreFromLocalStorage(): MenuPreferencesStore | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MENU_PREFS_STORE_KEY);
    if (raw) return normalizeStore(JSON.parse(raw));
    const legacy = readMenuPreferencesFromLocalStorage();
    if (legacy) return normalizeStore(legacy);
  } catch {
    /* ignore */
  }
  return null;
}

/** Önbellekten oku (PG erişilemezse yedek) */
export function readMenuPreferencesFromLocalStorage(): MenuPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const storeRaw = localStorage.getItem(MENU_PREFS_STORE_KEY);
    if (storeRaw) {
      const store = normalizeStore(JSON.parse(storeRaw));
      const active = resolveActivePreset(store);
      if (active) return presetToMenuPreferences(active);
    }
    const rawPrefs = localStorage.getItem(MENU_PREFS_KEY);
    if (rawPrefs) {
      const parsed = normalizePrefs(JSON.parse(rawPrefs));
      if (parsed) return parsed;
    }
    const standalone = readHiddenModulesFromLocalStorage();
    if (standalone.length > 0) {
      return { hidden_modules: standalone };
    }
    const webRaw = localStorage.getItem('retailex_web_config');
    if (webRaw) {
      const web = JSON.parse(webRaw);
      if (web.menu_preferences) {
        const store = normalizeStore(web.menu_preferences);
        const active = resolveActivePreset(store);
        if (active) return presetToMenuPreferences(active);
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

/** PostgreSQL'den tüm yükleme seçeneklerini oku */
export async function loadMenuPreferencesStoreFromDb(fallbackUser = 'sistem'): Promise<MenuPreferencesStore> {
  try {
    const raw = await readRawMenuPreferencesFromDb();
    if (!raw) return { version: 2, presets: [] };
    return normalizeStore(raw, fallbackUser);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('menu_preferences') || msg.includes('42P01') || msg.includes('does not exist')) {
      return { version: 2, presets: [] };
    }
    console.warn('[menuPreferences] loadMenuPreferencesStoreFromDb:', e);
    return { version: 2, presets: [] };
  }
}

/** PostgreSQL'den aktif menü tercihlerini oku (geriye uyumluluk) */
export async function loadMenuPreferencesFromDb(fallbackUser = 'sistem'): Promise<MenuPreferences | null> {
  const store = await loadMenuPreferencesStoreFromDb(fallbackUser);
  const active = resolveActivePreset(store);
  return active ? presetToMenuPreferences(active) : null;
}

export async function listMenuPreferencePresets(fallbackUser = 'sistem'): Promise<MenuPreferencePreset[]> {
  const store = await loadMenuPreferencesStoreFromDb(fallbackUser);
  return [...store.presets].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

/** Yeni yükleme seçeneği kaydet ve aktif yap */
export async function saveMenuPreferencePreset(input: {
  name: string;
  saved_by: string;
  hidden_modules: string[];
  item_orders?: Record<string, number>;
}): Promise<MenuPreferencePreset> {
  const store = await loadMenuPreferencesStoreFromDb(input.saved_by);
  const now = new Date().toISOString();
  const preset: MenuPreferencePreset = {
    id: newPresetId(),
    name: String(input.name || '').trim() || buildDefaultPresetLabel(input.saved_by),
    saved_by: String(input.saved_by || 'sistem').trim() || 'sistem',
    saved_at: now,
    hidden_modules: normalizeHiddenModules(input.hidden_modules),
    item_orders: normalizeItemOrders(input.item_orders),
  };
  store.presets.push(preset);
  store.active_preset_id = preset.id;
  await writeMenuPreferencesStoreToDb(store);
  const prefs = presetToMenuPreferences(preset);
  applyMenuPreferencesToLocalStorage(prefs, store);
  await applyMenuPreferencesToTauriConfig(prefs);
  return preset;
}

/** Seçilen yükleme seçeneğini aktif yap ve önbelleğe yaz */
export async function applyMenuPreferencePresetById(
  presetId: string,
  fallbackUser = 'sistem',
): Promise<MenuPreferences | null> {
  const store = await loadMenuPreferencesStoreFromDb(fallbackUser);
  const preset = store.presets.find((p) => p.id === presetId);
  if (!preset) return null;
  store.active_preset_id = preset.id;
  await writeMenuPreferencesStoreToDb(store);
  const prefs = presetToMenuPreferences(preset);
  applyMenuPreferencesToLocalStorage(prefs, store);
  await applyMenuPreferencesToTauriConfig(prefs);
  return prefs;
}

export async function deleteMenuPreferencePreset(presetId: string, fallbackUser = 'sistem'): Promise<void> {
  const store = await loadMenuPreferencesStoreFromDb(fallbackUser);
  store.presets = store.presets.filter((p) => p.id !== presetId);
  if (store.active_preset_id === presetId) {
    store.active_preset_id = store.presets[0]?.id;
  }
  await writeMenuPreferencesStoreToDb(store);
  const active = resolveActivePreset(store);
  if (active) {
    const prefs = presetToMenuPreferences(active);
    applyMenuPreferencesToLocalStorage(prefs, store);
    await applyMenuPreferencesToTauriConfig(prefs);
  } else {
    await applyDefaultMenuPreferences();
  }
}

/**
 * PG → localStorage senkron (PG öncelikli).
 * PG boşsa yerel önbelleği PG'ye taşır (ilk kurulum migrasyonu).
 */
export async function syncMenuPreferences(fallbackUser = 'sistem'): Promise<MenuPreferences> {
  const fromDbStore = await loadMenuPreferencesStoreFromDb(fallbackUser);
  const activeDb = resolveActivePreset(fromDbStore);

  if (activeDb) {
    const prefs = presetToMenuPreferences(activeDb);
    applyMenuPreferencesToLocalStorage(prefs, fromDbStore);
    await applyMenuPreferencesToTauriConfig(prefs);
    return prefs;
  }

  const fromLocalStore = readMenuPreferencesStoreFromLocalStorage();
  const activeLocal = fromLocalStore ? resolveActivePreset(fromLocalStore) : null;

  if (activeLocal) {
    try {
      await writeMenuPreferencesStoreToDb(fromLocalStore!);
    } catch (e) {
      console.warn('[menuPreferences] Yerel → PG migrasyonu başarısız:', e);
    }
    return presetToMenuPreferences(activeLocal);
  }

  const fromLocal = readMenuPreferencesFromLocalStorage();
  const hasLocalData =
    fromLocal &&
    ((fromLocal.hidden_modules?.length ?? 0) > 0 ||
      (fromLocal.item_orders && Object.keys(fromLocal.item_orders).length > 0));

  if (hasLocalData && fromLocal) {
    try {
      const migrated = normalizeStore(fromLocal, fallbackUser);
      if (migrated.presets.length === 0) {
        const p = presetFromLegacy(fromLocal, fallbackUser);
        migrated.presets = [p];
        migrated.active_preset_id = p.id;
      }
      await writeMenuPreferencesStoreToDb(migrated);
      applyMenuPreferencesToLocalStorage(fromLocal, migrated);
      return fromLocal;
    } catch (e) {
      console.warn('[menuPreferences] Yerel → PG migrasyonu başarısız:', e);
    }
    return fromLocal;
  }

  const empty = defaultMenuPreferences();
  applyMenuPreferencesToLocalStorage(empty, { version: 2, presets: [] });
  await applyMenuPreferencesToTauriConfig(empty);
  return empty;
}

/** Kaydet: PG + localStorage (+ Tauri) — geriye uyumluluk; yeni kayıtlar saveMenuPreferencePreset kullanmalı */
export async function persistMenuPreferences(prefs: MenuPreferences, savedBy = 'sistem'): Promise<void> {
  await saveMenuPreferencePreset({
    name: buildDefaultPresetLabel(savedBy),
    saved_by: savedBy,
    hidden_modules: prefs.hidden_modules ?? [],
    item_orders: prefs.item_orders,
  });
}
