/**
 * Rongta RLS1000 / RLS1100 etiket terazisi TCP protokolü.
 * Kaynak: RLS1000 Software User Manual §2.2–2.5 (resmi terazi SDK yok; TCP spesifikasyonu esas alınır).
 */

import { getScaleBarcodeType } from './scaleBarcodeConfig';

export const RONGTA_DEFAULT_IP = '192.168.1.87';
export const RONGTA_DEFAULT_PORT = 20304;
/** Bağlantı testinde sırayla denenen terazi portları (yazıcı portları hariç) */
export const RONGTA_FALLBACK_PORTS = [
  20304, 4001, 19204, 20104, 3001, 3000, 4000, 5000, 8000, 8001, 8080, 9000, 10001,
] as const;
export const RONGTA_PORTS_CSV = RONGTA_FALLBACK_PORTS.join(',');
export const RONGTA_PRINTER_PORTS = [9100, 515, 631, 80, 443, 1024] as const;
/** Bağlantı testinde terazi ekranına yazdırılacak metin (PLU adı). */
export const RONGTA_TEST_DISPLAY_TEXT = 'EXFIN RETAIL';

export const RONGTA_CMD = {
  START: '0201',
  ACK: '0102',
  PLU_SEND: '0110',
  SALES_RECORD: '0210',
  SALES_END: '0220',
  REQUEST_SALES: '0120',
} as const;

export interface RongtaPluInput {
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
}

export interface RongtaAckInfo {
  orderCode: string;
  freshCode: string;
  errorCode: string;
  ok: boolean;
  raw: string;
}

export interface RongtaPluRecord extends RongtaPluInput {
  rank: number;
}

/** Sabit genişlik alan — sağa hizalı (TXU flush-right). */
export function rongtaPadField(value: string, width: number, padChar = ' '): string {
  const normalized = (value ?? '').normalize('NFC');
  if (normalized.length >= width) return normalized.slice(0, width);
  return normalized.padStart(width, padChar);
}

export function rongtaPadNumber(value: string | number, width: number): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.slice(-width).padStart(width, '0');
}

/** Fiyat: 12.34 → 00001234 (x100, ondalıksız). */
export function rongtaEncodePrice(price: number): string {
  const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
  return rongtaPadNumber(cents, 8);
}

/** Ağırlık birimi kodu (RLS manual). */
export function rongtaMapWeightUnit(unit?: string): string {
  const u = (unit ?? 'KG').toUpperCase().replace(/İ/g, 'I');
  if (u === 'KG' || u === 'LT' || u === 'LITRE' || u === 'L') return '4';
  if (u === 'GR' || u === 'GRAM' || u === 'G') return '1';
  if (u === '10G') return '2';
  if (u === '100G') return '3';
  return '4';
}

/** Varsayılan barkod tipi: 99 (özel — tip 17 yapısı: 27 + PLU + gram). */
export function rongtaDefaultBarcodeType(): number {
  return getScaleBarcodeType();
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

/** 0110 PLU gönderim gövdesi (102 ASCII karakter). */
export function buildRongtaPluBody(plu: RongtaPluRecord): string {
  const lf = plu.lfCode ?? plu.pluCode;
  const artNo = (plu.barcode ?? plu.pluCode).replace(/\D/g, '').slice(-10);
  return [
    plu.operate ?? 'I',
    rongtaPadNumber(plu.rank, 2),
    rongtaPadField(plu.name, 36),
    rongtaPadNumber(lf, 6),
    rongtaPadNumber(artNo || lf, 10),
    rongtaPadNumber(plu.barcodeType ?? rongtaDefaultBarcodeType(), 2),
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
    '0',
    '0',
  ].join('');
}

export function buildRongtaPluPacket(plu: RongtaPluRecord): string {
  return buildRongtaPacket(RONGTA_CMD.PLU_SEND, buildRongtaPluBody(plu));
}

/** Terazinin 0201 başlatmasına ACK. */
export function buildRongtaStartAckPacket(): string {
  return buildRongtaPacket(RONGTA_CMD.ACK, `${RONGTA_CMD.START}0000000000`);
}

export function parseRongtaPacket(raw: string): { length: number; command: string; data: string } | null {
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

/** TXU satır formatı (RLS1000 PLU dosyası — isteğe bağlı dışa aktarım). */
export function buildRongtaTxuLine(plu: RongtaPluRecord): string {
  const lf = plu.lfCode ?? plu.pluCode;
  const artNo = (plu.barcode ?? plu.pluCode).replace(/\D/g, '').slice(-10);
  const fields: Array<[string, string]> = [
    ['PLU No.', rongtaPadNumber(plu.rank, 4)],
    ['Name', rongtaPadField(plu.name, 36)],
    ['LFCode', rongtaPadNumber(lf, 6)],
    ['Code', rongtaPadNumber(artNo || lf, 10)],
    ['Barcode Type', rongtaPadNumber(plu.barcodeType ?? rongtaDefaultBarcodeType(), 2)],
    ['Unit Price', rongtaEncodePrice(plu.price)],
    ['Weight Unit', rongtaMapWeightUnit(plu.unit)],
    ['Deptment', rongtaPadNumber(plu.department ?? 0, 2)],
    ['Tare', rongtaPadNumber(plu.tareGrams ?? 0, 6)],
    ['Shelf Time', rongtaPadNumber(plu.shelfDays ?? 15, 3)],
    ['Package Type', '0'],
    ['Package Weight', rongtaPadNumber(0, 6)],
    ['Package Tolerance', rongtaPadNumber(5, 2)],
    ['Message1', '0'],
    ['Message2', '0'],
    ['Account', rongtaPadNumber(0, 10)],
    ['Multi Label', '0'],
    ['Rebate', '0'],
    ['PCS Type', '0'],
  ];
  return fields.map(([k, v]) => `${k} ${v}`).join('\r\n') + '\r\n';
}

export interface RongtaSalesRecord {
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
}

/** 0210 satış kaydı gövdesi (manual alan sırası). */
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

export function buildRongtaRequestSalesPacket(): string {
  return buildRongtaPacket(RONGTA_CMD.REQUEST_SALES);
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

export function productsToRongtaPluRecords(
  items: Array<{ pluCode: string; name: string; price: number; unit?: string; barcode?: string }>,
  startRank = 1
): RongtaPluRecord[] {
  return items.map((item, idx) => ({
    pluCode: item.pluCode,
    name: item.name,
    price: item.price,
    unit: item.unit,
    barcode: item.barcode,
    rank: startRank + idx,
    lfCode: item.pluCode.replace(/\D/g, '').slice(-6).padStart(6, '0'),
    barcodeType: rongtaDefaultBarcodeType(),
    operate: 'I' as const,
  }));
}
