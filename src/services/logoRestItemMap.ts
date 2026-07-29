/**
 * Logo Tiger REST malzeme (items) alan eşlemesi — giden/gelen ortak yardımcılar.
 * Logo Objects restRecord: UNITSET + UNITS + BARCODE_LIST + PRCLIST.
 */

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function nestedItems(bag: unknown): Record<string, unknown>[] {
  const o = asRec(bag);
  if (!o) return [];
  const items = o.items ?? o.Items ?? o.item ?? o.Item;
  if (!Array.isArray(items)) return [];
  return items.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
}

function field(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k];
  }
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  for (const [rk, rv] of Object.entries(rec)) {
    if (lower.has(rk.toLowerCase()) && rv !== undefined && rv !== null && rv !== '') return rv;
  }
  return undefined;
}

function num(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function trunc(v: unknown, max: number): string {
  const s = String(v ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** RetailEX birim → Logo UNIT_CODE / UNITSET_CODE */
export function mapRetailUnitToLogo(unit: unknown): { unitCode: string; unitSetCode: string } {
  const raw = String(unit || 'AD').trim();
  const u = raw.toLocaleUpperCase('tr-TR');
  if (!u || u === 'ADET' || u === 'AD.' || u === 'AD' || u === 'PCS' || u === 'PC') {
    return { unitCode: 'AD', unitSetCode: '05' };
  }
  if (u === 'KG' || u === 'KILO' || u === 'KİLO') return { unitCode: 'KG', unitSetCode: '01' };
  if (u === 'GR' || u === 'G' || u === 'GRAM') return { unitCode: 'GR', unitSetCode: '02' };
  if (u === 'LT' || u === 'L' || u === 'LITRE' || u === 'LİTRE') {
    return { unitCode: 'LT', unitSetCode: '03' };
  }
  if (u === 'MT' || u === 'M' || u === 'METRE') return { unitCode: 'MT', unitSetCode: '04' };
  if (u === 'PK' || u === 'PAKET' || u === 'PKT') return { unitCode: 'PK', unitSetCode: '05' };
  // Bilinmeyen: hem set hem kod olarak kısaltılmış birim
  const code = u.slice(0, 10);
  return { unitCode: code, unitSetCode: code };
}

export function extractLogoItemBarcode(rec: Record<string, unknown>): string {
  const flat = trunc(field(rec, 'BARCODE', 'barcode', 'BARCODE_CODE'), 100);
  if (flat) return flat;

  for (const unit of nestedItems(field(rec, 'UNITS', 'units'))) {
    const uBar = trunc(field(unit, 'BARCODE', 'barcode'), 100);
    if (uBar) return uBar;
    for (const bc of nestedItems(field(unit, 'BARCODE_LIST', 'barcode_list', 'BarcodeList'))) {
      const b = trunc(field(bc, 'BARCODE', 'barcode', 'BARCODE_CODE'), 100);
      if (b) return b;
    }
  }

  for (const bc of nestedItems(field(rec, 'BARCODE_LIST', 'barcode_list'))) {
    const b = trunc(field(bc, 'BARCODE', 'barcode'), 100);
    if (b) return b;
  }
  return '';
}

export function extractLogoItemUnit(rec: Record<string, unknown>): string {
  const flat = trunc(
    field(rec, 'UNIT', 'unit', 'UNIT_CODE', 'unit_code', 'UNITSET_CODE', 'unitset_code'),
    50,
  );
  if (flat) {
    if (flat === '05' || flat === 'AD') return 'Adet';
    if (flat === '01') return 'KG';
    return flat;
  }
  const units = nestedItems(field(rec, 'UNITS', 'units'));
  if (units[0]) {
    const uc = trunc(field(units[0], 'UNIT_CODE', 'unit_code', 'UNIT', 'CODE'), 50);
    if (uc) return uc === 'AD' ? 'Adet' : uc;
  }
  return 'Adet';
}

/** Satış fiyatı — kök alan veya PRCLIST (PTYPE 2 satış) */
export function extractLogoItemPrice(rec: Record<string, unknown>): number {
  const root = num(field(rec, 'PRICE', 'SELLPRICE', 'price', 'sellprice'), 0);
  if (root > 0) return root;

  const prices = nestedItems(field(rec, 'PRCLIST', 'prclist', 'PRICE_LIST'));
  let sales = 0;
  let any = 0;
  for (const p of prices) {
    const price = num(field(p, 'PRICE', 'price'), 0);
    if (price <= 0) continue;
    if (any <= 0) any = price;
    const ptype = Math.round(num(field(p, 'PTYPE', 'ptype', 'PRICE_TYPE'), 0));
    // Logo: 1 alış, 2 satış (yaygın)
    if (ptype === 2 || ptype === 0) {
      sales = price;
      break;
    }
  }
  return sales > 0 ? sales : any;
}

export function extractLogoItemVat(rec: Record<string, unknown>): number {
  return num(field(rec, 'VAT', 'SELLVAT', 'SELVAT', 'vat', 'sellvat', 'PURCVAT'), 18);
}

/**
 * RetailEX ürün satırı → Logo items restRecord (doğru UNITS / KDV / fiyat).
 */
export function buildLogoItemRestRecord(row: Record<string, unknown>): Record<string, unknown> {
  const code = trunc(row.code, 25);
  const name = trunc(row.name || code || 'Ürün', 51);
  const name2 = trunc(row.name2 || row.name_2, 51);
  const vat = num(row.vat_rate ?? row.vatRate, 0);
  const price = num(row.price, 0);
  const cost = num(row.cost, 0);
  const barcode = trunc(row.barcode, 35);
  const { unitCode, unitSetCode } = mapRetailUnitToLogo(row.unit);
  const groupCode = trunc(row.group_code ?? row.groupCode, 25);
  const auxil = trunc(row.special_code_1 ?? row.specialCode1, 25);
  const spe2 = trunc(row.special_code_2 ?? row.specialCode2, 25);
  const spe3 = trunc(row.special_code_3 ?? row.specialCode3, 25);
  const spe4 = trunc(row.special_code_4 ?? row.specialCode4, 25);
  const spe5 = trunc(row.special_code_5 ?? row.specialCode5, 25);
  const brand = trunc(row.brand, 25);
  const isActive = row.is_active !== false && row.isActive !== false;

  const unitLine: Record<string, unknown> = {
    UNIT_CODE: unitCode,
    USEF_MTRLCLASS: 1,
    USEF_PURCHCLAS: 1,
    USEF_SALESCLAS: 1,
    CONV_FACT1: 1,
    CONV_FACT2: 1,
    MAIN_UNIT: '1',
  };
  if (barcode) {
    unitLine.BARCODE = barcode;
    unitLine.BARCODE_LIST = {
      items: [{ BARCODE: barcode, BARCODETYPE: 0 }],
    };
  }

  const record: Record<string, unknown> = {
    CODE: code,
    NAME: name,
    CARD_TYPE: 1,
    VAT: vat,
    SELLVAT: vat,
    SELVAT: vat,
    PURCVAT: vat,
    RETURNVAT: vat,
    UNITSET_CODE: unitSetCode,
    ACTIVE: isActive ? 0 : 1,
    UNITS: { items: [unitLine] },
  };

  if (name2) record.NAME2 = name2;
  if (groupCode) record.GROUP_CODE = groupCode;
  if (auxil) record.AUXIL_CODE = auxil;
  if (spe2) record.SPECODE2 = spe2;
  if (spe3) record.SPECODE3 = spe3;
  if (spe4) record.SPECODE4 = spe4;
  if (spe5) record.SPECODE5 = spe5;
  if (brand) record.PRODUCER_CODE = brand;

  const priceItems: Record<string, unknown>[] = [];
  if (price > 0) {
    priceItems.push({
      PTYPE: 2,
      PRICE: price,
      CURRENCY: 0,
      PRIORITYORDER: 1,
    });
  }
  if (cost > 0) {
    priceItems.push({
      PTYPE: 1,
      PRICE: cost,
      CURRENCY: 0,
      PRIORITYORDER: 1,
    });
  }
  if (priceItems.length > 0) {
    record.PRCLIST = { items: priceItems };
  }

  return record;
}

/** Logo items kaydı → RetailEX ürün alanları (mapLogoItem için) */
export function mapLogoItemFields(
  rec: Record<string, unknown>,
  firmNr: string,
  refId: number | null,
): Record<string, unknown> {
  const code = trunc(field(rec, 'CODE', 'code'), 100);
  const name =
    trunc(field(rec, 'NAME', 'name', 'DESCRIPTION', 'description'), 255) || 'İsimsiz';
  const name2 = trunc(field(rec, 'NAME2', 'name2'), 255);
  const barcode = extractLogoItemBarcode(rec);
  const vat = extractLogoItemVat(rec);
  const price = extractLogoItemPrice(rec);
  const unit = extractLogoItemUnit(rec);
  const cancelled = num(field(rec, 'CANCELLED', 'cancelled'), 0);
  const activeFlag = num(field(rec, 'ACTIVE', 'active'), 0);
  const isActive = cancelled !== 1 && activeFlag !== 1;
  const stock = num(
    field(rec, 'ONHAND', 'onHand', 'STOCK', 'stock', 'TOTAL_ONHAND', 'REALAMOUNT'),
    0,
  );
  const groupCode = trunc(field(rec, 'GROUP_CODE', 'group_code', 'GROUPCODE'), 50);
  const special1 = trunc(field(rec, 'AUXIL_CODE', 'SPECODE', 'auxil_code'), 50);
  const special2 = trunc(field(rec, 'SPECODE2', 'specode2'), 50);
  const special3 = trunc(field(rec, 'SPECODE3', 'specode3'), 50);
  const special4 = trunc(field(rec, 'SPECODE4', 'specode4'), 50);
  const special5 = trunc(field(rec, 'SPECODE5', 'specode5'), 50);
  const brand = trunc(field(rec, 'PRODUCER_CODE', 'producer_code', 'MARKCODE'), 100);

  return {
    firm_nr: firmNr,
    ref_id: refId,
    code,
    name,
    name2: name2 || null,
    barcode: barcode || `L${code}`.slice(0, 100),
    vat_rate: vat,
    unit,
    price,
    stock,
    is_active: isActive,
    group_code: groupCode || null,
    special_code_1: special1 || null,
    special_code_2: special2 || null,
    special_code_3: special3 || null,
    special_code_4: special4 || null,
    special_code_5: special5 || null,
    brand: brand || null,
  };
}
