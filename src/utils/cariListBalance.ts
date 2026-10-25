/**
 * Cari Hesaplar listesi — bakiye kolonu, yalnız gösterim.
 *
 * Defter, rezervasyon tahsilatını (CH_TAHSILAT + REZERVASYON/AVANS veya
 * "Rezervasyon tahsilatı") müşteri alacağı gibi eksi, tedarikçi alacağı
 * gibi artı yazar. Peşinat kasaya giren nakittir; ciro ve cari alacak
 * değildir. Randevu tamamlanınca hizmete mahsup edilir, iptalde geri
 * ödenmez; her iki durumda da bakiyede alacak kalmaz.
 *
 * Müşteri işareti fatura başlığı ile aynıdır (`invoiceHeaderBalanceForDisplay`):
 * yalnız eksi (alacak) kısım peşinat kadar sıfıra çekilir, veresiye borç
 * büyütülmez. Tedarikçi simetrisi ters yöndedir: yalnız artı (alacak)
 * kısım peşinat kadar sıfıra çekilir, gerçek ticari borç durur.
 * İndirim bu hesaba eklenmez. Kasa fişi ve defter satırı değişmez.
 */
import { invoiceHeaderBalanceForDisplay } from './invoiceHeaderBalance';

export type CariListCardType = 'customer' | 'supplier' | string | null | undefined;

export function cariListBalanceForDisplay(
  cardType: CariListCardType,
  ledgerBalance: number | null | undefined,
  reservationDeposit: number | null | undefined,
): number {
  if (cardType === 'supplier') {
    const balRaw = Number(ledgerBalance ?? 0);
    const bal = Number.isFinite(balRaw) ? balRaw : 0;
    const resRaw = Number(reservationDeposit ?? 0);
    const reservation = Number.isFinite(resRaw) ? Math.max(0, resRaw) : 0;
    if (bal <= 0 || reservation <= 0) return bal;
    const lowered = bal - reservation;
    return lowered < 0 ? 0 : lowered;
  }
  return invoiceHeaderBalanceForDisplay(ledgerBalance, reservationDeposit);
}

/**
 * Ekstre başlığındaki cari bakiye. Liste kolonu ile aynı net:
 * peşinat alacağa yazılmaz, veresiye borç büyütülmez.
 */
export function ekstreHeaderBalanceForDisplay(
  cardType: CariListCardType,
  ledgerBalance: number | null | undefined,
  reservationDeposit: number | null | undefined,
): number {
  return cariListBalanceForDisplay(cardType, ledgerBalance, reservationDeposit);
}

export function sumCariListDisplayBalances(
  rows: Array<{
    cardType?: CariListCardType;
    balance?: number | null;
    reservationDeposit?: number | null;
  }>,
): number {
  let sum = 0;
  for (const row of rows) {
    sum += cariListBalanceForDisplay(row.cardType, row.balance, row.reservationDeposit);
  }
  return sum;
}
