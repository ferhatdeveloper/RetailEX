/**
 * RetailEX — Mesaj Bildirim üst mavi bildirim bandı.
 *
 * Mavi üst çubuğun hemen altında, küçük yatay banner olarak gösterilir.
 * Veri: bugün doğum günü (1-3 ad, +n), önümüzdeki 7 gün doğum günü sayısı,
 * aktif özel gün sayısı, planlı (scheduled_at) kuyruk adedi.
 *
 * Tıklama → Mesaj Bildirim sayfası açılır (navigateToScreen) ve sekme hedefi
 * (örn. `auto` veya `queue`) custom event ile bildirilir.
 *
 * Scheduler'a dokunmaz; sadece okur.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cake, PartyPopper, CalendarDays, ListOrdered, ChevronRight, X, Bell } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  customerNotificationService,
  daysUntilBirthday,
  type NotifyCustomerRow,
} from '../../services/messaging/customerNotificationService';
import { messagingService } from '../../services/messaging/messagingService';
import { specialDayService, type SpecialDayRow } from '../../services/messaging/specialDayService';
import type { MessagingSettings, NotificationQueueRow } from '../../services/messaging/messagingTypes';

const NAVIGATE_EVENT = 'navigateToScreen';
const TAB_EVENT = 'retailex:mesaj-bildirim:open-tab';
const SCREEN_ID = 'mesaj-bildirim';
const DEFAULT_LOOKAHEAD_DAYS = 7;

function openMesajBildirim(tab?: 'send' | 'templates' | 'special' | 'auto' | 'queue') {
  if (typeof window === 'undefined') return;
  if (tab) {
    window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: tab }));
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: SCREEN_ID }));
}

function safeList<T>(p: Promise<unknown>): Promise<T[]> {
  return p.then((v) => (Array.isArray(v) ? (v as T[]) : [])).catch(() => []);
}

export interface MesajBildirimTopBannerProps {
  /** Üst çubuktan bağımsız olarak gösterimi kapatmak için (örn. modül içindeyken). */
  forceVisible?: boolean;
}

export function MesajBildirimTopBanner({ forceVisible }: MesajBildirimTopBannerProps = {}) {
  const { tm } = useLanguage();
  const [customers, setCustomers] = useState<NotifyCustomerRow[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDayRow[]>([]);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [queueRows, setQueueRows] = useState<NotificationQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, q] = await Promise.all([
        safeList<NotifyCustomerRow>(customerNotificationService.listActiveCustomers()),
        safeList<SpecialDayRow>(specialDayService.list(true)),
        safeList<NotificationQueueRow>(messagingService.listQueue(200)),
      ]);
      setCustomers(c);
      setSpecialDays(s);
      setQueueRows(q);
      try {
        const ms = await messagingService.getSettings();
        setSettings(ms);
      } catch {
        setSettings(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 5 dakikada bir taze — scheduler dışı okuma
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  const lookahead = useMemo(() => {
    const n = Number(settings?.birthday_upcoming_days ?? DEFAULT_LOOKAHEAD_DAYS);
    return Number.isFinite(n) && n > 0 ? Math.min(60, Math.max(1, Math.round(n))) : DEFAULT_LOOKAHEAD_DAYS;
  }, [settings]);

  const today = useMemo(() => {
    return [...customers]
      .filter((c) => daysUntilBirthday(c.birth_date) === 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .slice(0, 3);
  }, [customers]);

  const upcoming = useMemo(() => {
    return customers
      .map((c) => ({ c, days: daysUntilBirthday(c.birth_date) }))
      .filter(
        (x): x is { c: NotifyCustomerRow; days: number } =>
          x.days != null && x.days >= 1 && x.days <= lookahead,
      )
      .sort((a, b) => a.days - b.days || a.c.name.localeCompare(b.c.name, 'tr'));
  }, [customers, lookahead]);

  const todayExtraCount = useMemo(() => {
    const total = customers.filter((c) => daysUntilBirthday(c.birth_date) === 0).length;
    return Math.max(0, total - today.length);
  }, [customers, today.length]);

  const upcomingExtraCount = useMemo(
    () => Math.max(0, upcoming.length - today.length),
    [upcoming.length, today.length],
  );

  const activeSpecialDaysCount = useMemo(() => {
    if (!specialDays.length) return 0;
    return specialDays.filter((d) => {
      if (d.is_active === false) return false;
      const m = Number(d.month);
      const day = Number(d.day);
      return Boolean(m && day);
    }).length;
  }, [specialDays]);

  const scheduledQueueCount = useMemo(() => {
    const now = Date.now();
    return queueRows.filter((r) => {
      if (r.status !== 'pending') return false;
      if (!r.scheduled_at) return false;
      const t = new Date(r.scheduled_at).getTime();
      return Number.isFinite(t) && t > now;
    }).length;
  }, [queueRows]);

  // Banner sadece anlamlı içerik varsa gösterilir.
  const hasContent =
    today.length > 0 ||
    upcoming.length > 0 ||
    activeSpecialDaysCount > 0 ||
    scheduledQueueCount > 0;

  if (forceVisible !== true && (!hasContent || dismissed || loading)) {
    return null;
  }

  const todaySummary =
    today.length === 0
      ? null
      : today.map((c) => c.name).join(', ') + (todayExtraCount > 0 ? ` +${todayExtraCount}` : '');

  return (
    <div
      className="relative z-[90] shrink-0 bg-gradient-to-r from-blue-50 via-sky-50 to-blue-50 border-b border-blue-200 text-blue-950 shadow-sm"
      role="region"
      aria-label={tm('msgNotifyBannerTitle')}
    >
      <div className="flex items-center gap-3 px-3 sm:px-4 md:px-5 py-1.5 text-xs sm:text-sm">
        <div className="flex items-center gap-2 shrink-0">
          <Bell className="h-4 w-4 text-blue-600" />
          <span className="font-bold uppercase tracking-wide text-[11px] text-blue-700">
            {tm('msgNotifyBannerTitle')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => openMesajBildirim(today.length > 0 ? 'auto' : 'send')}
          className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-blue-100 transition min-w-0"
          title={tm('msgNotifyBannerBirthdayToday')}
        >
          <Cake className="h-4 w-4 text-pink-600 shrink-0" />
          {todaySummary ? (
            <span className="font-semibold truncate max-w-[18rem]">{todaySummary}</span>
          ) : (
            <span className="text-blue-700/80">{tm('msgNotifyBannerBirthdayTodayEmpty')}</span>
          )}
        </button>

        <span className="text-blue-300 shrink-0">·</span>

        <button
          type="button"
          onClick={() => openMesajBildirim('auto')}
          className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-blue-100 transition min-w-0"
          title={tm('msgNotifyBannerBirthdayUpcoming')}
        >
          <PartyPopper className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="font-medium">
            {upcoming.length > 0
              ? tm('msgNotifyBannerBirthdayUpcomingCount').replace('{n}', String(upcoming.length))
              : tm('msgNotifyBannerBirthdayUpcomingEmpty')}
          </span>
          {upcoming[0] && upcoming[0].days != null ? (
            <span className="text-blue-700/80 hidden sm:inline truncate">
              ({upcoming[0].c.name}
              {upcomingExtraCount > 0 ? ` +${upcomingExtraCount}` : ''})
            </span>
          ) : null}
        </button>

        {activeSpecialDaysCount > 0 ? (
          <>
            <span className="text-blue-300 shrink-0 hidden sm:inline">·</span>
            <button
              type="button"
              onClick={() => openMesajBildirim('special')}
              className="group hidden sm:flex items-center gap-2 rounded-md px-2 py-1 hover:bg-blue-100 transition"
              title={tm('msgNotifyBannerSpecialDays')}
            >
              <CalendarDays className="h-4 w-4 text-violet-600 shrink-0" />
              <span className="font-medium">
                {tm('msgNotifyBannerSpecialDaysCount').replace('{n}', String(activeSpecialDaysCount))}
              </span>
            </button>
          </>
        ) : null}

        {scheduledQueueCount > 0 ? (
          <>
            <span className="text-blue-300 shrink-0 hidden md:inline">·</span>
            <button
              type="button"
              onClick={() => openMesajBildirim('queue')}
              className="group hidden md:flex items-center gap-2 rounded-md px-2 py-1 hover:bg-blue-100 transition"
              title={tm('msgNotifyBannerScheduledQueue')}
            >
              <ListOrdered className="h-4 w-4 text-blue-700 shrink-0" />
              <span className="font-medium">
                {tm('msgNotifyBannerScheduledQueueCount').replace('{n}', String(scheduledQueueCount))}
              </span>
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => openMesajBildirim('send')}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-blue-700 font-bold hover:bg-blue-100 transition shrink-0"
          title={tm('msgNotifyBannerOpen')}
        >
          <span className="hidden sm:inline">{tm('msgNotifyBannerOpen')}</span>
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-blue-700 hover:bg-blue-100 shrink-0"
          aria-label={tm('msgNotifyBannerDismiss')}
          title={tm('msgNotifyBannerDismiss')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default MesajBildirimTopBanner;
