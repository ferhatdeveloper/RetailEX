/** Müşteri arama planı — hafta (Pazartesi başlangıç) yardımcıları */

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Verilen tarihin içinde olduğu haftanın Pazartesi günü (YYYY-MM-DD, yerel saat). */
export function getCallPlanWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const weekday = d.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + diff);
  return formatDateLocal(d);
}

export function getCallPlanWeekEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return formatDateLocal(d);
}

export function addCallPlanWeeks(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return formatDateLocal(d);
}

export function compareWeekStarts(a: string, b: string): number {
  return a.localeCompare(b);
}

export function formatCallPlanWeekRange(weekStart: string, locale = 'tr-TR'): string {
  const end = getCallPlanWeekEnd(weekStart);
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  return `${fmt(weekStart)} – ${fmt(end)}`;
}
