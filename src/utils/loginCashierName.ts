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

/**
 * Placeholder / default kasiyer adları:
 * - Generic: 'default', 'unknown', '—', '-'
 * - Modül adı: 'Güzellik' (müşteri adı yerine geçen fallback)
 *
 * NOT: 'admin', 'administrator', 'system', 'root', 'superadmin' vb. gibi
 * sistem yönetici / unvan etiketleri listede YOKTUR; bunlar gerçek
 * username veya full_name olabilir (ör. Personel Değiştir → admin).
 * Bu etiketler placeholder olarak elenirse, DB'ye yanlış cashier yazılır
 * (authStore fallback tetiklenir, login user farklıysa hatalı eşleşme).
 * Sadece teknik olarak "kişi adı olmayan" gerçek placeholder'lar listede.
 */
const PLACEHOLDER_CASHIER_LABELS: string[] = [
  'default',
  'unknown',
  '—',
  '-',
  'güzellik',
  'guzellik',
];

export function isPlaceholderCashierName(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  const lower = s.toLocaleLowerCase('tr-TR');
  if (PLACEHOLDER_CASHIER_LABELS.includes(lower)) return true;
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

/**
 * Cashier yazımı için POS prop'larından sağlam bir aday çıkar.
 *
 * Sıra:
 *  1) currentStaff (Satış Elemanı modalı ile seçilmiş)
 *  2) currentUser.username / full_name (MarketPOS prop)
 *  3) useAuthStore.user.username / full_name (auth context fallback)
 *
 * Not: Burada yalnızca "ham değer" hazırlanır — admin/root/superadmin
 * gibi gerçek username/full_name olabilecek etiketlere DOKUNULMAZ
 * (isPlaceholderCashierName listesi sadece teknik placeholder'ları
 * içerir: default/unknown/—/-/Güzellik). Hiçbir şey bulunamazsa ''
 * döner ve ensureWriteCashierName fallback zinciri 'Bilinmeyen Kasiyer'e
 * düşer (authStore.user yoksa).
 */
export function resolvePosCashierCandidate(args: {
  currentStaff?: unknown;
  currentUser?: {
    username?: string | null;
    fullName?: string | null;
    full_name?: string | null;
  } | null;
}): string {
  const cs = String(args.currentStaff ?? '').trim();
  if (cs) return cs;
  const u = args.currentUser;
  if (u) {
    const uname = String(u.username ?? '').trim();
    if (uname) return uname;
    const full = String(u.fullName ?? u.full_name ?? '').trim();
    if (full) return full;
  }
  const authUser = useAuthStore.getState().user as
    | (LoginCashierUser & { fullName?: string | null })
    | null
    | undefined;
  if (authUser) {
    const uname = String(authUser.username ?? '').trim();
    if (uname) return uname;
    const full = String(authUser.fullName ?? authUser.full_name ?? '').trim();
    if (full) return full;
  }
  return '';
}
