/**
 * Kimlik / ehliyet / vergi levhası OCR metninden cari alanları.
 * Tahminler kullanıcı onayına sunulur — kesin değildir.
 */

export type IdentityDocKind = 'tc_kimlik' | 'ehliyet' | 'vergi_levhasi' | 'unknown';

export type ParsedIdentityFields = {
  docKind: IdentityDocKind;
  /** Ad + soyad birleşik unvan */
  name?: string;
  firstName?: string;
  lastName?: string;
  /** TC (11) veya VKN (10) — cari tax_nr */
  taxNr?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  district?: string;
  birthDate?: string;
  rawText: string;
  ocrLines: string[];
};

function joinOcr(blocks: string[]): { text: string; lines: string[] } {
  const lines = blocks
    .flatMap((b) => String(b || '').split(/\r?\n/))
    .map((l) => l.trim())
    .filter(Boolean);
  return { text: lines.join('\n'), lines };
}

/** TC Kimlik No checksum (opsiyonel doğrulama) */
export function isValidTckn(raw: string): boolean {
  const tc = String(raw || '').replace(/\D/g, '');
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = tc.split('').map((c) => Number(c));
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum10 % 10 === d[10];
}

function detectDocKind(text: string): IdentityDocKind {
  if (
    /vergi\s*levhas[ıi]|vergi\s*kimlik|v\.?\s*k\.?\s*n\.?|tax\s*id|taxpayer/i.test(text)
  ) {
    return 'vergi_levhasi';
  }
  if (
    /s[üu]r[üu]c[üu]\s*belgesi|driving\s*licen[cs]e|ehliyet|driver'?s?\s*licen/i.test(
      text,
    )
  ) {
    return 'ehliyet';
  }
  if (
    /t\.?\s*c\.?\s*kimlik|identity\s*card|n[üu]fus\s*c[üu]zdan[ıi]|republic\s*of\s*t[üu]rkiye/i.test(
      text,
    )
  ) {
    return 'tc_kimlik';
  }
  return 'unknown';
}

function extractLabeledValue(lines: string[], labelRe: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(labelRe);
    if (!m) continue;
    const after = (m[1] || '').trim();
    if (after.length >= 2 && !/^(surname|name|adi|soyad)/i.test(after)) {
      return after.replace(/\s{2,}/g, ' ').slice(0, 80);
    }
    const next = lines[i + 1]?.trim();
    if (next && next.length >= 2 && !labelRe.test(next) && !/^\d{6,}$/.test(next)) {
      return next.replace(/\s{2,}/g, ' ').slice(0, 80);
    }
  }
  return undefined;
}

function findTckn(text: string, lines: string[]): string | undefined {
  const labeled = text.match(
    /(?:t\.?\s*c\.?\s*kimlik\s*no|identity\s*no|kimlik\s*no)[:\s#]*([1-9]\d{10})/i,
  );
  if (labeled?.[1] && isValidTckn(labeled[1])) return labeled[1];

  const candidates = new Set<string>();
  for (const m of text.matchAll(/\b([1-9]\d{10})\b/g)) {
    candidates.add(m[1]);
  }
  for (const line of lines) {
    const digits = line.replace(/\D/g, '');
    if (/^[1-9]\d{10}$/.test(digits)) candidates.add(digits);
  }
  const valid = [...candidates].filter(isValidTckn);
  if (valid.length) return valid[0];
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function findVkn(text: string, lines: string[]): string | undefined {
  const labeled = text.match(
    /(?:vergi\s*(?:kimlik\s*)?(?:no|numaras[ıi])|v\.?\s*k\.?\s*n\.?)[:\s#]*(\d{10})\b/i,
  );
  if (labeled?.[1]) return labeled[1];

  for (const line of lines) {
    if (/vergi|vkn|tax/i.test(line)) {
      const m = line.match(/\b(\d{10})\b/);
      if (m) return m[1];
    }
  }
  // Tek 10 haneli (11 TC değil) — zayıf yedek
  const tens = [...text.matchAll(/\b(\d{10})\b/g)].map((m) => m[1]);
  const only = tens.filter((n) => !isValidTckn(n + '0')); // kabaca
  if (tens.length === 1) return tens[0];
  if (only.length === 1) return only[0];
  return undefined;
}

function findTaxOffice(lines: string[], text: string): string | undefined {
  const labeled = extractLabeledValue(
    lines,
    /(?:vergi\s*dairesi|tax\s*office)[:\s]*(.*)$/i,
  );
  if (labeled) return labeled;
  const m = text.match(/vergi\s*dairesi[:\s]+([^\n]{3,60})/i);
  return m?.[1]?.trim().slice(0, 60);
}

function findAddress(lines: string[], text: string): string | undefined {
  const labeled = extractLabeledValue(
    lines,
    /(?:ikametgah|ikametgâh|adres|address|yerle[sş]im)[:\s]*(.*)$/i,
  );
  if (labeled && labeled.length >= 8) return labeled.slice(0, 200);

  const addrIdx = lines.findIndex((l) =>
    /ikametgah|ikametgâh|adres|address|mah\.|mahalle|sok\.|cad\./i.test(l),
  );
  if (addrIdx >= 0) {
    const chunk = lines
      .slice(addrIdx, addrIdx + 4)
      .join(' ')
      .replace(/(?:ikametgah|ikametgâh|adres|address)[:\s]*/gi, '')
      .trim();
    if (chunk.length >= 8) return chunk.slice(0, 200);
  }

  const m = text.match(
    /((?:[A-Za-zÇĞİÖŞÜçğıöşü0-9./\-\s]{4,}(?:Mah\.|Mahalle|Sok\.|Cad\.|Bulv\.|No\s*:?\s*\d+)[^\n]{0,80}))/i,
  );
  return m?.[1]?.trim().slice(0, 200);
}

function guessCityDistrict(address?: string): { city?: string; district?: string } {
  if (!address) return {};
  // Son parça genelde İl / İlçe
  const parts = address
    .split(/[\/|,]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (parts.length >= 2) {
    const city = parts[parts.length - 1].replace(/\d+/g, '').trim().slice(0, 40);
    const district = parts[parts.length - 2].replace(/\d+/g, '').trim().slice(0, 40);
    return {
      city: city.length >= 2 ? city : undefined,
      district: district.length >= 2 ? district : undefined,
    };
  }
  return {};
}

function findBirthDate(text: string): string | undefined {
  const m = text.match(
    /(?:do[gğ]um\s*tarihi|date\s*of\s*birth|birth)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  );
  if (m?.[1]) return m[1];
  const loose = text.match(/\b(\d{2}[./]\d{2}[./]\d{4})\b/);
  return loose?.[1];
}

function buildFullName(first?: string, last?: string, fallbackLine?: string): string | undefined {
  const a = (first || '').trim();
  const b = (last || '').trim();
  if (a && b) return `${a} ${b}`.replace(/\s{2,}/g, ' ').slice(0, 120);
  if (a) return a.slice(0, 120);
  if (b) return b.slice(0, 120);
  if (fallbackLine && fallbackLine.length >= 3) return fallbackLine.slice(0, 120);
  return undefined;
}

/**
 * OCR bloklarından kimlik / ehliyet / vergi levhası alanları.
 */
export function parseIdentityCardOcr(blocks: string[]): ParsedIdentityFields {
  const { text, lines } = joinOcr(blocks);
  const docKind = detectDocKind(text);

  const lastName = extractLabeledValue(
    lines,
    /(?:soyad[ıi]|surname)[:\s\/]*(?:surname)?[:\s]*(.*)$/i,
  );
  const firstName = extractLabeledValue(
    lines,
    /(?:^|\b)(?:ad[ıi]|given\s*name|name)(?!\s*no)[:\s\/]*(?:name|given\s*name)?[:\s]*(.*)$/i,
  );

  const unvan = extractLabeledValue(
    lines,
    /(?:unvan[ıi]?|title|ticari\s*unvan)[:\s]*(.*)$/i,
  );

  let taxNr: string | undefined;
  if (docKind === 'vergi_levhasi') {
    taxNr = findVkn(text, lines) || findTckn(text, lines);
  } else {
    taxNr = findTckn(text, lines) || findVkn(text, lines);
  }

  const taxOffice = findTaxOffice(lines, text);
  const address = findAddress(lines, text);
  const { city, district } = guessCityDistrict(address);
  const birthDate = findBirthDate(text);

  const name =
    unvan ||
    buildFullName(firstName, lastName) ||
    // Yedek: ilk “insan adı” benzeri satır (başlık değil)
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 60 &&
        !/\d{5,}/.test(l) &&
        !/kimlik|identity|republic|s[üu]r[üu]c[üu]|ehliyet|vergi|belge|card|licence/i.test(
          l,
        ) &&
        /[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(l),
    );

  return {
    docKind,
    name: name?.replace(/\s{2,}/g, ' ').trim(),
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    taxNr,
    taxOffice,
    address,
    city,
    district,
    birthDate,
    rawText: text,
    ocrLines: lines,
  };
}
