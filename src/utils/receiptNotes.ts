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
/** Satış fiş bağı. Kullanıcı metninde durmaz; numara fiş kolonundadır. */
const RESERVED_SALE_FICHE_SEGMENT_RE = /^reserved_sale_fiche:\s*BEA-\d{4}-\d+$/i;

function stripReservedSaleFicheTag(part: string): string {
  return part
    .replace(/reserved_sale_fiche:\s*BEA-\d{4}-\d+/gi, '')
    .replace(/\s*[|:—–]+\s*$/g, '')
    .replace(/^\s*[|:—–]+\s*/g, '')
    .replace(/\s*\|\s*\|+/g, '|')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
  if (RESERVED_SALE_FICHE_SEGMENT_RE.test(t)) return true;
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
  const s = stripReservedSaleFicheTag(String(raw ?? '').trim());
  if (!s) return '';

  const hasPipe = s.includes('|');
  const hasUuid = UUID_RE.test(s);
  if (!hasPipe && !hasUuid) return s;

  if (hasPipe) {
    const human: string[] = [];
    for (const segment of s.split('|')) {
      const trimmed = segment.trim();
      if (isTechnicalSegment(trimmed)) continue;
      const cleaned = stripReservedSaleFicheTag(scrubTechnicalIds(trimmed));
      if (cleaned) human.push(cleaned);
    }
    return human.join(' — ');
  }

  return stripReservedSaleFicheTag(scrubTechnicalIds(s));
}

const INVOICE_CHANNEL_OR_FILLER =
  /^(?:GüzellikPOS|MarketPOS|RestoranPOS|RestPOS|Güzellik satışı|checkout_tek_tahsilat)$/i;

/** Kanal öneki, UUID etiketi, peşinat bağlantısı — fatura açıklamasında iş notu değildir. */
function segmentIsMachineNote(part: string): boolean {
  const t = part.trim();
  if (!t) return true;
  if (INVOICE_CHANNEL_OR_FILLER.test(t)) return true;
  if (/^(?:beauty_sale_id|rex_appt|res_appt|rest_order_id)[:\s]+[0-9a-fA-F-]{8}-/i.test(t)) return true;
  if (/^(?:parent_sale|sale_group):/i.test(t)) return true;
  if (/^reserved_sale_fiche:\s*BEA-\d{4}-\d+$/i.test(t)) return true;
  if (/^deposit:1$/i.test(t)) return true;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(t)) return true;
  return false;
}

/**
 * Fatura açıklama kutusu. `GüzellikPOS|beauty_sale_id:…|rex_appt:…` teknik
 * dizisi ve kanal öneki gizlenir; yalnız iş notu kalır. Not yoksa kutu boştur.
 * Ekstre etiketi (`GüzellikPOS`) bu fonksiyondan gelmez.
 */
export function invoiceDescriptionForDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const hasMachine =
    /beauty_sale_id|rex_appt|res_appt|rest_order_id|parent_sale:|sale_group:|deposit:1|checkout_tek_tahsilat|reserved_sale_fiche:/i.test(s)
    || /^(?:GüzellikPOS|MarketPOS|RestoranPOS|RestPOS)\|/i.test(s);
  if (!hasMachine) return s;
  const cleaned = receiptNotesForDisplay(s);
  const human = cleaned
    .split(/\s+—\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !INVOICE_CHANNEL_OR_FILLER.test(p));
  return human.join(' — ');
}

/**
 * Açıklama kutusu değişmediyse saklanan not aynen döner (teknik etiket silinmez,
 * kasa / randevu bağlantısı yeniden yazılmaz). Kullanıcı iş notu yazdıysa
 * makine parçaları yerinde kalır, kutuda yalnız not görünür.
 */
export function invoiceNotesToPersist(
  storedRaw: string | undefined | null,
  displayText: string | undefined | null,
  touched: boolean,
): string {
  const stored = String(storedRaw ?? '');
  if (!touched) return stored;
  const human = String(displayText ?? '').trim();
  if (human === invoiceDescriptionForDisplay(stored)) return stored;
  if (!stored.trim()) return human;
  const tech = stored
    .split('|')
    .map((p) => p.trim())
    .filter((p) => segmentIsMachineNote(p));
  if (tech.length === 0) return human;
  if (!human) return tech.join('|');
  return `${human}|${tech.join('|')}`;
}
