/**
 * Satış / fiş notunun ekranda gösterilecek metni.
 * DB’de `GüzellikPOS|beauty_sale_id:<uuid>|rex_appt:<uuid>|Güzellik satışı` gibi
 * pipe’lı teknik kimlikler saklanabilir; gösterimde UUID ve id etiketleri gizlenir.
 */

const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
/** `beauty_sale_id:…`, `rex_appt:…`, `rest_order_id:…` */
const TECH_KEY_VALUE_RE = /^[a-z][a-z0-9_]*:[0-9a-fA-F-]{8,}$/i;
const TECH_TOKEN_RE = /^(checkout_tek_tahsilat)$/i;
const EMBEDDED_TECH_RE =
  /\b[a-z][a-z0-9_]*:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/gi;

function scrubTechnicalIds(part: string): string {
  return part
    .replace(EMBEDDED_TECH_RE, '')
    .replace(UUID_RE, '')
    .replace(/\s*[|:—–-]+\s*$/g, '')
    .replace(/^\s*[|:—–-]+\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isTechnicalSegment(part: string): boolean {
  const t = part.trim();
  if (!t) return true;
  if (TECH_KEY_VALUE_RE.test(t)) return true;
  if (TECH_TOKEN_RE.test(t)) return true;
  if (UUID_RE.test(t) && t.replace(UUID_RE, '').replace(/[\s|-]/g, '') === '') return true;
  return false;
}

/**
 * Pipe + UUID / `*_id:uuid` parçalarını çıkarır; insan okunur parçaları birleştirir.
 * Örn. `GüzellikPOS|beauty_sale_id:…|Güzellik satışı` → `GüzellikPOS — Güzellik satışı`
 */
export function receiptNotesForDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const hasPipe = s.includes('|');
  const hasUuid = UUID_RE.test(s);
  if (!hasPipe && !hasUuid) return s;

  if (hasPipe) {
    const human: string[] = [];
    for (const segment of s.split('|')) {
      const trimmed = segment.trim();
      if (isTechnicalSegment(trimmed)) continue;
      const cleaned = scrubTechnicalIds(trimmed);
      if (cleaned) human.push(cleaned);
    }
    return human.join(' — ');
  }

  return scrubTechnicalIds(s);
}
