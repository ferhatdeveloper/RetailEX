import type { KasaIslemTipi } from '../../../services/api/kasa';

/**
 * İşlem Oluştur ızgarasında gizlenen türler.
 * Kayıtlı fişler, düzenleme formu ve raporlar bu kodları okumaya devam eder.
 */
export const KASA_CREATE_MENU_HIDDEN_TYPES = [
  'VERILEN_SERBEST_MESLEK',
  'ALINAN_SERBEST_MESLEK',
  'MUSTAHSIL_MAKBUZU',
] as const satisfies readonly KasaIslemTipi[];

/** Kasa → İşlem Oluştur kartları (görünür sıra). */
export const KASA_CREATE_MENU_TYPES = [
  'CH_TAHSILAT',
  'CH_ODEME',
  'SATIS_FATURASI',
  'ALIS_FATURASI',
  'SATIS_IADE_FATURASI',
  'ALIS_IADE_FATURASI',
  'HIZMET_FATURASI',
  'KASA_GIRIS',
  'KASA_CIKIS',
  'BANKA_YATIRILAN',
  'BANKADAN_CEKILEN',
  'VIRMAN',
  'GIDER_PUSULASI',
  'ACILIS_BORC',
  'ACILIS_ALACAK',
  'KUR_FARKI_BORC',
  'KUR_FARKI_ALACAK',
] as const satisfies readonly KasaIslemTipi[];

const hidden = new Set<string>(KASA_CREATE_MENU_HIDDEN_TYPES);

export function isKasaCreateMenuType(type: string | null | undefined): boolean {
  const tip = String(type || '').trim();
  if (!tip || hidden.has(tip)) return false;
  return (KASA_CREATE_MENU_TYPES as readonly string[]).includes(tip);
}
