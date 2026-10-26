/**
 * JSON dil dosyası: iç içe anahtarları noktalı yola düzleştirir, kayıtta eski şekle döner.
 * Anahtar metni JS küçük-harf dönüşümüyle değiştirilmez.
 */

export const LOCALE_JSON_ROOTS = {
  'mobile-i18n': 'mobile/src/i18n/locales',
} as const;

export type LocaleRootId = keyof typeof LOCALE_JSON_ROOTS;

export type LocaleLeafKind = 'string' | 'number' | 'boolean' | 'null';

export interface LocaleLeaf {
  path: string;
  text: string;
  kind: LocaleLeafKind;
}

export interface LocaleDraft {
  path: string;
  text: string;
}

const FLAT_FILE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,12})?\.json$/;
const NESTED_FILE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,12})?\/[A-Za-z][A-Za-z0-9_-]{0,40}\.json$/;

const TR_FOLD: Record<string, string> = {
  İ: 'i',
  I: 'ı',
  Ş: 'ş',
  Ğ: 'ğ',
  Ü: 'ü',
  Ö: 'ö',
  Ç: 'ç',
};

export function isPlainLocaleObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Arama için katlama. Kaynak dizgi değişmez; harf dönüşümü yalnızca bu kopyada yapılır. */
export function foldLocaleSearch(value: string): string {
  let out = '';
  for (const ch of value) {
    const mapped = TR_FOLD[ch];
    if (mapped) {
      out += mapped;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += ch;
  }
  return out;
}

export function localeTextMatches(query: string, ...fields: string[]): boolean {
  const q = query.trim();
  if (!q) return true;
  const folded = foldLocaleSearch(q);
  for (const field of fields) {
    if (foldLocaleSearch(field).includes(folded)) return true;
  }
  return false;
}

export function assertSafeLocaleRelative(file: string): string {
  const name = String(file ?? '');
  if (!name || name !== name.trim()) throw new Error('Geçersiz dil dosyası adı');
  if (
    name.includes('\\') ||
    name.includes('\0') ||
    name.includes('..') ||
    name.startsWith('/') ||
    name.startsWith('.') ||
    /^[A-Za-z]:/.test(name)
  ) {
    throw new Error('Dil klasörü dışında yazılamaz');
  }
  if (!FLAT_FILE.test(name) && !NESTED_FILE.test(name)) {
    throw new Error('Geçersiz dil dosyası adı');
  }
  const parts = name.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Dil klasörü dışında yazılamaz');
  }
  return name;
}

export function localeFileLanguage(file: string): string {
  const safe = assertSafeLocaleRelative(file);
  const slash = safe.indexOf('/');
  if (slash >= 0) return safe.slice(0, slash);
  return safe.replace(/\.json$/, '');
}

export function displayLocalePath(root: string, file: string): string {
  const rel = LOCALE_JSON_ROOTS[root as LocaleRootId];
  if (!rel) throw new Error('İzin verilmeyen kök');
  const safe = assertSafeLocaleRelative(file);
  return `${rel}/${safe}`;
}

export function splitLocalePath(path: string): string[] {
  const raw = String(path ?? '').trim();
  if (!raw || raw.startsWith('.') || raw.endsWith('.')) {
    throw new Error('Geçersiz anahtar yolu');
  }
  const parts = raw.split('.');
  if (
    parts.some(
      (part) =>
        part.length === 0 ||
        part === '.' ||
        part === '..' ||
        part.includes('/') ||
        part.includes('\\') ||
        part.includes('\0'),
    )
  ) {
    throw new Error('Geçersiz anahtar yolu');
  }
  return parts;
}

export function parseLocaleJson(raw: string): Record<string, unknown> {
  let text = String(raw ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Geçersiz JSON');
  }
  if (!isPlainLocaleObject(value)) throw new Error('Dil dosyası nesne olmalı');
  return value;
}

function leafKind(value: unknown): LocaleLeafKind | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value === null) return 'null';
  return null;
}

function canonicalText(value: unknown): string | null {
  const kind = leafKind(value);
  if (kind === 'string') return value as string;
  if (kind === 'number' || kind === 'boolean') return JSON.stringify(value);
  if (kind === 'null') return '';
  return null;
}

function valuesEqual(current: unknown, text: string): boolean {
  const shown = canonicalText(current);
  return shown !== null && shown === text;
}

function walkLeaves(value: unknown, prefix: string, out: LocaleLeaf[]) {
  if (isPlainLocaleObject(value)) {
    for (const key of Object.keys(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      walkLeaves(value[key], next, out);
    }
    return;
  }
  if (Array.isArray(value)) return;
  const kind = leafKind(value);
  const text = canonicalText(value);
  if (!kind || text === null || !prefix) return;
  out.push({ path: prefix, text, kind });
}

export function flattenLocale(value: unknown): LocaleLeaf[] {
  const out: LocaleLeaf[] = [];
  walkLeaves(value, '', out);
  return out;
}

function getAt(root: unknown, parts: string[]): unknown {
  let cur: unknown = root;
  for (const part of parts) {
    if (Array.isArray(cur)) {
      const index = Number(part);
      if (!Number.isInteger(index) || String(index) !== part) return undefined;
      cur = cur[index];
      continue;
    }
    if (!isPlainLocaleObject(cur) || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setAt(root: unknown, parts: string[], value: unknown) {
  if (!isPlainLocaleObject(root)) throw new Error('Dil dosyası nesne olmalı');
  let cur: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (Array.isArray(cur)) throw new Error('Dizi anahtarı düzenlenemez');
    const next = cur[part];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cur[part] = created;
      cur = created;
      continue;
    }
    cur = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) throw new Error('Dizi anahtarı düzenlenemez');
  cur[last] = value;
}

function deleteAt(root: unknown, parts: string[]) {
  if (parts.length === 0) return;
  const parent = parts.length === 1 ? root : getAt(root, parts.slice(0, -1));
  const last = parts[parts.length - 1];
  if (!isPlainLocaleObject(parent)) return;
  if (Object.prototype.hasOwnProperty.call(parent, last)) delete parent[last];
}

function pruneEmptyObjects(root: unknown, parts: string[]) {
  if (parts.length === 0) return;
  const node = getAt(root, parts);
  if (isPlainLocaleObject(node) && Object.keys(node).length === 0) {
    deleteAt(root, parts);
    pruneEmptyObjects(root, parts.slice(0, -1));
  }
}

export function localeKeyExists(tree: unknown, path: string): boolean {
  return getAt(tree, splitLocalePath(path)) !== undefined;
}

export function applyLocaleEdits(
  original: unknown,
  drafts: LocaleDraft[],
  deletedPaths: string[],
): Record<string, unknown> {
  if (!isPlainLocaleObject(original)) throw new Error('Dil dosyası nesne olmalı');
  const clone = structuredClone(original);
  const draftPaths = new Set(drafts.map((row) => row.path));
  for (const deleted of deletedPaths) {
    if (draftPaths.has(deleted)) continue;
    const parts = splitLocalePath(deleted);
    deleteAt(clone, parts);
    pruneEmptyObjects(clone, parts.slice(0, -1));
  }
  for (const draft of drafts) {
    const parts = splitLocalePath(draft.path);
    const current = getAt(clone, parts);
    if (current !== undefined && current !== null && typeof current === 'object') {
      throw new Error('Var olan anahtarın üzerine yazılamaz');
    }
    if (current === undefined) {
      setAt(clone, parts, draft.text);
      continue;
    }
    if (valuesEqual(current, draft.text)) continue;
    setAt(clone, parts, draft.text);
  }
  return clone;
}

function detectIndent(source: string): number | string {
  const text = source.replace(/^\uFEFF/, '');
  const tab = text.match(/\n(\t+)/);
  if (tab) return '\t';
  const spaces = text.match(/\n( +)\S/);
  if (spaces) return spaces[1].length;
  return 2;
}

export function serializeLocaleJson(value: unknown, sourceText: string): string {
  const indent = detectIndent(sourceText);
  const crlf = sourceText.includes('\r\n');
  let out = JSON.stringify(value, null, indent);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  const wantsNewline = sourceText.endsWith('\n') || sourceText.endsWith('\r\n') || sourceText.length === 0;
  if (wantsNewline && !out.endsWith('\n')) out += crlf ? '\r\n' : '\n';
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
  return out;
}

/** Taslakları iç içe JSON metnine çevirir. Listede olmayan anahtar durur; boş metin anahtarı silmez. */
export function prepareLocaleSave(originalText: string, drafts: LocaleDraft[], deletedPaths: string[]): string {
  const original = parseLocaleJson(originalText);
  const next = applyLocaleEdits(original, drafts, deletedPaths);
  const serialized = serializeLocaleJson(next, originalText);
  parseLocaleJson(serialized);
  if (serialized.charCodeAt(0) === 0xfeff) throw new Error('BOM yazılamaz');
  return serialized;
}
