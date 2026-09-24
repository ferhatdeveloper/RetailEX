/**
 * Müşteri telefon mükerrer kontrolü — biçim / ülke kodu fark etmez.
 * Kayıt eklerken aynı numara varsa yeni kart oluşturulmaz.
 */

import { postgres, ERP_SETTINGS } from '../services/postgres';
import { normalizeFirmTableNr } from '../services/api/accountBalance';
import {
  normalizePhoneDigits,
  phoneDigitCores,
  phoneQueryDigits,
} from '../shared/utils/validators';

export type PhoneMatchCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  phone2?: string | null;
  file_id?: string | null;
  code?: string | null;
  is_active?: boolean;
};

/** Ulusal anlamlı anahtar (son 10 hane, ülke/0 temiz). En az 7 hane gerekir. */
export function phoneSignificantKey(phone: unknown): string | null {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return null;
  const cores = phoneDigitCores(digits);
  let best = '';
  for (const c of cores) {
    const bare = c.replace(/^0+/, '') || c;
    if (bare.length < 7) continue;
    const key = bare.length > 10 ? bare.slice(-10) : bare;
    if (key.length > best.length) best = key;
  }
  return best.length >= 7 ? best : null;
}

/** Rapor için okunabilir format (boşluksuz çekirdek → 0750 665 0282). */
export function formatPhoneNormalizedDisplay(keyOrPhone: unknown): string {
  const key = phoneSignificantKey(keyOrPhone) ?? normalizePhoneDigits(keyOrPhone);
  if (!key) return '—';
  if (key.length === 10) {
    return `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6)}`;
  }
  if (key.length === 9) {
    return `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6)}`;
  }
  if (key.length === 11 && key.startsWith('0')) {
    return `${key.slice(0, 4)} ${key.slice(4, 7)} ${key.slice(7)}`;
  }
  return key;
}

export type DuplicatePhoneGroup<T extends PhoneMatchCustomer = PhoneMatchCustomer> = {
  /** Normalize edilmiş çekirdek (ülke/0/boşluk yok) */
  key: string;
  /** Gösterim: 0750 665 0282 */
  displayPhone: string;
  /** DB'de görülen ham yazımlar */
  variants: string[];
  customers: T[];
};

/**
 * Aynı normalize telefonu paylaşan aktif müşteri grupları (rapor + birleştirme).
 * phone ve phone2 alanları birlikte değerlendirilir; bağlı bileşenler birleştirilir.
 */
export function findDuplicatePhoneGroups<
  T extends {
    id: string;
    name?: string;
    phone?: string | null;
    phone2?: string | null;
    file_id?: string | null;
    code?: string | null;
    is_active?: boolean;
  },
>(customers: T[]): DuplicatePhoneGroup<T>[] {
  const active = customers.filter(c => c.is_active !== false);
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let p = parent.get(id) ?? id;
    while ((parent.get(p) ?? p) !== p) p = parent.get(p)!;
    parent.set(id, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byId = new Map(active.map(c => [c.id, c]));
  const keyMembers = new Map<string, string[]>(); // key -> customer ids
  const keyVariants = new Map<string, Set<string>>();

  for (const c of active) {
    parent.set(c.id, c.id);
    for (const raw of [c.phone, c.phone2]) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      const key = phoneSignificantKey(trimmed);
      if (!key) continue;
      const list = keyMembers.get(key) ?? [];
      if (!list.includes(c.id)) list.push(c.id);
      keyMembers.set(key, list);
      const vars = keyVariants.get(key) ?? new Set<string>();
      vars.add(trimmed);
      keyVariants.set(key, vars);
    }
  }

  // Aynı anahtardaki müşterileri birleştir; bir müşteri birden fazla anahtardaysa zincirleme
  for (const [, ids] of keyMembers) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) union(ids[0]!, ids[i]!);
  }
  // Ortak müşteri üzerinden farklı anahtarları da bağla
  const idToKeys = new Map<string, string[]>();
  for (const [key, ids] of keyMembers) {
    for (const id of ids) {
      const arr = idToKeys.get(id) ?? [];
      arr.push(key);
      idToKeys.set(id, arr);
    }
  }
  for (const keys of idToKeys.values()) {
    if (keys.length < 2) continue;
    // aynı müşterinin telefonları zaten aynı kişi; anahtarları grupta tutmak için
    // kök müşteri üzerinden zaten bağlı
  }

  // Yalnızca en az 2 müşterisi olan anahtarları başlangıç al; sonra kök bileşene göre topla
  const rootToIds = new Map<string, Set<string>>();
  const rootToKeys = new Map<string, Set<string>>();
  for (const [key, ids] of keyMembers) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const root = find(id);
      if (!rootToIds.has(root)) rootToIds.set(root, new Set());
      rootToIds.get(root)!.add(id);
      if (!rootToKeys.has(root)) rootToKeys.set(root, new Set());
      rootToKeys.get(root)!.add(key);
    }
  }

  const groups: DuplicatePhoneGroup<T>[] = [];
  for (const [root, idSet] of rootToIds) {
    if (idSet.size < 2) continue;
    const keys = [...(rootToKeys.get(root) ?? [])].sort();
    const primaryKey = keys[0] ?? root;
    const variants = new Set<string>();
    for (const k of keys) {
      for (const v of keyVariants.get(k) ?? []) variants.add(v);
    }
    const custs = [...idSet]
      .map(id => byId.get(id))
      .filter((c): c is T => Boolean(c))
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'));
    groups.push({
      key: primaryKey,
      displayPhone: formatPhoneNormalizedDisplay(primaryKey),
      variants: [...variants].sort(),
      customers: custs,
    });
  }

  groups.sort((a, b) => b.customers.length - a.customers.length || a.key.localeCompare(b.key));
  return groups;
}

/** İki telefon aynı kişiye ait mi (kayıt mükerreri için)? */
export function phonesAreSameNumber(a: unknown, b: unknown): boolean {
  const ka = phoneSignificantKey(a);
  const kb = phoneSignificantKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length > kb.length ? ka : kb;
  return shorter.length >= 9 && longer.endsWith(shorter);
}

export function findCustomersMatchingPhonesInList<
  T extends { id?: string; phone?: string | null; phone2?: string | null },
>(list: T[], phones: Array<string | null | undefined>, excludeId?: string | null): T[] {
  const needles = phones.map(p => String(p ?? '').trim()).filter(p => phoneQueryDigits(p).length >= 7);
  if (needles.length === 0) return [];
  return list.filter(c => {
    if (excludeId && c.id === excludeId) return false;
    return needles.some(
      n => phonesAreSameNumber(c.phone, n) || phonesAreSameNumber(c.phone2, n),
    );
  });
}

/**
 * Aktif müşterilerde phone/phone2 çakışması ara (DB).
 */
export async function findActiveCustomersByPhones(
  phones: Array<string | null | undefined>,
  excludeCustomerId?: string | null,
): Promise<PhoneMatchCustomer[]> {
  const needles = phones
    .map(p => String(p ?? '').trim())
    .filter(p => phoneQueryDigits(p).length >= 7);
  if (needles.length === 0) return [];

  const keys = [
    ...new Set(
      needles
        .map(phoneSignificantKey)
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  if (keys.length === 0) return [];

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const t = `public.rex_${firmNr}_customers`;
  const tail = keys.map(k => (k.length > 10 ? k.slice(-10) : k));
  const likeParts = [...new Set(tail.map(k => `%${k.slice(-Math.min(9, k.length))}%`))];

  const params: unknown[] = [firmNr];
  const likeClauses: string[] = [];
  for (const pat of likeParts) {
    params.push(pat);
    const i = params.length;
    likeClauses.push(
      `(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') LIKE $${i}
        OR REGEXP_REPLACE(COALESCE(phone2, ''), '\\D', '', 'g') LIKE $${i})`,
    );
  }
  let sql = `
    SELECT id, name, phone, phone2, file_id, code, is_active
    FROM ${t}
    WHERE lpad(trim(firm_nr::text), 3, '0') = $1
      AND COALESCE(is_active, true) = true
      AND (${likeClauses.join(' OR ')})`;
  if (excludeCustomerId) {
    params.push(excludeCustomerId);
    sql += ` AND id <> $${params.length}::uuid`;
  }
  sql += ` LIMIT 80`;

  let rows: PhoneMatchCustomer[] = [];
  try {
    const res = await postgres.query(sql, params);
    rows = (res.rows || []) as PhoneMatchCustomer[];
  } catch (e) {
    console.warn('[findActiveCustomersByPhones] query failed:', e);
    return [];
  }

  return rows.filter(c =>
    needles.some(n => phonesAreSameNumber(c.phone, n) || phonesAreSameNumber(c.phone2, n)),
  );
}

export class PhoneAlreadyRegisteredError extends Error {
  readonly matches: PhoneMatchCustomer[];

  constructor(matches: PhoneMatchCustomer[]) {
    const first = matches[0];
    const label = first
      ? `${first.name}${first.file_id ? ` (dosya ${first.file_id})` : ''}`
      : '';
    super(
      label
        ? `Bu telefon numarası zaten kayıtlı: ${label}. Yeni müşteri eklemeyin; mevcut kaydı seçin veya o karttan devam edin.`
        : 'Bu telefon numarası zaten kayıtlı. Yeni müşteri eklemeyin; mevcut kaydı seçin.',
    );
    this.name = 'PhoneAlreadyRegisteredError';
    this.matches = matches;
  }
}

/** Kayıt öncesi: çakışma varsa hata fırlatır. */
export async function assertPhonesAvailable(
  phones: Array<string | null | undefined>,
  excludeCustomerId?: string | null,
): Promise<void> {
  const matches = await findActiveCustomersByPhones(phones, excludeCustomerId);
  if (matches.length > 0) {
    throw new PhoneAlreadyRegisteredError(matches);
  }
}
