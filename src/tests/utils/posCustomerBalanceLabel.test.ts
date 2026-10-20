import { describe, expect, it } from 'vitest';
import { translate } from '../../locales/module-translations';
import { formatMoneyWithCode } from '../../utils/currency';
import { formatPosCustomerBalanceLabel } from '../../utils/posCustomerBalanceLabel';

describe('ödeme ekranı bakiye etiketi', () => {
  it('alacak 20.000 peşinatı bir kez IQD ile gösterir ve 90.000 kalanın yerine geçmez', () => {
    const label = formatPosCustomerBalanceLabel({
      balance: -20_000,
      currencyCode: 'IQD',
      debtLabel: 'Borç',
      creditLabel: 'Alacak',
    });
    expect(label).toBe('Alacak: 20.000 IQD');
    expect(label.match(/IQD/g)).toEqual(['IQD']);
    expect(label.includes('90')).toBe(false);
    expect(formatMoneyWithCode(20_000, 'IQD')).toBe('20.000 IQD');
    expect(formatMoneyWithCode(90_000, 'IQD')).toBe('90.000 IQD');
  });

  it('borç ve sıfır bakiyede para birimi bir kez eklenir', () => {
    expect(formatPosCustomerBalanceLabel({
      balance: 90_000,
      currencyCode: 'IQD',
      debtLabel: 'Borç',
      creditLabel: 'Alacak',
    })).toBe('Borç: 90.000 IQD');
    const zero = formatPosCustomerBalanceLabel({
      balance: 0,
      currencyCode: 'IQD',
      debtLabel: 'Borç',
      creditLabel: 'Alacak',
    });
    expect(zero).toBe('0 IQD');
    expect(zero.match(/IQD/g)).toEqual(['IQD']);
  });
});

describe('kasiyer yedek uyarısı', () => {
  it('dört dilde metin döner ve ham anahtar kalmaz', () => {
    expect(translate('cashierFallbackNotice', 'tr')).toBe(
      'Kasiyer seçilmedi — fiş oturum açan kullanıcı adına kaydedilecek.',
    );
    expect(translate('cashierFallbackNotice', 'en')).toBe(
      'No cashier selected — the receipt will be saved under the signed-in user.',
    );
    expect(translate('cashierFallbackNotice', 'ar')).toBe(
      'لم يُختر صراف — يُحفظ الإيصال باسم المستخدم الذي سجّل الدخول.',
    );
    expect(translate('cashierFallbackNotice', 'ku')).toBe(
      'سندوقدار هەڵنەبژێردراوە — پسوڵە بە ناوی بەکارهێنەری چوونەژوورەوە تۆمار دەکرێت.',
    );
    for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
      expect(translate('cashierFallbackNotice', lang)).not.toBe('cashierFallbackNotice');
    }
  });
});
