/**
 * İade raporu satırları.
 * Fatura türü yalnızca trcode ve belge türünden (fiche_type) gelir.
 * Cari adından tür tahmin edilmez.
 * Tutar net_amount olarak kalır; işaret çevrilmez.
 * Alış iadesi kasaya giriş, satış iadesi kasadan çıkış bu listede yeniden yazılmaz.
 * İndirim açık cariye çevrilmez. Rezervasyon peşinatı listeye girmez.
 */
import { classifyProductHistoryType } from './lastPurchaseCostSql';
import { isDepositSale } from './reportDepositFilter';

export type ReturnReportKind = 'purchase_return' | 'sales_return';

export interface ReturnReportMappedRow {
  id: string;
  ficheNo: string;
  date: string;
  accountName: string;
  paymentMethod: string;
  /** Belge net tutarı. İşaret ve büyüklük kaynak satırdaki gibi kalır. */
  netAmount: number;
  cashier: string;
  notes: string;
  /** trcode / fiche_type sınıflaması. */
  returnKind: ReturnReportKind;
  trcode: number;
  ficheType: string;
}

function asRecord(row: object): Record<string, unknown> {
  return row as Record<string, unknown>;
}

function ficheTypeOf(row: Record<string, unknown>): string {
  const raw = String(row.fiche_type ?? row.ficheType ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'i') return 'return_invoice';
  return raw;
}

function trcodeOf(row: Record<string, unknown>): number {
  const n = Number(row.trcode ?? row.invoice_type ?? row.invoiceType ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Alış iadesi (trcode 6) veya satış iadesi (trcode 2/3, belirsiz iade belgesi). */
export function classifyReturnReportKind(row: {
  trcode?: unknown;
  invoice_type?: unknown;
  invoiceType?: unknown;
  fiche_type?: unknown;
  ficheType?: unknown;
}): ReturnReportKind | null {
  const source = asRecord(row);
  const kind = classifyProductHistoryType(ficheTypeOf(source), trcodeOf(source));
  if (kind === 'purchase_return' || kind === 'sales_return') return kind;
  return null;
}

export function isReturnReportDepositRow(row: {
  is_deposit?: unknown;
  isDeposit?: unknown;
  notes?: unknown;
}): boolean {
  const flag = row.is_deposit ?? row.isDeposit;
  if (flag === true || flag === 'true' || flag === 't' || flag === 1 || flag === '1') return true;
  return isDepositSale({
    isDeposit: false,
    notes: String(row.notes ?? ''),
  });
}

function isCancelledReturnRow(row: Record<string, unknown>): boolean {
  const flag = row.is_cancelled ?? row.isCancelled;
  if (flag === true || flag === 'true') return true;
  const st = String(row.status ?? '')
    .trim()
    .toLowerCase();
  return (
    st === 'cancelled' ||
    st === 'canceled' ||
    st === 'iptal' ||
    st === 'void' ||
    st === 'deleted' ||
    st === 'silindi'
  );
}

/**
 * Görünen fatura adı. Rapor başlığı değildir.
 * Alış iadesi → alış iade faturası metni, satış iadesi → satış iade faturası metni.
 */
export function returnReportInvoiceTypeText(
  kind: ReturnReportKind,
  labels: { purchaseReturn: string; salesReturn: string },
): string {
  return kind === 'purchase_return' ? labels.purchaseReturn : labels.salesReturn;
}

export function mapReturnReportRow(row: object): ReturnReportMappedRow | null {
  const source = asRecord(row);
  if (isCancelledReturnRow(source)) return null;
  if (isReturnReportDepositRow(source)) return null;
  const returnKind = classifyReturnReportKind(source);
  if (!returnKind) return null;
  const netRaw = source.net_amount ?? source.netAmount ?? 0;
  const netAmount = Number(netRaw);
  return {
    id: String(source.id ?? ''),
    ficheNo: String(source.fiche_no ?? source.ficheNo ?? ''),
    date: String(source.date ?? '').slice(0, 10),
    accountName: String(
      source.account_name ?? source.accountName ?? source.customer_name ?? source.customerName ?? '',
    ),
    paymentMethod: String(source.payment_method ?? source.paymentMethod ?? ''),
    netAmount: Number.isFinite(netAmount) ? netAmount : 0,
    cashier: String(source.cashier ?? ''),
    notes: String(source.notes ?? ''),
    returnKind,
    trcode: trcodeOf(source),
    ficheType: ficheTypeOf(source),
  };
}

export function mapReturnReportRows(rows: readonly object[]): ReturnReportMappedRow[] {
  const out: ReturnReportMappedRow[] = [];
  for (const row of rows) {
    const mapped = mapReturnReportRow(row);
    if (mapped) out.push(mapped);
  }
  return out;
}
