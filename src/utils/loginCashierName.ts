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
 * 3) Yoksa boş string — MarketPOS bu durumda Personel Değiştir modali
 *    zorla açar ve ödeme tamamlanmasını engeller. Servis katmanı (sales.ts)
 *    boş cashier ile fiş yazımını kabul etmez.
 *
 * Hardcoded 'Bilinmeyen Kasiyer' fallback KALDIRILDI — placeholder satır
 * Cashier Performance raporunu kirletiyordu; artık kasiyer seçimi
 * kullanıcı tarafında zorunlu kılınıyor (show-stopper).
 */
export function resolveWriteCashierName(raw?: unknown): string {
  const cleaned = sanitizeStoredCashierName(raw);
  if (cleaned) return cleaned;
  const fromLogin = currentLoginCashierName();
  if (fromLogin) return fromLogin;
  return '';
}

/**
 * Servis katmanında cashier yazımı için: resolveWriteCashierName ile çöz.
 * Artık hardcoded fallback yok; boş string dönerse çağıran katman
 * (sales.ts) throw ile fiş yazımını engeller.
 */
export function ensureWriteCashierName(raw?: unknown): string {
  return resolveWriteCashierName(raw);
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
 * döner ve MarketPOS Personel Değiştir modali ile kasiyer seçimi
 * zorlar; service katmanı boş cashier ile fiş yazmaz.
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
