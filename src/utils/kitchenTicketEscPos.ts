/**
 * Mutfak fişi — ham ESC/POS (UTF-8 metin + yaygın komutlar).
 * Çoğu ağ termali 9100 portunda UTF-8 veya Latin kabul eder; uyuşmazlıkta Windows «Sistem yazıcısı» kullanın.
 */
import {
  formatKitchenTicketTime,
  getKitchenTicketLabels,
  type KitchenReceiptLocale,
  type KitchenTicketItemLine,
} from './restaurantReceiptPrint';

const enc = new TextEncoder();

function u8(...b: number[]): Uint8Array {
  return new Uint8Array(b);
}

function cat(...parts: Uint8Array[]): Uint8Array {
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

function txt(s: string): Uint8Array {
  return enc.encode(s);
}

function padEnd(s: string, w: number): string {
  const t = s.slice(0, w);
  return t + ' '.repeat(Math.max(0, w - t.length));
}

/** 80 mm termal — yaklaşık monosp genişlik */
const LINE_W = 40;

function wrapText(line: string, width: number): string[] {
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

export function buildKitchenTicketEscPosBuffer(input: {
  tableNumber: string;
  floorName?: string;
  waiter?: string;
  orderNote?: string;
  items: KitchenTicketItemLine[];
  locale?: KitchenReceiptLocale;
}): Uint8Array {
  const L = getKitchenTicketLabels(input.locale);
  const printed = formatKitchenTicketTime(input.locale);
  const parts: Uint8Array[] = [];

  const init = u8(0x1b, 0x40);
  const alignLeft = u8(0x1b, 0x61, 0);
  const alignCenter = u8(0x1b, 0x61, 1);
  const boldOn = u8(0x1b, 0x45, 1);
  const boldOff = u8(0x1b, 0x45, 0);
  const doubleOn = u8(0x1b, 0x21, 0x30);
  const doubleOff = u8(0x1b, 0x21, 0);
  const nl = u8(0x0a);
  const dash = txt(`${'-'.repeat(LINE_W)}\n`);

  parts.push(init);
  parts.push(alignCenter, doubleOn, boldOn, txt(`${L.title}\n`), boldOff, doubleOff, nl);
  parts.push(alignLeft, dash);
  parts.push(txt(`${L.tableSource} ${input.tableNumber}\n`));
  if (input.floorName?.trim()) parts.push(txt(`${L.floor} ${input.floorName.trim()}\n`));
  if (input.waiter?.trim()) parts.push(txt(`${L.waiter} ${input.waiter.trim()}\n`));
  parts.push(txt(`${L.time} ${printed}\n`));
  parts.push(dash);

  if (input.orderNote?.trim()) {
    for (const w of wrapText(input.orderNote.trim(), LINE_W)) {
      parts.push(txt(`${w}\n`));
    }
    parts.push(dash);
  }

  const items = input.items || [];
  if (items.length === 0) {
    parts.push(txt(`${L.empty}\n`));
  } else {
    parts.push(boldOn, txt(`${padEnd(L.colQty, 6)} ${L.colProduct}\n`), boldOff, dash);
    for (const it of items) {
      const qty = `${it.quantity}x`;
      const nameLines = wrapText(it.name, LINE_W - 7);
      const first = nameLines[0] ?? '';
      parts.push(boldOn, txt(`${padEnd(qty, 6)} ${first}\n`), boldOff);
      for (let i = 1; i < nameLines.length; i++) {
        parts.push(txt(`${padEnd('', 6)} ${nameLines[i]}\n`));
      }
      const det = [it.notes?.trim(), it.options?.trim(), it.course?.trim() ? `(${it.course.trim()})` : '']
        .filter((x): x is string => Boolean(x && String(x).trim()))
        .join(' · ');
      if (det) {
        for (const w of wrapText(det, LINE_W)) {
          parts.push(txt(`  ${w}\n`));
        }
      }
    }
  }

  parts.push(dash);
  parts.push(alignCenter, txt(`${L.footer}\n`));
  parts.push(nl, nl, nl, u8(0x1d, 0x56, 0x00));
  return cat(...parts);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** DeskApp (Tauri) — ağ termaline ham bayt gönderir */
export async function printKitchenEscPosOverTcp(host: string, port: number, payload: Uint8Array): Promise<void> {
  const isTauri =
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
      (window as unknown as { __TAURI__?: unknown }).__TAURI__);
  if (!isTauri) {
    throw new Error('NETWORK_ESC_POS_REQUIRES_DESKTOP');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const dataB64 = uint8ToBase64(payload);
  const p = Number(port);
  const safePort = Number.isFinite(p) && p >= 1 && p <= 65535 ? Math.floor(p) : 9100;
  await invoke('print_escpos_tcp', { host: host.trim(), port: safePort, dataB64 });
}
