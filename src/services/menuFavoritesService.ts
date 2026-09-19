/** Dashboard / menü favorileri — kullanıcı bazlı localStorage */

export const MENU_FAVORITES_STORAGE_PREFIX = 'retailex_menu_favorites';
export const MENU_FAVORITES_CHANGED_EVENT = 'retailex-menu-favorites-changed';
export const MAX_MENU_FAVORITES = 12;

export type MenuFavoriteLeaf = {
  id: string;
  label: string;
  // lucide / menü ikon bileşeni (menü ağacından gelir)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
  sectionTitle?: string;
};

function storageKey(userKey: string): string {
  return `${MENU_FAVORITES_STORAGE_PREFIX}_${userKey || 'guest'}`;
}

export function resolveFavoritesUserKey(user?: { id?: string; username?: string } | null): string {
  if (!user) return 'guest';
  return String(user.id || user.username || 'guest');
}

export function readMenuFavoriteIds(userKey: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, MAX_MENU_FAVORITES);
  } catch {
    return [];
  }
}

export function writeMenuFavoriteIds(userKey: string, ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(
    0,
    MAX_MENU_FAVORITES,
  );
  localStorage.setItem(storageKey(userKey), JSON.stringify(normalized));
  try {
    window.dispatchEvent(
      new CustomEvent(MENU_FAVORITES_CHANGED_EVENT, {
        detail: { userKey, ids: normalized },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Menü ağacından yalnızca navigasyon yapabilen (leaf) öğeleri düzleştirir */
export function flattenMenuLeaves(sections: unknown[]): MenuFavoriteLeaf[] {
  const out: MenuFavoriteLeaf[] = [];
  const seen = new Set<string>();

  const walk = (items: unknown[], sectionTitle?: string) => {
    if (!Array.isArray(items)) return;
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const children = item.children;
      if (Array.isArray(children) && children.length > 0) {
        walk(children, sectionTitle);
        continue;
      }
      const id = item.id != null ? String(item.id).trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: typeof item.label === 'string' ? item.label : id,
        icon: item.icon as MenuFavoriteLeaf['icon'],
        sectionTitle,
      });
    }
  };

  for (const raw of sections || []) {
    if (!raw || typeof raw !== 'object') continue;
    const section = raw as Record<string, unknown>;
    const title = typeof section.title === 'string' ? section.title : undefined;
    walk((section.items as unknown[]) || [], title);
  }

  return out;
}

export function filterFavoriteIdsByAllowed(
  favoriteIds: string[],
  allowedIds: Set<string> | string[],
): string[] {
  const set = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  return favoriteIds.filter((id) => set.has(id));
}
