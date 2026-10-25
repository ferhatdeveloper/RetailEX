import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dailyAvansPaymentLabel } from '../../utils/dailySalesDetailPaymentLabel';

/**
 * Günlük rapor Ödeme kolonu — kırmızı kutulu avans hücreleri.
 * Eski: "Rezervasyon Tutarı (5.000 IQD)" / "Reservation Amount (5.000 IQD)".
 * Yeni: yalnızca etiket. Net 5.000, dip 45.000 ve kartlar bu metinden bağımsızdır.
 */
describe('dailyAvansPaymentLabel', () => {
  it('Türkçe etiket parantezli tutar içermez', () => {
    const label = dailyAvansPaymentLabel('Rezervasyon Tutarı');
    expect(label).toBe('Rezervasyon Tutarı');
    expect(label).not.toMatch(/\(/);
    expect(label).not.toMatch(/5[.,]000/);
    expect(label).not.toMatch(/IQD/i);
  });

  it('İngilizce etiket Reservation Amount kalır', () => {
    const legacy = 'Reservation Amount (5.000 IQD)';
    const label = dailyAvansPaymentLabel('Reservation Amount');
    expect(legacy).toBe('Reservation Amount (5.000 IQD)');
    expect(label).toBe('Reservation Amount');
    expect(label).not.toBe(legacy);
    expect(label.includes('(')).toBe(false);
    expect(label.includes('5.000')).toBe(false);
    expect(label.includes('IQD')).toBe(false);
  });

  it('Arapça ve Kürtçe etiketlere parantezli tutar eklenmez', () => {
    expect(dailyAvansPaymentLabel('مبلغ الحجز')).toBe('مبلغ الحجز');
    expect(dailyAvansPaymentLabel('بڕی نۆرەکردن')).toBe('بڕی نۆرەکردن');
    for (const label of [dailyAvansPaymentLabel('مبلغ الحجز'), dailyAvansPaymentLabel('بڕی نۆرەکردن')]) {
      expect(label).not.toMatch(/\(/);
      expect(label).not.toMatch(/\d/);
      expect(label).not.toMatch(/IQD/i);
    }
  });

  it('satış detayı hücresi parantezli tutarı tekrar eklemez', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/reports/ReportsModule.tsx'),
      'utf8',
    );
    expect(source).toContain("dailyAvansPaymentLabel(tm('paymentLabelAvans'))");
    expect(source).not.toMatch(
      /paymentLabelAvans'\)\s*\|\|\s*'Rezervasyon Tutarı'\}\s*\(\$\{formatNumber/,
    );
  });

  it('boş etiket yedek metne düşer ve tutar yazmaz', () => {
    expect(dailyAvansPaymentLabel('')).toBe('Rezervasyon Tutarı');
    expect(dailyAvansPaymentLabel('   ')).toBe('Rezervasyon Tutarı');
    expect(dailyAvansPaymentLabel(undefined)).toBe('Rezervasyon Tutarı');
    expect(dailyAvansPaymentLabel(null)).toBe('Rezervasyon Tutarı');
  });
});
