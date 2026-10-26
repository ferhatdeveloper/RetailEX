/**
 * Prim raporu — uzman kalem dökümü.
 *
 * Ciro kalem tutarıdır. Prim ciroya eklenmez.
 * Peşinat / depozito fişi ciro ve prim değildir; satır döküme girmez.
 * İade bir kez eksi yazılır. Tutar zaten eksiyse ikinci işaret 0 üretmez.
 */
import { isBeautyDepositProductLine } from './beautyProductSalesNet';

const EPS = 1e-9;

const RETURN_TYPES = new Set(['return', 'iade', 'refund', 'refunded']);
const RETURN_STATUS = new Set(['refunded', 'return', 'iade']);

export type CommissionReportLineKind = 'service' | 'product';

export type CommissionReportLine = {
  line_id: string;
  specialist_id: string;
  date_ymd: string;
  customer_or_fiche: string;
  item_name: string;
  kind: CommissionReportLineKind;
  revenue: number;
  commission_rate: number;
  commission_amount: number;
};

export type CommissionReportLineSource = {
  lineId?: string | null;
  specialistId?: string | null;
  dateYmd?: string | null;
  customerName?: string | null;
  ficheNo?: string | null;
  itemName?: string | null;
  itemType?: string | null;
  revenue?: number | null;
  commissionAmount?: number | null;
  isDeposit?: boolean | null;
  paymentStatus?: string | null;
};

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function trKey(value: string): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

export function isCommissionDepositFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const s = value.trim().toLocaleLowerCase('tr-TR');
    return s === 'true' || s === 't' || s === '1';
  }
  return false;
}

/** Peşinat fişi ve peşinat adlı kalem ciroya yazılmaz. */
export function isCommissionDepositLine(input: {
  isDeposit?: boolean | null;
  itemType?: string | null;
  itemName?: string | null;
}): boolean {
  if (input.isDeposit === true) return true;
  return isBeautyDepositProductLine(input.itemType, input.itemName, '');
}

/** Satış iadesi. Eksi ciro zaten iadedir; artı iade ayrıca işaretlenir. */
export function isCommissionReturnLine(input: {
  itemType?: string | null;
  itemName?: string | null;
  paymentStatus?: string | null;
  revenue?: number | null;
}): boolean {
  const kind = trKey(String(input.itemType ?? ''));
  const status = trKey(String(input.paymentStatus ?? ''));
  if (RETURN_TYPES.has(kind) || RETURN_STATUS.has(status)) return true;
  const name = trKey(String(input.itemName ?? ''));
  if (name === 'iade' || name.startsWith('iade ') || name.startsWith('iade-') || name.startsWith('iade:')) {
    return true;
  }
  return finite(input.revenue) < -EPS;
}

export function commissionLineKind(itemType: string | null | undefined): CommissionReportLineKind | null {
  const kind = trKey(String(itemType ?? ''));
  if (kind === 'product' || kind === 'ürün' || kind === 'urun' || kind === 'malzeme') return 'product';
  if (kind === 'service' || kind === 'hizmet') return 'service';
  return null;
}

function rateOf(commission: number, revenue: number): number {
  if (Math.abs(revenue) <= EPS) return 0;
  return Number(((commission / revenue) * 100).toFixed(2));
}

/**
 * Prim tutarı ciroya eklenmez.
 * İade: tutar ve prim bir kez eksi. Girdi zaten eksiyse sonuç 0 olmaz.
 */
export function signCommissionLineAmounts(
  isReturn: boolean,
  revenue: number,
  commission: number,
): { revenue: number; commission: number; rate: number } {
  const rev = finite(revenue);
  const com = finite(commission);
  if (!isReturn) {
    return { revenue: rev, commission: com, rate: rateOf(com, rev) };
  }
  const signedRevenue = Math.abs(rev) <= EPS ? 0 : -Math.abs(rev);
  const signedCommission = Math.abs(com) <= EPS ? 0 : -Math.abs(com);
  return {
    revenue: signedRevenue,
    commission: signedCommission,
    rate: rateOf(signedCommission, signedRevenue),
  };
}

/** Müşteri adı varsa o, yoksa fiş no. Peşinat tutarı bu etikete yazılmaz. */
export function commissionCustomerOrFiche(customerName: unknown, ficheNo: unknown): string {
  const customer = String(customerName ?? '').trim();
  const fiche = String(ficheNo ?? '').trim();
  if (customer) return customer;
  if (fiche) return fiche;
  return '—';
}

/** Kaynak satırı döküm satırına çevirir. Peşinat ve türü belirsiz kalem elenir. */
export function mapCommissionReportLine(source: CommissionReportLineSource): CommissionReportLine | null {
  if (
    isCommissionDepositLine({
      isDeposit: isCommissionDepositFlag(source.isDeposit),
      itemType: source.itemType,
      itemName: source.itemName,
    })
  ) {
    return null;
  }
  const kind = commissionLineKind(source.itemType);
  if (!kind) return null;
  const signed = signCommissionLineAmounts(
    isCommissionReturnLine(source),
    finite(source.revenue),
    finite(source.commissionAmount),
  );
  const itemName = String(source.itemName ?? '').trim() || '—';
  return {
    line_id: String(source.lineId ?? '').trim(),
    specialist_id: String(source.specialistId ?? '').trim(),
    date_ymd: String(source.dateYmd ?? '').trim().slice(0, 10),
    customer_or_fiche: commissionCustomerOrFiche(source.customerName, source.ficheNo),
    item_name: itemName,
    kind,
    revenue: signed.revenue,
    commission_rate: signed.rate,
    commission_amount: signed.commission,
  };
}

/**
 * Tarihsel satırın günü ve uzmanı.
 * Dönen kalemler kaynaktaki nesnelerdir; prim tutarı yeniden yazılmaz.
 */
export function filterCommissionLinesForHistory(
  lines: readonly CommissionReportLine[],
  dateYmd: string,
  specialistId: string,
): CommissionReportLine[] {
  const day = String(dateYmd ?? '').trim().slice(0, 10);
  const id = String(specialistId ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !id) return [];
  return lines.filter((line) => {
    const lineDay = String(line.date_ymd ?? '').trim().slice(0, 10);
    const lineId = String(line.specialist_id ?? '').trim();
    return lineDay === day && lineId === id;
  });
}
