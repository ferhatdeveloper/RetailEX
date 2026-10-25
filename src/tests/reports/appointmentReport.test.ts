/**
 * Randevu raporu. Tutulma = geldi / (geldi + gelmedi).
 * İptal ayrı sayılır. Personel adı yalnız kayıttan gelir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleTranslations } from '../../locales/module-translations';
import {
  appointmentPeriodDelta,
  buildAppointmentReport,
  classifyAppointmentStatus,
  previousAppointmentPeriod,
  type AppointmentReportInput,
} from '../../utils/appointmentReport';

const FROM = '2026-10-01';
const TO = '2026-10-25';

function row(partial: AppointmentReportInput): AppointmentReportInput {
  return {
    date: '2026-10-12',
    time: '10:00',
    duration: 40,
    staffId: 'st-1',
    staffName: 'Ayşe Demir',
    ...partial,
  };
}

const rows: AppointmentReportInput[] = [
  row({ id: '1', status: 'completed', duration: 40, time: '09:15' }),
  row({ id: '2', status: 'closed', duration: 50, time: '11:00' }),
  row({ id: '3', status: 'no_show', duration: 30, time: '14:00' }),
  row({ id: '4', status: 'cancelled', duration: 20, time: '16:30' }),
  row({ id: '5', status: 'noshow', staffId: 'st-2', staffName: 'Kemal Usta', time: '09:45', duration: 25 }),
  row({ id: '6', status: 'scheduled', staffId: 'st-2', staffName: 'Kemal Usta', time: '13:00' }),
  row({ id: '7', status: 'confirmed', staffId: 'st-2', staffName: 'Kemal Usta', time: '15:00' }),
  row({ id: '8', status: 'pre_paid', staffId: 'st-2', staffName: 'Kemal Usta', time: '15:30' }),
  row({ id: '9', status: 'in_progress', staffId: 'st-2', staffName: 'Kemal Usta', time: '18:00' }),
  row({ id: '10', status: 'completed', date: '2026-09-01', staffName: 'Eski Kayıt' }),
];

describe('randevu raporu', () => {
  it('tutulma geldi bölü geldi artı gelmedi; iptal ayrı', () => {
    expect(classifyAppointmentStatus('completed')).toBe('came');
    expect(classifyAppointmentStatus('Kapandı')).toBe('came');
    expect(classifyAppointmentStatus('cancelled')).toBe('cancelled');
    expect(classifyAppointmentStatus('İptal')).toBe('cancelled');
    expect(classifyAppointmentStatus('no_show')).toBe('noShow');
    expect(classifyAppointmentStatus('Gelmedi')).toBe('noShow');
    expect(classifyAppointmentStatus('scheduled')).toBe('new');
    expect(classifyAppointmentStatus('confirmed')).toBe('confirmed');
    expect(classifyAppointmentStatus('pre_paid')).toBe('prepaid');
    expect(classifyAppointmentStatus('in_progress')).toBe('started');
    expect(classifyAppointmentStatus('Başladı')).toBe('started');
    expect(classifyAppointmentStatus('Ön ödeme')).toBe('prepaid');

    const model = buildAppointmentReport(rows, { from: FROM, to: TO });
    expect(model.summary.total).toBe(9);
    expect(model.summary.came).toBe(2);
    expect(model.summary.noShow).toBe(2);
    expect(model.summary.cancelled).toBe(1);
    expect(model.summary.retention).toBe(50);
    expect(model.summary.retention).toBe((2 / (2 + 2)) * 100);
    expect(model.summary.cancelNoShow).toBe(3);
    expect(model.summary.avgDurationMinutes).toBe(36);

    const came = model.summary.slices.find((slice) => slice.key === 'came');
    const fresh = model.summary.slices.find((slice) => slice.key === 'new');
    const prepaid = model.summary.slices.find((slice) => slice.key === 'prepaid');
    const started = model.summary.slices.find((slice) => slice.key === 'started');
    expect(came?.inChart).toBe(true);
    expect(fresh?.count).toBe(1);
    expect(prepaid?.count).toBe(1);
    expect(started?.count).toBe(1);
    const painted = model.summary.slices.filter((slice) => slice.inChart);
    expect(painted.reduce((sum, slice) => sum + slice.sharePercent, 0)).toBe(100);

    expect(model.staff.map((person) => person.name)).toEqual(['Kemal Usta', 'Ayşe Demir']);
    expect(model.staff[0]).toMatchObject({ appointments: 5, came: 0, noShow: 1, retention: 0 });
    expect(model.staff[1]).toMatchObject({ appointments: 4, came: 2, noShow: 1, retention: 66.7 });
    expect(JSON.stringify(model)).not.toMatch(/Merve|Selin/);

    const trend12 = model.trend.find((point) => point.date === '2026-10-12');
    expect(trend12).toMatchObject({ came: 2, noShow: 2, cancelled: 1, focus: 0 });
    expect(model.hours[0]).toEqual({ hour: 9, count: 2 });
    expect(model.hours.some((point) => point.hour === 12 && point.count === 0)).toBe(true);
  });

  it('durum süzgeci özeti değiştirmez, personel adedini süzer', () => {
    const open = buildAppointmentReport(rows, { from: FROM, to: TO });
    const filtered = buildAppointmentReport(rows, { from: FROM, to: TO, status: 'cancelled' });
    expect(filtered.summary.total).toBe(open.summary.total);
    expect(filtered.summary.retention).toBe(open.summary.retention);
    expect(filtered.summary.cancelNoShow).toBe(3);
    expect(filtered.staff).toEqual([
      expect.objectContaining({ name: 'Ayşe Demir', appointments: 1, retention: 66.7 }),
    ]);
    expect(filtered.trend.every((point) => point.came === 0 && point.noShow === 0)).toBe(true);
    expect(filtered.trend.find((point) => point.date === '2026-10-12')?.cancelled).toBe(1);

    const started = buildAppointmentReport(rows, { from: FROM, to: TO, status: 'started' });
    expect(started.trend.find((point) => point.date === '2026-10-12')?.focus).toBe(1);
    expect(started.summary.came).toBe(2);
  });

  it('gelmedi kaydı yoksa dilime girmez ve yeni ad üretilmez', () => {
    const model = buildAppointmentReport([
      row({ id: 'a', status: 'completed', staffName: 'Ayşe Demir', time: '' }),
      row({ id: 'b', status: 'confirmed', staffId: '', staffName: '—', time: '' }),
    ], { from: FROM, to: TO });
    const noShow = model.summary.slices.find((slice) => slice.key === 'noShow');
    expect(noShow).toMatchObject({ count: 0, inChart: false, sharePercent: 0 });
    expect(model.summary.retention).toBe(100);
    expect(model.summary.cancelNoShow).toBe(0);
    expect(model.staff.find((person) => person.id === 'unnamed' || person.name === '')?.name).toBe('');
    expect(model.hours).toEqual([]);
  });

  it('önceki dönem aynı uzunluktadır', () => {
    expect(previousAppointmentPeriod(FROM, TO)).toEqual({ from: '2026-09-06', to: '2026-09-30' });
    const current = buildAppointmentReport(rows, { from: FROM, to: TO }).summary;
    const previous = buildAppointmentReport([
      row({ id: 'p1', status: 'completed', date: '2026-09-10' }),
      row({ id: 'p2', status: 'no_show', date: '2026-09-11' }),
      row({ id: 'p3', status: 'no_show', date: '2026-09-12' }),
    ], { from: '2026-09-06', to: '2026-09-30' }).summary;
    expect(previous.retention).toBe(33.3);
    expect(appointmentPeriodDelta(current, previous).retention).toBe(50.2);
    expect(appointmentPeriodDelta(
      { ...current, total: 4 },
      { ...previous, total: 0 },
    ).total).toBeNull();
  });

  it('menü adı Randevu Raporu; sahte personel ve tablo yok', () => {
    const report = readFileSync(resolve('src/components/beauty/components/AppointmentReport.tsx'), 'utf8');
    const logic = readFileSync(resolve('src/utils/appointmentReport.ts'), 'utf8');
    const menu = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(moduleTranslations.beautyAppointmentReport.tr).toBe('Randevu Raporu');
    expect(moduleTranslations.beautyAppointmentReport.en).toBe('Appointment Report');
    expect(moduleTranslations.beautyAppointmentReport.ar).toContain('المواعيد');
    expect(moduleTranslations.beautyAppointmentReport.ku).toContain('نۆرە');
    expect(moduleTranslations.beautyServiceBreakdownReport.tr).toBe('Hizmet Bazlı Rapor');
    expect(moduleTranslations.beautyCancelledOnlyReport.tr).toBeTruthy();
    expect(menu).toContain("key: 'beauty-appointment-report'");
    expect(menu).toContain("tm('beautyAppointmentReport')");
    expect(menu).toContain("key: 'beauty-service-report'");
    expect(menu).toContain("key: 'beauty-cancelled-report'");
    expect(menu).toContain("key: 'beauty-staff-treatment-report'");
    expect(report).toContain('ReportColumnTable');
    expect(report).not.toContain('<table');
    expect(report).not.toContain('from \'antd\'');
    expect(report).not.toContain('Merve');
    expect(report).not.toContain('Selin');
    expect(logic).not.toContain('Merve');
    expect(logic).not.toContain('Selin');
    expect(report).not.toContain('updateAppointmentStatus');
    expect(logic).not.toContain('INSERT');
    expect(logic).not.toContain('UPDATE');
    expect(logic).toContain('no_show');
  });
});
