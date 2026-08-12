/**
 * Mesaj Bildirim — müşterilere WhatsApp ile tekli / çoklu / toplu / grup bildirimi.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { messagingService } from '../../services/messaging/messagingService';
import {
  customerNotificationService,
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
} from '../../utils/followUpWhatsAppSend';
import { WhatsAppBulkSendPreviewModal } from '../shared/WhatsAppBulkSendPreviewModal';
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

export interface MesajBildirimModuleProps {
  embedded?: boolean;
  onClose?: () => void;
  followUpReminders?: BeautyFollowUpReminder[];
  dateStart?: string;
  dateEnd?: string;
}

type NotifyMode = CustomerNotifyAudience | 'follow_up_range';

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
  const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0 });

  const [mode, setMode] = useState<NotifyMode>(hasFollowUpContext ? 'follow_up_range' : 'single');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const [bulkPreviewTitle, setBulkPreviewTitle] = useState('');

  const panel = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = darkMode
    ? 'w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 p-2.5 text-sm'
    : 'w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm';
  const labelCls = darkMode ? 'text-xs font-medium text-gray-400' : 'text-xs font-medium text-gray-500';

  const metaTemplates = useMemo(() => customerNotificationService.getMetaTemplates(), []);
  const selectedMetaTpl = useMemo(
    () => metaTemplates.find((t) => t.id === metaTemplateId) ?? metaTemplates[0],
    [metaTemplates, metaTemplateId],
  );

  const isMeta = provider === 'META';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings, queueStats] = await Promise.all([
        customerNotificationService.listActiveCustomers(),
        customerNotificationService.getMessagingSettings(),
        messagingService.getQueueStats(),
      ]);
      setCustomers(list);
      setProvider((settings?.whatsapp_provider || 'NONE').toString().toUpperCase());
      setStats(queueStats);
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

  const [resolvedCount, setResolvedCount] = useState(0);

  useEffect(() => {
    if (mode === 'follow_up_range') {
      setResolvedCount(followUpBulkRows.length);
      return;
    }
    let cancelled = false;
    void customerNotificationService
      .resolveRecipients({ mode, customerIds: selectedIds, groupFilter })
      .then((rows) => {
        if (!cancelled) setResolvedCount(rows.length);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedIds, groupFilter, customers, followUpBulkRows.length]);

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
    if (mode === 'single' || mode === 'follow_up_range') {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handlePrepareSend = async () => {
    if (provider === 'NONE') {
      toast.error(tm('msgNotifyProviderOff'));
      return;
    }
    setSending(true);
    try {
      let items: WhatsAppBulkPreviewItem[] = [];
      if (mode === 'follow_up_range') {
        if (followUpBulkRows.length === 0) {
          toast.warning(tm('msgNotifyNoRecipients'));
          return;
        }
        items = await buildFollowUpBulkPreviewList(followUpReminders, { lang: messageLang });
        setBulkPreviewTitle(tm('msgNotifyModeFollowUpRange'));
      } else {
        const recipients = await customerNotificationService.resolveRecipients({
          mode: mode as CustomerNotifyAudience,
          customerIds: selectedIds,
          groupFilter,
        });
        if (recipients.length === 0) {
          toast.warning(tm('msgNotifyNoRecipients'));
          return;
        }
        items = await customerNotificationService.buildBulkPreviewItems({
          recipients,
          messageTemplate: messageText,
          metaTemplateId: isMeta ? metaTemplateId : undefined,
          metaManualParameters: isMeta ? metaParams : undefined,
          eventType: 'customer_broadcast',
        });
        setBulkPreviewTitle(tm('msgNotifyBulkPreviewSubtitle'));
      }
      if (!items.length) {
        toast.warning(tm('msgNotifyNoRecipients'));
        return;
      }
      setBulkPreviewItems(items);
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
        return buildFollowUpBulkPreviewList(followUpReminders, { lang });
      }
      const recipients = await customerNotificationService.resolveRecipients({
        mode: mode as CustomerNotifyAudience,
        customerIds: selectedIds,
        groupFilter,
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
    [mode, followUpReminders, selectedIds, groupFilter, isMeta, metaParams, freeTextPreset, messageText],
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

  const openWhatsAppSettings = () => {
    window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'whatsapp' }));
  };

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
            </div>
          )}

          {mode === 'follow_up_range' && (
            <div className="space-y-2">
              {followUpBulkRows.length === 0 ? (
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {tm('msgNotifyFollowUpRangeEmpty')}
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {followUpBulkRows.map((r) => {
                    const service =
                      r.reminder_kind === 'product' && r.product_name?.trim()
                        ? r.product_name.trim()
                        : r.service_name?.trim() || '—';
                    return (
                      <div
                        key={`${r.customer_id}-${r.service_id}-${r.due_date}-${r.product_id ?? ''}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span className="font-medium truncate">{r.customer_name ?? '—'}</span>
                        <span className="text-xs text-gray-500 truncate">{service}</span>
                        <span className="text-xs text-gray-400 shrink-0">{r.due_date}</span>
                        <span className="text-xs text-gray-500 ml-auto shrink-0">{r.customer_phone}</span>
                      </div>
                    );
                  })}
                </div>
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
              <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {filteredCustomers.slice(0, 80).map((c) => {
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
                <textarea
                  value={messageText}
                  onChange={(e) => {
                    setFreeTextPreset('custom');
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
            <p className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{previewMessage}</p>
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

      <WhatsAppBulkSendPreviewModal
        open={bulkPreviewOpen}
        items={bulkPreviewItems}
        title={bulkPreviewTitle}
        onClose={() => setBulkPreviewOpen(false)}
        onComplete={() => void handleBulkComplete()}
        onRebuildItems={rebuildBulkPreviewItems}
        initialMessageLang={messageLang}
      />
    </div>
  );
}
