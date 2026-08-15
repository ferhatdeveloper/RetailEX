import { useMemo } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';

/** `t.a.b.c` nesnesini `t('a.b.c')` fonksiyonuna çevirir. `common.x` kök `t.x` ile de eşleşir. */
export function makeNestedT(dict: unknown): (key: string, fallback?: string) => string {
  return (key: string, fallback?: string) => {
    const parts = key.split('.');
    let cur: unknown = dict;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[p];
    }
    if (typeof cur === 'string') return cur;
    if (parts[0] === 'common' && parts.length === 2 && dict && typeof dict === 'object') {
      const root = (dict as Record<string, unknown>)[parts[1]];
      if (typeof root === 'string') return root;
    }
    return fallback ?? key;
  };
}

export function useNestedT(): (key: string, fallback?: string) => string {
  const { t: tObj } = useLanguage();
  return useMemo(() => makeNestedT(tObj), [tObj]);
}
