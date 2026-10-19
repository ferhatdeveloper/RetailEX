/**
 * Müşteri satış raporu: depozito hizmete dağıtılır, ciroya ikinci kez eklenmez.
 *
 * 50.000 hizmet, 35.000 kalan, 15.000 rezervasyon → hizmet 50.000,
 * rezervasyon bilgisi 15.000, toplam ciro 50.000.
 * Depozito satırı gizlenir; pay randevu düşümüyle aynıdır.
 */
import { allocateBeautyVisitDeposits } from './beautyDepositAllocation';
import type { BeautyAppointment } from '../types/beauty';

export interface CustomerAppointmentInput {
  id: string;
  customerId: string;
  customerName?: string;
  customerCode?: string;
  phone?: string;
  date?: string;
  createdAt?: string | null;
  totalPrice: number;
  depositAmount: number;
  remainderPaid?: number;
  /** Kapanan randevuda deposit_amount sıfırlandıysa cari avans tutarı. */
  linkedAvans?: number;
  status?: string | null;
}

export interface CustomerSalesAggregate {
  customerId: string;
  customerName: string;
  customerCode: string;
  phone: string;
  salesCount: number;
  serviceRevenue: number;
  depositRevenue: number;
  totalRevenue: number;
  collectedAmount: number;
  avgSale: number;
  lastSaleDate: string;
}

const CANCELLED = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'void',
  'silindi',
  'iptal',
  'deleted',
  'no_show',
]);

const COMPLETED = new Set([
  'completed',
  'complete',
  'done',
  'finished',
  'tamamlandi',
  'tamamlandı',
  'paid',
  'closed',
]);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Hizmet tutarı depozitoyu içeriyorsa eklenmez.
 * Fiyat kalan tutarsa depozito bir kez eklenir.
 * Yalnız depozito kaldıysa ciro depozitodur.
 */
export function resolveCustomerServiceAmount(
  price: number,
  depositShare: number,
  remainderPaid: number,
): { service: number; depositInfo: number } {
  const p = Math.max(0, Number(price) || 0);
  const d = Math.max(0, Number(depositShare) || 0);
  const r = Math.max(0, Number(remainderPaid) || 0);
  const tol = Math.max(1, Math.abs(p) * 0.002);
  if (p <= 0.004 && d > 0.004) {
    return { service: round2(d), depositInfo: round2(d) };
  }
  if (d > 0.004 && Math.abs(r + d - p) <= tol) {
    return { service: round2(p), depositInfo: round2(d) };
  }
  if (d > 0.004 && p > 0.004 && r > 0.004 && Math.abs(r - p) <= tol && r + d > p + tol) {
    return { service: round2(p + d), depositInfo: round2(d) };
  }
  return { service: round2(p), depositInfo: round2(d) };
}

export function aggregateCustomerAppointmentSales(
  rows: CustomerAppointmentInput[],
): CustomerSalesAggregate[] {
  const usable = (rows || []).filter((row) => {
    if (!String(row.customerId || '').trim() || !String(row.id || '').trim()) return false;
    const status = String(row.status || '').trim().toLowerCase();
    const money =
      Math.abs(Number(row.totalPrice) || 0) +
      Math.abs(Number(row.depositAmount) || 0) +
      Math.abs(Number(row.linkedAvans) || 0);
    if (CANCELLED.has(status) && money <= 0.004) return false;
    return true;
  });

  const shares = allocateBeautyVisitDeposits(
    usable.map((row) => ({
      id: row.id,
      customer_id: row.customerId,
      client_id: row.customerId,
      appointment_date: row.date || '',
      created_at: row.createdAt || '',
      total_price: Number(row.totalPrice) || 0,
      deposit_amount:
        Math.abs(Number(row.depositAmount) || 0) > 0.004
          ? Number(row.depositAmount) || 0
          : Number(row.linkedAvans) || 0,
      duration: 30,
      status: 'completed',
      is_package_session: false,
    })) as BeautyAppointment[],
  );

  const byCustomer = new Map<string, CustomerSalesAggregate>();
  for (const row of usable) {
    const share = shares.get(row.id) || 0;
    const priced = resolveCustomerServiceAmount(row.totalPrice, share, row.remainderPaid || 0);
    const status = String(row.status || '').trim().toLowerCase();
    let collected = round2(Math.max(0, Number(row.remainderPaid) || 0) + priced.depositInfo);
    if (collected <= 0.004 && priced.depositInfo <= 0.004 && COMPLETED.has(status)) {
      collected = priced.service;
    }
    collected = Math.min(priced.service, collected);
    const id = String(row.customerId);
    const cur = byCustomer.get(id) || {
      customerId: id,
      customerName: String(row.customerName || '').trim(),
      customerCode: String(row.customerCode || '').trim(),
      phone: String(row.phone || '').trim(),
      salesCount: 0,
      serviceRevenue: 0,
      depositRevenue: 0,
      totalRevenue: 0,
      collectedAmount: 0,
      avgSale: 0,
      lastSaleDate: '',
    };
    if (priced.service > 0.004) cur.salesCount += 1;
    cur.serviceRevenue = round2(cur.serviceRevenue + priced.service);
    cur.depositRevenue = round2(cur.depositRevenue + priced.depositInfo);
    cur.totalRevenue = cur.serviceRevenue;
    cur.collectedAmount = round2(cur.collectedAmount + collected);
    const date = String(row.date || '').slice(0, 10);
    if (date && date > cur.lastSaleDate) cur.lastSaleDate = date;
    if (!cur.customerName && row.customerName) cur.customerName = String(row.customerName);
    byCustomer.set(id, cur);
  }

  return Array.from(byCustomer.values())
    .map((row) => ({
      ...row,
      avgSale: row.salesCount > 0 ? round2(row.totalRevenue / row.salesCount) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue || a.customerName.localeCompare(b.customerName, 'tr'));
}
