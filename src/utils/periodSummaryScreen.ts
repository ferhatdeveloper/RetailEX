/**
 * Aylık Gün Özeti ve Yıllık Ay Özeti — yalnızca görünürlük.
 * Tutar, iade, masraf ve net kalan formülü burada yoktur.
 * Peşinat ciroya eklenmez. İndirim açık cari değildir.
 *
 * Gizli kolonlar: Rezervasyon Brüt, Rezervasyon Kalan.
 * Rezervasyon Tutarı ve Rezervasyon Miktarı tabloda kalır.
 *
 * Üst kutular klinik panel dolu tonudur. Yeni renk yoktur.
 * Ciro mavi, iade turuncu, masraf kırmızı, net kalan yeşil. Yazı beyazdır.
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
  'returns',
  'expenses',
  'net',
] as const;

export type PeriodSummaryHeadlineKey = (typeof PERIOD_SUMMARY_HEADLINE_KEYS)[number];

const HEADLINE_KEY_SET = new Set<string>(PERIOD_SUMMARY_HEADLINE_KEYS);

export function isPeriodSummaryHeadlineKey(key: string): key is PeriodSummaryHeadlineKey {
  return HEADLINE_KEY_SET.has(key);
}

/**
 * Dört üst kutu. Klinik KPI dolu zemini:
 * ciro = tamamlanan mavi, iade = rezervasyon turuncusu,
 * masraf = iptal kırmızısı, net kalan = tahsilat yeşili.
 */
export function periodSummaryHeadlineTone(key: PeriodSummaryHeadlineKey): ClinicDashboardKpiTone {
  if (key === 'revenue') return clinicDashboardKpiTone('completed');
  if (key === 'returns') return clinicDashboardKpiTone('reservation');
  if (key === 'expenses') return clinicDashboardKpiTone('cancelled');
  return clinicDashboardKpiTone('collection');
}
