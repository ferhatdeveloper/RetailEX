export type CustomerCallPlanWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
      ? value.split(',').map(v => v.trim()).filter(Boolean)
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
