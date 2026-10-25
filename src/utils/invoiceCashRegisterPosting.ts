/**
 * Fatura nakit/kart kasası ve iade işaretleri.
 *
 * Seçilen kasa yazılır. Açık cari kasaya düşmez.
 * Satış iadesi seçilen kasadan bir kez çıkar (işaret −1). Müşteriye alacak bırakmaz.
 * Alış iadesi seçilen kasaya bir kez girer (işaret +1). Ciro değildir.
 * Veresiye iade kasaya yazılmaz; cari borç düşer.
 * İndirim ve rezervasyon peşinatı iade tutarına eklenmez.
 */
import { isInvoicePurchaseSide, isServiceInvoiceType } from './invoiceLineType';
import {
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesPaidNow,
  paymentMethodImpliesSupplierDebt,
} from './paymentMethodUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InvoiceCashKind =
  | 'sale'
  | 'purchase'
  | 'service_given'
  | 'service_received'
  | 'sale_return'
  | 'purchase_return'
  | 'other';

export interface InvoiceCashPaymentRow {
  method?: string | null;
  amount?: number | null;
  cashRegisterId?: string | null;
  cash_register_id?: string | null;
}

export interface InvoiceCashInput {
  category?: string | null;
  trcode?: number | null;
  name?: string | null;
  paymentMethod?: string | null;
  payments?: InvoiceCashPaymentRow[] | null;
  /** Fatura neti. İndirim düşülmüş tutar. */
  netAmount?: number | null;
  discount?: number | null;
  /** Belge peşinatı. İade tutarına eklenmez. */
  depositAmount?: number | null;
  isDeposit?: boolean | null;
  cashRegisterId?: string | null;
  headerCashRegisterId?: string | null;
  /** Bu fiş için kasaya daha önce yazılan mutlak tutar. */
  alreadyPosted?: number | null;
  ficheNo?: string | null;
}

export interface InvoiceCashLinePlan {
  registerId: string;
  amount: number;
  sign: -1 | 1;
  transactionType: string;
  paymentMethod: string;
  descriptionPrefix: string;
}

export interface InvoiceCashPostPlan {
  kind: InvoiceCashKind;
  lines: InvoiceCashLinePlan[];
  /** Kasaya yazılacak mutlak tutar (kasası belli satırların toplamı). */
  cashAmount: number;
  /** Nakit/kart payı, peşinat ve indirim hariç, daha önce yazılan düşülmüş. Kasa kimliği gerekmez. */
  refundableCash: number;
  customerBalanceDelta: number;
  supplierBalanceDelta: number;
  /** Satış neti artı, satış iadesi eksi. Alış ve alış iadesi ciro değildir. */
  revenueDelta: number;
  netCashDelta: number;
  descriptionPrefix: string;
}

export interface CashDrawerState {
  registers: Record<string, number>;
  customerBalance: number;
  supplierBalance: number;
  revenue: number;
  netCash: number;
  postedByFiche: Record<string, number>;
  lines: Array<{ ficheNo: string; registerId: string; amount: number; sign: number; transactionType: string }>;
}

function money(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function absMoney(value: unknown): number {
  return money(Math.abs(Number(value) || 0));
}

export function isUuidCashRegisterId(value: unknown): boolean {
  return UUID_RE.test(String(value || '').trim());
}

/** Rezervasyon / peşinat satırı iade nakdine eklenmez. */
export function isDepositLikePaymentMethod(raw: unknown): boolean {
  const folded = String(raw ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!folded) return false;
  return (
    folded.includes('avans')
    || folded.includes('rezervasyon')
    || folded.includes('depozito')
    || folded.includes('peşinat')
    || folded.includes('pesinat')
  );
}

export function classifyInvoiceCashKind(input: {
  category?: string | null;
  trcode?: number | null;
  name?: string | null;
}): InvoiceCashKind {
  const trcode = Number(input.trcode || 0);
  const category = String(input.category || '').trim();
  const folded = category.toLocaleLowerCase('tr-TR');
  const purchase = isInvoicePurchaseSide({
    category,
    code: trcode,
    name: String(input.name || ''),
  });
  const isReturn = folded === 'iade' || folded === 'return' || trcode === 2 || trcode === 3 || trcode === 6;
  if (isReturn && (purchase || trcode === 6)) return 'purchase_return';
  if (isReturn) return 'sale_return';
  const service = isServiceInvoiceType({ category, code: trcode, name: String(input.name || '') });
  if (service && purchase) return 'service_received';
  if (service) return 'service_given';
  if (purchase || folded === 'alis' || folded === 'alış' || folded === 'purchase') return 'purchase';
  if (
    folded === 'satis' || folded === 'satış' || folded === 'sale' || folded === 'sales'
    || trcode === 7 || trcode === 8
  ) {
    return 'sale';
  }
  return 'other';
}

export function isSalesReturnCashVoucher(type: unknown, description?: unknown): boolean {
  const tip = String(type || '').trim().toUpperCase();
  if (tip === 'SATIS_IADE_FATURASI') return true;
  const blob = String(description || '').toLocaleLowerCase('tr-TR');
  return blob.includes('satış iade') || blob.includes('satis iade') || blob.includes('nakit iade');
}

export function isPurchaseReturnCashVoucher(type: unknown, description?: unknown): boolean {
  const tip = String(type || '').trim().toUpperCase();
  if (tip === 'ALIS_IADE_FATURASI') return true;
  const blob = String(description || '').toLocaleLowerCase('tr-TR');
  return blob.includes('alış iade') || blob.includes('alis iade');
}

function descriptionPrefix(kind: InvoiceCashKind): string {
  switch (kind) {
    case 'purchase':
      return 'Alış faturası';
    case 'service_received':
      return 'Alınan hizmet faturası';
    case 'service_given':
      return 'Verilen hizmet faturası';
    case 'sale_return':
      return 'Satış iade';
    case 'purchase_return':
      return 'Alış iade';
    case 'sale':
      return 'Satış faturası';
    default:
      return '';
  }
}

function cashTransaction(kind: InvoiceCashKind): { sign: -1 | 1; transactionType: string } | null {
  switch (kind) {
    case 'sale':
    case 'service_given':
      return { sign: 1, transactionType: 'KASA_GIRIS' };
    case 'purchase':
    case 'service_received':
      return { sign: -1, transactionType: 'KASA_CIKIS' };
    case 'sale_return':
      return { sign: -1, transactionType: 'SATIS_IADE_FATURASI' };
    case 'purchase_return':
      return { sign: 1, transactionType: 'ALIS_IADE_FATURASI' };
    default:
      return null;
  }
}

function rowRegister(row: InvoiceCashPaymentRow | null | undefined, fallback: string | null): string | null {
  const raw = row?.cashRegisterId || row?.cash_register_id || fallback;
  const id = String(raw || '').trim();
  return isUuidCashRegisterId(id) ? id : null;
}

interface Split {
  /** Kasaya yazılacak nakit+kart. Neti aşmaz. Peşinat yok. */
  registerAmount: number;
  /** Açık cari / veresiye payı. Neti aşmaz. */
  openAmount: number;
  rows: Array<{ method: string; amount: number; registerId: string | null }>;
}

function splitPayments(input: InvoiceCashInput, net: number): Split {
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const fallbackRegister = isUuidCashRegisterId(input.cashRegisterId)
    ? String(input.cashRegisterId).trim()
    : (isUuidCashRegisterId(input.headerCashRegisterId) ? String(input.headerCashRegisterId).trim() : null);

  if (payments.length > 0) {
    const rows: Split['rows'] = [];
    let registerAmount = 0;
    let openAmount = 0;
    for (const row of payments) {
      const method = String(row?.method || '').trim();
      if (!method || isDepositLikePaymentMethod(method)) continue;
      const amount = absMoney(row?.amount);
      if (paymentMethodImpliesCustomerDebt(method)) {
        openAmount += amount > 0 ? amount : 0;
        continue;
      }
      if (!paymentMethodImpliesPaidNow(method)) continue;
      const registerId = rowRegister(row, fallbackRegister);
      const part = amount > 0 ? amount : 0;
      registerAmount += part;
      rows.push({ method, amount: part, registerId });
    }
    registerAmount = Math.min(net, money(registerAmount));
    openAmount = Math.min(net, money(openAmount));
    if (registerAmount + openAmount > net + 0.004) {
      openAmount = money(Math.max(0, net - registerAmount));
    }
    return { registerAmount, openAmount, rows };
  }

  const method = String(input.paymentMethod || '').trim();
  if (!method || isDepositLikePaymentMethod(method) || input.isDeposit === true) {
    const purchaseOpen = classifyInvoiceCashKind(input) === 'purchase'
      || classifyInvoiceCashKind(input) === 'purchase_return'
      || classifyInvoiceCashKind(input) === 'service_received';
    if (purchaseOpen && paymentMethodImpliesSupplierDebt(method)) {
      return { registerAmount: 0, openAmount: net, rows: [] };
    }
    return { registerAmount: 0, openAmount: 0, rows: [] };
  }
  if (paymentMethodImpliesCustomerDebt(method) || !paymentMethodImpliesPaidNow(method)) {
    const open = paymentMethodImpliesCustomerDebt(method) || paymentMethodImpliesSupplierDebt(method);
    return { registerAmount: 0, openAmount: open ? net : 0, rows: [] };
  }
  return {
    registerAmount: net,
    openAmount: 0,
    rows: [{ method, amount: net, registerId: fallbackRegister }],
  };
}

/**
 * İade faturası saklanan cari deltası.
 * Nakit/kart iade alacak bırakmaz (0).
 * Veresiye satış iadesi müşteri borcunu düşürür.
 * Veresiye alış iadesi tedarikçi borcunu düşürür.
 * İade değilse null — çağıran mevcut satış/alış kuralını kullanır.
 */
export function invoiceReturnStoredBalanceDelta(input: InvoiceCashInput): { customer: number; supplier: number } | null {
  const kind = classifyInvoiceCashKind(input);
  if (kind !== 'sale_return' && kind !== 'purchase_return') return null;
  if (input.isDeposit === true) return { customer: 0, supplier: 0 };
  const net = absMoney(input.netAmount);
  const split = splitPayments(input, net);
  if (kind === 'sale_return') {
    return { customer: split.openAmount > 0 ? -split.openAmount : 0, supplier: 0 };
  }
  return { customer: 0, supplier: split.openAmount > 0 ? -split.openAmount : 0 };
}

export function planInvoiceCashPosting(input: InvoiceCashInput): InvoiceCashPostPlan {
  const kind = classifyInvoiceCashKind(input);
  const prefix = descriptionPrefix(kind);
  const net = absMoney(input.netAmount);
  const empty: InvoiceCashPostPlan = {
    kind,
    lines: [],
    cashAmount: 0,
    refundableCash: 0,
    customerBalanceDelta: 0,
    supplierBalanceDelta: 0,
    revenueDelta: 0,
    netCashDelta: 0,
    descriptionPrefix: prefix,
  };
  if (!(net > 0) || kind === 'other' || input.isDeposit === true) return empty;

  const movement = cashTransaction(kind);
  const split = splitPayments(input, net);
  const returnDelta = invoiceReturnStoredBalanceDelta(input);
  const customerBalanceDelta = returnDelta
    ? returnDelta.customer
    : (kind === 'sale' || kind === 'service_given' ? split.openAmount : 0);
  const supplierBalanceDelta = returnDelta
    ? returnDelta.supplier
    : (kind === 'purchase' || kind === 'service_received' ? split.openAmount : 0);

  const revenueDelta = kind === 'sale' || kind === 'service_given'
    ? net
    : (kind === 'sale_return' ? -net : 0);

  const already = absMoney(input.alreadyPosted);
  let room = money(Math.max(0, split.registerAmount - already));
  if (!(room > 0.004) || !movement) {
    return {
      ...empty,
      customerBalanceDelta,
      supplierBalanceDelta,
      revenueDelta,
      netCashDelta: 0,
      refundableCash: 0,
    };
  }

  const lines: InvoiceCashLinePlan[] = [];
  const usable = split.rows.filter((row) => row.amount > 0.004 && row.registerId);
  if (usable.length > 0) {
    let left = room;
    for (const row of usable) {
      if (!(left > 0.004)) break;
      const amount = money(Math.min(left, row.amount));
      if (!(amount > 0.004) || !row.registerId) continue;
      lines.push({
        registerId: row.registerId,
        amount,
        sign: movement.sign,
        transactionType: movement.transactionType,
        paymentMethod: row.method,
        descriptionPrefix: prefix,
      });
      left = money(left - amount);
    }
  } else {
    const registerId = isUuidCashRegisterId(input.cashRegisterId)
      ? String(input.cashRegisterId).trim()
      : (isUuidCashRegisterId(input.headerCashRegisterId) ? String(input.headerCashRegisterId).trim() : '');
    if (registerId) {
      lines.push({
        registerId,
        amount: room,
        sign: movement.sign,
        transactionType: movement.transactionType,
        paymentMethod: String(input.paymentMethod || 'NAKIT'),
        descriptionPrefix: prefix,
      });
    }
  }

  const cashAmount = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const signedCash = money(lines.reduce((sum, line) => sum + line.amount * line.sign, 0));
  return {
    kind,
    lines,
    cashAmount,
    refundableCash: room,
    customerBalanceDelta,
    supplierBalanceDelta,
    revenueDelta,
    netCashDelta: signedCash,
    descriptionPrefix: prefix,
  };
}

export function emptyCashDrawerState(): CashDrawerState {
  return {
    registers: {},
    customerBalance: 0,
    supplierBalance: 0,
    revenue: 0,
    netCash: 0,
    postedByFiche: {},
    lines: [],
  };
}

/** Seçilen kasaya bir kez yazar. Aynı fiş ikinci kez bakiyeyi oynatmaz. */
export function applyInvoiceToCashDrawers(state: CashDrawerState, input: InvoiceCashInput): CashDrawerState {
  const ficheNo = String(input.ficheNo || '').trim();
  const already = ficheNo ? absMoney(state.postedByFiche[ficheNo]) : absMoney(input.alreadyPosted);
  const plan = planInvoiceCashPosting({ ...input, alreadyPosted: already });
  const next: CashDrawerState = {
    registers: { ...state.registers },
    customerBalance: money(state.customerBalance + plan.customerBalanceDelta),
    supplierBalance: money(state.supplierBalance + plan.supplierBalanceDelta),
    revenue: money(state.revenue + plan.revenueDelta),
    netCash: money(state.netCash + plan.netCashDelta),
    postedByFiche: { ...state.postedByFiche },
    lines: state.lines.slice(),
  };
  // Cari etkisi fiş başına bir kez. İkinci çağrı kasayı da cariyi de tekrarlamaz.
  if (ficheNo && Object.prototype.hasOwnProperty.call(state.postedByFiche, ficheNo)) {
    next.customerBalance = state.customerBalance;
    next.supplierBalance = state.supplierBalance;
    next.revenue = state.revenue;
    next.netCash = state.netCash;
  }
  let posted = 0;
  for (const line of plan.lines) {
    next.registers[line.registerId] = money((next.registers[line.registerId] || 0) + line.amount * line.sign);
    next.lines.push({
      ficheNo,
      registerId: line.registerId,
      amount: line.amount,
      sign: line.sign,
      transactionType: line.transactionType,
    });
    posted += line.amount;
  }
  if (ficheNo) {
    next.postedByFiche[ficheNo] = money(already + posted);
  }
  return next;
}

/** Silinen iade: kasa satırı ve kasa etkisi kalkar. Cari, ilk kaydın tersine döner. */
export function voidInvoiceCash(state: CashDrawerState, input: InvoiceCashInput): CashDrawerState {
  const ficheNo = String(input.ficheNo || '').trim();
  if (!ficheNo) return state;
  const original = planInvoiceCashPosting({ ...input, alreadyPosted: 0 });
  const next: CashDrawerState = {
    registers: { ...state.registers },
    customerBalance: money(state.customerBalance - original.customerBalanceDelta),
    supplierBalance: money(state.supplierBalance - original.supplierBalanceDelta),
    revenue: money(state.revenue - original.revenueDelta),
    netCash: state.netCash,
    postedByFiche: { ...state.postedByFiche },
    lines: [],
  };
  let reversed = 0;
  for (const line of state.lines) {
    if (line.ficheNo === ficheNo) {
      next.registers[line.registerId] = money((next.registers[line.registerId] || 0) - line.amount * line.sign);
      reversed = money(reversed + line.amount * line.sign);
      continue;
    }
    next.lines.push(line);
  }
  next.netCash = money(state.netCash - reversed);
  delete next.postedByFiche[ficheNo];
  return next;
}

export interface BoundReturnCash {
  amount: number;
  sign: -1 | 1 | 0;
  transactionType: 'SATIS_IADE_FATURASI' | 'ALIS_IADE_FATURASI' | '';
  /** already: kasa satırı tutarı doldu. open: veresiye, kasaya yazılmaz. */
  blocked: 'none' | 'already' | 'open';
}

/**
 * Menüden bağlanan iade tutarı. Fatura neti esastır.
 * Peşinat ve indirim eklenmez. Kısmi ödemede nakit payı aşılmaz.
 * İkinci satır için kalan tutar ayrıca üretilmez; dolu fiş `already` döner.
 */
/** Fatura kaydından kasa planı girdisi. Menü tutarı bunu kullanır. */
export function invoiceRecordToCashInput(
  record: {
    invoice_category?: string | null;
    invoice_type?: number | null;
    trcode?: number | null;
    invoice_type_name?: string | null;
    fiche_type?: string | null;
    payment_method?: string | null;
    total_amount?: number | null;
    discount?: number | null;
    cash_register_id?: string | null;
    header_fields?: unknown;
    invoice_no?: string | null;
  },
  alreadyPosted = 0,
): InvoiceCashInput {
  const headerFields = record.header_fields;
  const header = headerFields && typeof headerFields === 'object' && !Array.isArray(headerFields)
    ? headerFields as Record<string, unknown>
    : {};
  const payments = Array.isArray(header.payments) ? header.payments as InvoiceCashInput['payments'] : [];
  return {
    category: record.invoice_category,
    trcode: Number(record.trcode ?? record.invoice_type ?? 0),
    name: String(record.invoice_type_name || record.fiche_type || ''),
    paymentMethod: record.payment_method,
    payments,
    netAmount: Number(record.total_amount || 0),
    discount: Number(record.discount || 0),
    cashRegisterId: record.cash_register_id,
    headerCashRegisterId: typeof header.cash_register_id === 'string' ? header.cash_register_id : null,
    isDeposit: header.is_deposit === true,
    alreadyPosted,
    ficheNo: String(record.invoice_no || '').trim(),
  };
}

export function boundReturnCashAmount(input: InvoiceCashInput): BoundReturnCash {
  const kind = classifyInvoiceCashKind(input);
  const transactionType = kind === 'sale_return'
    ? 'SATIS_IADE_FATURASI'
    : (kind === 'purchase_return' ? 'ALIS_IADE_FATURASI' : '');
  const sign: -1 | 1 | 0 = kind === 'sale_return' ? -1 : (kind === 'purchase_return' ? 1 : 0);
  if (!transactionType) {
    return { amount: 0, sign: 0, transactionType: '', blocked: 'none' };
  }
  const plan = planInvoiceCashPosting(input);
  const amount = plan.refundableCash > 0.004 ? plan.refundableCash : plan.cashAmount;
  if (amount > 0.004) {
    return { amount, sign, transactionType, blocked: 'none' };
  }
  if (absMoney(input.alreadyPosted) > 0.004) {
    return { amount: 0, sign, transactionType, blocked: 'already' };
  }
  return { amount: 0, sign, transactionType, blocked: 'open' };
}
