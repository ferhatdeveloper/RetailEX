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
  // Tercih: önce kullanıcı adı (Market POS + fatura kaydı tutarlılığı).
  // full_name boşsa username düşer; username boşsa full_name düşer.
  return username || full;
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

/**
 * Fişe yazılacak kasiyer:
 * 1) Placeholder olmayan ham değer (currentStaff / useAuthStore.user.username vb.)
 * 2) Yoksa oturum açan kullanıcı (authStore.user)
 * 3) Yoksa hardcoded 'Bilinmeyen Kasiyer' — Cashier Performance raporu
 *    bu placeholder'ı "Bilinmeyen Kasiyer" satırı olarak yakalar; ileride
 *    backfill migration'ı (örn. 197) bu satırları gerçek kullanıcıya güncelleyebilir.
 *
 * Edge case (token expire / localStorage boş / login'den hemen sonra store set
 * edilmeden POS satışı) için sabit fallback tercih edildi; böylece cashier alanı
 * asla boş yazılmaz ve fatura listesinde kasiyer kolonu boş kalmaz.
 */
export const UNKNOWN_CASHIER_PLACEHOLDER = 'Bilinmeyen Kasiyer';

export function resolveWriteCashierName(raw?: unknown): string {
  const cleaned = sanitizeStoredCashierName(raw);
  if (cleaned) return cleaned;
  const fromLogin = currentLoginCashierName();
  if (fromLogin) return fromLogin;
  return UNKNOWN_CASHIER_PLACEHOLDER;
}

/**
 * Servis katmanında cashier yazımı için: resolveWriteCashierName ile çöz,
 * eğer hardcoded 'Bilinmeyen' fallback kullanıldıysa console.warn ile uyar.
 * Geliştirici console'unda görünür; production'da silent.
 */
export function ensureWriteCashierName(raw?: unknown): string {
  const w = resolveWriteCashierName(raw);
  if (w === UNKNOWN_CASHIER_PLACEHOLDER) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[ensureWriteCashierName] login kullanıcısı yok, hardcoded "Bilinmeyen Kasiyer" fallback kullanıldı',
        { raw, cashier: w },
      );
    }
  }
  return w;
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
