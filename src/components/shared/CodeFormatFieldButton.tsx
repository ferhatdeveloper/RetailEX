import { useEffect, useMemo, useState } from 'react';
import { Hash, Save, Sparkles, X } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from './PercentBodyModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import {
  buildInvoiceCodePattern,
  isInvoiceCodePatternDefined,
  previewInvoiceCode,
  type InvoiceCodeFormatsSettings,
} from '../../utils/invoiceCodeFormat';
import {
  allocateNextEntityCode,
  generateDefaultInvoiceCode,
  generateDefaultProductCode,
  getEntityCodeFormats,
  saveEntityCodeFormats,
  type CodeFormatEntity,
} from '../../services/entityCodeFormatService';
import { serviceAPI } from '../../services/serviceAPI';

type CodeFormatFieldButtonProps = {
  entity: CodeFormatEntity;
  typeCode?: number | string | null;
  onApply: (code: string) => void;
  disabled?: boolean;
  className?: string;
};

function titleKey(entity: CodeFormatEntity): string {
  if (entity === 'invoice') return 'invoiceCodeFormatSettings';
  if (entity === 'product') return 'productCodeFormatSettings';
  return 'serviceCodeFormatSettings';
}

function emptyHintKey(entity: CodeFormatEntity): string {
  if (entity === 'invoice') return 'invoiceCodeFormatEmptyUsesDefault';
  if (entity === 'product') return 'productCodeFormatEmptyUsesDefault';
  return 'serviceCodeFormatEmptyUsesDefault';
}

async function fallbackCode(entity: CodeFormatEntity): Promise<string> {
  if (entity === 'service') {
    try {
      return (await serviceAPI.getNextCode()) || '000001';
    } catch {
      return '000001';
    }
  }
  if (entity === 'product') return generateDefaultProductCode();
  return generateDefaultInvoiceCode();
}

export function CodeFormatFieldButton({
  entity,
  typeCode,
  onApply,
  disabled,
  className = '',
}: CodeFormatFieldButtonProps) {
  const { tm } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<InvoiceCodeFormatsSettings>({});
  const [prefix, setPrefix] = useState('');
  const [includeYear, setIncludeYear] = useState(true);
  const [seqDigits, setSeqDigits] = useState(6);
  const [pattern, setPattern] = useState('');

  const typeKey = String(typeCode ?? '').trim();

  const applyPatternToFields = (raw: string) => {
    setPattern(raw);
    const trimmed = raw.trim();
    const m = trimmed.match(/^([^{}-]+)?-?(\{YYYY\})?-?\{SEQ:(\d+)\}$/i);
    if (m) {
      setPrefix(m[1] || '');
      setIncludeYear(Boolean(m[2]));
      setSeqDigits(Math.min(12, Math.max(1, parseInt(m[3], 10) || 6)));
      return;
    }
    if (!trimmed) {
      setPrefix('');
      setIncludeYear(true);
      setSeqDigits(6);
    }
  };

  const patternForSlot = (data: InvoiceCodeFormatsSettings) => {
    if (entity === 'invoice' && typeKey) {
      const typed = String(data.byType?.[typeKey]?.pattern || '').trim();
      if (typed) return typed;
    }
    return String(data.default?.pattern || '');
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await getEntityCodeFormats(entity);
        if (cancelled) return;
        setSettings(data);
        applyPatternToFields(patternForSlot(data));
      } catch {
        if (!cancelled) toast.error(tm('invoiceCodeFormatLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, entity, typeKey, tm]);

  const syncPatternFromFields = (nextPrefix: string, nextYear: boolean, nextDigits: number) => {
    const built =
      nextPrefix.trim() || nextYear
        ? buildInvoiceCodePattern({
            prefix: nextPrefix,
            includeYear: nextYear,
            seqDigits: nextDigits,
          })
        : '';
    setPattern(built);
  };

  const preview = useMemo(() => {
    if (!isInvoiceCodePatternDefined(pattern)) return tm(emptyHintKey(entity));
    return previewInvoiceCode(pattern.trim(), 1n);
  }, [pattern, entity, tm]);

  const persistSettings = async (): Promise<InvoiceCodeFormatsSettings> => {
    const next: InvoiceCodeFormatsSettings = {
      default: { pattern: String(settings.default?.pattern || '').trim() },
      byType: { ...(settings.byType || {}) },
    };
    const trimmed = pattern.trim();
    if (entity === 'invoice' && typeKey) {
      if (trimmed) next.byType![typeKey] = { pattern: trimmed };
      else delete next.byType![typeKey];
    } else {
      next.default = { pattern: trimmed };
    }
    await saveEntityCodeFormats(entity, next);
    setSettings(next);
    return next;
  };

  const handleSaveOnly = async () => {
    setSaving(true);
    try {
      await persistSettings();
      toast.success(tm('codeFormatSaved'));
    } catch {
      toast.error(tm('invoiceCodeFormatSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateApply = async () => {
    setSaving(true);
    try {
      await persistSettings();
      let code = await allocateNextEntityCode(entity, typeCode || undefined);
      if (!code) code = await fallbackCode(entity);
      onApply(code);
      toast.success(tm('codeFormatApplied'));
      setOpen(false);
    } catch {
      toast.error(tm('codeFormatGenerateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const examplePrefix = entity === 'invoice' ? 'FTR' : entity === 'product' ? 'URN' : 'HIZ';

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={tm('codeFormatButtonTitle')}
        aria-label={tm('codeFormatButtonTitle')}
        className={`shrink-0 p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded disabled:opacity-40 ${className}`}
      >
        <Hash className="w-3.5 h-3.5" />
      </button>
      {open && (
        <PercentBodyModal
          onClose={() => setOpen(false)}
          size="compact"
          ariaLabel={tm(titleKey(entity))}
        >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-white shrink-0 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">{tm(titleKey(entity))}</h2>
              <p className="text-[11px] text-blue-100 mt-1">{tm('codeFormatBuilderHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-white/15"
              aria-label={tm('cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-5 space-y-3">
            {loading ? (
              <div className="text-sm text-slate-500">{tm('loading')}</div>
            ) : (
              <>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    {tm('invoiceCodeFormatPrefix')}
                  </label>
                  <input
                    type="text"
                    value={prefix}
                    maxLength={20}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPrefix(v);
                      syncPatternFromFields(v, includeYear, seqDigits);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={examplePrefix}
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeYear}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setIncludeYear(v);
                      syncPatternFromFields(prefix, v, seqDigits);
                    }}
                  />
                  {tm('invoiceCodeFormatIncludeYear')}
                </label>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    {tm('invoiceCodeFormatSeqDigits')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={seqDigits}
                    onChange={(e) => {
                      const v = Math.min(12, Math.max(1, Number(e.target.value) || 6));
                      setSeqDigits(v);
                      syncPatternFromFields(prefix, includeYear, v);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    {tm('invoiceCodeFormatPattern')}
                  </label>
                  <input
                    type="text"
                    value={pattern}
                    onChange={(e) => applyPatternToFields(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={`${examplePrefix}-{YYYY}-{SEQ:6}`}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">{tm('invoiceCodeFormatPatternHint')}</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                    {tm('preview')}
                  </div>
                  <div className="font-mono text-sm text-blue-900 break-all">{preview}</div>
                </div>
              </>
            )}
          </PercentBodyModalScrollBody>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 min-w-[5rem] py-2.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-xs tracking-wider hover:bg-slate-100"
            >
              {tm('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveOnly()}
              disabled={saving || loading}
              className="flex-1 min-w-[5rem] py-2.5 rounded-2xl border-2 border-blue-200 text-blue-700 font-bold uppercase text-xs tracking-wider hover:bg-blue-50 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? tm('saving') : tm('save')}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateApply()}
              disabled={saving || loading}
              className="flex-[1.2] min-w-[7rem] py-2.5 rounded-2xl bg-blue-600 text-white font-bold uppercase text-xs tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {tm('codeFormatGenerateApply')}
            </button>
          </div>
        </PercentBodyModal>
      )}
    </>
  );
}
