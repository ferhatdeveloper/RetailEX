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
    border: '1px solid #ddd6fe',
    borderLeft: '3px solid #7c3aed',
    background: '#f5f3ff',
    badgeColor: '#6d28d9',
    titleColor: '#5b21b6',
    subColor: '#6d28d9',
    iconColor: '#7c3aed',
    buttonBorder: '1px dashed #c4b5fd',
    buttonColor: '#6d28d9',
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
): FollowUpReminderCardTheme {
  return THEMES[status ?? 'due'] ?? THEMES.due;
}

/** SQL hatırlatmaları + DB aksiyonlarını birleştirir; görünür `due_date` etkin tarihtir. */
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

  for (const row of base) {
    const natural = row.due_date;
    const key = followUpReminderNaturalKey({ ...row, natural_due_date: natural });
    const act = actionMap.get(key);
    const status = (act?.status ?? 'due') as BeautyFollowUpReminderStatus;
    if (status === 'dismissed') continue;

    const effectiveDue =
      status === 'postponed' && act?.postponed_due_date
        ? act.postponed_due_date
        : natural;

    if (!inRange(effectiveDue)) continue;
    if (status === 'postponed' && act?.postponed_due_date && act.postponed_due_date !== natural) {
      if (inRange(natural)) continue;
    }

    out.push({
      ...row,
      natural_due_date: natural,
      due_date: effectiveDue,
      follow_up_status: status,
      note: act?.note?.trim() || undefined,
    });
    injected.add(key);
  }

  for (const act of actions) {
    if (act.status === 'dismissed') continue;
    const effective =
      act.status === 'postponed' && act.postponed_due_date
        ? act.postponed_due_date
        : act.natural_due_date;
    if (!inRange(effective)) continue;
    const key = followUpActionKey(act);
    if (injected.has(key)) continue;
    if (base.some((b) => followUpReminderNaturalKey(b) === key)) continue;

    out.push({
      due_date: effective,
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
      follow_up_status: act.status,
      note: act.note?.trim() || undefined,
    });
  }

  out.sort((a, b) => {
    const d = a.due_date.localeCompare(b.due_date);
    if (d !== 0) return d;
    return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', 'tr');
  });

  return out;
}
