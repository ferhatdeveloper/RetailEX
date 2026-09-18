import { useEffect, useMemo, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  getInvoiceCodeFormats,
  saveInvoiceCodeFormats,
} from '../../services/invoiceCodeFormatService';
import {
  buildInvoiceCodePattern,
  isInvoiceCodePatternDefined,
  previewInvoiceCode,
  type InvoiceCodeFormatsSettings,
} from '../../utils/invoiceCodeFormat';

const TYPE_OPTIONS: { code: string; labelKey: string }[] = [
  { code: '', labelKey: 'invoiceCodeFormatAllTypes' },
  { code: '7', labelKey: 'retailSale' },
  { code: '8', labelKey: 'wholesale' },
  { code: '3', labelKey: 'salesReturn' },
  { code: '1', labelKey: 'purchaseInvoices' },
  { code: '26', labelKey: 'invoiceTypeCountSurplus' },
  { code: '6', labelKey: 'purchaseReturn' },
  { code: '9', labelKey: 'serviceGiven' },
  { code: '4', labelKey: 'serviceReceived' },
  { code: '10', labelKey: 'salesWaybill' },
  { code: '11', labelKey: 'purchaseWaybill' },
  { code: '12', labelKey: 'warehouseTransferWaybill' },
  { code: '13', labelKey: 'wastageWaybill' },
  { code: '20', labelKey: 'salesOrder' },
  { code: '21', labelKey: 'purchaseOrder' },
  { code: '30', labelKey: 'salesQuote' },
  { code: '31', labelKey: 'purchaseQuote' },
];

function patternForSlot(settings: InvoiceCodeFormatsSettings, typeCode: string): string {
  if (!typeCode) return String(settings.default?.pattern || '');
  return String(settings.byType?.[typeCode]?.pattern || '');
}

export function InvoiceCodeFormatSettings() {
  const { tm } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState<InvoiceCodeFormatsSettings>({});
  const [typeCode, setTypeCode] = useState('');
  const [prefix, setPrefix] = useState('');
  const [includeYear, setIncludeYear] = useState(true);
  const [seqDigits, setSeqDigits] = useState(6);
  const [pattern, setPattern] = useState('');

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getInvoiceCodeFormats();
        if (cancelled) return;
        setSettings(data);
        applyPatternToFields(patternForSlot(data, ''));
      } catch {
        if (!cancelled) setToast(tm('invoiceCodeFormatLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tm]);

  const onTypeChange = (next: string) => {
    setTypeCode(next);
    applyPatternToFields(patternForSlot(settings, next));
  };

  const syncPatternFromFields = (nextPrefix: string, nextYear: boolean, nextDigits: number) => {
    const built = nextPrefix.trim() || nextYear
      ? buildInvoiceCodePattern({
          prefix: nextPrefix,
          includeYear: nextYear,
          seqDigits: nextDigits,
        })
      : '';
    setPattern(built);
  };

  const effectivePattern = isInvoiceCodePatternDefined(pattern)
    ? pattern.trim()
    : typeCode
      ? String(settings.default?.pattern || '').trim()
      : '';

  const preview = useMemo(() => {
    if (!isInvoiceCodePatternDefined(effectivePattern)) return tm('invoiceCodeFormatDefaultStamp');
    return previewInvoiceCode(effectivePattern, 1n);
  }, [effectivePattern, tm]);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const next: InvoiceCodeFormatsSettings = {
        default: { pattern: String(settings.default?.pattern || '').trim() },
        byType: { ...(settings.byType || {}) },
      };
      const trimmed = pattern.trim();
      if (!typeCode) {
        next.default = { pattern: trimmed };
      } else if (trimmed) {
        next.byType![typeCode] = { pattern: trimmed };
      } else {
        delete next.byType![typeCode];
      }
      await saveInvoiceCodeFormats(next);
      setSettings(next);
      setToast(tm('invoiceCodeFormatSaved'));
    } catch {
      setToast(tm('invoiceCodeFormatSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
        <div className="text-gray-500 text-sm">{tm('loading')}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        {tm('invoiceCodeFormatSettings')}
      </h3>
      <p className="text-gray-600 mb-4 text-sm">{tm('invoiceCodeFormatSettingsDesc')}</p>

      {toast && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            toast === tm('invoiceCodeFormatSaveFailed') || toast === tm('invoiceCodeFormatLoadFailed')
              ? 'bg-red-50 text-red-800'
              : 'bg-green-50 text-green-800'
          }`}
        >
          {toast}
        </div>
      )}

      <div className="space-y-4 max-w-3xl">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('invoiceCodeFormatType')}</label>
          <select
            value={typeCode}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg bg-white"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.code || 'all'} value={opt.code}>
                {tm(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tm('invoiceCodeFormatPrefix')}</label>
            <input
              type="text"
              value={prefix}
              maxLength={20}
              onChange={(e) => {
                const v = e.target.value;
                setPrefix(v);
                syncPatternFromFields(v, includeYear, seqDigits);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="FTR"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
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
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tm('invoiceCodeFormatSeqDigits')}</label>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tm('invoiceCodeFormatPattern')}</label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => applyPatternToFields(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            placeholder="FTR-{YYYY}-{SEQ:6}"
          />
          <p className="text-xs text-gray-500 mt-1">{tm('invoiceCodeFormatPatternHint')}</p>
          <button
            type="button"
            onClick={() => applyPatternToFields(buildInvoiceCodePattern({ prefix: 'FTR', includeYear: true, seqDigits: 6 }))}
            className="mt-2 text-xs text-blue-700 hover:underline"
          >
            {tm('invoiceCodeFormatExample')}
          </button>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">{tm('preview')}</div>
          <div className="font-mono text-sm text-blue-900">{preview}</div>
          {!isInvoiceCodePatternDefined(pattern) && (
            <p className="text-xs text-gray-600 mt-1">{tm('invoiceCodeFormatEmptyUsesDefault')}</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? tm('saving') : tm('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
