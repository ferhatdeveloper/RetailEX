import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Loader2,
  RefreshCw,
  Scissors,
  Shield,
  Users,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { beautyService } from '../../../services/beautyService';
import { expenseAPI } from '../../../services/api/expenses';
import { ReportDateRangePresets } from '../../shared/ReportDateRangePresets';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { ReportKpiStrip, type ReportKpiItem } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { defaultReportDateRange, type ReportDateRangeValue } from '../../../utils/reportDatePresets';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import {
  CLINIC_MIRROR_REPORTS,
  buildClinicMirrorReports,
  type ClinicAbsentRow,
  type ClinicAppointmentRow,
  type ClinicAuditRow,
  type ClinicCustomerRevenueRow,
  type ClinicDebtorRow,
  type ClinicInstitutionRow,
  type ClinicMirrorModel,
  type ClinicMirrorReportId,
  type ClinicMoneyMovement,
  type ClinicServiceRow,
  type ClinicStaffRow,
} from '../../../utils/clinicReportCenter';
import type { BeautyAuditLogEntry, BeautySale } from '../../../types/beauty';

type Props = {
  onOpenAllReports: () => void;
};

const FETCH_MS = 10_000;

const REPORT_COPY: Record<ClinicMirrorReportId, { title: string; lead: string; eyebrow: string }> = {
  institution: { title: 'bCrcInstitutionTitle', lead: 'bCrcInstitutionLead', eyebrow: 'bCrcInstitution' },
  income: { title: 'bCrcIncomeTitle', lead: 'bCrcIncomeLead', eyebrow: 'bCrcIncome' },
  receivable: { title: 'bCrcReceivableTitle', lead: 'bCrcReceivableLead', eyebrow: 'bCrcReceivable' },
  service: { title: 'bCrcServiceTitle', lead: 'bCrcServiceLead', eyebrow: 'bCrcService' },
  customer: { title: 'bCrcCustomerTitle', lead: 'bCrcCustomerLead', eyebrow: 'bCrcCustomer' },
  appointment: { title: 'bCrcAppointmentTitle', lead: 'bCrcAppointmentLead', eyebrow: 'bCrcAppointment' },
  staff: { title: 'bCrcStaffTitle', lead: 'bCrcStaffLead', eyebrow: 'bCrcStaff' },
  audit: { title: 'bCrcAuditTitle', lead: 'bCrcAuditLead', eyebrow: 'bCrcAudit' },
};

const REPORT_ICON = {
  institution: Building2,
  income: Wallet,
  receivable: ClipboardList,
  service: Scissors,
  customer: Users,
  appointment: CalendarClock,
  staff: Users,
  audit: Shield,
} as const;

function money(value: number): string {
  return formatMoneyAmount(value, { minFrac: 0, maxFrac: 2 });
}

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `%${value.toFixed(1)}`;
}

function hasAmount(value: number): boolean {
  return Math.abs(value) > 0.004;
}

function fold(value: string): string {
  return value.toLocaleLowerCase('tr-TR');
}

function hit(query: string, parts: Array<string | number | null | undefined>): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return parts.some((part) => fold(String(part ?? '')).includes(needle));
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function auditBits(entry: BeautyAuditLogEntry): { summary: string; ip: string } {
  const payload = entry.payload_json;
  if (!payload || typeof payload !== 'object') {
    return { summary: String(entry.action ?? ''), ip: '' };
  }
  const record = payload as Record<string, unknown>;
  const ip = String(record.ip ?? record.ip_address ?? record.ipAddress ?? '').trim();
  const bits = Object.entries(record)
    .filter(([key, value]) => !/ip/i.test(key) && (typeof value === 'string' || typeof value === 'number'))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`);
  return { summary: bits.join(' · ') || String(entry.action ?? ''), ip };
}

function MetricBars({
  rows,
  format,
  showZero = false,
}: {
  rows: Array<{ id: string; label: string; value: number }>;
  format: (value: number) => string;
  showZero?: boolean;
}) {
  const visible = showZero ? rows : rows.filter((row) => hasAmount(row.value));
  if (visible.length === 0) return null;
  const peak = Math.max(...visible.map((row) => Math.abs(row.value)), 1);
  return (
    <ul className="flex w-full flex-col gap-2.5">
      {visible.slice(0, 8).map((row) => {
        const width = Math.max(row.value === 0 ? 0 : 6, Math.round((Math.abs(row.value) / peak) * 100));
        return (
          <li key={row.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-slate-700">{row.label}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{format(row.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({
  title,
  hint,
  empty,
  emptyHint,
  children,
}: {
  title: string;
  hint?: string;
  empty: string;
  emptyHint?: string;
  children: ReactNode | null;
}) {
  return (
    <section className="flex min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {hint ? <span className="text-right text-[11px] text-slate-400">{hint}</span> : null}
      </div>
      <div className="flex flex-1 items-center justify-center">
        {children ?? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-slate-600">{empty}</p>
            {emptyHint ? <p className="mt-1 text-xs text-slate-400">{emptyHint}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}

function tone(kind: 'green' | 'red' | 'blue' | 'purple' | 'amber' | 'slate'): string {
  if (kind === 'green') return 'border-emerald-100 bg-emerald-50';
  if (kind === 'red') return 'border-rose-100 bg-rose-50';
  if (kind === 'blue') return 'border-blue-100 bg-blue-50';
  if (kind === 'purple') return 'border-violet-100 bg-violet-50';
  if (kind === 'amber') return 'border-amber-100 bg-amber-50';
  return 'border-slate-200 bg-white';
}

export function ClinicReportCenter({ onOpenAllReports }: Props) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const firmName = String(selectedFirm?.name ?? '').trim();
  const [range, setRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [reportId, setReportId] = useState<ClinicMirrorReportId>('institution');
  const [model, setModel] = useState<ClinicMirrorModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [auditRow, setAuditRow] = useState<ClinicAuditRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [periodOnly, setPeriodOnly] = useState(true);
  const [kindFilter, setKindFilter] = useState('all');
  const [receivableTab, setReceivableTab] = useState<'overdue' | 'soon' | 'unplanned' | 'top'>('overdue');
  const [customerTab, setCustomerTab] = useState<'vip' | 'absent'>('vip');
  const [statusFilter, setStatusFilter] = useState('all');
  const [auditUser, setAuditUser] = useState('all');
  const [auditTable, setAuditTable] = useState('all');
  const [auditAction, setAuditAction] = useState('all');
  const [auditRecord, setAuditRecord] = useState('');
  const [auditIp, setAuditIp] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const copy = REPORT_COPY[reportId];
  const Icon = REPORT_ICON[reportId];

  const fallback = useMemo(
    () =>
      buildClinicMirrorReports({
        from: range.from,
        to: range.to,
        firmName,
        branches: [],
        services: [],
        specialists: [],
        customers: [],
        appointments: [],
        sales: [],
        returns: [],
        expenses: [],
        audit: [],
      }),
    [firmName, range.from, range.to],
  );
  const view = model ?? fallback;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    const token = ++requestRef.current;
    setLoading(true);
    setErrorCode(null);
    setModel(null);
    void (async () => {
      const settled = await Promise.allSettled([
        withDeadline(beautyService.getAppointmentsInRange(range.from, range.to), FETCH_MS),
        withDeadline(beautyService.getSalesWithItemsForExportRange(range.from, range.to), FETCH_MS),
        withDeadline(beautyService.getProductSalesReturnLines(range.from, range.to), FETCH_MS),
        withDeadline(beautyService.getCustomers(), FETCH_MS),
        withDeadline(beautyService.getSpecialists(), FETCH_MS),
        withDeadline(beautyService.getServices(), FETCH_MS),
        withDeadline(beautyService.getBranches(), FETCH_MS),
        withDeadline(beautyService.listAuditLog(500), FETCH_MS),
        withDeadline(expenseAPI.getAll({ startDate: range.from, endDate: range.to }), FETCH_MS),
      ]);
      if (token !== requestRef.current) return;
      const take = <T,>(index: number, empty: T): T => {
        const result = settled[index];
        return result?.status === 'fulfilled' ? (result.value as T) : empty;
      };
      const failed = settled.filter((item) => item.status === 'rejected').length;
      try {
        const sales = take<BeautySale[]>(1, []);
        const audit = take<BeautyAuditLogEntry[]>(7, []);
        const next = buildClinicMirrorReports({
          from: range.from,
          to: range.to,
          firmName,
          branches: take<Array<{ id?: string; name?: string; phone?: string | null }>>(6, []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            phone: row.phone,
          })),
          services: take<Array<{ id?: string; name?: string; is_active?: boolean | null }>>(5, []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            isActive: row.is_active,
          })),
          specialists: take<Array<{ id?: string; name?: string; is_active?: boolean | null }>>(4, []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            isActive: row.is_active,
          })),
          customers: take<Array<{
            id?: string;
            name?: string;
            gender?: string | null;
            birth_date?: string | null;
            is_active?: boolean | null;
            created_at?: string | null;
            appointment_count?: number | null;
            last_appointment_date?: string | null;
          }>>(3, []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            gender: row.gender,
            birthDate: row.birth_date,
            isActive: row.is_active,
            createdAt: row.created_at,
            appointmentCount: row.appointment_count,
            lastAppointmentDate: row.last_appointment_date,
          })),
          appointments: take(0, []),
          sales: sales.map((sale) => ({
            id: String(sale.id ?? ''),
            paymentStatus: sale.payment_status,
            paymentMethod: sale.payment_method,
            notes: sale.notes,
            isDeposit: sale.is_deposit === true,
            customerId: sale.customer_id,
            customerName: sale.customer_name,
            createdAt: sale.created_at,
            items: (sale.items || []).map((item) => ({
              id: item.id,
              itemType: item.item_type,
              itemId: item.item_id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              total: item.total,
              staffId: item.staff_id,
            })),
          })),
          returns: take(2, []),
          expenses: take<Array<{
            id?: string;
            expense_date?: string;
            category?: string | null;
            description?: string | null;
            amount?: number | null;
            payment_method?: string | null;
            store_id?: string | null;
          }>>(8, []).map((row) => ({
            id: String(row.id ?? ''),
            date: String(row.expense_date ?? ''),
            category: row.category,
            description: row.description,
            amount: Number(row.amount),
            paymentMethod: row.payment_method,
            storeId: row.store_id,
          })),
          audit: audit.map((row) => {
            const bits = auditBits(row);
            return {
              id: String(row.id ?? ''),
              createdAt: row.created_at,
              tableName: row.table_name,
              action: row.action,
              userId: row.user_id,
              recordId: row.record_id,
              summary: bits.summary,
              ip: bits.ip,
            };
          }),
        });
        setModel(next);
        if (failed > 0) setErrorCode(failed === settled.length ? 'failed' : 'partial');
      } catch (err) {
        setErrorCode(err instanceof Error ? err.message : String(err));
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    })();
    return () => {
      requestRef.current += 1;
    };
  }, [range.from, range.to, firmName, reloadNonce]);

  const kindLabel = (kind: ClinicMoneyMovement['kind']) => {
    if (kind === 'income') return tm('bCrcKindIncome');
    if (kind === 'return') return tm('bCrcKindReturn');
    if (kind === 'deposit') return tm('bCrcKindDeposit');
    return tm('bCrcKindExpense');
  };

  const statusLabel = (status: string) => {
    const key: Record<string, string> = {
      scheduled: 'bCrcStateNew',
      confirmed: 'bCrcStateConfirmed',
      pre_paid: 'bCrcStatePrepaid',
      in_progress: 'bCrcStateProgress',
      completed: 'bCrcStateArrived',
      done: 'bCrcStateArrived',
      no_show: 'bCrcStateNoShow',
      cancelled: 'bCrcStateCancelled',
      canceled: 'bCrcStateCancelled',
    };
    const labelKey = key[status];
    return labelKey ? tm(labelKey) : status || '—';
  };

  const errorText =
    errorCode === 'failed' ? tm('bCrcLoadFailed') : errorCode === 'partial' ? tm('bCrcLoadPartial') : errorCode;

  const institutionColumns = useMemo<ReportColumnTableCol<ClinicInstitutionRow>[]>(
    () => [
      {
        key: 'branchName',
        header: tm('bCrcColBranch'),
        size: 200,
        cell: (row) => (
          <div>
            <div className="font-semibold text-slate-800">{row.branchName}</div>
            {row.phone ? <div className="text-[11px] text-slate-400">{row.phone}</div> : null}
          </div>
        ),
      },
      { key: 'staffCount', header: tm('bCrcColStaff'), type: 'number', footerSum: true },
      {
        key: 'totalCustomers',
        header: tm('bCrcColCustomers'),
        size: 160,
        cell: (row) => `${row.newCustomers} ${tm('bCrcNewWord')} / ${row.totalCustomers} ${tm('bCrcTotalWord')}`,
      },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'retention', header: tm('bCrcColRetention'), cell: (row) => pct(row.retention) },
      {
        key: 'income',
        header: tm('bCrcColIncome'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => <span className="font-semibold text-emerald-600">{money(row.income)}</span>,
      },
      {
        key: 'expense',
        header: tm('bCrcColExpense'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => money(row.expense),
      },
      {
        key: 'net',
        header: tm('bCrcColNet'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => <span className={row.net < 0 ? 'text-rose-600' : 'text-emerald-600'}>{money(row.net)}</span>,
      },
      { key: 'margin', header: tm('bCrcColMargin'), cell: (row) => pct(row.margin) },
    ],
    [tm],
  );

  const movementColumns = useMemo<ReportColumnTableCol<ClinicMoneyMovement>[]>(
    () => [
      { key: 'date', header: tm('bCrcColDate'), type: 'date', size: 120 },
      { key: 'kindLabel', header: tm('bCrcColType'), size: 110, cell: (row) => kindLabel(row.kind) },
      {
        key: 'category',
        header: tm('bCrcColCategoryCustomer'),
        size: 220,
        cell: (row) => (
          <div>
            <div className="font-semibold text-slate-800">{row.category}</div>
            <div className="text-[11px] text-slate-400">{row.customerName}</div>
          </div>
        ),
      },
      { key: 'description', header: tm('bCrcColDescription'), size: 200 },
      { key: 'method', header: tm('bCrcColMethod'), size: 120 },
      {
        key: 'amount',
        header: tm('bCrcColAmount'),
        type: 'currency',
        footerSum: true,
        footerGetValue: (row) => row.amount,
        footerFormat: (n) => money(n),
        cell: (row) => (
          <span className={row.amount < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-slate-800'}>
            {money(row.amount)}
          </span>
        ),
      },
    ],
    [tm],
  );

  const debtorColumns = useMemo<ReportColumnTableCol<ClinicDebtorRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 180 },
      { key: 'chargeDate', header: tm('bCrcColDue'), type: 'date' },
      { key: 'daysOpen', header: tm('bCrcColLate'), type: 'number' },
      { key: 'installment', header: tm('bCrcColInstallment'), cell: () => '—' },
      {
        key: 'openAmount',
        header: tm('bCrcColAmount'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => <span className="font-semibold text-rose-600">{money(row.openAmount)}</span>,
      },
      {
        key: 'note',
        header: tm('bCrcColDescription'),
        size: 280,
        cell: (row) =>
          [
            `${tm('bCrcColServiceDebt')}: ${money(row.serviceDebt)}`,
            `${tm('bCrcColProductNet')}: ${money(row.productNet)}`,
            hasAmount(row.returnAmount) ? `${tm('bCrcColReturn')}: ${money(row.returnAmount)}` : '',
            hasAmount(row.depositAmount) ? `${tm('bCrcDepositInfo')}: ${money(row.depositAmount)}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
      },
    ],
    [tm],
  );

  const serviceColumns = useMemo<ReportColumnTableCol<ClinicServiceRow>[]>(
    () => [
      { key: 'serviceName', header: tm('bCrcColService'), size: 220 },
      { key: 'times', header: tm('bCrcColTimes'), type: 'number', footerSum: true },
      { key: 'avgPrice', header: tm('bCrcColAvgPrice'), type: 'currency', cell: (row) => money(row.avgPrice) },
      {
        key: 'revenue',
        header: tm('bCrcColRevenue'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => money(row.revenue),
      },
      { key: 'lastDate', header: tm('bCrcColLastDate'), type: 'date' },
    ],
    [tm],
  );

  const topCustomerColumns = useMemo<ReportColumnTableCol<ClinicCustomerRevenueRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 200 },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'lastAppointment', header: tm('bCrcColLastAppointment'), type: 'date' },
      {
        key: 'revenue',
        header: tm('bCrcColRevenue'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => <span className="font-semibold text-emerald-600">{money(row.revenue)}</span>,
      },
    ],
    [tm],
  );

  const absentColumns = useMemo<ReportColumnTableCol<ClinicAbsentRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 200 },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'lastAppointment', header: tm('bCrcColLastAppointment'), type: 'date' },
      { key: 'lostDays', header: tm('bCrcColLostDays'), type: 'number' },
    ],
    [tm],
  );

  const appointmentColumns = useMemo<ReportColumnTableCol<ClinicAppointmentRow>[]>(
    () => [
      {
        key: 'date',
        header: tm('bCrcColDateTime'),
        size: 150,
        cell: (row) => `${row.date}${row.time ? ` ${row.time}` : ''}`,
      },
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 180 },
      { key: 'staffName', header: tm('bCrcColStaff'), size: 160 },
      { key: 'serviceName', header: tm('bCrcColService'), size: 180 },
      { key: 'duration', header: tm('bCrcColDuration'), type: 'number' },
      { key: 'visitState', header: tm('bCrcColVisitState'), size: 140, cell: (row) => statusLabel(row.status) },
    ],
    [tm],
  );

  const staffColumns = useMemo<ReportColumnTableCol<ClinicStaffRow>[]>(
    () => [
      { key: 'staffName', header: tm('bCrcColStaff'), size: 180 },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'arrived', header: tm('bCrcColArrived'), type: 'number', footerSum: true },
      { key: 'noShow', header: tm('bCrcColNoShow'), type: 'number', footerSum: true },
      { key: 'retention', header: tm('bCrcColRetention'), cell: (row) => pct(row.retention) },
      {
        key: 'avgTicket',
        header: tm('bCrcColAvgTicket'),
        type: 'currency',
        cell: (row) => (row.avgTicket == null ? '—' : money(row.avgTicket)),
      },
      {
        key: 'revenue',
        header: tm('bCrcColRevenue'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => <span className="font-semibold text-emerald-600">{money(row.revenue)}</span>,
      },
    ],
    [tm],
  );

  const auditColumns = useMemo<ReportColumnTableCol<ClinicAuditRow>[]>(
    () => [
      { key: 'createdAt', header: tm('bCrcColDate'), size: 170 },
      { key: 'userLabel', header: tm('bCrcColStaff'), size: 160 },
      { key: 'tableName', header: tm('bCrcColTable'), size: 150 },
      { key: 'auditVerb', header: tm('bCrcColAction'), size: 130 },
      { key: 'summary', header: tm('bCrcColSummary'), size: 260 },
      { key: 'ip', header: tm('bCrcColIp'), size: 140, cell: (row) => row.ip || '—' },
      {
        key: 'detail',
        header: tm('bCrcColDetail'),
        size: 90,
        enableColumnFilter: false,
        cell: (row) => (
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-blue-700"
            onClick={(event) => {
              event.stopPropagation();
              setAuditRow(row);
            }}
          >
            {tm('bCrcColDetail')}
          </button>
        ),
      },
    ],
    [tm],
  );

  const serviceRows = useMemo(() => {
    const inactive = new Set(view.serviceCatalog.filter((row) => !row.isActive).map((row) => row.name));
    let rows = view.services;
    if (!periodOnly) {
      const byName = new Map(rows.map((row) => [row.serviceName, row]));
      const merged: ClinicServiceRow[] = [];
      const seen = new Set<string>();
      for (const item of view.serviceCatalog) {
        if (activeOnly && !item.isActive) continue;
        seen.add(item.name);
        merged.push(
          byName.get(item.name) || {
            id: item.id || item.name,
            serviceName: item.name,
            times: 0,
            avgPrice: 0,
            revenue: 0,
            depositAmount: 0,
            lastDate: '',
          },
        );
      }
      for (const row of rows) {
        if (!seen.has(row.serviceName)) merged.push(row);
      }
      rows = merged;
    } else if (activeOnly) {
      rows = rows.filter((row) => !inactive.has(row.serviceName));
    }
    return rows.filter((row) => hit(query, [row.serviceName]));
  }, [activeOnly, periodOnly, query, view.serviceCatalog, view.services]);

  const institutionRows = view.institutions.filter((row) => hit(query, [row.branchName, row.phone]));
  const movementRows = view.movements.filter((row) => {
    if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
    return hit(query, [row.category, row.customerName, row.description, row.method, kindLabel(row.kind)]);
  });
  const debtorPool = view.debtors.filter((row) => row.openAmount > 0.004);
  const debtorRows = (
    receivableTab === 'overdue'
      ? debtorPool.filter((row) => row.daysOpen > 0)
      : receivableTab === 'soon'
        ? []
        : receivableTab === 'top'
          ? [...debtorPool].sort((a, b) => b.openAmount - a.openAmount).slice(0, 10)
          : debtorPool
  ).filter((row) => hit(query, [row.customerName]));
  const appointmentRows = view.appointments.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    return hit(query, [row.customerName, row.staffName, row.serviceName, statusLabel(row.status)]);
  });
  const staffRows = view.staff
    .filter((row) => (activeOnly ? row.isActive : true))
    .filter((row) => hit(query, [row.staffName]));
  const vipRows = view.topCustomers.filter((row) => hit(query, [row.customerName]));
  const absentRows = view.absentCustomers.filter((row) => hit(query, [row.customerName]));
  const auditOptions = {
    users: [...new Set(view.audit.map((row) => row.userLabel).filter((value) => value && value !== '—'))],
    tables: [...new Set(view.audit.map((row) => row.tableName).filter((value) => value && value !== '—'))],
    actions: [...new Set(view.audit.map((row) => row.auditVerb).filter((value) => value && value !== '—'))],
  };
  const auditRows = view.audit.filter((row) => {
    if (auditUser !== 'all' && row.userLabel !== auditUser) return false;
    if (auditTable !== 'all' && row.tableName !== auditTable) return false;
    if (auditAction !== 'all' && row.auditVerb !== auditAction) return false;
    if (auditRecord.trim() && !fold(row.recordId).includes(fold(auditRecord.trim()))) return false;
    if (auditIp.trim() && !fold(row.ip).includes(fold(auditIp.trim()))) return false;
    return hit(query, [row.userLabel, row.tableName, row.auditVerb, row.summary, row.ip, row.recordId]);
  });

  const profitWord = view.net > 0.004 ? tm('bCrcInProfit') : view.net < -0.004 ? tm('bCrcInLoss') : tm('bCrcFlat');
  const keptWhole = view.appointmentArrived + view.appointmentNoShow;

  const kpis = useMemo<ReportKpiItem[]>(() => {
    if (reportId === 'institution') {
      return [
        { key: 'income', label: tm('bCrcKpiTotalIncome'), value: money(view.income), hint: `${view.branchCount} ${tm('bCrcMiniBranch')}`, className: tone('green') },
        { key: 'expense', label: tm('bCrcKpiTotalExpense'), value: money(view.expense), hint: `${view.branchCount} ${tm('bCrcMiniBranch')}`, className: tone('red') },
        { key: 'net', label: tm('bCrcKpiTotalNet'), value: money(view.net), hint: profitWord, className: tone('blue') },
        { key: 'appt', label: tm('bCrcKpiTotalAppt'), value: String(view.appointmentTotal), hint: pct(view.retention), className: tone('purple') },
      ];
    }
    if (reportId === 'income') {
      return [
        { key: 'in', label: tm('bCrcKpiMoneyIn'), value: money(view.income), className: tone('green') },
        { key: 'out', label: tm('bCrcKpiMoneyOut'), value: money(view.expense), className: tone('red') },
        { key: 'net', label: tm('bCrcKpiRemainNet'), value: money(view.net), hint: profitWord, className: tone('blue') },
        { key: 'margin', label: tm('bCrcKpiMargin'), value: pct(view.margin), hint: tm('bCrcDepositInfo'), className: tone('blue') },
      ];
    }
    if (reportId === 'receivable') {
      const openCustomers = view.debtors.filter((row) => row.openAmount > 0.004).length;
      const overdueCustomers = view.debtors.filter((row) => row.openAmount > 0.004 && row.daysOpen > 0).length;
      return [
        { key: 'open', label: tm('bCrcKpiOpenTotal'), value: money(view.openReceivable), hint: `${openCustomers} ${tm('bCrcCustomerWord')}`, className: tone('blue') },
        { key: 'plan', label: tm('bCrcKpiUnplanned'), value: money(view.openReceivable), hint: tm('bCrcInstallmentNone'), className: tone('amber') },
        { key: 'late', label: tm('bCrcKpiOverdueAmount'), value: money(view.overdueAmount), hint: `${overdueCustomers} ${tm('bCrcCustomerWord')}`, className: tone('red') },
        { key: 'rate', label: tm('bCrcKpiCollectionRate'), value: pct(view.collectionRate), className: tone('green') },
      ];
    }
    if (reportId === 'service') {
      return [
        { key: 'active', label: tm('bCrcKpiActiveServices'), value: String(view.activeServices), className: tone('purple') },
        { key: 'given', label: tm('bCrcKpiGivenServices'), value: String(view.givenServices), className: tone('blue') },
        { key: 'rev', label: tm('bCrcKpiServiceRevenue'), value: money(view.serviceRevenue), className: tone('green') },
        { key: 'top', label: tm('bCrcKpiTopService'), value: view.topServiceName || '—', className: tone('amber') },
      ];
    }
    if (reportId === 'customer') {
      return [
        { key: 'total', label: tm('bCrcKpiCustomers'), value: String(view.customerTotal), className: tone('blue') },
        { key: 'neu', label: tm('bCrcKpiNewCustomers'), value: String(view.customerNew), className: tone('green') },
        { key: 'active', label: tm('bCrcKpiActiveCustomers'), value: String(view.customerActive), className: tone('purple') },
        { key: 'passive', label: tm('bCrcKpiPassiveCustomers'), value: String(view.customerPassive), className: tone('amber') },
      ];
    }
    if (reportId === 'appointment') {
      return [
        { key: 'total', label: tm('bCrcKpiTotalAppt'), value: String(view.appointmentTotal), className: tone('purple') },
        { key: 'hold', label: tm('bCrcKpiKeptRate'), value: pct(view.retention), hint: `${view.appointmentArrived} / ${keptWhole}`, className: tone('green') },
        { key: 'miss', label: tm('bCrcKpiCancelNoShow'), value: String(view.appointmentCancelled + view.appointmentNoShow), className: tone('red') },
        {
          key: 'dur',
          label: tm('bCrcKpiAvgMinutes'),
          value: view.avgDuration == null ? '—' : `${view.avgDuration} ${tm('bCrcMinuteSuffix')}`,
          className: tone('slate'),
        },
      ];
    }
    if (reportId === 'staff') {
      return [
        { key: 'active', label: tm('bCrcKpiActiveStaff'), value: String(view.activeStaff), className: tone('purple') },
        { key: 'appt', label: tm('bCrcKpiTotalAppt'), value: String(view.appointmentTotal), className: tone('blue') },
        { key: 'rev', label: tm('bCrcKpiTotalTurnover'), value: money(view.income), className: tone('green') },
        { key: 'hold', label: tm('bCrcKpiAvgKept'), value: pct(view.retention), className: tone('amber') },
      ];
    }
    return [{ key: 'count', label: tm('bCrcKpiAudit'), value: String(view.audit.length), className: tone('slate') }];
  }, [keptWhole, profitWord, reportId, tm, view]);

  const headerMini = (() => {
    if (reportId === 'institution') {
      return [
        [tm('bCrcMiniBranch'), `${view.branchCount} ${tm('bCrcActiveWord')}`],
        [tm('bCrcKpiAppointments'), String(view.appointmentTotal)],
        [tm('bCrcMiniTurnover'), money(view.income)],
      ];
    }
    if (reportId === 'income') {
      return [
        [tm('bCrcKpiIncome'), money(view.income)],
        [tm('bCrcKpiExpense'), money(view.expense)],
        [tm('bCrcKpiNet'), money(view.net)],
      ];
    }
    if (reportId === 'receivable') {
      return [
        [tm('bCrcKpiOpen'), money(view.openReceivable)],
        [tm('bCrcKpiOverdue'), money(view.overdueAmount)],
        [tm('bCrcKpiCollectionRate'), pct(view.collectionRate)],
      ];
    }
    if (reportId === 'service') {
      return [
        [tm('bCrcKpiActiveCustomers'), String(view.activeServices)],
        [tm('bCrcKpiGivenServices'), String(view.givenServices)],
        [tm('bCrcMiniTurnover'), money(view.serviceRevenue)],
      ];
    }
    if (reportId === 'customer') {
      return [
        [tm('bCrcKpiCustomers'), String(view.customerTotal)],
        [tm('bCrcKpiNewCustomers'), String(view.customerNew)],
        [tm('bCrcKpiActiveCustomers'), String(view.customerActive)],
      ];
    }
    if (reportId === 'appointment') {
      return [
        [tm('bCrcKpiAppointments'), String(view.appointmentTotal)],
        [tm('bCrcKpiRetention'), pct(view.retention)],
        [tm('bCrcKpiCancelNoShow'), String(view.appointmentCancelled + view.appointmentNoShow)],
      ];
    }
    if (reportId === 'staff') {
      return [
        [tm('bCrcKpiActiveStaff'), String(view.activeStaff)],
        [tm('bCrcKpiAppointments'), String(view.appointmentTotal)],
        [tm('bCrcMiniTurnover'), money(view.income)],
      ];
    }
    return [[tm('bCrcKpiAudit'), String(auditRows.length)]];
  })();

  const expenseBars = (() => {
    const map = new Map<string, number>();
    for (const row of view.movements) {
      if (row.kind !== 'expense') continue;
      map.set(row.category, (map.get(row.category) || 0) + Math.abs(row.amount));
    }
    return [...map.entries()].map(([label, value]) => ({ id: label, label, value }));
  })();
  const methodBars = (() => {
    const map = new Map<string, number>();
    for (const row of view.movements) {
      if (row.kind !== 'income' && row.kind !== 'return') continue;
      map.set(row.method || '—', (map.get(row.method || '—') || 0) + row.amount);
    }
    return [...map.entries()].map(([label, value]) => ({ id: label, label, value }));
  })();
  const trendBars = (() => {
    const map = new Map<string, number>();
    for (const row of view.movements) {
      if (row.kind === 'deposit' || row.kind === 'expense') continue;
      map.set(row.date, (map.get(row.date) || 0) + row.amount);
    }
    return [...map.entries()].map(([label, value]) => ({ id: label, label, value }));
  })();
  const statusBars = (() => {
    const map = new Map<string, number>();
    for (const row of view.appointments) {
      const label = statusLabel(row.status);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return [...map.entries()].map(([label, value]) => ({ id: label, label, value }));
  })();
  const hourBars = (() => {
    const map = new Map<string, number>();
    for (const row of view.appointments) {
      const hour = row.time.slice(0, 2);
      if (!hour) continue;
      map.set(hour, (map.get(hour) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ id: label, label, value }));
  })();
  const genderBars = [
    view.genderFemale > 0 ? { id: 'f', label: tm('bGenderFemale'), value: view.genderFemale } : null,
    view.genderMale > 0 ? { id: 'm', label: tm('bGenderMale'), value: view.genderMale } : null,
    view.genderOther > 0 ? { id: 'o', label: tm('bGenderOther'), value: view.genderOther } : null,
  ].filter((row): row is { id: string; label: string; value: number } => Boolean(row));
  const lateBars = (() => {
    const bands = [
      { id: '1-30', label: '1-30', min: 1, max: 30 },
      { id: '31-60', label: '31-60', min: 31, max: 60 },
      { id: '61-90', label: '61-90', min: 61, max: 90 },
      { id: '90+', label: '90+', min: 91, max: 100000 },
    ];
    return bands
      .map((band) => ({
        id: band.id,
        label: band.label,
        value: view.debtors
          .filter((row) => row.openAmount > 0.004 && row.daysOpen >= band.min && row.daysOpen <= band.max)
          .reduce((sum, row) => sum + row.openAmount, 0),
      }))
      .filter((row) => hasAmount(row.value));
  })();

  const searchBox = (placeholder: string) => (
    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={placeholder}
      aria-label={tm('bCrcSearch')}
      className="w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400"
    />
  );

  const pill = (id: string, label: string, selected: boolean, onClick: () => void, count?: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}
      onClick={onClick}
    >
      {label}
      {count != null ? ` ${count}` : ''}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-slate-50 p-3 sm:p-4" data-testid="clinic-report-center">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white">
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {tm('bCrcEyebrow')} · {tm(copy.eyebrow)}
              </p>
              <div ref={menuRef} className="relative mt-0.5">
                <button
                  type="button"
                  data-testid="clinic-report-menu-trigger"
                  className="flex items-center gap-2 text-left text-xl font-extrabold text-slate-900"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-label={tm('bCrcTitle')}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span>{tm(copy.title)}</span>
                  <ChevronDown size={16} className={`text-slate-400 ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen ? (
                  <ul
                    role="listbox"
                    aria-label={tm('bCrcTitle')}
                    data-testid="clinic-report-menu-list"
                    className="absolute z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    {CLINIC_MIRROR_REPORTS.map((item) => {
                      const selected = reportId === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            data-testid={`clinic-report-option-${item.id}`}
                            className={`flex w-full items-center px-3 py-2 text-left text-sm font-semibold ${
                              selected ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                            onClick={() => {
                              setReportId(item.id);
                              setQuery('');
                              setMenuOpen(false);
                            }}
                          >
                            {tm(item.labelKey)}
                          </button>
                        </li>
                      );
                    })}
                    <li className="border-t border-slate-100">
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        data-testid="clinic-report-all"
                        className="flex w-full items-center px-3 py-2 text-left text-sm font-bold text-slate-800 hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenAllReports();
                        }}
                      >
                        {tm('bCrcAllReports')}
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">{tm(copy.lead)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            {headerMini.map(([label, value]) => (
              <div key={label} className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="text-sm font-extrabold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{tm('bCrcDateLabel')}</p>
            <ReportDateRangePresets value={range} onChange={setRange} tm={tm} />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            onClick={() => setReloadNonce((value) => value + 1)}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {tm('bCrcRefresh')}
          </button>
        </div>
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500" data-testid="clinic-report-loading">
          <Loader2 className="animate-spin" size={14} />
          {tm('bCrcLoading')}
        </p>
      ) : null}
      {errorText ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-testid="clinic-report-error">
          {errorText}
        </p>
      ) : null}

      {reportId !== 'audit' ? <ReportKpiStrip items={kpis} columns={4} /> : null}

      {reportId === 'institution' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelBranchRevenue')} empty={tm('bCrcNoIncomeData')}>
            <MetricBars rows={institutionRows.map((row) => ({ id: row.id, label: row.branchName, value: row.income }))} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelBranchNet')} empty={tm('bCrcNoTrend')}>
            <MetricBars
              rows={institutionRows.map((row) => ({ id: row.id, label: row.branchName, value: row.net }))}
              format={money}
              showZero
            />
          </Panel>
          <Panel title={tm('bCrcPanelBranchAppt')} hint={tm('bCrcStateArrived')} empty={tm('bCrcNoAppointmentData')}>
            <MetricBars rows={institutionRows.map((row) => ({ id: row.id, label: row.branchName, value: row.appointments }))} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelShare')} empty={tm('bCrcNoShare')}>
            <MetricBars
              rows={institutionRows.map((row) => ({
                id: row.id,
                label: row.branchName,
                value: view.income > 0 ? Math.round((row.income / view.income) * 1000) / 10 : 0,
              }))}
              format={(n) => `%${n}`}
            />
          </Panel>
        </div>
      ) : null}

      {reportId === 'income' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelExpenseCat')} empty={tm('bCrcNoCategory')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars rows={expenseBars} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelMoneyTrend')} empty={tm('bCrcNoTrend')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars rows={trendBars} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelPayMethod')} empty={tm('bCrcNoIncomeData')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars rows={methodBars} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelPeriod')} hint={`${range.from} — ${range.to}`} empty={tm('bCrcNoTrend')}>
            <ul className="w-full space-y-1.5 text-sm text-slate-700">
              <li>{tm('bCrcKpiIncome')}: {money(view.income)}</li>
              <li>{tm('bCrcKpiExpense')}: {money(view.expense)}</li>
              <li className="font-semibold text-emerald-700">{tm('bCrcKpiNet')}: {money(view.net)} — {profitWord}</li>
              <li>{tm('bCrcKpiMargin')}: {pct(view.margin)}</li>
              <li>{tm('bCrcDepositInfo')}: {money(view.depositAmount)}</li>
              <li>{tm('bCrcKpiReturn')}: {money(view.returnAmount)}</li>
              <li className="pt-1 text-xs text-slate-400">{tm('bCrcReturnOnce')}</li>
            </ul>
          </Panel>
        </div>
      ) : null}

      {reportId === 'receivable' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelOverdueAge')} empty={tm('bCrcNoOverdue')}>
            <MetricBars rows={lateBars} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelCollection')} empty={tm('bCrcNoCollection')} emptyHint={tm('bCrcEmptyHint')}>
            {hasAmount(view.depositAmount) || hasAmount(view.paidRemainder) ? (
              <ul className="w-full space-y-1.5 text-sm text-slate-700">
                <li>{tm('bCrcDepositInfo')}: {money(view.depositAmount)}</li>
                <li>{tm('bCrcColPaid')}: {money(view.paidRemainder)}</li>
                <li className="text-xs text-slate-400">{tm('bCrcCollectionNote')}</li>
              </ul>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {reportId === 'service' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelServicePop')} hint={tm('bCrcKpiTopService')} empty={tm('bCrcNoTrend')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars rows={serviceRows.map((row) => ({ id: row.id, label: row.serviceName, value: row.times }))} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelRevenueMix')} empty={tm('bCrcNoRevenue')}>
            <MetricBars rows={serviceRows.map((row) => ({ id: row.id, label: row.serviceName, value: row.revenue }))} format={money} />
          </Panel>
        </div>
      ) : null}

      {reportId === 'customer' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelGender')} empty={tm('bCrcNoGender')}>
            <MetricBars rows={genderBars} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelNewTrend')} empty={tm('bCrcNoNewSignup')}>
            <MetricBars rows={view.customerSignups.map((row) => ({ id: row.id, label: row.date, value: row.count }))} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelAge')} empty={tm('bCrcNoBirth')}>
            <MetricBars rows={view.ageBands.map((row) => ({ id: row.id, label: row.band, value: row.count }))} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelActiveRatio')} empty={tm('bCrcNoGender')}>
            {view.customerTotal > 0 ? (
              <MetricBars
                rows={[
                  { id: 'a', label: tm('bCrcKpiActiveCustomers'), value: view.customerActive },
                  { id: 'p', label: tm('bCrcKpiPassiveCustomers'), value: view.customerPassive },
                ]}
                format={(n) => String(n)}
                showZero
              />
            ) : null}
          </Panel>
        </div>
      ) : null}

      {reportId === 'appointment' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelStatus')} empty={tm('bCrcNoAppointmentData')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars rows={statusBars} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelApptTrend')} empty={tm('bCrcNoTrend')} emptyHint={tm('bCrcEmptyHint')}>
            <MetricBars
              rows={(() => {
                const map = new Map<string, number>();
                for (const row of view.appointments) map.set(row.date, (map.get(row.date) || 0) + 1);
                return [...map.entries()].map(([label, value]) => ({ id: label, label, value }));
              })()}
              format={(n) => String(n)}
            />
          </Panel>
          <Panel title={tm('bCrcPanelHourly')} empty={tm('bCrcNoTrend')}>
            <MetricBars rows={hourBars} format={(n) => String(n)} />
          </Panel>
          <Panel title={tm('bCrcPanelStaffPerf')} empty={tm('bCrcNoStaffData')}>
            <MetricBars
              rows={view.staff.filter((row) => row.appointments > 0).map((row) => ({ id: row.id, label: row.staffName, value: row.appointments }))}
              format={(n) => String(n)}
            />
          </Panel>
        </div>
      ) : null}

      {reportId === 'staff' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={tm('bCrcPanelStaffRevenue')} empty={tm('bCrcNoRevenue')}>
            <MetricBars rows={staffRows.map((row) => ({ id: row.id, label: row.staffName, value: row.revenue }))} format={money} />
          </Panel>
          <Panel title={tm('bCrcPanelStaffCount')} empty={tm('bCrcNoAppointmentData')}>
            <MetricBars rows={staffRows.map((row) => ({ id: row.id, label: row.staffName, value: row.appointments }))} format={(n) => String(n)} />
          </Panel>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {reportId === 'audit' ? (
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcColStaff')}
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={auditUser} onChange={(event) => setAuditUser(event.target.value)}>
                <option value="all">{tm('bCrcAll')}</option>
                {auditOptions.users.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcColTable')}
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={auditTable} onChange={(event) => setAuditTable(event.target.value)}>
                <option value="all">{tm('bCrcAll')}</option>
                {auditOptions.tables.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcColAction')}
              <select className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={auditAction} onChange={(event) => setAuditAction(event.target.value)}>
                <option value="all">{tm('bCrcAll')}</option>
                {auditOptions.actions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcAuditSearch')}
              {searchBox(tm('bCrcAuditSearch'))}
            </label>
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcAuditRecord')}
              <input value={auditRecord} onChange={(event) => setAuditRecord(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              {tm('bCrcAuditIp')}
              <input value={auditIp} onChange={(event) => setAuditIp(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={() => setReloadNonce((value) => value + 1)}>
                {tm('bCrcFilter')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"
                onClick={() => {
                  setAuditUser('all');
                  setAuditTable('all');
                  setAuditAction('all');
                  setAuditRecord('');
                  setAuditIp('');
                  setQuery('');
                }}
              >
                {tm('bCrcClear')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900">
              {reportId === 'institution' ? tm('bCrcTableInstitution') : null}
              {reportId === 'income' ? tm('bCrcTableMovements') : null}
              {reportId === 'receivable' ? tm('bCrcTableReceivable') : null}
              {reportId === 'service' ? tm('bCrcTableService') : null}
              {reportId === 'customer' ? tm('bCrcTableCustomer') : null}
              {reportId === 'appointment' ? tm('bCrcTableAppointment') : null}
              {reportId === 'staff' ? tm('bCrcTableStaff') : null}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {reportId === 'income' ? (
                <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} aria-label={tm('bCrcColType')}>
                  <option value="all">{tm('bCrcAll')}</option>
                  <option value="income">{tm('bCrcKindIncome')}</option>
                  <option value="expense">{tm('bCrcKindExpense')}</option>
                  <option value="return">{tm('bCrcKindReturn')}</option>
                  <option value="deposit">{tm('bCrcKindDeposit')}</option>
                </select>
              ) : null}
              {reportId === 'appointment' ? (
                <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={tm('bCrcColVisitState')}>
                  <option value="all">{tm('bCrcAllStates')}</option>
                  {['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'].map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              ) : null}
              {reportId === 'service' ? (
                <>
                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
                    {tm('bCrcActiveOnly')}
                  </label>
                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={periodOnly} onChange={(event) => setPeriodOnly(event.target.checked)} />
                    {tm('bCrcGivenPeriod')}
                  </label>
                </>
              ) : null}
              {reportId === 'staff' ? (
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
                  {tm('bCrcActiveOnly')}
                </label>
              ) : null}
              {searchBox(tm('bCrcSearch'))}
            </div>
          </div>
        )}

        {reportId === 'receivable' ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {pill('overdue', tm('bCrcTabOverdue'), receivableTab === 'overdue', () => setReceivableTab('overdue'), debtorPool.filter((row) => row.daysOpen > 0).length)}
            {pill('soon', tm('bCrcTabSoon'), receivableTab === 'soon', () => setReceivableTab('soon'), 0)}
            {pill('unplanned', tm('bCrcTabUnplanned'), receivableTab === 'unplanned', () => setReceivableTab('unplanned'), debtorPool.length)}
            {pill('top', tm('bCrcTabTop'), receivableTab === 'top', () => setReceivableTab('top'), Math.min(10, debtorPool.length))}
          </div>
        ) : null}
        {reportId === 'receivable' && receivableTab === 'soon' ? (
          <p className="mb-3 text-xs text-slate-500">{tm('bCrcSoonHint')}</p>
        ) : null}
        {reportId === 'customer' ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {pill('vip', tm('bCrcTabVip'), customerTab === 'vip', () => setCustomerTab('vip'), vipRows.length)}
            {pill('absent', tm('bCrcTabAbsent'), customerTab === 'absent', () => setCustomerTab('absent'), absentRows.length)}
            {customerTab === 'vip' ? <span className="text-[11px] text-slate-400">{tm('bCrcVipHint')}</span> : null}
          </div>
        ) : null}

        {reportId === 'institution' ? (
          <ReportColumnTable data={institutionRows} columns={institutionColumns} storageNamespace="clinic-crc-institution" />
        ) : null}
        {reportId === 'income' ? (
          <ReportColumnTable
            data={movementRows.map((row) => ({ ...row, kindLabel: kindLabel(row.kind) }))}
            columns={movementColumns}
            storageNamespace="clinic-crc-income"
          />
        ) : null}
        {reportId === 'receivable' ? (
          debtorRows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">
              {receivableTab === 'soon' ? tm('bCrcNoSoon') : receivableTab === 'overdue' ? tm('bCrcNoOverdue') : tm('bCrcEmptyTitle')}
            </p>
          ) : (
            <ReportColumnTable data={debtorRows} columns={debtorColumns} storageNamespace="clinic-crc-receivable" />
          )
        ) : null}
        {reportId === 'service' ? (
          serviceRows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{tm('bCrcNoServiceRow')}</p>
          ) : (
            <ReportColumnTable data={serviceRows} columns={serviceColumns} storageNamespace="clinic-crc-service" />
          )
        ) : null}
        {reportId === 'customer' && customerTab === 'vip' ? (
          vipRows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{tm('bCrcNoVip')}</p>
          ) : (
            <ReportColumnTable data={vipRows} columns={topCustomerColumns} storageNamespace="clinic-crc-customer-top" />
          )
        ) : null}
        {reportId === 'customer' && customerTab === 'absent' ? (
          absentRows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{tm('bCrcEmptyTitle')}</p>
          ) : (
            <ReportColumnTable data={absentRows} columns={absentColumns} storageNamespace="clinic-crc-customer-absent" />
          )
        ) : null}
        {reportId === 'appointment' ? (
          appointmentRows.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-500">{tm('bCrcEmptyTitle')}</p>
          ) : (
            <ReportColumnTable
              data={appointmentRows.map((row) => ({ ...row, visitState: statusLabel(row.status) }))}
              columns={appointmentColumns}
              storageNamespace="clinic-crc-appointment"
            />
          )
        ) : null}
        {reportId === 'staff' ? (
          <>
            <ReportColumnTable data={staffRows} columns={staffColumns} storageNamespace="clinic-crc-staff" />
            <p className="mt-3 text-[11px] text-slate-400">{tm('bCrcStaffNote')}</p>
          </>
        ) : null}
        {reportId === 'audit' ? (
          <>
            <h2 className="mb-1 text-base font-extrabold text-slate-900">{tm('bCrcAuditTitle')}</h2>
            <p className="mb-3 text-xs text-slate-400">{auditRows.length}</p>
            <ReportColumnTable data={auditRows} columns={auditColumns} storageNamespace="clinic-crc-audit" onRowClick={setAuditRow} />
          </>
        ) : null}
      </section>

      {auditRow ? (
        <PercentBodyModal onClose={() => setAuditRow(null)} size="compact" ariaLabel={tm('bCrcAuditDetail')}>
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-extrabold text-slate-800">{tm('bCrcAuditDetail')}</h2>
          </div>
          <PercentBodyModalScrollBody className="space-y-2 p-4 text-sm text-slate-700">
            <p>{auditRow.createdAt}</p>
            <p>{auditRow.userLabel}</p>
            <p>{auditRow.tableName}</p>
            <p>{auditRow.auditVerb}</p>
            <p>{auditRow.summary}</p>
            {auditRow.ip ? <p>{auditRow.ip}</p> : null}
          </PercentBodyModalScrollBody>
          <div className="shrink-0 border-t border-slate-100 p-3">
            <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" onClick={() => setAuditRow(null)}>
              {tm('close')}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}
    </div>
  );
}
