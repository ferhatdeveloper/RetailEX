/**
 * PostgreSQL UUID kolonları: boş string / kod (000001) UUID değildir.
 * Opsiyonel FK'ler NULL olmalı; kod TEXT kalır, id olarak kullanılmaz.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 8-4-4-4-12 — ekranda UUID yakalamak için (sürüm/varyant sıkı değil) */
const UUID_LOOSE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  return UUID_RE.test(s);
}

export function looksLikeUuid(value: unknown): boolean {
  return UUID_LOOSE_RE.test(String(value ?? '').trim());
}

/** Geçerli UUID değilse ('' / '000001' / kod) → NULL */
export function uuidOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
