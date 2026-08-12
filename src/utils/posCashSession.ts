import type { Sale } from '../core/types';

export const POS_CASH_SESSION_STORAGE_KEY = 'retailos_cash_session';

export interface PosCashSession {
  sessionId: string;
  openedAt: string;
  staff: string;
  openingCash: number;
  handoverFrom?: string;
  handoverAmount?: number;
  openNote?: string;
  storeId?: string;
  firmNr?: string;
}

export interface PosSessionCashBreakdown {
  openingCash: number;
  handoverFrom?: string;
  handoverAmount?: number;
  sessionCashSales: number;
  sessionCashReturns: number;
  expectedCash: number;
}

export function createPosCashSession(input: {
  staff: string;
  openingCash: number;
  openNote?: string;
  handoverFrom?: string;
  handoverAmount?: number;
  storeId?: string;
  firmNr?: string;
}): PosCashSession {
  return {
    sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    openedAt: new Date().toISOString(),
    staff: input.staff.trim(),
    openingCash: Number(input.openingCash) || 0,
    handoverFrom: input.handoverFrom?.trim() || undefined,
    handoverAmount:
      input.handoverAmount != null && Number(input.handoverAmount) > 0
        ? Number(input.handoverAmount)
        : undefined,
    openNote: input.openNote?.trim() || undefined,
    storeId: input.storeId || undefined,
    firmNr: input.firmNr || undefined,
  };
}

export function loadPosCashSession(): PosCashSession | null {
  try {
    const raw = localStorage.getItem(POS_CASH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosCashSession;
    if (!parsed?.openedAt || !parsed.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePosCashSession(session: PosCashSession): void {
  localStorage.setItem(POS_CASH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearPosCashSession(): void {
  localStorage.removeItem(POS_CASH_SESSION_STORAGE_KEY);
}

/** Kasa oturumu açılışından sonraki satışlar (önceki kasiyerin cirosu dahil edilmez). */
export function filterSalesForCashSession(sales: Sale[], session: PosCashSession): Sale[] {
  const openedMs = new Date(session.openedAt).getTime();
  if (Number.isNaN(openedMs)) return sales;

  return sales.filter((sale) => {
    const saleMs = new Date(sale.date).getTime();
    if (Number.isNaN(saleMs) || saleMs < openedMs) return false;
    if (session.storeId && sale.storeId && sale.storeId !== session.storeId) return false;
    return true;
  });
}

export function buildSessionCashBreakdown(
  openingCash: number,
  sessionCashSales: number,
  sessionCashReturns: number,
  handoverFrom?: string,
  handoverAmount?: number,
): PosSessionCashBreakdown {
  return {
    openingCash,
    handoverFrom,
    handoverAmount,
    sessionCashSales,
    sessionCashReturns,
    expectedCash: openingCash + sessionCashSales - sessionCashReturns,
  };
}

/** Sayfa yenilemede oturum yoksa son açılış kaydından oturumu geri yükle. */
export function recoverPosCashSessionFromLegacyOpen(): PosCashSession | null {
  try {
    const raw = localStorage.getItem('retailos_last_open');
    if (!raw) return null;
    const open = JSON.parse(raw) as {
      date?: string;
      staff?: string;
      openingCash?: number;
      note?: string;
    };
    if (!open?.date || !open.staff) return null;
    return {
      sessionId: `sess-recovered-${Date.parse(open.date) || Date.now()}`,
      openedAt: open.date,
      staff: open.staff,
      openingCash: Number(open.openingCash) || 0,
      openNote: open.note || undefined,
    };
  } catch {
    return null;
  }
}
