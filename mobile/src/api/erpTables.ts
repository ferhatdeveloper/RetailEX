/**
 * Web postgres.ts prefix deseni — mobil bridge ham SQL kullandığı için
 * tablo adlarını açıkça üretir: rex_{firm}_* / rex_{firm}_{period}_*
 */

import { normalizeFirmNr } from './pgClient';
import { useAuthStore } from '../store/authStore';

export function firmNr(): string {
  const u = useAuthStore.getState().user;
  return normalizeFirmNr(u?.firmNr) || '001';
}

export function periodNr(): string {
  const u = useAuthStore.getState().user;
  const p = String(u?.periodNr ?? '01').replace(/\D/g, '');
  return (p || '01').padStart(2, '0').slice(0, 10);
}

export function productsTable(fn = firmNr()): string {
  return `rex_${fn}_products`;
}

export function customersTable(fn = firmNr()): string {
  return `rex_${fn}_customers`;
}

export function salesTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_sales`;
}

export function saleItemsTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_sale_items`;
}

export function cashLinesTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_cash_lines`;
}

/** Basit UUID — Expo'da crypto.randomUUID her zaman yok */
export function newUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatMoney(n: number | null | undefined, locale = 'tr-TR'): string {
  const v = Number(n) || 0;
  try {
    return v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return v.toFixed(2);
  }
}
