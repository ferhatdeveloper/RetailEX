/**
 * Kasa İşlem Oluştur kart listesi.
 * Serbest meslek ve müstahsil makbuzları yeni işlem menüsünde yoktur.
 * Tür kodları ve kasa işaretleri durur; eski fişler silinmez.
 */
import { describe, expect, it } from 'vitest';
import { computeKasaIslemiSign } from '../../../services/api/kasa';
import {
  KASA_CREATE_MENU_HIDDEN_TYPES,
  KASA_CREATE_MENU_TYPES,
  isKasaCreateMenuType,
} from '../../../components/accounting/cash-ops/kasaCreateMenu';

const VISIBLE = [
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
] as const;

describe('Kasa İşlem Oluştur menüsü', () => {
  it('serbest meslek ve müstahsil kartlarını gizler', () => {
    for (const type of KASA_CREATE_MENU_HIDDEN_TYPES) {
      expect(KASA_CREATE_MENU_TYPES).not.toContain(type);
      expect(isKasaCreateMenuType(type)).toBe(false);
    }
    expect(KASA_CREATE_MENU_HIDDEN_TYPES).toEqual([
      'VERILEN_SERBEST_MESLEK',
      'ALINAN_SERBEST_MESLEK',
      'MUSTAHSIL_MAKBUZU',
    ]);
  });

  it('diğer işlem kartlarını aynı sırada tutar', () => {
    expect(KASA_CREATE_MENU_TYPES).toEqual(VISIBLE);
    for (const type of VISIBLE) {
      expect(isKasaCreateMenuType(type)).toBe(true);
    }
  });

  it('gizlenen türlerin kasa işaretini korur (eski fiş)', () => {
    expect(computeKasaIslemiSign('ALINAN_SERBEST_MESLEK')).toBe(1);
    expect(computeKasaIslemiSign('VERILEN_SERBEST_MESLEK')).toBe(-1);
    expect(computeKasaIslemiSign('MUSTAHSIL_MAKBUZU')).toBe(-1);
  });

  it('satış iadesi kasadan çıkar, alış iadesi kasaya girer', () => {
    expect(computeKasaIslemiSign('SATIS_IADE_FATURASI')).toBe(-1);
    expect(computeKasaIslemiSign('ALIS_IADE_FATURASI')).toBe(1);
  });
});
