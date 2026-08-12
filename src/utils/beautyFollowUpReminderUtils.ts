import type {
  BeautyFollowUpReminder,
  BeautyFollowUpReminderAction,
  BeautyFollowUpReminderStatus,
} from '../types/beauty';

export function followUpReminderNaturalKey(
  r: Pick<
    BeautyFollowUpReminder,
    'customer_id' | 'service_id' | 'product_id' | 'last_completed_date' | 'due_date' | 'reminder_kind'
  >,
): string {
  const kind = r.reminder_kind ?? 'service';
  const product = r.product_id ?? '';
  const naturalDue = r.natural_due_date ?? r.due_date;
  return `${r.customer_id}|${r.service_id}|${product}|${r.last_completed_date}|${naturalDue}|${kind}`;
}

export function followUpActionKey(a: Pick<BeautyFollowUpReminderAction, 'customer_id' | 'service_id' | 'product_id' | 'last_completed_date' | 'natural_due_date' | 'reminder_kind'>): string {
  const kind = a.reminder_kind ?? 'service';
  const product = a.product_id ?? '';
  return `${a.customer_id}|${a.service_id}|${product}|${a.last_completed_date}|${a.natural_due_date}|${kind}`;
}

export function getFollowUpReminderDisplayDueDate(r: BeautyFollowUpReminder): string {
  return r.due_date;
}

/**
 * Günü geçmiş aranmayanlar:
 * - Görünen vade (`due_date`) bugünden önce
 * - Durum henüz `contacted` / `dismissed` değil (due | other | postponed)
 * - Erteleme gölge satırları (`is_natural_shadow`) hariç
 */
export function isOverdueUncalledFollowUp(
  r: BeautyFollowUpReminder,
  todayYmd: string,
): boolean {
  if (!r.due_date || r.due_date >= todayYmd) return false;
  if (r.is_natural_shadow) return false;
  const status = r.follow_up_status ?? 'due';
  if (status === 'contacted' || status === 'dismissed') return false;
  return true;
}

export function filterOverdueUncalledFollowUps(
  reminders: BeautyFollowUpReminder[],
  todayYmd: string,
): BeautyFollowUpReminder[] {
  return reminders
    .filter((r) => isOverdueUncalledFollowUp(r, todayYmd))
    .sort((a, b) => {
      const d = a.due_date.localeCompare(b.due_date);
      if (d !== 0) return d;
      return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'tr');
    });
}

/** Takvim günü farkı (due → today); geçersiz tarihlerde 0. */
export function followUpDaysOverdue(dueYmd: string, todayYmd: string): number {
  const due = Date.parse(`${dueYmd}T12:00:00`);
  const today = Date.parse(`${todayYmd}T12:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

export type FollowUpReminderCardTheme = {
  border: string;
  borderLeft: string;
  background: string;
  badgeColor: string;
  titleColor: string;
  subColor: string;
  iconColor: string;
  buttonBorder: string;
  buttonColor: string;
  badgeLabel?: string;
};

const THEMES: Record<BeautyFollowUpReminderStatus, FollowUpReminderCardTheme> = {
  due: {
    border: '1px solid #fbcfe8',
    borderLeft: '3px solid #db2777',
    background: '#fdf2f8',
    badgeColor: '#be185d',
    titleColor: '#831843',
    subColor: '#9d174d',
    iconColor: '#db2777',
    buttonBorder: '1px dashed #f472b6',
    buttonColor: '#be185d',
  },
  postponed: {
    border: '1px solid #fde68a',
    borderLeft: '3px solid #d97706',
    background: '#fffbeb',
    badgeColor: '#b45309',
    titleColor: '#92400e',
    subColor: '#a16207',
    iconColor: '#d97706',
    buttonBorder: '1px dashed #fbbf24',
    buttonColor: '#b45309',
  },
  contacted: {
    border: '1px solid #bae6fd',
    borderLeft: '3px solid #0284c7',
    background: '#f0f9ff',
    badgeColor: '#0369a1',
    titleColor: '#0c4a6e',
    subColor: '#075985',
    iconColor: '#0284c7',
    buttonBorder: '1px dashed #7dd3fc',
    buttonColor: '#0369a1',
  },
  other: {
    border: '1px solid #fde68a',
    borderLeft: '3px solid #d97706',
    background: '#fffbeb',
    badgeColor: '#b45309',
    titleColor: '#92400e',
    subColor: '#a16207',
    iconColor: '#d97706',
    buttonBorder: '1px dashed #fbbf24',
    buttonColor: '#b45309',
  },
  dismissed: {
    border: '1px solid #e5e7eb',
    borderLeft: '3px solid #9ca3af',
    background: '#f9fafb',
    badgeColor: '#6b7280',
    titleColor: '#374151',
    subColor: '#6b7280',
    iconColor: '#9ca3af',
    buttonBorder: '1px dashed #d1d5db',
    buttonColor: '#6b7280',
  },
};

export function getFollowUpReminderCardTheme(
  status: BeautyFollowUpReminderStatus | undefined,
  hasNote = false,
): FollowUpReminderCardTheme {
  const s = status ?? 'due';
  if (s === 'postponed') return THEMES.postponed;
  if (s === 'contacted') return THEMES.contacted;
  if (s === 'dismissed') return THEMES.dismissed;
  if (s === 'other' || (s === 'due' && hasNote)) return THEMES.other;
  return THEMES.due;
}

/** SQL hatırlatmaları + DB aksiyonlarını birleştirir; görünür `due_date` takvim sütunudur. */
export function mergeFollowUpRemindersWithActions(
  base: BeautyFollowUpReminder[],
  actions: BeautyFollowUpReminderAction[],
  rangeStart: string,
  rangeEnd: string,
): BeautyFollowUpReminder[] {
  const actionMap = new Map<string, BeautyFollowUpReminderAction>();
  for (const a of actions) {
    actionMap.set(followUpActionKey(a), a);
  }

  const inRange = (ymd: string) => ymd >= rangeStart && ymd <= rangeEnd;
  const out: BeautyFollowUpReminder[] = [];
  const injected = new Set<string>();

  const appendEntry = (
    row: BeautyFollowUpReminder,
    displayDue: string,
    natural: string,
    status: BeautyFollowUpReminderStatus,
    act: BeautyFollowUpReminderAction | undefined,
    isShadow = false,
  ) => {
    const postponed =
      status === 'postponed' && act?.postponed_due_date ? act.postponed_due_date : undefined;
    out.push({
      ...row,
      natural_due_date: natural,
      due_date: displayDue,
      follow_up_status: status,
      note: act?.note?.trim() || undefined,
      show_natural_when_postponed: act?.show_natural_when_postponed,
      postponed_due_date: postponed,
      is_natural_shadow: isShadow || undefined,
    });
  };

  const processReminder = (
    natural: string,
    row: BeautyFollowUpReminder,
    act: BeautyFollowUpReminderAction | undefined,
    key: string,
  ) => {
    const status = (act?.status ?? 'due') as BeautyFollowUpReminderStatus;
    if (status === 'dismissed') return;

    const postponed =
      status === 'postponed' && act?.postponed_due_date ? act.postponed_due_date : undefined;

    if (postponed && postponed !== natural) {
      if (inRange(postponed)) {
        appendEntry(row, postponed, natural, status, act, false);
      }
      if (inRange(natural) && act?.show_natural_when_postponed) {
        appendEntry(row, natural, natural, status, act, true);
      }
    } else {
      const effectiveDue = postponed ?? natural;
      if (inRange(effectiveDue)) {
        appendEntry(row, effectiveDue, natural, status, act, false);
      }
    }
    injected.add(key);
  };

  for (const row of base) {
    const natural = row.due_date;
    const key = followUpReminderNaturalKey({ ...row, natural_due_date: natural });
    processReminder(natural, row, actionMap.get(key), key);
  }

  for (const act of actions) {
    if (act.status === 'dismissed') continue;
    const key = followUpActionKey(act);
    if (injected.has(key)) continue;
    if (base.some((b) => followUpReminderNaturalKey(b) === key)) continue;

    const row: BeautyFollowUpReminder = {
      due_date: act.natural_due_date,
      natural_due_date: act.natural_due_date,
      last_completed_date: act.last_completed_date,
      reminder_days: Math.max(1, act.reminder_days ?? 1),
      service_id: act.service_id,
      service_name: act.service_name ?? '',
      customer_id: act.customer_id,
      customer_name: act.customer_name ?? '',
      customer_phone: act.customer_phone,
      reminder_kind: act.reminder_kind === 'product' ? 'product' : 'service',
      product_id: act.product_id,
      product_name: act.product_name,
    };
    processReminder(act.natural_due_date, row, act, key);
  }

  out.sort((a, b) => {
    const d = a.due_date.localeCompare(b.due_date);
    if (d !== 0) return d;
    const shadow = Number(Boolean(b.is_natural_shadow)) - Number(Boolean(a.is_natural_shadow));
    if (shadow !== 0) return shadow;
    return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'tr');
  });

  return out;
}
