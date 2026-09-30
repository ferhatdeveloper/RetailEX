import { describe, expect, it } from 'vitest';
import { moduleTranslations, translate } from '../../locales/module-translations';

const LANGUAGES = ['tr', 'en', 'ar', 'ku'] as const;

// POS Ödeme Modalı + Beauty POS için kritik i18n anahtarları.
// Bu anahtarlar POSPaymentModal.tsx içindeki `tm(...)` çağrılarında
// kullanılıyor; tanımsız olduklarında UI'da raw key (örn. `prePaymentReceived`)
// görünür. Tüm diller için tanımlı olmalılar.
const REQUIRED_KEYS: readonly string[] = [
  'prePaymentReceived',
  'prePaymentAmount',
  'noCashRegisters',
  'paidNow',
  'pesinatLabel',
  'veresiyeRemainderLabel',
  'appointmentStarted',
  'serviceCompleteSeparately',
];

describe('i18n — POS Peşinatlı & Beauty anahtarları', () => {
  for (const key of REQUIRED_KEYS) {
    it(`moduleTranslations[${key}] tanımlı`, () => {
      expect(moduleTranslations[key]).toBeDefined();
    });

    for (const lang of LANGUAGES) {
      it(`translate("${key}", "${lang}") raw key döndürmüyor (UI'da görünür)`, () => {
        const value = translate(key, lang);
        expect(value).not.toBe(key); // raw key ise UI'da görünür
        expect(value.length).toBeGreaterThan(0);
      });
    }
  }

  it('Tüm gerekli anahtarlar mevcut', () => {
    const missing = REQUIRED_KEYS.filter((k) => !moduleTranslations[k]);
    expect(missing).toEqual([]);
  });
});