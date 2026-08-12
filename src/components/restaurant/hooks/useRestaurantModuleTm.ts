import { useCallback } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { Language } from '../../../locales/module-translations';
import { moduleTranslations } from '../../../locales/module-translations';

/** Restoran modülünde `moduleTranslations` + dil; anahtar yoksa `tm` fallback. */
export function useRestaurantModuleTm() {
    const { language, tm: globalTm } = useLanguage();
    return useCallback(
        (key: string) => moduleTranslations[key]?.[language as Language] ?? globalTm(key),
        [language, globalTm]
    );
}
