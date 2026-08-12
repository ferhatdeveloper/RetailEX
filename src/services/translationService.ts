/**
 * Free Translation Service using Google Translate (unofficial)
 * Most accurate translations, no API key required
 * Uses Google's public translation endpoint
 */

interface GoogleTranslateResponse {
    data: {
        translations: Array<{
            translatedText: string;
        }>;
    };
}

/**
 * Translate text using Google Translate (unofficial endpoint)
 * @param text - Text to translate
 * @param sourceLang - Source language code (e.g., 'tr')
 * @param targetLang - Target language code (e.g., 'en', 'ar', 'ku')
 * @returns Translated text
 */
export async function translateText(
    text: string,
    sourceLang: string = 'tr',
    targetLang: string
): Promise<string> {
    if (!text || text.trim() === '') {
        return '';
    }

    try {
        // Using Google Translate's public endpoint (no API key needed)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();

        // Google Translate returns nested arrays: [[[translated_text, original_text, null, null, 3]]]
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0][0][0];
        }

        // Fallback: return original text with prefix if translation fails
        return `[TR] ${text}`;
    } catch (error) {
        console.error(`Translation error (${sourceLang} → ${targetLang}):`, error);
        return `[TR] ${text}`;
    }
}

/**
 * Translate Turkish text to multiple languages
 * @param turkishText - Turkish text to translate
 * @returns Object with translations for en, ar, ku
 */
export async function translateToAllLanguages(turkishText: string): Promise<{
    en: string;
    ar: string;
    ku: string;
}> {
    if (!turkishText || turkishText.trim() === '') {
        return { en: '', ar: '', ku: '' };
    }

    try {
        // Translate to all languages in parallel
        // Note: 'ckb' is Central Kurdish (Sorani), used in Iraq
        const [en, ar, ku] = await Promise.all([
            translateText(turkishText, 'tr', 'en'),
            translateText(turkishText, 'tr', 'ar'),
            translateText(turkishText, 'tr', 'ckb'), // Sorani (Central Kurdish)
        ]);

        return { en, ar, ku };
    } catch (error) {
        console.error('Batch translation error:', error);
        return {
            en: `[TR] ${turkishText}`,
            ar: `[TR] ${turkishText}`,
            ku: `[TR] ${turkishText}`,
        };
    }
}

/**
 * Debounce function to limit API calls
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}

