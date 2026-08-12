/**
 * BLE / seri tartı payload → kg.
 * Ortak ASCII (CAS / generic) + Bluetooth Weight Scale Profile (0x2A9D).
 */

export type ParsedWeight = {
  weightKg: number;
  stable: boolean;
  detail: string;
};

function bytesToAscii(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
  }
  return s.trim();
}

/** RN/Hermes için Buffer'sız base64 → bayt */
export function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = chars.indexOf(clean[i]!);
    const enc2 = chars.indexOf(clean[i + 1]!);
    const enc3 = clean[i + 2] ? chars.indexOf(clean[i + 2]!) : -1;
    const enc4 = clean[i + 3] ? chars.indexOf(clean[i + 3]!) : -1;
    const n =
      ((enc1 & 63) << 18) |
      ((enc2 & 63) << 12) |
      (((enc3 >= 0 ? enc3 : 0) & 63) << 6) |
      ((enc4 >= 0 ? enc4 : 0) & 63);
    out.push((n >> 16) & 255);
    if (enc3 >= 0) out.push((n >> 8) & 255);
    if (enc4 >= 0) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

/**
 * Bluetooth SIG Weight Measurement (0x2A9D)
 * Flags bit0: 0=SI(kg), 1=Imperial(lb)
 * Weight: uint16 LE, çözünürlük 0.005 kg veya 0.01 lb
 */
export function parseWeightMeasurementCharacteristic(bytes: Uint8Array): ParsedWeight | null {
  if (bytes.length < 3) return null;
  const flags = bytes[0]!;
  const raw = bytes[1]! | (bytes[2]! << 8);
  const imperial = (flags & 0x01) !== 0;
  let kg = imperial ? (raw * 0.01) / 2.2046226218 : raw * 0.005;
  kg = Math.round(kg * 1000) / 1000;
  if (!Number.isFinite(kg) || kg < 0 || kg > 500) return null;
  return {
    weightKg: kg,
    stable: true,
    detail: imperial ? 'BLE Weight Profile (lb→kg)' : 'BLE Weight Profile',
  };
}

/** CAS / Digi / generic ASCII satırları */
export function parseAsciiWeight(text: string): ParsedWeight | null {
  const t = text.replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
  if (!t) return null;

  const unstable =
    /\bUS\b/i.test(t) ||
    /\bUNSTABLE\b/i.test(t) ||
    t.includes('??') ||
    /^[UD],/i.test(t);

  // ST,GS,+  1.234kg  |  NT,GS, 0.452 kg
  const cas = t.match(
    /(?:ST|NT|US|OL)?[,\s]*(?:GS|NT)?[,\s]*([+-]?\s*\d+[.,]\d+)\s*(?:kg|KG)?/i,
  );
  if (cas?.[1]) {
    const kg = Number(cas[1].replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(kg) && kg >= 0 && kg < 500) {
      return {
        weightKg: Math.round(kg * 1000) / 1000,
        stable: !unstable && !/^US/i.test(t),
        detail: 'ASCII CAS/generic',
      };
    }
  }

  // +001.234 / wn0001.23 / 1.234kg
  const plain = t.match(/([+-]?\d+[.,]\d+)\s*(?:kg|KG)?/);
  if (plain?.[1]) {
    const kg = Number(plain[1].replace(',', '.'));
    if (Number.isFinite(kg) && kg >= 0 && kg < 500) {
      return {
        weightKg: Math.round(Math.abs(kg) * 1000) / 1000,
        stable: !unstable,
        detail: 'ASCII sayı',
      };
    }
  }

  // Saf tamsayı gram (örn. 1234 → 1.234 kg) — yalnızca 3–6 hane
  const grams = t.match(/^(\d{3,6})$/);
  if (grams?.[1]) {
    const kg = Number(grams[1]) / 1000;
    if (kg > 0 && kg < 500) {
      return { weightKg: Math.round(kg * 1000) / 1000, stable: true, detail: 'ASCII gram' };
    }
  }

  return null;
}

/** uint16 LE / BE hammaddeden makul kg tahmin */
export function parseBinaryHeuristic(bytes: Uint8Array): ParsedWeight | null {
  if (bytes.length >= 2) {
    const le = bytes[0]! | (bytes[1]! << 8);
    const candidates = [le / 1000, le / 100, le * 0.005];
    for (const kg of candidates) {
      if (kg > 0.01 && kg < 80) {
        return {
          weightKg: Math.round(kg * 1000) / 1000,
          stable: true,
          detail: 'Binary uint16 tahmin',
        };
      }
    }
  }
  return null;
}

export function parseBleWeightPayload(base64Value: string | null | undefined): ParsedWeight | null {
  if (!base64Value) return null;
  const bytes = base64ToBytes(base64Value);
  if (bytes.length === 0) return null;

  const fromProfile = parseWeightMeasurementCharacteristic(bytes);
  if (fromProfile) return fromProfile;

  const ascii = parseAsciiWeight(bytesToAscii(bytes));
  if (ascii) return ascii;

  return parseBinaryHeuristic(bytes);
}
