import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  MAX_MENU_FAVORITES,
  MENU_FAVORITES_CHANGED_EVENT,
  readMenuFavoriteIds,
  resolveFavoritesUserKey,
  writeMenuFavoriteIds,
} from '../services/menuFavoritesService';

export function useMenuFavorites() {
  const { user } = useAuth();
  const userKey = resolveFavoritesUserKey(user);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readMenuFavoriteIds(userKey));

  useEffect(() => {
    setFavoriteIds(readMenuFavoriteIds(userKey));
  }, [userKey]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ userKey?: string; ids?: string[] }>).detail;
      if (detail?.userKey && detail.userKey !== userKey) return;
      if (Array.isArray(detail?.ids)) {
        setFavoriteIds(detail.ids);
        return;
      }
      setFavoriteIds(readMenuFavoriteIds(userKey));
    };
    window.addEventListener(MENU_FAVORITES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MENU_FAVORITES_CHANGED_EVENT, onChange);
  }, [userKey]);

  const persist = useCallback(
    (ids: string[]) => {
      writeMenuFavoriteIds(userKey, ids);
      setFavoriteIds(ids.slice(0, MAX_MENU_FAVORITES));
    },
    [userKey],
  );

  const isFavorite = useCallback(
    (id: string) => favoriteIds.includes(String(id)),
    [favoriteIds],
  );

  const addFavorite = useCallback(
    (id: string) => {
      const sid = String(id || '').trim();
      if (!sid || favoriteIds.includes(sid)) return false;
      if (favoriteIds.length >= MAX_MENU_FAVORITES) return false;
      persist([...favoriteIds, sid]);
      return true;
    },
    [favoriteIds, persist],
  );

  const removeFavorite = useCallback(
    (id: string) => {
      const sid = String(id || '').trim();
      persist(favoriteIds.filter((f) => f !== sid));
    },
    [favoriteIds, persist],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const sid = String(id || '').trim();
      if (!sid) return false;
      if (favoriteIds.includes(sid)) {
        persist(favoriteIds.filter((f) => f !== sid));
        return false;
      }
      if (favoriteIds.length >= MAX_MENU_FAVORITES) return false;
      persist([...favoriteIds, sid]);
      return true;
    },
    [favoriteIds, persist],
  );

  const setFavorites = useCallback(
    (ids: string[]) => {
      persist(ids);
    },
    [persist],
  );

  return {
    favoriteIds,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    setFavorites,
    maxFavorites: MAX_MENU_FAVORITES,
  };
}
