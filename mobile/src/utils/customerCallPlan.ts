/** Web `src/utils/customerCallPlan.ts` — mobil kopya (i18n etiketleri TR sabit). */

export type CustomerCallPlanWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CustomerCallStatus =
  | 'planned'
  | 'called'
  | 'no_answer'
  | 'callback'
  | 'not_interested'
  | 'done';

export const CUSTOMER_CALL_WEEKDAYS: {
  value: CustomerCallPlanWeekday;
  tr: string;
  shortTr: string;
}[] = [
  { value: 1, tr: 'Pazartesi', shortTr: 'Pzt' },
  { value: 2, tr: 'Salı', shortTr: 'Sal' },
  { value: 3, tr: 'Çarşamba', shortTr: 'Çar' },
  { value: 4, tr: 'Perşembe', shortTr: 'Per' },
  { value: 5, tr: 'Cuma', shortTr: 'Cum' },
  { value: 6, tr: 'Cumartesi', shortTr: 'Cmt' },
  { value: 7, tr: 'Pazar', shortTr: 'Paz' },
];

export const CUSTOMER_CALL_STATUSES: {
  value: CustomerCallStatus;
  label: string;
  color: string;
}[] = [
  { value: 'planned', label: 'Planlandı', color: '#64748b' },
  { value: 'called', label: 'Arandı', color: '#2563eb' },
  { value: 'no_answer', label: 'Cevap yok', color: '#dc2626' },
  { value: 'callback', label: 'Geri arama', color: '#d97706' },
  { value: 'not_interested', label: 'İlgilenmiyor', color: '#6b7280' },
  { value: 'done', label: 'Tamam', color: '#16a34a' },
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
      ? value
          .replace(/[{}[\]]/g, '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
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

export function customerCallWeekdaysLabel(value: unknown, short = false): string {
  return normalizeCustomerCallWeekdays(value)
    .map((day) => {
      const row = CUSTOMER_CALL_WEEKDAYS.find((d) => d.value === day);
      return row ? (short ? row.shortTr : row.tr) : '';
    })
    .filter(Boolean)
    .join(', ');
}

export function normalizeCustomerCallStatus(value: unknown): CustomerCallStatus {
  const raw = String(value ?? '').trim();
  return CUSTOMER_CALL_STATUSES.some((s) => s.value === raw)
    ? (raw as CustomerCallStatus)
    : 'planned';
}

export function customerCallStatusMeta(value: unknown) {
  const status = normalizeCustomerCallStatus(value);
  return CUSTOMER_CALL_STATUSES.find((r) => r.value === status) ?? CUSTOMER_CALL_STATUSES[0]!;
}

/** Pazartesi başlangıçlı hafta (YYYY-MM-DD) */
export function getCallPlanWeekStart(ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay(); // 0 Paz
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function getCallPlanWeekEnd(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + 6);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function addCallPlanWeeks(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + weeks * 7);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatCallPlanWeekRange(weekStart: string): string {
  return `${weekStart} → ${getCallPlanWeekEnd(weekStart)}`;
}
