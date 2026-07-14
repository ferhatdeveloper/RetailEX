/**
 * ESC/POS bayt yardımcıları — mobil fiş yazdırma (UTF-8 metin + yaygın komutlar).
 */

const enc = new TextEncoder();

export function u8(...b: number[]): Uint8Array {
  return new Uint8Array(b);
}

export function cat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function txt(s: string): Uint8Array {
  return enc.encode(s);
}

export function padEnd(s: string, w: number): string {
  const t = s.slice(0, w);
  return t + ' '.repeat(Math.max(0, w - t.length));
}

export function lineWidthForPaper(paperSize: string): number {
  if (paperSize === '58mm') return 32;
  if (paperSize === '80mm') return 48;
  return 40;
}

export function wrapText(line: string, width: number): string[] {
  const t = line.replace(/\r/g, '').trim();
  if (!t) return [];
  if (t.length <= width) return [t];
  const out: string[] = [];
  let rest = t;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < Math.floor(width * 0.45)) cut = width;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** RN/Hermes — Buffer'sız Uint8Array → base64 */
export function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += chars[(n >> 18) & 63];
    out += chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
}

/** Yaygın ESC/POS komutları */
export const ESC_INIT = u8(0x1b, 0x40);
export const ESC_ALIGN_LEFT = u8(0x1b, 0x61, 0);
export const ESC_ALIGN_CENTER = u8(0x1b, 0x61, 1);
export const ESC_BOLD_ON = u8(0x1b, 0x45, 1);
export const ESC_BOLD_OFF = u8(0x1b, 0x45, 0);
export const ESC_DOUBLE_ON = u8(0x1b, 0x21, 0x30);
export const ESC_DOUBLE_OFF = u8(0x1b, 0x21, 0);
export const NL = u8(0x0a);
export const CUT_PARTIAL = u8(0x1d, 0x56, 0x00);
