/**
 * Rongta RLS1000/1100 TCP ASCII protokolü — web `src/utils/rongtaRlsProtocol.ts` ile hizalı.
 * Mobil doğrudan TCP ve bridge yolu bu paketleri kullanır.
 */

export const RONGTA_DEFAULT_PORT = 5001;
/** LAN keşif + bağlantı port adayları (TeraziManager + web) */
export const RONGTA_LAN_PROBE_PORTS = [5001, 9100, 4001, 20304] as const;
export const RONGTA_FALLBACK_PORTS = [
  5001, 20304, 4001, 9100, 19204, 20104, 3001, 3000, 4000, 5000, 8000, 8001, 8080, 9000, 10001,
] as const;
export const RONGTA_TEST_DISPLAY_TEXT = 'EXFIN RETAIL';
export const RONGTA_BARCODE_TYPE_DEFAULT = 99;

export const RONGTA_CMD = {
  START: '0201',
  ACK: '0102',
  PLU_SEND: '0110',
  SALES_RECORD: '0210',
  SALES_END: '0220',
  REQUEST_SALES: '0120',
} as const;

export type RongtaPluRecord = {
  pluCode: string;
  name: string;
  price: number;
  unit?: string;
  barcode?: string;
  lfCode?: string;
  barcodeType?: number;
  department?: number;
  tareGrams?: number;
  shelfDays?: number;
  operate?: 'I' | 'D';
  rank: number;
  /** Android/Windows LabelId (slot); açık TCP PLU gövdesinde Multi Label alanı */
  labelId?: number;
};

export type RongtaAckInfo = {
  orderCode: string;
  freshCode: string;
  errorCode: string;
  ok: boolean;
  raw: string;
};

export type RongtaSalesRecord = {
  scaleNo: string;
  userId: string;
  freshCode: string;
  unitPrice: number;
  weightUnit: string;
  totalAmount: number;
  weight: number;
  saleDate: string;
  discountType: string;
  finalOnlineTime: string;
};

export function rongtaPadField(value: string, width: number, padChar = ' '): string {
  const normalized = (value ?? '').normalize('NFC');
  if (normalized.length >= width) return normalized.slice(0, width);
  return normalized.padStart(width, padChar);
}

export function rongtaPadNumber(value: string | number, width: number): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.slice(-width).padStart(width, '0');
}

export function rongtaEncodePrice(price: number): string {
  const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
  return rongtaPadNumber(cents, 8);
}

export function rongtaMapWeightUnit(unit?: string): string {
  const plain = (unit ?? 'KG')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .toLocaleUpperCase('en-US');
  if (plain === 'KG' || plain === 'LT' || plain === 'LITRE' || plain === 'L') return '4';
  if (plain === 'GR' || plain === 'GRAM' || plain === 'G') return '1';
  if (plain === '10G') return '2';
  if (plain === '100G') return '3';
  return '4';
}

export function buildRongtaPacket(command: string, data = ''): string {
  const cmd = command.padStart(4, '0').slice(-4);
  const body = cmd + data;
  const len = String(4 + body.length).padStart(4, '0');
  return len + body;
}

export function buildRongtaStartPacket(): string {
  return buildRongtaPacket(RONGTA_CMD.START);
}

export function buildRongtaStartAckPacket(): string {
  return buildRongtaPacket(RONGTA_CMD.ACK, `${RONGTA_CMD.START}0000000000`);
}

export function buildRongtaRequestSalesPacket(): string {
  return buildRongtaPacket(RONGTA_CMD.REQUEST_SALES);
}

/** 0110 PLU gövdesi (~102 karakter). */
export function buildRongtaPluBody(plu: RongtaPluRecord): string {
  const lf = plu.lfCode ?? plu.pluCode;
  const artNo = (plu.barcode ?? plu.pluCode).replace(/\D/g, '').slice(-10);
  const multiLabel =
    plu.labelId != null && plu.labelId > 0
      ? rongtaPadNumber(plu.labelId, 3).slice(-1)
      : '0';
  return [
    plu.operate ?? 'I',
    rongtaPadNumber(plu.rank, 2),
    rongtaPadField(plu.name, 36),
    rongtaPadNumber(lf, 6),
    rongtaPadNumber(artNo || lf, 10),
    rongtaPadNumber(plu.barcodeType ?? RONGTA_BARCODE_TYPE_DEFAULT, 2),
    rongtaEncodePrice(plu.price),
    rongtaMapWeightUnit(plu.unit),
    rongtaPadNumber(plu.department ?? 0, 2),
    rongtaPadNumber(plu.tareGrams ?? 0, 6),
    rongtaPadNumber(plu.shelfDays ?? 15, 3),
    '0',
    rongtaPadNumber(0, 6),
    rongtaPadNumber(5, 2),
    rongtaPadNumber(0, 3),
    rongtaPadNumber(0, 3),
    rongtaPadNumber(0, 3),
    rongtaPadNumber(0, 3),
    multiLabel,
    '0',
  ].join('');
}

export function buildRongtaPluPacket(plu: RongtaPluRecord): string {
  return buildRongtaPacket(RONGTA_CMD.PLU_SEND, buildRongtaPluBody(plu));
}

export function parseRongtaPacket(
  raw: string,
): { length: number; command: string; data: string } | null {
  const s = raw.trim();
  if (s.length < 8) return null;
  const length = parseInt(s.slice(0, 4), 10);
  const command = s.slice(4, 8);
  const data = s.slice(8, Number.isFinite(length) ? length : undefined);
  return { length, command, data };
}

export function parseRongtaAck(raw: string): RongtaAckInfo | null {
  const pkt = parseRongtaPacket(raw);
  if (!pkt || pkt.command !== RONGTA_CMD.ACK) return null;
  const d = pkt.data;
  if (d.length < 14) {
    return {
      orderCode: d.slice(0, 4),
      freshCode: d.slice(4, 10),
      errorCode: d.slice(10, 14) || '0000',
      ok: true,
      raw,
    };
  }
  const errorCode = d.slice(-4);
  return {
    orderCode: d.slice(0, 4),
    freshCode: d.slice(4, 10),
    errorCode,
    ok: errorCode === '0000',
    raw,
  };
}

export function parseRongtaSalesRecord(data: string): RongtaSalesRecord | null {
  const d = data;
  if (d.length < 74) return null;
  const unitPriceRaw = parseInt(d.slice(20, 28), 10);
  const totalRaw = parseInt(d.slice(29, 39), 10);
  const weightRaw = parseInt(d.slice(39, 45), 10);
  return {
    scaleNo: d.slice(0, 8).trim(),
    userId: d.slice(8, 14).trim(),
    freshCode: d.slice(14, 20).trim(),
    unitPrice: unitPriceRaw / 100,
    weightUnit: d.slice(28, 29),
    totalAmount: totalRaw / 100,
    weight: weightRaw / 1000,
    saleDate: d.slice(45, 59),
    discountType: d.slice(59, 60),
    finalOnlineTime: d.slice(60, 74),
  };
}

export function buildRongtaTestPluRecord(): RongtaPluRecord {
  return {
    pluCode: '99999',
    name: RONGTA_TEST_DISPLAY_TEXT,
    price: 0.01,
    unit: 'KG',
    barcode: '9999900001',
    rank: 99,
    lfCode: '999999',
    operate: 'I',
  };
}

export function parseAckRaw(raw: string): { ok: boolean; errorCode: string; raw: string } {
  const ack = parseRongtaAck(raw);
  if (!ack) return { ok: false, errorCode: '????', raw: raw.trim() };
  return { ok: ack.ok, errorCode: ack.errorCode, raw: ack.raw };
}
