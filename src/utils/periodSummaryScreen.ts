/**
 * Aylık Gün Özeti ve Yıllık Ay Özeti — yalnızca görünürlük.
 * Tutar, iade, masraf ve net kalan formülü burada yoktur.
 * Peşinat ciroya eklenmez. İndirim açık cari değildir.
 *
 * Gizli kolonlar: Rezervasyon Brüt, Rezervasyon Kalan.
 * Rezervasyon Tutarı ve Rezervasyon Miktarı tabloda kalır.
 *
 * Üst kutular klinik panel dolu tonudur. Yazı beyazdır.
 * Ciro mavi, masraf kırmızı, net kalan yeşil.
 * Rezervasyon tutarı turuncudur. İade, rezervasyonun önceki teal zeminini alır.
 * Rezervasyon tutarı bilgi kutusudur; nete eklenmez.
 */

import {
  clinicDashboardKpiTone,
  type ClinicDashboardKpiTone,
} from './clinicDashboardKpiTones';

export const PERIOD_SUMMARY_HIDDEN_GRID_KEYS = [
  'reservationGross',
  'reservationPending',
] as const;

export type PeriodSummaryHiddenGridKey = (typeof PERIOD_SUMMARY_HIDDEN_GRID_KEYS)[number];

const HIDDEN_GRID_KEYS = new Set<string>(PERIOD_SUMMARY_HIDDEN_GRID_KEYS);

/** Izgara kolon listesinde brüt ve kalan yoktur. */
export function isPeriodSummaryGridColumnVisible(key: string): boolean {
  return !HIDDEN_GRID_KEYS.has(key);
}

export const PERIOD_SUMMARY_HEADLINE_KEYS = [
  'revenue',
  'reservation',
  'returns',
  'expenses',
  'net',
] as const;

/** Rezervasyon tutarı kutusu. Günlük rapor rezervasyon turuncusu. */
export const PERIOD_SUMMARY_RESERVATION_FILL = '#f59e0b';

/** İade kutusu. Rezervasyon kutusunun önceki teal zemini. */
export const PERIOD_SUMMARY_RETURN_FILL = '#0d9488';

export type PeriodSummaryHeadlineKey = (typeof PERIOD_SUMMARY_HEADLINE_KEYS)[number];

const HEADLINE_KEY_SET = new Set<string>(PERIOD_SUMMARY_HEADLINE_KEYS);

export function isPeriodSummaryHeadlineKey(key: string): key is PeriodSummaryHeadlineKey {
  return HEADLINE_KEY_SET.has(key);
}

const WHITE = '#ffffff';

/** Klinik KPI dolu kart deseni: zemin ve kenar aynı, yazı beyaz. */
function periodSummarySolidTone(background: string): ClinicDashboardKpiTone {
  return {
    background,
    border: background,
    label: WHITE,
    value: WHITE,
    hint: WHITE,
    icon: WHITE,
  };
}

/**
 * Beş üst kutu. Klinik KPI dolu zemini:
 * ciro = tamamlanan mavi, rezervasyon tutarı = turuncu,
 * iade = teal, masraf = iptal kırmızısı, net kalan = tahsilat yeşili.
 * Rezervasyon tutarı bilgi kutusudur; net formülüne girmez.
 */
export function periodSummaryHeadlineTone(key: PeriodSummaryHeadlineKey): ClinicDashboardKpiTone {
  if (key === 'revenue') return clinicDashboardKpiTone('completed');
  if (key === 'reservation') return periodSummarySolidTone(PERIOD_SUMMARY_RESERVATION_FILL);
  if (key === 'returns') return periodSummarySolidTone(PERIOD_SUMMARY_RETURN_FILL);
  if (key === 'expenses') return clinicDashboardKpiTone('cancelled');
  return clinicDashboardKpiTone('collection');
}

/** Rezervasyon kutusunun alt satırı. Adet bilgi olarak durur, tutara eklenmez. */
export function periodSummaryReservationHint(countLabel: string, count: number): string {
  const label = String(countLabel || '').trim().toLocaleLowerCase('tr-TR');
  return label ? `${count} ${label}` : String(count);
}
