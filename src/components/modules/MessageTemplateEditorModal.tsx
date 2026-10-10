/**
 * Mesaj Şablonu Düzenleme Modalı — `PercentBodyModal` portalı ile.
 *
 * - 4 dil tab'ı (tr / en / ar / ku) → her dil için başlık + içerik textarea.
 * - Şablon seçici (modal üstünde) — listeden seç / "Yeni şablon".
 * - "Kaydet" (güncelle/oluştur) + "Sil" (Popconfirm) + "İptal".
 * - AR / KU tab'larında textarea `dir="rtl"`.
 * - "Serbest metin" alanı DB'yi etkilemez — sadece modal düzenler.
 * - Sistem şablonları (migration 207 seed) silinemez.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Form, Popconfirm, Tabs, Tooltip } from 'antd';
import {
  FileText,
  Plus,
  Save,
  Trash2,
  X,
  ChevronDown,
  Pencil,
  Lock,
  CornerDownLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import {
  createMessageTemplate as svcCreate,
  updateMessageTemplate as svcUpdate,
  deleteMessageTemplate as svcDelete,
  isSystemTemplate as isSystem,
  hasTemplateBodyInLang as hasInLang,
  resolveTemplateTranslations as resolveTranslations,
  type MessageTemplateRow,
} from '../../services/messaging/messageTemplateService';
import type { WhatsAppMessageLang } from '../../services/messaging/whatsappMessageLang';

interface MessageTemplateEditorModalProps {
  open: boolean;
  templates: MessageTemplateRow[];
  /** Aktif dil — tab default ve rozet gösterimi için */
  messageLang: WhatsAppMessageLang;
  /** Kaydet/sil/oluştur sonrası liste güncellemesi için */
  onChanged?: () => void | Promise<void>;
  /**
   * Aktif dildeki body_text_<lang> içeriğini çağırıcının "Serbest metin"
   * alanına **eklemek** (append) istediğinde çağrılır. Mevcut içerik
   * korunur; callback tetiklendiğinde boş textarea için önce newline
   * eklenmez, dolu textarea için `\n\n` ayraç olarak kullanılır.
   */
  onAppendToMessage?: (body: string, lang: WhatsAppMessageLang) => void;
  onClose: () => void;
}

const LANG_KEYS: WhatsAppMessageLang[] = ['tr', 'en', 'ar', 'ku'];
const LANG_LABEL: Record<WhatsAppMessageLang, string> = {
  tr: 'Türkçe',
  en: 'English',
  ar: 'العربية',
  ku: 'Kurdî',
};
const RTL_LANGS: ReadonlySet<WhatsAppMessageLang> = new Set(['ar', 'ku']);
const LANG_BADGE: Record<WhatsAppMessageLang, { dot: string; ring: string }> = {
  tr: { dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  en: { dot: 'bg-blue-500', ring: 'ring-blue-200' },
  ar: { dot: 'bg-amber-500', ring: 'ring-amber-200' },
  ku: { dot: 'bg-purple-500', ring: 'ring-purple-200' },
};

type FieldValues = {
  name: string;
  category: string;
  headline_tr: string;
  headline_en: string;
  headline_ar: string;
  headline_ku: string;
  body_tr: string;
  body_en: string;
  body_ar: string;
  body_ku: string;
};

const EMPTY_FORM: FieldValues = {
  name: '',
  category: 'general',
  headline_tr: '',
  headline_en: '',
  headline_ar: '',
  headline_ku: '',
  body_tr: '',
  body_en: '',
  body_ar: '',
  body_ku: '',
};

export function MessageTemplateEditorModal({
  open,
  templates,
  messageLang,
  onChanged,
  onAppendToMessage,
  onClose,
}: MessageTemplateEditorModalProps) {
  const { tm } = useLanguage();
  const [form] = Form.useForm<FieldValues>();
  const [selectedId, setSelectedId] = useState<string>('');
  const [tab, setTab] = useState<WhatsAppMessageLang>(messageLang);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Aktif form şablonunu seçili ID'den çözümler. */
  const selectedTpl = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  /** Sistem şablonu mu? */
  const isProtected = useMemo(() => isSystem(selectedTpl), [selectedTpl]);

  /** 4 dildeki doluluk rozeti için. */
  const filledLangCount = useMemo(() => {
    if (!selectedTpl) return 0;
    return LANG_KEYS.filter((l) => hasInLang(selectedTpl, l)).length;
  }, [selectedTpl]);

  /** Seçim değişince form alanlarını doldur. */
  useEffect(() => {
    if (!selectedTpl) return;
    const trn = resolveTranslations(selectedTpl);
    form.setFieldsValue({
      name: selectedTpl.name,
      category: selectedTpl.category || 'general',
      headline_tr: selectedTpl.headline_tr ?? '',
      headline_en: selectedTpl.headline_en ?? '',
      headline_ar: selectedTpl.headline_ar ?? '',
      headline_ku: selectedTpl.headline_ku ?? '',
      body_tr: trn.tr,
      body_en: trn.en,
      body_ar: trn.ar,
      body_ku: trn.ku,
    });
  }, [selectedTpl, form]);

  /** Modal açık değilse state'i sıfırla. */
  useEffect(() => {
    if (!open) {
      setSelectedId('');
      setTab(messageLang);
      setSaving(false);
      setDeleting(false);
      form.resetFields();
    } else {
      setTab(messageLang);
      form.resetFields();
    }
  }, [open, messageLang, form]);

  const handleNew = useCallback(() => {
    setSelectedId('');
    form.setFieldsValue(EMPTY_FORM);
  }, [form]);

  const handlePick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setPickerOpen(false);
    },
    [],
  );

  const buildPatchFromForm = (values: FieldValues) => {
    const patch: {
      name: string;
      category: string;
      headline_tr: string | null;
      headline_en: string | null;
      headline_ar: string | null;
      headline_ku: string | null;
      body_text_tr: string | null;
      body_text_en: string | null;
      body_text_ar: string | null;
      body_text_ku: string | null;
    } = {
      name: values.name.trim(),
      category: values.category || 'general',
      headline_tr: values.headline_tr?.trim() || null,
      headline_en: values.headline_en?.trim() || null,
      headline_ar: values.headline_ar?.trim() || null,
      headline_ku: values.headline_ku?.trim() || null,
      body_text_tr: values.body_tr?.trim() || null,
      body_text_en: values.body_en?.trim() || null,
      body_text_ar: values.body_ar?.trim() || null,
      body_text_ku: values.body_ku?.trim() || null,
    };
    return patch;
  };

  const handleSave = useCallback(async () => {
    try {
      const values = (await form.validateFields()) as FieldValues;
      if (!values.name.trim()) {
        toast.error('Şablon adı zorunlu.');
        return;
      }
      const noneFilled = LANG_KEYS.every((l) => !values[`body_${l}`]?.trim());
      if (noneFilled) {
        toast.error('En az bir dil için içerik girilmelidir.');
        return;
      }
      setSaving(true);
      const patch = buildPatchFromForm(values);
      if (selectedId) {
        await svcUpdate(selectedId, {
          name: patch.name,
          category: patch.category,
          headline_tr: patch.headline_tr,
          headline_en: patch.headline_en,
          headline_ar: patch.headline_ar,
          headline_ku: patch.headline_ku,
          body_text_tr: patch.body_text_tr,
          body_text_en: patch.body_text_en,
          body_text_ar: patch.body_text_ar,
          body_text_ku: patch.body_text_ku,
        });
        toast.success(tm('msgTplEditorSaveSuccess'));
      } else {
        const res = await svcCreate({
          name: patch.name,
          category: patch.category,
          headline_tr: patch.headline_tr,
          headline_en: patch.headline_en,
          headline_ar: patch.headline_ar,
          headline_ku: patch.headline_ku,
          body_text_tr: patch.body_text_tr,
          body_text_en: patch.body_text_en,
          body_text_ar: patch.body_text_ar,
          body_text_ku: patch.body_text_ku,
          is_active: true,
        });
        setSelectedId(res.id);
        toast.success(tm('msgTplEditorCreateSuccess'));
      }
      if (onChanged) await onChanged();
    } catch (e: unknown) {
      const err = e as { errorFields?: unknown; message?: string };
      if (!err?.errorFields) {
        toast.error(err?.message || String(e));
      }
    } finally {
      setSaving(false);
    }
  }, [form, selectedId, onChanged, tm]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    if (isProtected) {
      toast.warning(tm('msgTplEditorSeedProtected'));
      return;
    }
    setDeleting(true);
    try {
      await svcDelete(selectedId);
      setSelectedId('');
      form.resetFields();
      toast.success(tm('msgTplEditorDeleteSuccess'));
      if (onChanged) await onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || String(e));
    } finally {
      setDeleting(false);
    }
  }, [selectedId, isProtected, form, onChanged, tm]);

  /** Şablon seçici başlığında gösterilecek metin. */
  const pickerLabel = useMemo(() => {
    if (!selectedTpl) return tm('msgTplEditorNoTemplateSelected');
    return selectedTpl.name;
  }, [selectedTpl, tm]);

  if (!open) return null;

  const bodyTextByLang = (lang: WhatsAppMessageLang): string =>
    (form.getFieldValue(`body_${lang}`) ?? '') as string;

  /** "Mesaja ekle" — aktif dilin body_text_<lang> içeriğini parent'a iletir. */
  const handleAppendToMessage = useCallback(
    (lang: WhatsAppMessageLang) => {
      if (!onAppendToMessage) return;
      const body = (form.getFieldValue(`body_${lang}`) ?? '') as string;
      if (!body.trim()) {
        toast.warning(tm('msgTplEditorAppendHint'));
        return;
      }
      onAppendToMessage(body, lang);
      toast.success(tm('msgTplEditorAppended'));
    },
    [form, onAppendToMessage, tm],
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('msgTplEditorTitle')}>
      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-8 py-5 text-white shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 shrink-0" />
            <h2 className="text-lg font-bold tracking-tight truncate">
              {tm('msgTplEditorTitle')}
            </h2>
          </div>
          <p className="text-sm text-blue-50/90 mt-1">{tm('msgTplEditorSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="rounded-lg p-1.5 hover:bg-white/20 transition shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* PICKER BAR */}
      <div className="px-6 sm:px-8 py-3 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 flex flex-wrap items-center gap-3 shrink-0">
        {/* Şablon seçici */}
        <div className="relative flex-1 min-w-[16rem]">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {tm('msgTplEditorPickerLabel')}
          </label>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 rounded-2xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-gray-700"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <span className="truncate flex items-center gap-2">
              {selectedTpl && isProtected ? (
                <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              ) : null}
              {pickerLabel}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>
          {pickerOpen ? (
            <ul
              role="listbox"
              className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:bg-gray-800 dark:border-gray-700"
            >
              <li>
                <button
                  type="button"
                  onClick={() => handlePick('')}
                  className="w-full text-left px-4 py-2 text-sm text-slate-500 italic hover:bg-slate-100 dark:hover:bg-gray-700"
                >
                  {tm('msgTplEditorNoTemplateSelected')}
                </button>
              </li>
              {templates.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-400">
                  Şablon bulunamadı.
                </li>
              ) : (
                templates.map((t) => {
                  const tplTrn = resolveTranslations(t);
                  const badges = LANG_KEYS.filter(
                    (l) => (tplTrn[l] ?? '').trim(),
                  )
                    .map((l) => l.toUpperCase())
                    .join('·');
                  const protected_ = isSystem(t);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => handlePick(t.id)}
                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-gray-700 ${
                          selectedId === t.id
                            ? 'bg-blue-50 dark:bg-blue-900/30 font-semibold text-blue-700 dark:text-blue-200'
                            : 'text-slate-700 dark:text-gray-200'
                        }`}
                      >
                        {protected_ ? (
                          <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{t.name}</span>
                        {badges ? (
                          <span className="ml-auto text-[10px] font-bold text-slate-500 shrink-0">
                            [{badges}]
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>

        {/* Yeni şablon */}
        <div className="flex flex-col items-stretch sm:items-end justify-end">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 invisible">
            _
          </label>
          <button
            type="button"
            onClick={handleNew}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 dark:border-gray-600 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
            {tm('msgTplEditorNewButton')}
          </button>
        </div>
      </div>

      {/* SCROLL BODY */}
      <PercentBodyModalScrollBody className="px-6 sm:px-8 py-5 bg-white dark:bg-gray-800">
        {/* Şablon adı + kategori */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <Form.Item
            label={
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {tm('msgTplEditorNameLabel')}
              </span>
            }
            name="name"
            className="sm:col-span-2"
            rules={[{ required: true, message: 'Şablon adı zorunlu' }]}
            required={false}
          >
            <input
              type="text"
              placeholder={tm('msgTplEditorNamePlaceholder')}
              className="w-full rounded-2xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-800 dark:text-gray-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none"
            />
          </Form.Item>
          <Form.Item
            label={
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Kategori
              </span>
            }
            name="category"
            required={false}
          >
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-800 dark:text-gray-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none"
            />
          </Form.Item>
        </div>

        {/* Dil rozetleri */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {LANG_KEYS.map((l) => {
            const has = !!bodyTextByLang(l).trim();
            const badge = LANG_BADGE[l];
            return (
              <Tooltip
                key={l}
                title={
                  has
                    ? `${LANG_LABEL[l]} — dolu`
                    : `${LANG_LABEL[l]} — boş`
                }
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${badge.ring} bg-white dark:bg-gray-700 dark:ring-gray-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    has ? 'text-slate-700 dark:text-gray-100' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      has ? badge.dot : 'bg-slate-300 dark:bg-gray-500'
                    }`}
                  />
                  {l}
                </span>
              </Tooltip>
            );
          })}
          <span
            className={`ml-auto text-[11px] font-bold ${
              selectedId
                ? filledLangCount === 4
                  ? 'text-emerald-600'
                  : 'text-slate-500'
                : 'text-slate-400'
            }`}
          >
            {filledLangCount === 4
              ? tm('msgTplEditorLangBadgeAll')
              : selectedId
                ? tm('msgTplEditorLangBadgePartial').replace(
                    '{filled}',
                    String(filledLangCount),
                  )
                : tm('msgTplEditorLangBadgePartial').replace('{filled}', '0')}
          </span>
        </div>

        {/* Sekmeler */}
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as WhatsAppMessageLang)}
          items={LANG_KEYS.map((l) => ({
            key: l,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${LANG_BADGE[l].dot}`}
                />
                {LANG_LABEL[l]}
              </span>
            ),
            children: (
              <LangFields
                lang={l}
                form={form}
                canAppendToMessage={!!onAppendToMessage}
                onAppendToMessage={() => handleAppendToMessage(l)}
              />
            ),
          }))}
        />
      </PercentBodyModalScrollBody>

      {/* FOOTER */}
      <div className="px-6 sm:px-8 py-4 border-t border-slate-200 dark:border-gray-700 bg-slate-50/70 dark:bg-gray-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
          {selectedId && isProtected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2.5 py-1 font-bold uppercase tracking-wider">
              <Lock className="h-3 w-3" />
              Sistem
            </span>
          ) : null}
          {selectedId && !isProtected ? (
            <span className="text-[11px] text-slate-500">
              Sistem şablonu değil — düzenlenebilir/silinebilir.
            </span>
          ) : null}
          {!selectedId ? (
            <span className="text-[11px] text-slate-500 italic">Yeni şablon oluşturulacak.</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border-2 border-slate-200 dark:border-gray-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 active:scale-[0.98]"
          >
            İptal
          </button>
          {selectedId && !isProtected ? (
            <Popconfirm
              title={tm('msgTplEditorDeleteConfirm')}
              okText="Sil"
              cancelText="Vazgeç"
              okButtonProps={{ danger: true, loading: deleting }}
              onConfirm={() => void handleDelete()}
            >
              <button
                type="button"
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[0.98] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </button>
            </Popconfirm>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white px-5 py-2.5 text-sm font-bold uppercase tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {selectedId ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </div>
    </PercentBodyModal>
  );
}

/** Tek bir dil için başlık + içerik alanları. */
function LangFields({
  lang,
  form,
  canAppendToMessage,
  onAppendToMessage,
}: {
  lang: WhatsAppMessageLang;
  form: ReturnType<typeof Form.useForm<FieldValues>>[0];
  /** "Mesaja ekle" butonu gösterilsin mi (parent callback verdi mi) */
  canAppendToMessage: boolean;
  /** Aktif dilin body_text_<lang> içeriğini parent'a append olarak gönderir */
  onAppendToMessage: () => void;
}) {
  const { tm } = useLanguage();
  const isRtl = RTL_LANGS.has(lang);
  // Boş içerikte butonu kilitle (canlı form değeri)
  const currentBody = (Form.useWatch(`body_${lang}`, form) ?? '') as string;
  const isEmpty = !currentBody.trim();
  return (
    <div className="grid grid-cols-1 gap-3 py-2" dir={isRtl ? 'rtl' : 'ltr'}>
      <Form.Item
        label={
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {tm('msgTplEditorHeadlineLabel')}
          </span>
        }
        name={`headline_${lang}`}
        required={false}
      >
        <input
          type="text"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full rounded-2xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-800 dark:text-gray-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none"
        />
      </Form.Item>
      <Form.Item
        label={
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {tm('msgTplEditorBodyLabel')}
          </span>
        }
        name={`body_${lang}`}
        required={false}
      >
        <textarea
          dir={isRtl ? 'rtl' : 'ltr'}
          rows={6}
          placeholder={tm('msgTplEditorEmptyLang')}
          className="w-full rounded-2xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-slate-800 dark:text-gray-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none resize-y min-h-[8rem]"
        />
      </Form.Item>
      {canAppendToMessage ? (
        <div
          className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}
        >
          <Tooltip title={tm('msgTplEditorAppendHint')}>
            <button
              type="button"
              onClick={onAppendToMessage}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50/60"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              {tm('msgTplEditorAppendToMessage')}
            </button>
          </Tooltip>
          <span
            className={`text-[11px] text-slate-400 ${isRtl ? 'text-right' : ''}`}
          >
            {tm('msgTplEditorAppendHint')}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Re-exportlar — bileşen tüketicilerinin (örn. MesajBildirimModule) tek import
 * yolundan erişebilmesi için. Sistem şablonu kontrolü / silme koruması için
 * `SYSTEM_TEMPLATE_IDS` ve `isSystemTemplate` burada dışa açıktır.
 */
export { SYSTEM_TEMPLATE_IDS, isSystemTemplate };
export type { MessageTemplateRow, WhatsAppMessageLang };
