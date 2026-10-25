/**
 * Rezervasyon peşinatını cari karta bağlar. Defter ile aynı anahtar:
 * customer_id doluysa o kart, değilse party_id. Satır iki karta birden
 * yazılmaz. Kasa satırı burada değiştirilmez.
 */
import {
  isReservationDepositCollection,
  type ReservationDepositCashRow,
} from './invoiceHeaderBalance';

export type ReservationDepositAccountRow = ReservationDepositCashRow & {
  customer_id?: unknown;
  party_id?: unknown;
};

export function reservationDepositAccountId(row: ReservationDepositAccountRow): string {
  const customerId = String(row.customer_id ?? '').trim();
  if (customerId) return customerId;
  return String(row.party_id ?? '').trim();
}

export function sumReservationDepositsByAccount(
  rows: ReservationDepositAccountRow[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!isReservationDepositCollection(row)) continue;
    const id = reservationDepositAccountId(row);
    if (!id) continue;
    const amt = Math.abs(Number(row.amount) || 0);
    if (!(amt > 0)) continue;
    map[id] = (map[id] || 0) + amt;
  }
  return map;
}
