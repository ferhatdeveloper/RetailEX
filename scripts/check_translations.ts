
import { translations } from './src/locales/translations';
import { moduleTranslations } from './src/locales/module-translations';
import { translations as sharedTranslations } from './src/shared/i18n/translations';

const languages = ['tr', 'en', 'ar', 'ku'];

function checkMissingKeys(obj, name) {
    console.log(`--- Checking ${name} ---`);
    const keys = Object.keys(obj);
    keys.forEach(key => {
        languages.forEach(lang => {
            if (!obj[key][lang]) {
                console.log(`[${name}] Missing ${lang} for key: ${key}`);
            }
        });
    });
}

function checkTranslationsConsistency() {
    console.log(`--- Checking src/locales/translations.ts ---`);
    const trKeys = Object.keys(translations.tr);
    languages.forEach(lang => {
        if (lang === 'tr') return;
        const langKeys = Object.keys(translations[lang]);

        trKeys.forEach(key => {
            if (!langKeys.includes(key)) {
                console.log(`[translations.ts] Missing key in ${lang}: ${key}`);
            }
        });

        langKeys.forEach(key => {
            if (!trKeys.includes(key)) {
                console.log(`[translations.ts] Extra key in ${lang}: ${key} (not in tr)`);
            }
        });
    });
}

// checkMissingKeys needs adjustment for moduleTranslations structure
function checkModuleTranslations() {
    console.log(`--- Checking src/locales/module-translations.ts ---`);
    Object.keys(moduleTranslations).forEach(key => {
        languages.forEach(lang => {
            if (!moduleTranslations[key][lang]) {
                console.log(`[module-translations.ts] Missing ${lang} for key: ${key}`);
            }
        });
    });
}

function checkSharedTranslations() {
    console.log(`--- Checking src/shared/i18n/translations.ts ---`);
    Object.keys(sharedTranslations).forEach(key => {
        languages.forEach(lang => {
            if (!sharedTranslations[key][lang]) {
                console.log(`[shared/i18n/translations.ts] Missing ${lang} for key: ${key}`);
            }
        });
    });
}

// Since I can't easily run TS in this environment without setup, I'll just use this as a reference or try to run it with ts-node if available.
// Alternatively, I can just grep for empty strings or missing keys.
