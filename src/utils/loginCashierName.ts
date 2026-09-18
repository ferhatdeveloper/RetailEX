/**
 * Günlük rapor / POS kasiyer adı: giriş yapan kullanıcı (login).
 * Modül adı (Güzellik) veya mağaza DEFAULT yazılmaz.
 */

import { useAuthStore } from '../store/useAuthStore';

export type LoginCashierUser = {
  id?: string;
  username?: string | null;
  fullName?: string | null;
  full_name?: string | null;
};

export function displayUserCashierName(user?: LoginCashierUser | null): string {
  if (!user) return '';
  const full = String(user.fullName ?? user.full_name ?? '').trim();
  const username = String(user.username ?? '').trim();
  return full || username;
}

export function isPlaceholderCashierName(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const lower = s.toLocaleLowerCase('tr-TR');
  if (lower === 'default' || lower === 'unknown' || lower === '—' || lower === '-') return true;
  if (s === 'Güzellik' || lower === 'güzellik' || lower === 'guzellik') return true;
  return false;
}

export function isPlaceholderDeviceName(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const lower = s.toLocaleLowerCase('tr-TR');
  return lower === 'default' || s === '—' || s === '-';
}

export function sanitizeStoredCashierName(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderCashierName(s)) return '';
  return s;
}

export function resolveCashierDisplayName(
  storedCashier: unknown,
  createdByUserId: unknown,
  userNameById: Map<string, string>,
): string {
  const uid = String(createdByUserId ?? '').trim();
  const fromUser = uid ? String(userNameById.get(uid) ?? '').trim() : '';
  if (fromUser && !isPlaceholderCashierName(fromUser)) return fromUser;
  const stored = sanitizeStoredCashierName(storedCashier);
  if (stored) return stored;
  return '—';
}

export function currentLoginCashierName(): string {
  return displayUserCashierName(useAuthStore.getState().user);
}

/** Fişe yazılacak kasiyer: placeholder yok; yoksa giriş yapan kullanıcı. */
export function resolveWriteCashierName(raw?: unknown): string {
  return sanitizeStoredCashierName(raw) || currentLoginCashierName();
}

export function currentLoginUserId(): string | undefined {
  const id = useAuthStore.getState().user?.id;
  const s = String(id ?? '').trim();
  return s || undefined;
}

export function currentLoginStoreId(): string | undefined {
  const id = useAuthStore.getState().user?.storeId;
  const s = String(id ?? '').trim();
  if (!s || isPlaceholderDeviceName(s)) return undefined;
  return s;
}
