/** Dosya no (file_id) sayısal sıralama — 1, 2, 10… (metin sıralaması değil). */

/** Dosya no aralığı (ör. 1–100, 101–200). `all` = filtre yok. */
export type FileIdRangeKey = 'all' | `${number}-${number}`;

export type FileIdRangeOption = {
  key: FileIdRangeKey;
  from: number | null;
  to: number | null;
  label: string;
};

/** Maks. dosya no’ya göre 100’lük aralık seçenekleri üretir. */
export function buildFileIdRangeOptions(
  maxFileId: number,
  size = 100,
  allLabel = 'Tümü',
): FileIdRangeOption[] {
  const opts: FileIdRangeOption[] = [
    { key: 'all', from: null, to: null, label: allLabel },
  ];
  const max = Math.max(0, Math.floor(maxFileId));
  if (max <= 0) return opts;
  const step = Math.max(1, Math.floor(size));
  for (let from = 1; from <= max; from += step) {
    const to = Math.min(from + step - 1, max);
    opts.push({
      key: `${from}-${to}`,
      from,
      to,
      label: `${from} – ${to}`,
    });
  }
  return opts;
}

export function fileIdInRange(
  fileId: unknown,
  from: number | null,
  to: number | null,
): boolean {
  if (from == null || to == null) return true;
  const n = parseFileIdNumber(fileId);
  if (n == null) return false;
  return n >= from && n <= to;
}

export function parseFileIdNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function compareFileIdAsc(a: unknown, b: unknown): number {
  const na = parseFileIdNumber(a);
  const nb = parseFileIdNumber(b);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, 'tr');
}

export function sortByFileIdAsc<T extends { file_id?: string | null; name?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const c = compareFileIdAsc(a.file_id, b.file_id);
    if (c !== 0) return c;
    return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
  });
}

/** YYYY-MM-DD doğrula; geçersizse null. */
export function normalizeBirthDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const day = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return day;
}

/** Doğum tarihinden yaş (tam yıl); geçersizse null. */
export function ageFromBirthDate(value: unknown, now = new Date()): number | null {
  const day = normalizeBirthDate(value);
  if (!day) return null;
  const born = new Date(`${day}T12:00:00`);
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  if (!Number.isFinite(age) || age < 0 || age > 150) return null;
  return age;
}

/** Postgres ORDER BY: sayısal file_id artan, boşlar sonda, sonra name. */
export const SQL_ORDER_CUSTOMERS_BY_FILE_ID = `
  CASE WHEN NULLIF(BTRIM(COALESCE(c.file_id, '')), '') ~ '^[0-9]+$'
    THEN NULLIF(BTRIM(c.file_id), '')::bigint
    ELSE NULL
  END ASC NULLS LAST,
  NULLIF(BTRIM(COALESCE(c.file_id, '')), '') ASC NULLS LAST,
  c.name ASC
`.replace(/\s+/g, ' ').trim();
