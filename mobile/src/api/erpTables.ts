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

/** Oturumdaki aktif mağaza — WMS sayım vb. */
export function storeId(): string | null {
  const id = useAuthStore.getState().user?.storeId;
  return id ? String(id) : null;
}

export function storeName(): string | null {
  const n = useAuthStore.getState().user?.storeName;
  return n ? String(n) : null;
}

export function productsTable(fn = firmNr()): string {
  return `rex_${fn}_products`;
}

export function customersTable(fn = firmNr()): string {
  return `rex_${fn}_customers`;
}

export function suppliersTable(fn = firmNr()): string {
  return `rex_${fn}_suppliers`;
}

export function salesTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_sales`;
}

export function accountMovementsTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_account_movements`;
}

export function saleItemsTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_sale_items`;
}

export function stockMovementsTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_stock_movements`;
}

export function stockMovementItemsTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_stock_movement_items`;
}

export function cashLinesTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_cash_lines`;
}

export function cashRegistersTable(fn = firmNr()): string {
  return `rex_${fn}_cash_registers`;
}

export function bankLinesTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_bank_lines`;
}

export function bankRegistersTable(fn = firmNr()): string {
  return `rex_${fn}_bank_registers`;
}

export function costCentersTable(fn = firmNr()): string {
  return `rex_${fn}_cost_centers`;
}

export function expensesTable(fn = firmNr()): string {
  return `rex_${fn}_expenses`;
}

/** rest / beauty şema tabloları — web postgres prefix deseni */
export function restTablesTable(fn = firmNr()): string {
  return `rest.rex_${fn}_rest_tables`;
}

export function restOrdersTable(fn = firmNr(), pn = periodNr()): string {
  return `rest.rex_${fn}_${pn}_rest_orders`;
}

export function restOrderItemsTable(fn = firmNr(), pn = periodNr()): string {
  return `rest.rex_${fn}_${pn}_rest_order_items`;
}

export function beautyAppointmentsTable(fn = firmNr(), pn = periodNr()): string {
  return `beauty.rex_${fn}_${pn}_beauty_appointments`;
}

export function beautyServicesTable(fn = firmNr()): string {
  return `beauty.rex_${fn}_beauty_services`;
}

export function beautySpecialistsTable(fn = firmNr()): string {
  return `beauty.rex_${fn}_beauty_specialists`;
}

export function campaignsTable(fn = firmNr()): string {
  return `rex_${fn}_campaigns`;
}

export function messagingSettingsTable(fn = firmNr()): string {
  return `rex_${fn}_messaging_settings`;
}

export function notificationQueueTable(fn = firmNr(), pn = periodNr()): string {
  return `rex_${fn}_${pn}_notification_queue`;
}

export function beautySalesTable(fn = firmNr(), pn = periodNr()): string {
  return `beauty.rex_${fn}_${pn}_beauty_sales`;
}

export function beautySaleItemsTable(fn = firmNr(), pn = periodNr()): string {
  return `beauty.rex_${fn}_${pn}_beauty_sale_items`;
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
