/**
 * Klinik Paneli KPI şeridinin zemin ve yazı renkleri.
 * Tutar, sıra, ikon ve sorgu burada yoktur.
 * Rezervasyon ciro değildir; beklenen ciro ayrı karttır.
 *
 * Dolu kartlarda yazı beyazdır.
 * Bekleyen kartı Günlük Rapor indirim kartı ile aynı lavanta paletindedir.
 */

export const CLINIC_DASHBOARD_KPI_KEYS = [
  'collection',
  'reservation',
  'completed',
  'pending',
  'cancelled',
  'expected-revenue',
] as const;

export type ClinicDashboardKpiKey = (typeof CLINIC_DASHBOARD_KPI_KEYS)[number];

export interface ClinicDashboardKpiTone {
  background: string;
  border: string;
  label: string;
  value: string;
  hint: string;
  icon: string;
}

const WHITE = '#ffffff';

function solidTone(background: string): ClinicDashboardKpiTone {
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
 * Bekleyen kartı. Zemin, kenar ve koyu mor yazı Günlük Rapor indirim kartının aynısıdır.
 */
export const CLINIC_DASHBOARD_PENDING_TONE: ClinicDashboardKpiTone = {
  background: '#ede7f7',
  border: '#c4b0e5',
  label: '#502a9b',
  value: '#3b1d7b',
  hint: '#513b90',
  icon: '#5b21b6',
};

export const CLINIC_DASHBOARD_KPI_TONES: Record<ClinicDashboardKpiKey, ClinicDashboardKpiTone> = {
  collection: solidTone('#12b76a'),
  reservation: solidTone('#f59e0b'),
  completed: solidTone('#2563eb'),
  pending: CLINIC_DASHBOARD_PENDING_TONE,
  cancelled: solidTone('#f04438'),
  'expected-revenue': solidTone('#1d4ed8'),
};

export function clinicDashboardKpiTone(key: ClinicDashboardKpiKey): ClinicDashboardKpiTone {
  return CLINIC_DASHBOARD_KPI_TONES[key];
}
