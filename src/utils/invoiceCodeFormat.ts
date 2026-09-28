/**
 * Fatura / malzeme / hizmet kod formatı — Logo benzeri şablon.
 *
 * Örnek şablon: FTR-{YYYY}-{SEQ:6} → FTR-2026-000001
 * Şablon boşsa varsayılan: 7 haneli sıfır dolgulu sıra (0000001, 0000002, …).
 */

export const INVOICE_CODE_FORMAT_SETTINGS_KEY = 'invoice_code_formats';

/** İlk kayıt ve format yokken kullanılan sıra genişliği (malzeme / fatura / hizmet). */
export const DEFAULT_ENTITY_CODE_SEQ_DIGITS = 7;

/** Implicit şablon — app_settings boşken allocate bu kalıbı kullanır. */
export const DEFAULT_ENTITY_CODE_PATTERN = `{SEQ:${DEFAULT_ENTITY_CODE_SEQ_DIGITS}}`;

export interface InvoiceCodeFormatRule {
  /** Boş = bu yuvada format yok (tür için varsayılana / damgaya düş) */
  pattern: string;
}

export interface InvoiceCodeFormatsSettings {
  default?: InvoiceCodeFormatRule;
  /** trcode (fatura türü kodu) → format */
  byType?: Record<string, InvoiceCodeFormatRule>;
}

export interface CompiledInvoiceCodePattern {
  pattern: string;
  prefix: string;
  suffix: string;
  seqWidth: number;
  likePrefix: string;
}

const SEQ_PLACEHOLDER = '\u0001SEQ\u0001';

/** Sıfır dolgulu sayısal kod (örn. 1 → 0000001). */
export function formatDefaultNumericEntityCode(seq: bigint | number = 1n): string {
  const n = typeof seq === 'bigint' ? seq : BigInt(Math.max(0, Math.trunc(Number(seq)) || 0));
  const v = n < 1n ? 1n : n;
  return v.toString().padStart(DEFAULT_ENTITY_CODE_SEQ_DIGITS, '0');
}

/**
 * Format / allocate yokken senkron yedek — 7 haneli ilk kod.
 * (Eski davranış: YYYYMMDD + rastgele damga.)
 */
export function generateDefaultInvoiceStamp(_now: Date = new Date()): string {
  return formatDefaultNumericEntityCode(1n);
}

export function isInvoiceCodePatternDefined(pattern: string | undefined | null): boolean {
  return String(pattern || '').trim().length > 0;
}

export function resolveInvoiceCodePattern(
  settings: InvoiceCodeFormatsSettings | null | undefined,
  trcode: number | string | undefined | null
): string {
  const typeKey = String(trcode ?? '').trim();
  const typed = typeKey ? settings?.byType?.[typeKey]?.pattern : undefined;
  if (isInvoiceCodePatternDefined(typed)) return String(typed).trim();
  const fallback = settings?.default?.pattern;
  return isInvoiceCodePatternDefined(fallback) ? String(fallback).trim() : '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateParts(date: Date): { yyyy: string; yy: string; mm: string; dd: string } {
  const yyyy = String(date.getFullYear());
  return {
    yyyy,
    yy: yyyy.slice(-2),
    mm: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
  };
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Şablonu tarih + sıra yuvasına derler.
 * {YYYY} {YY} {MM} {DD} {SEQ} {SEQ:n} — SEQ yoksa sonda DEFAULT_ENTITY_CODE_SEQ_DIGITS haneli sıra eklenir.
 */
export function compileInvoiceCodePattern(
  pattern: string,
  date: Date = new Date()
): CompiledInvoiceCodePattern | null {
  const raw = String(pattern || '').trim();
  if (!raw) return null;

  const { yyyy, yy, mm, dd } = dateParts(date);
  let seqWidth = DEFAULT_ENTITY_CODE_SEQ_DIGITS;
  let hasSeq = false;

  const resolved = raw.replace(/\{(YYYY|YY|MM|DD|SEQ(?::(\d+))?)\}/gi, (_m, token: string, width?: string) => {
    const head = String(token).toUpperCase();
    if (head === 'YYYY') return yyyy;
    if (head === 'YY') return yy;
    if (head === 'MM') return mm;
    if (head === 'DD') return dd;
    hasSeq = true;
    const n = width ? parseInt(width, 10) : DEFAULT_ENTITY_CODE_SEQ_DIGITS;
    seqWidth = Number.isFinite(n)
      ? Math.min(12, Math.max(1, n))
      : DEFAULT_ENTITY_CODE_SEQ_DIGITS;
    return SEQ_PLACEHOLDER;
  });

  const withSeq = hasSeq ? resolved : `${resolved}${SEQ_PLACEHOLDER}`;
  const idx = withSeq.indexOf(SEQ_PLACEHOLDER);
  const prefix = idx >= 0 ? withSeq.slice(0, idx) : withSeq;
  const suffix = idx >= 0 ? withSeq.slice(idx + SEQ_PLACEHOLDER.length) : '';

  return {
    pattern: raw,
    prefix,
    suffix,
    seqWidth,
    likePrefix: `${escapeLikeLiteral(prefix)}%`,
  };
}

export function formatInvoiceCode(compiled: CompiledInvoiceCodePattern, sequence: bigint | number): string {
  const seq = typeof sequence === 'bigint' ? sequence : BigInt(sequence);
  const digits = seq < 0n ? 0n : seq;
  return `${compiled.prefix}${digits.toString().padStart(compiled.seqWidth, '0')}${compiled.suffix}`;
}

export function extractInvoiceCodeSequence(
  compiled: CompiledInvoiceCodePattern,
  code: string
): bigint | null {
  const raw = String(code || '');
  if (!raw.startsWith(compiled.prefix)) return null;
  if (!raw.endsWith(compiled.suffix)) return null;
  const mid = raw.slice(compiled.prefix.length, raw.length - compiled.suffix.length);
  if (!/^[0-9]+$/.test(mid)) return null;
  try {
    return BigInt(mid);
  } catch {
    return null;
  }
}

export function nextInvoiceSequenceFromCodes(
  compiled: CompiledInvoiceCodePattern,
  codes: readonly string[]
): bigint {
  let max = 0n;
  for (const code of codes) {
    const seq = extractInvoiceCodeSequence(compiled, code);
    if (seq != null && seq > max) max = seq;
  }
  return max + 1n < 1n ? 1n : max + 1n;
}

export function previewInvoiceCode(
  pattern: string,
  sequence: bigint | number = 1n,
  date: Date = new Date()
): string {
  const compiled = compileInvoiceCodePattern(pattern, date);
  if (!compiled) return generateDefaultInvoiceStamp(date);
  return formatInvoiceCode(compiled, sequence);
}

/** Prefix + yıl + sıra genişliğinden şablon üretir (ayar UI). */
export function buildInvoiceCodePattern(opts: {
  prefix?: string;
  includeYear?: boolean;
  seqDigits?: number;
  separator?: string;
}): string {
  const prefix = String(opts.prefix || '').trim();
  const includeYear = opts.includeYear !== false;
  const seqDigits = Math.min(
    12,
    Math.max(1, Number(opts.seqDigits) || DEFAULT_ENTITY_CODE_SEQ_DIGITS)
  );
  const sep = opts.separator ?? '-';
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (includeYear) parts.push('{YYYY}');
  parts.push(`{SEQ:${seqDigits}}`);
  return parts.join(sep);
}
