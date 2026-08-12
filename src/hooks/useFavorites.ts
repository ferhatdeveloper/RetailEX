import { useState, useEffect } from 'react';

interface FavoritePage {
  id: string;
  name: string;
  desc?: string;
  icon?: string;
}

const FAVORITES_STORAGE_KEY = 'wms_favorite_pages';

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoritePage[]>(() => {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading favorites:', error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }, [favorites]);

  const addFavorite = (page: FavoritePage) => {
    setFavorites(prev => {
      // Zaten favori değilse ekle
      if (!prev.find(f => f.id === page.id)) {
        return [...prev, page];
      }
      return prev;
    });
  };

  const removeFavorite = (pageId: string) => {
    setFavorites(prev => prev.filter(f => f.id !== pageId));
  };

  const toggleFavorite = (page: FavoritePage) => {
    const isFavorite = favorites.some(f => f.id === page.id);
    if (isFavorite) {
      removeFavorite(page.id);
    } else {
      addFavorite(page);
    }
  };

  const isFavorite = (pageId: string) => {
    return favorites.some(f => f.id === pageId);
  };

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite
  };
}







