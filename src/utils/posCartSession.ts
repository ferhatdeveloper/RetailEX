import type { CartItem } from '../components/pos/types';

export type PosCartSession = {
  receiptNumber: string;
  cart: CartItem[];
  selectedCampaignId: string | null;
  savedAt: string;
};

function sessionKey(firmNr: string | number | undefined, storeId: string | undefined, userId: string | undefined): string {
  const firm = firmNr != null ? String(firmNr) : '0';
  const store = storeId?.trim() || 'default';
  const user = userId?.trim() || 'anonymous';
  return `retailos_pos_cart_v1_${firm}_${store}_${user}`;
}

export function loadPosCartSession(
  firmNr: string | number | undefined,
  storeId: string | undefined,
  userId: string | undefined
): PosCartSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(firmNr, storeId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosCartSession;
    if (!parsed?.receiptNumber || !Array.isArray(parsed.cart)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePosCartSession(
  firmNr: string | number | undefined,
  storeId: string | undefined,
  userId: string | undefined,
  session: PosCartSession
): void {
  try {
    localStorage.setItem(sessionKey(firmNr, storeId, userId), JSON.stringify(session));
  } catch {
    // localStorage dolu veya devre dışı — sessizce atla
  }
}

export function clearPosCartSession(
  firmNr: string | number | undefined,
  storeId: string | undefined,
  userId: string | undefined
): void {
  try {
    localStorage.removeItem(sessionKey(firmNr, storeId, userId));
  } catch {
    // no-op
  }
}
