/**
 * Rongta RLS1000/RLS1100 TCP protokolü.
 * Resmi kaynak: https://www.rongtatech.com/download/ → Label Scale Software User Manual (§2.2)
 * PDF: https://file.globalso.com/file_manage/4365/20251121/label-scale-software-user-manual.pdf
 * RetailEX SDK: scripts/scale-bridge/sdk/rongta/
 */

export const RONGTA_CMD = {
  START: '0201',
  ACK: '0102',
  PLU_SEND: '0110',
  REQUEST_SALES: '0120',
  SALES_RECORD: '0210',
  SALES_END: '0220',
};

export const RONGTA_DEFAULT_PORT = 20304;
export const RONGTA_TEST_DISPLAY_TEXT = 'EXFIN RETAIL';

export const WEIGHT_UNIT_CODES = {
  '50G': '0', G: '1', '10G': '2', '100G': '3', KG: '4', LT: '4', L: '4',
  OZ: '5', LB: '6', '500G': '7', '600G': '8',
};

function padField(value, width, padChar = ' ') {
  const s = String(value ?? '').normalize('NFC');
  return s.length >= width ? s.slice(0, width) : s.padStart(width, padChar);
}

function padNum(value, width) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.slice(-width).padStart(width, '0');
}

export function encodePrice(price) {
  const cents = Math.max(0, Math.round((Number(price) || 0) * 100));
  return padNum(cents, 8);
}

export function mapWeightUnit(unit) {
  const u = String(unit ?? 'KG').toUpperCase().replace(/İ/g, 'I');
  if (u === 'GR' || u === 'GRAM' || u === 'G') return WEIGHT_UNIT_CODES.G;
  if (u === '10G') return WEIGHT_UNIT_CODES['10G'];
  if (u === '100G') return WEIGHT_UNIT_CODES['100G'];
  if (u === '50G') return WEIGHT_UNIT_CODES['50G'];
  if (u === 'OZ') return WEIGHT_UNIT_CODES.OZ;
  if (u === 'LB') return WEIGHT_UNIT_CODES.LB;
  if (u === '500G') return WEIGHT_UNIT_CODES['500G'];
  if (u === '600G') return WEIGHT_UNIT_CODES['600G'];
  return WEIGHT_UNIT_CODES.KG;
}

export function buildPacket(command, data = '') {
  const cmd = String(command).padStart(4, '0').slice(-4);
  const body = cmd + data;
  return String(4 + body.length).padStart(4, '0') + body;
}

export function buildStartPacket() {
  return buildPacket(RONGTA_CMD.START);
}

export function buildStartAckPacket() {
  return buildPacket(RONGTA_CMD.ACK, `${RONGTA_CMD.START}0000000000`);
}

export function buildRequestSalesPacket() {
  return buildPacket(RONGTA_CMD.REQUEST_SALES);
}

export function buildPluBody(plu) {
  const lf = plu.lfCode ?? plu.pluCode;
  const artNo = String(plu.barcode ?? plu.pluCode).replace(/\D/g, '').slice(-10);
  return [
    plu.operate ?? 'I',
    padNum(plu.rank, 2),
    padField(plu.name, 36),
    padNum(lf, 6),
    padNum(artNo || lf, 10),
    padNum(plu.barcodeType ?? 27, 2),
    encodePrice(plu.price),
    mapWeightUnit(plu.unit),
    padNum(plu.department ?? 0, 2),
    padNum(plu.tareGrams ?? 0, 6),
    padNum(plu.shelfDays ?? 15, 3),
    '0',
    padNum(0, 6),
    padNum(5, 2),
    padNum(0, 3),
    padNum(0, 3),
    padNum(0, 3),
    padNum(0, 3),
    '0',
    '0',
  ].join('');
}

export function buildPluPacket(plu) {
  return buildPacket(RONGTA_CMD.PLU_SEND, buildPluBody(plu));
}

export function buildTestPluRecord() {
  return {
    operate: 'I',
    rank: 99,
    name: RONGTA_TEST_DISPLAY_TEXT,
    pluCode: '99999',
    lfCode: '999999',
    barcode: '9999900001',
    barcodeType: 27,
    price: 0.01,
    unit: 'KG',
  };
}

export function parsePacket(raw) {
  const s = String(raw).trim();
  if (s.length < 8) return null;
  const length = parseInt(s.slice(0, 4), 10);
  const command = s.slice(4, 8);
  const data = s.slice(8, Number.isFinite(length) ? length : undefined);
  return { length, command, data };
}

export function parseAck(raw) {
  const pkt = parsePacket(raw);
  if (!pkt || pkt.command !== RONGTA_CMD.ACK) {
    return { ok: String(raw).trim().length === 0, errorCode: '0000', raw: String(raw) };
  }
  const d = pkt.data;
  const errorCode = d.length >= 14 ? d.slice(-4) : '0000';
  return {
    ok: errorCode === '0000',
    errorCode,
    orderCode: d.slice(0, 4),
    freshCode: d.slice(4, 10),
    raw: String(raw),
  };
}

export function isRongtaFrame(raw) {
  const pkt = parsePacket(raw);
  if (!pkt) return false;
  if (!Number.isFinite(pkt.length) || pkt.length < 8 || pkt.length > 8192) return false;
  return Object.values(RONGTA_CMD).includes(pkt.command);
}

export function isRongtaAck(raw) {
  const pkt = parsePacket(raw);
  return !!pkt && pkt.command === RONGTA_CMD.ACK;
}

/** 0210 satış kaydı gövdesi (manual alan sırası, 74 karakter). */
export function parseSalesRecord(data) {
  const d = String(data);
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

export function productsToPluRecords(items, startRank = 1) {
  return items.map((item, idx) => ({
    pluCode: item.pluCode,
    name: item.name,
    price: item.price,
    unit: item.unit,
    barcode: item.barcode,
    rank: startRank + idx,
    lfCode: String(item.pluCode).replace(/\D/g, '').slice(-6).padStart(6, '0'),
    operate: 'I',
  }));
}
