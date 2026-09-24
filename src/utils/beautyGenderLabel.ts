/**
 * Hasta / güzellik formları ve yazdırma: cinsiyet her zaman İngilizce.
 * DB değerleri: female | male | other (+ eski TR eşlemeleri).
 */

export const BEAUTY_GENDER_OPTIONS_EN = [
  { value: 'female' as const, label: 'Female' },
  { value: 'male' as const, label: 'Male' },
  { value: 'other' as const, label: 'Other' },
];

export function beautyGenderLabelEn(gender: string | null | undefined): string {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'female' || g === 'kadın' || g === 'kadin' || g === 'f') return 'Female';
  if (g === 'male' || g === 'erkek' || g === 'm') return 'Male';
  if (g === 'other' || g === 'diğer' || g === 'diger') return 'Other';
  return gender ? String(gender) : '';
}
