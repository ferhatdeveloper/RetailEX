import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, Select, Input, Rate, Radio, Button, Spin, Empty, Alert } from 'antd';
import { MessageCircle, ClipboardList, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { RetailExFlatModal, RetailExFlatFieldLabel } from '../shared/RetailExFlatModal';
import { beautyService } from '../../services/beautyService';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { normalizePhoneDigits, sendWhatsAppText } from '../../services/messaging/clinicMessaging';
import type { ClinicMessagingPortalConfig } from '../../services/messaging/clinicMessaging';
import type {
  BeautyAppointment,
  BeautyCustomerFeedback,
  BeautySatisfactionQuestion,
  BeautySurveyAnswer,
  SatisfactionLangCode,
} from '../../types/beauty';
import { useBeautyStore } from '../beauty/store/useBeautyStore';
import { beautyAppointmentDateKey } from '../../utils/dateLocal';

function appointmentTimeHHmm(apt: BeautyAppointment): string {
  const raw = String(apt.appointment_time ?? apt.time ?? '').trim();
  if (!raw) return '09:00';
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '09:00';
  const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
  const mm = String(Math.min(59, parseInt(m[2], 10))).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** RetailExFlatModal ~2147483646; antd Select popup aynı veya altında kalmasın */
const ANT_SELECT_POPUP_Z = 2147483647;
const antSelectInFlatModal = {
  getPopupContainer: () => document.body,
  styles: { popup: { root: { zIndex: ANT_SELECT_POPUP_Z } as React.CSSProperties } },
} as const;

function ctxReplace(
  template: string,
  ctx: { name: string; service: string; date: string; time: string }
): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = ctx[k as keyof typeof ctx];
    return v != null ? String(v) : '';
  });
}

const CRM_PRESET_KEYS = [
  'crmPresetCallNoAnswer',
  'crmPresetCallAnswered',
  'crmPresetAppointmentCreated',
  'crmPresetWhatsappSent',
  'crmPresetSmsSent',
  'crmPresetCallbackRequested',
  'crmPresetVoicemail',
] as const;

type WaPresetId = 'thank_you' | 'survey_invite' | 'followup' | 'reminder_next';

const WA_BODY: Record<WaPresetId, Record<SatisfactionLangCode, string>> = {
  thank_you: {
    tr: 'Merhaba {name}, {service} için teşekkür ederiz. Görüşmek dileğiyle.',
    en: 'Hello {name}, thank you for choosing {service}. Hope to see you again.',
    ar: 'مرحبًا {name}، شكرًا لزيارتك لخدمة {service}.',
    ku: 'سڵاو {name}، سوپاس بۆ هەڵبژاردنی {service}.',
  },
  survey_invite: {
    tr: 'Merhaba {name}, {date} tarihindeki {service} randevunuzla ilgili kısa görüşünüzü önemsiyoruz. Anketimize katılırsanız seviniriz.',
    en: 'Hello {name}, we would love your quick feedback about your {service} visit on {date}.',
    ar: 'مرحبًا {name}، نقدّر رأيك بخصوص {service} في {date}.',
    ku: 'سڵاو {name}، ڕای تۆ بۆ {service} لە {date} گرنگە.',
  },
  followup: {
    tr: 'Merhaba {name}, {service} sonrası memnuniyetinizi öğrenmek isteriz. İyi günler dileriz.',
    en: 'Hi {name}, we would like to know how you feel after {service}. Have a great day.',
    ar: 'مرحبًا {name}، نود معرفة رضاك بعد {service}.',
    ku: 'سڵاو {name}، دوای {service} حاڵەت چۆنە؟',
  },
  reminder_next: {
    tr: 'Merhaba {name}, bir sonraki {service} seansınız için uygun tarihi birlikte planlayalım. {time}',
    en: 'Hello {name}, let us schedule your next {service} session. {time}',
    ar: 'مرحبًا {name}، لنحدد موعد الجلسة التالية لـ {service}.',
    ku: 'سڵاو {name}، بۆ جولەی داهاتووی {service} بەردەست بمێنەوە.',
  },
};

function questionLabel(q: BeautySatisfactionQuestion, lang: SatisfactionLangCode): string {
  const j = q.labels_json;
  const raw = (j?.[lang] || j?.tr || j?.en || j?.ar || j?.ku || '').trim();
  return raw || '—';
}

function toSurveyAnswers(
  questions: BeautySatisfactionQuestion[],
  map: Map<string, BeautySurveyAnswer>
): BeautySurveyAnswer[] {
  return questions.map(q => {
    const a = map.get(q.id);
    const label_snapshot = questionLabel(q, 'tr');
    if (a) return { ...a, label_snapshot: a.label_snapshot || label_snapshot };
    return {
      question_id: q.id,
      rating: q.question_type === 'rating' ? 5 : undefined,
      text: q.question_type === 'text' ? '' : undefined,
      yes_no: q.question_type === 'yes_no' ? true : undefined,
      label_snapshot,
    };
  });
}

export type BeautyServiceReportCrmModalProps = {
  open: boolean;
  onClose: () => void;
  appointment: BeautyAppointment | null;
  accentColor?: string;
  onSaved?: () => void;
};

export function BeautyServiceReportCrmModal({
  open,
  onClose,
  appointment,
  accentColor = '#ec4899',
  onSaved,
}: BeautyServiceReportCrmModalProps) {
  const { user } = useAuth();
  const { tm, language } = useLanguage();
  const loadLeads = useBeautyStore(s => s.loadLeads);
  const lang: SatisfactionLangCode =
    language === 'en' || language === 'ar' || language === 'ku' || language === 'tr' ? language : 'tr';

  const [tab, setTab] = useState<'activity' | 'satisfaction' | 'whatsapp'>('activity');
  const [loading, setLoading] = useState(false);
  const [crmActivities, setCrmActivities] = useState<{ id: string; created_at: string; payload_json: Record<string, unknown> }[]>([]);
  const [crmPreset, setCrmPreset] = useState<string>(CRM_PRESET_KEYS[0]);
  const [crmNote, setCrmNote] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);

  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BeautySatisfactionQuestion[]>([]);
  const [answerMap, setAnswerMap] = useState<Map<string, BeautySurveyAnswer>>(new Map());
  const [serviceRating, setServiceRating] = useState(5);
  const [staffRating, setStaffRating] = useState(5);
  const [cleanRating, setCleanRating] = useState(5);
  const [overallRating, setOverallRating] = useState(5);
  const [comment, setComment] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const [phone, setPhone] = useState('');
  const [waLang, setWaLang] = useState<SatisfactionLangCode>(lang);
  const [waPreset, setWaPreset] = useState<WaPresetId>('survey_invite');
  const [waText, setWaText] = useState('');
  const [sendingWa, setSendingWa] = useState(false);

  const customerId = appointment?.customer_id ?? appointment?.client_id ?? '';
  const aptId = appointment?.id ?? '';

  const waCtx = useMemo(() => {
    const name = String(appointment?.customer_name ?? '').trim() || 'Müşteri';
    const service = String(appointment?.service_name ?? '').trim() || 'Hizmet';
    const date = String(appointment?.date ?? appointment?.appointment_date ?? '').trim() || '—';
    const time = String(appointment?.time ?? appointment?.appointment_time ?? '').trim().slice(0, 5) || '';
    return { name, service, date, time };
  }, [appointment]);

  const loadAll = useCallback(async () => {
    if (!appointment?.id) return;
    setLoading(true);
    try {
      const [sq, acts] = await Promise.all([
        beautyService.getActiveSatisfactionSurveyWithQuestions(),
        beautyService.getCrmActivitiesForAppointment(appointment.id),
      ]);
      setCrmActivities(acts);
      setSurveyId(sq.survey?.id ?? null);
      setQuestions(sq.questions ?? []);

      if (customerId) {
        const [fb, contact] = await Promise.all([
          beautyService.getFeedbackForAppointment(appointment.id),
          beautyService.getCustomerContact(customerId),
        ]);
        if (contact?.phone) setPhone(contact.phone);
        else if (appointment && 'phone' in appointment && (appointment as { phone?: string }).phone) {
          setPhone(String((appointment as { phone?: string }).phone));
        }

        if (fb) {
          setServiceRating(fb.service_rating ?? 5);
          setStaffRating(fb.staff_rating ?? 5);
          setCleanRating(fb.cleanliness_rating ?? 5);
          setOverallRating(fb.overall_rating ?? 5);
          setComment(fb.comment ?? '');
          setWouldRecommend(fb.would_recommend !== false);
          const m = new Map<string, BeautySurveyAnswer>();
          if (fb.survey_answers?.length) {
            for (const a of fb.survey_answers) m.set(a.question_id, a);
          }
          setAnswerMap(m);
        } else {
          setServiceRating(5);
          setStaffRating(5);
          setCleanRating(5);
          setOverallRating(5);
          setComment('');
          setWouldRecommend(true);
          setAnswerMap(new Map());
        }
      } else {
        setServiceRating(5);
        setStaffRating(5);
        setCleanRating(5);
        setOverallRating(5);
        setComment('');
        setWouldRecommend(true);
        setAnswerMap(new Map());
      }
    } catch (e) {
      console.error('[BeautyServiceReportCrmModal]', e);
      toast.error(tm('saveError'));
    } finally {
      setLoading(false);
    }
  }, [appointment, customerId, tm]);

  useEffect(() => {
    if (!open || !appointment?.id) return;
    void loadAll();
  }, [open, appointment?.id, loadAll]);

  useEffect(() => {
    const base = WA_BODY[waPreset]?.[waLang] ?? WA_BODY[waPreset]?.tr ?? '';
    setWaText(ctxReplace(base, waCtx));
  }, [waPreset, waLang, waCtx]);

  const setAnswerFor = (qid: string, patch: Partial<BeautySurveyAnswer>) => {
    setAnswerMap(prev => {
      const n = new Map(prev);
      const cur = n.get(qid) ?? { question_id: qid };
      n.set(qid, { ...cur, ...patch, question_id: qid });
      return n;
    });
  };

  const handleSaveActivity = async () => {
    if (!aptId) return;
    setSavingActivity(true);
    try {
      const labelBase = tm(crmPreset as (typeof CRM_PRESET_KEYS)[number]);
      const line = crmNote.trim() ? `${labelBase}: ${crmNote.trim()}` : labelBase;
      await beautyService.logCrmActivity(aptId, user?.id ?? null, {
        preset: crmPreset,
        note: crmNote.trim() || undefined,
        label: line,
      });
      if (customerId) {
        await beautyService.syncCrmActivityToLeadNotes(customerId, line);
        void loadLeads();
      }
      setCrmNote('');
      const acts = await beautyService.getCrmActivitiesForAppointment(aptId);
      setCrmActivities(acts);
      toast.success(tm('operationSavedSuccessfully'));
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error(tm('saveError'));
    } finally {
      setSavingActivity(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!aptId || !customerId) {
      toast.error(tm('beautyCrmNeedCustomer'));
      return;
    }
    setSavingFeedback(true);
    try {
      const answers = toSurveyAnswers(questions, answerMap).map(a => {
        const q = questions.find(x => x.id === a.question_id);
        return {
          ...a,
          label_snapshot: a.label_snapshot || (q ? questionLabel(q, lang) : ''),
        };
      });
      await beautyService.upsertFeedbackForAppointment({
        appointment_id: aptId,
        customer_id: customerId,
        service_rating: serviceRating,
        staff_rating: staffRating,
        cleanliness_rating: cleanRating,
        overall_rating: overallRating,
        comment: comment.trim() || undefined,
        would_recommend: wouldRecommend,
        survey_id: surveyId,
        survey_answers: answers.length ? answers : null,
      });
      toast.success(tm('operationSavedSuccessfully'));
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error(tm('saveError'));
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleSendWhatsApp = async () => {
    const digits = normalizePhoneDigits(phone.trim());
    if (digits.length < 10) {
      toast.error(tm('beautyWaInvalidPhone'));
      return;
    }
    const settings = await beautyService.getPortalSettings();
    const cfg = settings as unknown as ClinicMessagingPortalConfig;
    if (!cfg || (cfg.whatsapp_provider || 'NONE').toString().toUpperCase() === 'NONE') {
      toast.error(tm('beautyWaProviderNone'));
      return;
    }
    setSendingWa(true);
    try {
      const r = await sendWhatsAppText(cfg, digits, waText.trim());
      if (!r.success) throw new Error(r.error || 'WA');
      toast.success(tm('beautyWaSent'));
      const waLine = `${tm('crmPresetWhatsappSent')}${
        waText.trim() ? ` — ${waText.trim().slice(0, 200)}${waText.length > 200 ? '…' : ''}` : ''
      }`;
      await beautyService.logCrmActivity(aptId, user?.id ?? null, {
        preset: 'crmPresetWhatsappSent',
        note: waText.slice(0, 500),
        label: waLine,
      });
      if (customerId) {
        await beautyService.syncCrmActivityToLeadNotes(customerId, waLine);
        void loadLeads();
      }
      const acts = await beautyService.getCrmActivitiesForAppointment(aptId);
      setCrmActivities(acts);
      onSaved?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tm('saveError'));
    } finally {
      setSendingWa(false);
    }
  };

  if (!open || !appointment) return null;

  const footer = (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-2xl border-2 border-slate-200 px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
      >
        {tm('close')}
      </button>
    </div>
  );

  return (
    <RetailExFlatModal
      open={open}
      onClose={onClose}
      title={tm('beautyReportCrmModalTitle')}
      subtitle={String(appointment.service_name ?? '').trim() || undefined}
      headerIcon={<PhoneCall className="h-5 w-5" />}
      maxWidthClass="max-w-3xl"
      footer={footer}
      closeOnBackdrop
    >
      <Spin spinning={loading}>
        <Tabs
          activeKey={tab}
          onChange={k => setTab(k as typeof tab)}
          items={[
            {
              key: 'activity',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneCall className="h-4 w-4" />
                  {tm('beautyCrmTabActivity')}
                </span>
              ),
              children: (
                <div className="space-y-4">
                  <div>
                    <RetailExFlatFieldLabel>{tm('beautyCrmPreset')}</RetailExFlatFieldLabel>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
                      value={crmPreset}
                      onChange={e => setCrmPreset(e.target.value)}
                    >
                      {CRM_PRESET_KEYS.map(k => (
                        <option key={k} value={k}>
                          {tm(k)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/90 px-3 py-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">{tm('beautyCrmCreateAppointmentHint')}</p>
                    <Button
                      type="default"
                      className="w-full rounded-xl font-bold"
                      onClick={() => {
                        if (!appointment) return;
                        const dateYmd = beautyAppointmentDateKey(appointment);
                        const time = appointmentTimeHHmm(appointment);
                        const staffId = String(appointment.specialist_id ?? appointment.staff_id ?? '').trim() || undefined;
                        const deviceId = String(appointment.device_id ?? '').trim() || undefined;
                        const serviceId = String(appointment.service_id ?? '').trim() || undefined;
                        window.dispatchEvent(
                          new CustomEvent('beauty-open-new-appointment-wizard', {
                            detail: {
                              dateYmd: dateYmd || undefined,
                              time,
                              staffId,
                              deviceId,
                              serviceId,
                            },
                          })
                        );
                      }}
                    >
                      {tm('beautyCrmCreateAppointmentCta')}
                    </Button>
                  </div>
                  <div>
                    <RetailExFlatFieldLabel>{tm('beautyCrmNote')}</RetailExFlatFieldLabel>
                    <Input.TextArea
                      rows={3}
                      value={crmNote}
                      onChange={e => setCrmNote(e.target.value)}
                      placeholder={tm('beautyCrmNotePlaceholder')}
                      className="rounded-xl"
                    />
                  </div>
                  <Button type="primary" loading={savingActivity} onClick={() => void handleSaveActivity()} style={{ backgroundColor: accentColor, borderColor: accentColor }}>
                    {tm('beautyCrmSaveActivity')}
                  </Button>
                  <div>
                    <RetailExFlatFieldLabel>{tm('beautyCrmHistory')}</RetailExFlatFieldLabel>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm">
                      {crmActivities.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tm('noDataFound')} />
                      ) : (
                        crmActivities.map(row => {
                          const p = row.payload_json;
                          const label = typeof p.label === 'string' ? p.label : typeof p.preset === 'string' ? p.preset : '';
                          const note = typeof p.note === 'string' ? p.note : '';
                          return (
                            <div key={row.id} className="border-b border-slate-100 pb-2 last:border-0">
                              <div className="text-xs text-slate-400">{new Date(row.created_at).toLocaleString('tr-TR')}</div>
                              <div className="font-medium text-slate-800">{label}</div>
                              {note ? <div className="text-slate-600">{note}</div> : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'satisfaction',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" />
                  {tm('beautyCrmTabSatisfaction')}
                </span>
              ),
              children: (
                <div className="space-y-4">
                  {!customerId ? (
                    <Alert type="warning" showIcon message={tm('beautyCrmNeedCustomer')} />
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <RetailExFlatFieldLabel>{tm('bFeedbackService')}</RetailExFlatFieldLabel>
                      <Rate value={serviceRating} onChange={setServiceRating} />
                    </div>
                    <div>
                      <RetailExFlatFieldLabel>{tm('bFeedbackSpecialist')}</RetailExFlatFieldLabel>
                      <Rate value={staffRating} onChange={setStaffRating} />
                    </div>
                    <div>
                      <RetailExFlatFieldLabel>{tm('bFeedbackCleanliness')}</RetailExFlatFieldLabel>
                      <Rate value={cleanRating} onChange={setCleanRating} />
                    </div>
                    <div>
                      <RetailExFlatFieldLabel>{tm('bFeedbackGeneral')}</RetailExFlatFieldLabel>
                      <Rate value={overallRating} onChange={setOverallRating} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Radio checked={wouldRecommend} onChange={() => setWouldRecommend(true)}>
                      {tm('bFeedbackWouldRecommendYes')}
                    </Radio>
                    <Radio checked={!wouldRecommend} onChange={() => setWouldRecommend(false)}>
                      {tm('bFeedbackWouldRecommendNo')}
                    </Radio>
                  </div>
                  <div>
                    <RetailExFlatFieldLabel>{tm('description')}</RetailExFlatFieldLabel>
                    <Input.TextArea rows={2} value={comment} onChange={e => setComment(e.target.value)} className="rounded-xl" />
                  </div>
                  {questions.length > 0 ? (
                    <div className="space-y-3 rounded-xl border border-slate-100 p-3">
                      <div className="text-xs font-bold uppercase text-slate-500">{tm('bSatisfactionSurveysTitle')}</div>
                      {questions.map(q => {
                        const qt = String(q.question_type || 'rating');
                        const a = answerMap.get(q.id);
                        const label = questionLabel(q, lang);
                        if (qt === 'text') {
                          return (
                            <div key={q.id}>
                              <RetailExFlatFieldLabel>{label}</RetailExFlatFieldLabel>
                              <Input.TextArea
                                rows={2}
                                value={a?.text ?? ''}
                                onChange={e => setAnswerFor(q.id, { text: e.target.value, label_snapshot: label })}
                                className="rounded-xl"
                              />
                            </div>
                          );
                        }
                        if (qt === 'yes_no') {
                          return (
                            <div key={q.id} className="flex flex-wrap items-center gap-3">
                              <span className="min-w-[120px] text-sm font-medium text-slate-700">{label}</span>
                              <Radio.Group
                                value={a?.yes_no !== false}
                                onChange={e => setAnswerFor(q.id, { yes_no: e.target.value === true, label_snapshot: label })}
                              >
                                <Radio value>{tm('bSurveyYes')}</Radio>
                                <Radio value={false}>{tm('bSurveyNo')}</Radio>
                              </Radio.Group>
                            </div>
                          );
                        }
                        const maxStars = Math.min(10, Math.max(3, Number(q.scale_max) || 5));
                        return (
                          <div key={q.id}>
                            <RetailExFlatFieldLabel>{label}</RetailExFlatFieldLabel>
                            <Rate
                              count={maxStars}
                              value={a?.rating ?? maxStars}
                              onChange={v => setAnswerFor(q.id, { rating: v, label_snapshot: label })}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{tm('bSurveyEmpty')}</p>
                  )}
                  <Button
                    type="primary"
                    loading={savingFeedback}
                    disabled={!customerId}
                    onClick={() => void handleSaveFeedback()}
                    style={{ backgroundColor: accentColor, borderColor: accentColor }}
                  >
                    {tm('beautyCrmSaveFeedback')}
                  </Button>
                </div>
              ),
            },
            {
              key: 'whatsapp',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" />
                  {tm('beautyCrmTabWhatsapp')}
                </span>
              ),
              children: (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <RetailExFlatFieldLabel>{tm('bPhone')}</RetailExFlatFieldLabel>
                      <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xx..." className="rounded-xl" />
                    </div>
                    <div>
                      <RetailExFlatFieldLabel>{tm('beautyWaMessageLang')}</RetailExFlatFieldLabel>
                      <Select<SatisfactionLangCode>
                        className="w-full"
                        value={waLang}
                        onChange={v => setWaLang(v)}
                        options={[
                          { value: 'tr', label: 'TR' },
                          { value: 'en', label: 'EN' },
                          { value: 'ar', label: 'AR' },
                          { value: 'ku', label: 'KU' },
                        ]}
                        {...antSelectInFlatModal}
                      />
                    </div>
                  </div>
                  <div>
                    <RetailExFlatFieldLabel>{tm('beautyWaTemplate')}</RetailExFlatFieldLabel>
                    <Select<WaPresetId>
                      className="w-full"
                      value={waPreset}
                      onChange={v => setWaPreset(v)}
                      options={(
                        [
                          ['thank_you', 'beautyWaPresetThankYou'],
                          ['survey_invite', 'beautyWaPresetSurvey'],
                          ['followup', 'beautyWaPresetFollowup'],
                          ['reminder_next', 'beautyWaPresetReminder'],
                        ] as const
                      ).map(([id, lab]) => ({ value: id, label: tm(lab) }))}
                      {...antSelectInFlatModal}
                    />
                  </div>
                  <div>
                    <RetailExFlatFieldLabel>{tm('beautyWaMessageBody')}</RetailExFlatFieldLabel>
                    <Input.TextArea rows={5} value={waText} onChange={e => setWaText(e.target.value)} className="rounded-xl" />
                  </div>
                  <p className="text-xs text-slate-500">{tm('beautyWaPortalHint')}</p>
                  <Button type="primary" loading={sendingWa} onClick={() => void handleSendWhatsApp()} style={{ backgroundColor: accentColor, borderColor: accentColor }}>
                    {tm('beautyWaSend')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Spin>
    </RetailExFlatModal>
  );
}
