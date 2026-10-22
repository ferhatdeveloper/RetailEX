/**
 * Klinik rapor merkezi — mevcut randevu, satış, iade, gider ve müşteri
 * kayıtlarından türetilir. Yeni tablo veya uydurma tutar yok.
 *
 * Hizmet cirosu satış fiyatıdır. Peşinat bilgi kolonudur, ciroya eklenmez.
 * Ürün iadesi eksi yöndedir ve bir kez düşülür. SMM ve stok maliyeti
 * bu raporların geliri değildir.
 */
import type { BeautyAppointment } from '../types/beauty';
import { allocateBeautyVisitDeposits } from './beautyDepositAllocation';
import {
  beautyServiceReportGrandMoney,
  beautyServiceReportLineMoney,
} from './beautyServiceReportLineTotal';
import {
  isBeautyDepositProductLine,
  netBeautyProductSaleRows,
  planBeautyProductReturns,
  type BeautyProductReturnLine,
  type BeautyProductSaleNetInput,
} from './beautyProductSalesNet';
import { isCompletedAppointmentStatus, isDepositSale } from './reportDepositFilter';

export const CLINIC_REPORT_CENTER_TAB = 'clinic_reports';
export const GENERAL_REPORTS_TAB = 'reports';

export const CLINIC_MIRROR_REPORTS = [
  { id: 'institution', labelKey: 'bCrcInstitution' },
  { id: 'income', labelKey: 'bCrcIncome' },
  { id: 'receivable', labelKey: 'bCrcReceivable' },
  { id: 'service', labelKey: 'bCrcService' },
  { id: 'customer', labelKey: 'bCrcCustomer' },
  { id: 'appointment', labelKey: 'bCrcAppointment' },
  { id: 'staff', labelKey: 'bCrcStaff' },
  { id: 'audit', labelKey: 'bCrcAudit' },
] as const;

export type ClinicMirrorReportId = (typeof CLINIC_MIRROR_REPORTS)[number]['id'];

export type ClinicMirrorSale = {
  id: string;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  isDeposit?: boolean | null;
  customerId?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
  items?: Array<{
    id?: string | null;
    itemType?: string | null;
    itemId?: string | null;
    name?: string | null;
    code?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    total?: number | null;
    staffId?: string | null;
  }> | null;
};

export type ClinicMirrorExpense = {
  id: string;
  date: string;
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  storeId?: string | null;
};

export type ClinicMirrorAudit = {
  id: string;
  createdAt?: string | null;
  tableName?: string | null;
  action?: string | null;
  userId?: string | null;
  recordId?: string | null;
  summary?: string | null;
  ip?: string | null;
};

export type ClinicMirrorInput = {
  from: string;
  to: string;
  firmName: string;
  branches: Array<{ id: string; name: string; phone?: string | null }>;
  services: Array<{ id: string; name: string; isActive?: boolean | null }>;
  specialists: Array<{ id: string; name: string; isActive?: boolean | null }>;
  customers: Array<{
    id: string;
    name: string;
    gender?: string | null;
    birthDate?: string | null;
    isActive?: boolean | null;
    createdAt?: string | null;
    appointmentCount?: number | null;
    lastAppointmentDate?: string | null;
  }>;
  appointments: BeautyAppointment[];
  sales: ClinicMirrorSale[];
  returns: BeautyProductReturnLine[];
  expenses: ClinicMirrorExpense[];
  audit: ClinicMirrorAudit[];
};

export type ClinicMoneyMovement = {
  id: string;
  date: string;
  kind: 'income' | 'return' | 'deposit' | 'expense';
  category: string;
  customerName: string;
  description: string;
  method: string;
  /** Gelir artı, iade ve gider eksi. Peşinat bu kolonda 0 kalır. */
  amount: number;
  /** Peşinat bilgi tutarı. Gelir toplamına girmez. */
  depositAmount: number;
};

export type ClinicServiceRow = {
  id: string;
  serviceName: string;
  times: number;
  avgPrice: number;
  revenue: number;
  depositAmount: number;
  lastDate: string;
};

export type ClinicInstitutionRow = {
  id: string;
  branchName: string;
  phone: string;
  staffCount: number;
  newCustomers: number;
  totalCustomers: number;
  appointments: number;
  retention: number | null;
  income: number;
  expense: number;
  net: number;
  margin: number | null;
};

export type ClinicDebtorRow = {
  id: string;
  customerName: string;
  serviceDebt: number;
  productNet: number;
  returnAmount: number;
  depositAmount: number;
  paidRemainder: number;
  openAmount: number;
  chargeDate: string;
  daysOpen: number;
};

export type ClinicCustomerRevenueRow = {
  id: string;
  customerName: string;
  appointments: number;
  lastAppointment: string;
  revenue: number;
  depositAmount: number;
};

export type ClinicAbsentRow = {
  id: string;
  customerName: string;
  lastAppointment: string;
  lostDays: number;
  appointments: number;
};

export type ClinicAgeRow = {
  id: string;
  band: string;
  count: number;
};

export type ClinicAppointmentRow = {
  id: string;
  date: string;
  time: string;
  customerName: string;
  staffName: string;
  serviceName: string;
  duration: number;
  status: string;
};

export type ClinicStaffRow = {
  id: string;
  staffName: string;
  isActive: boolean;
  appointments: number;
  arrived: number;
  noShow: number;
  retention: number | null;
  avgTicket: number | null;
  revenue: number;
  depositAmount: number;
};

export type ClinicAuditRow = {
  id: string;
  createdAt: string;
  userLabel: string;
  tableName: string;
  auditVerb: string;
  summary: string;
  ip: string;
  recordId: string;
};

export type ClinicServiceCatalogRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ClinicSignupRow = {
  id: string;
  date: string;
  count: number;
};

export type ClinicMirrorModel = {
  serviceRevenue: number;
  productGross: number;
  returnAmount: number;
  productNet: number;
  depositAmount: number;
  income: number;
  expense: number;
  net: number;
  margin: number | null;
  openReceivable: number;
  paidRemainder: number;
  collectionRate: number | null;
  overdueAmount: number;
  services: ClinicServiceRow[];
  movements: ClinicMoneyMovement[];
  debtors: ClinicDebtorRow[];
  institutions: ClinicInstitutionRow[];
  topCustomers: ClinicCustomerRevenueRow[];
  absentCustomers: ClinicAbsentRow[];
  ageBands: ClinicAgeRow[];
  appointments: ClinicAppointmentRow[];
  staff: ClinicStaffRow[];
  audit: ClinicAuditRow[];
  activeServices: number;
  givenServices: number;
  topServiceName: string;
  customerTotal: number;
  customerNew: number;
  customerActive: number;
  customerPassive: number;
  genderFemale: number;
  genderMale: number;
  genderOther: number;
  appointmentTotal: number;
  appointmentArrived: number;
  appointmentNoShow: number;
  appointmentCancelled: number;
  retention: number | null;
  avgDuration: number | null;
  activeStaff: number;
  branchCount: number;
  serviceCatalog: ClinicServiceCatalogRow[];
  customerSignups: ClinicSignupRow[];
};

type ProductDraft = BeautyProductSaleNetInput & {
  saleId: string;
  date: string;
  customerId: string;
  customerName: string;
  staffId: string;
  staffName: string;
  paymentMethod: string;
  branchId: string;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ymd(value: unknown): string {
  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function inRange(day: string, from: string, to: string): boolean {
  return Boolean(day) && day >= from && day <= to;
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00`);
  const b = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function ratioPct(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function appointmentDay(row: BeautyAppointment): string {
  return ymd(row.date ?? row.appointment_date);
}

function appointmentTime(row: BeautyAppointment): string {
  return String(row.time ?? row.appointment_time ?? '').trim().slice(0, 5);
}

function customerIdOf(row: BeautyAppointment): string {
  return String(row.client_id ?? row.customer_id ?? '').trim();
}

function staffIdOf(row: BeautyAppointment): string {
  return String(row.staff_id ?? row.specialist_id ?? '').trim();
}

function staffNameOf(row: BeautyAppointment): string {
  return String(row.specialist_name ?? row.staff_name ?? '').trim();
}

function saleIsDeposit(sale: ClinicMirrorSale): boolean {
  if (sale.isDeposit === true) return true;
  return isDepositSale({ notes: sale.notes, isDeposit: false });
}

function ageBand(birth: string, on: string): string | null {
  const day = ymd(birth);
  if (!day || !on) return null;
  const years = daysBetween(day, on) / 365.25;
  if (!Number.isFinite(years) || years < 0 || years > 120) return null;
  if (years < 18) return '0-17';
  if (years < 25) return '18-24';
  if (years < 35) return '25-34';
  if (years < 45) return '35-44';
  if (years < 55) return '45-54';
  return '55+';
}

function lineAmount(item: { quantity?: number | null; unitPrice?: number | null; total?: number | null }): number {
  const total = num(item.total);
  if (total !== 0) return total;
  return num(item.quantity) * num(item.unitPrice);
}

export function buildClinicMirrorReports(input: ClinicMirrorInput): ClinicMirrorModel {
  const from = ymd(input.from);
  const to = ymd(input.to) || from;
  const appointments = (input.appointments || []).filter((row) => inRange(appointmentDay(row), from, to));
  const completed = appointments.filter((row) => isCompletedAppointmentStatus(row.status));
  const depositById = allocateBeautyVisitDeposits(completed);

  const serviceLines = completed.map((row) => {
    const share = depositById.get(String(row.id ?? '').trim()) ?? num(row.deposit_amount);
    const money = beautyServiceReportLineMoney(row.total_price, share);
    return { row, money };
  });
  const serviceGrand = beautyServiceReportGrandMoney(serviceLines.map((line) => line.money));

  const staffNameById = new Map<string, string>();
  for (const person of input.specialists || []) {
    const id = String(person.id ?? '').trim();
    const name = String(person.name ?? '').trim();
    if (id && name) staffNameById.set(id, name);
  }
  for (const row of appointments) {
    const id = staffIdOf(row);
    const name = staffNameOf(row);
    if (id && name && !staffNameById.has(id)) staffNameById.set(id, name);
  }

  const branchByAppointment = new Map<string, string>();
  for (const row of appointments) {
    branchByAppointment.set(String(row.id ?? ''), String(row.branch_id ?? '').trim());
  }

  const productDrafts: ProductDraft[] = [];
  for (const sale of input.sales || []) {
    if (saleIsDeposit(sale)) continue;
    if (String(sale.paymentStatus ?? '').trim().toLowerCase() !== 'paid') continue;
    const date = ymd(sale.createdAt);
    if (!inRange(date, from, to)) continue;
    const linked = String(sale.notes ?? '').match(/rex_appt:([0-9a-f-]{36})/i);
    const branchId = linked ? branchByAppointment.get(linked[1]) || branchByAppointment.get(linked[1].toLowerCase()) || '' : '';
    for (const item of sale.items || []) {
      const itemType = String(item.itemType ?? '');
      if (itemType.toLowerCase() !== 'product' && itemType.toLowerCase() !== 'malzeme') continue;
      if (isBeautyDepositProductLine(itemType, item.name, item.code || item.itemId)) continue;
      const productId = String(item.itemId || item.code || item.name || '').trim();
      const staffId = String(item.staffId ?? '').trim();
      productDrafts.push({
        saleId: String(sale.id || ''),
        date,
        customerId: String(sale.customerId ?? '').trim(),
        customerName: String(sale.customerName ?? '').trim() || '—',
        staffId,
        staffName: (staffId && staffNameById.get(staffId)) || '—',
        paymentMethod: String(sale.paymentMethod ?? '').trim() || '—',
        branchId,
        productId,
        productName: String(item.name ?? '').trim() || productId || '—',
        productCode: String(item.code ?? '').trim(),
        productBarcode: '',
        categoryName: '—',
        subCategoryName: '—',
        quantity: num(item.quantity),
        total: lineAmount(item),
      });
    }
  }

  const productGross = round2(productDrafts.reduce((sum, row) => sum + num(row.total), 0));
  const returnsInRange = (input.returns || []).filter((row) => inRange(ymd(row.date), from, to));
  const returnPlans = planBeautyProductReturns(productDrafts, returnsInRange);
  const netProducts = netBeautyProductSaleRows(productDrafts, returnsInRange);
  const returnAmount = round2(returnPlans.reduce((sum, row) => sum + num(row.total), 0));
  const productNet = round2(netProducts.reduce((sum, row) => sum + num(row.total), 0));
  const serviceRevenue = round2(serviceGrand.lineTotal);
  const depositAmount = round2(serviceGrand.depositAmount);
  const income = round2(serviceRevenue + productNet);

  const expenses = (input.expenses || []).filter((row) => inRange(ymd(row.date), from, to));
  const expense = round2(expenses.reduce((sum, row) => sum + Math.abs(num(row.amount)), 0));
  const net = round2(income - expense);
  const margin = ratioPct(net, income);

  const movements: ClinicMoneyMovement[] = [];
  for (const line of serviceLines) {
    const row = line.row;
    const name = String(row.service_name ?? '').trim() || '—';
    movements.push({
      id: `svc-${row.id}`,
      date: appointmentDay(row),
      kind: 'income',
      category: name,
      customerName: String(row.customer_name ?? '').trim() || '—',
      description: name,
      method: '—',
      amount: round2(line.money.lineTotal),
      depositAmount: 0,
    });
    if (Math.abs(line.money.depositAmount) > 0.004) {
      movements.push({
        id: `dep-${row.id}`,
        date: appointmentDay(row),
        kind: 'deposit',
        category: name,
        customerName: String(row.customer_name ?? '').trim() || '—',
        description: name,
        method: '—',
        amount: 0,
        depositAmount: round2(line.money.depositAmount),
      });
    }
  }
  productDrafts.forEach((row, index) => {
    movements.push({
      id: `prd-${row.saleId}-${index}`,
      date: row.date,
      kind: 'income',
      category: row.productName,
      customerName: row.customerName,
      description: row.productName,
      method: row.paymentMethod,
      amount: round2(row.total),
      depositAmount: 0,
    });
  });
  returnPlans.forEach((row) => {
    movements.push({
      id: `ret-${row.sourceLineId}`,
      date: ymd(row.date),
      kind: 'return',
      category: row.productName,
      customerName: row.customerName || '—',
      description: row.productName,
      method: row.paymentMethod || '—',
      amount: round2(row.total),
      depositAmount: 0,
    });
  });
  for (const row of expenses) {
    movements.push({
      id: `exp-${row.id}`,
      date: ymd(row.date),
      kind: 'expense',
      category: String(row.category ?? '').trim() || '—',
      customerName: '—',
      description: String(row.description ?? '').trim() || '—',
      method: String(row.paymentMethod ?? '').trim() || '—',
      amount: round2(-Math.abs(num(row.amount))),
      depositAmount: 0,
    });
  }
  movements.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const serviceMap = new Map<string, ClinicServiceRow>();
  for (const line of serviceLines) {
    const name = String(line.row.service_name ?? '').trim() || '—';
    const current = serviceMap.get(name) || {
      id: `service-${name}`,
      serviceName: name,
      times: 0,
      avgPrice: 0,
      revenue: 0,
      depositAmount: 0,
      lastDate: '',
    };
    current.times += 1;
    current.revenue = round2(current.revenue + line.money.lineTotal);
    current.depositAmount = round2(current.depositAmount + line.money.depositAmount);
    const day = appointmentDay(line.row);
    if (day > current.lastDate) current.lastDate = day;
    serviceMap.set(name, current);
  }
  const services = [...serviceMap.values()]
    .map((row) => ({ ...row, avgPrice: row.times > 0 ? round2(row.revenue / row.times) : 0 }))
    .sort((a, b) => b.revenue - a.revenue || a.serviceName.localeCompare(b.serviceName, 'tr'));

  const byCustomer = new Map<string, ClinicDebtorRow>();
  const ensureCustomer = (id: string, name: string): ClinicDebtorRow => {
    const key = id || `name:${name}`;
    const found = byCustomer.get(key);
    if (found) {
      if (found.customerName === '—' && name) found.customerName = name;
      return found;
    }
    const created: ClinicDebtorRow = {
      id: key,
      customerName: name || '—',
      serviceDebt: 0,
      productNet: 0,
      returnAmount: 0,
      depositAmount: 0,
      paidRemainder: 0,
      openAmount: 0,
      chargeDate: '',
      daysOpen: 0,
    };
    byCustomer.set(key, created);
    return created;
  };
  for (const line of serviceLines) {
    const id = customerIdOf(line.row);
    const bucket = ensureCustomer(id, String(line.row.customer_name ?? '').trim());
    bucket.serviceDebt = round2(bucket.serviceDebt + line.money.lineTotal);
    bucket.depositAmount = round2(bucket.depositAmount + line.money.depositAmount);
    bucket.paidRemainder = round2(bucket.paidRemainder + num(line.row.remainder_paid_amount));
    const day = appointmentDay(line.row);
    if (day > bucket.chargeDate) bucket.chargeDate = day;
  }
  netProducts.forEach((row, index) => {
    const draft = productDrafts[index];
    if (!draft) return;
    const bucket = ensureCustomer(draft.customerId, draft.customerName);
    const gross = num(draft.total);
    const netValue = num(row.total);
    bucket.productNet = round2(bucket.productNet + netValue);
    bucket.returnAmount = round2(bucket.returnAmount + (netValue - gross));
    if (draft.date > bucket.chargeDate) bucket.chargeDate = draft.date;
  });
  const debtors = [...byCustomer.values()].map((row) => {
    const openAmount = round2(row.serviceDebt - row.depositAmount - row.paidRemainder);
    const daysOpen = row.chargeDate ? Math.max(0, daysBetween(row.chargeDate, to)) : 0;
    return { ...row, openAmount, daysOpen };
  });
  const openReceivable = round2(debtors.reduce((sum, row) => sum + row.openAmount, 0));
  const paidRemainder = round2(debtors.reduce((sum, row) => sum + row.paidRemainder, 0));
  const collected = round2(paidRemainder + depositAmount + productNet);
  const collectionRate = ratioPct(collected, income);
  const overdueAmount = round2(
    debtors.filter((row) => row.daysOpen > 0).reduce((sum, row) => sum + row.openAmount, 0),
  );

  const branchList = (input.branches || []).filter((row) => String(row.name || row.id || '').trim());
  const single = branchList.length <= 1;
  const firmLabel = String(input.firmName || '').trim() || '—';
  const branches = branchList.length > 0 ? branchList : [{ id: '', name: firmLabel, phone: '' }];

  const customers = input.customers || [];
  const newCustomers = customers.filter((row) => inRange(ymd(row.createdAt), from, to)).length;
  const institutions: ClinicInstitutionRow[] = branches.map((branch) => {
    const id = String(branch.id ?? '').trim();
    const rows = appointments.filter((row) => {
      const branchId = String(row.branch_id ?? '').trim();
      if (id && branchId === id) return true;
      if (!branchId && (single || !id)) return true;
      return false;
    });
    const done = rows.filter((row) => isCompletedAppointmentStatus(row.status));
    const noShow = rows.filter((row) => String(row.status ?? '').toLowerCase() === 'no_show').length;
    const arrived = done.length;
    const staffIds = new Set<string>();
    for (const row of rows) {
      const staffId = staffIdOf(row) || staffNameOf(row);
      if (staffId) staffIds.add(staffId);
    }
    if (single) {
      for (const person of input.specialists || []) {
        if (person.isActive === false) continue;
        const key = String(person.id || person.name || '').trim();
        if (key) staffIds.add(key);
      }
    }
    const seenCustomers = new Set(rows.map((row) => customerIdOf(row) || String(row.customer_name ?? '').trim()).filter(Boolean));
    const branchProductNet = round2(
      netProducts.reduce((sum, row, index) => {
        const draft = productDrafts[index];
        if (!draft) return sum;
        const productBranch = draft.branchId;
        if (id && productBranch === id) return sum + num(row.total);
        if (!productBranch && (single || !id)) return sum + num(row.total);
        return sum;
      }, 0),
    );
    const branchIncome = round2(
      done.reduce((sum, row) => {
        const share = depositById.get(String(row.id ?? '').trim()) ?? num(row.deposit_amount);
        return sum + beautyServiceReportLineMoney(row.total_price, share).lineTotal;
      }, 0) + branchProductNet,
    );
    const branchExpense = round2(
      expenses.reduce((sum, row) => {
        const storeId = String(row.storeId ?? '').trim();
        if (id && storeId === id) return sum + Math.abs(num(row.amount));
        if (!storeId && single) return sum + Math.abs(num(row.amount));
        return sum;
      }, 0),
    );
    const branchNet = round2(branchIncome - branchExpense);
    return {
      id: id || 'firm',
      branchName: String(branch.name || firmLabel),
      phone: String(branch.phone ?? '').trim(),
      staffCount: staffIds.size,
      newCustomers: single ? newCustomers : 0,
      totalCustomers: single ? customers.length : seenCustomers.size,
      appointments: rows.length,
      retention: ratioPct(arrived, arrived + noShow),
      income: branchIncome,
      expense: branchExpense,
      net: branchNet,
      margin: ratioPct(branchNet, branchIncome),
    };
  });

  const revenueByCustomer = new Map<string, ClinicCustomerRevenueRow>();
  for (const line of serviceLines) {
    const id = customerIdOf(line.row) || `name:${String(line.row.customer_name ?? '').trim()}`;
    const current = revenueByCustomer.get(id) || {
      id,
      customerName: String(line.row.customer_name ?? '').trim() || '—',
      appointments: 0,
      lastAppointment: '',
      revenue: 0,
      depositAmount: 0,
    };
    current.appointments += 1;
    current.revenue = round2(current.revenue + line.money.lineTotal);
    current.depositAmount = round2(current.depositAmount + line.money.depositAmount);
    const day = appointmentDay(line.row);
    if (day > current.lastAppointment) current.lastAppointment = day;
    revenueByCustomer.set(id, current);
  }
  netProducts.forEach((row, index) => {
    const draft = productDrafts[index];
    if (!draft) return;
    const id = draft.customerId || `name:${draft.customerName}`;
    const current = revenueByCustomer.get(id) || {
      id,
      customerName: draft.customerName,
      appointments: 0,
      lastAppointment: '',
      revenue: 0,
      depositAmount: 0,
    };
    current.revenue = round2(current.revenue + num(row.total));
    if (draft.date > current.lastAppointment) current.lastAppointment = draft.date;
    revenueByCustomer.set(id, current);
  });
  const topCustomers = [...revenueByCustomer.values()]
    .filter((row) => row.revenue > 0.004)
    .sort((a, b) => b.revenue - a.revenue || a.customerName.localeCompare(b.customerName, 'tr'));

  const absentCustomers = customers
    .filter((row) => {
      const last = ymd(row.lastAppointmentDate);
      return Boolean(last) && last < from && num(row.appointmentCount) > 0;
    })
    .map((row) => ({
      id: String(row.id),
      customerName: row.name || '—',
      lastAppointment: ymd(row.lastAppointmentDate),
      lostDays: daysBetween(ymd(row.lastAppointmentDate), to),
      appointments: num(row.appointmentCount),
    }))
    .sort((a, b) => b.lostDays - a.lostDays);

  const ageCounts = new Map<string, number>();
  for (const row of customers) {
    const band = ageBand(String(row.birthDate ?? ''), to);
    if (!band) continue;
    ageCounts.set(band, (ageCounts.get(band) || 0) + 1);
  }
  const ageBands = ['0-17', '18-24', '25-34', '35-44', '45-54', '55+']
    .filter((band) => (ageCounts.get(band) || 0) > 0)
    .map((band) => ({ id: band, band, count: ageCounts.get(band) || 0 }));

  const appointmentRows: ClinicAppointmentRow[] = appointments
    .map((row) => ({
      id: String(row.id ?? ''),
      date: appointmentDay(row),
      time: appointmentTime(row),
      customerName: String(row.customer_name ?? '').trim() || '—',
      staffName: staffNameOf(row) || '—',
      serviceName: String(row.service_name ?? '').trim() || '—',
      duration: num(row.duration),
      status: String(row.status ?? '').trim().toLowerCase() || 'scheduled',
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const arrived = appointmentRows.filter((row) => row.status === 'completed' || row.status === 'done').length;
  const noShow = appointmentRows.filter((row) => row.status === 'no_show').length;
  const cancelled = appointmentRows.filter((row) => row.status === 'cancelled' || row.status === 'canceled').length;
  const durationTotal = appointmentRows.reduce((sum, row) => sum + row.duration, 0);
  const avgDuration = appointmentRows.length > 0 ? round2(durationTotal / appointmentRows.length) : null;

  const staffMap = new Map<string, ClinicStaffRow>();
  const ensureStaff = (id: string, name: string, isActive = true): ClinicStaffRow => {
    const key = id || `name:${name}`;
    const found = staffMap.get(key);
    if (found) return found;
    const created: ClinicStaffRow = {
      id: key,
      staffName: name || '—',
      isActive,
      appointments: 0,
      arrived: 0,
      noShow: 0,
      retention: null,
      avgTicket: null,
      revenue: 0,
      depositAmount: 0,
    };
    staffMap.set(key, created);
    return created;
  };
  for (const person of input.specialists || []) {
    ensureStaff(String(person.id ?? ''), String(person.name ?? '').trim() || '—', person.isActive !== false);
  }
  for (const row of appointments) {
    const bucket = ensureStaff(staffIdOf(row), staffNameOf(row) || '—', true);
    bucket.appointments += 1;
    const status = String(row.status ?? '').toLowerCase();
    if (status === 'no_show') bucket.noShow += 1;
  }
  for (const line of serviceLines) {
    const bucket = ensureStaff(staffIdOf(line.row), staffNameOf(line.row) || '—', true);
    bucket.arrived += 1;
    bucket.revenue = round2(bucket.revenue + line.money.lineTotal);
    bucket.depositAmount = round2(bucket.depositAmount + line.money.depositAmount);
  }
  netProducts.forEach((row, index) => {
    const draft = productDrafts[index];
    if (!draft) return;
    const bucket = ensureStaff(draft.staffId, draft.staffName, true);
    bucket.revenue = round2(bucket.revenue + num(row.total));
  });
  const staff = [...staffMap.values()]
    .map((row) => ({
      ...row,
      retention: ratioPct(row.arrived, row.arrived + row.noShow),
      avgTicket: row.arrived > 0 ? round2(row.revenue / row.arrived) : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.staffName.localeCompare(b.staffName, 'tr'));

  const audit = (input.audit || [])
    .filter((row) => inRange(ymd(row.createdAt), from, to))
    .map((row) => ({
      id: String(row.id),
      createdAt: String(row.createdAt ?? ''),
      userLabel: String(row.userId ?? '').trim() || '—',
      tableName: String(row.tableName ?? '').trim() || '—',
      auditVerb: String(row.action ?? '').trim() || '—',
      summary: String(row.summary ?? row.action ?? '').trim() || '—',
      ip: String(row.ip ?? '').trim(),
      recordId: String(row.recordId ?? '').trim(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const genderOf = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();
  const topServiceName = services[0]?.serviceName || '';
  const serviceCatalog: ClinicServiceCatalogRow[] = (input.services || []).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? '').trim() || '—',
    isActive: row.isActive !== false,
  }));
  const signupCounts = new Map<string, number>();
  for (const row of customers) {
    const day = ymd(row.createdAt);
    if (!inRange(day, from, to)) continue;
    signupCounts.set(day, (signupCounts.get(day) || 0) + 1);
  }
  const customerSignups: ClinicSignupRow[] = [...signupCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ id: date, date, count }));

  return {
    serviceRevenue,
    productGross,
    returnAmount,
    productNet,
    depositAmount,
    income,
    expense,
    net,
    margin,
    openReceivable,
    paidRemainder,
    collectionRate,
    overdueAmount,
    services,
    movements,
    debtors: debtors.filter((row) => Math.abs(row.serviceDebt) > 0.004 || Math.abs(row.productNet) > 0.004 || Math.abs(row.openAmount) > 0.004),
    institutions,
    topCustomers,
    absentCustomers,
    ageBands,
    appointments: appointmentRows,
    staff,
    audit,
    activeServices: (input.services || []).filter((row) => row.isActive !== false).length,
    givenServices: serviceLines.length,
    topServiceName,
    customerTotal: customers.length,
    customerNew: newCustomers,
    customerActive: customers.filter((row) => row.isActive !== false).length,
    customerPassive: customers.filter((row) => row.isActive === false).length,
    genderFemale: customers.filter((row) => genderOf(row.gender) === 'female').length,
    genderMale: customers.filter((row) => genderOf(row.gender) === 'male').length,
    genderOther: customers.filter((row) => genderOf(row.gender) === 'other').length,
    appointmentTotal: appointmentRows.length,
    appointmentArrived: arrived,
    appointmentNoShow: noShow,
    appointmentCancelled: cancelled,
    retention: ratioPct(arrived, arrived + noShow),
    avgDuration,
    activeStaff: (input.specialists || []).filter((row) => row.isActive !== false).length,
    branchCount: branches.length,
    serviceCatalog,
    customerSignups,
  };
}
