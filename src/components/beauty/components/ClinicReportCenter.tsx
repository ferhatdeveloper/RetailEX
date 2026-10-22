import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { beautyService } from '../../../services/beautyService';
import { expenseAPI } from '../../../services/api/expenses';
import { ReportDateRangePresets } from '../../shared/ReportDateRangePresets';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { ReportKpiStrip } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { defaultReportDateRange, type ReportDateRangeValue } from '../../../utils/reportDatePresets';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import {
  CLINIC_MIRROR_REPORTS,
  buildClinicMirrorReports,
  type ClinicAbsentRow,
  type ClinicAgeRow,
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

function money(value: number): string {
  return formatMoneyAmount(value, { minFrac: 0, maxFrac: 2 });
}

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `%${value.toFixed(1)}`;
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

export function ClinicReportCenter({ onOpenAllReports }: Props) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const [range, setRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [reportId, setReportId] = useState<ClinicMirrorReportId>('institution');
  const [model, setModel] = useState<ClinicMirrorModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditRow, setAuditRow] = useState<ClinicAuditRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeReport = CLINIC_MIRROR_REPORTS.find((item) => item.id === reportId) ?? CLINIC_MIRROR_REPORTS[0];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [appointmentsR, salesR, returnsR, customersR, specialistsR, servicesR, branchesR, auditR, expensesR] =
        await Promise.allSettled([
          beautyService.getAppointmentsInRange(range.from, range.to),
          beautyService.getSalesWithItemsForExportRange(range.from, range.to),
          beautyService.getProductSalesReturnLines(range.from, range.to),
          beautyService.getCustomers(),
          beautyService.getSpecialists(),
          beautyService.getServices(),
          beautyService.getBranches(),
          beautyService.listAuditLog(500),
          expenseAPI.getAll({ startDate: range.from, endDate: range.to }),
        ]);
      if (cancelled) return;
      const sales = salesR.status === 'fulfilled' ? (salesR.value as BeautySale[]) : [];
      const audit = auditR.status === 'fulfilled' ? auditR.value : [];
      try {
        const next = buildClinicMirrorReports({
          from: range.from,
          to: range.to,
          firmName: String(selectedFirm?.name ?? '').trim(),
          branches: (branchesR.status === 'fulfilled' ? branchesR.value : []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            phone: row.phone,
          })),
          services: (servicesR.status === 'fulfilled' ? servicesR.value : []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            isActive: row.is_active,
          })),
          specialists: (specialistsR.status === 'fulfilled' ? specialistsR.value : []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            isActive: row.is_active,
          })),
          customers: (customersR.status === 'fulfilled' ? customersR.value : []).map((row) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            gender: row.gender,
            birthDate: row.birth_date,
            isActive: row.is_active,
            createdAt: row.created_at,
            appointmentCount: row.appointment_count,
            lastAppointmentDate: row.last_appointment_date,
          })),
          appointments: appointmentsR.status === 'fulfilled' ? appointmentsR.value : [],
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
          returns: returnsR.status === 'fulfilled' ? returnsR.value : [],
          expenses: (expensesR.status === 'fulfilled' ? expensesR.value : []).map((row) => ({
            id: String(row.id ?? ''),
            date: String(row.expense_date ?? ''),
            category: row.category,
            description: row.description,
            amount: Number(row.amount),
            paymentMethod: row.payment_method,
            storeId: row.store_id,
          })),
          audit: (audit as BeautyAuditLogEntry[]).map((row) => {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, selectedFirm?.name]);

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

  const institutionColumns = useMemo<ReportColumnTableCol<ClinicInstitutionRow>[]>(
    () => [
      { key: 'branchName', header: tm('bCrcColBranch'), size: 180 },
      { key: 'phone', header: tm('bCrcColPhone'), size: 140 },
      { key: 'staffCount', header: tm('bCrcColStaff'), type: 'number', footerSum: true },
      { key: 'newCustomers', header: tm('bCrcColNewCustomers'), type: 'number', footerSum: true },
      { key: 'totalCustomers', header: tm('bCrcColCustomers'), type: 'number' },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'retention', header: tm('bCrcColRetention'), type: 'number', cell: (row) => pct(row.retention) },
      { key: 'income', header: tm('bCrcColIncome'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'expense', header: tm('bCrcColExpense'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'net', header: tm('bCrcColNet'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'margin', header: tm('bCrcColMargin'), type: 'number', cell: (row) => pct(row.margin) },
    ],
    [tm],
  );

  const movementColumns = useMemo<ReportColumnTableCol<ClinicMoneyMovement>[]>(
    () => [
      { key: 'date', header: tm('bCrcColDate'), type: 'date', size: 120 },
      { key: 'kindLabel', header: tm('bCrcColType'), size: 120, cell: (row) => kindLabel(row.kind) },
      { key: 'category', header: tm('bCrcColCategory'), size: 180 },
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 160 },
      { key: 'description', header: tm('bCrcColDescription'), size: 200 },
      { key: 'method', header: tm('bCrcColMethod'), size: 120 },
      {
        key: 'amount',
        header: tm('bCrcColAmount'),
        type: 'currency',
        footerSum: true,
        footerGetValue: (row) => row.amount,
        footerFormat: (n) => money(n),
        cell: (row) => money(row.amount),
      },
      {
        key: 'depositAmount',
        header: tm('bCrcColDeposit'),
        type: 'currency',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.depositAmount ? money(row.depositAmount) : '—'),
      },
    ],
    [tm],
  );

  const debtorColumns = useMemo<ReportColumnTableCol<ClinicDebtorRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 180 },
      { key: 'chargeDate', header: tm('bCrcColDate'), type: 'date' },
      { key: 'serviceDebt', header: tm('bCrcColServiceDebt'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'productNet', header: tm('bCrcColProductNet'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'returnAmount', header: tm('bCrcColReturn'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'depositAmount', header: tm('bCrcColDeposit'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'paidRemainder', header: tm('bCrcColPaid'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'openAmount', header: tm('bCrcColOpen'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'daysOpen', header: tm('bCrcColDaysOpen'), type: 'number' },
    ],
    [tm],
  );

  const serviceColumns = useMemo<ReportColumnTableCol<ClinicServiceRow>[]>(
    () => [
      { key: 'serviceName', header: tm('bCrcColService'), size: 220 },
      { key: 'times', header: tm('bCrcColTimes'), type: 'number', footerSum: true },
      { key: 'avgPrice', header: tm('bCrcColAvgPrice'), type: 'currency', cell: (row) => money(row.avgPrice) },
      { key: 'revenue', header: tm('bCrcColRevenue'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'depositAmount', header: tm('bCrcColDeposit'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'lastDate', header: tm('bCrcColLastDate'), type: 'date' },
    ],
    [tm],
  );

  const topCustomerColumns = useMemo<ReportColumnTableCol<ClinicCustomerRevenueRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 200 },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
      { key: 'lastAppointment', header: tm('bCrcColLastAppointment'), type: 'date' },
      { key: 'revenue', header: tm('bCrcColRevenue'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'depositAmount', header: tm('bCrcColDeposit'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
    ],
    [tm],
  );

  const absentColumns = useMemo<ReportColumnTableCol<ClinicAbsentRow>[]>(
    () => [
      { key: 'customerName', header: tm('bCrcColCustomer'), size: 200 },
      { key: 'lastAppointment', header: tm('bCrcColLastAppointment'), type: 'date' },
      { key: 'lostDays', header: tm('bCrcColLostDays'), type: 'number' },
      { key: 'appointments', header: tm('bCrcColAppointments'), type: 'number', footerSum: true },
    ],
    [tm],
  );

  const ageColumns = useMemo<ReportColumnTableCol<ClinicAgeRow>[]>(
    () => [
      { key: 'band', header: tm('bCrcColAgeBand'), size: 140 },
      { key: 'count', header: tm('bCrcColCount'), type: 'number', footerSum: true },
    ],
    [tm],
  );

  const appointmentColumns = useMemo<ReportColumnTableCol<ClinicAppointmentRow>[]>(
    () => [
      { key: 'date', header: tm('bCrcColDate'), type: 'date' },
      { key: 'time', header: tm('bCrcColTime'), size: 90 },
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
      { key: 'retention', header: tm('bCrcColRetention'), type: 'number', cell: (row) => pct(row.retention) },
      { key: 'avgTicket', header: tm('bCrcColAvgTicket'), type: 'currency', cell: (row) => (row.avgTicket == null ? '—' : money(row.avgTicket)) },
      { key: 'revenue', header: tm('bCrcColRevenue'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
      { key: 'depositAmount', header: tm('bCrcColDeposit'), type: 'currency', footerSum: true, footerFormat: (n) => money(n) },
    ],
    [tm],
  );

  const auditColumns = useMemo<ReportColumnTableCol<ClinicAuditRow>[]>(
    () => [
      { key: 'createdAt', header: tm('bCrcColDate'), size: 180 },
      { key: 'userLabel', header: tm('bCrcColUser'), size: 160 },
      { key: 'tableName', header: tm('bCrcColTable'), size: 160 },
      { key: 'auditVerb', header: tm('bCrcColAction'), size: 140 },
      { key: 'summary', header: tm('bCrcColSummary'), size: 280 },
      { key: 'ip', header: tm('bCrcColIp'), size: 140 },
    ],
    [tm],
  );

  const kpis = useMemo(() => {
    if (!model) return [];
    if (reportId === 'institution') {
      return [
        { key: 'income', label: tm('bCrcKpiIncome'), value: money(model.income) },
        { key: 'expense', label: tm('bCrcKpiExpense'), value: money(model.expense) },
        { key: 'net', label: tm('bCrcKpiNet'), value: money(model.net) },
        { key: 'appt', label: tm('bCrcKpiAppointments'), value: String(model.appointmentTotal) },
        { key: 'deposit', label: tm('bCrcKpiDeposit'), value: money(model.depositAmount) },
      ];
    }
    if (reportId === 'income') {
      return [
        { key: 'income', label: tm('bCrcKpiIncome'), value: money(model.income) },
        { key: 'expense', label: tm('bCrcKpiExpense'), value: money(model.expense) },
        { key: 'net', label: tm('bCrcKpiNet'), value: money(model.net) },
        { key: 'margin', label: tm('bCrcKpiMargin'), value: pct(model.margin) },
        { key: 'return', label: tm('bCrcKpiReturn'), value: money(model.returnAmount) },
        { key: 'deposit', label: tm('bCrcKpiDeposit'), value: money(model.depositAmount) },
      ];
    }
    if (reportId === 'receivable') {
      return [
        { key: 'open', label: tm('bCrcKpiOpen'), value: money(model.openReceivable) },
        { key: 'overdue', label: tm('bCrcKpiOverdue'), value: money(model.overdueAmount) },
        { key: 'rate', label: tm('bCrcKpiCollectionRate'), value: pct(model.collectionRate) },
        { key: 'return', label: tm('bCrcKpiReturn'), value: money(model.returnAmount) },
        { key: 'deposit', label: tm('bCrcKpiDeposit'), value: money(model.depositAmount) },
      ];
    }
    if (reportId === 'service') {
      return [
        { key: 'active', label: tm('bCrcKpiActiveServices'), value: String(model.activeServices) },
        { key: 'given', label: tm('bCrcKpiGivenServices'), value: String(model.givenServices) },
        { key: 'revenue', label: tm('bCrcKpiServiceRevenue'), value: money(model.serviceRevenue) },
        { key: 'top', label: tm('bCrcKpiTopService'), value: model.topServiceName || '—' },
        { key: 'deposit', label: tm('bCrcKpiDeposit'), value: money(model.depositAmount) },
      ];
    }
    if (reportId === 'customer') {
      return [
        { key: 'total', label: tm('bCrcKpiCustomers'), value: String(model.customerTotal) },
        { key: 'neu', label: tm('bCrcKpiNewCustomers'), value: String(model.customerNew) },
        { key: 'active', label: tm('bCrcKpiActiveCustomers'), value: String(model.customerActive) },
        { key: 'passive', label: tm('bCrcKpiPassiveCustomers'), value: String(model.customerPassive) },
        { key: 'f', label: tm('bGenderFemale'), value: String(model.genderFemale) },
        { key: 'm', label: tm('bGenderMale'), value: String(model.genderMale) },
      ];
    }
    if (reportId === 'appointment') {
      return [
        { key: 'total', label: tm('bCrcKpiAppointments'), value: String(model.appointmentTotal) },
        { key: 'hold', label: tm('bCrcKpiRetention'), value: pct(model.retention) },
        { key: 'miss', label: tm('bCrcKpiCancelNoShow'), value: String(model.appointmentCancelled + model.appointmentNoShow) },
        { key: 'dur', label: tm('bCrcKpiAvgDuration'), value: model.avgDuration == null ? '—' : String(model.avgDuration) },
      ];
    }
    if (reportId === 'staff') {
      return [
        { key: 'active', label: tm('bCrcKpiActiveStaff'), value: String(model.activeStaff) },
        { key: 'appt', label: tm('bCrcKpiAppointments'), value: String(model.appointmentTotal) },
        { key: 'rev', label: tm('bCrcKpiIncome'), value: money(model.income) },
        { key: 'hold', label: tm('bCrcKpiRetention'), value: pct(model.retention) },
        { key: 'deposit', label: tm('bCrcKpiDeposit'), value: money(model.depositAmount) },
      ];
    }
    return [
      { key: 'count', label: tm('bCrcKpiAudit'), value: String(model.audit.length) },
    ];
  }, [model, reportId, tm]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4" data-testid="clinic-report-center">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div ref={menuRef} className="relative min-w-[16rem]">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{tm('bCrcTitle')}</p>
          <button
            type="button"
            data-testid="clinic-report-menu-trigger"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label={tm('bCrcTitle')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>{tm(activeReport.labelKey)}</span>
            <ChevronDown size={16} className={`text-slate-400 ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen ? (
            <ul
              role="listbox"
              aria-label={tm('bCrcTitle')}
              data-testid="clinic-report-menu-list"
              className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
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
        <ReportDateRangePresets value={range} onChange={setRange} tm={tm} />
      </div>
      <p className="text-[11px] text-slate-500">{tm('bCrcDepositHint')}</p>
      {loading && !model ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Loader2 className="animate-spin" size={16} />
          {tm('bCrcLoading')}
        </div>
      ) : null}
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {model ? (
        <>
          <ReportKpiStrip items={kpis} />
          {reportId === 'institution' ? (
            <ReportColumnTable data={model.institutions} columns={institutionColumns} storageNamespace="clinic-crc-institution" />
          ) : null}
          {reportId === 'income' ? (
            <ReportColumnTable
              data={model.movements.map((row) => ({ ...row, kindLabel: kindLabel(row.kind) }))}
              columns={movementColumns}
              storageNamespace="clinic-crc-income"
            />
          ) : null}
          {reportId === 'receivable' ? (
            <ReportColumnTable data={model.debtors} columns={debtorColumns} storageNamespace="clinic-crc-receivable" />
          ) : null}
          {reportId === 'service' ? (
            <ReportColumnTable data={model.services} columns={serviceColumns} storageNamespace="clinic-crc-service" />
          ) : null}
          {reportId === 'customer' ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-extrabold text-slate-800">{tm('bCrcSectionTopCustomers')}</h2>
              <ReportColumnTable data={model.topCustomers} columns={topCustomerColumns} storageNamespace="clinic-crc-customer-top" />
              <h2 className="text-sm font-extrabold text-slate-800">{tm('bCrcSectionAbsent')}</h2>
              <ReportColumnTable data={model.absentCustomers} columns={absentColumns} storageNamespace="clinic-crc-customer-absent" />
              <h2 className="text-sm font-extrabold text-slate-800">{tm('bCrcSectionAge')}</h2>
              <ReportColumnTable data={model.ageBands} columns={ageColumns} storageNamespace="clinic-crc-customer-age" />
            </div>
          ) : null}
          {reportId === 'appointment' ? (
            <ReportColumnTable
              data={model.appointments.map((row) => ({ ...row, visitState: statusLabel(row.status) }))}
              columns={appointmentColumns}
              storageNamespace="clinic-crc-appointment"
            />
          ) : null}
          {reportId === 'staff' ? (
            <ReportColumnTable data={model.staff} columns={staffColumns} storageNamespace="clinic-crc-staff" />
          ) : null}
          {reportId === 'audit' ? (
            <ReportColumnTable
              data={model.audit}
              columns={auditColumns}
              storageNamespace="clinic-crc-audit"
              onRowClick={setAuditRow}
            />
          ) : null}
        </>
      ) : null}
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
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
              onClick={() => setAuditRow(null)}
            >
              {tm('close')}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}
    </div>
  );
}
