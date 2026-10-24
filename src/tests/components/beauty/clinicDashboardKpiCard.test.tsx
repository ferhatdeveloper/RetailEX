/**
 * Klinik Paneli KPI şeridi — zemin ve yazı rengi.
 * Tahsilat 138.500 yeşil kalır. Rezervasyon ciro kartı değildir.
 * Bekleyen, Günlük Rapor indirim kartı ile aynı lavanta paletindedir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { Activity, CheckCircle2, Clock, TrendingUp, Wallet } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ClinicDashboardKpiCard } from '../../../components/beauty/components/ClinicDashboardKpiCard';
import { DAILY_REPORT_DISCOUNT_TONE } from '../../../utils/dailyReportScreenCards';
import {
  CLINIC_DASHBOARD_KPI_KEYS,
  CLINIC_DASHBOARD_PENDING_TONE,
  clinicDashboardKpiTone,
  type ClinicDashboardKpiKey,
} from '../../../utils/clinicDashboardKpiTones';

function cssColor(hex: string): string {
  const body = hex.replace('#', '');
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const SCREEN_ROWS: ReadonlyArray<{
  key: ClinicDashboardKpiKey;
  label: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUp;
}> = [
  { key: 'collection', label: 'Tahsilat', value: '138.500', icon: TrendingUp },
  { key: 'reservation', label: 'Rezervasyon', value: '10.000', sub: 'Avans / Ön Ödeme', icon: Wallet },
  { key: 'completed', label: 'Tamamlanan', value: '3', sub: '%100 tamamlama', icon: CheckCircle2 },
  { key: 'pending', label: 'Bekleyen', value: '0', sub: '0 devam ediyor', icon: Clock },
  { key: 'cancelled', label: 'İptal', value: '0', icon: Activity },
  { key: 'expected-revenue', label: 'Beklenen Ciro', value: '0', sub: '0 randevu kaldı', icon: Wallet },
];

describe('Klinik Paneli KPI kart renkleri', () => {
  it('altı kartın zemini ve yazısı istenen palettedir; bekleyen indirim kartıyla aynıdır', () => {
    expect(CLINIC_DASHBOARD_KPI_KEYS).toEqual([
      'collection',
      'reservation',
      'completed',
      'pending',
      'cancelled',
      'expected-revenue',
    ]);

    const collection = clinicDashboardKpiTone('collection');
    const reservation = clinicDashboardKpiTone('reservation');
    const completed = clinicDashboardKpiTone('completed');
    const pending = clinicDashboardKpiTone('pending');
    const cancelled = clinicDashboardKpiTone('cancelled');
    const expected = clinicDashboardKpiTone('expected-revenue');

    expect(collection.background).toBe('#12b76a');
    expect(collection.value).toBe('#ffffff');
    expect(collection.label).toBe('#ffffff');
    expect(collection.hint).toBe('#ffffff');
    expect(collection.icon).toBe('#ffffff');

    expect(reservation.background).toBe('#f59e0b');
    expect(reservation.value).toBe('#ffffff');
    expect(reservation.background).not.toBe(collection.background);
    expect(reservation.background).not.toBe(expected.background);

    expect(completed.background).toBe('#2563eb');
    expect(completed.value).toBe('#ffffff');

    expect(pending).toEqual(CLINIC_DASHBOARD_PENDING_TONE);
    expect(pending.background).toBe('#ede7f7');
    expect(pending.border).toBe('#c4b0e5');
    expect(pending.background).toBe(DAILY_REPORT_DISCOUNT_TONE.background);
    expect(pending.border).toBe(DAILY_REPORT_DISCOUNT_TONE.border);
    expect(pending.label).toBe(DAILY_REPORT_DISCOUNT_TONE.label);
    expect(pending.value).toBe(DAILY_REPORT_DISCOUNT_TONE.value);
    expect(pending.hint).toBe(DAILY_REPORT_DISCOUNT_TONE.hint);
    expect(pending.icon).toBe(DAILY_REPORT_DISCOUNT_TONE.accent);
    expect(pending.value).toBe('#3b1d7b');
    expect(pending.value).not.toBe('#ffffff');

    expect(cancelled.background).toBe('#f04438');
    expect(cancelled.value).toBe('#ffffff');

    expect(expected.background).toBe('#1d4ed8');
    expect(expected.value).toBe('#ffffff');
    expect(expected.background).not.toBe(completed.background);
  });

  it('kartlar dolu zemini ve yazı rengini ekranda gösterir; 138.500 ve 10.000 yerinde kalır', () => {
    render(
      createElement(
        'div',
        { 'data-testid': 'clinic-dashboard-kpi-strip' },
        SCREEN_ROWS.map((row) =>
          createElement(ClinicDashboardKpiCard, {
            key: row.key,
            toneKey: row.key,
            label: row.label,
            value: row.value,
            sub: row.sub,
            icon: row.icon,
          }),
        ),
      ),
    );

    const order: string[] = [];
    for (const row of SCREEN_ROWS) {
      const tone = clinicDashboardKpiTone(row.key);
      const card = screen.getByTestId(`clinic-dashboard-kpi-${row.key}`);
      order.push(card.getAttribute('data-clinic-kpi-key') ?? '');
      expect(card.style.backgroundColor).toBe(cssColor(tone.background));
      expect(card.style.borderColor).toBe(cssColor(tone.border));
      expect(card.textContent).toContain(row.label);
      expect(card.textContent).toContain(row.value);
      if (row.sub) expect(card.textContent).toContain(row.sub);

      const label = card.querySelector('span');
      const lines = card.querySelectorAll('p');
      const icon = card.querySelector('svg');
      expect(label?.style.color).toBe(cssColor(tone.label));
      expect(lines[0]?.style.color).toBe(cssColor(tone.value));
      expect(icon?.style.color).toBe(cssColor(tone.icon));
      if (row.sub) expect(lines[1]?.style.color).toBe(cssColor(tone.hint));
    }

    expect(order).toEqual([...CLINIC_DASHBOARD_KPI_KEYS]);
    const strip = screen.getByTestId('clinic-dashboard-kpi-strip').textContent ?? '';
    expect(strip).toContain('138.500');
    expect(strip).toContain('10.000');
    expect(strip.indexOf('138.500')).toBeLessThan(strip.indexOf('10.000'));
  });

  it('şerit tutar ifadesini ve sırayı değiştirmez; rezervasyon tahsilata eklenmez', () => {
    const src = readFileSync(
      resolve('src/components/beauty/components/ClinicDashboard.tsx'),
      'utf8',
    );
    const start = src.indexOf('{/* ── KPI Strip');
    const end = src.indexOf('{/* ── Ön arama');
    const strip = src.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const keys = [...strip.matchAll(/toneKey="([^"]+)"/g)].map((match) => match[1]);
    expect(keys).toEqual([...CLINIC_DASHBOARD_KPI_KEYS]);

    expect(strip).toContain("label={tm('cebeGirenNakit')}");
    expect(strip).toContain('value={fmt(stats.revenue)}');
    expect(strip).toContain("label={tm('bKpiReservationLabel')}");
    expect(strip).toContain('value={fmt(stats.reservation)}');
    expect(strip).toContain("label={tm('bKpiCompletedLabel')}");
    expect(strip).toContain('value={stats.completed}');
    expect(strip).toContain("label={tm('bKpiPendingLabel')}");
    expect(strip).toContain('value={stats.pending}');
    expect(strip).toContain("label={tm('bKpiCancelledLabel') || 'İptal'}");
    expect(strip).toContain('value={stats.cancelled}');
    expect(strip).toContain("label={tm('bKpiExpectedRevenue')}");
    expect(strip).toContain('value={fmt(stats.expectedRevenue)}');
    expect(strip).not.toContain('stats.revenue + stats.reservation');
    expect(strip).not.toContain('stats.reservation +');

    const toneSrc = readFileSync(resolve('src/utils/clinicDashboardKpiTones.ts'), 'utf8');
    expect(toneSrc).not.toContain('stats.revenue');
    expect(toneSrc).not.toContain('clinicDashboardTahsilatTotal');
  });
});
