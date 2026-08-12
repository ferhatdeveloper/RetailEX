export type CustomerCallPlanWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CustomerCallStatus = 'planned' | 'called' | 'no_answer' | 'callback' | 'not_interested' | 'done';

export const CUSTOMER_CALL_WEEKDAYS: { value: CustomerCallPlanWeekday; tr: string; shortTr: string }[] = [
  { value: 1, tr: 'Pazartesi', shortTr: 'Pzt' },
  { value: 2, tr: 'Salı', shortTr: 'Sal' },
  { value: 3, tr: 'Çarşamba', shortTr: 'Çar' },
  { value: 4, tr: 'Perşembe', shortTr: 'Per' },
  { value: 5, tr: 'Cuma', shortTr: 'Cum' },
  { value: 6, tr: 'Cumartesi', shortTr: 'Cmt' },
  { value: 7, tr: 'Pazar', shortTr: 'Paz' },
];

export function normalizeCustomerCallWeekday(value: unknown): CustomerCallPlanWeekday | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 7) return null;
  return n as CustomerCallPlanWeekday;
}

export function normalizeCustomerCallWeekdays(value: unknown): CustomerCallPlanWeekday[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.replace(/[{}[\]]/g, '').split(',').map(v => v.trim()).filter(Boolean)
      : value == null
        ? []
        : [value];
  return Array.from(
    new Set(
      rawItems
        .map(normalizeCustomerCallWeekday)
        .filter((v): v is CustomerCallPlanWeekday => v != null),
    ),
  ).sort((a, b) => a - b);
}

export function customerCallWeekdayLabel(value: unknown, short = false): string {
  const normalized = normalizeCustomerCallWeekday(value);
  if (!normalized) return '';
  const row = CUSTOMER_CALL_WEEKDAYS.find(day => day.value === normalized);
  return row ? (short ? row.shortTr : row.tr) : '';
}

export function customerCallWeekdaysLabel(value: unknown, short = false): string {
  return normalizeCustomerCallWeekdays(value)
    .map(day => customerCallWeekdayLabel(day, short))
    .filter(Boolean)
    .join(', ');
}

export const CUSTOMER_CALL_STATUSES: { value: CustomerCallStatus; label: string; tone: string }[] = [
  { value: 'planned', label: 'callPlanPlanned', tone: 'bg-slate-100 text-slate-700' },
  { value: 'called', label: 'callPlanCalled', tone: 'bg-blue-100 text-blue-700' },
  { value: 'no_answer', label: 'callPlanNoAnswer', tone: 'bg-red-100 text-red-700' },
  { value: 'callback', label: 'callPlanCallback', tone: 'bg-amber-100 text-amber-800' },
  { value: 'not_interested', label: 'callPlanNotInterested', tone: 'bg-gray-100 text-gray-700' },
  { value: 'done', label: 'callPlanDone', tone: 'bg-emerald-100 text-emerald-700' },
];

export function normalizeCustomerCallStatus(value: unknown): CustomerCallStatus {
  const raw = String(value ?? '').trim();
  return CUSTOMER_CALL_STATUSES.some(status => status.value === raw)
    ? raw as CustomerCallStatus
    : 'planned';
}

export function customerCallStatusMeta(value: unknown) {
  const status = normalizeCustomerCallStatus(value);
  return CUSTOMER_CALL_STATUSES.find(row => row.value === status) ?? CUSTOMER_CALL_STATUSES[0];
}
