/**
 * Mesaj Bildirim — müşterilere WhatsApp ile tekli / çoklu / toplu / grup bildirimi.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Users,
  User,
  UserPlus,
  Filter,
  FilterX,
  Loader2,
  MessageSquare,
  Bell,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  CalendarRange,
  Cake,
  PartyPopper,
  Settings2,
  FileText,
  CalendarDays,
  ListOrdered,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { messagingService } from '../../services/messaging/messagingService';
import {
  customerNotificationService,
  daysUntilBirthday,
  type CustomerGroupFilter,
  type CustomerNotifyAudience,
  type NotifyCustomerRow,
} from '../../services/messaging/customerNotificationService';
import {
  previewMetaTemplateBody,
} from '../../services/messaging/metaWhatsAppTemplates';
import type { BeautyFollowUpReminder } from '../../types/beauty';
import {
  filterFollowUpRemindersForBulk,
  buildFollowUpBulkPreviewList,
  buildFollowUpBulkPreviewWithMissing,
  followUpReminderKey,
  type MissingFollowUpRecipient,
} from '../../utils/followUpWhatsAppSend';
import { WhatsAppBulkSendPreviewModal, type BulkMissingItem } from '../shared/WhatsAppBulkSendPreviewModal';
import type { WhatsAppBulkPreviewItem } from '../../utils/whatsappBulkSend';
import {
  CUSTOMER_BROADCAST_TEMPLATES,
  FOLLOW_UP_REMINDER_TIME_LABEL,
  WHATSAPP_FREE_TEXT_PRESET_OPTIONS,
  WHATSAPP_MESSAGE_LANG_OPTIONS,
  buildFollowUpFreeText,
  getFreeTextPresetTemplate,
  metaPresetFamilyForFreeTextPreset,
  metaTemplateIdForPresetAndLang,
  normalizeWhatsAppMessageLang,
  type WhatsAppFreeTextPresetId,
  type WhatsAppMessageLang,
} from '../../services/messaging/whatsappMessageLang';
import {
  messageTemplateService,
  splitHeadlineAndBody,
  resolveTemplateBody,
  resolveTemplateTranslations,
  filterTemplatesByLang,
  type MessageTemplateRow,
} from '../../services/messaging/messageTemplateService';
import { MessageTemplateEditorModal } from './MessageTemplateEditorModal';
import {
  MsgAutomationPanel,
  MsgQueueLogPanel,
  MsgSpecialDaysPanel,
  MsgTemplatesPanel,
} from './MesajBildirimCampaignPanels';
import { sanitizeCountryCode } from '../../services/messaging/messagingCountryCodes';

export interface MesajBildirimModuleProps {
  embedded?: boolean;
  onClose?: () => void;
  followUpReminders?: BeautyFollowUpReminder[];
  dateStart?: string;
  dateEnd?: string;
}

type NotifyMode = CustomerNotifyAudience | 'follow_up_range';
type MainTab = 'send' | 'templates' | 'special' | 'auto' | 'queue';

/** Şablon dropdown'ında "TR/EN/AR/KU" rozetleri için */
const TPL_LANG_KEYS_M: WhatsAppMessageLang[] = ['tr', 'en', 'ar', 'ku'];

const BASE_AUDIENCE_MODES: Array<{
  id: CustomerNotifyAudience;
  icon: React.ElementType;
  labelKey: string;
}> = [
  { id: 'single', icon: User, labelKey: 'msgNotifyModeSingle' },
  { id: 'multiple', icon: UserPlus, labelKey: 'msgNotifyModeMultiple' },
  { id: 'bulk_all', icon: Users, labelKey: 'msgNotifyModeBulk' },
  { id: 'group_include', icon: Filter, labelKey: 'msgNotifyModeGroup' },
  { id: 'group_exclude', icon: FilterX, labelKey: 'msgNotifyModeGroupExclude' },
  { id: 'birthday_today', icon: Cake, labelKey: 'msgNotifyModeBirthdayToday' },
  { id: 'birthday_upcoming', icon: PartyPopper, labelKey: 'msgNotifyModeBirthdayUpcoming' },
];

export function MesajBildirimModule({
  embedded = false,
  onClose,
  followUpReminders = [],
  dateStart,
  dateEnd,
}: MesajBildirimModuleProps = {}) {
  const { darkMode } = useTheme();
  const { tm, language } = useLanguage();

  const hasFollowUpContext = followUpReminders.length > 0;

  const audienceModes = useMemo((): Array<{ id: NotifyMode; icon: React.ElementType; labelKey: string }> => {
    const modes: Array<{ id: NotifyMode; icon: React.ElementType; labelKey: string }> = [];
    if (hasFollowUpContext) {
      modes.push({ id: 'follow_up_range', icon: CalendarRange, labelKey: 'msgNotifyModeFollowUpRange' });
    }
    return [...modes, ...BASE_AUDIENCE_MODES];
  }, [hasFollowUpContext]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [customers, setCustomers] = useState<NotifyCustomerRow[]>([]);
  const [provider, setProvider] = useState('NONE');
  const [defaultCountryCode, setDefaultCountryCode] = useState('90');
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0 });

  const [mode, setMode] = useState<NotifyMode>(hasFollowUpContext ? 'follow_up_range' : 'multiple');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFollowUpKeys, setSelectedFollowUpKeys] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<CustomerGroupFilter>({});
  const [messageText, setMessageText] = useState(() =>
    getFreeTextPresetTemplate('customer_greeting', normalizeWhatsAppMessageLang(language)),
  );
  const [messageLang, setMessageLang] = useState<WhatsAppMessageLang>(
    () => normalizeWhatsAppMessageLang(language),
  );
  const [freeTextPreset, setFreeTextPreset] = useState<WhatsAppFreeTextPresetId>('customer_greeting');
  const [metaTemplateId, setMetaTemplateId] = useState('retailex_appointment_tr');
  const [metaParams, setMetaParams] = useState<string[]>(['', '', '', '']);
  const [customerSearch, setCustomerSearch] = useState('');
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [bulkPreviewItems, setBulkPreviewItems] = useState<WhatsAppBulkPreviewItem[]>([]);
  const [bulkPreviewMissing, setBulkPreviewMissing] = useState<BulkMissingItem[]>([]);
  const [bulkPreviewTitle, setBulkPreviewTitle] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('send');
  const [queueInitialFilter, setQueueInitialFilter] = useState<'all' | 'failed'>('all');
  const [customTemplates, setCustomTemplates] = useState<MessageTemplateRow[]>([]);
  const [selectedCustomTplId, setSelectedCustomTplId] = useState('');
  const [upcomingDays, setUpcomingDays] = useState(7);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const messageBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const panel = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 p-2.5 text-sm'
    : 'w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm';
  const labelCls = darkMode ? 'text-xs font-medium text-gray-400' : 'text-xs font-medium text-gray-500';

  const metaTemplates = useMemo(() => customerNotificationService.getMetaTemplates(), []);

  /** Aktif dile göre filtrelenmiş kullanıcı şablonları (dropdown listesi). */
  const langFilteredCustomTemplates = useMemo(
    () => filterTemplatesByLang(customTemplates, messageLang),
    [customTemplates, messageLang],
  );
  const selectedMetaTpl = useMemo(
    () => metaTemplates.find((t) => t.id === metaTemplateId) ?? metaTemplates[0],
    [metaTemplates, metaTemplateId],
  );

  const isMeta = provider === 'META';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings, queueStats, tpls] = await Promise.all([
        customerNotificationService.listActiveCustomers(),
        customerNotificationService.getMessagingSettings(),
        messagingService.getQueueStats(),
        messageTemplateService.list(true),
      ]);
      setCustomers(list);
      setProvider((settings?.whatsapp_provider || 'NONE').toString().toUpperCase());
      setDefaultCountryCode(sanitizeCountryCode(settings?.default_country_code, '90'));
      setStats(queueStats);
      setCustomTemplates(tpls);
      if (settings?.birthday_upcoming_days) {
        setUpcomingDays(Number(settings.birthday_upcoming_days) || 7);
      }
      if (settings?.meta_appointment_template_name) {
        setMetaTemplateId(settings.meta_appointment_template_name);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedMetaTpl) return;
    setMetaParams(selectedMetaTpl.parameterLabels.map(() => ''));
  }, [selectedMetaTpl?.id]);

  /** Dil değişince: seçili özel şablon, yeni dilde yoksa seçimi temizle. */
  useEffect(() => {
    if (!selectedCustomTplId) return;
    const tpl = customTemplates.find((t) => t.id === selectedCustomTplId);
    if (!tpl) return;
    const available = filterTemplatesByLang([tpl], messageLang);
    if (available.length === 0) {
      setSelectedCustomTplId('');
      return;
    }
    if (messageText.trim() === '') {
      setMessageText(resolveTemplateBody(tpl, messageLang));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageLang]);

  // Üst mavi banner tıklaması → ilgili sekmeyi aç (örn. auto, queue, special, templates)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as string | undefined;
      if (detail === 'send' || detail === 'templates' || detail === 'special' || detail === 'auto' || detail === 'queue') {
        setMainTab(detail);
      }
    };
    window.addEventListener('retailex:mesaj-bildirim:open-tab', handler as EventListener);
    return () => window.removeEventListener('retailex:mesaj-bildirim:open-tab', handler as EventListener);
  }, []);

  const applyLangAndPreset = useCallback(
    (lang: WhatsAppMessageLang, preset: WhatsAppFreeTextPresetId) => {
      if (mode === 'follow_up_range') return;
      if (isMeta) {
        const family = metaPresetFamilyForFreeTextPreset(preset);
        setMetaTemplateId(metaTemplateIdForPresetAndLang(family, lang));
        return;
      }
      if (preset !== 'custom') {
        setMessageText(getFreeTextPresetTemplate(preset, lang));
      }
    },
    [isMeta, mode],
  );

  const handleMessageLangChange = (lang: WhatsAppMessageLang) => {
    setMessageLang(lang);
    applyLangAndPreset(lang, freeTextPreset);
  };

  const handlePresetChange = (preset: WhatsAppFreeTextPresetId) => {
    setFreeTextPreset(preset);
    applyLangAndPreset(messageLang, preset);
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.city ?? '').toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  const followUpBulkRows = useMemo(
    () => filterFollowUpRemindersForBulk(followUpReminders),
    [followUpReminders],
  );

  const followUpClearedRef = useRef(false);

  useEffect(() => {
    const keys = followUpBulkRows.map(followUpReminderKey);
    setSelectedFollowUpKeys((prev) => {
      if (followUpClearedRef.current) return prev.filter((k) => keys.includes(k));
      if (prev.length === 0) return keys;
      const allowed = new Set(keys);
      const keep = prev.filter((k) => allowed.has(k));
      return keep.length ? keep : keys;
    });
  }, [followUpBulkRows]);

  const selectedFollowUpRows = useMemo(
    () => followUpBulkRows.filter((r) => selectedFollowUpKeys.includes(followUpReminderKey(r))),
    [followUpBulkRows, selectedFollowUpKeys],
  );

  const [resolvedCount, setResolvedCount] = useState(0);
  const [resolvedRecipients, setResolvedRecipients] = useState<NotifyCustomerRow[]>([]);

  useEffect(() => {
    if (mode === 'follow_up_range') {
      setResolvedCount(selectedFollowUpRows.length);
      setResolvedRecipients([]);
      return;
    }
    let cancelled = false;
    void customerNotificationService
      .resolveRecipients({
        mode,
        customerIds: selectedIds,
        groupFilter,
        upcomingDays,
      })
      .then((rows) => {
        if (!cancelled) {
          setResolvedCount(rows.length);
          setResolvedRecipients(rows);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedIds, groupFilter, customers, selectedFollowUpRows.length, upcomingDays]);

  const birthdayAudienceList = useMemo(() => {
    if (mode !== 'birthday_today' && mode !== 'birthday_upcoming') return [];
    return [...resolvedRecipients].sort((a, b) => {
      const da = daysUntilBirthday(a.birth_date) ?? 999;
      const db = daysUntilBirthday(b.birth_date) ?? 999;
      return da - db || a.name.localeCompare(b.name, 'tr');
    });
  }, [mode, resolvedRecipients]);

  const upcomingBirthdayAll = useMemo(() => {
    return customers
      .map((c) => ({ c, days: daysUntilBirthday(c.birth_date) }))
      .filter((x): x is { c: NotifyCustomerRow; days: number } => x.days != null && x.days >= 1 && x.days <= upcomingDays)
      .sort((a, b) => a.days - b.days || a.c.name.localeCompare(b.c.name, 'tr'));
  }, [customers, upcomingDays]);

  const upcomingBirthdayPreview = upcomingBirthdayAll.slice(0, 12);

  const previewMessage = useMemo(() => {
    if (mode === 'follow_up_range' && followUpBulkRows[0]) {
      const r = followUpBulkRows[0];
      const name = r.customer_name?.trim() || 'Müşteri';
      const service =
        r.reminder_kind === 'product' && r.product_name?.trim()
          ? r.product_name.trim()
          : r.service_name?.trim() || 'Hizmet';
      if (isMeta) {
        const params = [
          name,
          r.due_date,
          FOLLOW_UP_REMINDER_TIME_LABEL[messageLang],
          service,
        ];
        const tplId = metaTemplateIdForPresetAndLang('appointment', messageLang);
        const tpl = metaTemplates.find((t) => t.id === tplId) ?? selectedMetaTpl;
        if (tpl) return previewMetaTemplateBody(tpl, params);
      }
      return buildFollowUpFreeText(messageLang, name, r.due_date, service);
    }
    const sample = customers[0];
    if (!sample) return messageText;
    if (isMeta && selectedMetaTpl) {
      const params = selectedMetaTpl.parameterLabels.map((_, i) => {
        const raw = (metaParams[i] ?? '').trim();
        if (raw) {
          return raw.replace(/\{customer_name\}/g, sample.name).replace(/\{name\}/g, sample.name);
        }
        return selectedMetaTpl.sampleValues[i] ?? sample.name;
      });
      return previewMetaTemplateBody(selectedMetaTpl, params);
    }
    const today = new Date().toISOString().slice(0, 10);
    return messageText
      .replace(/\{customer_name\}/g, sample.name)
      .replace(/\{name\}/g, sample.name)
      .replace(/\{city\}/g, sample.city ?? '')
      .replace(/\{date\}/g, today)
      .replace(/\{time\}/g, '14:00');
  }, [
    customers,
    messageText,
    isMeta,
    selectedMetaTpl,
    metaParams,
    mode,
    followUpBulkRows,
    messageLang,
    metaTemplates,
  ]);

  const toggleCustomer = (id: string) => {
    if (mode === 'single') {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleFollowUp = (key: string) => {
    setSelectedFollowUpKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      followUpClearedRef.current = next.length === 0;
      return next;
    });
  };

  const selectAllFilteredCustomers = () => {
    setSelectedIds(filteredCustomers.map((c) => c.id));
    if (mode === 'single') setMode('multiple');
  };

  const clearCustomerSelection = () => setSelectedIds([]);

  const selectAllFollowUps = () => {
    followUpClearedRef.current = false;
    setSelectedFollowUpKeys(followUpBulkRows.map(followUpReminderKey));
  };
  const clearFollowUpSelection = () => {
    followUpClearedRef.current = true;
    setSelectedFollowUpKeys([]);
  };

  const handlePrepareSend = async () => {
    if (provider === 'NONE') {
      toast.error(tm('msgNotifyProviderOff'));
      return;
    }
    setSending(true);
    try {
      let items: WhatsAppBulkPreviewItem[] = [];
      let missing: MissingFollowUpRecipient[] = [];
      if (mode === 'follow_up_range') {
        if (selectedFollowUpRows.length === 0) {
          toast.warning(tm('msgNotifyNoRecipients'));
          return;
        }
        const result = await buildFollowUpBulkPreviewWithMissing(selectedFollowUpRows, {
          lang: messageLang,
        });
        items = result.items;
        missing = result.missing;
        setBulkPreviewTitle(tm('msgNotifyModeFollowUpRange'));
      } else {
        const recipients = await customerNotificationService.resolveRecipients({
          mode: mode as CustomerNotifyAudience,
          customerIds: selectedIds,
          groupFilter,
          upcomingDays,
        });
        if (recipients.length === 0) {
          toast.warning(tm('msgNotifyNoRecipients'));
          return;
        }
        const eventType =
          mode === 'birthday_today' || mode === 'birthday_upcoming'
            ? mode
            : 'customer_broadcast';
        items = await customerNotificationService.buildBulkPreviewItems({
          recipients,
          messageTemplate: messageText,
          metaTemplateId: isMeta ? metaTemplateId : undefined,
          metaManualParameters: isMeta ? metaParams : undefined,
          eventType,
        });
        setBulkPreviewTitle(tm('msgNotifyBulkPreviewSubtitle'));
      }
      if (!items.length && missing.length === 0) {
        toast.warning(tm('msgNotifyNoRecipients'));
        return;
      }
      setBulkPreviewItems(items);
      setBulkPreviewMissing(
        missing.map((m) => ({
          id: m.id,
          name: m.name,
          reason: m.reason,
          contextLine: `${m.service} · ${m.due_date}`,
          phoneRaw: m.phone_raw ?? null,
        })),
      );
      setBulkPreviewOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const handleBulkComplete = async () => {
    const statsNow = await messagingService.getQueueStats();
    setStats(statsNow);
  };

  const rebuildBulkPreviewItems = useCallback(
    async (lang: WhatsAppMessageLang): Promise<WhatsAppBulkPreviewItem[]> => {
      if (mode === 'follow_up_range') {
        const { items, missing } = await buildFollowUpBulkPreviewWithMissing(
          selectedFollowUpRows,
          { lang },
        );
        setBulkPreviewMissing(
          missing.map((m) => ({
            id: m.id,
            name: m.name,
            reason: m.reason,
            contextLine: `${m.service} · ${m.due_date}`,
            phoneRaw: m.phone_raw ?? null,
          })),
        );
        return items;
      }
      const recipients = await customerNotificationService.resolveRecipients({
        mode: mode as CustomerNotifyAudience,
        customerIds: selectedIds,
        groupFilter,
        upcomingDays,
      });
      if (isMeta) {
        const family = metaPresetFamilyForFreeTextPreset(freeTextPreset);
        return customerNotificationService.buildBulkPreviewItems({
          recipients,
          messageTemplate: '',
          metaTemplateId: metaTemplateIdForPresetAndLang(family, lang),
          metaManualParameters: metaParams,
          eventType: 'customer_broadcast',
        });
      }
      const template =
        freeTextPreset === 'custom'
          ? messageText
          : getFreeTextPresetTemplate(freeTextPreset, lang);
      return customerNotificationService.buildBulkPreviewItems({
        recipients,
        messageTemplate: template,
        eventType: 'customer_broadcast',
      });
    },
    [mode, followUpReminders, selectedFollowUpRows, selectedIds, groupFilter, isMeta, metaParams, freeTextPreset, messageText, upcomingDays],
  );

  const handleProcessQueue = async () => {
    setProcessing(true);
    try {
      const r = await messagingService.processPendingQueue(30);
      const statsNow = await messagingService.getQueueStats();
      setStats(statsNow);
      toast.success(tm('msgNotifyQueueProcessed').replace('{n}', String(r.processed)));
      if (r.errors.length) toast.error(r.errors.slice(0, 2).join(' · '));
    } finally {
      setProcessing(false);
    }
  };

  const handleRetryFailedFromSend = async () => {
    setRetryingFailed(true);
    try {
      const n = await messagingService.retryFailedNotifications();
      const statsNow = await messagingService.getQueueStats();
      setStats(statsNow);
      toast.success(tm('msgNotifyRetryDone').replace('{n}', String(n)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRetryingFailed(false);
    }
  };

  const openFailedQueueTab = () => {
    setQueueInitialFilter('failed');
    setMainTab('queue');
  };

  const formatBirthdayDaysLabel = (days: number | null) => {
    if (days == null) return '—';
    if (days === 0) return tm('msgNotifyBirthdayDaysToday');
    return tm('msgNotifyBirthdayDaysLeft').replace('{n}', String(days));
  };

  const openWhatsAppSettings = () => {
    window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'whatsapp' }));
  };

  /**
   * Şablon düzenleme modalındaki "Mesaja ekle" butonu tetiklendiğinde
   * çağrılır. Aktif dilin body_text_<lang> içeriğini Serbest metin
   * textarea'sının sonuna ekler (append). Mevcut içerik korunur; boş
   * textarea için önce newline eklenmez, dolu textarea için `\n\n` ayraç
   * olarak kullanılır. Custom preset'e geçer (şablon dropdown temizlenir).
   */
  const handleAppendTemplateToMessage = useCallback(
    (body: string) => {
      setFreeTextPreset('custom');
      setSelectedCustomTplId('');
      setMessageText((prev) => {
        const trimmedPrev = (prev ?? '').trim();
        return trimmedPrev ? `${trimmedPrev}\n\n${body}` : body;
      });
      // İmleci sona odakla
      requestAnimationFrame(() => {
        const el = messageBodyRef.current;
        if (el) {
          el.focus();
          const end = el.value.length;
          try {
            el.setSelectionRange(end, end);
          } catch {
            // ignore (örn. readonly ortam)
          }
        }
      });
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        {tm('msgNotifyLoading')}
      </div>
    );
  }

  return (
    <div className={`h-full min-h-0 overflow-y-auto p-4 md:p-6 space-y-5 ${darkMode ? 'bg-gray-900' : 'bg-slate-50'}`}>
      {!embedded && (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {tm('msgNotifyTitle')}
          </h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {tm('msgNotifySubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${panel}`}
        >
          <RefreshCw className="h-4 w-4" />
          {tm('msgNotifyRefresh')}
        </button>
      </div>
      )}

      {embedded && hasFollowUpContext && dateStart && dateEnd ? (
        <div className={`rounded-xl border p-3 text-sm ${panel}`}>
          <p className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {tm('msgNotifyFollowUpRangeHint')
              .replace('{start}', dateStart)
              .replace('{end}', dateEnd)
              .replace('{n}', String(followUpBulkRows.length))}
          </p>
        </div>
      ) : null}

      {provider === 'NONE' ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">{tm('msgNotifyProviderOff')}</p>
            <button
              type="button"
              onClick={openWhatsAppSettings}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-amber-800 underline"
            >
              {tm('msgNotifyOpenWhatsAppSettings')}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border p-4 flex flex-wrap gap-4 items-center ${panel}`}>
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            {tm('msgNotifyProviderActive').replace('{provider}', provider)}
          </span>
          <span className="text-xs text-gray-500">
            {tm('msgNotifyStats')
              .replace('{pending}', String(stats.pending))
              .replace('{sent}', String(stats.sent))
              .replace('{failed}', String(stats.failed))}
          </span>
          {stats.failed > 0 ? (
            <button
              type="button"
              onClick={openFailedQueueTab}
              className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 px-2 py-1 text-xs font-bold"
            >
              {tm('msgNotifyQueueFilterFailed')} ({stats.failed})
            </button>
          ) : null}
          <button
            type="button"
            disabled={processing || stats.pending === 0}
            onClick={() => void handleProcessQueue()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {tm('msgNotifyProcessQueue')}
          </button>
        </div>
      )}

      {stats.failed > 0 ? (
        <div
          className={`rounded-xl border-2 p-4 flex flex-wrap items-center gap-3 ${
            darkMode ? 'border-red-700 bg-red-950/40 text-red-100' : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm font-semibold flex-1 min-w-[12rem]">
            {tm('msgNotifyFailedBanner').replace('{n}', String(stats.failed))}
          </p>
          <button
            type="button"
            onClick={openFailedQueueTab}
            className="inline-flex items-center gap-2 rounded-lg border border-red-400 px-3 py-2 text-sm font-bold"
          >
            <ListOrdered className="h-4 w-4" />
            {tm('msgNotifyFailedViewQueue')}
          </button>
          <button
            type="button"
            disabled={retryingFailed}
            onClick={() => void handleRetryFailedFromSend()}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-bold disabled:opacity-50"
          >
            {retryingFailed ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {tm('msgNotifyRetryFailed')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'send' as const, icon: Send, labelKey: 'msgNotifyTabSend' },
            { id: 'templates' as const, icon: FileText, labelKey: 'msgNotifyTabTemplates' },
            { id: 'special' as const, icon: CalendarDays, labelKey: 'msgNotifyTabSpecial' },
            { id: 'auto' as const, icon: Settings2, labelKey: 'msgNotifyTabAuto' },
            { id: 'queue' as const, icon: ListOrdered, labelKey: 'msgNotifyTabQueue' },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = mainTab === tab.id;
          const failedBadge = tab.id === 'queue' && stats.failed > 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === 'queue' && stats.failed > 0) setQueueInitialFilter('failed');
                else if (tab.id === 'queue') setQueueInitialFilter('all');
                setMainTab(tab.id);
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                active
                  ? failedBadge
                    ? 'border-red-500 bg-red-50 text-red-800'
                    : 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : darkMode
                    ? 'border-gray-600 text-gray-300'
                    : 'border-gray-200 text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tm(tab.labelKey)}
              {failedBadge ? (
                <span className="rounded-full bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {stats.failed}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {mainTab === 'templates' ? (
        <MsgTemplatesPanel panel={panel} inputCls={inputCls} labelCls={labelCls} />
      ) : null}
      {mainTab === 'special' ? (
        <MsgSpecialDaysPanel panel={panel} inputCls={inputCls} labelCls={labelCls} />
      ) : null}
      {mainTab === 'auto' ? (
        <MsgAutomationPanel panel={panel} inputCls={inputCls} labelCls={labelCls} />
      ) : null}
      {mainTab === 'queue' ? (
        <MsgQueueLogPanel
          panel={panel}
          inputCls={inputCls}
          labelCls={labelCls}
          initialFilter={queueInitialFilter}
        />
      ) : null}

      {mainTab === 'send' ? (
      <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className={`rounded-xl border p-4 space-y-4 ${panel}`}>
          <h2 className={`font-bold text-sm uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {tm('msgNotifyAudienceTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {audienceModes.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    if (m.id === 'single' && selectedIds.length > 1) {
                      setSelectedIds(selectedIds.slice(0, 1));
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : darkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tm(m.labelKey)}
                </button>
              );
            })}
          </div>

          {mode === 'birthday_upcoming' ? (
            <div>
              <label className={labelCls}>{tm('msgNotifyBirthdayUpcomingDays')}</label>
              <input
                type="number"
                min={1}
                max={60}
                className={inputCls}
                value={upcomingDays}
                onChange={(e) => setUpcomingDays(Number(e.target.value) || 7)}
              />
            </div>
          ) : null}

          {(mode === 'birthday_today' || mode === 'birthday_upcoming') && (
            <div className="space-y-2">
              <h3 className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {tm('msgNotifyBirthdayListTitle').replace('{n}', String(birthdayAudienceList.length))}
              </h3>
              <div
                className={`max-h-64 overflow-y-auto rounded-lg border divide-y ${
                  darkMode ? 'border-gray-600 divide-gray-700' : 'border-gray-200 divide-gray-100'
                }`}
              >
                {birthdayAudienceList.length === 0 ? (
                  <p className={`text-sm px-3 py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {tm('msgNotifyBirthdayListEmpty')}
                  </p>
                ) : (
                  birthdayAudienceList.map((c) => {
                    const days = daysUntilBirthday(c.birth_date);
                    return (
                      <div
                        key={c.id}
                        className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${
                          darkMode ? 'text-gray-100' : 'text-gray-800'
                        }`}
                      >
                        <Cake className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="text-xs text-gray-500 shrink-0">{c.phone}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {c.birth_date ? c.birth_date.slice(5) : '—'}
                        </span>
                        <span
                          className={`text-xs font-semibold ml-auto shrink-0 ${
                            days === 0
                              ? 'text-pink-600'
                              : darkMode
                                ? 'text-amber-300'
                                : 'text-amber-700'
                          }`}
                        >
                          {formatBirthdayDaysLabel(days)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mode !== 'birthday_today' &&
          mode !== 'birthday_upcoming' &&
          upcomingBirthdayAll.length > 0 ? (
            <div
              className={`rounded-lg border p-3 space-y-2 ${
                darkMode ? 'border-pink-800/60 bg-pink-950/20' : 'border-pink-200 bg-pink-50/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-pink-200' : 'text-pink-800'}`}>
                  {tm('msgNotifyBirthdayUpcomingPreview').replace(
                    '{n}',
                    String(upcomingBirthdayAll.length),
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setMode('birthday_upcoming')}
                  className="text-xs font-bold text-pink-700 hover:underline"
                >
                  {tm('msgNotifyBirthdayShowAsAudience')}
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {upcomingBirthdayPreview.map(({ c, days }) => (
                  <div
                    key={c.id}
                    className={`flex flex-wrap items-center gap-2 text-xs ${
                      darkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}
                  >
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-gray-500">{c.phone}</span>
                    <span className="text-gray-400">{c.birth_date ? c.birth_date.slice(5) : ''}</span>
                    <span className="ml-auto font-semibold text-amber-700">
                      {formatBirthdayDaysLabel(days)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(mode === 'group_include' || mode === 'group_exclude') && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-dashed border-gray-200">
              <div>
                <label className={labelCls}>{tm('msgNotifyFilterTier')}</label>
                <select
                  value={groupFilter.customer_tier ?? ''}
                  onChange={(e) =>
                    setGroupFilter((f) => ({ ...f, customer_tier: e.target.value || undefined }))
                  }
                  className={inputCls}
                >
                  <option value="">{tm('msgNotifyFilterAny')}</option>
                  <option value="normal">Normal</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{tm('msgNotifyFilterCity')}</label>
                <input
                  value={groupFilter.city ?? ''}
                  onChange={(e) => setGroupFilter((f) => ({ ...f, city: e.target.value || undefined }))}
                  className={inputCls}
                  placeholder={tm('msgNotifyFilterCityPh')}
                />
              </div>
              <div>
                <label className={labelCls}>{tm('msgNotifyFilterDistrict')}</label>
                <input
                  value={groupFilter.district ?? ''}
                  onChange={(e) =>
                    setGroupFilter((f) => ({ ...f, district: e.target.value || undefined }))
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tm('msgNotifyFilterHeardFrom')}</label>
                <input
                  value={groupFilter.heard_from ?? ''}
                  onChange={(e) =>
                    setGroupFilter((f) => ({ ...f, heard_from: e.target.value || undefined }))
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{tm('msgNotifyFilterGender')}</label>
                <select
                  value={groupFilter.gender ?? ''}
                  onChange={(e) =>
                    setGroupFilter((f) => ({ ...f, gender: e.target.value || undefined }))
                  }
                  className={inputCls}
                >
                  <option value="">{tm('msgNotifyFilterAny')}</option>
                  <option value="female">{tm('msgNotifyFilterGenderFemale')}</option>
                  <option value="male">{tm('msgNotifyFilterGenderMale')}</option>
                  <option value="other">{tm('msgNotifyFilterGenderOther')}</option>
                </select>
              </div>
            </div>
          )}

          {mode === 'follow_up_range' && (
            <div className="space-y-2">
              {followUpBulkRows.length === 0 ? (
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tm('msgNotifyFollowUpRangeEmpty')}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllFollowUps}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      {tm('msgNotifySelectAll')}
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      onClick={clearFollowUpSelection}
                      className="text-xs font-bold text-gray-500 hover:underline"
                    >
                      {tm('msgNotifyClearSelection')}
                    </button>
                    <span className={`text-xs ml-auto ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {tm('msgNotifySelectedCount').replace('{n}', String(selectedFollowUpRows.length))}
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {followUpBulkRows.map((r) => {
                      const key = followUpReminderKey(r);
                      const checked = selectedFollowUpKeys.includes(key);
                      const service =
                        r.reminder_kind === 'product' && r.product_name?.trim()
                          ? r.product_name.trim()
                          : r.service_name?.trim() || '—';
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-sm ${
                            checked ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFollowUp(key)}
                          />
                          <span className="font-medium truncate">{r.customer_name ?? '—'}</span>
                          <span className="text-xs text-gray-500 truncate">{service}</span>
                          <span className="text-xs text-gray-400 shrink-0">{r.due_date}</span>
                          <span className="text-xs text-gray-500 ml-auto shrink-0">{r.customer_phone}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
              <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {tm('msgNotifyFollowUpRangeAutoMsg')}
              </p>
            </div>
          )}

          {(mode === 'single' || mode === 'multiple') && (
            <div className="space-y-2">
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className={inputCls}
                placeholder={tm('msgNotifySearchCustomer')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFilteredCustomers}
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  {tm('msgNotifySelectAll')}
                </button>
                <span className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={clearCustomerSelection}
                  className="text-xs font-bold text-gray-500 hover:underline"
                >
                  {tm('msgNotifyClearSelection')}
                </button>
                <span className={`text-xs ml-auto ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tm('msgNotifySelectedCount').replace('{n}', String(selectedIds.length))}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {filteredCustomers.map((c) => {
                  const checked = selectedIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-sm ${
                        checked ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <input
                        type={mode === 'single' ? 'radio' : 'checkbox'}
                        checked={checked}
                        onChange={() => toggleCustomer(c.id)}
                        name="notify-customer"
                      />
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="text-xs text-gray-500 ml-auto shrink-0">{c.phone}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <p className={`text-sm font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
            {tm('msgNotifyRecipientCount').replace('{n}', String(resolvedCount))}
          </p>
          <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {tm('msgNotifyCountryCodePrefixHint').replace('{code}', defaultCountryCode)}
          </p>
        </div>

        <div className={`rounded-xl border p-4 space-y-4 ${panel}`}>
          <h2 className={`font-bold text-sm uppercase tracking-wide flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <MessageSquare className="h-4 w-4" />
            {tm('msgNotifyMessageTitle')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{tm('msgNotifyBulkLang')}</label>
              <select
                value={messageLang}
                onChange={(e) => handleMessageLangChange(e.target.value as WhatsAppMessageLang)}
                className={inputCls}
              >
                {WHATSAPP_MESSAGE_LANG_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {tm(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            {mode !== 'follow_up_range' ? (
              <div>
                <label className={labelCls}>{tm('msgNotifyTplPreset')}</label>
                <select
                  value={freeTextPreset}
                  onChange={(e) => handlePresetChange(e.target.value as WhatsAppFreeTextPresetId)}
                  className={inputCls}
                >
                  {WHATSAPP_FREE_TEXT_PRESET_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {tm(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-end">
                <p className={`text-xs pb-2.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tm('msgNotifyFollowUpTplHint')}
                </p>
              </div>
            )}
          </div>

          {mode !== 'follow_up_range' && (
            isMeta ? (
              <>
                <div>
                  <label className={labelCls}>{tm('msgNotifyMetaTemplate')}</label>
                  <select
                    value={metaTemplateId}
                    onChange={(e) => {
                      setFreeTextPreset('custom');
                      setMetaTemplateId(e.target.value);
                    }}
                    className={inputCls}
                  >
                    {metaTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} ({t.language})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedMetaTpl?.parameterLabels.map((lbl, i) => (
                  <div key={lbl}>
                    <label className={labelCls}>
                      {lbl} — {tm('msgNotifyParamHint')}
                    </label>
                    <input
                      value={metaParams[i] ?? ''}
                      onChange={(e) => {
                        const next = [...metaParams];
                        next[i] = e.target.value;
                        setMetaParams(next);
                      }}
                      className={inputCls}
                      placeholder={selectedMetaTpl.sampleValues[i] ?? ''}
                    />
                  </div>
                ))}
              </>
            ) : (
              <div>
                <label className={labelCls}>{tm('msgNotifyFreeText')}</label>
                <div className="mb-2">
<label className={labelCls}>{tm('msgNotifyCustomTplPick')}</label>
                <div className="flex gap-2 items-stretch">
                  <select
                    className={`${inputCls} flex-1`}
                    value={selectedCustomTplId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCustomTplId(id);
                      const tpl = customTemplates.find((t) => t.id === id);
                      if (tpl) {
                        setFreeTextPreset('custom');
                        // Şablon seçildiğinde aktif dilin body_text_<lang> kolonunu doldur;
                        // o dil kolonu boşsa fallback zinciri (ku→ar→en→tr) ile çözümle.
                        setMessageText(resolveTemplateBody(tpl, messageLang));
                      }
                    }}
                  >
                    <option value="">{tm('msgNotifyCustomTplNone')}</option>
                    {langFilteredCustomTemplates.length > 0 ? (
                      langFilteredCustomTemplates.map((t) => {
                        const trn = resolveTemplateTranslations(t);
                        const langBody = (trn[messageLang] ?? '').trim();
                        const previewSource =
                          langBody ||
                          (messageLang === 'tr'
                            ? t.body_text
                            : '') ||
                          '';
                        const preview = previewSource.slice(0, 60);
                        const langBadges = TPL_LANG_KEYS_M.filter(
                          (l) => (resolveTemplateTranslations(t)[l] ?? '').trim(),
                        )
                          .map((l) => l.toUpperCase())
                          .join('·');
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {preview ? ` — ${preview}` : ''}
                            {langBadges ? ` [${langBadges}]` : ''}
                          </option>
                        );
                      })
                    ) : (
                      <option value="" disabled>
                        {tm('msgNotifyCustomTplNoLang')}
                      </option>
                    )}
</select>
                  <button
                    type="button"
                    onClick={() => setTplEditorOpen(true)}
                    title={tm('msgTplEditorTitle')}
                    aria-label={tm('msgTplEditorTitle')}
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold shrink-0 ${
                      darkMode
                        ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">{tm('msgTplEditorTitle')}</span>
                  </button>
                </div>
                {customTemplates.length > 0 && langFilteredCustomTemplates.length === 0 ? (
                  <p className="text-[11px] text-amber-600 mt-1">
                    {tm('msgNotifyCustomTplNoLangHint')}
                  </p>
                ) : null}
                </div>
                <textarea
                  ref={messageBodyRef}
                  dir={messageLang === 'ar' || messageLang === 'ku' ? 'rtl' : 'ltr'}
                  value={messageText}
                  onChange={(e) => {
                    setFreeTextPreset('custom');
                    setSelectedCustomTplId('');
                    setMessageText(e.target.value);
                  }}
                  rows={5}
                  className={inputCls}
                />
                <p className="text-[11px] text-gray-500 mt-1">{tm('msgNotifyPlaceholderHint')}</p>
              </div>
            )
          )}

          <div className={`rounded-lg p-3 text-sm ${darkMode ? 'bg-gray-900' : 'bg-slate-100'}`}>
            <p className={`text-xs font-bold mb-1 ${labelCls}`}>{tm('msgNotifyPreview')}</p>
            <p
              dir={messageLang === 'ar' || messageLang === 'ku' ? 'rtl' : 'ltr'}
              className={darkMode ? 'text-gray-200' : 'text-gray-800'}
            >
              {previewMessage}
            </p>
          </div>

          <button
            type="button"
            disabled={sending || provider === 'NONE' || resolvedCount === 0}
            onClick={() => void handlePrepareSend()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {tm('msgNotifyReviewListButton').replace('{n}', String(resolvedCount))}
          </button>
        </div>
      </div>

      <div className={`rounded-xl border p-4 flex gap-3 items-start ${panel}`}>
        <Bell className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {tm('msgNotifyFooterHint')}
        </p>
      </div>
      </>
      ) : null}

      <WhatsAppBulkSendPreviewModal
        open={bulkPreviewOpen}
        items={bulkPreviewItems}
        title={bulkPreviewTitle}
        onClose={() => setBulkPreviewOpen(false)}
        onComplete={() => void handleBulkComplete()}
        onRebuildItems={rebuildBulkPreviewItems}
        initialMessageLang={messageLang}
        missingItems={bulkPreviewMissing}
      />
      <MessageTemplateEditorModal
        open={tplEditorOpen}
        templates={customTemplates}
        messageLang={messageLang}
        onChanged={() => void loadAll()}
        onAppendToMessage={handleAppendTemplateToMessage}
        onClose={() => setTplEditorOpen(false)}
      />
    </div>
  );
}
