/**
 * Kasa / banka `transaction_type` sözlüğü — web `kasa.ts` ile hizalı.
 * Eski mobil `financeApi` değerleri (TAHSILAT/ODEME) buradan normalize edilir.
 */

export const CASH_TX = {
  KASA_GIRIS: 'KASA_GIRIS',
  KASA_CIKIS: 'KASA_CIKIS',
  CH_TAHSILAT: 'CH_TAHSILAT',
  CH_ODEME: 'CH_ODEME',
  VIRMAN: 'VIRMAN',
  BANKA_YATIRILAN: 'BANKA_YATIRILAN',
  BANKADAN_CEKILEN: 'BANKADAN_CEKILEN',
  BANKA_GIRIS: 'BANKA_GIRIS',
  BANKA_CIKIS: 'BANKA_CIKIS',
  /** Banka dış çıkış — web banka.ts HAVALE (sign −1) */
  HAVALE: 'HAVALE',
  EFT: 'EFT',
} as const;

export type CashTxType = (typeof CASH_TX)[keyof typeof CASH_TX];

/** Basit kasa giriş/çıkış yazımı */
export function cashTxForDirection(direction: 'in' | 'out'): typeof CASH_TX.KASA_GIRIS | typeof CASH_TX.KASA_CIKIS {
  return direction === 'in' ? CASH_TX.KASA_GIRIS : CASH_TX.KASA_CIKIS;
}

/** Basit banka giriş/çıkış yazımı */
export function bankTxForDirection(
  direction: 'in' | 'out',
): typeof CASH_TX.BANKA_GIRIS | typeof CASH_TX.BANKA_CIKIS {
  return direction === 'in' ? CASH_TX.BANKA_GIRIS : CASH_TX.BANKA_CIKIS;
}

/**
 * Eski / karışık tip adlarını kanonik değere çevir.
 * Okuma raporlarında etiketleme ve legacy satır eşlemesi için.
 */
export function normalizeCashTransactionType(raw: string | null | undefined): string {
  const t = String(raw || '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '_');
  if (!t) return '';
  if (t === 'TAHSILAT' || t === 'GIRIS' || t === 'NAKIT_GIRIS') return CASH_TX.KASA_GIRIS;
  if (t === 'ODEME' || t === 'CIKIS' || t === 'NAKIT_CIKIS') return CASH_TX.KASA_CIKIS;
  if (t === 'BANKA_TAHSILAT' || t === 'BANKA_GIRIS') return CASH_TX.BANKA_GIRIS;
  if (t === 'BANKA_ODEME' || t === 'BANKA_CIKIS') return CASH_TX.BANKA_CIKIS;
  return t;
}

/** UI etiketi — kanonik + legacy tipler */
export function cashTransactionTypeLabel(
  type: string | null | undefined,
  sign = 0,
): string {
  const t = normalizeCashTransactionType(type);
  if (t === CASH_TX.KASA_GIRIS || t === CASH_TX.BANKA_GIRIS) return 'Giriş';
  if (t === CASH_TX.KASA_CIKIS || t === CASH_TX.BANKA_CIKIS) return 'Çıkış';
  if (t === CASH_TX.CH_TAHSILAT) return 'Tahsilat';
  if (t === CASH_TX.CH_ODEME) return 'Ödeme';
  if (t === CASH_TX.VIRMAN) return sign > 0 ? 'Virman (giriş)' : 'Virman (çıkış)';
  if (t === CASH_TX.BANKA_YATIRILAN) return 'Bankaya yatırılan';
  if (t === CASH_TX.BANKADAN_CEKILEN) return 'Bankadan çekilen';
  if (t === CASH_TX.HAVALE) return 'Havale';
  if (t === CASH_TX.EFT) return 'EFT';
  if (t) return t.replace(/_/g, ' ');
  if (sign > 0) return 'Giriş';
  if (sign < 0) return 'Çıkış';
  return '—';
}
