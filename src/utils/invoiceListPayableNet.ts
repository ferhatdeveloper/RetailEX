/**
 * Fatura listesi Toplam kolonu ve üst bant özeti.
 *
 * Muhasebe: net = satır netleri − dip indirim.
 * Satır indirimi satır netine (ve kayıtlı net_amount'a) zaten girmiştir; ikinci kez düşülmez.
 * Dip indirim bir kez düşülür. Kayıtlı ödenecek tutar (total / total_amount) bu net ise aynen kullanılır.
 * total_net başlıkta dip öncesi tutardır (satır brütü veya satır netleri toplamı).
 * İndirim kanıtı yoksa tutar düşülmez — indirimsiz fiş ve kanıtsız düşük net_amount olduğu gibi kalır.
 *
 * Liste ekranı (perakende, toptan, alış, iade, hizmet) aynı başlık alanlarını okur.
 * Kasa fişi ve fatura formunun iç satır / dip net hesabı bu fonksiyona bağlı değildir.
 */
import {
  isInvoiceDepositLineType,
  isInvoiceReservationLineType,
} from './invoiceLineType';

const EPS = 0.02;

export type InvoiceListPayableLine = {
  netAmount?: unknown;
  net_amount?: unknown;
  total?: unknown;
  type?: unknown;
  item_type?: unknown;
  lineType?: unknown;
};

export type InvoiceListPayableSource = {
  total_net?: unknown;
  total_gross?: unknown;
  total_amount?: unknown;
  total?: unknown;
  subtotal?: unknown;
  discount?: unknown;
  total_discount?: unknown;
  tax?: unknown;
  total_vat?: unknown;
  currency_rate?: unknown;
  header_fields?: unknown;
  items?: ReadonlyArray<InvoiceListPayableLine> | null;
};

function finite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function closeMoney(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(EPS, Math.abs(b) * 0.0001);
}

function positiveMagnitude(value: number | null): number | null {
  if (value == null || Math.abs(value) <= EPS) return null;
  return value;
}

function headerRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Dip indirim tutarı, fiş dövizinden defter tutarına (kur 1 ise aynı). Yüzde, tutar yoksa tabana uygulanır. */
function footerDiscountLedger(inv: InvoiceListPayableSource, base: number | null): number {
  const fields = headerRecord(inv.header_fields);
  if (!fields) return 0;
  const rateRaw = finite(inv.currency_rate);
  const rate = rateRaw != null && rateRaw > 0 ? rateRaw : 1;
  const amount = finite(fields.footerDiscountAmount);
  if (amount != null && Math.abs(amount) > EPS) {
    return roundMoney(Math.abs(amount) * rate);
  }
  const pct = finite(fields.footerDiscountPercent);
  if (pct != null && pct > EPS && pct <= 100 && base != null && Math.abs(base) > EPS) {
    return roundMoney(Math.abs(base) * (pct / 100));
  }
  return 0;
}

function lineNetOf(line: InvoiceListPayableLine): number | null {
  return finite(line.netAmount) ?? finite(line.net_amount) ?? finite(line.total);
}

/**
 * Satır netleri toplamı. Rezervasyon hariç. Depozito satırı netten düşer (form ile aynı).
 * Boş dizi: başlık alanlarına bırak (liste sayfası kalem yüklemez).
 */
function sumLineNets(items: InvoiceListPayableSource['items']): number | null {
  if (!items || items.length === 0) return null;
  let nets = 0;
  let deposit = 0;
  let any = false;
  for (const line of items) {
    const kind = String(line.type ?? line.item_type ?? line.lineType ?? '');
    const net = lineNetOf(line);
    if (net == null) continue;
    if (isInvoiceReservationLineType(kind)) continue;
    any = true;
    if (isInvoiceDepositLineType(kind)) {
      deposit += net;
      continue;
    }
    nets += net;
  }
  if (!any) return null;
  return roundMoney(Math.max(0, nets - deposit));
}

function evidencedDiscount(discount: number, footer: number): number {
  if (discount > EPS) return discount;
  if (footer > EPS) return footer;
  return 0;
}

/**
 * Liste Toplam hücresi.
 * Kalem varsa: satır netleri − dip indirim (satır indirimi tekrar düşülmez).
 * Kalem yoksa: başlık. total_net dip öncesi, total / total_amount kayıtlı nettir.
 */
export function invoiceListPayableNet(inv: InvoiceListPayableSource): number {
  const discount = Math.max(0, finite(inv.discount) ?? finite(inv.total_discount) ?? 0);
  const vat = finite(inv.tax) ?? finite(inv.total_vat) ?? 0;
  const preRaw = finite(inv.total_net) ?? finite(inv.total_gross) ?? finite(inv.subtotal);
  const pre = positiveMagnitude(preRaw);
  const stored = positiveMagnitude(finite(inv.total) ?? finite(inv.total_amount));
  const footer = footerDiscountLedger(inv, pre);
  const lineNets = sumLineNets(inv.items);

  if (lineNets != null) {
    if (footer > EPS) {
      const afterFooter = roundMoney(Math.max(0, lineNets - footer));
      if (stored != null && closeMoney(stored, afterFooter)) return roundMoney(stored);
      if (stored != null && stored + EPS < lineNets && stored + EPS >= afterFooter) {
        return roundMoney(stored);
      }
      return afterFooter;
    }
    if (stored != null && discount > EPS) {
      const gap = lineNets - stored;
      if (gap > EPS && gap <= discount + EPS) return roundMoney(stored);
    }
    return lineNets;
  }

  const evidenced = evidencedDiscount(discount, footer);
  if (evidenced <= EPS) {
    if (pre != null) return roundMoney(pre);
    return roundMoney(stored ?? 0);
  }

  const expected = pre != null ? roundMoney(Math.max(0, pre - evidenced + vat)) : null;

  if (stored != null && expected != null && closeMoney(stored, expected)) {
    return roundMoney(stored);
  }

  if (stored != null && pre != null && stored < pre - EPS) {
    const gap = pre - stored;
    if (gap <= evidenced + Math.abs(vat) + EPS) return roundMoney(stored);
    return expected ?? roundMoney(stored);
  }

  // pre ile kayıtlı net aynıysa indirim bu tutara zaten işlemiş veya hiç ayrılmamış olabilir.
  // Kanıt yalnızca "indirim alanı dolu" ise ikinci kez düşülmez.
  if (stored != null && pre != null && closeMoney(stored, pre)) {
    return roundMoney(stored);
  }

  if (stored != null && pre == null) return roundMoney(stored);
  if (expected != null) return expected;
  return roundMoney(stored ?? pre ?? 0);
}

/** Üst bant ve dip toplam: listedeki faturaların netlerinin toplamı. Yeni tutar üretilmez. */
export function sumInvoiceListPayableNet(rows: ReadonlyArray<InvoiceListPayableSource>): number {
  let sum = 0;
  for (const row of rows) sum += invoiceListPayableNet(row);
  return roundMoney(sum);
}
