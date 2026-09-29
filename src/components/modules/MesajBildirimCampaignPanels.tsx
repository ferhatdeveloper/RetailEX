/**
 * Mesaj Bildirim — şablon / özel gün / otomasyon / kuyruk panelleri.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  messageTemplateService,
  splitHeadlineAndBody,
  composeHeadlineAndBody,
  type MessageTemplateRow,
} from '../../services/messaging/messageTemplateService';
import {
  specialDayService,
  type SpecialDayRow,
} from '../../services/messaging/specialDayService';
import { messagingService } from '../../services/messaging/messagingService';
import {
  listSendLog,
  type NotificationSendLogRow,
} from '../../services/messaging/notificationSendLogService';
import type { MessagingSettings, NotificationQueueRow } from '../../services/messaging/messagingTypes';
import { MessagingCountryCodeSelect } from '../shared/MessagingCountryCodeSelect';
import { sanitizeCountryCode } from '../../services/messaging/messagingCountryCodes';

type PanelProps = {
  panel: string;
  inputCls: string;
  labelCls: string;
};

export function MsgTemplatesPanel({ panel, inputCls, labelCls }: PanelProps) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const [rows, setRows] = useState<MessageTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [headline, setHeadline] = useState('');
  const [category, setCategory] = useState('general');
  const [editId, setEditId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'separate' | 'combined'>('separate');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await messageTemplateService.list(false));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditId(null);
    setName('');
    setBody('');
    setHeadline('');
    setInputMode('separate');
    setCategory('general');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning(tm('msgNotifyTplRequired'));
      return;
    }
    const composed =
      inputMode === 'separate'
        ? composeHeadlineAndBody(headline, body)
        : body;
    if (!composed.trim()) {
      toast.warning(tm('msgNotifyTplRequired'));
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await messageTemplateService.update(editId, {
          name: name.trim(),
          body_text: composed,
          category,
        });
        toast.success(tm('msgNotifyTplUpdated'));
      } else {
        await messageTemplateService.create({
          name: name.trim(),
          body_text: composed,
          category,
        });
        toast.success(tm('msgNotifyTplCreated'));
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (r: MessageTemplateRow) => {
    setEditId(r.id);
    setName(r.name);
    const split = splitHeadlineAndBody(r.body_text);
    if (split.headline) {
      setInputMode('separate');
      setHeadline(split.headline);
      setBody(split.body);
    } else {
      setInputMode('combined');
      setHeadline('');
      setBody(r.body_text);
    }
    setCategory(r.category || 'general');
  };

  const handleDelete = async (id: string) => {
    try {
      await messageTemplateService.remove(id);
      toast.success(tm('msgNotifyTplDeleted'));
      if (editId === id) resetForm();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tm('msgNotifyLoading')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className={`rounded-xl border p-4 space-y-3 ${panel}`}>
        <h3 className={`text-sm font-bold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {editId ? tm('msgNotifyTplEdit') : tm('msgNotifyTplNew')}
        </h3>
        <div>
          <label className={labelCls}>{tm('msgNotifyTplName')}</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{tm('msgNotifyTplCategory')}</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="general">{tm('msgNotifyTplCatGeneral')}</option>
            <option value="birthday">{tm('msgNotifyTplCatBirthday')}</option>
            <option value="special_day">{tm('msgNotifyTplCatSpecial')}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{tm('msgNotifyTplInputMode')}</label>
          <div className={`inline-flex rounded-lg border overflow-hidden text-xs font-semibold ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <button
              type="button"
              onClick={() => setInputMode('separate')}
              className={`px-3 py-1.5 transition ${
                inputMode === 'separate'
                  ? 'bg-emerald-600 text-white'
                  : darkMode
                    ? 'text-gray-200 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tm('msgNotifyTplModeSeparate')}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('combined')}
              className={`px-3 py-1.5 transition border-l ${darkMode ? 'border-gray-600' : 'border-gray-200'} ${
                inputMode === 'combined'
                  ? 'bg-emerald-600 text-white'
                  : darkMode
                    ? 'text-gray-200 hover:bg-gray-700'
                    : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tm('msgNotifyTplModeCombined')}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{tm('msgNotifyTplInputModeHint')}</p>
        </div>
        {inputMode === 'separate' ? (
          <>
            <div>
              <label className={labelCls}>{tm('msgNotifyTplHeadline')}</label>
              <input
                className={inputCls}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={tm('msgNotifyTplHeadlinePh')}
                maxLength={120}
              />
              <p className="text-[11px] text-gray-500 mt-1">{tm('msgNotifyTplHeadlineHint')}</p>
            </div>
            <div>
              <label className={labelCls}>{tm('msgNotifyTplBody')}</label>
              <textarea
                className={`${inputCls} min-h-[120px]`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="{customer_name} {birth_date} {special_day_name} {date}"
              />
              <p className="text-xs text-gray-500 mt-1">{tm('msgNotifyTplPlaceholders')}</p>
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls}>{tm('msgNotifyTplCombined')}</label>
            <textarea
              className={`${inputCls} min-h-[140px]`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={tm('msgNotifyTplCombinedPh')}
            />
            <p className="text-[11px] text-gray-500 mt-1">{tm('msgNotifyTplCombinedHint')}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tm('msgNotifySave')}
          </button>
          {editId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-3 py-2 text-sm font-medium"
            >
              {tm('msgNotifyCancel')}
            </button>
          ) : null}
        </div>
      </div>
      <div className={`rounded-xl border p-4 space-y-2 ${panel}`}>
        <h3 className={`text-sm font-bold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {tm('msgNotifyTplList')}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{tm('msgNotifyTplEmpty')}</p>
        ) : (
          <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {rows.map((r) => {
              const split = splitHeadlineAndBody(r.body_text);
              const preview = split.headline ? split.body : r.body_text;
              return (
              <li key={r.id} className="py-2 flex items-start gap-2">
                <button
                  type="button"
                  className="flex-1 text-left min-w-0"
                  onClick={() => handleEdit(r)}
                >
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <div className="text-xs text-gray-500 truncate">{r.category}</div>
                  {split.headline ? (
                    <div className="text-xs font-semibold text-blue-600 truncate">
                      {split.headline}
                    </div>
                  ) : null}
                  <div className="text-xs text-gray-400 line-clamp-2">{preview}</div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  aria-label="delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MsgSpecialDaysPanel({ panel, inputCls, labelCls }: PanelProps) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const [rows, setRows] = useState<SpecialDayRow[]>([]);
  const [templates, setTemplates] = useState<MessageTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    month: 1,
    day: 1,
    days_before: 0,
    send_time: '10:00',
    template_id: '',
    gender_filter: '',
    is_active: true,
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Taslaklar (is_active=false) listeye dahil; şablon dropdown’da tüm şablonlar
      const [days, tpls] = await Promise.all([
        specialDayService.list(false),
        messageTemplateService.list(false),
      ]);
      setRows(days);
      setTemplates(tpls);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditId(null);
    setForm({
      name: '',
      month: 1,
      day: 1,
      days_before: 0,
      send_time: '10:00',
      template_id: '',
      gender_filter: '',
      is_active: true,
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning(tm('msgNotifySpecialNameRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        month: form.month,
        day: form.day,
        days_before: form.days_before,
        send_time: form.send_time,
        template_id: form.template_id || null,
        gender_filter: form.gender_filter || null,
        is_active: form.is_active,
      };
      if (editId) {
        await specialDayService.update(editId, payload);
        toast.success(tm('msgNotifySpecialUpdated'));
      } else {
        await specialDayService.create(payload);
        toast.success(tm('msgNotifySpecialCreated'));
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tm('msgNotifyLoading')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className={`rounded-xl border p-4 space-y-3 ${panel}`}>
        <h3 className={`text-sm font-bold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {editId ? tm('msgNotifySpecialEdit') : tm('msgNotifySpecialNew')}
        </h3>
        <div>
          <label className={labelCls}>{tm('msgNotifySpecialName')}</label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{tm('msgNotifySpecialMonth')}</label>
            <input
              type="number"
              min={1}
              max={12}
              className={inputCls}
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) || 1 }))}
            />
          </div>
          <div>
            <label className={labelCls}>{tm('msgNotifySpecialDay')}</label>
            <input
              type="number"
              min={1}
              max={31}
              className={inputCls}
              value={form.day}
              onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) || 1 }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{tm('msgNotifySpecialDaysBefore')}</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.days_before}
              onChange={(e) => setForm((f) => ({ ...f, days_before: Number(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <label className={labelCls}>{tm('msgNotifySpecialSendTime')}</label>
            <input
              type="time"
              className={inputCls}
              value={form.send_time}
              onChange={(e) => setForm((f) => ({ ...f, send_time: e.target.value || '10:00' }))}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>{tm('msgNotifySpecialTemplate')}</label>
          <select
            className={inputCls}
            value={form.template_id}
            onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
          >
            <option value="">{tm('msgNotifySpecialTplDefault')}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{tm('msgNotifyFilterGender')}</label>
          <select
            className={inputCls}
            value={form.gender_filter}
            onChange={(e) => setForm((f) => ({ ...f, gender_filter: e.target.value }))}
          >
            <option value="">{tm('msgNotifyFilterAny')}</option>
            <option value="female">{tm('msgNotifyFilterGenderFemale')}</option>
            <option value="male">{tm('msgNotifyFilterGenderMale')}</option>
            <option value="other">{tm('msgNotifyFilterGenderOther')}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
            {tm('msgNotifySpecialActive')}
          </span>
        </label>
        {!form.is_active ? (
          <p className="text-xs text-amber-600">{tm('msgNotifySpecialDraftHint')}</p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {tm('msgNotifySave')}
        </button>
      </div>
      <div className={`rounded-xl border p-4 space-y-2 ${panel}`}>
        <h3 className={`text-sm font-bold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {tm('msgNotifySpecialList')}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{tm('msgNotifySpecialEmpty')}</p>
        ) : (
          <ul className="divide-y max-h-96 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex gap-2 items-start">
                <button
                  type="button"
                  className="flex-1 text-left text-sm"
                  onClick={() => {
                    setEditId(r.id);
                    setForm({
                      name: r.name,
                      month: r.month,
                      day: r.day,
                      days_before: r.days_before,
                      send_time: r.send_time || '10:00',
                      template_id: r.template_id || '',
                      gender_filter: r.gender_filter || '',
                      is_active: r.is_active !== false,
                    });
                  }}
                >
                  <div className="font-medium flex flex-wrap items-center gap-2">
                    <span>{r.name}</span>
                    {r.is_active === false ? (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800">
                        {tm('msgNotifyDraft')}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    {String(r.month).padStart(2, '0')}/{String(r.day).padStart(2, '0')} · −
                    {r.days_before}g · {r.send_time}
                    {r.gender_filter ? ` · ${r.gender_filter}` : ''}
                  </div>
                </button>
                <button
                  type="button"
                  className="p-1.5 text-red-500"
                  onClick={() =>
                    void specialDayService.remove(r.id).then(load).catch((e: unknown) => {
                      toast.error(e instanceof Error ? e.message : String(e));
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function MsgAutomationPanel({ panel, inputCls, labelCls }: PanelProps) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [templates, setTemplates] = useState<MessageTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        messagingService.getSettings(),
        messageTemplateService.list(true),
      ]);
      setSettings(s);
      setTemplates(t);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (partial: Partial<MessagingSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await messagingService.updateSettings({
        default_country_code: sanitizeCountryCode(settings.default_country_code, '90'),
        birthday_enabled: settings.birthday_enabled === true,
        birthday_mode: settings.birthday_mode || 'today',
        birthday_upcoming_days: Number(settings.birthday_upcoming_days ?? 7) || 7,
        birthday_send_time: settings.birthday_send_time || '10:00',
        birthday_template_id: settings.birthday_template_id || null,
        birthday_gift_text: settings.birthday_gift_text ?? null,
        birthday_upcoming_exact: settings.birthday_upcoming_exact === true,
        auto_campaign_enabled: settings.auto_campaign_enabled === true,
      });
      toast.success(tm('msgNotifyAutoSaved'));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tm('msgNotifyLoading')}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 space-y-4 max-w-xl ${panel}`}>
      <h3 className={`text-sm font-bold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        {tm('msgNotifyAutoTitle')}
      </h3>
      <p className="text-xs text-gray-500">{tm('msgNotifyAutoHint')}</p>

      <MessagingCountryCodeSelect
        value={settings.default_country_code || '90'}
        onChange={(code) => patch({ default_country_code: sanitizeCountryCode(code, '90') })}
        inputCls={inputCls}
        labelCls={labelCls}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.auto_campaign_enabled === true}
          onChange={(e) => patch({ auto_campaign_enabled: e.target.checked })}
        />
        {tm('msgNotifyAutoEnable')}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.birthday_enabled === true}
          onChange={(e) => patch({ birthday_enabled: e.target.checked })}
        />
        {tm('msgNotifyBirthdayEnable')}
      </label>

      <div>
        <label className={labelCls}>{tm('msgNotifyBirthdayMode')}</label>
        <select
          className={inputCls}
          value={settings.birthday_mode || 'today'}
          onChange={(e) => patch({ birthday_mode: e.target.value })}
        >
          <option value="today">{tm('msgNotifyModeBirthdayToday')}</option>
          <option value="upcoming">{tm('msgNotifyModeBirthdayUpcoming')}</option>
          <option value="both">{tm('msgNotifyBirthdayBoth')}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{tm('msgNotifyBirthdayUpcomingDays')}</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={Number(settings.birthday_upcoming_days ?? 7)}
            onChange={(e) => patch({ birthday_upcoming_days: Number(e.target.value) || 7 })}
          />
        </div>
        <div>
          <label className={labelCls}>{tm('msgNotifyBirthdaySendTime')}</label>
          <input
            type="time"
            className={inputCls}
            value={settings.birthday_send_time || '10:00'}
            onChange={(e) => patch({ birthday_send_time: e.target.value || '10:00' })}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>{tm('msgNotifyBirthdayTemplate')}</label>
        <select
          className={inputCls}
          value={settings.birthday_template_id || ''}
          onChange={(e) => patch({ birthday_template_id: e.target.value || null })}
        >
          <option value="">{tm('msgNotifySpecialTplDefault')}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>{tm('msgNotifyBirthdayGift')}</label>
        <input
          className={inputCls}
          value={settings.birthday_gift_text ?? ''}
          onChange={(e) => patch({ birthday_gift_text: e.target.value || null })}
          placeholder={tm('msgNotifyBirthdayGiftPh')}
        />
        <p className="text-xs text-gray-500 mt-1">{tm('msgNotifyBirthdayGiftHint')}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.birthday_upcoming_exact === true}
          onChange={(e) => patch({ birthday_upcoming_exact: e.target.checked })}
        />
        {tm('msgNotifyBirthdayExactDays')}
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {tm('msgNotifySave')}
      </button>
    </div>
  );
}

type QueueStatusFilter = 'all' | 'failed' | 'pending' | 'sent';

function queueStatusLabel(
  status: string,
  tm: (key: string) => string,
  scheduledFuture: boolean,
): string {
  if (scheduledFuture) return tm('msgNotifyScheduleLater');
  if (status === 'failed') return tm('msgNotifyQueueStatusFailed');
  if (status === 'pending') return tm('msgNotifyQueueStatusPending');
  if (status === 'sent') return tm('msgNotifyQueueStatusSent');
  return status;
}

function queueRowTime(r: NotificationQueueRow): string {
  const raw = r.sent_at || r.created_at;
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return String(raw);
  }
}

export function MsgQueueLogPanel({
  panel,
  inputCls: _inputCls,
  labelCls: _labelCls,
  initialFilter = 'all',
}: PanelProps & { initialFilter?: QueueStatusFilter }) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const [queue, setQueue] = useState<NotificationQueueRow[]>([]);
  const [logs, setLogs] = useState<NotificationSendLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>(initialFilter);

  useEffect(() => {
    setStatusFilter(initialFilter);
  }, [initialFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, l] = await Promise.all([messagingService.listQueue(120), listSendLog(50)]);
      setQueue(q);
      setLogs(l);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failedRows = queue.filter((r) => r.status === 'failed');
  const filteredQueue =
    statusFilter === 'all' ? queue : queue.filter((r) => r.status === statusFilter);

  const handleProcess = async () => {
    setBusy(true);
    try {
      const r = await messagingService.processPendingQueue(30);
      toast.success(tm('msgNotifyQueueProcessed').replace('{n}', String(r.processed)));
      if (r.errors.length) toast.error(r.errors.slice(0, 2).join(' · '));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryFailed = async () => {
    setBusy(true);
    try {
      const n = await messagingService.retryFailedNotifications();
      toast.success(tm('msgNotifyRetryDone').replace('{n}', String(n)));
      setStatusFilter('pending');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderQueueRow = (r: NotificationQueueRow, emphasizeFailed = false) => {
    const scheduledFuture =
      r.status === 'pending' &&
      r.scheduled_at &&
      new Date(r.scheduled_at).getTime() > Date.now();
    const timeLabel = queueRowTime(r);
    return (
      <div
        key={r.id}
        className={`py-2 ${emphasizeFailed || r.status === 'failed' ? (darkMode ? 'bg-red-950/40 px-2 rounded-lg' : 'bg-red-50 px-2 rounded-lg') : ''}`}
      >
        <div className="flex flex-wrap gap-2 items-center">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              r.status === 'sent'
                ? 'bg-emerald-100 text-emerald-800'
                : r.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : scheduledFuture
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-amber-100 text-amber-800'
            }`}
          >
            {queueStatusLabel(String(r.status), tm, Boolean(scheduledFuture))}
          </span>
          <span className={`font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {r.recipient_name || '—'}
          </span>
          <span className="text-gray-500">{r.recipient_phone || '—'}</span>
          {timeLabel ? (
            <span className="text-xs text-gray-400 shrink-0">{timeLabel}</span>
          ) : null}
          <span className="text-xs text-gray-400 ml-auto">{r.event_type}</span>
        </div>
        {r.scheduled_at ? (
          <p className="text-xs text-violet-700 mt-0.5">
            {tm('msgNotifyScheduleAt').replace('{when}', new Date(r.scheduled_at).toLocaleString())}
          </p>
        ) : null}
        {r.error_text ? (
          <p className={`text-xs mt-1 break-words font-medium ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
            {r.error_text}
          </p>
        ) : null}
        <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{r.message_text}</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tm('msgNotifyLoading')}
      </div>
    );
  }

  const filterBtns: Array<{ id: QueueStatusFilter; labelKey: string; count?: number }> = [
    { id: 'all', labelKey: 'msgNotifyQueueFilterAll', count: queue.length },
    { id: 'failed', labelKey: 'msgNotifyQueueFilterFailed', count: failedRows.length },
    {
      id: 'pending',
      labelKey: 'msgNotifyQueueFilterPending',
      count: queue.filter((r) => r.status === 'pending').length,
    },
    {
      id: 'sent',
      labelKey: 'msgNotifyQueueFilterSent',
      count: queue.filter((r) => r.status === 'sent').length,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleProcess()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {tm('msgNotifyProcessQueue')}
        </button>
        <button
          type="button"
          disabled={busy || failedRows.length === 0}
          onClick={() => void handleRetryFailed()}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            failedRows.length > 0
              ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-300'
              : 'border'
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          {tm('msgNotifyRetryFailed')}
          {failedRows.length > 0 ? ` (${failedRows.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border px-3 py-2 text-sm font-medium"
        >
          {tm('msgNotifyRefresh')}
        </button>
      </div>

      {failedRows.length > 0 ? (
        <div
          className={`rounded-xl border-2 p-4 ${
            darkMode ? 'border-red-700 bg-red-950/30' : 'border-red-300 bg-red-50'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div>
              <h3 className={`text-sm font-bold uppercase ${darkMode ? 'text-red-200' : 'text-red-800'}`}>
                {tm('msgNotifyFailedSectionTitle').replace('{n}', String(failedRows.length))}
              </h3>
              <p className={`text-xs mt-1 ${darkMode ? 'text-red-300/80' : 'text-red-700'}`}>
                {tm('msgNotifyFailedSectionHint')}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRetryFailed()}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-bold disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {tm('msgNotifyRetryFailed')}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-red-200/60 text-sm">
            {failedRows.map((r) => renderQueueRow(r, true))}
          </div>
        </div>
      ) : null}

      <div className={`rounded-xl border p-4 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className={`text-sm font-bold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {tm('msgNotifyQueueTitle')}
          </h3>
          <div className="flex flex-wrap gap-1">
            {filterBtns.map((f) => {
              const active = statusFilter === f.id;
              const isFailed = f.id === 'failed';
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold border transition ${
                    active
                      ? isFailed
                        ? 'border-red-500 bg-red-100 text-red-800'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : darkMode
                        ? 'border-gray-600 text-gray-300'
                        : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {tm(f.labelKey)}
                  {typeof f.count === 'number' ? ` (${f.count})` : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y text-sm">
          {filteredQueue.length === 0 ? (
            <p className="text-gray-500 py-2">
              {statusFilter === 'failed' ? tm('msgNotifyFailedEmpty') : tm('msgNotifyQueueEmpty')}
            </p>
          ) : (
            filteredQueue.map((r) => renderQueueRow(r))
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${panel}`}>
        <h3 className={`text-sm font-bold uppercase mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {tm('msgNotifySendLogTitle')}
        </h3>
        <div className="max-h-56 overflow-y-auto divide-y text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-500 py-2">{tm('msgNotifySendLogEmpty')}</p>
          ) : (
            logs.map((r) => (
              <div key={r.id} className="py-2 flex flex-wrap gap-2">
                <span className="text-xs font-mono text-gray-500">{r.campaign_key}</span>
                <span className="font-medium">{r.phone}</span>
                <span className="text-xs text-emerald-700">{r.status}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {r.sent_at ? new Date(r.sent_at).toLocaleString() : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
