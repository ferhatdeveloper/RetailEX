/**
 * Satış / fiş notunun ekranda gösterilecek metni.
 * DB’de `GüzellikPOS|beauty_sale_id:<uuid>|rex_appt:<uuid>|Güzellik satışı` gibi
 * pipe’lı teknik kimlikler saklanabilir; gösterimde UUID ve id etiketleri gizlenir.
 *
 * Ayrıca pipe/kolon bozulmuş kalıplar da desteklenir:
 * `GüzellikPOSbeauty_sale_id <uuid>|res_appt <uuid>`
 */

const UUID_BODY =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID_RE = new RegExp(UUID_BODY);
const UUID_GLOBAL_RE = new RegExp(UUID_BODY, 'g');

/** Bilinen teknik anahtarlar (yapışık önekte de eşleşir; greedy fallback yok). */
const KNOWN_TECH_KEY = '(?:beauty_sale_id|rex_appt|res_appt|rest_order_id)';

/** `key:uuid` veya `key uuid` — `GüzellikPOSbeauty_sale_id …` dahil */
const EMBEDDED_KNOWN_TECH_RE = new RegExp(
  `${KNOWN_TECH_KEY}[:\\s]+${UUID_BODY}`,
  'gi',
);
/**
 * Diğer `snake_id:uuid` / `snake_appt:uuid` — yalnızca kelime sınırı ile
 * (yapışık Türkçe önek yutulmasın diye boşluklu forma uygulanmaz).
 */
const EMBEDDED_GENERIC_COLON_RE = new RegExp(
  `\\b([a-z][a-z0-9_]*_(?:id|appt)):${UUID_BODY}\\b`,
  'gi',
);

const TECH_KEY_VALUE_RE = new RegExp(
  `^(?:${KNOWN_TECH_KEY}|[a-z][a-z0-9_]*_(?:id|appt))[:\\s]+${UUID_BODY}$`,
  'i',
);
const TECH_TOKEN_RE = /^(checkout_tek_tahsilat)$/i;

function scrubTechnicalIds(part: string): string {
  return part
    .replace(EMBEDDED_KNOWN_TECH_RE, '')
    .replace(EMBEDDED_GENERIC_COLON_RE, '')
    .replace(UUID_GLOBAL_RE, '')
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
  if (UUID_RE.test(t) && t.replace(UUID_GLOBAL_RE, '').replace(/[\s|-]/g, '') === '') return true;
  if (!scrubTechnicalIds(t)) return true;
  return false;
}

/**
 * Pipe + UUID / `*_id:uuid` / `*_id uuid` parçalarını çıkarır; insan okunur parçaları birleştirir.
 * Örn. `GüzellikPOS|beauty_sale_id:…|Güzellik satışı` → `GüzellikPOS — Güzellik satışı`
 * Örn. `GüzellikPOSbeauty_sale_id …|res_appt …` → `GüzellikPOS`
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
